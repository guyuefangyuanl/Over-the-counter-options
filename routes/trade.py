# -*- coding: utf-8 -*-
"""
交易管理路由
提供交易相关的查询和管理功能
"""
from flask import Blueprint, request, jsonify, current_app, g
from backend_utils.response import flask_success_response, flask_error_response, flask_paginated_response
from routes.auth import require_auth, require_roles
from services.trade_service import TradeService
from services.settlement_service import SettlementService
from services.risk_service import RiskService

trade_bp = Blueprint('trade', __name__)
trade_service = TradeService()
settlement_service = SettlementService()
risk_service = RiskService()

# --- Risk Routes ---
@trade_bp.route('/risk/check', methods=['POST'])
@require_auth
def check_risk():
    try:
        data = request.json
        amount = float(data.get('amount', 0))
        user_id = getattr(g, 'admin', {}).get('sub')
        
        # Get balance
        summary = trade_service.get_account_summary(user_id)
        balance = summary.get('balance', 0)
        
        passed, msg = risk_service.check_pre_trade_risk(user_id, amount, balance)
        return flask_success_response(data={"passed": passed, "message": msg})
    except Exception as e:
        return flask_error_response(str(e), 500)

@trade_bp.route('/risk/greeks', methods=['POST'])
@require_auth
def calculate_greeks():
    try:
        data = request.json
        # S, K, T, r, sigma
        S = float(data.get('S'))
        K = float(data.get('K'))
        T = float(data.get('T')) # Years
        r = float(data.get('r', 0.03))
        sigma = float(data.get('sigma', 0.2))
        type_ = data.get('type', 'call')
        
        greeks = risk_service.calculate_bs_greeks(S, K, T, r, sigma, type_)
        return flask_success_response(data=greeks)
    except Exception as e:
        return flask_error_response(str(e), 500)

# --- Settlement Routes ---
@trade_bp.route('/settlement/daily', methods=['POST'])
@require_auth
@require_roles('admin')
def trigger_daily_settlement():
    try:
        result = settlement_service.run_daily_settlement()
        return flask_success_response(data=result, message="每日结算完成")
    except Exception as e:
        return flask_error_response(str(e), 500)

# --- Existing Routes ---

@trade_bp.route('/positions', methods=['GET'])
@require_auth
def get_positions():
    """获取持仓列表"""
    try:
        # 权限控制
        current_user = getattr(g, 'admin', {})
        role = current_user.get('role')
        user_id = current_user.get('sub') # openid

        page = request.args.get('page', 1, type=int)
        page_size = request.args.get('pageSize', 10, type=int)
        
        customer_id = None
        if role == 'user':
            customer_id = user_id
        else:
            customer_id = request.args.get('customerId')
            
        items, total = trade_service.get_positions(limit=page_size, page=page, customer_id=customer_id)
        
        return flask_paginated_response(
            data=items,
            page=page,
            per_page=page_size,
            total=total,
            message='获取持仓列表成功'
        )
    except Exception as e:
        current_app.logger.error(f'获取持仓列表失败: {e}')
        return flask_error_response(str(e), code=500)

@trade_bp.route('/positions', methods=['POST'])
@require_auth
def create_position():
    """创建持仓（用户可自助录入，管理员可为任意客户创建）"""
    try:
        data = request.json
        if not data:
            return flask_error_response("数据为空", 400)

        current_user = getattr(g, 'admin', {})
        role = current_user.get('role')

        # 普通用户只能给自己录入持仓，强制覆盖 customerId 防止越权
        if role == 'user':
            data['customerId'] = current_user.get('sub')
            data['customerName'] = current_user.get('nickname') or current_user.get('username') or '用户'
        # admin/manager 可以在请求体中指定任意 customerId

        position_id = trade_service.create_position(data)
        if position_id:
            return flask_success_response(data={"id": position_id}, message="持仓创建成功")
        else:
            return flask_error_response("持仓创建失败", 500)
    except ValueError as ve:
        return flask_error_response(str(ve), 400)
    except Exception as e:
        current_app.logger.error(f'创建持仓失败: {e}')
        return flask_error_response(str(e), 500)

@trade_bp.route('/positions/<position_id>', methods=['PUT'])
@require_auth
def update_position(position_id):
    """更新持仓 - 用户只能修改自己的持仓，管理员可修改所有"""
    try:
        current_user = getattr(g, 'admin', {})
        role = current_user.get('role')
        user_id = current_user.get('sub')

        # 获取持仓验证权限
        position = trade_service.get_position_by_id(position_id)
        if not position:
            return flask_error_response("持仓不存在", 404)

        # 权限检查：admin可操作所有，user只能操作自己的
        if role == 'user' and position.get('customerId') != user_id:
            return flask_error_response("无权操作此持仓", 403)

        data = request.json
        success = trade_service.update_position(position_id, data)
        if success:
            return flask_success_response(message="持仓更新成功")
        else:
            return flask_error_response("持仓更新失败", 500)
    except Exception as e:
        current_app.logger.error(f'更新持仓失败: {e}')
        return flask_error_response(str(e), 500)

