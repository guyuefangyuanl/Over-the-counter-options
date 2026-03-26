# -*- coding: utf-8 -*-
"""
WebSocket 实时推送服务
支持行情数据、订单状态、持仓变动的实时推送
"""

import json
import logging
import threading
import time
from typing import Dict, Set, Callable, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import queue

logger = logging.getLogger(__name__)


class MessageType(Enum):
    """消息类型"""
    QUOTE = 'quote'           # 行情更新
    ORDER = 'order'           # 订单状态
    POSITION = 'position'     # 持仓变动
    INQUIRY = 'inquiry'       # 询价状态
    NOTIFICATION = 'notification'  # 系统通知
    HEARTBEAT = 'heartbeat'   # 心跳


@dataclass
class WSMessage:
    """WebSocket消息结构"""
    type: str
    data: Dict[str, Any]
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    
    def to_json(self) -> str:
        return json.dumps({
            'type': self.type,
            'data': self.data,
            'timestamp': self.timestamp
        })


class ConnectionManager:
    """
    连接管理器
    管理WebSocket连接和订阅关系
    """
    
    def __init__(self):
        # 用户连接: user_id -> connection
        self._connections: Dict[str, Any] = {}
        
        # 频道订阅: channel -> set of user_ids
        self._subscriptions: Dict[str, Set[str]] = {}
        
        # 用户订阅: user_id -> set of channels
        self._user_channels: Dict[str, Set[str]] = {}
        
        # 消息队列
        self._message_queue = queue.Queue()
        
        # 工作线程
        self._worker_thread: Optional[threading.Thread] = None
        self._running = False
    
    def start(self):
        """启动推送服务"""
        if self._running:
            return
        
        self._running = True
        self._worker_thread = threading.Thread(target=self._process_queue, daemon=True)
        self._worker_thread.start()
        logger.info("WebSocket推送服务已启动")
    
    def stop(self):
        """停止推送服务"""
        self._running = False
        if self._worker_thread:
            self._worker_thread.join(timeout=5)
        logger.info("WebSocket推送服务已停止")
    
    def register(self, user_id: str, connection: Any):
        """
        注册用户连接
        
        Args:
            user_id: 用户ID
            connection: WebSocket连接对象
        """
        self._connections[user_id] = connection
        self._user_channels[user_id] = set()
        logger.info(f"用户连接注册: {user_id}")
    
    def unregister(self, user_id: str):
        """
        注销用户连接
        
        Args:
            user_id: 用户ID
        """
        # 清理订阅
        if user_id in self._user_channels:
            for channel in self._user_channels[user_id]:
                if channel in self._subscriptions:
                    self._subscriptions[channel].discard(user_id)
            del self._user_channels[user_id]
        
        # 移除连接
        self._connections.pop(user_id, None)
        logger.info(f"用户连接注销: {user_id}")
    
    def subscribe(self, user_id: str, channel: str):
        """
        订阅频道
        
        Args:
            user_id: 用户ID
            channel: 频道名称 (如: quote:600519, order:user123)
        """
        if user_id not in self._connections:
            logger.warning(f"用户未连接，无法订阅: {user_id}")
            return
        
        # 添加到频道订阅
        if channel not in self._subscriptions:
            self._subscriptions[channel] = set()
        self._subscriptions[channel].add(user_id)
        
        # 添加到用户订阅
        if user_id not in self._user_channels:
            self._user_channels[user_id] = set()
        self._user_channels[user_id].add(channel)
        
        logger.info(f"用户订阅频道: {user_id} -> {channel}")
    
    def unsubscribe(self, user_id: str, channel: str):
        """
        取消订阅
        
        Args:
            user_id: 用户ID
            channel: 频道名称
        """
        if channel in self._subscriptions:
            self._subscriptions[channel].discard(user_id)
        
        if user_id in self._user_channels:
            self._user_channels[user_id].discard(channel)
        
        logger.info(f"用户取消订阅: {user_id} -> {channel}")
    
    def broadcast(self, channel: str, message: WSMessage):
        """
        广播消息到频道
        
        Args:
            channel: 频道名称
            message: 消息内容
        """
        self._message_queue.put(('broadcast', channel, message))
    
    def send_to_user(self, user_id: str, message: WSMessage):
        """
        发送消息给指定用户
        
        Args:
            user_id: 用户ID
            message: 消息内容
        """
        self._message_queue.put(('direct', user_id, message))
    
    def broadcast_all(self, message: WSMessage):
        """
        广播消息给所有连接
        
        Args:
            message: 消息内容
        """
        self._message_queue.put(('all', None, message))
    
    def _process_queue(self):
        """处理消息队列"""
        while self._running:
            try:
                msg_type, target, message = self._message_queue.get(timeout=1)
                
                if msg_type == 'broadcast':
                    self._do_broadcast(target, message)
                elif msg_type == 'direct':
                    self._do_send(target, message)
                elif msg_type == 'all':
                    self._do_send_all(message)
                    
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"处理消息队列失败: {e}")
    
    def _do_broadcast(self, channel: str, message: WSMessage):
        """执行广播"""
        if channel not in self._subscriptions:
            return
        
        json_msg = message.to_json()
        dead_connections = []
        
        for user_id in self._subscriptions[channel]:
            conn = self._connections.get(user_id)
            if conn:
                try:
                    if hasattr(conn, 'send'):
                        conn.send(json_msg)
                except Exception as e:
                    logger.warning(f"发送消息失败: {user_id}, {e}")
                    dead_connections.append(user_id)
        
        # 清理失效连接
        for user_id in dead_connections:
            self.unregister(user_id)
    
    def _do_send(self, user_id: str, message: WSMessage):
        """发送给指定用户"""
        conn = self._connections.get(user_id)
        if conn:
            try:
                if hasattr(conn, 'send'):
                    conn.send(message.to_json())
            except Exception as e:
                logger.warning(f"发送消息失败: {user_id}, {e}")
                self.unregister(user_id)
    
    def _do_send_all(self, message: WSMessage):
        """发送给所有用户"""
        json_msg = message.to_json()
        dead_connections = []
        
        for user_id, conn in self._connections.items():
            try:
                if hasattr(conn, 'send'):
                    conn.send(json_msg)
            except Exception as e:
                logger.warning(f"发送消息失败: {user_id}, {e}")
                dead_connections.append(user_id)
        
        for user_id in dead_connections:
            self.unregister(user_id)
    
    def get_stats(self) -> Dict:
        """获取连接统计"""
        return {
            'total_connections': len(self._connections),
            'total_channels': len(self._subscriptions),
            'subscriptions': {
                channel: len(users) 
                for channel, users in self._subscriptions.items()
            }
        }


