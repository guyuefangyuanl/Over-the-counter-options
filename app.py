# -*- coding: utf-8 -*-
import os
import time
import logging
from flask import Flask, jsonify, request, Blueprint, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
import akshare as ak
from services.cloud_db import CloudDbClient, CloudDbConfigError
from flask.json.provider import DefaultJSONProvider
from bson import ObjectId
from datetime import datetime

class CustomJSONProvider(DefaultJSONProvider):
    def default(self, obj):
        if isinstance(obj, ObjectId):
            return str(obj)
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
default_env_path = os.path.join(env_dir, ".env")

if os.path.exists(local_env_path):
    load_dotenv(local_env_path, override=True)
    logger.info(f"已从 {local_env_path} 加载环境变量")
elif os.path.exists(default_env_path):
    load_dotenv(default_env_path, override=True)
    logger.info(f"已从 {default_env_path} 加载环境变量")
else:
    load_dotenv(override=True)
    logger.warning(f"未找到 {default_env_path}，尝试使用默认路径加载")

logger.info(f"当前环境变量中包含 WX_CLOUD_ENV: {'WX_CLOUD_ENV' in os.environ}")
if 'WX_CLOUD_ENV' in os.environ:
    val = os.environ['WX_CLOUD_ENV']
    logger.info(f"WX_CLOUD_ENV 长度: {len(val)}")

# 数据库配置
MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017/option_data')
DATABASE_NAME = os.getenv('DATABASE_NAME', 'option_trading')
NODE_ENV = os.getenv('NODE_ENV', 'development')

# 初始化MongoDB数据库连接
def init_db():
    if os.getenv("SKIP_DB_INIT") == "1" or NODE_ENV == "testing":
        return None

    mongo_uri = os.getenv('MONGO_URI', 'mongodb://localhost:27017/option_data')
    db_name = os.getenv('DATABASE_NAME', 'option_trading')
    
    logger.info(f"正在尝试连接 MongoDB: {mongo_uri.split('@')[-1]}") # 隐藏敏感信息
    try:
        # 设置较短的连接超时，避免阻塞启动
        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=1000, connectTimeoutMS=1000)
        # 验证连接
        client.admin.command('ping')
        logger.info("✅ MongoDB数据库连接成功")
        return client[db_name]
    except Exception as e:
        logger.error(f"❌ MongoDB数据库连接失败: {e}")
        logger.warning("⚠️ 服务将以无数据库模式运行，部分功能将受限")
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
    flask_app.db = init_db()
    
    # 初始化云数据库客户端
    try:
        logger.info("=" * 60)
        logger.info("开始初始化微信云数据库客户端")
        logger.info("=" * 60)
        flask_app.cloud_db = CloudDbClient.from_env()
        logger.info("✅ 微信云数据库客户端初始化成功")
        # 测试连接
        try:
            test_query = "db.collection('inquiries').limit(1).get()"
            logger.info(f"测试查询: {test_query}")
            test_result = flask_app.cloud_db.query(test_query)
            logger.info(f"✅ 云数据库连接测试成功，返回 {len(test_result)} 条记录")
        except Exception as test_err:
            logger.warning(f"⚠️ 云数据库连接测试失败: {test_err}")
        logger.info("=" * 60)
    except CloudDbConfigError as e:
        flask_app.cloud_db = None
        logger.warning("=" * 60)
        logger.warning(f"⚠️ 微信云数据库配置未就绪: {e}")
        logger.warning("请检查以下环境变量：")
        logger.warning("  - WX_CLOUD_ENV")
        logger.warning("  - WX_APPID")
        logger.warning("  - WX_SECRET")
        logger.warning("=" * 60)
    except Exception as e:
        flask_app.cloud_db = None
        logger.error("=" * 60)
        logger.error(f"❌ 微信云数据库初始化失败: {e}")
        import traceback
        logger.error(traceback.format_exc())
        logger.error("=" * 60)

    def ensure_db():
        if flask_app.db is not None:
            return flask_app.db
        if os.getenv("SKIP_DB_INIT") == "1" or flask_app.config.get("NODE_ENV") == "testing":
            return None
        now = time.time()
        last_attempt = getattr(flask_app, "_db_last_attempt_ts", 0)
        if now - last_attempt < 10:
            return None
        flask_app._db_last_attempt_ts = now
        flask_app.db = init_db()
        return flask_app.db
    flask_app.ensure_db = ensure_db

    allowed_origins = os.getenv('ALLOWED_ORIGINS', 'http://localhost,http://127.0.0.1').split(',')

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
        db_status = "connected" if flask_app.db is not None else "disconnected"
        return flask_success_response(
            data={
                "status": "healthy",
                "db": db_status,
                "version": "v1",
                "service": "期权数据服务",
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
    flask_app.register_blueprint(trade_bp, url_prefix='/api/v1/admin')
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

        target_file = os.path.join(dist_dir, path)
        if os.path.exists(target_file) and os.path.isfile(target_file):
            return send_from_directory(dist_dir, path)

        # React 路由回退到 index.html
        return send_from_directory(dist_dir, 'index.html')

    @flask_app.errorhandler(404)
    def not_found(error):
        return flask_error_response("请求的资源不存在", code=404)

    @flask_app.errorhandler(500)
    def internal_error(error):
        import traceback
        logger.error(f"服务器 500 错误: {str(error)}")
        logger.error(traceback.format_exc())
        return flask_error_response(
            "服务器内部错误" if NODE_ENV == 'production' else str(error),
            code=500,
        )

    @flask_app.errorhandler(Exception)
    def handle_exception(error):
        import traceback
        logger.error(f"未处理的异常: {str(error)}")
        logger.error(traceback.format_exc())
        return flask_error_response(
            "服务器错误" if NODE_ENV == 'production' else str(error),
            code=500,
        )

    return flask_app


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
