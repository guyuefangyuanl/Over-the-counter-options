# -*- coding: utf-8 -*-
"""
日志配置模块
提供统一的日志格式、级别和输出配置
"""

import os
import sys
import logging
from datetime import datetime
from typing import Optional
from functools import wraps


# ============================================
# 日志格式定义
# ============================================

# 标准日志格式
STANDARD_FORMAT = (
    '%(asctime)s | %(levelname)-8s | %(name)s:%(lineno)d | %(message)s'
)

# 详细日志格式（用于调试）
DETAILED_FORMAT = (
    '%(asctime)s | %(levelname)-8s | %(name)s:%(lineno)d | '
    '%(process)d:%(thread)d | %(message)s'
)

# JSON 日志格式（用于生产环境日志收集）
JSON_FORMAT = (
    '{"timestamp": "%(asctime)s", "level": "%(levelname)s", '
    '"logger": "%(name)s", "line": %(lineno)d, "message": "%(message)s"}'
)


# ============================================
# 日志级别配置
# ============================================

LOG_LEVELS = {
    'DEBUG': logging.DEBUG,
    'INFO': logging.INFO,
    'WARNING': logging.WARNING,
    'ERROR': logging.ERROR,
    'CRITICAL': logging.CRITICAL,
}


def get_log_level() -> int:
    """从环境变量获取日志级别"""
    level_name = os.getenv('LOG_LEVEL', 'INFO').upper()
    return LOG_LEVELS.get(level_name, logging.INFO)


# ============================================
# 日志配置类
# ============================================