class RealtimeQuoteService:
    """
    实时行情推送服务
    """
    
    def __init__(self, connection_manager: ConnectionManager):
        self.cm = connection_manager
        self._quote_cache: Dict[str, Dict] = {}
        self._subscribers: Dict[str, Set[str]] = {}  # code -> set of user_ids
    
    def on_quote_update(self, code: str, quote_data: Dict):
        """
        行情更新回调
        
        Args:
            code: 股票代码
            quote_data: 行情数据
        """
        # 更新缓存
        self._quote_cache[code] = quote_data
        
        # 推送给订阅用户
        channel = f"quote:{code}"
        message = WSMessage(
            type=MessageType.QUOTE.value,
            data={
                'code': code,
                **quote_data
            }
        )
        self.cm.broadcast(channel, message)
    
    def on_batch_quotes_update(self, quotes: Dict[str, Dict]):
        """
        批量行情更新
        
        Args:
            quotes: {code: quote_data} 字典
        """
        for code, quote_data in quotes.items():
            self.on_quote_update(code, quote_data)
    
    def subscribe_quote(self, user_id: str, code: str):
        """订阅行情"""
        channel = f"quote:{code}"
        self.cm.subscribe(user_id, channel)
        
        # 立即发送最新行情
        if code in self._quote_cache:
            message = WSMessage(
                type=MessageType.QUOTE.value,
                data={'code': code, **self._quote_cache[code]}
            )
            self.cm.send_to_user(user_id, message)


