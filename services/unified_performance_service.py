# -*- coding: utf-8 -*-
"""
统一性能监控服务

整合前后端性能监控功能，提供：
- 统一的性能指标收集和存储
- 智能缓存淘汰机制（LRU/LFU/TTL混合策略）
- 请求去重和防抖机制
- 自动化性能告警
- 详细的性能报告生成

参考设计:
- miniprogram/utils/performance-optimizer.js
- backend_utils/performance-optimizer.js
- services/sina_crawler.py (缓存TTL设计)
"""

import os
import time
import json
import hashlib
import logging
import threading
from typing import Any, Dict, List, Optional, Callable, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass, field, asdict
from enum import Enum
from collections import OrderedDict
from functools import wraps
import queue

logger = logging.getLogger(__name__)


class MetricType(Enum):
    """性能指标类型"""
    API_RESPONSE = 'api_response'
    PAGE_LOAD = 'page_load'
    CACHE_HIT = 'cache_hit'
    DB_QUERY = 'db_query'
    RENDER = 'render'
    INTERACTION = 'interaction'
    MEMORY = 'memory'
    NETWORK = 'network'
    ERROR = 'error'


class AlertLevel(Enum):
    """告警级别"""
    INFO = 'info'
    WARNING = 'warning'
    ERROR = 'error'
    CRITICAL = 'critical'


@dataclass
class PerformanceMetric:
    """性能指标数据结构"""
    name: str
    metric_type: MetricType
    value: float
    unit: str = 'ms'
    timestamp: float = field(default_factory=time.time)
    tags: Dict[str, str] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'name': self.name,
            'type': self.metric_type.value,
            'value': self.value,
            'unit': self.unit,
            'timestamp': self.timestamp,
            'tags': self.tags,
            'metadata': self.metadata
        }


@dataclass
class PerformanceAlert:
    """性能告警数据结构"""
    alert_type: str
    level: AlertLevel
    message: str
    metric_value: float
    threshold: float
    timestamp: float = field(default_factory=time.time)
    resolved: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'alert_type': self.alert_type,
            'level': self.level.value,
            'message': self.message,
            'metric_value': self.metric_value,
            'threshold': self.threshold,
            'timestamp': self.timestamp,
            'resolved': self.resolved,
            'metadata': self.metadata
        }


