import os
from flask import Flask, jsonify, request, Blueprint
from flask_cors import CORS
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
import akshare as ak

# 加载环境变量
load_dotenv()

# 数据库配置
MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017/option_data')
DATABASE_NAME = os.getenv('DATABASE_NAME', 'option_trading')

# 初始化MongoDB数据库连接
try:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    # 尝试连接数据库以验证连接
    client.admin.command('ping')
    db = client[DATABASE_NAME]
    print("✅ MongoDB数据库连接成功")
except (ConnectionFailure, ServerSelectionTimeoutError) as e:
    print(f"❌ MongoDB数据库连接失败: {e}")
    db = None
except Exception as e:
    print(f"❌ MongoDB数据库连接发生未知错误: {e}")
    db = None

# 导入统一响应工具
from utils.response import flask_success_response, flask_error_response
from routes.inquiry import inquiry_bp

app = Flask(__name__)

# 环境配置
PORT = int(os.getenv('FLASK_PORT', 5000))
NODE_ENV = os.getenv('NODE_ENV', 'development')
ALLOWED_ORIGINS = os.getenv('ALLOWED_ORIGINS', 'http://localhost,http://127.0.0.1').split(',')

# 统一CORS配置
CORS(app, 
     resources={r"/api/*": {
         "origins": ALLOWED_ORIGINS,
         "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
         "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"],
         "supports_credentials": True,
         "max_age": 86400
     }})

# ==================== API版本1 ====================
api_v1 = Blueprint('api_v1', __name__, url_prefix='/api/v1')

@api_v1.route('/health', methods=['GET'])
def health_check_v1():
    """健康检查 - V1"""
    return flask_success_response(
        data={
            "status": "healthy",
            "version": "v1",
            "service": "期权数据服务",
            "environment": NODE_ENV
        },
        message="Flask API v1 运行正常"
    )

@api_v1.route('/stock/info', methods=['GET'])
def get_stock_info():
    """获取股票基本信息"""
    try:
        code = request.args.get('code')
        if not code:
            return flask_error_response("缺少股票代码参数", code=400)
        
        # 使用akshare获取股票信息
        stock_info = ak.stock_individual_info_em(symbol=code)
        
        if stock_info.empty:
            return flask_error_response("未找到该股票信息", code=404)
        
        # 转换为字典格式
        data = {
            "code": code,
            "info": stock_info.to_dict('records')
        }
        
        return flask_success_response(data, "获取股票信息成功")
    except Exception as e:
        print(f"获取股票信息错误: {str(e)}")
        return flask_error_response(f"获取股票信息失败: {str(e)}", code=500)

@api_v1.route('/stock/realtime', methods=['GET'])
def get_realtime_data():
    """获取实时行情数据"""
    try:
        # 获取A股实时行情
        df = ak.stock_zh_a_spot_em()
        
        if df.empty:
            return flask_error_response("暂无行情数据", code=404)
        
        # 只返回前50条
        data = df.head(50).to_dict('records')
        
        return flask_success_response(
            data={
                "items": data,
                "total": len(df),
                "count": len(data)
            },
            message="获取实时行情成功"
        )
    except Exception as e:
        print(f"获取实时行情错误: {str(e)}")
        return flask_error_response(f"获取实时行情失败: {str(e)}", code=500)

@api_v1.route('/stock/history', methods=['GET'])
def get_history_data():
    """获取历史数据"""
    try:
        code = request.args.get('code')
        period = request.args.get('period', 'daily')  # daily, weekly, monthly
        start_date = request.args.get('start_date', '20240101')
        end_date = request.args.get('end_date', '20241231')
        
        if not code:
            return flask_error_response("缺少股票代码参数", code=400)
        
        # 获取历史行情
        df = ak.stock_zh_a_hist(symbol=code, period=period, start_date=start_date, end_date=end_date, adjust="qfq")
        
        if df.empty:
            return flask_error_response("未找到历史数据", code=404)
        
        data = df.to_dict('records')
        
        return flask_success_response(
            data={
                "code": code,
                "period": period,
                "items": data,
                "count": len(data)
            },
            message="获取历史数据成功"
        )
    except Exception as e:
        print(f"获取历史数据错误: {str(e)}")
        return flask_error_response(f"获取历史数据失败: {str(e)}", code=500)

# 注册蓝图
app.register_blueprint(api_v1)
app.register_blueprint(inquiry_bp, url_prefix='/api')

# ==================== 根路径和向后兼容 ====================
@app.route('/')
def index():
    """根路径"""
    return flask_success_response(
        data={
            "name": "Stock Data Service (Flask)",
            "version": "1.0.0",
            "environment": NODE_ENV,
            "apiVersion": "v1",
            "endpoints": {
                "health": "/api/v1/health",
                "stock_info": "/api/v1/stock/info?code=000001",
                "realtime": "/api/v1/stock/realtime",
                "history": "/api/v1/stock/history?code=000001"
            }
        },
        message="Flask服务运行正常"
    )

@app.route('/health', methods=['GET'])
def health_check():
    """健康检查（向后兼容）"""
    return flask_success_response(
        data={"status": "healthy"},
        message="Flask应用运行正常"
    )

# ==================== 错误处理 ====================
@app.errorhandler(404)
def not_found(error):
    return flask_error_response("请求的资源不存在", code=404)

@app.errorhandler(500)
def internal_error(error):
    print(f"服务器错误: {str(error)}")
    return flask_error_response(
        "服务器内部错误" if NODE_ENV == 'production' else str(error),
        code=500
    )

@app.errorhandler(Exception)
def handle_exception(error):
    print(f"未处理的异常: {str(error)}")
    return flask_error_response(
        "服务器错误" if NODE_ENV == 'production' else str(error),
        code=500
    )

if __name__ == '__main__':
    print(f"""
╔════════════════════════════════════════╗
║   Flask Stock Data Service Started    ║
╠════════════════════════════════════════╣
║   Environment: {NODE_ENV.ljust(24)}║
║   Port:        {str(PORT).ljust(24)}║
║   API Version: v1                      ║
║   URL:         http://localhost:{PORT}/api/v1 ║
╚════════════════════════════════════════╝
    """)
    
    app.run(
        host='0.0.0.0',
        port=PORT,
        debug=(NODE_ENV == 'development')
    )