class RealtimeOrderService:
    """
    实时订单状态推送服务
    """
    
    def __init__(self, connection_manager: ConnectionManager):
        self.cm = connection_manager
    
    def on_order_created(self, user_id: str, order: Dict):
        """订单创建通知"""
        message = WSMessage(
            type=MessageType.ORDER.value,
            data={
                'action': 'created',
                'order': order
            }
        )
        self.cm.send_to_user(user_id, message)
    
    def on_order_updated(self, user_id: str, order: Dict):
        """订单状态更新"""
        message = WSMessage(
            type=MessageType.ORDER.value,
            data={
                'action': 'updated',
                'order': order
            }
        )
        self.cm.send_to_user(user_id, message)
    
    def on_order_filled(self, user_id: str, order: Dict, fill_info: Dict):
        """订单成交"""
        message = WSMessage(
            type=MessageType.ORDER.value,
            data={
                'action': 'filled',
                'order': order,
                'fill': fill_info
            }
        )
        self.cm.send_to_user(user_id, message)


class RealtimePositionService:
    """
    实时持仓变动推送服务
    """
    
    def __init__(self, connection_manager: ConnectionManager):
        self.cm = connection_manager
    
    def on_position_opened(self, user_id: str, position: Dict):
        """新开持仓"""
        message = WSMessage(
            type=MessageType.POSITION.value,
            data={
                'action': 'opened',
                'position': position
            }
        )
        self.cm.send_to_user(user_id, message)
    
    def on_position_updated(self, user_id: str, position: Dict):
        """持仓更新"""
        message = WSMessage(
            type=MessageType.POSITION.value,
            data={
                'action': 'updated',
                'position': position
            }
        )
        self.cm.send_to_user(user_id, message)
    
    def on_position_closed(self, user_id: str, position: Dict, close_info: Dict):
        """持仓平仓"""
        message = WSMessage(
            type=MessageType.POSITION.value,
            data={
                'action': 'closed',
                'position': position,
                'close': close_info
            }
        )
        self.cm.send_to_user(user_id, message)


class NotificationPushService:
    """
    系统通知推送服务
    """
    
    def __init__(self, connection_manager: ConnectionManager):
        self.cm = connection_manager
    
    def push_notification(self, user_id: str, title: str, content: str, 
                          notification_type: str = 'info', data: Dict = None):
        """
        推送系统通知
        
        Args:
            user_id: 用户ID
            title: 标题
            content: 内容
            notification_type: 类型 (info/warning/error/success)
            data: 附加数据
        """
        message = WSMessage(
            type=MessageType.NOTIFICATION.value,
            data={
                'title': title,
                'content': content,
                'notificationType': notification_type,
                'data': data or {}
            }
        )
        self.cm.send_to_user(user_id, message)
    
    def broadcast_announcement(self, title: str, content: str, level: str = 'info'):
        """
        广播系统公告
        
        Args:
            title: 标题
            content: 内容
            level: 级别
        """
        message = WSMessage(
            type=MessageType.NOTIFICATION.value,
            data={
                'title': title,
                'content': content,
                'notificationType': 'announcement',
                'level': level
            }
        )
        self.cm.broadcast_all(message)


class HeartbeatService:
    """
    心跳服务
    """
    
    def __init__(self, connection_manager: ConnectionManager, interval: int = 30):
        self.cm = connection_manager
        self.interval = interval
        self._thread: Optional[threading.Thread] = None
        self._running = False
    
    def start(self):
        """启动心跳"""
        self._running = True
        self._thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        self._thread.start()
    
    def stop(self):
        """停止心跳"""
        self._running = False
    
    def _heartbeat_loop(self):
        """心跳循环"""
        while self._running:
            try:
                message = WSMessage(
                    type=MessageType.HEARTBEAT.value,
                    data={'server_time': datetime.utcnow().isoformat()}
                )
                self.cm.broadcast_all(message)
                time.sleep(self.interval)
            except Exception as e:
                logger.error(f"心跳异常: {e}")


# 全局连接管理器实例
_connection_manager: Optional[ConnectionManager] = None


def get_connection_manager() -> ConnectionManager:
    """获取全局连接管理器"""
    global _connection_manager
    if _connection_manager is None:
        _connection_manager = ConnectionManager()
        _connection_manager.start()
    return _connection_manager


# 导出
__all__ = [
    'MessageType',
    'WSMessage',
    'ConnectionManager',
    'RealtimeQuoteService',
    'RealtimeOrderService',
    'RealtimePositionService',
    'NotificationPushService',
    'HeartbeatService',
    'get_connection_manager'
]