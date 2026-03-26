# -*- coding: utf-8 -*-
"""
监控告警系统
监控系统健康状态、业务指标、异常告警
"""

import logging
import threading
import time
import json
from typing import Dict, List, Optional, Callable, Any
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from enum import Enum
import platform
import psutil

logger = logging.getLogger(__name__)


class AlertLevel(Enum):
    """告警级别"""
    INFO = 'info'
    WARNING = 'warning'
    ERROR = 'error'
    CRITICAL = 'critical'


class AlertType(Enum):
    """告警类型"""
    SYSTEM = 'system'           # 系统告警
    BUSINESS = 'business'       # 业务告警
    SECURITY = 'security'       # 安全告警
    PERFORMANCE = 'performance' # 性能告警


@dataclass
class Alert:
    """告警信息"""
    id: str
    type: str
    level: str
    title: str
    message: str
    source: str
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    data: Dict = field(default_factory=dict)
    acknowledged: bool = False
    acknowledged_by: Optional[str] = None
    acknowledged_at: Optional[str] = None


@dataclass
class HealthStatus:
    """健康状态"""
    component: str
    status: str  # healthy/degraded/unhealthy
    message: str
    timestamp: str
    details: Dict = field(default_factory=dict)


class MetricsCollector:
    """
    指标收集器
    """
    
    def __init__(self):
        self._metrics: Dict[str, List[Dict]] = {}
        self._counters: Dict[str, int] = {}
        self._gauges: Dict[str, float] = {}
    
    def increment_counter(self, name: str, value: int = 1, tags: Dict = None):
        """增加计数器"""
        key = self._make_key(name, tags)
        self._counters[key] = self._counters.get(key, 0) + value
    
    def set_gauge(self, name: str, value: float, tags: Dict = None):
        """设置仪表"""
        key = self._make_key(name, tags)
        self._gauges[key] = value
    
    def record_metric(self, name: str, value: float, tags: Dict = None):
        """记录指标"""
        key = self._make_key(name, tags)
        if key not in self._metrics:
            self._metrics[key] = []
        
        self._metrics[key].append({
            'value': value,
            'timestamp': datetime.utcnow().isoformat()
        })
        
        # 只保留最近1000条
        if len(self._metrics[key]) > 1000:
            self._metrics[key] = self._metrics[key][-1000:]
    
    def get_counter(self, name: str, tags: Dict = None) -> int:
        """获取计数器值"""
        key = self._make_key(name, tags)
        return self._counters.get(key, 0)
    
    def get_gauge(self, name: str, tags: Dict = None) -> float:
        """获取仪表值"""
        key = self._make_key(name, tags)
        return self._gauges.get(key, 0)
    
    def get_metrics(self, name: str = None) -> Dict:
        """获取所有指标"""
        if name:
            key = self._make_key(name, {})
            return {
                'counter': self._counters.get(key, 0),
                'gauge': self._gauges.get(key, 0),
                'history': self._metrics.get(key, [])
            }
        
        return {
            'counters': dict(self._counters),
            'gauges': dict(self._gauges),
            'metrics': {k: v[-100:] for k, v in self._metrics.items()}
        }
    
    def _make_key(self, name: str, tags: Dict = None) -> str:
        """生成键"""
        if not tags:
            return name
        tag_str = ','.join(f"{k}={v}" for k, v in sorted(tags.items()))
        return f"{name}:{tag_str}"