class SmartCache:
    """
    智能缓存系统

    实现LRU + LFU + TTL混合淘汰策略
    参考: services/sina_crawler.py 中的缓存TTL设计
    """

    def __init__(self, max_size: int = 1000, default_ttl: int = 300):
        self._max_size = max_size
        self._default_ttl = default_ttl
        self._cache: OrderedDict = OrderedDict()  # LRU顺序
        self._access_count: Dict[str, int] = {}   # LFU计数
        self._ttl_data: Dict[str, Tuple[float, float]] = {}  # key -> (expiry, created)
        self._lock = threading.RLock()

        # 缓存统计
        self._stats = {
            'hits': 0,
            'misses': 0,
            'evictions': 0,
            'expirations': 0,
            'total_requests': 0
        }

    def get(self, key: str) -> Optional[Any]:
        """获取缓存值"""
        with self._lock:
            self._stats['total_requests'] += 1

            # 检查是否存在
            if key not in self._cache:
                self._stats['misses'] += 1
                return None

            # 检查TTL
            if key in self._ttl_data:
                expiry, _ = self._ttl_data[key]
                if time.time() > expiry:
                    self._remove(key)
                    self._stats['misses'] += 1
                    self._stats['expirations'] += 1
                    return None

            # LRU: 移到末尾（最近使用）
            self._cache.move_to_end(key)

            # LFU: 增加访问计数
            self._access_count[key] = self._access_count.get(key, 0) + 1

            self._stats['hits'] += 1
            return self._cache[key]

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """设置缓存值"""
        with self._lock:
            ttl = ttl or self._default_ttl
            now = time.time()
            expiry = now + ttl

            # 如果已存在，更新
            if key in self._cache:
                self._cache[key] = value
                self._cache.move_to_end(key)
                self._ttl_data[key] = (expiry, now)
                self._access_count[key] = self._access_count.get(key, 0)
                return True

            # 检查容量
            if len(self._cache) >= self._max_size:
                self._evict()

            # 添加新条目
            self._cache[key] = value
            self._ttl_data[key] = (expiry, now)
            self._access_count[key] = 0

            return True

    def _remove(self, key: str) -> None:
        """移除缓存条目"""
        self._cache.pop(key, None)
        self._ttl_data.pop(key, None)
        self._access_count.pop(key, None)

    def _evict(self) -> None:
        """
        混合淘汰策略：
        1. 优先清理过期条目
        2. 其次按LFU+LRU策略淘汰
        """
        now = time.time()

        # 1. 清理过期条目
        expired_keys = [
            k for k, (expiry, _) in self._ttl_data.items()
            if now > expiry
        ]
        for key in expired_keys:
            self._remove(key)
            self._stats['expirations'] += 1

        if len(self._cache) < self._max_size:
            return

        # 2. LFU+LRU混合淘汰
        # 计算每个条目的优先级分数 (访问次数 * 时间权重)
        items = []
        for key in self._cache:
            access_freq = self._access_count.get(key, 0)
            _, created = self._ttl_data.get(key, (0, now))
            age = now - created

            # 分数 = 访问频率 * 10 - 年龄(秒) * 0.1
            # 频繁访问且较新的条目分数高
            score = access_freq * 10 - age * 0.1
            items.append((key, score))

        # 按分数升序排列，删除分数最低的
        items.sort(key=lambda x: x[1])
        evict_count = max(1, len(self._cache) // 10)  # 淘汰10%或至少1个

        for key, _ in items[:evict_count]:
            self._remove(key)
            self._stats['evictions'] += 1

    def delete(self, key: str) -> bool:
        """删除指定缓存"""
        with self._lock:
            if key in self._cache:
                self._remove(key)
                return True
            return False

    def clear(self) -> None:
        """清空缓存"""
        with self._lock:
            self._cache.clear()
            self._ttl_data.clear()
            self._access_count.clear()

    def get_stats(self) -> Dict[str, Any]:
        """获取缓存统计"""
        with self._lock:
            total = self._stats['total_requests']
            hit_rate = self._stats['hits'] / total if total > 0 else 0

            return {
                'size': len(self._cache),
                'max_size': self._max_size,
                'hits': self._stats['hits'],
                'misses': self._stats['misses'],
                'hit_rate': round(hit_rate * 100, 2),
                'evictions': self._stats['evictions'],
                'expirations': self._stats['expirations'],
                'total_requests': total
            }

    def cleanup_expired(self) -> int:
        """手动清理过期条目"""
        now = time.time()
        expired_keys = [
            k for k, (expiry, _) in self._ttl_data.items()
            if now > expiry
        ]
        with self._lock:
            for key in expired_keys:
                self._remove(key)
                self._stats['expirations'] += 1
        return len(expired_keys)


class RequestDeduplicator:
    """
    请求去重器

    参考: miniprogram/utils/performanceOptimizer.js 中的 pendingRequests 设计
    """

    def __init__(self, dedup_window: float = 1.0):
        """
        Args:
            dedup_window: 去重时间窗口（秒）
        """
        self._dedup_window = dedup_window
        self._pending_requests: Dict[str, Tuple[float, Any]] = {}  # key -> (timestamp, promise)
        self._lock = threading.RLock()

        # 统计
        self._stats = {
            'total_requests': 0,
            'deduplicated': 0,
            'unique': 0
        }

    def _generate_key(self, request_id: str, params: Any = None) -> str:
        """生成请求唯一标识"""
        if params is not None:
            params_str = json.dumps(params, sort_keys=True, default=str)
            params_hash = hashlib.md5(params_str.encode()).hexdigest()[:8]
            return f"{request_id}:{params_hash}"
        return request_id

    def deduplicate(self, request_id: str, params: Any = None) -> Optional[str]:
        """
        检查请求是否重复

        Returns:
            如果是重复请求返回已有的请求key，否则返回None
        """
        with self._lock:
            self._stats['total_requests'] += 1
            key = self._generate_key(request_id, params)

            # 清理过期的pending请求
            now = time.time()
            expired = [k for k, (ts, _) in self._pending_requests.items()
                       if now - ts > self._dedup_window * 2]
            for k in expired:
                del self._pending_requests[k]

            if key in self._pending_requests:
                self._stats['deduplicated'] += 1
                return key

            self._stats['unique'] += 1
            self._pending_requests[key] = (now, None)
            return None

    def mark_complete(self, request_id: str, params: Any = None) -> None:
        """标记请求完成"""
        with self._lock:
            key = self._generate_key(request_id, params)
            self._pending_requests.pop(key, None)

    def get_stats(self) -> Dict[str, Any]:
        """获取去重统计"""
        with self._lock:
            total = self._stats['total_requests']
            dedup_rate = self._stats['deduplicated'] / total if total > 0 else 0
            return {
                'total_requests': total,
                'deduplicated': self._stats['deduplicated'],
                'unique': self._stats['unique'],
                'dedup_rate': round(dedup_rate * 100, 2),
                'pending_count': len(self._pending_requests)
            }


class ThrottleDebounce:
    """
    防抖和节流工具
    """

    def __init__(self):
        self._throttle_timers: Dict[str, float] = {}
        self._debounce_timers: Dict[str, Any] = {}
        self._lock = threading.RLock()

    def throttle(self, key: str, func: Callable, interval: float) -> Optional[Callable]:
        """
        节流：在指定时间间隔内只执行一次

        Args:
            key: 唯一标识
            func: 要执行的函数
            interval: 间隔时间（秒）

        Returns:
            如果在间隔内返回None，否则返回要执行的函数
        """
        with self._lock:
            now = time.time()
            last_exec = self._throttle_timers.get(key, 0)

            if now - last_exec >= interval:
                self._throttle_timers[key] = now
                return func
            return None

    def debounce(self, key: str, func: Callable, delay: float) -> None:
        """
        防抖：延迟执行，在延迟期间再次调用会重置计时器

        Args:
            key: 唯一标识
            func: 要执行的函数
            delay: 延迟时间（秒）
        """
        with self._lock:
            # 取消之前的计时器
            if key in self._debounce_timers:
                old_timer = self._debounce_timers[key]
                if old_timer:
                    old_timer.cancel()

            # 创建新计时器
            timer = threading.Timer(delay, func)
            self._debounce_timers[key] = timer
            timer.start()


class PerformanceAlertManager:
    """
    性能告警管理器
    """

    def __init__(self):
        self._alerts: List[PerformanceAlert] = []
        self._alert_handlers: List[Callable[[PerformanceAlert], None]] = []
        self._thresholds: Dict[str, Dict[str, float]] = self._default_thresholds()
        self._lock = threading.RLock()

        # 告警统计
        self._stats = {
            'total_alerts': 0,
            'by_level': {level.value: 0 for level in AlertLevel},
            'by_type': {}
        }

    def _default_thresholds(self) -> Dict[str, Dict[str, float]]:
        """默认告警阈值"""
        return {
            MetricType.API_RESPONSE.value: {
                'warning': 2000,    # 2秒
                'error': 5000,      # 5秒
                'critical': 10000   # 10秒
            },
            MetricType.PAGE_LOAD.value: {
                'warning': 3000,
                'error': 5000,
                'critical': 10000
            },
            MetricType.DB_QUERY.value: {
                'warning': 1000,
                'error': 3000,
                'critical': 5000
            },
            MetricType.CACHE_HIT.value: {
                'warning': 50,      # 命中率低于50%
                'error': 30,
                'critical': 10
            },
            MetricType.MEMORY.value: {
                'warning': 80,      # 内存使用率80%
                'error': 90,
                'critical': 95
            },
            MetricType.ERROR.value: {
                'warning': 5,       # 错误率5%
                'error': 10,
                'critical': 20
            }
        }

    def set_threshold(self, metric_type: MetricType, level: AlertLevel, value: float) -> None:
        """设置告警阈值"""
        with self._lock:
            if metric_type.value not in self._thresholds:
                self._thresholds[metric_type.value] = {}
            self._thresholds[metric_type.value][level.value] = value

    def check_and_alert(self, metric: PerformanceMetric) -> Optional[PerformanceAlert]:
        """检查指标是否触发告警"""
        with self._lock:
            thresholds = self._thresholds.get(metric.metric_type.value)
            if not thresholds:
                return None

            level = None
            threshold = None

            # 检查是否超过阈值（注意缓存命中率的判断逻辑相反）
            if metric.metric_type == MetricType.CACHE_HIT:
                # 缓存命中率：值越低越危险
                if metric.value < thresholds.get('critical', 10):
                    level = AlertLevel.CRITICAL
                    threshold = thresholds['critical']
                elif metric.value < thresholds.get('error', 30):
                    level = AlertLevel.ERROR
                    threshold = thresholds['error']
                elif metric.value < thresholds.get('warning', 50):
                    level = AlertLevel.WARNING
                    threshold = thresholds['warning']
            else:
                # 其他指标：值越高越危险
                if metric.value > thresholds.get('critical', 10000):
                    level = AlertLevel.CRITICAL
                    threshold = thresholds['critical']
                elif metric.value > thresholds.get('error', 5000):
                    level = AlertLevel.ERROR
                    threshold = thresholds['error']
                elif metric.value > thresholds.get('warning', 2000):
                    level = AlertLevel.WARNING
                    threshold = thresholds['warning']

            if level:
                alert = PerformanceAlert(
                    alert_type=metric.metric_type.value,
                    level=level,
                    message=f"{metric.name} {level.value}: {metric.value}{metric.unit} (threshold: {threshold})",
                    metric_value=metric.value,
                    threshold=threshold,
                    metadata={'metric': metric.to_dict()}
                )
                self._add_alert(alert)
                return alert

            return None

    def _add_alert(self, alert: PerformanceAlert) -> None:
        """添加告警"""
        self._alerts.append(alert)
        self._stats['total_alerts'] += 1
        self._stats['by_level'][alert.level.value] += 1
        self._stats['by_type'][alert.alert_type] = \
            self._stats['by_type'].get(alert.alert_type, 0) + 1

        # 保持最近100条告警
        if len(self._alerts) > 100:
            self._alerts = self._alerts[-100:]

        # 触发告警处理器
        for handler in self._alert_handlers:
            try:
                handler(alert)
            except Exception as e:
                logger.error(f"告警处理器执行失败: {e}")

    def add_handler(self, handler: Callable[[PerformanceAlert], None]) -> None:
        """添加告警处理器"""
        self._alert_handlers.append(handler)

    def get_alerts(self, level: Optional[AlertLevel] = None,
                   limit: int = 50) -> List[Dict[str, Any]]:
        """获取告警列表"""
        with self._lock:
            alerts = self._alerts
            if level:
                alerts = [a for a in alerts if a.level == level]
            return [a.to_dict() for a in alerts[-limit:]]

    def get_stats(self) -> Dict[str, Any]:
        """获取告警统计"""
        with self._lock:
            return {
                **self._stats,
                'recent_alerts': len([a for a in self._alerts
                                      if time.time() - a.timestamp < 3600])  # 最近1小时
            }


class UnifiedPerformanceService:
    """
    统一性能监控服务

    整合前后端性能监控，提供统一接口
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self, cache_size: int = 1000, default_ttl: int = 300):
        if hasattr(self, '_initialized') and self._initialized:
            return

        # 智能缓存
        self._cache = SmartCache(max_size=cache_size, default_ttl=default_ttl)

        # 请求去重器
        self._deduplicator = RequestDeduplicator()

        # 防抖节流
        self._throttle_debounce = ThrottleDebounce()

        # 告警管理
        self._alert_manager = PerformanceAlertManager()

        # 性能指标存储
        self._metrics: Dict[str, List[PerformanceMetric]] = {}
        self._metrics_lock = threading.RLock()

        # 指标聚合统计
        self._aggregated_stats: Dict[str, Dict[str, float]] = {}

        # 后台处理队列
        self._metric_queue = queue.Queue()
        self._worker_thread = None
        self._running = False

        # 启动后台工作线程
        self._start_worker()

        # 定期清理任务
        self._start_cleanup_timer()

        # 添加默认告警处理器
        self._alert_manager.add_handler(self._default_alert_handler)

        self._initialized = True
        logger.info("统一性能监控服务已初始化")

    def _start_worker(self) -> None:
        """启动后台工作线程"""
        if self._running:
            return

        self._running = True
        self._worker_thread = threading.Thread(target=self._process_metrics, daemon=True)
        self._worker_thread.start()

    def _process_metrics(self) -> None:
        """处理指标队列"""
        while self._running:
            try:
                metric = self._metric_queue.get(timeout=1.0)
                if metric:
                    self._store_metric(metric)
                    self._alert_manager.check_and_alert(metric)
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"处理指标失败: {e}")

    def _store_metric(self, metric: PerformanceMetric) -> None:
        """存储指标"""
        with self._metrics_lock:
            key = f"{metric.metric_type.value}:{metric.name}"
            if key not in self._metrics:
                self._metrics[key] = []

            self._metrics[key].append(metric)

            # 保持最近1000条
            if len(self._metrics[key]) > 1000:
                self._metrics[key] = self._metrics[key][-1000:]

            # 更新聚合统计
            self._update_aggregated_stats(key, metric)

    def _update_aggregated_stats(self, key: str, metric: PerformanceMetric) -> None:
        """更新聚合统计"""
        metrics = self._metrics.get(key, [])
        if not metrics:
            return

        values = [m.value for m in metrics]
        self._aggregated_stats[key] = {
            'count': len(values),
            'min': min(values),
            'max': max(values),
            'avg': sum(values) / len(values),
            'latest': metric.value,
            'latest_timestamp': metric.timestamp
        }

    def _start_cleanup_timer(self) -> None:
        """启动定期清理任务"""
        def cleanup():
            while self._running:
                time.sleep(300)  # 每5分钟清理一次
                try:
                    expired = self._cache.cleanup_expired()
                    if expired > 0:
                        logger.debug(f"清理了 {expired} 个过期缓存条目")
                except Exception as e:
                    logger.error(f"清理任务失败: {e}")

        thread = threading.Thread(target=cleanup, daemon=True)
        thread.start()

    def _default_alert_handler(self, alert: PerformanceAlert) -> None:
        """默认告警处理器"""
        level_map = {
            AlertLevel.INFO: logger.info,
            AlertLevel.WARNING: logger.warning,
            AlertLevel.ERROR: logger.error,
            AlertLevel.CRITICAL: logger.critical
        }
        log_func = level_map.get(alert.level, logger.info)
        log_func(f"[性能告警] {alert.message}")

    # ========== 公共API ==========

    def record_metric(self, name: str, metric_type: MetricType,
                      value: float, unit: str = 'ms',
                      tags: Optional[Dict[str, str]] = None,
                      metadata: Optional[Dict[str, Any]] = None) -> None:
        """
        记录性能指标

        Args:
            name: 指标名称
            metric_type: 指标类型
            value: 指标值
            unit: 单位
            tags: 标签
            metadata: 元数据
        """
        metric = PerformanceMetric(
            name=name,
            metric_type=metric_type,
            value=value,
            unit=unit,
            tags=tags or {},
            metadata=metadata or {}
        )
        self._metric_queue.put(metric)

    def record_api_response(self, api_name: str, response_time: float,
                            status_code: int = 200) -> None:
        """记录API响应时间"""
        self.record_metric(
            name=api_name,
            metric_type=MetricType.API_RESPONSE,
            value=response_time,
            tags={'status_code': str(status_code)}
        )

    def record_db_query(self, query_name: str, duration: float) -> None:
        """记录数据库查询时间"""
        self.record_metric(
            name=query_name,
            metric_type=MetricType.DB_QUERY,
            value=duration
        )

    def record_cache_hit(self, cache_name: str, hit_rate: float) -> None:
        """记录缓存命中率"""
        self.record_metric(
            name=cache_name,
            metric_type=MetricType.CACHE_HIT,
            value=hit_rate,
            unit='%'
        )

    # ========== 缓存API ==========

    def cache_get(self, key: str) -> Optional[Any]:
        """获取缓存"""
        return self._cache.get(key)

    def cache_set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """设置缓存"""
        return self._cache.set(key, value, ttl)

    def cache_delete(self, key: str) -> bool:
        """删除缓存"""
        return self._cache.delete(key)

    def cache_clear(self) -> None:
        """清空缓存"""
        self._cache.clear()

    def cache_stats(self) -> Dict[str, Any]:
        """获取缓存统计"""
        return self._cache.get_stats()

    # ========== 请求去重API ==========

    def check_duplicate(self, request_id: str, params: Any = None) -> Optional[str]:
        """检查请求是否重复"""
        return self._deduplicator.deduplicate(request_id, params)

    def mark_request_complete(self, request_id: str, params: Any = None) -> None:
        """标记请求完成"""
        self._deduplicator.mark_complete(request_id, params)

    def dedup_stats(self) -> Dict[str, Any]:
        """获取去重统计"""
        return self._deduplicator.get_stats()

    # ========== 防抖节流API ==========

    def throttle(self, key: str, func: Callable, interval: float) -> Optional[Callable]:
        """节流"""
        return self._throttle_debounce.throttle(key, func, interval)

    def debounce(self, key: str, func: Callable, delay: float) -> None:
        """防抖"""
        self._throttle_debounce.debounce(key, func, delay)

    # ========== 告警API ==========

    def add_alert_handler(self, handler: Callable[[PerformanceAlert], None]) -> None:
        """添加告警处理器"""
        self._alert_manager.add_handler(handler)

    def set_alert_threshold(self, metric_type: MetricType,
                            level: AlertLevel, value: float) -> None:
        """设置告警阈值"""
        self._alert_manager.set_threshold(metric_type, level, value)

    def get_alerts(self, level: Optional[AlertLevel] = None,
                   limit: int = 50) -> List[Dict[str, Any]]:
        """获取告警列表"""
        return self._alert_manager.get_alerts(level, limit)

    def alert_stats(self) -> Dict[str, Any]:
        """获取告警统计"""
        return self._alert_manager.get_stats()

    # ========== 报告API ==========

    def get_performance_report(self) -> Dict[str, Any]:
        """
        生成性能报告

        参考: miniprogram/app.js 中的性能报告生成逻辑
        """
        report = {
            'generated_at': datetime.utcnow().isoformat(),
            'uptime': time.time() - getattr(self, '_start_time', time.time()),
            'summary': {
                'total_metrics': sum(len(m) for m in self._metrics.values()),
                'metric_types': len(self._metrics),
                'cache_stats': self.cache_stats(),
                'dedup_stats': self.dedup_stats(),
                'alert_stats': self.alert_stats()
            },
            'metrics': {},
            'alerts': {
                'recent': self.get_alerts(limit=20),
                'by_level': self.alert_stats().get('by_level', {})
            },
            'recommendations': []
        }

        # 添加各类型指标的详细统计
        with self._metrics_lock:
            for key, stats in self._aggregated_stats.items():
                report['metrics'][key] = {
                    'count': stats['count'],
                    'min': round(stats['min'], 2),
                    'max': round(stats['max'], 2),
                    'avg': round(stats['avg'], 2),
                    'latest': round(stats['latest'], 2)
                }

                # 生成优化建议
                if 'api_response' in key and stats['avg'] > 2000:
                    report['recommendations'].append({
                        'type': 'performance',
                        'priority': 'high',
                        'message': f"API {key} 平均响应时间 {stats['avg']:.0f}ms 超过阈值，建议优化"
                    })

                if 'cache_hit' in key and stats['avg'] < 50:
                    report['recommendations'].append({
                        'type': 'cache',
                        'priority': 'medium',
                        'message': f"缓存 {key} 命中率 {stats['avg']:.1f}% 较低，建议优化缓存策略"
                    })

        return report

    def shutdown(self) -> None:
        """关闭服务"""
        self._running = False
        if self._worker_thread:
            self._worker_thread.join(timeout=5)
        logger.info("统一性能监控服务已关闭")


# 装饰器：自动记录API性能
def monitor_performance(metric_name: str, metric_type: MetricType = MetricType.API_RESPONSE):
    """
    性能监控装饰器

    Usage:
        @monitor_performance("my_api", MetricType.API_RESPONSE)
        def my_api():
            ...
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()
            try:
                result = func(*args, **kwargs)
                duration = (time.time() - start_time) * 1000  # 转换为毫秒

                service = get_performance_service()
                service.record_metric(
                    name=metric_name,
                    metric_type=metric_type,
                    value=duration
                )
                return result
            except Exception as e:
                duration = (time.time() - start_time) * 1000
                service = get_performance_service()
                service.record_metric(
                    name=f"{metric_name}_error",
                    metric_type=MetricType.ERROR,
                    value=duration,
                    metadata={'error': str(e)}
                )
                raise
        return wrapper
    return decorator


# 装饰器：缓存结果
def cache_result(key: str, ttl: int = 300):
    """
    结果缓存装饰器

    Usage:
        @cache_result("user_profile:{user_id}", ttl=600)
        def get_user_profile(user_id):
            ...
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            # 生成缓存key
            cache_key = key.format(*args, **kwargs)

            service = get_performance_service()
            cached = service.cache_get(cache_key)
            if cached is not None:
                return cached

            result = func(*args, **kwargs)
            service.cache_set(cache_key, result, ttl)
            return result
        return wrapper
    return decorator


# 全局服务实例
_performance_service: Optional[UnifiedPerformanceService] = None


def get_performance_service() -> UnifiedPerformanceService:
    """获取全局性能服务实例"""
    global _performance_service
    if _performance_service is None:
        _performance_service = UnifiedPerformanceService()
    return _performance_service


def init_performance_service(cache_size: int = 1000, default_ttl: int = 300) -> UnifiedPerformanceService:
    """初始化性能服务"""
    global _performance_service
    _performance_service = UnifiedPerformanceService(cache_size=cache_size, default_ttl=default_ttl)
    return _performance_service