import time
import re
import html
import secrets
import logging
from functools import wraps
from flask import request, g, session, jsonify
from backend_utils.response import flask_error_response

logger = logging.getLogger(__name__)

# Simple in-memory rate limiter
# Key: IP_Endpoint, Value: [timestamps]
_RATE_LIMIT_STORE = {}

# Simple in-memory account lock store
# Key: IP_Account, Value: {"attempts": int, "lock_until": float}
_ACCOUNT_LOCK_STORE = {}
_SMS_CODE_STORE = {}

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

def store_sms_code(phone: str, code: str, sms_type: str, ttl: int = 300):
    key = f"{phone}:{sms_type}"
    _SMS_CODE_STORE[key] = {
        "code": str(code),
        "expires_at": time.time() + ttl,
        "attempts": 0
    }

def check_sms_code(phone: str, code: str, sms_type: str, max_attempts: int = 5):
    key = f"{phone}:{sms_type}"
    record = _SMS_CODE_STORE.get(key)
    if not record:
        return False, "验证码已过期或不存在"
    if time.time() > record.get("expires_at", 0):
        _SMS_CODE_STORE.pop(key, None)
        return False, "验证码已过期或不存在"
    if record.get("attempts", 0) >= max_attempts:
        _SMS_CODE_STORE.pop(key, None)
        return False, "验证码错误次数过多"
    if str(code) != str(record.get("code")):
        record["attempts"] = record.get("attempts", 0) + 1
        _SMS_CODE_STORE[key] = record
        return False, "验证码错误"
    _SMS_CODE_STORE.pop(key, None)
    return True, None


# =============================================================================
# XSS Protection - 输入净化与XSS防护
# =============================================================================

# 危险的HTML标签
DANGEROUS_TAGS = [
    r'<script\b[^>]*>.*?</script>',
    r'<iframe\b[^>]*>.*?</iframe>',
    r'<object\b[^>]*>.*?</object>',
    r'<embed\b[^>]*>.*?</embed>',
    r'<form\b[^>]*>.*?</form>',
    r'<input\b[^>]*>',
    r'<button\b[^>]*>.*?</button>',
    r'<textarea\b[^>]*>.*?</textarea>',
    r'<select\b[^>]*>.*?</select>',
]

# 危险的事件属性
DANGEROUS_EVENTS = r'\s*on\w+\s*='

# 危险的协议
DANGEROUS_PROTOCOLS = r'(javascript|vbscript|data|file):'


def sanitize_input(value: str, max_length: int = None) -> str:
    """
    净化用户输入，防止XSS攻击

    Args:
        value: 需要净化的字符串
        max_length: 最大长度限制

    Returns:
        净化后的安全字符串
    """
    if not isinstance(value, str):
        return value

    # 长度限制
    if max_length and len(value) > max_length:
        value = value[:max_length]

    # HTML实体编码
    value = html.escape(value, quote=True)

    # 移除危险标签
    for pattern in DANGEROUS_TAGS:
        value = re.sub(pattern, '', value, flags=re.IGNORECASE | re.DOTALL)

    # 移除危险事件属性
    value = re.sub(DANGEROUS_EVENTS, '', value, flags=re.IGNORECASE)

    # 移除危险协议
    value = re.sub(DANGEROUS_PROTOCOLS, '', value, flags=re.IGNORECASE)

    return value.strip()


def sanitize_dict(data: dict, exclude_keys: list = None, max_lengths: dict = None) -> dict:
    """
    递归净化字典中的所有字符串值

    Args:
        data: 需要净化的字典
        exclude_keys: 不需要净化的键列表
        max_lengths: 各字段的最大长度映射

    Returns:
        净化后的字典
    """
    if not isinstance(data, dict):
        return data

    exclude_keys = exclude_keys or []
    max_lengths = max_lengths or {}
    result = {}

    for key, value in data.items():
        if key in exclude_keys:
            result[key] = value
        elif isinstance(value, str):
            max_len = max_lengths.get(key)
            result[key] = sanitize_input(value, max_len)
        elif isinstance(value, dict):
            result[key] = sanitize_dict(value, exclude_keys, max_lengths)
        elif isinstance(value, list):
            result[key] = [
                sanitize_dict(item, exclude_keys, max_lengths)
                if isinstance(item, dict)
                else sanitize_input(item, max_lengths.get(key))
                if isinstance(item, str)
                else item
                for item in value
            ]
        else:
            result[key] = value

    return result


