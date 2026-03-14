# -*- coding: utf-8 -*-
import os
import time
import json
import random
import logging
from flask import Flask, jsonify, request, Blueprint, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
# ⚠️ 重要：本项目使用微信云托管，不使用 MongoDB
# from pymongo import MongoClient
# from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
# import akshare as ak  # 云托管环境暂不需要
from services.cloud_db import CloudDbClient, CloudDbConfigError
from flask.json.provider import DefaultJSONProvider
from datetime import datetime

class CustomJSONProvider(DefaultJSONProvider):
    def default(self, obj):
        # 支持云数据库的 _id 字段（字符串格式）
        if isinstance(obj, str) and obj.startswith('cloud://'):
            return obj
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)

# 配置日志
log_file = os.path.join(os.path.dirname(__file__), 'server.log')
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(log_file, encoding='utf-8')
    ]
)
logger = logging.getLogger(__name__)
logger.info(f"日志将同时写入到: {log_file}")

# 加载环境变量
env_dir = os.path.dirname(__file__)
local_env_path = os.path.join(env_dir, ".env.local")
prod_env_path = os.path.join(env_dir, ".env.production")
default_env_path = os.path.join(env_dir, ".env")

# 检查系统环境变量中的 NODE_ENV
system_node_env = os.environ.get('NODE_ENV', 'development')

# 优先加载生产环境配置（如果存在）
if os.path.exists(prod_env_path):
    load_dotenv(prod_env_path, override=True)
    logger.info(f"已加载生产环境配置: {prod_env_path}")
elif os.path.exists(local_env_path):
    load_dotenv(local_env_path, override=True)
    logger.info(f"已从 {local_env_path} 加载环境变量")
elif os.path.exists(default_env_path):
    load_dotenv(default_env_path, override=True)
    logger.info(f"已从 {default_env_path} 加载环境变量")
else:
    load_dotenv(override=True)
    logger.warning(f"未找到配置文件，尝试使用默认路径加载")

logger.info(f"当前环境变量中包含 WX_CLOUD_ENV: {'WX_CLOUD_ENV' in os.environ}")
if 'WX_CLOUD_ENV' in os.environ:
    val = os.environ['WX_CLOUD_ENV']
    logger.info(f"WX_CLOUD_ENV 长度: {len(val)}")

# 数据库配置（云环境优先使用微信云数据库）
USE_MONGODB = os.getenv('USE_MONGODB', 'false').lower() == 'true'
NODE_ENV = os.getenv('NODE_ENV', 'development')

# 初始化云数据库客户端（主数据源）
def init_cloud_db():
    """初始化微信云数据库客户端"""
    try:
        logger.info("=" * 60)
        logger.info("开始初始化微信云数据库客户端")
        logger.info("=" * 60)
        cloud_db = CloudDbClient.from_env()
        logger.info("✅ 微信云数据库客户端初始化成功")
        
        # 测试连接
        try:
            test_query = "db.collection('inquiries').limit(1).get()"
            logger.info(f"测试查询: {test_query}")
            test_result = cloud_db.query(test_query)
            logger.info(f"✅ 云数据库连接测试成功，返回 {len(test_result)} 条记录")
        except Exception as test_err:
            logger.warning(f"⚠️ 云数据库连接测试失败: {test_err}")
        
        logger.info("=" * 60)
        return cloud_db
    except CloudDbConfigError as e:
        logger.warning("=" * 60)
        logger.warning(f"⚠️ 微信云数据库配置未就绪: {e}")
        logger.warning("请检查以下环境变量：")
        logger.warning("  - WX_CLOUD_ENV")
        logger.warning("  - WX_APPID")
        logger.warning("  - WX_SECRET")
        logger.warning("=" * 60)
        return None
    except Exception as e:
        logger.error("=" * 60)
        logger.error(f"❌ 微信云数据库初始化失败: {e}")
        logger.error("=" * 60)
        return None

