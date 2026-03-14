# -*- coding: utf-8 -*-
"""
配置管理模块
使用类来管理不同环境的配置，从.env文件读取环境变量

【数据源架构说明】
==================
1. 微信云数据库 (优先): 小程序端直接读取，用于 quotes, inquiries, groups 等集合
2. MongoDB (管理后台): 用于数据管理后台、数据处理和复杂查询
3. 数据同步: 通过 export_data_to_cloud.py 定期将 MongoDB 数据同步到云数据库
==================
"""

import os
import logging
from logging.handlers import RotatingFileHandler
from dotenv import load_dotenv

# 加载.env文件中的环境变量
load_dotenv()

class Config:
    """
    基础配置类
    包含所有环境共用的配置项
    
    数据源优先级:
    1. 微信云数据库 (WX_CLOUD_ENV) - 小程序端使用
    2. MongoDB (MONGO_URI) - 管理后台使用
    """
    
    # Flask密钥，用于会话加密
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    
    # ==================== 数据库配置 ====================
    # 主数据源: MongoDB (管理后台和数据处理)
    MONGO_URI = os.environ.get('MONGO_URI') or 'mongodb://localhost:27017/option_data'
    DATABASE_NAME = os.environ.get('DATABASE_NAME') or 'option_trading'
    
    # 微信云数据库配置 (小程序端数据源)
    WX_CLOUD_ENV = os.environ.get('WX_CLOUD_ENV') or 'develop-8gx7kh9g045e6c9a'
    WX_APPID = os.environ.get('WX_APPID') or ''
    WX_SECRET = os.environ.get('WX_SECRET') or ''
    
    # 数据源模式: 'cloud' (云数据库优先), 'local' (本地MongoDB), 'hybrid' (混合模式)
    DATA_SOURCE_MODE = os.environ.get('DATA_SOURCE_MODE') or 'hybrid'
    
    # ==================== API配置 ====================
    AKSHARE_DATA_SOURCE = os.environ.get('AKSHARE_DATA_SOURCE') or 'default'
    
    # ==================== 日志配置 ====================
    LOG_LEVEL = os.environ.get('LOG_LEVEL') or 'INFO'
    LOG_FILE = os.environ.get('LOG_FILE') or 'app.log'
    
    # ==================== 跨域配置 ====================
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS') or '*'
    
    # ==================== 应用配置 ====================
    APP_NAME = os.environ.get('APP_NAME') or '期权数据服务'
    DEBUG = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
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
        # 配置日志收集
        if not app.debug:
            # 创建logs目录
            if not os.path.exists('logs'):
                os.mkdir('logs')
            
            # 配置文件日志处理器（自动轮转）
            file_handler = RotatingFileHandler(
                'logs/app.log',
                maxBytes=10240000,  # 10MB
                backupCount=10,     # 保留10个备份文件
                encoding='utf-8'
            )
            file_handler.setFormatter(logging.Formatter(
                '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'
            ))
            file_handler.setLevel(logging.INFO)
            app.logger.addHandler(file_handler)
            
            app.logger.setLevel(logging.INFO)
            app.logger.info('应用启动 - 生产环境')

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
    # 生产环境必须从环境变量获取密钥，严禁使用默认值
    SECRET_KEY = os.environ.get('SECRET_KEY')
    if not SECRET_KEY:
        # 如果是生产环境但没有设置密钥，直接报错阻止启动
        raise ValueError("FATAL: SECRET_KEY environment variable not set for ProductionConfig!")
    
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