# =============================================================================
# CSRF Protection - 跨站请求伪造防护
# =============================================================================

_CSRF_TOKENS = {}  # 生产环境应使用Redis等分布式存储


def generate_csrf_token(session_id: str = None) -> str:
    """
    生成CSRF Token

    Args:
        session_id: 会话ID，用于绑定token

    Returns:
        CSRF Token字符串
    """
    token = secrets.token_urlsafe(32)
    session_id = session_id or 'default'

    # 存储token，有效期30分钟
    _CSRF_TOKENS[token] = {
        'session_id': session_id,
        'expires_at': time.time() + 1800
    }

    return token


def validate_csrf_token(token: str, session_id: str = None) -> bool:
    """
    验证CSRF Token

    Args:
        token: 待验证的token
        session_id: 会话ID

    Returns:
        验证结果
    """
    if not token:
        return False

    record = _CSRF_TOKENS.get(token)
    if not record:
        return False

    # 检查是否过期
    if time.time() > record.get('expires_at', 0):
        del _CSRF_TOKENS[token]
        return False

    # 检查session是否匹配
    session_id = session_id or 'default'
    if record.get('session_id') != session_id:
        return False

    return True


def csrf_protect(f):
    """
    CSRF保护装饰器
    验证请求头中的X-CSRF-Token
    """
    @wraps(f)
    def wrapper(*args, **kwargs):
        token = request.headers.get('X-CSRF-Token') or request.form.get('csrf_token')

        if not token:
            logger.warning(f"CSRF token missing from request")
            return flask_error_response("CSRF验证失败", 403)

        session_id = getattr(g, 'session_id', None)
        if not validate_csrf_token(token, session_id):
            logger.warning(f"CSRF token validation failed: {token[:20]}...")
            return flask_error_response("CSRF验证失败", 403)

        return f(*args, **kwargs)
    return wrapper


# =============================================================================
# Data Masking - 数据脱敏
# =============================================================================

def mask_phone(phone: str) -> str:
    """
    手机号脱敏: 138****8888
    """
    if not phone or len(phone) < 7:
        return phone
    return phone[:3] + '****' + phone[-4:]


def mask_email(email: str) -> str:
    """
    邮箱脱敏: t***@example.com
    """
    if not email or '@' not in email:
        return email
    parts = email.split('@')
    if len(parts[0]) <= 1:
        return '*' + '@' + parts[1]
    return parts[0][0] + '***@' + parts[1]


def mask_id_card(id_card: str) -> str:
    """
    身份证号脱敏: 110***********1234
    """
    if not id_card or len(id_card) < 8:
        return id_card
    return id_card[:3] + '*' * (len(id_card) - 7) + id_card[-4:]


def mask_bank_card(card_no: str) -> str:
    """
    银行卡号脱敏: 6222 **** **** 1234
    """
    if not card_no or len(card_no) < 8:
        return card_no
    return card_no[:4] + ' **** **** ' + card_no[-4:]


def mask_name(name: str) -> str:
    """
    姓名脱敏: 张*
    """
    if not name:
        return name
    if len(name) == 1:
        return name[0] + '*'
    elif len(name) == 2:
        return name[0] + '*'
    else:
        return name[0] + '*' * (len(name) - 1)


# =============================================================================
# Sensitive Operation Verification - 敏感操作二次验证
# =============================================================================

