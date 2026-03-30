# -*- coding: utf-8 -*-
"""
统一响应格式工具模块
提供标准化的API响应格式，包括成功响应、错误响应和分页响应
"""

from typing import Any, Optional, Dict, Union, List, Tuple
from flask import jsonify, current_app, request, g
from functools import wraps
import logging
import traceback
import uuid
import re
import time
import hashlib

logger = logging.getLogger(__name__)


# --- Trace ID 生成 ---
def generate_trace_id() -> str:
    """生成请求追踪ID"""
    return f"tr_{uuid.uuid4().hex[:16]}"


def get_current_trace_id() -> str:
    """获取当前请求的trace_id，如果不存在则创建"""
    if hasattr(g, 'trace_id'):
        return g.trace_id
    trace_id = generate_trace_id()
    g.trace_id = trace_id
    return trace_id


# --- 敏感信息脱敏 ---
def mask_sensitive_data(data: Any, sensitive_keys: set = None) -> Any:
    """
    脱敏敏感数据
    
    Args:
        data: 原始数据
        sensitive_keys: 敏感字段名集合
        
    Returns:
        脱敏后的数据
    """
    if sensitive_keys is None:
        sensitive_keys = {
            'password', 'pwd', 'secret', 'token', 'access_token',
            'refresh_token', 'api_key', 'apikey', 'private_key',
            'phone', 'mobile', 'id_card', 'idcard', 'bank_card',
            'card_no', 'card_number', 'ssn', 'credit_card'
        }
    
    if isinstance(data, dict):
        masked = {}
        for k, v in data.items():
            key_lower = k.lower()
            if key_lower in sensitive_keys:
                masked[k] = '***REDACTED***'
            elif key_lower in ('phone', 'mobile'):
                masked[k] = _mask_phone(str(v)) if v else v
            elif key_lower in ('id_card', 'idcard'):
                masked[k] = _mask_id_card(str(v)) if v else v
            elif key_lower in ('bank_card', 'card_no', 'card_number'):
                masked[k] = _mask_bank_card(str(v)) if v else v
            else:
                masked[k] = mask_sensitive_data(v, sensitive_keys)
        return masked
    elif isinstance(data, list):
        return [mask_sensitive_data(item, sensitive_keys) for item in data]
    else:
        return data


def _mask_phone(phone: str) -> str:
    """手机号脱敏: 138****1234"""
    if len(phone) >= 7:
        return f"{phone[:3]}****{phone[-4:]}"
    return '***REDACTED***'


def _mask_id_card(id_card: str) -> str:
    """身份证脱敏: 310***********1234"""
    if len(id_card) >= 7:
        return f"{id_card[:3]}{'*' * (len(id_card) - 7)}{id_card[-4:]}"
    return '***REDACTED***'


def _mask_bank_card(card: str) -> str:
    """银行卡脱敏: **** **** **** 1234"""
    if len(card) >= 4:
        return f"**** **** **** {card[-4:]}"
    return '***REDACTED***'