# MongoDB初始化（仅在明确启用时使用，云环境不需要）
def init_mongodb():
    """初始化MongoDB数据库连接（仅本地开发环境可选）"""
    if not USE_MONGODB:
        logger.info("⚠️ MongoDB已禁用（USE_MONGODB=false），使用微信云数据库")
        return None
    
    if os.getenv("SKIP_DB_INIT") == "1" or NODE_ENV == "testing":
        logger.info("⚠️ 跳过MongoDB初始化（SKIP_DB_INIT=1 或 testing环境）")
        return None

    try:
        from pymongo import MongoClient
        mongo_uri = os.getenv('MONGO_URI', 'mongodb://localhost:27017/option_data')
        db_name = os.getenv('DATABASE_NAME', 'option_trading')
        
        logger.info(f"正在尝试连接 MongoDB: {mongo_uri.split('@')[-1]}")  # 隐藏敏感信息
        # 设置较短的连接超时，避免阻塞启动
        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=1000, connectTimeoutMS=1000)
        # 验证连接
        client.admin.command('ping')
        logger.info("✅ MongoDB数据库连接成功")
        return client[db_name]
    except ImportError:
        logger.warning("⚠️ pymongo未安装，跳过MongoDB连接")
        return None
    except Exception as e:
        logger.warning(f"⚠️ MongoDB数据库连接失败: {e}")
        logger.info("ℹ️ 将使用微信云数据库作为主数据源")
        return None

def resolve_port() -> int:
    # 优先使用 FLASK_PORT，以区分 Node.js 后端的 PORT
    raw = os.getenv('FLASK_PORT') or os.getenv('PORT') or '5002'
    try:
        port = int(raw)
    except Exception:
        port = 5002

    if NODE_ENV == 'development' and 0 < port < 1024 and os.getenv("ALLOW_PRIVILEGED_PORT") != "1":
        return 5000
    return port