def require_verification(verification_type: str = 'password'):
    """
    敏感操作二次验证装饰器

    Args:
        verification_type: 验证类型 - 'password'(密码) 或 'sms'(短信验证码)

    使用方式:
        @require_verification('password')
        def sensitive_operation():
            ...

    请求时需要在body中包含:
        - password验证: {"verification_password": "用户当前密码"}
        - sms验证: {"verification_code": "短信验证码"}
    """
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            from flask import g, request

            # 获取当前用户
            payload = getattr(g, 'admin', None)
            if not isinstance(payload, dict):
                return flask_error_response("未登录", 401)

            user_id = payload.get('sub')
            role = payload.get('role')

            data = request.get_json(silent=True) or {}

            if verification_type == 'password':
                # 密码验证
                verification_password = data.get('verification_password')
                if not verification_password:
                    return flask_error_response("敏感操作需要验证密码", 403, error_code=2003)

                # 验证密码
                try:
                    from services.auth_service import AuthService
                    auth_service = AuthService()

                    if role == 'user':
                        # 小程序用户
                        user = auth_service.get_user_profile(user_id)
                        if not user:
                            return flask_error_response("用户不存在", 404)

                        stored_hash = user.get('password_hash')
                        if not stored_hash:
                            return flask_error_response("该用户未设置密码，请使用验证码验证", 400)

                        if not auth_service._verify_password(verification_password, stored_hash):
                            return flask_error_response("密码错误，验证失败", 403, error_code=2003)
                    else:
                        # 管理员用户
                        ok, _, _, _ = auth_service.authenticate_admin(user_id, verification_password)
                        if not ok:
                            return flask_error_response("密码错误，验证失败", 403, error_code=2003)

                except Exception as e:
                    logger.error(f"敏感操作验证失败: {e}")
                    return flask_error_response("验证失败", 500)

            elif verification_type == 'sms':
                # 短信验证码验证
                verification_code = data.get('verification_code')
                phone = data.get('verification_phone')

                if not verification_code or not phone:
                    return flask_error_response("敏感操作需要短信验证", 403, error_code=2003)

                # 验证验证码
                ok, err = check_sms_code(phone, str(verification_code), 'sensitive_operation')
                if not ok:
                    return flask_error_response(err or "验证码错误", 403, error_code=2003)

            # 验证通过，移除验证字段后继续执行
            data.pop('verification_password', None)
            data.pop('verification_code', None)
            data.pop('verification_phone', None)

            logger.info(f"敏感操作验证通过: user={user_id}, operation={f.__name__}")
            return f(*args, **kwargs)

        return wrapper
    return decorator


# =============================================================================
# Security Headers - 安全响应头
# =============================================================================

def add_security_headers(response):
    """
    添加安全响应头

    Args:
        response: Flask响应对象

    Returns:
        添加安全头后的响应对象
    """
    # 防止XSS攻击
    response.headers['X-XSS-Protection'] = '1; mode=block'

    # 防止点击劫持
    response.headers['X-Frame-Options'] = 'DENY'

    # 防止MIME类型嗅探
    response.headers['X-Content-Type-Options'] = 'nosniff'

    # 内容安全策略
    response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"

    # HTTPS强制
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'

    # 引用策略
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'

    return response


# =============================================================================
# SQL Injection Detection - SQL注入检测
# =============================================================================

SQL_INJECTION_PATTERNS = [
    r"('|(\-\-)|;|(\|\|)|(\&\&)|(%27)|(%22))",  # 基本注入字符
    r"(union\s+select)",  # Union注入
    r"(insert\s+into)",  # Insert注入
    r"(delete\s+from)",  # Delete注入
    r"(drop\s+table|drop\s+database)",  # Drop注入
    r"(update\s+\w+\s+set)",  # Update注入
    r"(exec\s*\(|execute\s)",  # 执行命令
    r"(xp_cmdshell|sp_executesql)",  # SQL Server扩展
    r"(benchmark\s*\(|sleep\s*\()",  # 时间盲注
    r"(load_file\s*\(|into\s+outfile)",  # 文件操作
    r"(information_schema|sysobjects|syscolumns)",  # 系统表
    r"(or\s+1\s*=\s*1|and\s+1\s*=\s*1)",  # 恒真条件
]


def check_sql_injection(value: str) -> tuple:
    """
    检测字符串是否包含SQL注入

    Args:
        value: 待检测的字符串

    Returns:
        (is_safe, detected_pattern) 元组
    """
    if not isinstance(value, str):
        return True, None

    for pattern in SQL_INJECTION_PATTERNS:
        if re.search(pattern, value, re.IGNORECASE):
            return False, pattern

    return True, None