class SystemMonitor:
    """
    系统监控器
    """
    
    def __init__(self):
        self.start_time = datetime.utcnow()
    
    def get_system_info(self) -> Dict:
        """获取系统信息"""
        return {
            'platform': platform.platform(),
            'python_version': platform.python_version(),
            'hostname': platform.node(),
            'start_time': self.start_time.isoformat(),
            'uptime_seconds': (datetime.utcnow() - self.start_time).total_seconds()
        }
    
    def get_cpu_usage(self) -> float:
        """获取CPU使用率"""
        try:
            return psutil.cpu_percent(interval=1)
        except:
            return 0
    
    def get_memory_usage(self) -> Dict:
        """获取内存使用情况"""
        try:
            mem = psutil.virtual_memory()
            return {
                'total': mem.total,
                'available': mem.available,
                'used': mem.used,
                'percent': mem.percent
            }
        except:
            return {'total': 0, 'available': 0, 'used': 0, 'percent': 0}
    
    def get_disk_usage(self) -> Dict:
        """获取磁盘使用情况"""
        try:
            disk = psutil.disk_usage('/')
            return {
                'total': disk.total,
                'used': disk.used,
                'free': disk.free,
                'percent': disk.percent
            }
        except:
            return {'total': 0, 'used': 0, 'free': 0, 'percent': 0}
    
    def check_health(self) -> List[HealthStatus]:
        """检查系统健康状态"""
        statuses = []
        
        # CPU检查
        cpu_usage = self.get_cpu_usage()
        if cpu_usage > 90:
            statuses.append(HealthStatus(
                component='cpu',
                status='unhealthy',
                message=f'CPU使用率过高: {cpu_usage}%',
                timestamp=datetime.utcnow().isoformat(),
                details={'usage': cpu_usage}
            ))
        elif cpu_usage > 70:
            statuses.append(HealthStatus(
                component='cpu',
                status='degraded',
                message=f'CPU使用率较高: {cpu_usage}%',
                timestamp=datetime.utcnow().isoformat(),
                details={'usage': cpu_usage}
            ))
        else:
            statuses.append(HealthStatus(
                component='cpu',
                status='healthy',
                message=f'CPU使用率正常: {cpu_usage}%',
                timestamp=datetime.utcnow().isoformat(),
                details={'usage': cpu_usage}
            ))
        
        # 内存检查
        mem = self.get_memory_usage()
        if mem['percent'] > 90:
            statuses.append(HealthStatus(
                component='memory',
                status='unhealthy',
                message=f'内存使用率过高: {mem["percent"]}%',
                timestamp=datetime.utcnow().isoformat(),
                details=mem
            ))
        elif mem['percent'] > 80:
            statuses.append(HealthStatus(
                component='memory',
                status='degraded',
                message=f'内存使用率较高: {mem["percent"]}%',
                timestamp=datetime.utcnow().isoformat(),
                details=mem
            ))
        else:
            statuses.append(HealthStatus(
                component='memory',
                status='healthy',
                message=f'内存使用率正常: {mem["percent"]}%',
                timestamp=datetime.utcnow().isoformat(),
                details=mem
            ))
        
        # 磁盘检查
        disk = self.get_disk_usage()
        if disk['percent'] > 90:
            statuses.append(HealthStatus(
                component='disk',
                status='unhealthy',
                message=f'磁盘使用率过高: {disk["percent"]}%',
                timestamp=datetime.utcnow().isoformat(),
                details=disk
            ))
        else:
            statuses.append(HealthStatus(
                component='disk',
                status='healthy',
                message=f'磁盘使用率正常: {disk["percent"]}%',
                timestamp=datetime.utcnow().isoformat(),
                details=disk
            ))
        
        return statuses