def create_app() -> Flask:
    from backend_utils.response import flask_success_response, flask_error_response
    from routes.inquiry import inquiry_bp
    from routes.stock import stock_bp
    from routes.admin import admin_bp
    from routes.auth import auth_bp
    from routes.group import group_bp
    from routes.fee import fee_bp
    from routes.customer import customer_bp
    from routes.trade import trade_bp
    from routes.message import message_bp
    from routes.config import config_bp

    flask_app = Flask(__name__)
    flask_app.json = CustomJSONProvider(flask_app)
    flask_app.config["NODE_ENV"] = NODE_ENV
    
    # ✅ 优先初始化微信云数据库（主数据源）
    flask_app.cloud_db = init_cloud_db()
    
    # 💾 可选：初始化MongoDB（仅在启用USE_MONGODB时）
    flask_app.db = init_mongodb()
    
    # 检查数据库状态
    if flask_app.cloud_db:
        logger.info("✅ 主数据源：微信云数据库（已连接）")
    elif flask_app.db:
        logger.info("ℹ️ 主数据源：MongoDB（备用）")
    else:
        logger.warning("⚠️ 无可用数据库，部分功能将受限")

    # CORS配置
    allowed_origins = os.getenv('ALLOWED_ORIGINS', '').split(',')
    if not allowed_origins or allowed_origins == ['']:
        # 默认允许本地开发环境
        allowed_origins = [
            'http://localhost:5173',
            'http://localhost:3000',
            'http://127.0.0.1:5173',
            'http://127.0.0.1:3000'
        ]
        logger.info(f"使用默认CORS配置: {allowed_origins}")
    else:
        allowed_origins = [origin.strip() for origin in allowed_origins if origin.strip()]
        logger.info(f"使用自定义CORS配置: {allowed_origins}")

    CORS(
        flask_app,
        resources={
            r"/api/*": {
                "origins": allowed_origins,
                "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
                "allow_headers": ["Content-Type", "Authorization", "X-Requested-With", "X-User-ID"],
                "supports_credentials": True,
                "max_age": 86400,
            }
        },
    )

    api_v1 = Blueprint('api_v1', __name__, url_prefix='/api/v1')

    @api_v1.route('/health', methods=['GET'])
    def health_check_v1():
        # 检查数据库连接状态
        db_status = "disconnected"
        db_type = "none"
        
        # 优先检查微信云数据库
        if flask_app.cloud_db:
            try:
                # 尝试查询测试
                test_result = flask_app.cloud_db.query("db.collection('inquiries').limit(1).get()")
                db_status = "connected"
                db_type = "wechat_cloud"
            except Exception as e:
                logger.warning(f"云数据库健康检查失败: {e}")
                db_status = "error"
                db_type = "wechat_cloud"
        # 备用：检查MongoDB
        elif flask_app.db:
            try:
                flask_app.db.command('ping')
                db_status = "connected"
                db_type = "mongodb"
            except Exception as e:
                logger.warning(f"MongoDB健康检查失败: {e}")
                db_status = "error"
                db_type = "mongodb"
        
        return flask_success_response(
            data={
                "status": "healthy",
                "service": "期权数据服务",
                "version": "v1",
                "database": {
                    "type": db_type,
                    "status": db_status
                },
                "environment": flask_app.config.get("NODE_ENV", "development"),
            },
            message="Flask API v1 运行正常",
        )

    flask_app.register_blueprint(api_v1)
    flask_app.register_blueprint(auth_bp, url_prefix="/api/v1/auth")
    flask_app.register_blueprint(inquiry_bp, url_prefix='/api/v1')
    flask_app.register_blueprint(stock_bp, url_prefix='/api/v1/stock')
    flask_app.register_blueprint(admin_bp, url_prefix='/api/v1/admin')
    flask_app.register_blueprint(group_bp, url_prefix='/api/v1')
    flask_app.register_blueprint(fee_bp, url_prefix='/api/v1/admin')
    flask_app.register_blueprint(customer_bp, url_prefix='/api/v1/admin')
    flask_app.register_blueprint(trade_bp, url_prefix='/api/v1/trade')
    flask_app.register_blueprint(message_bp, url_prefix='/api/v1/admin')
    flask_app.register_blueprint(config_bp, url_prefix='/api/v1/admin')
    
    @flask_app.before_request
    def log_request_info():
        logger.info(f">>> Request: {request.method} {request.url}")
        if request.headers.get('X-User-ID'):
            logger.info(f"User ID: {request.headers.get('X-User-ID')}")

    @flask_app.after_request
    def log_response_info(response):
        logger.info(f"<<< Response: {response.status}")
        return response

    # 启动后台任务
    if os.getenv("SKIP_SCHEDULER") != "1":
        start_background_scheduler(flask_app)

    @flask_app.route('/prototype/')
    @flask_app.route('/prototype/<path:path>')
    def serve_prototype(path='index.html'):
        if not path or path == '':
            path = 'index.html'
        return send_from_directory('admin-web', path)

    @flask_app.route('/')
    @flask_app.route('/<path:path>')
    def serve_admin(path='index.html'):
        if not path or path == '':
            path = 'index.html'

        # 如果是 API 请求，不应该进入静态资源处理
        if path.startswith('api/'):
            return flask_error_response("资源不存在", code=404)

        dist_dir = os.path.join(flask_app.root_path, 'admin-ui/dist')
        
        # 如果 dist 目录不存在，返回 API 服务提示
        if not os.path.exists(dist_dir):
            return flask_success_response(
                data={"service": "期权数据服务 API", "version": "v1"},
                message="API 服务运行正常，前端资源未构建"
            )

        target_file = os.path.join(dist_dir, path)
        if os.path.exists(target_file) and os.path.isfile(target_file):
            return send_from_directory(dist_dir, path)

        # React 路由回退到 index.html
        return send_from_directory(dist_dir, 'index.html')

    @flask_app.errorhandler(404)
    def not_found(error):
        # 记录详细日志
        logger.warning(f"404 错误: {request.method} {request.url} - {request.remote_addr}")
        return flask_error_response("请求的资源不存在", code=404)

    @flask_app.errorhandler(500)
    def internal_error(error):
        import traceback
        error_id = f"ERR-{int(time.time())}-{random.randint(1000, 9999)}"
        
        # 详细错误日志
        error_info = {
            'error_id': error_id,
            'error_type': '500',
            'error_message': str(error),
            'method': request.method,
            'url': request.url,
            'remote_addr': request.remote_addr,
            'user_agent': request.headers.get('User-Agent', 'Unknown'),
            'timestamp': datetime.now().isoformat(),
            'traceback': traceback.format_exc()
        }
        
        logger.error(f"🚨 服务器 500 错误 [{error_id}]: {str(error)}")
        logger.error(f"错误详情: {json.dumps(error_info, ensure_ascii=False)}")
        
        # 发送告警（如果配置了告警服务）
        _send_alert_if_configured(error_info)
        
        return flask_error_response(
            "服务器内部错误" if NODE_ENV == 'production' else str(error),
            code=500
        )

    @flask_app.errorhandler(Exception)
    def handle_exception(error):
        import traceback
        error_id = f"ERR-{int(time.time())}-{random.randint(1000, 9999)}"
        
        # 分类错误类型
        error_type = _classify_exception(error)
        
        error_info = {
            'error_id': error_id,
            'error_type': error_type,
            'error_message': str(error),
            'error_class': error.__class__.__name__,
            'method': request.method,
            'url': request.url,
            'remote_addr': request.remote_addr,
            'user_agent': request.headers.get('User-Agent', 'Unknown'),
            'timestamp': datetime.now().isoformat(),
            'traceback': traceback.format_exc()
        }
        
        # 根据错误类型记录不同级别的日志
        if error_type in ['database', 'auth', 'external_service']:
            logger.error(f"🚨 严重错误 [{error_id}] ({error_type}): {str(error)}")
        else:
            logger.warning(f"⚠️ 一般错误 [{error_id}] ({error_type}): {str(error)}")
        
        logger.debug(f"错误详情: {json.dumps(error_info, ensure_ascii=False)}")
        
        # 发送告警（仅对严重错误）
        if error_type in ['database', 'auth', 'external_service']:
            _send_alert_if_configured(error_info)
        
        return flask_error_response(
            "服务器错误" if NODE_ENV == 'production' else str(error),
            code=500
        )
    
    # 注册请求性能监控
    _register_performance_monitoring(flask_app)

    return flask_app