@trade_bp.route('/positions/<position_id>', methods=['DELETE'])
@require_auth
def delete_position(position_id):
    """删除持仓 - 用户只能删除自己的持仓，管理员可删除所有"""
    try:
        current_user = getattr(g, 'admin', {})
        role = current_user.get('role')
        user_id = current_user.get('sub')

        # 获取持仓验证权限
        position = trade_service.get_position_by_id(position_id)
        if not position:
            return flask_error_response("持仓不存在", 404)

        # 权限检查：admin可操作所有，user只能操作自己的
        if role == 'user' and position.get('customerId') != user_id:
            return flask_error_response("无权操作此持仓", 403)

        success = trade_service.delete_position(position_id)
        if success:
            return flask_success_response(message="持仓删除成功")
        else:
            return flask_error_response("持仓删除失败", 500)
    except Exception as e:
        current_app.logger.error(f'删除持仓失败: {e}')
        return flask_error_response(str(e), 500)

@trade_bp.route('/positions/<position_id>', methods=['GET'])
@require_auth
def get_position_detail(position_id):
    """获取单个持仓详情"""
    try:
        current_user = getattr(g, 'admin', {})
        role = current_user.get('role')
        user_id = current_user.get('sub')

        position = trade_service.get_position_by_id(position_id)
        if not position:
            return flask_error_response("持仓不存在", 404)

        # 权限检查：admin可查看所有，user只能查看自己的
        if role == 'user' and position.get('customerId') != user_id:
            return flask_error_response("无权查看此持仓", 403)

        return flask_success_response(data=position, message='获取持仓详情成功')
    except Exception as e:
        current_app.logger.error(f'获取持仓详情失败: {e}')
        return flask_error_response(str(e), 500)

@trade_bp.route('/positions/<position_id>/close', methods=['POST'])
@require_auth
def close_position(position_id):
    """平仓操作 - 支持平仓记账和平仓下单"""
    try:
        current_user = getattr(g, 'admin', {})
        role = current_user.get('role')
        user_id = current_user.get('sub')

        # 获取持仓验证权限
        position = trade_service.get_position_by_id(position_id)
        if not position:
            return flask_error_response("持仓不存在", 404)

        # 权限检查：admin可操作所有，user只能操作自己的
        if role == 'user' and position.get('customerId') != user_id:
            return flask_error_response("无权操作此持仓", 403)

        data = request.json or {}
        close_price = data.get('closePrice')
        close_type = data.get('closeType', 'accounting')  # accounting 或 order

        if close_price is None:
            return flask_error_response("平仓价格不能为空", 400)

        try:
            close_price = float(close_price)
        except (TypeError, ValueError):
            return flask_error_response("平仓价格格式错误", 400)

        success = trade_service.close_position(position_id, close_price, close_type)
        if success:
            # 计算并返回平仓盈亏
            quantity = float(position.get('quantity', 0))
            cost_price = float(position.get('price', 0))
            profit_loss = (close_price - cost_price) * quantity if cost_price > 0 else 0

            return flask_success_response(
                data={
                    'profitLoss': profit_loss,
                    'closeType': close_type
                },
                message="平仓成功"
            )
        else:
            return flask_error_response("平仓失败", 500)
    except ValueError as ve:
        return flask_error_response(str(ve), 400)
    except Exception as e:
        current_app.logger.error(f'平仓操作失败: {e}')
        return flask_error_response(str(e), 500)

@trade_bp.route('/positions/statistics', methods=['GET'])
@require_auth
def get_position_statistics():
    """获取持仓统计数据"""
    try:
        current_user = getattr(g, 'admin', {})
        role = current_user.get('role')
        user_id = current_user.get('sub')

        customer_id = None
        if role == 'user':
            customer_id = user_id
        else:
            customer_id = request.args.get('customerId')
            
        stats = trade_service.get_position_statistics(customer_id)
        return flask_success_response(data=stats, message='获取持仓统计成功')
    except Exception as e:
        current_app.logger.error(f'获取持仓统计失败: {e}')
        return flask_error_response(str(e), code=500)

