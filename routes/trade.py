# -*- coding: utf-8 -*-
"""
交易管理路由
提供交易相关的查询和管理功能
"""
from flask import Blueprint, request, jsonify, current_app
from backend_utils.response import flask_success_response, flask_error_response
from bson import ObjectId
from datetime import datetime

trade_bp = Blueprint('trade', __name__)

@trade_bp.route('/positions', methods=['GET'])
def get_positions():
    """获取持仓列表"""
    try:
        db = current_app.db
        if not db:
            return flask_error_response('数据库未连接', code=503)
        
        page = int(request.args.get('page', 1))
        page_size = int(request.args.get('pageSize', 10))
        
        # 构建查询条件
        query = {}
        customer_id = request.args.get('customerId')
        if customer_id:
            query['customerId'] = customer_id
        
        # 执行查询
        collection = db['positions']
        total = collection.count_documents(query)
        
        positions = list(collection.find(query)
                        .sort('createdAt', -1)
                        .skip((page - 1) * page_size)
                        .limit(page_size))
        
        # 格式化响应
        items = []
        for position in positions:
            items.append({
                '_id': str(position['_id']),
                'productCode': position.get('productCode', ''),
                'productName': position.get('productName', ''),
                'customerId': position.get('customerId', ''),
                'customerName': position.get('customerName', ''),
                'quantity': position.get('quantity', 0),
                'price': position.get('price', 0),
                'marketValue': position.get('marketValue', 0),
                'profitLoss': position.get('profitLoss', 0),
                'status': position.get('status', 'active'),
                'createdAt': position.get('createdAt', datetime.now()).isoformat(),
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
            message='获取持仓列表成功'
        )
    except Exception as e:
        current_app.logger.error(f'获取持仓列表失败: {e}')
        return flask_error_response(str(e), code=500)

@trade_bp.route('/positions/statistics', methods=['GET'])
def get_position_statistics():
    """获取持仓统计数据"""
    try:
        db = current_app.db
        if not db:
            return flask_error_response('数据库未连接', code=503)
        
        collection = db['positions']
        
        # 计算总持仓市值
        market_value_pipeline = [
            {'$match': {'status': 'active'}},
            {'$group': {'_id': None, 'total': {'$sum': '$marketValue'}}}
        ]
        mv_result = list(collection.aggregate(market_value_pipeline))
        total_market_value = mv_result[0]['total'] if mv_result else 0
        
        # 计算总盈亏
        profit_loss_pipeline = [
            {'$match': {'status': 'active'}},
            {'$group': {'_id': None, 'total': {'$sum': '$profitLoss'}}}
        ]
        pl_result = list(collection.aggregate(profit_loss_pipeline))
        total_profit_loss = pl_result[0]['total'] if pl_result else 0
        
        # 计算持仓数量
        total_count = collection.count_documents({'status': 'active'})
        
        return flask_success_response(
            data={
                'totalMarketValue': total_market_value,
                'totalProfitLoss': total_profit_loss,
                'totalCount': total_count,
            },
            message='获取持仓统计成功'
        )
    except Exception as e:
        current_app.logger.error(f'获取持仓统计失败: {e}')
        return flask_error_response(str(e), code=500)
