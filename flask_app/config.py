# -*- coding: utf-8 -*-
"""
配置管理模块
使用类来管理不同环境的配置，从.env文件读取环境变量
"""

import os
from dotenv import load_dotenv

# 加载.env文件中的环境变量
load_dotenv()

class Config:
    """
    基础配置类
    包含所有环境共用的配置项
    """
    
    # Flask密钥，用于会话加密
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    
    # 数据库配置
    # MongoDB配置
    MONGO_URI = os.environ.get('MONGO_URI') or 'mongodb://localhost:27017/option_data'
    
    # 数据库名称
    DATABASE_NAME = os.environ.get('DATABASE_NAME') or 'option_trading'
    
    # API配置
    # AkShare数据源配置
    AKSHARE_DATA_SOURCE = os.environ.get('AKSHARE_DATA_SOURCE') or 'default'
    
    # 日志配置
    LOG_LEVEL = os.environ.get('LOG_LEVEL') or 'INFO'
    LOG_FILE = os.environ.get('LOG_FILE') or 'app.log'
    
    # 跨域配置
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS') or '*'
    
    # 应用配置
    APP_NAME = os.environ.get('APP_NAME') or '期权数据服务'
    
    # 调试模式
    DEBUG = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    
    # 主机和端口配置
    FLASK_HOST = os.environ.get('FLASK_HOST') or '127.0.0.1'
    FLASK_PORT = int(os.environ.get('FLASK_PORT') or 5000)
    
    @staticmethod
    def init_app(app):
        """
        初始化应用的静态方法
        可以在这里添加应用初始化逻辑
        
        Args:
            app (Flask): Flask应用实例
        """
        pass

class DevelopmentConfig(Config):
    """
    开发环境配置
    """
    DEBUG = True
    # 开发环境使用不同的数据库
    MONGO_URI = os.environ.get('DEV_MONGO_URI') or 'mongodb://localhost:27017/option_data_dev'

class ProductionConfig(Config):
    """
    生产环境配置
    """
    DEBUG = False
    # 生产环境使用不同的密钥
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'production-secret-key-must-be-set-in-env'
    
    # 生产环境使用不同的数据库
    MONGO_URI = os.environ.get('PROD_MONGO_URI') or 'mongodb://localhost:27017/option_data_prod'

class TestingConfig(Config):
    """
    测试环境配置
    """
    TESTING = True
    DEBUG = True
    # 测试环境使用内存数据库
    MONGO_URI = os.environ.get('TEST_MONGO_URI') or 'mongodb://localhost:27017/option_data_test'

# 配置字典，用于根据环境变量选择配置
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}