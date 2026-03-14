# -*- coding: utf-8 -*-
"""
费用管理路由
提供费用查询、统计等功能
"""
from flask import Blueprint, request, jsonify, current_app
from backend_utils.response import flask_success_response, flask_error_response
from bson import ObjectId
from datetime import datetime

fee_bp = Blueprint('fee', __name__)

@fee_bp.route('/fees', methods=['GET'])
def get_fees():
    """获取费用列表"""
    try:
        db = current_app.db
        if not db:
            return flask_error_response('数据库未连接', code=503)
        
        page = int(request.args.get('page', 1))
        page_size = int(request.args.get('pageSize', 10))
        
        # 构建查询条件
        query = {}
        fee_type = request.args.get('feeType')
        if fee_type:
            query['feeType'] = fee_type
        
        # 执行查询
        collection = db['fees']
        total = collection.count_documents(query)
        
        fees = list(collection.find(query)
                   .sort('createdAt', -1)
                   .skip((page - 1) * page_size)
                   .limit(page_size))
        
        # 格式化响应
        items = []
        for fee in fees:
            items.append({
                '_id': str(fee['_id']),
                'feeType': fee.get('feeType', ''),
                'amount': fee.get('amount', 0),
                'customerId': fee.get('customerId', ''),
                'customerName': fee.get('customerName', ''),
                'orderId': fee.get('orderId'),
                'status': fee.get('status', 'pending'),
                'description': fee.get('description', ''),
                'createdAt': fee.get('createdAt', datetime.now()).isoformat(),
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
            message='获取费用列表成功'
        )
    except Exception as e:
        current_app.logger.error(f'获取费用列表失败: {e}')
        return flask_error_response(str(e), code=500)

@fee_bp.route('/fees/statistics', methods=['GET'])
def get_fee_statistics():
    """获取费用统计数据"""
    try:
        db = current_app.db
        if not db:
            return flask_error_response('数据库未连接', code=503)
        
        collection = db['fees']
        
        # 计算总收费
        total_pipeline = [
            {'$match': {'status': 'paid'}},
            {'$group': {'_id': None, 'total': {'$sum': '$amount'}}}
        ]
        total_result = list(collection.aggregate(total_pipeline))
        total_amount = total_result[0]['total'] if total_result else 0
        
        # 计算本月收费
        from datetime import datetime, timedelta
        month_start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_pipeline = [
            {'$match': {'status': 'paid', 'createdAt': {'$gte': month_start}}},
            {'$group': {'_id': None, 'total': {'$sum': '$amount'}}}
        ]
        month_result = list(collection.aggregate(month_pipeline))
        month_amount = month_result[0]['total'] if month_result else 0
        
        # 计算待收款
        pending_pipeline = [
            {'$match': {'status': 'pending'}},
            {'$group': {'_id': None, 'total': {'$sum': '$amount'}}}
        ]
        pending_result = list(collection.aggregate(pending_pipeline))
        pending_amount = pending_result[0]['total'] if pending_result else 0
        
        return flask_success_response(
            data={
                'totalAmount': total_amount,
                'monthAmount': month_amount,
                'pendingAmount': pending_amount,
            },
            message='获取费用统计成功'
        )
    except Exception as e:
        current_app.logger.error(f'获取费用统计失败: {e}')
        return flask_error_response(str(e), code=500)

@fee_bp.route('/fees', methods=['POST'])
def create_fee():
    """创建费用记录"""
    try:
        db = current_app.db
        if not db:
            return flask_error_response('数据库未连接', code=503)
        
        data = request.json
        
        # 验证必填字段
        required_fields = ['feeType', 'amount', 'customerId', 'customerName']
        for field in required_fields:
            if field not in data:
                return flask_error_response(f'缺少必填字段: {field}', code=400)
        
        # 创建费用记录
        fee = {
            'feeType': data['feeType'],
            'amount': float(data['amount']),
            'customerId': data['customerId'],
            'customerName': data['customerName'],
            'orderId': data.get('orderId'),
            'status': data.get('status', 'pending'),
            'description': data.get('description', ''),
            'createdAt': datetime.now(),
            'updatedAt': datetime.now(),
        }
        
        collection = db['fees']
        result = collection.insert_one(fee)
        
        return flask_success_response(
            data={'_id': str(result.inserted_id)},
            message='创建费用记录成功'
        )
    except Exception as e:
        current_app.logger.error(f'创建费用记录失败: {e}')
        return flask_error_response(str(e), code=500)