def _classify_exception(error: Exception) -> str:
    """分类异常类型"""
    error_class = error.__class__.__name__
    error_msg = str(error).lower()
    
    # 数据库错误
    if any(kw in error_class.lower() for kw in ['mongo', 'pymongo', 'sqlalchemy', 'db', 'database']):
        return 'database'
    
    # 认证错误
    if any(kw in error_class.lower() for kw in ['auth', 'jwt', 'token', 'unauthorized']):
        return 'auth'
    
    # 外部服务错误
    if any(kw in error_msg for kw in ['wechat', 'cloud', 'api', 'http', 'timeout', 'connection']):
        return 'external_service'
    
    # 配置错误
    if any(kw in error_msg for kw in ['config', 'environment', 'env']):
        return 'config'
    
    return 'unknown'


def _send_alert_if_configured(error_info: dict):
    """根据配置发送告警"""
    # 检查是否配置了告警Webhook
    alert_webhook = os.getenv('ALERT_WEBHOOK_URL')
    if not alert_webhook:
        return
    
    try:
        import requests
        
        # 构建告警消息
        alert_message = {
            'msgtype': 'markdown',
            'markdown': {
                'title': f"🚨 期权系统错警 [{error_info['error_id']}]",
                'text': f"""### 错误信息
- **错误ID**: {error_info['error_id']}
- **错误类型**: {error_info.get('error_type', 'unknown')}
- **错误消息**: {error_info['error_message'][:200]}
- **请求方法**: {error_info['method']}
- **请求URL**: {error_info['url']}
- **客户端IP**: {error_info['remote_addr']}
- **发生时间**: {error_info['timestamp']}

> 请及时检查系统日志并处理问题"""
            }
        }
        
        # 异步发送告警（不阻塞主流程）
        def send_alert():
            try:
                requests.post(alert_webhook, json=alert_message, timeout=5)
            except Exception as e:
                logger.error(f"发送告警失败: {e}")
        
        import threading
        threading.Thread(target=send_alert, daemon=True).start()
        
    except Exception as e:
        logger.error(f"告警发送失败: {e}")


