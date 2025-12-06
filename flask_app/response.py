"""
统一响应格式工具
"""
from flask import jsonify
from datetime import datetime

def success_response(data=None, message="操作成功", code=200):
    """
    成功响应
    
    Args:
        data: 业务数据
        message: 提示信息
        code: 业务状态码
    
    Returns:
        JSON响应和HTTP状态码
    """
    return jsonify({
        "code": code,
        "success": True,
        "message": message,
        "data": data,
        "timestamp": datetime.utcnow().isoformat() + 'Z'
    }), 200

def error_response(message="操作失败", code=500, http_status=500):
    """
    错误响应
    
    Args:
        message: 错误信息
        code: 业务错误码
        http_status: HTTP状态码
    
    Returns:
        JSON响应和HTTP状态码
    """
    return jsonify({
        "code": code,
        "success": False,
        "message": message,
        "data": None,
        "timestamp": datetime.utcnow().isoformat() + 'Z'
    }), http_status

def paginate_response(items, total, page=1, page_size=10, message="获取成功"):
    """
    分页响应
    
    Args:
        items: 数据列表
        total: 总数
        page: 当前页
        page_size: 每页大小
        message: 提示信息
    
    Returns:
        JSON响应和HTTP状态码
    """
    import math
    
    return jsonify({
        "code": 200,
        "success": True,
        "message": message,
        "data": {
            "items": items,
            "pagination": {
                "total": total,
                "page": page,
                "pageSize": page_size,
                "totalPages": math.ceil(total / page_size) if page_size > 0 else 0
            }
        },
        "timestamp": datetime.utcnow().isoformat() + 'Z'
    }), 200
