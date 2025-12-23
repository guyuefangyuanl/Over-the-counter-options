# -*- coding: utf-8 -*-
import os
import logging
from flask import Flask, jsonify, request, Blueprint, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
import akshare as ak

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

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
    logger.info("✅ MongoDB数据库连接成功")
except (ConnectionFailure, ServerSelectionTimeoutError) as e:
    logger.error(f"❌ MongoDB数据库连接失败: {e}")
    db = None
except Exception as e:
    logger.error(f"❌ MongoDB数据库连接发生未知错误: {e}")
    db = None

# 导入路由蓝图和工具
from utils.response import flask_success_response, flask_error_response
from routes.inquiry import inquiry_bp
from routes.stock import stock_bp
from routes.admin import admin_bp

app = Flask(__name__)
app.db = db  # 将数据库实例挂载到app对象上

# 环境配置
PORT = int(os.getenv('PORT', os.getenv('FLASK_PORT', 80)))
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

# 注册蓝图
app.register_blueprint(api_v1)
app.register_blueprint(inquiry_bp, url_prefix='/api/v1')
app.register_blueprint(stock_bp, url_prefix='/api/v1/stock')
app.register_blueprint(admin_bp, url_prefix='/api/v1/admin')

# ==================== 根路径和向后兼容 ====================
@app.route('/admin')
def admin_page():
    """管理后台入口"""
    return send_from_directory('admin-web', 'index.html')

@app.route('/admin/<path:path>')
def send_admin_assets(path):
    """发送管理后台静态资源"""
    return send_from_directory('admin-web', path)

@app.route('/')
def index():
    """根路径"""
    return flask_success_response(
        data={
            "name": "Option Trading Backend (Flask)",
            "version": "1.0.0",
            "environment": NODE_ENV,
            "apiVersion": "v1",
            "endpoints": {
                "health": "/api/v1/health",
                "admin_upload": "/api/v1/admin/upload-quotes",
                "stock_realtime": "/api/v1/stock/realtime"
            }
        },
        message="服务运行正常"
    )

# ==================== 错误处理 ====================
@app.errorhandler(404)
def not_found(error):
    return flask_error_response("请求的资源不存在", code=404)

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"服务器错误: {str(error)}")
    return flask_error_response(
        "服务器内部错误" if NODE_ENV == 'production' else str(error),
        code=500
    )

@app.errorhandler(Exception)
def handle_exception(error):
    logger.error(f"未处理的异常: {str(error)}")
    return flask_error_response(
        "服务器错误" if NODE_ENV == 'production' else str(error),
        code=500
    )

if __name__ == '__main__':
    logger.info(f"Starting service on port {PORT} in {NODE_ENV} mode...")
    app.run(
        host='0.0.0.0',
        port=PORT,
        debug=(NODE_ENV == 'development')
    )
