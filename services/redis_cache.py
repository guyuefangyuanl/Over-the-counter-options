# -*- coding: utf-8 -*-
"""
Redis缓存服务

支持Redis作为分布式缓存，并提供本地内存缓存作为降级方案。

功能特性:
- 分布式缓存（Redis）
- 本地缓存降级
- 缓存预热
- 批量操作
- 缓存穿透/击穿/雪崩防护
"""
import os
import json
import time
import hashlib
import logging
import threading
from typing import Any, Callable, Dict, List, Optional, TypeVar, Union
from functools import wraps
from collections import OrderedDict

logger = logging.getLogger(__name__)
T = TypeVar('T')


class LocalCache:
    """本地内存缓存（LRU + TTL）"""

    def __init__(self, max_size: int = 1000, default_ttl: int = 300):
        self._max_size = max_size
        self._default_ttl = default_ttl
        self._cache: OrderedDict = OrderedDict()
        self._lock = threading.Lock()
        self._hits = 0
        self._misses = 0

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            if key not in self._cache:
                self._misses += 1
                return None

            entry = self._cache[key]
            if time.time() > entry['expires_at']:
                del self._cache[key]
                self._misses += 1
                return None

            self._cache.move_to_end(key)
            self._hits += 1
            return entry['value']

    def set(self, key: str, value: Any, ttl: int = None) -> bool:
        with self._lock:
            expires_at = time.time() + (ttl or self._default_ttl)

            if key in self._cache:
                self._cache[key] = {'value': value, 'expires_at': expires_at}
                self._cache.move_to_end(key)
                return True

            while len(self._cache) >= self._max_size:
                self._cache.popitem(last=False)

            self._cache[key] = {'value': value, 'expires_at': expires_at}
            return True

    def delete(self, key: str) -> bool:
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False

    def delete_pattern(self, pattern: str) -> int:
        count = 0
        with self._lock:
            keys_to_delete = [k for k in self._cache if k.startswith(pattern)]
            for k in keys_to_delete:
                del self._cache[k]
                count += 1
        return count

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()

    def get_stats(self) -> Dict[str, Any]:
        with self._lock:
            total = self._hits + self._misses
            return {
                'type': 'local',
                'size': len(self._cache),
                'max_size': self._max_size,
                'hits': self._hits,
                'misses': self._misses,
                'hit_rate': self._hits / total if total > 0 else 0
            }