# --- 错误码定义 ---
class ErrorCode:
    """标准错误码"""
    # 通用错误 (1000-1999)
    UNKNOWN_ERROR = 1000
    INVALID_REQUEST = 1001
    VALIDATION_ERROR = 1002
    RESOURCE_NOT_FOUND = 1003
    RESOURCE_ALREADY_EXISTS = 1004
    INVALID_FILE_FORMAT = 1005
    FILE_TOO_LARGE = 1006
    
    # 认证错误 (2000-2999)
    UNAUTHORIZED = 2000
    TOKEN_EXPIRED = 2001
    TOKEN_INVALID = 2002
    PERMISSION_DENIED = 2003
    LOGIN_REQUIRED = 2004
    TWO_FACTOR_REQUIRED = 2005
    
    # 用户错误 (3000-3999)
    USER_NOT_FOUND = 3000
    USER_DISABLED = 3001
    PASSWORD_ERROR = 3002
    PHONE_ALREADY_EXISTS = 3003
    USER_ALREADY_EXISTS = 3004
    
    # 交易错误 (4000-4999)
    BALANCE_INSUFFICIENT = 4000
    POSITION_NOT_FOUND = 4001
    POSITION_ALREADY_CLOSED = 4002
    ORDER_NOT_FOUND = 4003
    ORDER_ALREADY_FILLED = 4004
    TRADING_LIMIT_EXCEEDED = 4005
    RISK_CHECK_FAILED = 4006
    INQUIRY_NOT_FOUND = 4007
    INQUIRY_EXPIRED = 4008
    QUOTE_NOT_AVAILABLE = 4009
    
    # 数据错误 (5000-5999)
    DATABASE_ERROR = 5000
    DATA_NOT_FOUND = 5001
    DATA_VALIDATION_ERROR = 5002
    DATABASE_TIMEOUT = 5003
    DATABASE_CONNECTION_ERROR = 5004
    
    # 限流错误 (6000-6099) - 可重试
    RATE_LIMITED = 6000
    API_QUOTA_EXCEEDED = 6001
    
    # 资源冲突错误 (7000-7099) - 可重试
    RESOURCE_CONFLICT = 7000
    OPTIMISTIC_LOCK_ERROR = 7001
    CONCURRENT_MODIFICATION = 7002
    
    # 系统错误 (9000-9999)
    INTERNAL_ERROR = 9000
    SERVICE_UNAVAILABLE = 9001
    DATABASE_UNAVAILABLE = 9002
    EXTERNAL_API_ERROR = 9003
    TIMEOUT_ERROR = 9004
    CONNECTION_ERROR = 9005
    CIRCUIT_BREAKER_OPEN = 9006


# --- 错误属性映射 ---
# 格式: error_code: (retryable, category, user_message, retry_after_seconds)
ERROR_ATTRIBUTES = {
    # 通用错误 - 不可重试
    ErrorCode.UNKNOWN_ERROR: (False, 'unknown', '系统错误，请稍后重试', None),
    ErrorCode.INVALID_REQUEST: (False, 'validation', '请求参数有误', None),
    ErrorCode.VALIDATION_ERROR: (False, 'validation', '数据验证失败', None),
    ErrorCode.RESOURCE_NOT_FOUND: (False, 'not_found', '资源不存在', None),
    ErrorCode.RESOURCE_ALREADY_EXISTS: (False, 'conflict', '资源已存在', None),
    ErrorCode.INVALID_FILE_FORMAT: (False, 'validation', '文件格式不支持', None),
    ErrorCode.FILE_TOO_LARGE: (False, 'validation', '文件大小超过限制', None),
    
    # 认证错误 - 不可重试
    ErrorCode.UNAUTHORIZED: (False, 'auth', '请先登录', None),
    ErrorCode.TOKEN_EXPIRED: (False, 'auth', '登录已过期，请重新登录', None),
    ErrorCode.TOKEN_INVALID: (False, 'auth', '登录凭证无效', None),
    ErrorCode.PERMISSION_DENIED: (False, 'auth', '没有权限执行此操作', None),
    ErrorCode.LOGIN_REQUIRED: (False, 'auth', '请先登录', None),
    ErrorCode.TWO_FACTOR_REQUIRED: (False, 'auth', '需要二次验证', None),
    
    # 用户错误 - 不可重试
    ErrorCode.USER_NOT_FOUND: (False, 'not_found', '用户不存在', None),
    ErrorCode.USER_DISABLED: (False, 'auth', '账户已被禁用', None),
    ErrorCode.PASSWORD_ERROR: (False, 'auth', '密码错误', None),
    ErrorCode.PHONE_ALREADY_EXISTS: (False, 'conflict', '手机号已注册', None),
    ErrorCode.USER_ALREADY_EXISTS: (False, 'conflict', '用户已存在', None),
    
    # 交易错误 - 不可重试
    ErrorCode.BALANCE_INSUFFICIENT: (False, 'business', '余额不足', None),
    ErrorCode.POSITION_NOT_FOUND: (False, 'not_found', '持仓不存在', None),
    ErrorCode.POSITION_ALREADY_CLOSED: (False, 'business', '持仓已平仓', None),
    ErrorCode.ORDER_NOT_FOUND: (False, 'not_found', '订单不存在', None),
    ErrorCode.ORDER_ALREADY_FILLED: (False, 'business', '订单已成交', None),
    ErrorCode.TRADING_LIMIT_EXCEEDED: (False, 'business', '超过交易限额', None),
    ErrorCode.RISK_CHECK_FAILED: (False, 'business', '风控检查未通过', None),
    ErrorCode.INQUIRY_NOT_FOUND: (False, 'not_found', '询价单不存在', None),
    ErrorCode.INQUIRY_EXPIRED: (False, 'business', '询价已过期', None),
    ErrorCode.QUOTE_NOT_AVAILABLE: (False, 'business', '报价不可用', None),
    
    # 数据错误 - 可重试
    ErrorCode.DATABASE_ERROR: (True, 'database', '数据库错误', 2),
    ErrorCode.DATA_NOT_FOUND: (False, 'not_found', '数据不存在', None),
    ErrorCode.DATA_VALIDATION_ERROR: (False, 'validation', '数据格式错误', None),
    ErrorCode.DATABASE_TIMEOUT: (True, 'database', '数据库响应超时', 3),
    ErrorCode.DATABASE_CONNECTION_ERROR: (True, 'database', '数据库连接失败', 2),
    
    # 限流错误 - 可重试
    ErrorCode.RATE_LIMITED: (True, 'rate_limit', '请求过于频繁，请稍后重试', 3),
    ErrorCode.API_QUOTA_EXCEEDED: (True, 'rate_limit', 'API调用额度已用尽', 60),
    
    # 资源冲突 - 可重试
    ErrorCode.RESOURCE_CONFLICT: (True, 'conflict', '资源冲突，请重试', 1),
    ErrorCode.OPTIMISTIC_LOCK_ERROR: (True, 'conflict', '数据已被修改，请刷新后重试', 1),
    ErrorCode.CONCURRENT_MODIFICATION: (True, 'conflict', '并发修改冲突', 1),
    
    # 系统错误 - 可重试
    ErrorCode.INTERNAL_ERROR: (True, 'system', '服务器内部错误', 2),
    ErrorCode.SERVICE_UNAVAILABLE: (True, 'system', '服务暂不可用', 5),
    ErrorCode.DATABASE_UNAVAILABLE: (True, 'database', '数据库暂不可用', 5),
    ErrorCode.EXTERNAL_API_ERROR: (True, 'external', '外部服务错误', 3),
    ErrorCode.TIMEOUT_ERROR: (True, 'timeout', '请求超时', 2),
    ErrorCode.CONNECTION_ERROR: (True, 'network', '网络连接失败', 2),
    ErrorCode.CIRCUIT_BREAKER_OPEN: (True, 'system', '服务熔断中，请稍后重试', 10),
}