def _register_performance_monitoring(flask_app):
    """注册请求性能监控"""
    from flask import g
    import time
    
    @flask_app.before_request
    def start_timer():
        g.start_time = time.time()
    
    @flask_app.after_request
    def log_performance(response):
        if hasattr(g, 'start_time'):
            duration = time.time() - g.start_time
            
            # 记录慢请求警告
            if duration > 1.0:  # 超过1秒的请求
                logger.warning(f"⏱️ 慢请求警告: {request.method} {request.path} 耗时 {duration:.3f}s")
            
            # 添加性能头部信息
            response.headers['X-Response-Time'] = f"{duration:.3f}s"
            
        return response


def start_background_scheduler(flask_app):
    """启动背景定时任务"""
    import threading
    import time
    from services.sync_service import sync_all_quotes

    def scheduler_loop():
        # 等待应用完全启动
        time.sleep(10)
        
        # 从环境变量获取同步间隔（默认 10 分钟）
        sync_interval = int(os.getenv("AUTO_SYNC_INTERVAL_SECONDS", "600"))
        enabled = os.getenv("ENABLE_AUTO_SYNC", "false").lower() == "true"
        
        if not enabled:
            logger.info("自动同步行情已禁用 (ENABLE_AUTO_SYNC=false)")
            return

        logger.info(f"自动同步行情已启动，间隔: {sync_interval}s")
        
        while True:
            try:
                # 检查是否在交易时间内
                now = time.localtime()
                is_weekday = now.tm_wday < 5
                hour = now.tm_hour
                minute = now.tm_min
                
                is_trading_time = False
                if is_weekday:
                    # 9:15-11:30
                    if (hour == 9 and minute >= 15) or (hour == 10) or (hour == 11 and minute <= 30):
                        is_trading_time = True
                    # 13:00-15:00
                    elif (hour >= 13 and hour < 15) or (hour == 15 and minute == 0):
                        is_trading_time = True
                
                if is_trading_time:
                    logger.info("开始定时自动同步全量行情...")
                    sync_all_quotes(requested_by="system_scheduler")
                    logger.info("定时自动同步全量行情完成")
                else:
                    logger.debug("当前非交易时间，跳过同步")
                    
            except Exception as e:
                logger.error(f"定时同步行情发生错误: {e}")
            
            time.sleep(sync_interval)

    thread = threading.Thread(target=scheduler_loop, daemon=True)
    thread.start()
    return thread


app = create_app()


if __name__ == '__main__':
    port = resolve_port()
    logger.info(f"Starting service on port {port} in {NODE_ENV} mode...")
    try:
        # 在开发环境下禁用 reloader 以提高稳定性
        app.run(host='0.0.0.0', port=port, debug=(NODE_ENV == 'development'), use_reloader=False)
    except OSError as e:
        fallback_port = 5000 if NODE_ENV == "development" else port
        if fallback_port != port:
            logger.error(f"服务端口绑定失败: {e}")
            logger.info(f"尝试使用回退端口启动: {fallback_port}")
            app.run(host='0.0.0.0', port=fallback_port, debug=(NODE_ENV == 'development'))
        else:
            raise
