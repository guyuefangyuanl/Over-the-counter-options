import time
import logging
from functools import wraps
from flask import request, g
from backend_utils.response import flask_error_response

logger = logging.getLogger(__name__)

# Simple in-memory rate limiter
# Key: IP_Endpoint, Value: [timestamps]
_RATE_LIMIT_STORE = {}

# Simple in-memory account lock store
# Key: IP_Account, Value: {"attempts": int, "lock_until": float}
_ACCOUNT_LOCK_STORE = {}

def rate_limit(limit=5, window=60):
    """
    Simple rate limiter decorator.
    limit: max requests
    window: time window in seconds
    """
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            ip = request.remote_addr
            endpoint = request.endpoint
            key = f"{ip}:{endpoint}"
            
            now = time.time()
            
            # Clean up old timestamps
            history = _RATE_LIMIT_STORE.get(key, [])
            history = [t for t in history if now - t < window]
            
            if len(history) >= limit:
                logger.warning(f"Rate limit exceeded for {key}")
                return flask_error_response("请求过于频繁，请稍后再试", 429)
            
            history.append(now)
            _RATE_LIMIT_STORE[key] = history
            
            return f(*args, **kwargs)
        return wrapper
    return decorator

def check_account_lock(account_identifier: str, ip: str = None) -> bool:
    """Check if account is locked"""
    key = f"{ip or 'unknown'}:{account_identifier}"
    record = _ACCOUNT_LOCK_STORE.get(key)
    if not record:
        return False
        
    if time.time() < record.get("lock_until", 0):
        return True
        
    # Lock expired
    if "lock_until" in record:
        del _ACCOUNT_LOCK_STORE[key]
    return False

def record_login_attempt(account_identifier: str, success: bool, ip: str = None):
    """Record login attempt to handle locking"""
    key = f"{ip or 'unknown'}:{account_identifier}"
    now = time.time()
    
    if success:
        if key in _ACCOUNT_LOCK_STORE:
            del _ACCOUNT_LOCK_STORE[key]
        return
        
    record = _ACCOUNT_LOCK_STORE.get(key, {"attempts": 0, "lock_until": 0})
    
    # If already locked, don't increment
    if now < record["lock_until"]:
        return

    record["attempts"] += 1
    
    # Lock policy: 5 failed attempts -> 15 min lock
    if record["attempts"] >= 5:
        record["lock_until"] = now + 900 # 15 mins
        logger.warning(f"Account {account_identifier} locked due to too many failed attempts from {ip}")
        
    _ACCOUNT_LOCK_STORE[key] = record

def audit_log(action: str):
    """
    Audit logging decorator.
    Logs user action, IP, and status.
    """
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            user_id = "anonymous"
            if hasattr(g, 'admin') and g.admin:
                user_id = g.admin.get('sub', 'unknown')
            
            ip = request.remote_addr
            
            logger.info(f"AUDIT: User={user_id} IP={ip} Action={action} Status=STARTED")
            
            try:
                response = f(*args, **kwargs)
                # Try to determine success from response
                status = "SUCCESS"
                if hasattr(response, 'status_code') and response.status_code >= 400:
                    status = "FAILED"
                
                logger.info(f"AUDIT: User={user_id} IP={ip} Action={action} Status={status}")
                return response
            except Exception as e:
                logger.error(f"AUDIT: User={user_id} IP={ip} Action={action} Status=ERROR Error={str(e)}")
                raise e
        return wrapper
    return decorator
