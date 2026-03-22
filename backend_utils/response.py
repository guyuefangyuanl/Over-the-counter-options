# -*- coding: utf-8 -*-
"""
统一响应格式工具模块
提供标准化的API响应格式，包括成功响应、错误响应和分页响应
"""

from typing import Any, Optional, Dict, Union, List
from flask import jsonify, current_app
from functools import wraps
import logging
import traceback

logger = logging.getLogger(__name__)


# --- 错误码定义 ---
class ErrorCode:
    """标准错误码"""
    # 通用错误 (1000-1999)
    UNKNOWN_ERROR = 1000
    INVALID_REQUEST = 1001
    VALIDATION_ERROR = 1002
    RESOURCE_NOT_FOUND = 1003
    RESOURCE_ALREADY_EXISTS = 1004
    
    # 认证错误 (2000-2999)
    UNAUTHORIZED = 2000
    TOKEN_EXPIRED = 2001
    TOKEN_INVALID = 2002
    PERMISSION_DENIED = 2003
    LOGIN_REQUIRED = 2004
    
    # 用户错误 (3000-3999)
    USER_NOT_FOUND = 3000
    USER_DISABLED = 3001
    PASSWORD_ERROR = 3002
    PHONE_ALREADY_EXISTS = 3003
    
    # 交易错误 (4000-4999)
    BALANCE_INSUFFICIENT = 4000
    POSITION_NOT_FOUND = 4001
    POSITION_ALREADY_CLOSED = 4002
    ORDER_NOT_FOUND = 4003
    ORDER_ALREADY_FILLED = 4004
    TRADING_LIMIT_EXCEEDED = 4005
    RISK_CHECK_FAILED = 4006
    
    # 数据错误 (5000-5999)
    DATABASE_ERROR = 5000
    DATA_NOT_FOUND = 5001
    DATA_VALIDATION_ERROR = 5002
    
    # 系统错误 (9000-9999)
    INTERNAL_ERROR = 9000
    SERVICE_UNAVAILABLE = 9001
    DATABASE_UNAVAILABLE = 9002
    EXTERNAL_API_ERROR = 9003


# --- 错误消息映射 ---
ERROR_MESSAGES = {
    ErrorCode.UNKNOWN_ERROR: "未知错误",
    ErrorCode.INVALID_REQUEST: "无效的请求",
    ErrorCode.VALIDATION_ERROR: "数据验证失败",
    ErrorCode.RESOURCE_NOT_FOUND: "资源不存在",
    ErrorCode.RESOURCE_ALREADY_EXISTS: "资源已存在",
    
    ErrorCode.UNAUTHORIZED: "未授权",
    ErrorCode.TOKEN_EXPIRED: "登录已过期",
    ErrorCode.TOKEN_INVALID: "无效的登录凭证",
    ErrorCode.PERMISSION_DENIED: "权限不足",
    ErrorCode.LOGIN_REQUIRED: "请先登录",
    
    ErrorCode.USER_NOT_FOUND: "用户不存在",
    ErrorCode.USER_DISABLED: "用户已禁用",
    ErrorCode.PASSWORD_ERROR: "密码错误",
    ErrorCode.PHONE_ALREADY_EXISTS: "手机号已存在",
    
    ErrorCode.BALANCE_INSUFFICIENT: "余额不足",
    ErrorCode.POSITION_NOT_FOUND: "持仓不存在",
    ErrorCode.POSITION_ALREADY_CLOSED: "持仓已平仓",
    ErrorCode.ORDER_NOT_FOUND: "订单不存在",
    ErrorCode.ORDER_ALREADY_FILLED: "订单已成交",
    ErrorCode.TRADING_LIMIT_EXCEEDED: "超过交易限额",
    ErrorCode.RISK_CHECK_FAILED: "风控检查未通过",
    
    ErrorCode.DATABASE_ERROR: "数据库错误",
    ErrorCode.DATA_NOT_FOUND: "数据不存在",
    ErrorCode.DATA_VALIDATION_ERROR: "数据格式错误",
    
    ErrorCode.INTERNAL_ERROR: "服务器内部错误",
    ErrorCode.SERVICE_UNAVAILABLE: "服务暂不可用",
    ErrorCode.DATABASE_UNAVAILABLE: "数据库暂不可用",
    ErrorCode.EXTERNAL_API_ERROR: "外部服务错误",
}


def success_response(data: Any = None, message: str = "操作成功", code: int = 200) -> dict:
    """
    生成统一的成功响应格式
    """
    return {
        "success": True,
        "message": message,
        "code": code,
        "data": data if data is not None else {}
    }


def error_response(message: str = "操作失败", code: int = 400, 
                   error_code: int = None, data: Any = None) -> dict:
    """
    生成统一的错误响应格式
    
    Args:
        message: 错误消息
        code: HTTP状态码
        error_code: 业务错误码（可选）
        data: 额外数据
    """
    response = {
        "success": False,
        "message": message,
        "code": code,
        "data": data if data is not None else {}
    }
    
    if error_code is not None:
        response["error_code"] = error_code
    
    return response


def paginated_response(
    data: list, 
    page: int, 
    per_page: int, 
    total: int, 
    message: str = "获取成功"
) -> dict:
    """
    生成统一的分页响应格式
    """
    # 计算总页数
    total_pages = (total + per_page - 1) // per_page if per_page > 0 else 0
    
    return {
        "success": True,
        "message": message,
        "code": 200,
        "data": {
            "items": data if isinstance(data, list) else [],
            "pagination": {
                "page": int(page),
                "per_page": int(per_page),
                "total": int(total),
                "pages": int(total_pages)
            }
        }
    }


