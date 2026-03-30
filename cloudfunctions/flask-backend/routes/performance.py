# -*- coding: utf-8 -*-
"""
性能监控API路由

提供前后端统一的性能指标收集、报告生成和告警接口
"""

import logging
from datetime import datetime
from flask import Blueprint, request, g

from backend_utils.response import flask_success_response, flask_error_response
from services.unified_performance_service import (
    get_performance_service,
    MetricType,
    AlertLevel,
    monitor_performance,
    cache_result
)

logger = logging.getLogger(__name__)
performance_bp = Blueprint('performance', __name__)


@performance_bp.route('/metrics', methods=['POST'])
def collect_metrics():
    """
    收集性能指标

    接收来自前端或后端的性能数据，统一存储和分析

    请求体:
    {
        "source": "miniprogram" | "backend",
        "timestamp": 1234567890,
        "metrics": {
            "api_response": {...},
            "page_load": {...}
        },
        "cacheStats": {...},
        "dedupStats": {...},
        "alerts": [...]
    }
    """
    try:
        data = request.get_json(silent=True) or {}
        source = data.get('source', 'unknown')
        timestamp = data.get('timestamp', 0)
        metrics = data.get('metrics', {})

        service = get_performance_service()

        # 记录来源
        tags = {'source': source}

        # 处理各类指标
        if 'apiResponseTimes' in metrics:
            for api_name, times in metrics['apiResponseTimes'].items():
                if isinstance(times, list) and times:
                    avg_time = sum(times) / len(times)
                    service.record_metric(
                        name=f"{source}_{api_name}",
                        metric_type=MetricType.API_RESPONSE,
                        value=avg_time,
                        tags=tags
                    )

        if 'pageLoadTimes' in metrics:
            for page_name, times in metrics['pageLoadTimes'].items():
                if isinstance(times, list) and times:
                    avg_time = sum(times) / len(times)
                    service.record_metric(
                        name=f"{source}_{page_name}",
                        metric_type=MetricType.PAGE_LOAD,
                        value=avg_time,
                        tags=tags
                    )

        # 记录缓存统计
        cache_stats = data.get('cacheStats', {})
        if cache_stats and cache_stats.get('totalRequests', 0) > 0:
            service.record_metric(
                name=f"{source}_cache",
                metric_type=MetricType.CACHE_HIT,
                value=cache_stats.get('hitRate', 0),
                unit='%',
                tags=tags
            )

        # 处理告警
        alerts = data.get('alerts', [])
        for alert in alerts:
            logger.warning(f"[{source}告警] {alert.get('message', '')}")

        return flask_success_response(
            data={'received': True, 'metrics_count': len(metrics)},
            message="性能指标已收集"
        )

    except Exception as e:
        logger.error(f"收集性能指标失败: {e}")
        return flask_error_response(str(e), 500)


@performance_bp.route('/report', methods=['GET'])
def get_performance_report():
    """
    获取性能报告

    返回包含所有性能指标、告警和优化建议的综合报告
    """
    try:
        service = get_performance_service()
        report = service.get_performance_report()

        return flask_success_response(
            data=report,
            message="性能报告获取成功"
        )

    except Exception as e:
        logger.error(f"获取性能报告失败: {e}")
        return flask_error_response(str(e), 500)


@performance_bp.route('/cache/stats', methods=['GET'])
def get_cache_stats():
    """获取缓存统计"""
    try:
        service = get_performance_service()
        stats = service.cache_stats()

        return flask_success_response(
            data=stats,
            message="缓存统计获取成功"
        )

    except Exception as e:
        logger.error(f"获取缓存统计失败: {e}")
        return flask_error_response(str(e), 500)


@performance_bp.route('/cache/clear', methods=['POST'])
def clear_cache():
    """清空缓存"""
    try:
        service = get_performance_service()
        service.cache_clear()

        return flask_success_response(message="缓存已清空")

    except Exception as e:
        logger.error(f"清空缓存失败: {e}")
        return flask_error_response(str(e), 500)


