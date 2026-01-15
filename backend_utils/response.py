# -*- coding: utf-8 -*-
"""
统一响应格式工具模块
提供标准化的API响应格式，包括成功响应、错误响应和分页响应
"""

from typing import Any, Optional, Dict, Union
from flask import jsonify


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


def error_response(message: str = "操作失败", code: int = 400, data: Any = None) -> dict:
    """
    生成统一的错误响应格式
    """
    return {
        "success": False,
        "message": message,
        "code": code,
        "data": data if data is not None else {}
    }


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


def flask_error_response(message: str = "操作失败", code: int = 400, data: Optional[Any] = None):
    """
    生成Flask的JSON错误响应
    
    Args:
        message (str): 错误消息，默认为"操作失败"
        code (int): HTTP状态码，默认为400
        data (Any, optional): 额外的错误数据，默认为None
        
    Returns:
        Response: Flask的JSON响应对象
    """
    response_data = error_response(message, code, data)
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