class LoggerFactory:
    """日志工厂类"""
    
    _configured = False
    _handlers = []
    
    @classmethod
    def configure(
        cls,
        level: int = None,
        log_file: str = None,
        format_type: str = 'standard'
    ):
        """
        配置日志系统
        
        Args:
            level: 日志级别
            log_file: 日志文件路径
            format_type: 格式类型 (standard, detailed, json)
        """
        if cls._configured:
            return
        
        level = level or get_log_level()
        
        # 选择格式
        format_str = {
            'standard': STANDARD_FORMAT,
            'detailed': DETAILED_FORMAT,
            'json': JSON_FORMAT
        }.get(format_type, STANDARD_FORMAT)
        
        # 创建格式器
        formatter = logging.Formatter(
            format_str,
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        
        # 控制台处理器
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(level)
        console_handler.setFormatter(formatter)
        cls._handlers.append(console_handler)
        
        # 文件处理器
        if log_file:
            log_dir = os.path.dirname(log_file)
            if log_dir and not os.path.exists(log_dir):
                os.makedirs(log_dir)
            
            file_handler = logging.FileHandler(log_file, encoding='utf-8')
            file_handler.setLevel(level)
            file_handler.setFormatter(formatter)
            cls._handlers.append(file_handler)
        
        # 配置根日志器
        root_logger = logging.getLogger()
        root_logger.setLevel(level)
        
        for handler in cls._handlers:
            root_logger.addHandler(handler)
        
        cls._configured = True
    
    @classmethod
    def get_logger(cls, name: str) -> logging.Logger:
        """获取日志器"""
        if not cls._configured:
            cls.configure()
        return logging.getLogger(name)


# ============================================
# 便捷函数
# ============================================

def get_logger(name: str) -> logging.Logger:
    """获取日志器"""
    return LoggerFactory.get_logger(name)


def setup_logging(log_file: str = None):
    """设置日志（应用启动时调用）"""
    LoggerFactory.configure(
        level=get_log_level(),
        log_file=log_file or os.getenv('LOG_FILE'),
        format_type='json' if os.getenv('NODE_ENV') == 'production' else 'standard'
    )


# ============================================
# 日志装饰器
# ============================================

def log_function(logger: logging.Logger = None, level: str = 'INFO'):
    """
    函数日志装饰器
    
    用法:
        @log_function()
        def my_function(arg1, arg2):
            return arg1 + arg2
    """
    def decorator(func):
        nonlocal logger
        if logger is None:
            logger = get_logger(func.__module__)
        
        @wraps(func)
        def wrapper(*args, **kwargs):
            func_name = func.__name__
            logger.log(
                LOG_LEVELS.get(level, logging.INFO),
                f"[{func_name}] 开始执行"
            )
            
            try:
                result = func(*args, **kwargs)
                logger.log(
                    LOG_LEVELS.get(level, logging.INFO),
                    f"[{func_name}] 执行成功"
                )
                return result
            except Exception as e:
                logger.error(
                    f"[{func_name}] 执行失败: {str(e)}",
                    exc_info=True
                )
                raise
        
        return wrapper
    return decorator


def log_api_call(logger: logging.Logger = None):
    """
    API调用日志装饰器
    
    记录请求参数、响应时间和状态
    """
    def decorator(func):
        nonlocal logger
        if logger is None:
            logger = get_logger(func.__module__)
        
        @wraps(func)
        def wrapper(*args, **kwargs):
            import time
            from flask import request, g
            
            start_time = time.time()
            func_name = func.__name__
            
            # 记录请求信息
            logger.info(
                f"API [{func_name}] | "
                f"Method: {request.method} | "
                f"Path: {request.path} | "
                f"IP: {request.remote_addr}"
            )
            
            try:
                result = func(*args, **kwargs)
                duration = (time.time() - start_time) * 1000
                
                # 提取状态码
                status_code = 200
                if isinstance(result, tuple) and len(result) == 2:
                    status_code = result[1]
                
                logger.info(
                    f"API [{func_name}] | "
                    f"Status: {status_code} | "
                    f"Duration: {duration:.2f}ms"
                )
                
                return result
            except Exception as e:
                duration = (time.time() - start_time) * 1000
                logger.error(
                    f"API [{func_name}] | "
                    f"Error: {str(e)} | "
                    f"Duration: {duration:.2f}ms",
                    exc_info=True
                )
                raise
        
        return wrapper
    return decorator


# ============================================
# 敏感信息过滤
# ============================================

SENSITIVE_FIELDS = [
    'password', 'passwd', 'pwd',
    'token', 'access_token', 'refresh_token',
    'secret', 'secret_key', 'api_key',
    'authorization', 'credit_card', 'ssn'
]


def sanitize_log_data(data: dict) -> dict:
    """
    过滤敏感信息
    
    Args:
        data: 原始数据字典
        
    Returns:
        过滤后的数据字典
    """
    if not isinstance(data, dict):
        return data
    
    sanitized = {}
    for key, value in data.items():
        key_lower = key.lower()
        if any(sensitive in key_lower for sensitive in SENSITIVE_FIELDS):
            sanitized[key] = '***REDACTED***'
        elif isinstance(value, dict):
            sanitized[key] = sanitize_log_data(value)
        else:
            sanitized[key] = value
    
    return sanitized


class SanitizedLogger:
    """自动过滤敏感信息的日志器"""
    
    def __init__(self, logger: logging.Logger):
        self._logger = logger
    
    def _sanitize(self, msg):
        """尝试过滤日志消息中的敏感信息"""
        if isinstance(msg, dict):
            return sanitize_log_data(msg)
        return msg
    
    def debug(self, msg, *args, **kwargs):
        self._logger.debug(self._sanitize(msg), *args, **kwargs)
    
    def info(self, msg, *args, **kwargs):
        self._logger.info(self._sanitize(msg), *args, **kwargs)
    
    def warning(self, msg, *args, **kwargs):
        self._logger.warning(self._sanitize(msg), *args, **kwargs)
    
    def error(self, msg, *args, **kwargs):
        self._logger.error(self._sanitize(msg), *args, **kwargs)
    
    def critical(self, msg, *args, **kwargs):
        self._logger.critical(self._sanitize(msg), *args, **kwargs)


# ============================================
# 审计日志
# ============================================

class AuditLogger:
    """审计日志器"""
    
    def __init__(self):
        self._logger = get_logger('audit')
    
    def log(
        self,
        action: str,
        user_id: str = None,
        resource_type: str = None,
        resource_id: str = None,
        details: dict = None,
        ip_address: str = None,
        status: str = 'success'
    ):
        """
        记录审计日志
        
        Args:
            action: 操作类型
            user_id: 用户ID
            resource_type: 资源类型
            resource_id: 资源ID
            details: 详细信息
            ip_address: IP地址
            status: 状态
        """
        self._logger.info({
            'type': 'audit',
            'action': action,
            'user_id': user_id,
            'resource_type': resource_type,
            'resource_id': resource_id,
            'details': sanitize_log_data(details or {}),
            'ip_address': ip_address,
            'status': status,
            'timestamp': datetime.utcnow().isoformat()
        })


# 导出
__all__ = [
    'LoggerFactory',
    'get_logger',
    'setup_logging',
    'log_function',
    'log_api_call',
    'sanitize_log_data',
    'SanitizedLogger',
    'AuditLogger'
]