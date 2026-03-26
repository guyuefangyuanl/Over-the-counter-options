"""
安全和交易增强API路由
"""

from flask import Blueprint, request, jsonify, g
from functools import wraps

# 导入服务
from services.security_enhanced_service import (
    ip_whitelist_service,
    login_history_service,
    require_ip_whitelist
)
from services.trade_enhanced_service import (
    trade_confirmation_service,
    reconciliation_service,
    trade_notification_service
)

# 创建蓝图
security_bp = Blueprint('security', __name__, url_prefix='/api/security')
trade_enhanced_bp = Blueprint('trade_enhanced', __name__, url_prefix='/api/trade')


# ==================== IP白名单API ====================

@security_bp.route('/whitelist', methods=['GET'])
def get_ip_whitelist():
    """获取IP白名单列表"""
    ip_type = request.args.get('type', 'admin')

    # 权限检查
    if not g.get('is_admin'):
        return jsonify({'success': False, 'error': '无权限'}), 403

    whitelist = ip_whitelist_service.get_whitelist(ip_type)

    return jsonify({
        'success': True,
        'data': whitelist
    })


@security_bp.route('/whitelist', methods=['POST'])
def add_ip_whitelist():
    """添加IP到白名单"""
    data = request.get_json()

    if not g.get('is_admin'):
        return jsonify({'success': False, 'error': '无权限'}), 403

    result = ip_whitelist_service.add_to_whitelist(
        ip_address=data.get('ip_address'),
        ip_type=data.get('type', 'admin'),
        description=data.get('description', ''),
        created_by=g.get('user_id', ''),
        expires_at=data.get('expires_at')
    )

    return jsonify(result)


@security_bp.route('/whitelist/<ip_address>', methods=['DELETE'])
def remove_ip_whitelist(ip_address):
    """从白名单移除IP"""
    ip_type = request.args.get('type', 'admin')

    if not g.get('is_admin'):
        return jsonify({'success': False, 'error': '无权限'}), 403

    result = ip_whitelist_service.remove_from_whitelist(ip_address, ip_type)

    return jsonify(result)


@security_bp.route('/check', methods=['POST'])
def check_ip():
    """检查IP是否在白名单中"""
    data = request.get_json()

    ip_address = data.get('ip_address', request.remote_addr)
    ip_type = data.get('type', 'admin')

    is_allowed = ip_whitelist_service.is_ip_allowed(ip_address, ip_type)

    return jsonify({
        'success': True,
        'data': {
            'ip_address': ip_address,
            'ip_type': ip_type,
            'is_allowed': is_allowed
        }
    })


# ==================== 登录历史API ====================

@security_bp.route('/login-history', methods=['GET'])
def get_login_history():
    """获取登录历史"""
    user_id = g.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'error': '未登录'}), 401

    limit = int(request.args.get('limit', 20))
    offset = int(request.args.get('offset', 0))

    history = login_history_service.get_login_history(user_id, limit, offset)

    return jsonify({
        'success': True,
        'data': history
    })


@security_bp.route('/active-sessions', methods=['GET'])
def get_active_sessions():
    """获取活跃会话"""
    user_id = g.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'error': '未登录'}), 401

    sessions = login_history_service.get_active_sessions(user_id)

    return jsonify({
        'success': True,
        'data': sessions
    })


@security_bp.route('/login-history/check', methods=['POST'])
def check_brute_force():
    """检查暴力破解风险"""
    data = request.get_json()
    user_id = data.get('user_id')

    if not user_id:
        return jsonify({'success': False, 'error': '缺少用户ID'}), 400

    ip_address = data.get('ip_address', request.remote_addr)

    result = login_history_service.check_brute_force(user_id, ip_address)

    return jsonify({
        'success': True,
        'data': result
    })


# ==================== 交易确认API ====================

@trade_enhanced_bp.route('/confirmations', methods=['POST'])
def create_confirmation():
    """创建交易确认请求"""
    data = request.get_json()
    user_id = g.get('user_id')

    if not user_id:
        return jsonify({'success': False, 'error': '未登录'}), 401

    result = trade_confirmation_service.create_confirmation(
        user_id=user_id,
        trade_id=data.get('trade_id'),
        confirm_type=data.get('confirm_type', 'trade_create'),
        trade_data=data.get('trade_data', {}),
        require_dual_confirm=data.get('require_dual_confirm', False)
    )

    return jsonify({
        'success': True,
        'data': result
    })