def validate_request_params(data: dict, check_sql: bool = True) -> tuple:
    """
    验证请求参数安全性

    Args:
        data: 请求数据字典
        check_sql: 是否检查SQL注入

    Returns:
        (is_valid, error_message) 元组
    """
    if not isinstance(data, dict):
        return True, None

    def check_value(v, path=""):
        if isinstance(v, str):
            # XSS检查
            sanitized = sanitize_input(v)
            if sanitized != v:
                return False, f"路径 {path} 包含不安全内容"

            # SQL注入检查
            if check_sql:
                is_safe, pattern = check_sql_injection(v)
                if not is_safe:
                    return False, f"路径 {path} 可能包含SQL注入攻击"

        elif isinstance(v, dict):
            for k, val in v.items():
                result = check_value(val, f"{path}.{k}")
                if result and not result[0]:
                    return result

        elif isinstance(v, list):
            for i, item in enumerate(v):
                result = check_value(item, f"{path}[{i}]")
                if result and not result[0]:
                    return result

        return None

    result = check_value(data)
    if result:
        return result

    return True, None


# =============================================================================
# File Upload Validation - 文件上传验证
# =============================================================================

# 允许的文件类型
ALLOWED_EXTENSIONS = {
    'image': {'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'},
    'document': {'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'},
    'archive': {'zip', 'rar', '7z', 'tar', 'gz'},
}

# 文件大小限制 (字节)
MAX_FILE_SIZES = {
    'image': 10 * 1024 * 1024,  # 10MB
    'document': 50 * 1024 * 1024,  # 50MB
    'archive': 100 * 1024 * 1024,  # 100MB
}

# 危险文件扩展名
DANGEROUS_EXTENSIONS = {
    'exe', 'bat', 'cmd', 'com', 'pif', 'scr', 'vbs', 'js', 'jar',
    'php', 'asp', 'aspx', 'jsp', 'cgi', 'pl', 'py', 'sh', 'bash'
}


def validate_file_upload(filename: str, file_size: int, file_type: str = None) -> tuple:
    """
    验证文件上传安全性

    Args:
        filename: 文件名
        file_size: 文件大小(字节)
        file_type: 文件类型分类 ('image', 'document', 'archive')

    Returns:
        (is_valid, error_message) 元组
    """
    if not filename:
        return False, "文件名不能为空"

    # 获取文件扩展名
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''

    # 检查危险扩展名
    if ext in DANGEROUS_EXTENSIONS:
        logger.warning(f"Dangerous file extension detected: {ext}")
        return False, f"不允许上传 .{ext} 类型的文件"

    # 检查文件类型
    if file_type:
        allowed_exts = ALLOWED_EXTENSIONS.get(file_type, set())
        if ext not in allowed_exts:
            return False, f"不支持的文件类型: .{ext}"

        # 检查文件大小
        max_size = MAX_FILE_SIZES.get(file_type, 10 * 1024 * 1024)
        if file_size > max_size:
            return False, f"文件大小超过限制 ({max_size // (1024*1024)}MB)"

    # 检查文件名中是否包含路径穿越
    if '..' in filename or filename.startswith('/'):
        return False, "文件名包含非法字符"

    return True, None


# =============================================================================
# Security Middleware - 安全中间件
# =============================================================================

class SecurityMiddleware:
    """
    安全中间件类
    提供统一的安全检查接口
    """

    @staticmethod
    def sanitize_request_data(data: dict, exclude_keys: list = None) -> dict:
        """净化请求数据"""
        return sanitize_dict(data, exclude_keys)

    @staticmethod
    def validate_request(data: dict) -> tuple:
        """验证请求安全性"""
        return validate_request_params(data)

    @staticmethod
    def mask_sensitive_data(data: dict, fields: list = None) -> dict:
        """
        脱敏敏感数据

        Args:
            data: 原始数据
            fields: 需要脱敏的字段配置 {'phone': 'phone', 'email': 'email', ...}

        Returns:
            脱敏后的数据
        """
        if not isinstance(data, dict):
            return data

        fields = fields or {}
        result = data.copy()

        # 自动检测并脱敏常见字段
        mask_map = {
            'phone': mask_phone,
            'mobile': mask_phone,
            'tel': mask_phone,
            'email': mask_email,
            'id_card': mask_id_card,
            'idCard': mask_id_card,
            'idcard': mask_id_card,
            'card_no': mask_bank_card,
            'cardNo': mask_bank_card,
            'bank_card': mask_bank_card,
            'name': mask_name,
            'real_name': mask_name,
        }

        for key, value in result.items():
            if key in mask_map and isinstance(value, str):
                result[key] = mask_map[key](value)

        return result

    @staticmethod
    def log_security_event(event_type: str, details: dict):
        """记录安全事件"""
        logger.warning(f"SECURITY_EVENT: type={event_type} details={details}")