def get_error_attributes(error_code: int) -> Tuple[bool, str, str, Optional[int]]:
    """
    获取错误属性
    
    Args:
        error_code: 错误码
        
    Returns:
        (retryable, category, user_message, retry_after_seconds)
    """
    return ERROR_ATTRIBUTES.get(error_code, (False, 'unknown', '操作失败', None))


# --- 错误消息映射 ---
ERROR_MESSAGES = {
    ErrorCode.UNKNOWN_ERROR: "未知错误",
    ErrorCode.INVALID_REQUEST: "无效的请求",
    ErrorCode.VALIDATION_ERROR: "数据验证失败",
    ErrorCode.RESOURCE_NOT_FOUND: "资源不存在",
    ErrorCode.RESOURCE_ALREADY_EXISTS: "资源已存在",
    ErrorCode.INVALID_FILE_FORMAT: "文件格式不支持",
    ErrorCode.FILE_TOO_LARGE: "文件大小超过限制",
    
    ErrorCode.UNAUTHORIZED: "未授权",
    ErrorCode.TOKEN_EXPIRED: "登录已过期",
    ErrorCode.TOKEN_INVALID: "无效的登录凭证",
    ErrorCode.PERMISSION_DENIED: "权限不足",
    ErrorCode.LOGIN_REQUIRED: "请先登录",
    ErrorCode.TWO_FACTOR_REQUIRED: "需要二次验证",
    
    ErrorCode.USER_NOT_FOUND: "用户不存在",
    ErrorCode.USER_DISABLED: "用户已禁用",
    ErrorCode.PASSWORD_ERROR: "密码错误",
    ErrorCode.PHONE_ALREADY_EXISTS: "手机号已存在",
    ErrorCode.USER_ALREADY_EXISTS: "用户已存在",
    
    ErrorCode.BALANCE_INSUFFICIENT: "余额不足",
    ErrorCode.POSITION_NOT_FOUND: "持仓不存在",
    ErrorCode.POSITION_ALREADY_CLOSED: "持仓已平仓",
    ErrorCode.ORDER_NOT_FOUND: "订单不存在",
    ErrorCode.ORDER_ALREADY_FILLED: "订单已成交",
    ErrorCode.TRADING_LIMIT_EXCEEDED: "超过交易限额",
    ErrorCode.RISK_CHECK_FAILED: "风控检查未通过",
    ErrorCode.INQUIRY_NOT_FOUND: "询价单不存在",
    ErrorCode.INQUIRY_EXPIRED: "询价已过期",
    ErrorCode.QUOTE_NOT_AVAILABLE: "报价不可用",
    
    ErrorCode.DATABASE_ERROR: "数据库错误",
    ErrorCode.DATA_NOT_FOUND: "数据不存在",
    ErrorCode.DATA_VALIDATION_ERROR: "数据格式错误",
    ErrorCode.DATABASE_TIMEOUT: "数据库响应超时",
    ErrorCode.DATABASE_CONNECTION_ERROR: "数据库连接失败",
    
    ErrorCode.RATE_LIMITED: "请求过于频繁",
    ErrorCode.API_QUOTA_EXCEEDED: "API调用额度已用尽",
    
    ErrorCode.RESOURCE_CONFLICT: "资源冲突",
    ErrorCode.OPTIMISTIC_LOCK_ERROR: "乐观锁错误",
    ErrorCode.CONCURRENT_MODIFICATION: "并发修改冲突",
    
    ErrorCode.INTERNAL_ERROR: "服务器内部错误",
    ErrorCode.SERVICE_UNAVAILABLE: "服务暂不可用",
    ErrorCode.DATABASE_UNAVAILABLE: "数据库暂不可用",
    ErrorCode.EXTERNAL_API_ERROR: "外部服务错误",
    ErrorCode.TIMEOUT_ERROR: "请求超时",
    ErrorCode.CONNECTION_ERROR: "网络连接失败",
    ErrorCode.CIRCUIT_BREAKER_OPEN: "服务熔断中",
}