@performance_bp.route('/dedup/stats', methods=['GET'])
def get_dedup_stats():
    """获取请求去重统计"""
    try:
        service = get_performance_service()
        stats = service.dedup_stats()

        return flask_success_response(
            data=stats,
            message="去重统计获取成功"
        )

    except Exception as e:
        logger.error(f"获取去重统计失败: {e}")
        return flask_error_response(str(e), 500)


@performance_bp.route('/alerts', methods=['GET'])
def get_alerts():
    """
    获取告警列表

    参数:
    - level: 告警级别 (info/warning/error/critical)
    - limit: 返回数量限制
    """
    try:
        level = request.args.get('level')
        limit = int(request.args.get('limit', 50))

        if level:
            try:
                level = AlertLevel(level)
            except ValueError:
                level = None

        service = get_performance_service()
        alerts = service.get_alerts(level=level, limit=limit)

        return flask_success_response(
            data={'alerts': alerts, 'total': len(alerts)},
            message="告警列表获取成功"
        )

    except Exception as e:
        logger.error(f"获取告警列表失败: {e}")
        return flask_error_response(str(e), 500)


@performance_bp.route('/alerts/stats', methods=['GET'])
def get_alert_stats():
    """获取告警统计"""
    try:
        service = get_performance_service()
        stats = service.alert_stats()

        return flask_success_response(
            data=stats,
            message="告警统计获取成功"
        )

    except Exception as e:
        logger.error(f"获取告警统计失败: {e}")
        return flask_error_response(str(e), 500)


@performance_bp.route('/thresholds', methods=['GET'])
def get_thresholds():
    """获取告警阈值配置"""
    try:
        service = get_performance_service()
        # 返回当前阈值配置
        thresholds = service._alert_manager._thresholds

        return flask_success_response(
            data=thresholds,
            message="阈值配置获取成功"
        )

    except Exception as e:
        logger.error(f"获取阈值配置失败: {e}")
        return flask_error_response(str(e), 500)


@performance_bp.route('/thresholds', methods=['POST'])
def set_threshold():
    """
    设置告警阈值

    请求体:
    {
        "metricType": "api_response",
        "level": "warning",
        "value": 2000
    }
    """
    try:
        data = request.get_json(silent=True) or {}
        metric_type_str = data.get('metricType')
        level_str = data.get('level')
        value = data.get('value')

        if not all([metric_type_str, level_str, value is not None]):
            return flask_error_response("缺少必要参数", 400)

        try:
            metric_type = MetricType(metric_type_str)
        except ValueError:
            return flask_error_response(f"无效的指标类型: {metric_type_str}", 400)

        try:
            level = AlertLevel(level_str)
        except ValueError:
            return flask_error_response(f"无效的告警级别: {level_str}", 400)

        service = get_performance_service()
        service.set_alert_threshold(metric_type, level, float(value))

        return flask_success_response(
            message=f"阈值已更新: {metric_type_str} {level_str} = {value}"
        )

    except Exception as e:
        logger.error(f"设置阈值失败: {e}")
        return flask_error_response(str(e), 500)


@performance_bp.route('/health', methods=['GET'])
def health_check():
    """健康检查端点"""
    try:
        service = get_performance_service()
        cache_stats = service.cache_stats()
        dedup_stats = service.dedup_stats()
        alert_stats = service.alert_stats()

        health_status = {
            'status': 'healthy',
            'timestamp': datetime.utcnow().isoformat(),
            'cache': {
                'size': cache_stats['size'],
                'hitRate': cache_stats['hit_rate']
            },
            'dedup': {
                'pendingCount': dedup_stats['pending_count']
            },
            'alerts': {
                'recentCount': alert_stats['recent_alerts']
            }
        }

        return flask_success_response(
            data=health_status,
            message="服务健康"
        )

    except Exception as e:
        logger.error(f"健康检查失败: {e}")
        return flask_error_response(str(e), 503)


# 性能监控装饰器的便捷导入
__all__ = [
    'performance_bp',
    'monitor_performance',
    'cache_result',
    'MetricType',
    'AlertLevel'
]