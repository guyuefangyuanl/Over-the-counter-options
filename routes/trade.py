# -*- coding: utf-8 -*-
"""
交易管理路由
提供交易相关的查询和管理功能
"""
from flask import Blueprint, request, jsonify, current_app, g
from backend_utils.response import flask_success_response, flask_error_response
from bson import ObjectId
from datetime import datetime
from routes.auth import require_auth
import random

trade_bp = Blueprint('trade', __name__)

@trade_bp.route('/positions', methods=['GET'])
@require_auth
def get_positions():
    """获取持仓列表"""
    try:
        db = current_app.db
        if not db:
            return flask_error_response('数据库未连接', code=503)
        
        # 权限控制：普通用户只能看自己的
        current_user = getattr(g, 'admin', {})
        role = current_user.get('role')
        user_id = current_user.get('sub') # openid

        page = int(request.args.get('page', 1))
        page_size = int(request.args.get('pageSize', 10))
        
        # 构建查询条件
        query = {}
        
        if role == 'user':
            query['customerId'] = user_id
        else:
            # 管理员可以查看指定客户
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
@require_auth
def get_position_statistics():
    """获取持仓统计数据"""
    try:
        db = current_app.db
        if not db:
            return flask_error_response('数据库未连接', code=503)
        
        # 权限控制
        current_user = getattr(g, 'admin', {})
        role = current_user.get('role')
        user_id = current_user.get('sub')

        collection = db['positions']
        
        match_stage = {'status': 'active'}
        if role == 'user':
            match_stage['customerId'] = user_id
        else:
            cid = request.args.get('customerId')
            if cid:
                match_stage['customerId'] = cid

        # 计算总持仓市值
        market_value_pipeline = [
            {'$match': match_stage},
            {'$group': {'_id': None, 'total': {'$sum': '$marketValue'}}}
        ]
        mv_result = list(collection.aggregate(market_value_pipeline))
        total_market_value = mv_result[0]['total'] if mv_result else 0
        
        # 计算总盈亏
        profit_loss_pipeline = [
            {'$match': match_stage},
            {'$group': {'_id': None, 'total': {'$sum': '$profitLoss'}}}
        ]
        pl_result = list(collection.aggregate(profit_loss_pipeline))
        total_profit_loss = pl_result[0]['total'] if pl_result else 0
        
        # 计算持仓数量
        total_count = collection.count_documents(match_stage)
        
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

@trade_bp.route('/positions/seed', methods=['POST'])
@require_auth
def seed_positions():
    """生成测试持仓数据 (仅限开发测试使用)"""
    try:
        db = current_app.db
        if not db:
            return flask_error_response('数据库未连接', code=503)
            
        current_user = getattr(g, 'admin', {})
        user_id = current_user.get('sub')
        
        # 生成3条模拟数据
        products = [
            {'code': '510050', 'name': '上证50ETF'},
            {'code': '510300', 'name': '沪深300ETF'},
            {'code': '000001', 'name': '平安银行'}
        ]
        
        new_positions = []
        for i in range(3):
            prod = products[i]
            qty = random.randint(1, 10) * 1000
            price = round(random.uniform(2.0, 5.0), 3)
            mv = round(qty * price, 2)
            pl = round(mv * random.uniform(-0.1, 0.2), 2) # -10% to +20%
            
            doc = {
                'productCode': prod['code'],
                'productName': prod['name'],
                'customerId': user_id,
                'customerName': 'Test User',
                'quantity': qty,
                'price': price,
                'marketValue': mv,
                'profitLoss': pl,
                'status': 'active',
                'createdAt': datetime.now()
            }
            new_positions.append(doc)
            
        if new_positions:
            db['positions'].insert_many(new_positions)
            
        return flask_success_response(message="已生成测试持仓数据")
        
    except Exception as e:
        return flask_error_response(str(e), 500)
