# -*- coding: utf-8 -*-
"""
监控API路由
提供系统健康检查、指标查询、告警管理接口
"""

from flask import Blueprint, request, jsonify, current_app, g
from backend_utils.response import flask_success_response, flask_error_response
from routes.auth import require_auth, require_roles
from services.monitoring_service import (
    MonitoringService, AlertLevel, AlertType
)
from services.option_pricing import OptionPricingEngine
from services.websocket_service import get_connection_manager
import logging

logger = logging.getLogger(__name__)

monitor_bp = Blueprint('monitor', __name__)

# 全局监控服务实例
_monitoring_service = None


def get_monitoring_service():
    """获取监控服务实例"""
    global _monitoring_service
    if _monitoring_service is None:
        from app import get_db, get_cloud_client
        db = get_db()
        cloud_client = get_cloud_client()
        _monitoring_service = MonitoringService(db, cloud_client)
    return _monitoring_service


# ============================================
# 健康检查接口
# ============================================

@monitor_bp.route('/health', methods=['GET'])
def health_check():
    """
    健康检查接口（无需认证）
    
    Returns:
        系统健康状态
    """
    try:
        service = get_monitoring_service()
        health = service.health_checker.check_all()
        
        status_code = 200 if health['status'] == 'healthy' else 503
        return flask_success_response(
            data=health,
            message='健康检查完成'
        ), status_code
    except Exception as e:
        logger.error(f'健康检查失败: {e}')
        return flask_error_response(str(e), 500)


@monitor_bp.route('/health/live', methods=['GET'])
def liveness():
    """K8s存活探针"""
    return flask_success_response(data={'status': 'alive'})


@monitor_bp.route('/health/ready', methods=['GET'])
def readiness():
    """K8s就绪探针"""
    try:
        service = get_monitoring_service()
        health = service.health_checker.check_all()
        
        if health['status'] == 'healthy':
            return flask_success_response(data={'status': 'ready'})
        else:
            return flask_error_response('服务未就绪', 503)
    except:
        return flask_error_response('服务未就绪', 503)


# ============================================
# 监控面板接口
# ============================================

@monitor_bp.route('/dashboard', methods=['GET'])
@require_auth
@require_roles('admin')
def get_dashboard():
    """
    获取监控面板数据（需要管理员权限）
    
    Returns:
        系统指标、健康状态、告警信息
    """
    try:
        service = get_monitoring_service()
        data = service.get_dashboard_data()
        return flask_success_response(data=data)
    except Exception as e:
        logger.error(f'获取监控面板失败: {e}')
        return flask_error_response(str(e), 500)


@monitor_bp.route('/metrics', methods=['GET'])
@require_auth
@require_roles('admin')
def get_metrics():
    """
    获取系统指标
    
    Query params:
        name: 指标名称（可选）
    
    Returns:
        指标数据
    """
    try:
        service = get_monitoring_service()
        name = request.args.get('name')
        metrics = service.metrics.get_metrics(name)
        return flask_success_response(data=metrics)
    except Exception as e:
        return flask_error_response(str(e), 500)


@monitor_bp.route('/system', methods=['GET'])
@require_auth
@require_roles('admin')
def get_system_info():
    """获取系统信息"""
    try:
        service = get_monitoring_service()
        info = service.system_monitor.get_system_info()
        cpu = service.system_monitor.get_cpu_usage()
        mem = service.system_monitor.get_memory_usage()
        disk = service.system_monitor.get_disk_usage()
        
        return flask_success_response(data={
            'system': info,
            'cpu': {'usage': cpu},
            'memory': mem,
            'disk': disk
        })
    except Exception as e:
        return flask_error_response(str(e), 500)


# ============================================
# 告警管理接口
# ============================================

@monitor_bp.route('/alerts', methods=['GET'])
@require_auth
@require_roles('admin')
def get_alerts():
    """
    获取告警列表
    
    Query params:
        level: 告警级别 (info/warning/error/critical)
        type: 告警类型 (system/business/security/performance)
        acknowledged: 是否已确认 (true/false)
        limit: 返回数量限制
    """
    try:
        service = get_monitoring_service()
        
        level = request.args.get('level')
        alert_type = request.args.get('type')
        acknowledged = request.args.get('acknowledged')
        limit = request.args.get('limit', 100, type=int)
        
        acknowledged = None if acknowledged is None else acknowledged.lower() == 'true'
        
        alerts = service.alert_manager.get_alerts(
            level=level,
            alert_type=alert_type,
            acknowledged=acknowledged,
            limit=limit
        )
        
        return flask_success_response(data={
            'alerts': [
                {
                    'id': a.id,
                    'type': a.type,
                    'level': a.level,
                    'title': a.title,
                    'message': a.message,
                    'source': a.source,
                    'timestamp': a.timestamp,
                    'acknowledged': a.acknowledged,
                    'acknowledged_by': a.acknowledged_by,
                    'data': a.data
                }
                for a in alerts
            ],
            'total': len(alerts)
        })
    except Exception as e:
        return flask_error_response(str(e), 500)


@monitor_bp.route('/alerts/<alert_id>/acknowledge', methods=['POST'])
@require_auth
@require_roles('admin')
def acknowledge_alert(alert_id):
    """
    确认告警
    
    Args:
        alert_id: 告警ID
    """
    try:
        service = get_monitoring_service()
        user = getattr(g, 'admin', {})
        user_id = user.get('sub', 'unknown')
        
        success = service.alert_manager.acknowledge_alert(alert_id, user_id)
        
        if success:
            return flask_success_response(message='告警已确认')
        else:
            return flask_error_response('告警不存在', 404)
    except Exception as e:
        return flask_error_response(str(e), 500)