@trade_enhanced_bp.route('/confirmations/<confirm_id>/confirm', methods=['POST'])
def confirm_trade(confirm_id):
    """确认交易"""
    data = request.get_json()
    user_id = g.get('user_id')

    if not user_id:
        return jsonify({'success': False, 'error': '未登录'}), 401

    result = trade_confirmation_service.confirm(
        confirm_id=confirm_id,
        user_id=user_id,
        confirmation_method=data.get('method', 'password'),
        confirmation_data=data.get('data')
    )

    return jsonify(result)


@trade_enhanced_bp.route('/confirmations/<confirm_id>/reject', methods=['POST'])
def reject_trade(confirm_id):
    """拒绝交易"""
    data = request.get_json()
    user_id = g.get('user_id')

    if not user_id:
        return jsonify({'success': False, 'error': '未登录'}), 401

    result = trade_confirmation_service.reject(
        confirm_id=confirm_id,
        user_id=user_id,
        reason=data.get('reason', '')
    )

    return jsonify(result)


# ==================== 对账API ====================

@trade_enhanced_bp.route('/reconciliation', methods=['POST'])
def create_reconciliation():
    """创建对账任务"""
    from datetime import datetime

    data = request.get_json()
    user_id = g.get('user_id')

    if not user_id:
        return jsonify({'success': False, 'error': '未登录'}), 401

    if not g.get('is_admin'):
        return jsonify({'success': False, 'error': '无权限'}), 403

    result = reconciliation_service.create_reconciliation_task(
        recon_type=data.get('type', 'daily'),
        period_start=datetime.fromisoformat(data.get('period_start')),
        period_end=datetime.fromisoformat(data.get('period_end')),
        created_by=user_id
    )

    return jsonify({
        'success': True,
        'data': result
    })


@trade_enhanced_bp.route('/reconciliation/<recon_id>', methods=['GET'])
def get_reconciliation(recon_id):
    """获取对账结果"""
    result = reconciliation_service.execute_reconciliation(recon_id)

    return jsonify(result)


@trade_enhanced_bp.route('/reconciliation/history', methods=['GET'])
def get_reconciliation_history():
    """获取对账历史"""
    user_id = g.get('user_id')
    limit = int(request.args.get('limit', 20))

    history = reconciliation_service.get_reconciliation_history(user_id, limit)

    return jsonify({
        'success': True,
        'data': history
    })


# ==================== 通知API ====================

@trade_enhanced_bp.route('/notifications', methods=['GET'])
def get_notifications():
    """获取未读通知"""
    user_id = g.get('user_id')

    if not user_id:
        return jsonify({'success': False, 'error': '未登录'}), 401

    limit = int(request.args.get('limit', 20))
    notifications = trade_notification_service.get_unread_notifications(user_id, limit)

    return jsonify({
        'success': True,
        'data': notifications
    })


@trade_enhanced_bp.route('/notifications/<notification_id>/read', methods=['POST'])
def mark_notification_read(notification_id):
    """标记通知为已读"""
    success = trade_notification_service.mark_as_read(notification_id)

    return jsonify({
        'success': success
    })


@trade_enhanced_bp.route('/notifications/send', methods=['POST'])
def send_notification():
    """发送通知（管理员）"""
    data = request.get_json()

    if not g.get('is_admin'):
        return jsonify({'success': False, 'error': '无权限'}), 403

    result = trade_notification_service.send_notification(
        user_id=data.get('user_id'),
        notification_type=data.get('type'),
        channels=data.get('channels', ['in_app']),
        data=data.get('data', {}),
        priority=data.get('priority', 'normal')
    )

    return jsonify(result)


# 注册蓝图函数
def register_enhanced_blueprints(app):
    """注册增强蓝图"""
    app.register_blueprint(security_bp)
    app.register_blueprint(trade_enhanced_bp)