@trade_bp.route('/positions/seed', methods=['POST'])
@require_auth
def seed_positions():
    """生成测试持仓数据"""
    try:
        current_user = getattr(g, 'admin', {})
        user_id = current_user.get('sub')
        
        success = trade_service.seed_positions(user_id)
        if success:
            return flask_success_response(message="已生成测试持仓数据")
        else:
            return flask_error_response("生成失败", 500)
    except Exception as e:
        return flask_error_response(str(e), 500)

# --- Order Routes ---

@trade_bp.route('/orders', methods=['GET'])
@require_auth
def get_orders():
    """获取订单列表"""
    try:
        current_user = getattr(g, 'admin', {})
        role = current_user.get('role')
        user_id = current_user.get('sub')
        
        page = request.args.get('page', 1, type=int)
        page_size = request.args.get('pageSize', 10, type=int)
        status = request.args.get('status')
        
        target_user_id = None
        if role == 'user':
            target_user_id = user_id
        else:
            target_user_id = request.args.get('customerId') # Admin can filter by customer
            
        items, total = trade_service.get_orders(limit=page_size, page=page, status=status, user_id=target_user_id)
        
        return flask_paginated_response(
            data=items,
            page=page,
            per_page=page_size,
            total=total
        )
    except Exception as e:
        current_app.logger.error(f'获取订单列表失败: {e}')
        return flask_error_response(str(e), 500)

@trade_bp.route('/orders', methods=['POST'])
@require_auth
def create_order():
    """创建订单"""
    try:
        data = request.json
        if not data:
            return flask_error_response("数据为空", 400)
            
        current_user = getattr(g, 'admin', {})
        # Attach user info if not present
        if 'openid' not in data:
            data['openid'] = current_user.get('sub')
            
        order_id = trade_service.create_order(data)
        if order_id:
            return flask_success_response(data={"id": order_id}, message="订单创建成功")
        else:
            return flask_error_response("订单创建失败", 500)
    except Exception as e:
        current_app.logger.error(f'创建订单失败: {e}')
        return flask_error_response(str(e), 500)

@trade_bp.route('/orders/<order_id>/status', methods=['PUT'])
@require_auth
def update_order_status(order_id):
    """更新订单状态"""
    try:
        data = request.json
        status = data.get('status')
        if not status:
            return flask_error_response("状态为空", 400)
            
        success = trade_service.update_order_status(order_id, status)
        if success:
            return flask_success_response(message="状态更新成功")
        else:
            return flask_error_response("状态更新失败", 500)
    except Exception as e:
        current_app.logger.error(f'更新订单状态失败: {e}')
        return flask_error_response(str(e), 500)

# --- Account & Funds Routes ---

@trade_bp.route('/account', methods=['GET'])
@require_auth
def get_account_info():
    """获取账户资产信息"""
    try:
        current_user = getattr(g, 'admin', {})
        user_id = current_user.get('sub')
        
        summary = trade_service.get_account_summary(user_id)
        return flask_success_response(data=summary)
    except Exception as e:
        return flask_error_response(str(e), 500)

@trade_bp.route('/account/deposit', methods=['POST'])
@require_auth
def deposit_funds():
    """充值"""
    try:
        current_user = getattr(g, 'admin', {})
        user_id = current_user.get('sub')
        data = request.json
        amount = float(data.get('amount', 0))
        
        if amount <= 0:
            return flask_error_response("金额必须大于0", 400)
            
        new_balance = trade_service.deposit(user_id, amount)
        return flask_success_response(data={"balance": new_balance}, message="充值成功")
    except Exception as e:
        return flask_error_response(str(e), 500)

@trade_bp.route('/account/withdraw', methods=['POST'])
@require_auth
def withdraw_funds():
    """提现"""
    try:
        current_user = getattr(g, 'admin', {})
        user_id = current_user.get('sub')
        data = request.json
        amount = float(data.get('amount', 0))
        
        if amount <= 0:
            return flask_error_response("金额必须大于0", 400)
            
        try:
            new_balance = trade_service.withdraw(user_id, amount)
            return flask_success_response(data={"balance": new_balance}, message="提现成功")
        except ValueError as ve:
            return flask_error_response(str(ve), 400)
    except Exception as e:
        return flask_error_response(str(e), 500)

@trade_bp.route('/account/transactions', methods=['GET'])
@require_auth
def get_transactions():
    """获取资金流水"""
    try:
        current_user = getattr(g, 'admin', {})
        user_id = current_user.get('sub')
        page = request.args.get('page', 1, type=int)
        
        items, total = trade_service.get_transactions(user_id, page=page)
        return flask_paginated_response(items, page, 20, total)
    except Exception as e:
        return flask_error_response(str(e), 500)