class RedisCache:
    """Redis缓存"""

    def __init__(self, redis_url: str = None, prefix: str = 'cache:'):
        self._prefix = prefix
        self._redis = None
        self._enabled = False
        self._hits = 0
        self._misses = 0

        try:
            import redis
            redis_url = redis_url or os.getenv('REDIS_URL', 'redis://localhost:6379/0')
            self._redis = redis.from_url(redis_url, decode_responses=True)
            # 测试连接
            self._redis.ping()
            self._enabled = True
            logger.info(f"Redis缓存已启用: {redis_url}")
        except ImportError:
            logger.warning("Redis库未安装，使用本地缓存")
        except Exception as e:
            logger.warning(f"Redis连接失败: {e}，使用本地缓存")

    def _make_key(self, key: str) -> str:
        return f"{self._prefix}{key}"

    def is_enabled(self) -> bool:
        return self._enabled

    def get(self, key: str) -> Optional[Any]:
        if not self._enabled:
            self._misses += 1
            return None

        try:
            value = self._redis.get(self._make_key(key))
            if value is None:
                self._misses += 1
                return None

            self._hits += 1
            return json.loads(value)
        except Exception as e:
            logger.error(f"Redis get错误: {e}")
            self._misses += 1
            return None

    def set(self, key: str, value: Any, ttl: int = 300) -> bool:
        if not self._enabled:
            return False

        try:
            serialized = json.dumps(value, ensure_ascii=False, default=str)
            self._redis.setex(self._make_key(key), ttl, serialized)
            return True
        except Exception as e:
            logger.error(f"Redis set错误: {e}")
            return False

    def delete(self, key: str) -> bool:
        if not self._enabled:
            return False

        try:
            self._redis.delete(self._make_key(key))
            return True
        except Exception as e:
            logger.error(f"Redis delete错误: {e}")
            return False

    def delete_pattern(self, pattern: str) -> int:
        if not self._enabled:
            return 0

        try:
            keys = self._redis.keys(f"{self._prefix}{pattern}*")
            if keys:
                return self._redis.delete(*keys)
            return 0
        except Exception as e:
            logger.error(f"Redis delete_pattern错误: {e}")
            return 0

    def get_many(self, keys: List[str]) -> Dict[str, Any]:
        if not self._enabled or not keys:
            return {}

        try:
            full_keys = [self._make_key(k) for k in keys]
            values = self._redis.mget(full_keys)
            result = {}
            for key, value in zip(keys, values):
                if value:
                    result[key] = json.loads(value)
                    self._hits += 1
                else:
                    self._misses += 1
            return result
        except Exception as e:
            logger.error(f"Redis get_many错误: {e}")
            return {}

    def set_many(self, mapping: Dict[str, Any], ttl: int = 300) -> bool:
        if not self._enabled or not mapping:
            return False

        try:
            pipe = self._redis.pipeline()
            for key, value in mapping.items():
                serialized = json.dumps(value, ensure_ascii=False, default=str)
                pipe.setex(self._make_key(key), ttl, serialized)
            pipe.execute()
            return True
        except Exception as e:
            logger.error(f"Redis set_many错误: {e}")
            return False

    def incr(self, key: str, amount: int = 1) -> int:
        if not self._enabled:
            return 0

        try:
            return self._redis.incrby(self._make_key(key), amount)
        except Exception as e:
            logger.error(f"Redis incr错误: {e}")
            return 0

    def expire(self, key: str, ttl: int) -> bool:
        if not self._enabled:
            return False

        try:
            return self._redis.expire(self._make_key(key), ttl)
        except Exception as e:
            logger.error(f"Redis expire错误: {e}")
            return False

    def ttl(self, key: str) -> int:
        if not self._enabled:
            return -1

        try:
            return self._redis.ttl(self._make_key(key))
        except Exception as e:
            logger.error(f"Redis ttl错误: {e}")
            return -1

    def clear(self) -> bool:
        if not self._enabled:
            return False

        try:
            keys = self._redis.keys(f"{self._prefix}*")
            if keys:
                self._redis.delete(*keys)
            return True
        except Exception as e:
            logger.error(f"Redis clear错误: {e}")
            return False

    def get_stats(self) -> Dict[str, Any]:
        stats = {
            'type': 'redis',
            'enabled': self._enabled,
            'prefix': self._prefix,
            'hits': self._hits,
            'misses': self._misses,
            'hit_rate': self._hits / (self._hits + self._misses) if (self._hits + self._misses) > 0 else 0
        }

        if self._enabled:
            try:
                info = self._redis.info('memory')
                stats['used_memory'] = info.get('used_memory_human', 'N/A')
                stats['keys'] = len(self._redis.keys(f"{self._prefix}*"))
            except Exception:
                pass

        return stats


class HybridCache:
    """
    混合缓存：Redis + 本地缓存

    - 优先使用本地缓存（更快）
    - Redis作为分布式缓存
    - 自动降级到本地缓存
    """

    def __init__(self, redis_url: str = None, prefix: str = 'app:',
                 local_max_size: int = 1000, local_default_ttl: int = 300):
        self._local = LocalCache(max_size=local_max_size, default_ttl=local_default_ttl)
        self._redis = RedisCache(redis_url=redis_url, prefix=prefix)

    def get(self, key: str) -> Optional[Any]:
        # 先查本地缓存
        value = self._local.get(key)
        if value is not None:
            return value

        # 再查Redis
        value = self._redis.get(key)
        if value is not None:
            # 回填本地缓存
            self._local.set(key, value, ttl=60)  # 本地缓存短一些
            return value

        return None

    def set(self, key: str, value: Any, ttl: int = 300, local_ttl: int = None) -> bool:
        # 同时写入本地和Redis
        self._local.set(key, value, ttl=local_ttl or min(ttl, 60))
        return self._redis.set(key, value, ttl=ttl)

    def delete(self, key: str) -> bool:
        self._local.delete(key)
        return self._redis.delete(key)

    def delete_pattern(self, pattern: str) -> int:
        local_count = self._local.delete_pattern(pattern)
        redis_count = self._redis.delete_pattern(pattern)
        return local_count + redis_count

    def clear(self) -> None:
        self._local.clear()
        self._redis.clear()

    def get_stats(self) -> Dict[str, Any]:
        return {
            'local': self._local.get_stats(),
            'redis': self._redis.get_stats()
        }


# ==================== 缓存装饰器 ====================

