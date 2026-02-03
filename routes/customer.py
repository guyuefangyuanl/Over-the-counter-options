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

customer_bp = Blueprint('customer', __name__)

@customer_bp.route('/customers', methods=['GET'])
@require_auth
def get_customers():
    """获取客户列表"""
    try:
        db = current_app.db
        if not db:
            return flask_error_response('数据库未连接', code=503)
        
        page = int(request.args.get('page', 1))
        page_size = int(request.args.get('pageSize', 10))
        
        # 构建查询条件
        query = {}
        status = request.args.get('status')
        if status:
            query['status'] = status
        
        # 执行查询
        collection = db['customers']
        total = collection.count_documents(query)
        
        customers = list(collection.find(query)
                        .sort('createdAt', -1)
                        .skip((page - 1) * page_size)
                        .limit(page_size))
        
        # 格式化响应
        items = []
        for customer in customers:
            items.append({
                '_id': str(customer['_id']),
                'name': customer.get('name', ''),
                'phone': customer.get('phone', ''),
                'email': customer.get('email', ''),
                'status': customer.get('status', 'active'),
                'groupName': customer.get('groupName', ''),
                'totalOrders': customer.get('totalOrders', 0),
                'createdAt': customer.get('createdAt', datetime.now()).isoformat(),
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
        db = current_app.db
        if not db:
            return flask_error_response('数据库未连接', code=503)
        
        collection = db['customers']
        customer = collection.find_one({'_id': ObjectId(customer_id)})
        
        if not customer:
            return flask_error_response('客户不存在', code=404)
        
        return flask_success_response(
            data={
                '_id': str(customer['_id']),
                'name': customer.get('name', ''),
                'phone': customer.get('phone', ''),
                'email': customer.get('email', ''),
                'status': customer.get('status', 'active'),
                'groupName': customer.get('groupName', ''),
                'totalOrders': customer.get('totalOrders', 0),
                'createdAt': customer.get('createdAt', datetime.now()).isoformat(),
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
        db = current_app.db
        if not db:
            return flask_error_response('数据库未连接', code=503)
        
        data = request.json
        
        # 验证必填字段
        required_fields = ['name', 'phone']
        for field in required_fields:
            if field not in data:
                return flask_error_response(f'缺少必填字段: {field}', code=400)
        
        # 检查手机号是否已存在
        collection = db['customers']
        existing = collection.find_one({'phone': data['phone']})
        if existing:
            return flask_error_response('该手机号已存在', code=400)
        
        # 创建客户记录
        customer = {
            'name': data['name'],
            'phone': data['phone'],
            'email': data.get('email', ''),
            'status': data.get('status', 'active'),
            'groupName': data.get('groupName', ''),
            'totalOrders': 0,
            'createdAt': datetime.now(),
            'updatedAt': datetime.now(),
        }
        
        result = collection.insert_one(customer)
        
        return flask_success_response(
            data={'_id': str(result.inserted_id)},
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
        db = current_app.db
        if not db:
            return flask_error_response('数据库未连接', code=503)
        
        data = request.json
        update_data = {
            'updatedAt': datetime.now()
        }
        
        # 更新允许的字段
        allowed_fields = ['name', 'phone', 'email', 'status', 'groupName']
        for field in allowed_fields:
            if field in data:
                update_data[field] = data[field]
        
        collection = db['customers']
        result = collection.update_one(
            {'_id': ObjectId(customer_id)},
            {'$set': update_data}
        )
        
        if result.matched_count == 0:
            return flask_error_response('客户不存在', code=404)
        
        return flask_success_response(message='更新客户信息成功')
    except Exception as e:
        current_app.logger.error(f'更新客户信息失败: {e}')
        return flask_error_response(str(e), code=500)

@customer_bp.route('/customer-groups', methods=['GET'])
@require_auth
def get_customer_groups():
    """获取客户分组列表"""
    try:
        db = current_app.db
        if not db:
            return flask_error_response('数据库未连接', code=503)
        
        collection = db['customers']
        groups = collection.distinct('groupName', {'groupName': {'$ne': ''}})
        
        return flask_success_response(
            data={'groups': groups},
            message='获取客户分组成功'
        )
    except Exception as e:
        current_app.logger.error(f'获取客户分组失败: {e}')
        return flask_error_response(str(e), code=500)