class DatabaseMonitor:
    """
    数据库监控器
    """
    
    def __init__(self, db=None, cloud_client=None):
        self.db = db
        self.cloud_client = cloud_client
    
    def check_connection(self) -> HealthStatus:
        """检查数据库连接"""
        try:
            if self.cloud_client:
                # 云数据库检查
                result = self.cloud_client.query('db.collection("users").limit(1).get()')
                if result is not None:
                    return HealthStatus(
                        component='database',
                        status='healthy',
                        message='云数据库连接正常',
                        timestamp=datetime.utcnow().isoformat()
                    )
            elif self.db is not None:
                # 本地数据库检查
                self.db.list_collection_names()
                return HealthStatus(
                    component='database',
                    status='healthy',
                    message='数据库连接正常',
                    timestamp=datetime.utcnow().isoformat()
                )
            
            return HealthStatus(
                component='database',
                status='unhealthy',
                message='数据库未配置',
                timestamp=datetime.utcnow().isoformat()
            )
        except Exception as e:
            return HealthStatus(
                component='database',
                status='unhealthy',
                message=f'数据库连接失败: {str(e)}',
                timestamp=datetime.utcnow().isoformat()
            )
    
    def get_stats(self) -> Dict:
        """获取数据库统计"""
        try:
            if self.cloud_client:
                # 云数据库统计
                stats = {
                    'type': 'cloud',
                    'collections': []
                }
                
                collections = ['users', 'inquiries', 'positions', 'quotes', 'orders']
                for coll in collections:
                    count = self.cloud_client.count(f'db.collection("{coll}").count()')
                    stats['collections'].append({
                        'name': coll,
                        'count': count
                    })
                
                return stats
        except Exception as e:
            return {'error': str(e)}


class AlertManager:
    """
    告警管理器
    """
    
    def __init__(self, notification_service=None):
        self.notification_service = notification_service
        self._alerts: List[Alert] = []
        self._alert_handlers: List[Callable] = []
        self._alert_rules: List[Dict] = []
    
    def add_handler(self, handler: Callable):
        """添加告警处理器"""
        self._alert_handlers.append(handler)
    
    def add_rule(self, rule: Dict):
        """
        添加告警规则
        
        Args:
            rule: {
                'name': str,
                'condition': Callable,
                'level': str,
                'message': str
            }
        """
        self._alert_rules.append(rule)
    
    def create_alert(
        self,
        alert_type: str,
        level: str,
        title: str,
        message: str,
        source: str,
        data: Dict = None
    ) -> Alert:
        """
        创建告警
        
        Args:
            alert_type: 告警类型
            level: 告警级别
            title: 标题
            message: 消息
            source: 来源
            data: 附加数据
            
        Returns:
            Alert对象
        """
        import uuid
        alert = Alert(
            id=str(uuid.uuid4()),
            type=alert_type,
            level=level,
            title=title,
            message=message,
            source=source,
            data=data or {}
        )
        
        self._alerts.append(alert)
        
        # 触发处理器
        for handler in self._alert_handlers:
            try:
                handler(alert)
            except Exception as e:
                logger.error(f"告警处理器执行失败: {e}")
        
        # 发送通知
        if self.notification_service and level in ['error', 'critical']:
            self.notification_service.send_notification(
                user_id='admin',
                title=f'[{level.upper()}] {title}',
                content=message,
                channel='inapp'
            )
        
        logger.warning(f"告警: [{level}] {title} - {message}")
        return alert
    
    def acknowledge_alert(self, alert_id: str, acknowledged_by: str) -> bool:
        """确认告警"""
        for alert in self._alerts:
            if alert.id == alert_id:
                alert.acknowledged = True
                alert.acknowledged_by = acknowledged_by
                alert.acknowledged_at = datetime.utcnow().isoformat()
                return True
        return False
    
    def get_alerts(
        self,
        level: str = None,
        alert_type: str = None,
        acknowledged: bool = None,
        limit: int = 100
    ) -> List[Alert]:
        """获取告警列表"""
        alerts = self._alerts
        
        if level:
            alerts = [a for a in alerts if a.level == level]
        if alert_type:
            alerts = [a for a in alerts if a.type == alert_type]
        if acknowledged is not None:
            alerts = [a for a in alerts if a.acknowledged == acknowledged]
        
        return alerts[-limit:]
    
    def clear_alerts(self, before: datetime = None):
        """清理告警"""
        if before:
            self._alerts = [a for a in self._alerts 
                          if datetime.fromisoformat(a.timestamp) > before]
        else:
            self._alerts = []