def cache_result(
    key_prefix: str,
    ttl: int = 300,
    key_builder: Callable = None,
    cache_instance: Union[HybridCache, LocalCache, RedisCache] = None
):
    """
    缓存结果装饰器

    Args:
        key_prefix: 缓存键前缀
        ttl: 缓存时间（秒）
        key_builder: 自定义键构建函数
        cache_instance: 缓存实例
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        def wrapper(*args, **kwargs) -> T:
            cache = cache_instance or _default_cache

            # 构建缓存键
            if key_builder:
                cache_key = f"{key_prefix}:{key_builder(*args, **kwargs)}"
            else:
                # 默认键构建
                args_hash = hashlib.md5(
                    str(args[1:] if args else args).encode() +
                    str(sorted(kwargs.items())).encode()
                ).hexdigest()[:8]
                cache_key = f"{key_prefix}:{func.__name__}:{args_hash}"

            # 尝试从缓存获取
            result = cache.get(cache_key)
            if result is not None:
                logger.debug(f"缓存命中: {cache_key}")
                return result

            # 执行函数
            result = func(*args, **kwargs)

            # 缓存结果
            if result is not None:
                cache.set(cache_key, result, ttl)
                logger.debug(f"缓存设置: {cache_key}")

            return result

        return wrapper
    return decorator


def cache_aside(
    key_prefix: str,
    ttl: int = 300,
    cache_null: bool = True,
    null_ttl: int = 60
):
    """
    Cache-Aside模式装饰器（防止缓存穿透）

    Args:
        key_prefix: 缓存键前缀
        ttl: 缓存时间
        cache_null: 是否缓存空值
        null_ttl: 空值缓存时间
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        def wrapper(*args, **kwargs) -> T:
            cache = _default_cache

            # 构建键
            args_hash = hashlib.md5(
                str(args).encode() + str(sorted(kwargs.items())).encode()
            ).hexdigest()[:8]
            cache_key = f"{key_prefix}:{func.__name__}:{args_hash}"

            # 查缓存
            result = cache.get(cache_key)

            # 检查是否是空值标记
            if result == "__NULL__":
                return None

            if result is not None:
                return result

            # 查数据库
            result = func(*args, **kwargs)

            # 写缓存
            if result is not None:
                cache.set(cache_key, result, ttl)
            elif cache_null:
                # 缓存空值防止穿透
                cache.set(cache_key, "__NULL__", null_ttl)

            return result

        return wrapper
    return decorator


# ==================== 缓存键生成器 ====================

class CacheKeys:
    """缓存键常量"""

    # 询价相关
    INQUIRY_DETAIL = "inquiry:detail"  # inquiry:detail:{id}
    INQUIRY_LIST = "inquiry:list"  # inquiry:list:{user_id}:{page}
    INQUIRY_STATS = "inquiry:stats"  # inquiry:stats:{user_id}

    # 行情相关
    QUOTE_REALTIME = "quote:realtime"  # quote:realtime:{code}
    QUOTE_HISTORY = "quote:history"  # quote:history:{code}:{date}

    # 推荐相关
    RECOMMEND_STRIKE = "recommend:strike"  # recommend:strike:{code}
    RECOMMEND_TERM = "recommend:term"  # recommend:term:{code}
    RECOMMEND_DEALERS = "recommend:dealers"  # recommend:dealers:{code}

    # 用户相关
    USER_PROFILE = "user:profile"  # user:profile:{user_id}
    USER_PERMISSIONS = "user:permissions"  # user:permissions:{user_id}

    @staticmethod
    def make(*parts) -> str:
        """构建缓存键"""
        return ":".join(str(p) for p in parts)


# ==================== 全局缓存实例 ====================

_default_cache = HybridCache(
    prefix='otc:',
    local_max_size=2000,
    local_default_ttl=120
)


def get_cache() -> HybridCache:
    """获取默认缓存实例"""
    return _default_cache


def init_cache(redis_url: str = None, prefix: str = 'otc:') -> HybridCache:
    """初始化缓存（应用启动时调用）"""
    global _default_cache
    _default_cache = HybridCache(redis_url=redis_url, prefix=prefix)
    return _default_cache


# ==================== 预热函数 ====================

def warm_up_cache(warm_up_funcs: List[Callable] = None):
    """
    缓存预热

    Args:
        warm_up_funcs: 需要预热的函数列表
    """
    logger.info("开始缓存预热...")

    for func in (warm_up_funcs or []):
        try:
            func()
            logger.info(f"预热完成: {func.__name__}")
        except Exception as e:
            logger.error(f"预热失败: {func.__name__}, {e}")

    logger.info("缓存预热完成")