def success_response(data: Any = None, message: str = "操作成功", code: int = 200) -> dict:
    """
    生成统一的成功响应格式
    """
    return {
        "success": True,
        "message": message,
        "code": code,
        "data": data if data is not None else {},
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }


def error_response(message: str = "操作失败", code: int = 400, 
                   error_code: int = None, data: Any = None,
                   trace_id: str = None, retry_after: int = None) -> dict:
    """
    生成统一的错误响应格式
    
    Args:
        message: 错误消息
        code: HTTP状态码
        error_code: 业务错误码（可选）
        data: 额外数据
        trace_id: 请求追踪ID（可选，自动生成）
        retry_after: 建议重试等待秒数（可选）
    """
    # 获取或生成 trace_id
    if trace_id is None:
        try:
            trace_id = get_current_trace_id()
        except Exception:
            trace_id = generate_trace_id()
    
    response = {
        "success": False,
        "message": message,
        "code": code,
        "data": data if data is not None else {},
        "trace_id": trace_id,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }
    
    if error_code is not None:
        response["error_code"] = error_code
        # 根据 error_code 获取错误属性
        retryable, category, user_message, default_retry_after = get_error_attributes(error_code)
        response["retryable"] = retryable
        if category != 'unknown':
            response["category"] = category
        # 设置 retry_after
        if retry_after is not None:
            response["retry_after"] = retry_after
        elif default_retry_after is not None:
            response["retry_after"] = default_retry_after
    
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
                         error_code: int = None, data: Optional[Any] = None,
                         trace_id: str = None, retry_after: int = None):
    """
    生成Flask的JSON错误响应
    
    Args:
        message (str): 错误消息，默认为"操作失败"
        code (int): HTTP状态码，默认为400
        error_code (int): 业务错误码（可选）
        data (Any, optional): 额外的错误数据，默认为None
        trace_id (str, optional): 请求追踪ID，默认自动生成
        retry_after (int, optional): 建议重试等待秒数
        
    Returns:
        Response: Flask的JSON响应对象
    """
    response_data = error_response(message, code, error_code, data, trace_id, retry_after)
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
                 error_code: int = None, data: Any = None,
                 retryable: bool = None, retry_after: int = None):
        self.message = message
        self.code = code
        self.error_code = error_code
        self.data = data
        self.retryable = retryable
        self.retry_after = retry_after
        self.trace_id = get_current_trace_id() if hasattr(g, 'trace_id') else generate_trace_id()
        super().__init__(self.message)
    
    def to_response(self):
        """转换为响应对象"""
        return flask_error_response(
            self.message, 
            self.code, 
            self.error_code, 
            self.data,
            self.trace_id,
            self.retry_after
        )
    
    def get_retryable(self) -> bool:
        """获取是否可重试"""
        if self.retryable is not None:
            return self.retryable
        if self.error_code is not None:
            retryable, _, _, _ = get_error_attributes(self.error_code)
            return retryable
        return False


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