class HealthChecker:
    """
    健康检查器
    """
    
    def __init__(self, db=None, cloud_client=None):
        self.system_monitor = SystemMonitor()
        self.db_monitor = DatabaseMonitor(db, cloud_client)
    
    def check_all(self) -> Dict:
        """
        检查所有组件健康状态
        
        Returns:
            健康状态报告
        """
        system_statuses = self.system_monitor.check_health()
        db_status = self.db_monitor.check_connection()
        
        all_statuses = system_statuses + [db_status]
        
        # 计算整体状态
        if any(s.status == 'unhealthy' for s in all_statuses):
            overall_status = 'unhealthy'
        elif any(s.status == 'degraded' for s in all_statuses):
            overall_status = 'degraded'
        else:
            overall_status = 'healthy'
        
        return {
            'status': overall_status,
            'timestamp': datetime.utcnow().isoformat(),
            'components': [
                {
                    'component': s.component,
                    'status': s.status,
                    'message': s.message,
                    'timestamp': s.timestamp,
                    'details': s.details
                }
                for s in all_statuses
            ]
        }


class MonitoringService:
    """
    监控服务
    
    整合指标收集、健康检查、告警管理
    """
    
    def __init__(self, db=None, cloud_client=None, notification_service=None):
        self.metrics = MetricsCollector()
        self.health_checker = HealthChecker(db, cloud_client)
        self.alert_manager = AlertManager(notification_service)
        self.system_monitor = SystemMonitor()
        
        self._monitoring_thread: Optional[threading.Thread] = None
        self._running = False
    
    def start(self, interval: int = 60):
        """
        启动监控
        
        Args:
            interval: 检查间隔（秒）
        """
        if self._running:
            return
        
        self._running = True
        self._monitoring_thread = threading.Thread(
            target=self._monitoring_loop,
            args=(interval,),
            daemon=True
        )
        self._monitoring_thread.start()
        logger.info(f"监控服务已启动，检查间隔: {interval}秒")
    
    def stop(self):
        """停止监控"""
        self._running = False
        if self._monitoring_thread:
            self._monitoring_thread.join(timeout=5)
        logger.info("监控服务已停止")
    
    def _monitoring_loop(self, interval: int):
        """监控循环"""
        while self._running:
            try:
                # 收集系统指标
                cpu = self.system_monitor.get_cpu_usage()
                mem = self.system_monitor.get_memory_usage()
                
                self.metrics.set_gauge('system.cpu.usage', cpu)
                self.metrics.set_gauge('system.memory.usage', mem.get('percent', 0))
                
                # 健康检查
                health = self.health_checker.check_all()
                
                # 检查是否需要告警
                for component in health['components']:
                    if component['status'] == 'unhealthy':
                        self.alert_manager.create_alert(
                            alert_type=AlertType.SYSTEM.value,
                            level=AlertLevel.ERROR.value,
                            title=f'{component["component"]}异常',
                            message=component['message'],
                            source='monitoring',
                            data=component.get('details', {})
                        )
                
                time.sleep(interval)
                
            except Exception as e:
                logger.error(f"监控循环异常: {e}")
                time.sleep(10)
    
    def get_dashboard_data(self) -> Dict:
        """
        获取监控面板数据
        
        Returns:
            面板数据
        """
        system_info = self.system_monitor.get_system_info()
        health = self.health_checker.check_all()
        metrics = self.metrics.get_metrics()
        recent_alerts = self.alert_manager.get_alerts(limit=10)
        
        return {
            'system': system_info,
            'health': health,
            'metrics': metrics,
            'alerts': [
                {
                    'id': a.id,
                    'type': a.type,
                    'level': a.level,
                    'title': a.title,
                    'message': a.message,
                    'timestamp': a.timestamp,
                    'acknowledged': a.acknowledged
                }
                for a in recent_alerts
            ]
        }


# 导出
__all__ = [
    'AlertLevel',
    'AlertType',
    'Alert',
    'HealthStatus',
    'MetricsCollector',
    'SystemMonitor',
    'DatabaseMonitor',
    'AlertManager',
    'HealthChecker',
    'MonitoringService'
]