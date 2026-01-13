# -*- coding: utf-8 -*-
"""
统一响应格式工具模块
提供标准化的API响应格式，包括成功响应、错误响应和分页响应
"""

from typing import Any, Optional, Dict, Union
from flask import jsonify


def success_response(data: Optional[Any] = None, message: str = "操作成功", code: int = 200) -> dict:
    """
    生成统一的成功响应格式
    
    Args:
        data (Any, optional): 返回的数据内容，默认为None
        message (str): 响应消息，默认为"操作成功"
        code (int): HTTP状态码，默认为200
        
    Returns:
        dict: 标准化的成功响应字典
        
    Example:
        >>> success_response({"user_id": 123}, "用户创建成功")
        {
            "success": True,
            "message": "用户创建成功",
            "data": {"user_id": 123},
            "code": 200
        }
    """
    response = {
        "success": True,
        "message": message,
        "code": code
    }
    
    # 只有当data不为None时才添加到响应中
    if data is not None:
        response["data"] = data
        
    return response


def error_response(message: str = "操作失败", code: int = 400, data: Optional[Any] = None) -> dict:
    """
    生成统一的错误响应格式
    
    Args:
        message (str): 错误消息，默认为"操作失败"
        code (int): HTTP状态码，默认为400
        data (Any, optional): 额外的错误数据，默认为None
        
    Returns:
        dict: 标准化的错误响应字典
        
    Example:
        >>> error_response("用户不存在", 404)
        {
            "success": False,
            "message": "用户不存在",
            "code": 404
        }
    """
    response = {
        "success": False,
        "message": message,
        "code": code
    }
    
    # 只有当data不为None时才添加到响应中
    if data is not None:
        response["data"] = data
        
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
    
    Args:
        data (list): 当前页的数据列表
        page (int): 当前页码
        per_page (int): 每页数据条数
        total (int): 数据总条数
        message (str): 响应消息，默认为"获取成功"
        
    Returns:
        dict: 标准化的分页响应字典
        
    Example:
        >>> paginated_response([{"id": 1}, {"id": 2}], 1, 10, 100)
        {
            "success": True,
            "message": "获取成功",
            "data": {
                "items": [{"id": 1}, {"id": 2}],
                "pagination": {
                    "page": 1,
                    "per_page": 10,
                    "total": 100,
                    "pages": 10
                }
            },
            "code": 200
        }
    """
    # 计算总页数
    total_pages = (total + per_page - 1) // per_page
    
    response = {
        "success": True,
        "message": message,
        "data": {
            "items": data,
            "total": total,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": total,
                "pages": total_pages
            }
        },
        "code": 200
    }
    
    return response


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
