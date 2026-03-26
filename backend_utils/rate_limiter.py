# -*- coding: utf-8 -*-
"""
分布式限流器模块
支持 Redis 和内存两种模式，适用于单机或分布式部署
"""

import time
import logging
import os
from functools import wraps
from typing import Optional, Callable, Any
from flask import request, g

logger = logging.getLogger(__name__)

# 尝试导入 redis
try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    logger.warning("Redis 未安装，将使用内存限流器（不支持分布式）")


class RateLimiterBackend:
    """限流器后端抽象类"""
    
    def is_allowed(self, key: str, limit: int, window: int) -> tuple:
        """
        检查请求是否被允许
        
        Args:
            key: 限流键（如 IP:endpoint）
            limit: 最大请求数
            window: 时间窗口（秒）
            
        Returns:
            (is_allowed: bool, remaining: int, reset_time: int)
        """
        raise NotImplementedError
    
    def reset(self, key: str) -> None:
        """重置限流计数"""
        raise NotImplementedError


class MemoryRateLimiter(RateLimiterBackend):
    """内存限流器（单机模式）"""
    
    def __init__(self):
        self._store: dict = {}
    
    def is_allowed(self, key: str, limit: int, window: int) -> tuple:
        now = time.time()
        
        # 获取历史请求时间戳
        history = self._store.get(key, [])
        
        # 清理过期记录
        history = [t for t in history if now - t < window]
        
        # 检查是否超限
        if len(history) >= limit:
            oldest = min(history) if history else now
            reset_time = int(oldest + window - now)
            return False, 0, max(0, reset_time)
        
        # 记录本次请求
        history.append(now)
        self._store[key] = history
        
        remaining = limit - len(history)
        return True, remaining, window
    
    def reset(self, key: str) -> None:
        self._store.pop(key, None)


class RedisRateLimiter(RateLimiterBackend):
    """Redis 限流器（分布式模式）
    
    使用滑动窗口算法实现精确限流
    """
    
    def __init__(self, redis_url: str = None, redis_client: Any = None):
        if not REDIS_AVAILABLE:
            raise ImportError("Redis 未安装，请运行: pip install redis")
        
        if redis_client:
            self._redis = redis_client
        elif redis_url:
            self._redis = redis.from_url(redis_url, decode_responses=True)
        else:
            self._redis = redis.Redis(decode_responses=True)
        
        # 测试连接
        try:
            self._redis.ping()
            logger.info("Redis 限流器初始化成功")
        except redis.ConnectionError as e:
            logger.error(f"Redis 连接失败: {e}")
            raise
    
    def is_allowed(self, key: str, limit: int, window: int) -> tuple:
        now = time.time()
        window_start = now - window
        
        pipe = self._redis.pipeline()
        
        # 使用 Sorted Set 实现滑动窗口
        # 1. 移除过期记录
        pipe.zremrangebyscore(key, 0, window_start)
        
        # 2. 获取当前计数
        pipe.zcard(key)
        
        # 3. 添加新记录
        pipe.zadd(key, {str(now): now})
        
        # 4. 设置过期时间
        pipe.expire(key, window + 1)
        
        results = pipe.execute()
        current_count = results[1]
        
        if current_count >= limit:
            # 获取最早的请求时间，计算重置时间
            oldest = self._redis.zrange(key, 0, 0, withscores=True)
            if oldest:
                reset_time = int(oldest[0][1] + window - now)
            else:
                reset_time = window
            
            return False, 0, max(0, reset_time)
        
        remaining = limit - current_count - 1
        return True, remaining, window
    
    def reset(self, key: str) -> None:
        self._redis.delete(key)


class RateLimiter:
    """
    统一限流器接口
    
    自动选择 Redis 或内存模式：
    - 如果配置了 REDIS_URL 且 Redis 可用，使用 Redis
    - 否则使用内存模式
    """
    
    _instance: Optional['RateLimiter'] = None
    _backend: Optional[RateLimiterBackend] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._init_backend()
        return cls._instance
    
    def _init_backend(self):
        """初始化限流器后端"""
        redis_url = os.getenv('REDIS_URL')
        
        if redis_url and REDIS_AVAILABLE:
            try:
                self._backend = RedisRateLimiter(redis_url)
                logger.info("使用 Redis 限流器（分布式模式）")
            except Exception as e:
                logger.warning(f"Redis 限流器初始化失败，降级为内存模式: {e}")
                self._backend = MemoryRateLimiter()
        else:
            self._backend = MemoryRateLimiter()
            logger.info("使用内存限流器（单机模式）")
    
    def is_allowed(self, key: str, limit: int, window: int) -> tuple:
        return self._backend.is_allowed(key, limit, window)
    
    def reset(self, key: str) -> None:
        self._backend.reset(key)


# 全局限流器实例
_limiter: Optional[RateLimiter] = None


def get_limiter() -> RateLimiter:
    """获取全局限流器实例"""
    global _limiter
    if _limiter is None:
        _limiter = RateLimiter()
    return _limiter


def rate_limit(limit: int = 5, window: int = 60, key_func: Callable = None):
    """
    限流装饰器
    
    Args:
        limit: 时间窗口内最大请求数
        window: 时间窗口（秒）
        key_func: 自定义键生成函数，默认使用 IP:endpoint
        
    Returns:
        装饰器函数
        
    使用示例:
        @rate_limit(limit=10, window=60)
        def my_api():
            return {"data": "ok"}
        
        # 自定义键（如按用户限流）
        @rate_limit(limit=100, window=3600, key_func=lambda: g.user_id)
        def user_api():
            return {"data": "ok"}
    """
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            # 生成限流键
            if key_func:
                key_base = key_func()
            else:
                ip = request.remote_addr or 'unknown'
                endpoint = request.endpoint or 'unknown'
                key_base = f"{ip}:{endpoint}"
            
            key = f"rate_limit:{key_base}"
            
            # 检查限流
            limiter = get_limiter()
            is_allowed, remaining, reset_time = limiter.is_allowed(key, limit, window)
            
            if not is_allowed:
                logger.warning(f"请求限流: {key_base}, {limit}/{window}s")
                from backend_utils.response import flask_error_response
                response = flask_error_response(
                    f"请求过于频繁，请 {reset_time} 秒后重试",
                    429
                )
                # 添加限流相关的响应头
                response[0].headers['X-RateLimit-Limit'] = str(limit)
                response[0].headers['X-RateLimit-Remaining'] = '0'
                response[0].headers['X-RateLimit-Reset'] = str(reset_time)
                return response
            
            # 执行原函数
            result = f(*args, **kwargs)
            
            # 添加限流响应头
            if hasattr(result, '__iter__') and len(result) == 2:
                response, status = result
                if hasattr(response, 'headers'):
                    response.headers['X-RateLimit-Limit'] = str(limit)
                    response.headers['X-RateLimit-Remaining'] = str(remaining)
                    response.headers['X-RateLimit-Reset'] = str(reset_time)
            
            return result
        
        return wrapper
    return decorator


def reset_rate_limit(key: str) -> None:
    """
    重置指定键的限流计数
    
    Args:
        key: 要重置的键
    """
    limiter = get_limiter()
    limiter.reset(f"rate_limit:{key}")