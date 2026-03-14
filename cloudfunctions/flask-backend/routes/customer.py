# -*- coding: utf-8 -*-
"""
客户管理路由
提供客户信息查询、管理等功能
"""
from flask import Blueprint, request, jsonify, current_app
from backend_utils.response import flask_success_response, flask_error_response
from bson import ObjectId
from datetime import datetime
from routes.auth import require_auth, require_roles
from models.customer import CustomerModel

customer_bp = Blueprint('customer', __name__)

def get_model():
    ensure_db = getattr(current_app, "ensure_db", None)
    db = None
    if callable(ensure_db):
        db = ensure_db()
    if db is None:
        db = getattr(current_app, "db", None)
    
    cloud_db = getattr(current_app, "cloud_db", None)
    return CustomerModel(db, cloud_client=cloud_db)

@customer_bp.route('/customers', methods=['GET'])
@require_auth
def get_customers():
    """获取客户列表"""
    try:
        model = get_model()
        if not model.db and not model.cloud_client:
            return flask_error_response('数据库未连接', code=503)
        
        page = int(request.args.get('page', 1))
        page_size = int(request.args.get('pageSize', 10))
        status = request.args.get('status')
        keyword = request.args.get('keyword')
        
        customers, total = model.get_customers(page, page_size, status, keyword)
        
        # 格式化响应
        items = []
        for customer in customers:
            items.append({
                '_id': customer['_id'],
                'name': customer.get('name', ''),
                'phone': customer.get('phone', ''),
                'email': customer.get('email', ''),
                'status': customer.get('status', 'active'),
                'groupName': customer.get('groupName', ''),
                'totalOrders': customer.get('totalOrders', 0),
                'createdAt': customer.get('createdAt'),
            })
        
        return flask_success_response(
            data={
                'items': items,
                'pagination': {
                    'page': page,
                    'per_page': page_size,
                    'total': total,
                }
            },
            message='获取客户列表成功'
        )
    except Exception as e:
        current_app.logger.error(f'获取客户列表失败: {e}')
        return flask_error_response(str(e), code=500)

@customer_bp.route('/customers/<customer_id>', methods=['GET'])
@require_auth
def get_customer(customer_id):
    """获取客户详情"""
    try:
        model = get_model()
        if not model.db and not model.cloud_client:
            return flask_error_response('数据库未连接', code=503)
        
        customer = model.get_customer_by_id(customer_id)
        
        if not customer:
            return flask_error_response('客户不存在', code=404)
        
        return flask_success_response(
            data={
                '_id': customer['_id'],
                'name': customer.get('name', ''),
                'phone': customer.get('phone', ''),
                'email': customer.get('email', ''),
                'status': customer.get('status', 'active'),
                'groupName': customer.get('groupName', ''),
                'totalOrders': customer.get('totalOrders', 0),
                'createdAt': customer.get('createdAt'),
            },
            message='获取客户详情成功'
        )
    except Exception as e:
        current_app.logger.error(f'获取客户详情失败: {e}')
        return flask_error_response(str(e), code=500)

@customer_bp.route('/customers', methods=['POST'])
@require_auth
@require_roles("admin", "editor")
def create_customer():
    """创建客户"""
    try:
        model = get_model()
        if not model.db and not model.cloud_client:
            return flask_error_response('数据库未连接', code=503)
        
        data = request.json
        
        # 验证必填字段
        required_fields = ['name', 'phone']
        for field in required_fields:
            if field not in data:
                return flask_error_response(f'缺少必填字段: {field}', code=400)
        
        try:
            customer_id = model.create_customer(data)
        except ValueError as e:
            return flask_error_response(str(e), code=400)
            
        return flask_success_response(
            data={'_id': customer_id},
            message='创建客户成功'
        )
    except Exception as e:
        current_app.logger.error(f'创建客户失败: {e}')
        return flask_error_response(str(e), code=500)

@customer_bp.route('/customers/<customer_id>', methods=['PUT'])
@require_auth
@require_roles("admin", "editor")
def update_customer(customer_id):
    """更新客户信息"""
    try:
        model = get_model()
        if not model.db and not model.cloud_client:
            return flask_error_response('数据库未连接', code=503)
        
        data = request.json
        success = model.update_customer(customer_id, data)
        
        if not success:
            return flask_error_response('客户不存在或更新失败', code=404)
        
        return flask_success_response(message='更新客户信息成功')
    except Exception as e:
        current_app.logger.error(f'更新客户信息失败: {e}')
        return flask_error_response(str(e), code=500)

@customer_bp.route('/customers/<customer_id>', methods=['DELETE'])
@require_auth
@require_roles("admin")
def delete_customer(customer_id):
    """删除客户"""
    try:
        model = get_model()
        if not model.db and not model.cloud_client:
            return flask_error_response('数据库未连接', code=503)
            
        success = model.delete_customer(customer_id)
        
        if not success:
            return flask_error_response('客户不存在或删除失败', code=404)
            
        return flask_success_response(message='删除客户成功')
    except Exception as e:
        current_app.logger.error(f'删除客户失败: {e}')
        return flask_error_response(str(e), code=500)

@customer_bp.route('/customer-groups', methods=['GET'])
@require_auth
def get_customer_groups():
    """获取客户分组列表"""
    try:
        model = get_model()
        if not model.db and not model.cloud_client:
            return flask_error_response('数据库未连接', code=503)
        
        groups = model.get_customer_groups()
        
        return flask_success_response(
            data={'groups': groups},
            message='获取客户分组成功'
        )
    except Exception as e:
        current_app.logger.error(f'获取客户分组失败: {e}')
        return flask_error_response(str(e), code=500)

@customer_bp.route('/customer-groups/<group_name>', methods=['PUT'])
@require_auth
@require_roles("admin", "editor")
def rename_customer_group(group_name):
    """重命名客户分组"""
    try:
        model = get_model()
        if not model.db and not model.cloud_client:
            return flask_error_response('数据库未连接', code=503)
            
        data = request.json
        new_name = data.get('name')
        if not new_name:
            return flask_error_response('新分组名称不能为空', code=400)
            
        count = model.rename_group(group_name, new_name)
        
        return flask_success_response(
            data={'modified_count': count},
            message=f'已更新 {count} 个客户的分组'
        )
    except Exception as e:
        current_app.logger.error(f'重命名客户分组失败: {e}')
        return flask_error_response(str(e), code=500)
