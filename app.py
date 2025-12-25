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
        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=3000, connectTimeoutMS=3000)
        # 验证连接
        client.admin.command('ping')
        logger.info("✅ MongoDB数据库连接成功")
        return client[db_name]
    except Exception as e:
        logger.error(f"❌ MongoDB数据库连接失败: {e}")
        logger.warning("⚠️ 服务将以无数据库模式运行，部分功能将受限")
        return None

def resolve_port() -> int:
    raw = os.getenv('PORT') or os.getenv('FLASK_PORT') or '5000'
    try:
        port = int(raw)
    except Exception:
        port = 5000

    if NODE_ENV == 'development' and 0 < port < 1024 and os.getenv("ALLOW_PRIVILEGED_PORT") != "1":
        return 5000
    return port


def create_app() -> Flask:
    from utils.response import flask_success_response, flask_error_response
    from routes.inquiry import inquiry_bp
    from routes.stock import stock_bp
    from routes.admin import admin_bp

    flask_app = Flask(__name__)
    flask_app.config["NODE_ENV"] = NODE_ENV
    flask_app.db = init_db()

    allowed_origins = os.getenv('ALLOWED_ORIGINS', 'http://localhost,http://127.0.0.1').split(',')

    CORS(
        flask_app,
        resources={
            r"/api/*": {
                "origins": allowed_origins,
                "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
                "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"],
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
    flask_app.register_blueprint(inquiry_bp, url_prefix='/api/v1')
    flask_app.register_blueprint(stock_bp, url_prefix='/api/v1/stock')
    flask_app.register_blueprint(admin_bp, url_prefix='/api/v1/admin')

    @flask_app.route('/admin/')
    @flask_app.route('/admin/<path:path>')
    def serve_admin(path='index.html'):
        if not path or path == '':
            path = 'index.html'

        dist_dir = os.path.join(flask_app.root_path, 'admin-ui/dist')

        target_file = os.path.join(dist_dir, path)
        if os.path.exists(target_file) and os.path.isfile(target_file):
            return send_from_directory(dist_dir, path)

        return send_from_directory(dist_dir, 'index.html')

    @flask_app.route('/')
    def index():
        return send_from_directory('admin-web', 'index.html')

    @flask_app.route('/<path:path>')
    def serve_static_assets(path):
        if path.startswith('api/') or path.startswith('admin/'):
            return flask_error_response("资源不存在", code=404)

        full_path = os.path.join(flask_app.root_path, 'admin-web', path)
        if os.path.exists(full_path) and os.path.isfile(full_path):
            return send_from_directory('admin-web', path)

        return flask_error_response("资源不存在", code=404)

    @flask_app.errorhandler(404)
    def not_found(error):
        return flask_error_response("请求的资源不存在", code=404)

    @flask_app.errorhandler(500)
    def internal_error(error):
        logger.error(f"服务器错误: {str(error)}")
        return flask_error_response(
            "服务器内部错误" if NODE_ENV == 'production' else str(error),
            code=500,
        )

    @flask_app.errorhandler(Exception)
    def handle_exception(error):
        logger.error(f"未处理的异常: {str(error)}")
        return flask_error_response(
            "服务器错误" if NODE_ENV == 'production' else str(error),
            code=500,
        )

    return flask_app


app = create_app()

if __name__ == '__main__':
    port = resolve_port()
    logger.info(f"Starting service on port {port} in {NODE_ENV} mode...")
    try:
        app.run(host='0.0.0.0', port=port, debug=(NODE_ENV == 'development'))
    except OSError as e:
        fallback_port = 5000 if NODE_ENV == "development" else port
        if fallback_port != port:
            logger.error(f"服务端口绑定失败: {e}")
            logger.info(f"尝试使用回退端口启动: {fallback_port}")
            app.run(host='0.0.0.0', port=fallback_port, debug=(NODE_ENV == 'development'))
        else:
            raise
