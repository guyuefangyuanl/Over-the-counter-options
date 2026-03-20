# -*- coding: utf-8 -*-
"""
简单的内存缓存模块，用于缓存频繁访问的数据
支持 TTL（生存时间）和 LRU 淘汰策略
"""
import threading
import time
from collections import OrderedDict
from typing import Any, Callable, Dict, Optional, TypeVar

T = TypeVar('T')


class SimpleCache:
    """
    线程安全的 LRU 缓存，支持 TTL
    """
    
    def __init__(self, max_size: int = 100, default_ttl: float = 60.0):
        """
        Args:
            max_size: 最大缓存条目数
            default_ttl: 默认过期时间（秒）
        """
        self._max_size = max_size
        self._default_ttl = default_ttl
        self._cache: OrderedDict[str, Dict[str, Any]] = OrderedDict()
        self._lock = threading.Lock()
        self._hits = 0
        self._misses = 0
    
    def get(self, key: str) -> Optional[Any]:
        """获取缓存值"""
        with self._lock:
            if key not in self._cache:
                self._misses += 1
                return None
            
            entry = self._cache[key]
            # 检查是否过期
            if time.time() > entry['expires_at']:
                del self._cache[key]
                self._misses += 1
                return None
            
            # 移动到末尾（最近使用）
            self._cache.move_to_end(key)
            self._hits += 1
            return entry['value']
    
    def set(self, key: str, value: Any, ttl: Optional[float] = None) -> None:
        """设置缓存值"""
        with self._lock:
            expires_at = time.time() + (ttl if ttl is not None else self._default_ttl)
            
            # 如果键已存在，更新值
            if key in self._cache:
                self._cache[key]['value'] = value
                self._cache[key]['expires_at'] = expires_at
                self._cache.move_to_end(key)
                return
            
            # 检查是否需要淘汰
            while len(self._cache) >= self._max_size:
                self._cache.popitem(last=False)
            
            self._cache[key] = {
                'value': value,
                'expires_at': expires_at,
                'created_at': time.time()
            }
    
    def delete(self, key: str) -> bool:
        """删除缓存条目"""
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False
    
    def clear(self) -> None:
        """清空缓存"""
        with self._lock:
            self._cache.clear()
    
    def invalidate_pattern(self, pattern: str) -> int:
        """删除匹配模式的所有键（简单前缀匹配）"""
        count = 0
        with self._lock:
            keys_to_delete = [k for k in self._cache.keys() if k.startswith(pattern)]
            for k in keys_to_delete:
                del self._cache[k]
                count += 1
        return count
    
    def get_stats(self) -> Dict[str, Any]:
        """获取缓存统计信息"""
        with self._lock:
            total = self._hits + self._misses
            hit_rate = self._hits / total if total > 0 else 0
            return {
                'size': len(self._cache),
                'max_size': self._max_size,
                'hits': self._hits,
                'misses': self._misses,
                'hit_rate': hit_rate,
            }


def cached(
    cache: SimpleCache,
    key_prefix: str = "",
    ttl: Optional[float] = None,
    key_builder: Optional[Callable[..., str]] = None
):
    """
    缓存装饰器
    
    Args:
        cache: 缓存实例
        key_prefix: 键前缀
        ttl: 过期时间
        key_builder: 自定义键构建函数
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        def wrapper(*args, **kwargs) -> T:
            # 构建缓存键
            if key_builder:
                cache_key = f"{key_prefix}:{key_builder(*args, **kwargs)}"
            else:
                # 默认使用函数名和参数构建键
                args_str = ",".join(str(a) for a in args[1:])  # 跳过 self
                kwargs_str = ",".join(f"{k}={v}" for k, v in sorted(kwargs.items()))
                cache_key = f"{key_prefix}:{func.__name__}:{args_str}:{kwargs_str}"
            
            # 尝试从缓存获取
            result = cache.get(cache_key)
            if result is not None:
                return result
            
            # 执行函数并缓存结果
            result = func(*args, **kwargs)
            if result is not None:
                cache.set(cache_key, result, ttl)
            
            return result
        
        return wrapper
    return decorator


# 全局缓存实例
_quotes_cache = SimpleCache(max_size=200, default_ttl=30.0)  # 行情缓存 30 秒
_stats_cache = SimpleCache(max_size=50, default_ttl=60.0)    # 统计缓存 60 秒


def get_quotes_cache() -> SimpleCache:
    """获取行情缓存实例"""
    return _quotes_cache


def get_stats_cache() -> SimpleCache:
    """获取统计缓存实例"""
    return _stats_cache


def invalidate_quotes_cache() -> None:
    """使行情缓存失效"""
    _quotes_cache.clear()


def invalidate_stats_cache() -> None:
    """使统计缓存失效"""
    _stats_cache.clear()