@monitor_bp.route('/alerts/clear', methods=['POST'])
@require_auth
@require_roles('admin')
def clear_alerts():
    """清理已确认的告警"""
    try:
        service = get_monitoring_service()
        service.alert_manager.clear_alerts()
        return flask_success_response(message='告警已清理')
    except Exception as e:
        return flask_error_response(str(e), 500)


# ============================================
# WebSocket统计接口
# ============================================

@monitor_bp.route('/websocket/stats', methods=['GET'])
@require_auth
@require_roles('admin')
def get_websocket_stats():
    """获取WebSocket连接统计"""
    try:
        cm = get_connection_manager()
        stats = cm.get_stats()
        return flask_success_response(data=stats)
    except Exception as e:
        return flask_error_response(str(e), 500)


# ============================================
# 期权定价接口
# ============================================

@monitor_bp.route('/option/price', methods=['POST'])
@require_auth
def calculate_option_price():
    """
    计算期权价格
    
    Request body:
        S: 标的价格
        K: 行权价
        T: 到期时间（年）
        r: 无风险利率
        sigma: 波动率
        option_type: call/put
        exercise_style: european/american (可选)
        q: 股息率 (可选)
        model: 定价模型 (auto/bsm/binomial/mc) (可选)
    
    Returns:
        期权价格和Greeks
    """
    try:
        data = request.json
        
        S = float(data.get('S'))
        K = float(data.get('K'))
        T = float(data.get('T'))
        r = float(data.get('r', 0.03))
        sigma = float(data.get('sigma'))
        option_type = data.get('option_type', 'call')
        exercise_style = data.get('exercise_style', 'european')
        q = float(data.get('q', 0))
        model = data.get('model', 'auto')
        
        result = OptionPricingEngine.price(
            S=S, K=K, T=T, r=r, sigma=sigma,
            option_type=option_type,
            exercise_style=exercise_style,
            q=q,
            model=model
        )
        
        return flask_success_response(data=result)
    except Exception as e:
        logger.error(f'期权定价失败: {e}')
        return flask_error_response(str(e), 400)


@monitor_bp.route('/option/iv', methods=['POST'])
@require_auth
def calculate_implied_volatility():
    """
    计算隐含波动率
    
    Request body:
        price: 期权市场价格
        S: 标的价格
        K: 行权价
        T: 到期时间（年）
        r: 无风险利率
        option_type: call/put
        q: 股息率 (可选)
    
    Returns:
        隐含波动率
    """
    try:
        data = request.json
        
        price = float(data.get('price'))
        S = float(data.get('S'))
        K = float(data.get('K'))
        T = float(data.get('T'))
        r = float(data.get('r', 0.03))
        option_type = data.get('option_type', 'call')
        q = float(data.get('q', 0))
        
        iv = OptionPricingEngine.implied_volatility(
            price=price, S=S, K=K, T=T, r=r,
            option_type=option_type, q=q
        )
        
        if iv is None:
            return flask_error_response('无法计算隐含波动率', 400)
        
        return flask_success_response(data={
            'implied_volatility': round(iv, 4),
            'implied_volatility_percent': round(iv * 100, 2)
        })
    except Exception as e:
        return flask_error_response(str(e), 400)


# ============================================
# 风控检查接口
# ============================================

@monitor_bp.route('/risk/check', methods=['POST'])
@require_auth
def risk_check():
    """
    风控检查
    
    Request body:
        user_id: 用户ID
        trade_amount: 交易金额
        account_balance: 账户余额
        positions: 现有持仓列表
    
    Returns:
        风控检查结果
    """
    try:
        from services.advanced_risk_service import RiskControlService
        
        data = request.json
        user_id = data.get('user_id')
        trade_amount = float(data.get('trade_amount', 0))
        account_balance = float(data.get('account_balance', 0))
        positions = data.get('positions', [])
        prices = data.get('prices', {})
        
        service = RiskControlService()
        
        # 预交易风控检查
        passed, message = service.pre_trade_risk_check(
            user_id=user_id,
            trade_amount=trade_amount,
            account_balance=account_balance,
            existing_positions=positions
        )
        
        # 获取风险概览
        risk_summary = service.get_user_risk_summary(
            user_id=user_id,
            positions=positions,
            account_balance=account_balance,
            prices=prices
        )
        
        return flask_success_response(data={
            'passed': passed,
            'message': message,
            'risk_summary': risk_summary
        })
    except Exception as e:
        logger.error(f'风控检查失败: {e}')
        return flask_error_response(str(e), 500)


@monitor_bp.route('/risk/margin', methods=['POST'])
@require_auth
def calculate_margin():
    """
    计算保证金
    
    Request body:
        positions: 持仓列表
        prices: 价格字典
    
    Returns:
        保证金要求
    """
    try:
        from services.advanced_risk_service import MarginCalculator
        
        data = request.json
        positions = data.get('positions', [])
        prices = data.get('prices', {})
        
        margin = MarginCalculator.calculate_portfolio_margin(positions, prices)
        
        return flask_success_response(data={
            'initial_margin': margin.initial_margin,
            'maintenance_margin': margin.maintenance_margin,
            'margin_call_level': margin.margin_call_level,
            'force_close_level': margin.force_close_level
        })
    except Exception as e:
        return flask_error_response(str(e), 500)


# 导出
__all__ = ['monitor_bp']