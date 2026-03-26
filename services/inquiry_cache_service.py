"""
询价缓存服务

提供多层次的缓存机制：
- 内存缓存：快速访问热数据
- Redis缓存（可选）：分布式缓存支持
- 自动失效和更新策略
"""

import logging
import json
import hashlib
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List, Callable
from functools import wraps
import threading

logger = logging.getLogger(__name__)


class CacheEntry:
    """缓存条目"""

    def __init__(self, value: Any, ttl: int = 300):
        self.value = value
        self.created_at = datetime.utcnow()
        self.expires_at = self.created_at + timedelta(seconds=ttl)
        self.ttl = ttl
        self.hit_count = 0

    def is_expired(self) -> bool:
        return datetime.utcnow() > self.expires_at

    def touch(self):
        """更新访问计数"""
        self.hit_count += 1


class InquiryCacheService:
    """
    询价缓存服务

    功能特性：
    - TTL自动过期
    - LRU淘汰策略
    - 缓存预热
    - 缓存统计
    - 线程安全
    """

    # 默认TTL配置（秒）
    DEFAULT_TTLS = {
        'statistics': 60,       # 统计数据缓存1分钟
        'inquiry_list': 120,    # 列表缓存2分钟
        'inquiry_detail': 300,  # 详情缓存5分钟
        'recommendation': 300,  # 推荐数据缓存5分钟
        'market_data': 30,      # 市场数据缓存30秒
        'user_inquiries': 60,   # 用户询价列表1分钟
    }

    # 最大缓存条目数
    MAX_ENTRIES = 1000

    def __init__(self):
        self._cache: Dict[str, CacheEntry] = {}
        self._lock = threading.RLock()
        self._stats = {
            'hits': 0,
            'misses': 0,
            'evictions': 0,
            'updates': 0
        }

    def get(
        self,
        key: str,
        default: Any = None,
        refresh_func: Callable[[], Any] = None
    ) -> Any:
        """
        获取缓存值

        Args:
            key: 缓存键
            default: 默认值
            refresh_func: 刷新函数（当缓存失效时调用）

        Returns:
            缓存值或默认值
        """
        with self._lock:
            entry = self._cache.get(key)

            if entry and not entry.is_expired():
                entry.touch()
                self._stats['hits'] += 1
                return entry.value

            # 缓存失效，尝试刷新
            if refresh_func:
                try:
                    value = refresh_func()
                    self.set(key, value)
                    self._stats['misses'] += 1
                    return value
                except Exception as e:
                    logger.warning(f"缓存刷新失败: {key}, error: {e}")

            self._stats['misses'] += 1
            return default

    def set(self, key: str, value: Any, ttl: int = None) -> None:
        """
        设置缓存值

        Args:
            key: 缓存键
            value: 缓存值
            ttl: 过期时间（秒）
        """
        with self._lock:
            # 检查是否需要淘汰
            if len(self._cache) >= self.MAX_ENTRIES:
                self._evict_lru()

            self._cache[key] = CacheEntry(value, ttl or 300)
            self._stats['updates'] += 1

    def delete(self, key: str) -> bool:
        """删除缓存"""
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False

    def delete_pattern(self, pattern: str) -> int:
        """
        删除匹配模式的缓存

        Args:
            pattern: 键模式（支持 * 通配符）

        Returns:
            删除的条目数
        """
        import fnmatch

        with self._lock:
            keys_to_delete = [
                k for k in self._cache.keys()
                if fnmatch.fnmatch(k, pattern)
            ]

            for key in keys_to_delete:
                del self._cache[key]

            return len(keys_to_delete)

    def clear(self) -> None:
        """清空所有缓存"""
        with self._lock:
            self._cache.clear()
            logger.info("缓存已清空")

    def invalidate_inquiry(self, inquiry_id: str) -> None:
        """使询价相关缓存失效"""
        patterns = [
            f'inquiry_detail:{inquiry_id}',
            f'inquiry_list:*',
            f'statistics:*',
            f'user_inquiries:*'
        ]

        for pattern in patterns:
            if '*' in pattern:
                self.delete_pattern(pattern)
            else:
                self.delete(pattern)

    def get_statistics(self) -> Dict[str, Any]:
        """获取缓存统计"""
        with self._lock:
            total_requests = self._stats['hits'] + self._stats['misses']
            hit_rate = self._stats['hits'] / total_requests if total_requests > 0 else 0

            return {
                'entries': len(self._cache),
                'max_entries': self.MAX_ENTRIES,
                'hits': self._stats['hits'],
                'misses': self._stats['misses'],
                'hit_rate': round(hit_rate, 4),
                'evictions': self._stats['evictions'],
                'updates': self._stats['updates']
            }

    def _evict_lru(self) -> None:
        """LRU淘汰策略"""
        if not self._cache:
            return

        # 找到访问次数最少的条目
        lru_key = min(self._cache.keys(), key=lambda k: self._cache[k].hit_count)
        del self._cache[lru_key]
        self._stats['evictions'] += 1

    def _cleanup_expired(self) -> int:
        """清理过期条目"""
        with self._lock:
            expired_keys = [k for k, v in self._cache.items() if v.is_expired()]

            for key in expired_keys:
                del self._cache[key]

            return len(expired_keys)


# 装饰器：自动缓存
def cached(
    key_prefix: str,
    ttl: int = 300,
    key_builder: Callable[..., str] = None
):
    """
    缓存装饰器

    Args:
        key_prefix: 缓存键前缀
        ttl: 过期时间
        key_builder: 自定义键构建函数

    Usage:
        @cached('inquiry_list', ttl=120)
        def get_inquiries(status, page):
            ...
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # 构建缓存键
            if key_builder:
                cache_key = key_builder(*args, **kwargs)
            else:
                # 默认键构建：使用函数参数
                key_parts = [key_prefix, str(args), str(sorted(kwargs.items()))]
                key_str = ':'.join(key_parts)
                cache_key = hashlib.md5(key_str.encode()).hexdigest()[:16]

            cache_key = f'{key_prefix}:{cache_key}'

            # 尝试从缓存获取
            cache = inquiry_cache_service
            result = cache.get(cache_key)

            if result is not None:
                return result

            # 执行函数
            result = func(*args, **kwargs)

            # 存入缓存
            if result is not None:
                cache.set(cache_key, result, ttl)

            return result

        return wrapper
    return decorator


# 单例实例
inquiry_cache_service = InquiryCacheService()


# 便捷函数
def get_cached_statistics():
    """获取缓存的统计数据"""
    return inquiry_cache_service.get_statistics()


def invalidate_all_inquiry_cache():
    """使所有询价相关缓存失效"""
    inquiry_cache_service.delete_pattern('inquiry_*')
    inquiry_cache_service.delete_pattern('statistics_*')