class RateLimitedError(APIError):
    """限流错误 - 可重试"""
    
    def __init__(self, message: str = "请求过于频繁，请稍后重试", retry_after: int = 3):
        super().__init__(
            message=message,
            code=429,
            error_code=ErrorCode.RATE_LIMITED,
            retryable=True,
            retry_after=retry_after
        )


class DatabaseError(APIError):
    """数据库错误 - 可重试"""
    
    def __init__(self, message: str = "数据库错误", operation: str = None):
        super().__init__(
            message=message,
            code=500,
            error_code=ErrorCode.DATABASE_ERROR,
            retryable=True,
            retry_after=2,
            data={"operation": operation} if operation else None
        )


class TimeoutError(APIError):
    """超时错误 - 可重试"""
    
    def __init__(self, message: str = "请求超时", timeout_seconds: float = None):
        super().__init__(
            message=message,
            code=504,
            error_code=ErrorCode.TIMEOUT_ERROR,
            retryable=True,
            retry_after=2,
            data={"timeout_seconds": timeout_seconds} if timeout_seconds else None
        )


class ResourceConflictError(APIError):
    """资源冲突错误 - 可重试"""
    
    def __init__(self, message: str = "资源冲突，请重试", resource_type: str = None):
        super().__init__(
            message=message,
            code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            retryable=True,
            retry_after=1,
            data={"resource_type": resource_type} if resource_type else None
        )


# --- 错误处理装饰器 ---
def handle_errors(f):
    """
    统一错误处理装饰器
    自动捕获异常并返回统一格式的错误响应，记录详细上下文日志
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # 确保有 trace_id
        trace_id = get_current_trace_id()
        start_time = time.time()
        
        # 获取请求上下文
        request_info = {}
        try:
            if request:
                request_info = {
                    'method': request.method,
                    'path': request.path,
                    'endpoint': request.endpoint,
                    'ip': request.remote_addr,
                    'user_agent': request.user_agent.string[:100] if request.user_agent else None
                }
        except Exception:
            pass
        
        try:
            return f(*args, **kwargs)
        except APIError as e:
            duration_ms = int((time.time() - start_time) * 1000)
            logger.warning(
                f"API Error in {f.__name__}: {e.message}",
                extra={
                    'trace_id': e.trace_id,
                    'error_code': e.error_code,
                    'duration_ms': duration_ms,
                    **request_info
                }
            )
            return e.to_response()
        except ValueError as e:
            duration_ms = int((time.time() - start_time) * 1000)
            logger.warning(
                f"Validation Error in {f.__name__}: {str(e)}",
                extra={
                    'trace_id': trace_id,
                    'duration_ms': duration_ms,
                    **request_info
                }
            )
            return flask_error_response(str(e), 400, ErrorCode.VALIDATION_ERROR)
        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            logger.error(
                f"Unexpected Error in {f.__name__}: {str(e)}",
                extra={
                    'trace_id': trace_id,
                    'duration_ms': duration_ms,
                    'error_type': type(e).__name__,
                    **request_info
                }
            )
            logger.error(traceback.format_exc())
            
            # 生产环境不暴露具体错误信息
            try:
                is_debug = current_app.config.get('DEBUG')
            except Exception:
                is_debug = False
            
            if is_debug:
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