def flask_success_response(data: Optional[Any] = None, message: str = "操作成功", code: int = 200):
    """
    生成Flask的JSON成功响应
    
    Args:
        data (Any, optional): 返回的数据内容，默认为None
        message (str): 响应消息，默认为"操作成功"
        code (int): HTTP状态码，默认为200
        
    Returns:
        Response: Flask的JSON响应对象
    """
    response_data = success_response(data, message, code)
    return jsonify(response_data), code


def flask_error_response(message: str = "操作失败", code: int = 400, 
                         error_code: int = None, data: Optional[Any] = None):
    """
    生成Flask的JSON错误响应
    
    Args:
        message (str): 错误消息，默认为"操作失败"
        code (int): HTTP状态码，默认为400
        error_code (int): 业务错误码（可选）
        data (Any, optional): 额外的错误数据，默认为None
        
    Returns:
        Response: Flask的JSON响应对象
    """
    response_data = error_response(message, code, error_code, data)
    return jsonify(response_data), code


def flask_paginated_response(
    data: list, 
    page: int, 
    per_page: int, 
    total: int, 
    message: str = "获取成功"
):
    """
    生成Flask的JSON分页响应
    
    Args:
        data (list): 当前页的数据列表
        page (int): 当前页码
        per_page (int): 每页数据条数
        total (int): 数据总条数
        message (str): 响应消息，默认为"获取成功"
        
    Returns:
        Response: Flask的JSON响应对象
    """
    response_data = paginated_response(data, page, per_page, total, message)
    return jsonify(response_data), 200


# --- 异常类 ---
class APIError(Exception):
    """API错误基类"""
    
    def __init__(self, message: str = "操作失败", code: int = 400, 
                 error_code: int = None, data: Any = None):
        self.message = message
        self.code = code
        self.error_code = error_code
        self.data = data
        super().__init__(self.message)
    
    def to_response(self):
        """转换为响应对象"""
        return flask_error_response(
            self.message, 
            self.code, 
            self.error_code, 
            self.data
        )


class ValidationError(APIError):
    """数据验证错误"""
    
    def __init__(self, message: str = "数据验证失败", errors: List[str] = None):
        super().__init__(
            message=message,
            code=400,
            error_code=ErrorCode.VALIDATION_ERROR,
            data={"errors": errors} if errors else None
        )


class UnauthorizedError(APIError):
    """未授权错误"""
    
    def __init__(self, message: str = "未授权"):
        super().__init__(
            message=message,
            code=401,
            error_code=ErrorCode.UNAUTHORIZED
        )


class ForbiddenError(APIError):
    """权限不足错误"""
    
    def __init__(self, message: str = "权限不足"):
        super().__init__(
            message=message,
            code=403,
            error_code=ErrorCode.PERMISSION_DENIED
        )


class NotFoundError(APIError):
    """资源不存在错误"""
    
    def __init__(self, message: str = "资源不存在"):
        super().__init__(
            message=message,
            code=404,
            error_code=ErrorCode.RESOURCE_NOT_FOUND
        )


class InsufficientBalanceError(APIError):
    """余额不足错误"""
    
    def __init__(self, message: str = "余额不足", required: float = 0, available: float = 0):
        super().__init__(
            message=message,
            code=400,
            error_code=ErrorCode.BALANCE_INSUFFICIENT,
            data={"required": required, "available": available}
        )


class RiskCheckError(APIError):
    """风控检查错误"""
    
    def __init__(self, message: str = "风控检查未通过", details: List[str] = None):
        super().__init__(
            message=message,
            code=400,
            error_code=ErrorCode.RISK_CHECK_FAILED,
            data={"details": details} if details else None
        )


# --- 错误处理装饰器 ---
def handle_errors(f):
    """
    统一错误处理装饰器
    自动捕获异常并返回统一格式的错误响应
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except APIError as e:
            logger.warning(f"API Error in {f.__name__}: {e.message}")
            return e.to_response()
        except ValueError as e:
            logger.warning(f"Validation Error in {f.__name__}: {str(e)}")
            return flask_error_response(str(e), 400, ErrorCode.VALIDATION_ERROR)
        except Exception as e:
            logger.error(f"Unexpected Error in {f.__name__}: {str(e)}")
            logger.error(traceback.format_exc())
            
            # 生产环境不暴露具体错误信息
            if current_app.config.get('DEBUG'):
                return flask_error_response(str(e), 500, ErrorCode.INTERNAL_ERROR)
            else:
                return flask_error_response(
                    "服务器内部错误", 
                    500, 
                    ErrorCode.INTERNAL_ERROR
                )
    
    return decorated_function


# --- 响应格式验证工具 ---
def validate_response_format(response: dict) -> bool:
    """
    验证响应是否符合统一格式
    
    Args:
        response: 响应字典
        
    Returns:
        是否符合格式
    """
    required_keys = ['success', 'message', 'code']
    return all(key in response for key in required_keys)


def ensure_data_field(response: dict, data: Any = None) -> dict:
    """
    确保响应包含data字段
    
    Args:
        response: 原始响应
        data: 默认数据
        
    Returns:
        包含data字段的响应
    """
    if 'data' not in response:
        response['data'] = data if data is not None else {}
    return response