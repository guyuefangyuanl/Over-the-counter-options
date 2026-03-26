# -*- coding: utf-8 -*-
"""
Token黑名单服务

用于存储已注销的JWT Token，防止被重复使用。
支持Redis（生产环境）和内存存储（开发/降级）。
"""

import os
import time
import hashlib
import logging
from typing import Optional, Dict, Any, Set
from datetime import datetime

logger = logging.getLogger(__name__)


class TokenBlacklist:
    """
    Token黑名单管理

    支持两种存储后端:
    1. Redis: 分布式部署推荐
    2. 内存: 单机开发或Redis不可用时降级
    """

    def __init__(self, redis_url: str = None, prefix: str = 'blacklist:'):
        self._prefix = prefix
        self._redis = None
        self._memory_store: Dict[str, float] = {}  # token_hash -> expiry_time
        self._lock = None
        self._enabled = False

        # 尝试连接Redis
        try:
            import redis
            redis_url = redis_url or os.getenv('REDIS_URL')
            if redis_url:
                self._redis = redis.from_url(redis_url, decode_responses=True)
                self._redis.ping()
                self._enabled = True
                logger.info(f"Token黑名单已启用Redis存储: {redis_url[:30]}...")
            else:
                logger.info("未配置REDIS_URL，使用内存存储Token黑名单")
                self._enabled = True
                import threading
                self._lock = threading.Lock()
        except ImportError:
            logger.warning("Redis库未安装，使用内存存储Token黑名单")
            self._enabled = True
            import threading
            self._lock = threading.Lock()
        except Exception as e:
            logger.warning(f"Redis连接失败: {e}，使用内存存储")
            self._enabled = True
            import threading
            self._lock = threading.Lock()

    def _hash_token(self, token: str) -> str:
        """对Token进行哈希，避免存储原始Token"""
        return hashlib.sha256(token.encode()).hexdigest()

    def _make_key(self, token_hash: str) -> str:
        """生成存储键"""
        return f"{self._prefix}{token_hash}"

    def add(self, token: str, expires_in: int = None) -> bool:
        """
        将Token添加到黑名单

        Args:
            token: JWT Token字符串
            expires_in: 过期时间（秒），默认使用Token自身的过期时间

        Returns:
            是否添加成功
        """
        if not token:
            return False

        token_hash = self._hash_token(token)

        # 默认过期时间为24小时（超过Refresh Token的最大有效期）
        if expires_in is None:
            expires_in = 86400

        try:
            if self._redis:
                key = self._make_key(token_hash)
                self._redis.setex(key, expires_in, '1')
                logger.debug(f"Token已加入黑名单: {token_hash[:16]}...")
                return True
            else:
                with self._lock:
                    self._memory_store[token_hash] = time.time() + expires_in
                    self._cleanup_expired()
                logger.debug(f"Token已加入黑名单(内存): {token_hash[:16]}...")
                return True
        except Exception as e:
            logger.error(f"添加Token到黑名单失败: {e}")
            return False

    def is_blacklisted(self, token: str) -> bool:
        """
        检查Token是否在黑名单中

        Args:
            token: JWT Token字符串

        Returns:
            是否在黑名单中
        """
        if not token:
            return False

        token_hash = self._hash_token(token)

        try:
            if self._redis:
                key = self._make_key(token_hash)
                return self._redis.exists(key) > 0
            else:
                with self._lock:
                    expiry = self._memory_store.get(token_hash)
                    if expiry is None:
                        return False
                    if time.time() > expiry:
                        del self._memory_store[token_hash]
                        return False
                    return True
        except Exception as e:
            logger.error(f"检查Token黑名单失败: {e}")
            return False

    def remove(self, token: str) -> bool:
        """
        从黑名单移除Token（一般不需要，等待自动过期）

        Args:
            token: JWT Token字符串

        Returns:
            是否移除成功
        """
        if not token:
            return False

        token_hash = self._hash_token(token)

        try:
            if self._redis:
                key = self._make_key(token_hash)
                self._redis.delete(key)
                return True
            else:
                with self._lock:
                    self._memory_store.pop(token_hash, None)
                return True
        except Exception as e:
            logger.error(f"从黑名单移除Token失败: {e}")
            return False

    def _cleanup_expired(self):
        """清理过期的内存存储条目"""
        now = time.time()
        expired_keys = [k for k, v in self._memory_store.items() if v < now]
        for k in expired_keys:
            del self._memory_store[k]

    def get_stats(self) -> Dict[str, Any]:
        """获取黑名单统计信息"""
        try:
            if self._redis:
                keys = self._redis.keys(f"{self._prefix}*")
                return {
                    'storage': 'redis',
                    'count': len(keys),
                    'enabled': self._enabled
                }
            else:
                self._cleanup_expired()
                return {
                    'storage': 'memory',
                    'count': len(self._memory_store),
                    'enabled': self._enabled
                }
        except Exception as e:
            return {
                'storage': 'unknown',
                'count': 0,
                'enabled': False,
                'error': str(e)
            }

    def clear_all(self) -> bool:
        """清空黑名单（谨慎使用）"""
        try:
            if self._redis:
                keys = self._redis.keys(f"{self._prefix}*")
                if keys:
                    self._redis.delete(*keys)
                return True
            else:
                with self._lock:
                    self._memory_store.clear()
                return True
        except Exception as e:
            logger.error(f"清空黑名单失败: {e}")
            return False


# 全局黑名单实例
_token_blacklist: Optional[TokenBlacklist] = None


def get_token_blacklist() -> TokenBlacklist:
    """获取全局Token黑名单实例"""
    global _token_blacklist
    if _token_blacklist is None:
        _token_blacklist = TokenBlacklist()
    return _token_blacklist


def init_token_blacklist(redis_url: str = None) -> TokenBlacklist:
    """初始化Token黑名单（应用启动时调用）"""
    global _token_blacklist
    _token_blacklist = TokenBlacklist(redis_url=redis_url)
    return _token_blacklist


def blacklist_token(token: str, expires_in: int = None) -> bool:
    """将Token加入黑名单的便捷函数"""
    return get_token_blacklist().add(token, expires_in)


def is_token_blacklisted(token: str) -> bool:
    """检查Token是否在黑名单的便捷函数"""
    return get_token_blacklist().is_blacklisted(token)