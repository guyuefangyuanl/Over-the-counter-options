from __future__ import annotations

import os
import time
import jwt
import logging
from datetime import datetime
from functools import wraps
from typing import Any, Callable, Dict, Optional, TypeVar, cast

from flask import Blueprint, g, request, current_app
from backend_utils.response import flask_error_response, flask_success_response
from backend_utils.security import rate_limit, audit_log, store_sms_code, check_sms_code
from services.auth_service import AuthService
from services.token_blacklist import is_token_blacklisted, blacklist_token

auth_bp = Blueprint("auth", __name__)
logger = logging.getLogger(__name__)

# 延迟初始化 auth_service，确保环境变量已加载
_auth_service = None

def get_auth_service() -> AuthService:
    """获取 AuthService 实例（延迟初始化）"""
    global _auth_service
    if _auth_service is None:
        _auth_service = AuthService()
    return _auth_service

# 创建一个代理类，让 auth_service 可以像原来一样使用
class AuthServiceProxy:
    """代理类，延迟初始化 AuthService"""
    def __getattr__(self, name):
        return getattr(get_auth_service(), name)

auth_service = AuthServiceProxy()

F = TypeVar("F", bound=Callable[..., Any])

def _get_bearer_token() -> Optional[str]:
    raw = request.headers.get("Authorization", "")
    # logger.info(f"Checking Auth Header: {raw}")
    if not raw or not isinstance(raw, str):
        logger.warning("Missing or invalid Authorization header")
        return None
    if not raw.startswith("Bearer "):
        logger.warning("Authorization header does not start with Bearer")
        return None
    token = raw[len("Bearer ") :].strip()
    return token or None

def require_auth(fn: F) -> F:
    @wraps(fn)
    def wrapper(*args: Any, **kwargs: Any):
        token = _get_bearer_token()
        if not token:
            logger.warning("Request rejected: No token provided")
            return flask_error_response("未登录或登录已过期", 401)

        # 检查Token是否在黑名单中
        if is_token_blacklisted(token):
            logger.warning("Request rejected: Token is blacklisted")
            return flask_error_response("登录已失效，请重新登录", 401)

        try:
            # Decode token using service's secret config
            payload = jwt.decode(token, auth_service.jwt_secret, algorithms=[auth_service.jwt_algorithm])
        except jwt.ExpiredSignatureError:
            logger.warning("Request rejected: Token expired")
            return flask_error_response("登录已过期，请重新登录", 401)
        except jwt.InvalidTokenError as e:
            logger.warning(f"Request rejected: Invalid token - {str(e)}")
            return flask_error_response("无效的登录凭证", 401)

        # 检查游客权限
        role = payload.get('role', 'viewer')
        if role == 'guest' and request.method not in ['GET', 'HEAD', 'OPTIONS']:
            return flask_error_response("游客模式仅支持查看功能，请注册登录后使用完整功能", 403)

        g.admin = payload
        g._token = token  # 保存token供logout使用
        return fn(*args, **kwargs)

    return cast(F, wrapper)

def require_roles(*allowed_roles: str):
    # 延迟计算 allowed roles，确保 auth_service 已初始化
    def decorator(fn: F) -> F:
        @wraps(fn)
        def wrapper(*args: Any, **kwargs: Any):
            # 在运行时计算允许的角色
            allowed = {get_auth_service()._normalize_role(r) for r in allowed_roles if isinstance(r, str)}
            payload = getattr(g, "admin", None)
            if not isinstance(payload, dict):
                return flask_error_response("未登录或登录已过期", 401)
            role = get_auth_service()._normalize_role(str(payload.get("role") or "viewer"))
            if role not in allowed:
                logger.warning(f"[require_roles] 权限不足: 用户 {payload.get('sub')} 角色 {role} 不在允许的角色列表 {allowed} 中")
                return flask_error_response(f"权限不足：当前角色({role})无权访问此功能。如需操作权限，请使用微信登录或联系管理员。", 403)
            return fn(*args, **kwargs)

        return cast(F, wrapper)

    return decorator

@auth_bp.route("/login", methods=["POST"])
@rate_limit(limit=5, window=60)  # 添加限流保护：每分钟最多5次尝试
@audit_log("ADMIN_LOGIN")
def admin_login():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return flask_error_response("用户名和密码不能为空", 400)

    ok, role, err, require_password_change = auth_service.authenticate_admin(username, password)
    if not ok:
        return flask_error_response(err or "登录失败", 401)

    token_data = auth_service.issue_token(username, role)

    response_data = {
        "token": token_data["token"],
        "tokenType": "Bearer",
        "expiresIn": auth_service.jwt_expires_seconds,
        "role": role,
    }

    # 如果需要修改密码，在响应中添加提示
    if require_password_change:
        response_data["requirePasswordChange"] = True
        return flask_success_response(
            data=response_data,
            message="登录成功，但您正在使用默认密码，请尽快修改密码"
        )

    return flask_success_response(
        data=response_data,
        message="登录成功",
    )

@auth_bp.route("/logout", methods=["POST"])
@require_auth
def logout():
    """用户登出，将Token加入黑名单"""
    token = getattr(g, '_token', None)
    if token:
        # 将Token加入黑名单，过期时间设置为Token的剩余有效期
        try:
            payload = jwt.decode(token, auth_service.jwt_secret, algorithms=[auth_service.jwt_algorithm])
            exp = payload.get('exp', 0)
            now = int(time.time())
            expires_in = max(exp - now, 0) if exp > now else 86400  # 至少24小时
        except Exception:
            expires_in = 86400  # 默认24小时

        blacklist_token(token, expires_in)
        logger.info(f"用户登出成功: {getattr(g.admin, 'get', lambda k: None)('sub') if hasattr(g, 'admin') else 'unknown'}")

    return flask_success_response(message="登出成功")


@auth_bp.route("/me", methods=["GET"])
@require_auth
def admin_me():
    payload = getattr(g, "admin", None)
    if not isinstance(payload, dict):
        return flask_error_response("未登录", 401)
    
    username = payload.get("sub")
    role = payload.get("role")
    
    if role == 'user':
        try:
            user = auth_service.get_user_profile(username)
        except Exception as e:
            logger.warning(f"[/auth/me] 查询用户资料失败（DB不可用），降级返回Token数据: {e}")
            user = None
        
        if user:
            return flask_success_response(
                data={
                    "username": username,
                    "role": role,
                    "nickname": user.get('nickname', '微信用户'),
                    "avatar": user.get('avatar', ''),
                    "phone": user.get('phone', ''),
                    "openid": user.get('openid'),
                    "unionid": user.get('unionid')
                }
            )
        # DB 不可用时降级：用 Token payload 中的数据返回
        return flask_success_response(
            data={
                "username": username,
                "role": role,
                "nickname": "微信用户",
                "avatar": "",
                "phone": "",
                "openid": username
            }
        )
    
    return flask_success_response(
        data={
            "username": username,
            "role": role,
        }
    )

@auth_bp.route("/me", methods=["PUT"])
@require_auth
def update_profile():
    payload = getattr(g, "admin", None)
    username = payload.get("sub")
    role = payload.get("role")
    
    if role != 'user':
        return flask_error_response("只有普通用户可以修改个人资料", 403)
        
    data = request.get_json() or {}
    success = auth_service.update_user_profile(username, data)
    
    if success:
        return flask_success_response(message="更新成功")
    else:
        return flask_success_response(message="没有数据被修改")

@auth_bp.route("/account/delete", methods=["POST"])
@require_auth
@rate_limit(limit=3, window=60)
@audit_log("ACCOUNT_DELETE")
def delete_account():
    """
    用户注销账户

    需要:
    1. 用户确认密码或验证码
    2. 管理员无需确认（仅用于测试）
    """
    payload = getattr(g, "admin", None)
    if not isinstance(payload, dict):
        return flask_error_response("未登录", 401)

    username = payload.get("sub")
    role = payload.get("role")

    data = request.get_json(silent=True) or {}
    confirmation = data.get("confirmation")  # "DELETE_MY_ACCOUNT"

    # 需要用户输入确认文本
    if confirmation != "DELETE_MY_ACCOUNT":
        return flask_error_response('请输入 "DELETE_MY_ACCOUNT" 确认注销账户', 400)

    try:
        model = auth_service._get_model()

        if role == 'user':
            # 小程序用户注销
            user = model.find_user_by_openid(username)
            if not user:
                return flask_error_response("用户不存在", 404)

            # 软删除：标记为已删除而非真正删除
            success = model.update_user_profile(username, {
                "status": "deleted",
                "deleted_at": datetime.utcnow().isoformat()
            })

            # 撤销所有会话
            sessions = model.list_sessions(username)
            for session in sessions:
                model.revoke_session(session.get('_id'))

        else:
            # 管理员账户不能自己注销自己
            if username == auth_service.admin_username:
                return flask_error_response("不能注销主管理员账户", 403)

            success = model.delete_admin_user(username)

        if success:
            # 将当前Token加入黑名单
            token = getattr(g, '_token', None)
            if token:
                blacklist_token(token, 86400)

            logger.info(f"账户已注销: {username}")
            return flask_success_response(message="账户已注销")

        return flask_error_response("注销失败", 500)

    except Exception as e:
        logger.error(f"注销账户失败: {e}")
        return flask_error_response("注销账户失败", 500)


# ========== 登录设备管理 ==========

@auth_bp.route("/sessions", methods=["GET"])
@require_auth
def list_sessions():
    """获取当前用户的登录设备列表"""
    payload = getattr(g, "admin", None)
    if not isinstance(payload, dict):
        return flask_error_response("未登录", 401)

    user_id = payload.get("sub")

    try:
        model = auth_service._get_model()
        sessions = model.list_sessions(user_id)

        # 获取当前会话ID（用于标记当前设备）
        current_token = getattr(g, '_token', None)
        current_token_hash = None
        if current_token:
            import hashlib
            current_token_hash = hashlib.sha256(current_token.encode()).hexdigest()

        # 处理会话数据，脱敏并添加标记
        processed_sessions = []
        for session in sessions:
            processed = {
                "id": session.get("_id"),
                "device_info": session.get("device_info", "未知设备"),
                "ip": session.get("ip", ""),
                "created_at": session.get("created_at"),
                "is_current": session.get("refresh_token_hash") == current_token_hash
            }
            processed_sessions.append(processed)

        return flask_success_response(data={
            "sessions": processed_sessions,
            "total": len(processed_sessions)
        })

    except Exception as e:
        logger.error(f"获取会话列表失败: {e}")
        return flask_error_response("获取设备列表失败", 500)


@auth_bp.route("/sessions/<session_id>", methods=["DELETE"])
@require_auth
@rate_limit(limit=10, window=60)
def revoke_session(session_id: str):
    """撤销指定登录设备的会话"""
    payload = getattr(g, "admin", None)
    if not isinstance(payload, dict):
        return flask_error_response("未登录", 401)

    user_id = payload.get("sub")

    try:
        model = auth_service._get_model()

        # 验证会话属于当前用户
        sessions = model.list_sessions(user_id)
        session_ids = [s.get("_id") for s in sessions]

        if session_id not in session_ids:
            return flask_error_response("会话不存在或无权操作", 404)

        # 撤销会话
        model.revoke_session(session_id)

        logger.info(f"会话已撤销: {session_id}, 用户: {user_id}")
        return flask_success_response(message="设备已登出")

    except Exception as e:
        logger.error(f"撤销会话失败: {e}")
        return flask_error_response("撤销登录设备失败", 500)


@auth_bp.route("/sessions/all", methods=["DELETE"])
@require_auth
@rate_limit(limit=3, window=60)
def revoke_all_sessions():
    """撤销所有其他登录设备（保留当前设备）"""
    payload = getattr(g, "admin", None)
    if not isinstance(payload, dict):
        return flask_error_response("未登录", 401)

    user_id = payload.get("sub")
    current_token = getattr(g, '_token', None)

    try:
        model = auth_service._get_model()
        sessions = model.list_sessions(user_id)

        # 获取当前Token哈希
        current_token_hash = None
        if current_token:
            import hashlib
            current_token_hash = hashlib.sha256(current_token.encode()).hexdigest()

        revoked_count = 0
        for session in sessions:
            # 不撤销当前会话
            if session.get("refresh_token_hash") != current_token_hash:
                model.revoke_session(session.get("_id"))
                revoked_count += 1

        logger.info(f"已撤销 {revoked_count} 个其他设备, 用户: {user_id}")
        return flask_success_response(
            data={"revoked_count": revoked_count},
            message=f"已登出 {revoked_count} 个其他设备"
        )

    except Exception as e:
        logger.error(f"撤销所有会话失败: {e}")
        return flask_error_response("操作失败", 500)


@auth_bp.route("/users", methods=["GET"])
@require_auth
@require_roles("admin")
def list_admin_users():
    users = auth_service.list_admin_users()
    return flask_success_response(data=users)

@auth_bp.route("/wx-users", methods=["GET"])
@require_auth
@require_roles("admin", "editor")
def list_wx_users():
    """获取小程序用户列表（分页）"""
    try:
        page = int(request.args.get('page', 1))
        page_size = int(request.args.get('pageSize', 10))
        keyword = request.args.get('keyword', '')
        
        users, total = auth_service.list_wx_users(page, page_size, keyword)
        
        return flask_success_response(
            data={
                'items': users,
                'pagination': {
                    'page': page,
                    'per_page': page_size,
                    'total': total,
                }
            }
        )
    except Exception as e:
        logger.error(f"获取小程序用户列表失败: {e}")
        return flask_error_response(str(e), 500)

@auth_bp.route("/wx-users/<openid>", methods=["GET"])
@require_auth
@require_roles("admin", "editor")
def get_wx_user(openid: str):
    """获取小程序用户详情"""
    try:
        user = auth_service.get_user_profile(openid)
        if not user:
            return flask_error_response("用户不存在", 404)
        
        # 移除敏感信息
        user.pop('password_hash', None)
        
        return flask_success_response(data=user)
    except Exception as e:
        logger.error(f"获取小程序用户详情失败: {e}")
        return flask_error_response(str(e), 500)

@auth_bp.route("/wx-users/<openid>", methods=["PUT"])
@require_auth
@require_roles("admin")
def update_wx_user(openid: str):
    """更新小程序用户信息"""
    try:
        data = request.get_json() or {}
        
        # 限制可更新的字段
        allowed_fields = ['nickname', 'phone', 'email', 'status', 'balance', 'remark']
        updates = {k: v for k, v in data.items() if k in allowed_fields}
        
        if not updates:
            return flask_success_response(message="没有数据被修改")
        
        success = auth_service.update_user_profile(openid, updates)
        
        if success:
            return flask_success_response(message="更新成功")
        else:
            return flask_error_response("更新失败", 500)
    except Exception as e:
        logger.error(f"更新小程序用户失败: {e}")
        return flask_error_response(str(e), 500)

@auth_bp.route("/wx-users/<openid>/balance", methods=["POST"])
@require_auth
@require_roles("admin")
def adjust_wx_user_balance(openid: str):
    """调整用户余额"""
    try:
        data = request.get_json() or {}
        amount = float(data.get('amount', 0))
        remark = data.get('remark', '管理员调整')
        
        if amount == 0:
            return flask_error_response("调整金额不能为0", 400)
        
        from services.trade_service import TradeService
        trade_service = TradeService()
        
        if amount > 0:
            new_balance = trade_service.deposit(openid, amount, remark=remark)
        else:
            new_balance = trade_service.withdraw(openid, abs(amount), remark=remark)
        
        return flask_success_response(
            data={"balance": new_balance},
            message=f"余额调整成功，当前余额: {new_balance}"
        )
    except ValueError as e:
        return flask_error_response(str(e), 400)
    except Exception as e:
        logger.error(f"调整用户余额失败: {e}")
        return flask_error_response(str(e), 500)

@auth_bp.route("/users", methods=["POST"])
@require_auth
@require_roles("admin")
def upsert_admin_user():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")
    role = data.get("role", "viewer")

    if not username or not password:
        return flask_error_response("用户名和密码不能为空", 400)

    try:
        saved = auth_service.upsert_admin_user(username.strip(), password, role)
        return flask_success_response(data=saved, message="保存成功")
    except Exception as e:
        return flask_error_response(str(e), 500)

@auth_bp.route("/users/<username>", methods=["DELETE"])
@require_auth
@require_roles("admin")
def delete_admin_user(username: str):
    payload = getattr(g, "admin", None)
    current_username = payload.get("sub")
    if current_username == username:
        return flask_error_response("不能删除当前登录账号", 400)
    
    deleted = auth_service.delete_admin_user(username)
    if not deleted:
        return flask_error_response("账号不存在", 404)
    return flask_success_response(message="删除成功")

@auth_bp.route("/captcha/image", methods=["GET"])
def get_captcha_image():
    from services.captcha_service import CaptchaService
    text, image_b64 = CaptchaService.generate_image_captcha()
    # In production, store text in Redis/Session associated with a UUID
    # For now, return text for debugging/mock
    return flask_success_response(data={"image": image_b64, "key": text})

@auth_bp.route("/login/email", methods=["POST"])
@rate_limit(limit=10, window=60)
@audit_log("USER_LOGIN_EMAIL")
def email_login():
    data = request.get_json(silent=True) or {}
    email = data.get("email")
    password = data.get("password")
    
    if not email or not password:
        return flask_error_response("邮箱和密码不能为空", 400)
        
    ok, user, err = auth_service.login_by_email(email, password)
    if not ok:
        return flask_error_response(err or "登录失败", 401)
        
    tokens = auth_service.issue_token(user['openid'], 'user')
    return flask_success_response(
        data={
            **tokens,
            "openid": user['openid'],
            "nickname": user.get('nickname', ''),
            "avatar": user.get('avatar', '')
        },
        message="登录成功"
    )

@auth_bp.route("/token/refresh", methods=["POST"])
def refresh_token():
    data = request.get_json(silent=True) or {}
    refresh_token = data.get("refresh_token")
    
    if not refresh_token:
        return flask_error_response("缺少 refresh_token", 400)
        
    ok, tokens, err = auth_service.refresh_token(refresh_token)
    if not ok:
        return flask_error_response(err or "刷新失败", 401)
        
    return flask_success_response(data=tokens, message="刷新成功")

@auth_bp.route("/password/forgot", methods=["POST"])
@rate_limit(limit=3, window=600)
def forgot_password():
    data = request.get_json(silent=True) or {}
    account = data.get("account") # email or phone
    
    if not account:
        return flask_error_response("账号不能为空", 400)
        
    ok, msg = auth_service.request_password_reset(account)
    return flask_success_response(message=msg)

@auth_bp.route("/send-sms-code", methods=["POST"])
@rate_limit(limit=3, window=60)
@audit_log("SMS_CODE_SEND")
def send_sms_code():
    """发送短信验证码"""
    data = request.get_json(silent=True) or {}
    phone = data.get("phone")
    sms_type = data.get("type", "login")  # login, register, reset_password
    
    if not phone:
        return flask_error_response("手机号不能为空", 400)
    
    # 验证手机号格式
    import re
    if not re.match(r'^1[3-9]\d{9}$', phone):
        return flask_error_response("手机号格式不正确", 400)
    
    try:
        from services.captcha_service import CaptchaService
        code = CaptchaService.generate_sms_code()
        CaptchaService.send_sms(phone, code)
        store_sms_code(phone, code, sms_type, ttl=300)
        
        import os
        data = {"phone": phone, "expiresIn": 300}
        if os.getenv("NODE_ENV") == "development":
            data["code"] = code
            return flask_success_response(data=data, message="验证码已发送（开发模式）")
        return flask_success_response(data=data, message="验证码已发送，请查收短信")
    except Exception as e:
        logger.error(f"发送短信验证码失败: {e}")
        return flask_error_response("发送验证码失败，请稍后重试", 500)

@auth_bp.route("/verify-sms-code", methods=["POST"])
@rate_limit(limit=10, window=60)
@audit_log("SMS_CODE_VERIFY")
def verify_sms_code():
    data = request.get_json(silent=True) or {}
    phone = data.get("phone")
    code = data.get("code")
    sms_type = data.get("type", "login")

    if not phone or not code:
        return flask_error_response("手机号和验证码不能为空", 400)

    import re
    if not re.match(r'^1[3-9]\d{9}$', phone):
        return flask_error_response("手机号格式不正确", 400)
    if not re.match(r'^\d{6}$', str(code)):
        return flask_error_response("验证码格式不正确", 400)

    ok, err = check_sms_code(phone, str(code), sms_type)
    if not ok:
        return flask_error_response(err or "验证码错误", 400)
    return flask_success_response(data={"phone": phone, "verified": True, "type": sms_type}, message="验证码验证成功")

@auth_bp.route("/register", methods=["POST"])
@rate_limit(limit=5, window=60)
@audit_log("USER_REGISTER")
def register():
    data = request.get_json(silent=True) or {}
    phone = data.get("phone")
    password = data.get("password")
    email = data.get("email")
    nickname = data.get("nickname")

    if not phone or not password:
        return flask_error_response("手机号和密码不能为空", 400)

    ok, user, err = auth_service.register_user(phone, password, email, nickname)
    if not ok:
        return flask_error_response(err or "注册失败", 400)

    # Automatically login after registration
    token = auth_service.issue_token(user['openid'], 'user')
    
    return flask_success_response(
        data={
            "token": token,
            "openid": user['openid'],
            "nickname": user.get('nickname', ''),
            "avatar": user.get('avatar', ''),
            "phone": user.get('phone', '')
        },
        message="注册成功"
    )

@auth_bp.route("/login/phone", methods=["POST"])
@rate_limit(limit=10, window=60)
@audit_log("USER_LOGIN_PHONE")
def phone_login():
    data = request.get_json(silent=True) or {}
    phone = data.get("phone")
    password = data.get("password")
    sms_code = data.get("sms_code")  # 短信验证码登录

    if not phone:
        return flask_error_response("手机号不能为空", 400)

    # 验证码登录模式（优先）
    if sms_code:
        import re
        if not re.match(r'^\d{6}$', str(sms_code)):
            return flask_error_response("验证码格式不正确", 400)

        ok, err = check_sms_code(phone, str(sms_code), "login")
        if not ok:
            return flask_error_response(err or "验证码错误或已过期", 400)

        # 验证码正确，查询或创建用户
        ok, user, err = auth_service.login_or_register_by_phone(phone)
        if not ok:
            return flask_error_response(err or "登录失败", 401)

        token = auth_service.issue_token(user['openid'], 'user')
        return flask_success_response(
            data={
                **token,
                "openid": user['openid'],
                "nickname": user.get('nickname', ''),
                "avatar": user.get('avatar', ''),
                "phone": user.get('phone', '')
            },
            message="登录成功"
        )

    # 密码登录模式（兼容）
    if not password:
        return flask_error_response("请提供密码或短信验证码", 400)

    ok, user, err = auth_service.login_by_phone(phone, password)
    if not ok:
        return flask_error_response(err or "登录失败", 401)

    token = auth_service.issue_token(user['openid'], 'user')
    return flask_success_response(
        data={
            **token,
            "openid": user['openid'],
            "nickname": user.get('nickname', ''),
            "avatar": user.get('avatar', ''),
            "phone": user.get('phone', '')
        },
        message="登录成功"
    )

@auth_bp.route("/password/reset", methods=["POST"])
@rate_limit(limit=3, window=60)
@audit_log("PASSWORD_RESET")
def reset_password():
    data = request.get_json(silent=True) or {}
    phone = data.get("phone")
    new_password = data.get("new_password")
    code = data.get("code") # SMS verification code

    if not phone or not new_password or not code:
        return flask_error_response("缺少必要参数", 400)

    ok, err = check_sms_code(phone, str(code), "reset_password")
    if not ok:
        return flask_error_response(err or "验证码错误或已过期", 400)

    # 更新密码
    try:
        user = auth_service._get_model().find_user_by_phone(phone)
        if not user:
            return flask_error_response("手机号未注册", 404)
        
        password_hash = auth_service._hash_password(new_password)
        success = auth_service._get_model().update_user_profile(
            user['openid'], 
            {"password_hash": password_hash}
        )
        
        if success:
            return flask_success_response(message="密码重置成功")
        else:
            return flask_error_response("密码重置失败", 500)
    except Exception as e:
        logger.error(f"密码重置失败: {e}")
        return flask_error_response("密码重置失败", 500)

@auth_bp.route("/password/change", methods=["POST"])
@require_auth
@rate_limit(limit=5, window=60)
@audit_log("PASSWORD_CHANGE")
def change_password():
    """已登录用户修改密码"""
    data = request.get_json(silent=True) or {}
    old_password = data.get("old_password")
    new_password = data.get("new_password")

    if not old_password or not new_password:
        return flask_error_response("旧密码和新密码不能为空", 400)

    # 验证密码强度
    is_strong, strength_err = auth_service._validate_password_strength(new_password)
    if not is_strong:
        return flask_error_response(strength_err, 400)

    # 获取当前用户
    payload = getattr(g, "admin", None)
    if not isinstance(payload, dict):
        return flask_error_response("未登录", 401)

    username = payload.get("sub")
    role = payload.get("role")

    try:
        # 验证旧密码
        if username == auth_service.admin_username:
            # 环境变量管理员
            if auth_service.admin_password.startswith("pbkdf2_sha256$"):
                password_match = auth_service._verify_password(old_password, auth_service.admin_password)
            else:
                password_match = (old_password == auth_service.admin_password)

            if not password_match:
                return flask_error_response("旧密码错误", 400)

            # 更新环境变量管理员的密码（存储到数据库）
            password_hash = auth_service._hash_password(new_password)
            auth_service.upsert_admin_user(username, new_password, role)

        else:
            # 数据库用户
            model = auth_service._get_model()

            if role == 'user':
                # 小程序用户
                user = model.find_user_by_openid(username)
                if not user:
                    return flask_error_response("用户不存在", 404)

                stored_hash = user.get("password_hash")
                if stored_hash and not auth_service._verify_password(old_password, stored_hash):
                    return flask_error_response("旧密码错误", 400)

                # 更新密码
                password_hash = auth_service._hash_password(new_password)
                model.update_user_profile(username, {"password_hash": password_hash})
            else:
                # 管理后台用户
                user = model.find_admin_user(username)
                if not user:
                    return flask_error_response("用户不存在", 404)

                stored_hash = user.get("password_hash")
                if stored_hash and not auth_service._verify_password(old_password, stored_hash):
                    return flask_error_response("旧密码错误", 400)

                # 更新密码并清除强制修改标记
                password_hash = auth_service._hash_password(new_password)
                model.upsert_admin_user(username, {
                    "password_hash": password_hash,
                    "require_password_change": False
                })

        logger.info(f"用户修改密码成功: {username}")
        return flask_success_response(message="密码修改成功")

    except Exception as e:
        logger.error(f"修改密码失败: {e}")
        return flask_error_response("修改密码失败", 500)


@auth_bp.route("/guest/login", methods=["POST"])
@rate_limit(limit=10, window=60)
@audit_log("GUEST_LOGIN")
def guest_login():
    """游客登录 - 创建临时访客令牌"""
    import uuid
    guest_id = f"guest_{uuid.uuid4().hex[:12]}"
    
    # 为游客创建受限的token
    token_data = auth_service.issue_token(guest_id, 'guest')
    
    return flask_success_response(
        data={
            "token": token_data["token"],
            "access_token": token_data["access_token"],
            "refresh_token": token_data["refresh_token"],
            "tokenType": "Bearer",
            "expiresIn": token_data["expires_in"],
            "role": "guest",
            "userId": guest_id,
            "isGuest": True,
            "nickname": "游客用户"
        },
        message="进入游客模式"
    )

@auth_bp.route("/wechat/login", methods=["POST"])
def wechat_login():
    data = request.get_json() or {}
    code = data.get('code')
    
    logger.info(f"[微信登录] 收到登录请求，code: {code[:20] if code else 'None'}...")
    
    if not code:
        logger.warning("[微信登录] 缺少code参数")
        return flask_error_response("缺少code参数", 400)
    
    try:
        logger.info(f"[微信登录] 开始调用 auth_service.wechat_login")
        ok, user, err = auth_service.wechat_login(code)
        
        logger.info(f"[微信登录] wechat_login 返回: ok={ok}, user={user}, err={err}")
        
        if not ok:
            logger.error(f"[微信登录] 登录失败: {err}")
            return flask_error_response(err or "登录失败", 500)
        
        logger.info(f"[微信登录] 开始生成Token，openid: {user.get('openid')}")
        token_data = auth_service.issue_token(user['openid'], 'user')
        
        logger.info(f"[微信登录] Token生成成功，token_data keys: {list(token_data.keys())}")
        
        # 构建响应数据（支持双Token机制）
        response_data = {
            'token': token_data['token'],
            'access_token': token_data.get('access_token', token_data['token']),
            'refresh_token': token_data.get('refresh_token'),
            'expires_in': token_data.get('expires_in', 900),
            'openid': user['openid'],
            'unionid': user.get('unionid'),
            'nickname': user.get('nickname', '微信用户'),
            'avatar': user.get('avatar', ''),
            'phone': user.get('phone', '')
        }
        
        logger.info(f"[微信登录] 返回成功响应")
        return flask_success_response(data=response_data, message="登录成功")
        
    except Exception as e:
        logger.exception(f"[微信登录] 接口异常: {str(e)}")
        return flask_error_response(f"服务器内部错误: {str(e)}", 500)


@auth_bp.route("/user/statistics", methods=["GET"])
@require_auth
def get_user_statistics():
    """获取用户统计数据（累计询价、成功交易、关注标的、使用天数）"""
    try:
        payload = getattr(g, "admin", None)
        if not isinstance(payload, dict):
            return flask_error_response("未登录", 401)
        
        user_id = payload.get("sub")
        
        # 使用默认值，避免数据库查询超时阻塞响应
        total_inquiries = 0
        total_orders = 0
        favorites_count = 0
        days_used = 1
        
        # 尝试获取用户数据计算使用天数（这是最重要的信息）
        try:
            user = auth_service.get_user_profile(user_id)
            if user:
                created_at = user.get('created_at')
                if created_at:
                    from datetime import datetime
                    if isinstance(created_at, str):
                        try:
                            created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                            days_used = (datetime.utcnow() - created_at).days
                            if days_used < 1:
                                days_used = 1
                        except:
                            days_used = 1
        except Exception as e:
            logger.warning(f"获取用户创建时间失败: {e}")
        
        # 异步获取统计数据（不阻塞主响应）
        # 这些统计数据可以在前端单独请求或缓存
        try:
            from services.trade_service import TradeService
            trade_service = TradeService()
            
            # 获取询价记录总数（设置较短的超时）
            _, total_inquiries = trade_service.get_inquiries(
                limit=1, 
                page=1, 
                user_id=user_id
            )
        except Exception as e:
            logger.warning(f"获取询价统计失败: {e}")
            total_inquiries = 0
        
        try:
            # 获取成功交易数量
            from services.trade_service import TradeService
            trade_service = TradeService()
            _, total_orders = trade_service.get_orders(
                limit=1,
                page=1,
                user_id=user_id,
                status="completed"
            )
        except Exception as e:
            logger.warning(f"获取订单统计失败: {e}")
            total_orders = 0
        
        try:
            # 获取关注标的数量
            from models.group import GroupModel
            ensure_db = getattr(current_app, "ensure_db", None)
            db = None
            if callable(ensure_db):
                db = ensure_db()
            if db is None:
                db = getattr(current_app, "db", None)
            cloud_db = getattr(current_app, "cloud_db", None)
            
            if db is not None or cloud_db is not None:
                group_model = GroupModel(db, cloud_client=cloud_db)
                groups, _ = group_model.get_groups(user_id=user_id, limit=100)
                for group in groups:
                    members = group.get('members', [])
                    favorites_count += len(members)
        except Exception as e:
            logger.warning(f"获取关注标的数量失败: {e}")
            favorites_count = 0
        
        return flask_success_response(
            data={
                "totalInquiries": total_inquiries,
                "successfulTrades": total_orders,
                "favoriteStocks": favorites_count,
                "daysUsed": days_used
            },
            message="获取用户统计成功"
        )
    except Exception as e:
        logger.error(f"获取用户统计失败: {e}")
        # 即使出错也返回默认值，不阻塞用户
        return flask_success_response(
            data={
                "totalInquiries": 0,
                "successfulTrades": 0,
                "favoriteStocks": 0,
                "daysUsed": 1
            },
            message="获取用户统计成功"
        )


# =============================================================================
# 双因素认证(2FA)相关接口
# =============================================================================

@auth_bp.route("/2fa/setup", methods=["POST"])
@require_auth
@rate_limit(limit=5, window=60)
@audit_log("2FA_SETUP_INIT")
def setup_2fa():
    """
    初始化双因素认证设置

    返回TOTP密钥和二维码数据，用户需要使用验证器APP扫描
    """
    payload = getattr(g, "admin", None)
    if not isinstance(payload, dict):
        return flask_error_response("未登录", 401)

    user_id = payload.get("sub")
    role = payload.get("role")

    try:
        from services.two_factor_auth import get_2fa_service

        service = get_2fa_service()

        # 生成密钥
        secret = service.generate_secret()

        # 生成备用码
        backup_codes = service.generate_backup_codes()

        # 生成二维码数据
        account_name = user_id if role == 'user' else f"admin_{user_id}"
        qr_data = service.generate_qr_code_data(secret, account_name)

        # 暂存到session或返回给前端（前端确认后再启用）
        # 这里返回给前端，前端确认验证后再调用enable接口

        # 哈希备用码用于存储
        hashed_backup_codes = [service.hash_backup_code(code) for code in backup_codes]

        return flask_success_response(
            data={
                "secret": secret,
                "qrUri": qr_data['uri'],
                "backupCodes": backup_codes,  # 原始备用码，只显示一次
                "issuer": qr_data['issuer'],
                "account": qr_data['account']
            },
            message="请使用验证器APP扫描二维码"
        )

    except Exception as e:
        logger.error(f"初始化2FA失败: {e}")
        return flask_error_response("初始化双因素认证失败", 500)


@auth_bp.route("/2fa/enable", methods=["POST"])
@require_auth
@rate_limit(limit=5, window=60)
@audit_log("2FA_ENABLE")
def enable_2fa():
    """
    启用双因素认证

    用户需要提供TOTP验证码来确认启用
    """
    payload = getattr(g, "admin", None)
    if not isinstance(payload, dict):
        return flask_error_response("未登录", 401)

    user_id = payload.get("sub")

    data = request.get_json(silent=True) or {}
    secret = data.get("secret")
    code = data.get("code")
    backup_codes = data.get("backup_codes", [])

    if not secret or not code:
        return flask_error_response("缺少必要参数", 400)

    try:
        from services.two_factor_auth import get_2fa_service

        service = get_2fa_service()

        # 验证TOTP码
        if not service.verify_totp(secret, code):
            return flask_error_response("验证码错误，无法启用双因素认证", 400)

        # 哈希备用码
        hashed_backup_codes = [service.hash_backup_code(c) for c in backup_codes] if backup_codes else []

        # 更新用户设置
        model = auth_service._get_model()
        success = model.update_user_profile(user_id, {
            "two_factor_enabled": True,
            "two_factor_secret": secret,
            "backup_codes": hashed_backup_codes,
            "two_factor_enabled_at": datetime.utcnow().isoformat()
        })

        if success:
            logger.info(f"用户启用2FA成功: {user_id}")
            return flask_success_response(message="双因素认证已启用")

        return flask_error_response("启用失败", 500)

    except Exception as e:
        logger.error(f"启用2FA失败: {e}")
        return flask_error_response("启用双因素认证失败", 500)


@auth_bp.route("/2fa/disable", methods=["POST"])
@require_auth
@rate_limit(limit=3, window=60)
@audit_log("2FA_DISABLE")
def disable_2fa():
    """
    禁用双因素认证

    需要验证密码或TOTP码
    """
    payload = getattr(g, "admin", None)
    if not isinstance(payload, dict):
        return flask_error_response("未登录", 401)

    user_id = payload.get("sub")

    data = request.get_json(silent=True) or {}
    password = data.get("password")
    code = data.get("code")

    if not password and not code:
        return flask_error_response("请提供密码或验证码", 400)

    try:
        model = auth_service._get_model()
        user = model.find_user_by_openid(user_id)

        if not user:
            return flask_error_response("用户不存在", 404)

        # 验证密码或TOTP
        verified = False

        if password:
            stored_hash = user.get('password_hash')
            if stored_hash and auth_service._verify_password(password, stored_hash):
                verified = True

        if code and not verified:
            secret = user.get('two_factor_secret')
            if secret:
                from services.two_factor_auth import get_2fa_service
                service = get_2fa_service()
                if service.verify_totp(secret, code):
                    verified = True

        if not verified:
            return flask_error_response("验证失败", 403)

        # 禁用2FA
        success = model.update_user_profile(user_id, {
            "two_factor_enabled": False,
            "two_factor_secret": None,
            "backup_codes": []
        })

        if success:
            logger.info(f"用户禁用2FA成功: {user_id}")
            return flask_success_response(message="双因素认证已禁用")

        return flask_error_response("禁用失败", 500)

    except Exception as e:
        logger.error(f"禁用2FA失败: {e}")
        return flask_error_response("禁用双因素认证失败", 500)


@auth_bp.route("/2fa/status", methods=["GET"])
@require_auth
def get_2fa_status():
    """获取双因素认证状态"""
    payload = getattr(g, "admin", None)
    if not isinstance(payload, dict):
        return flask_error_response("未登录", 401)

    user_id = payload.get("sub")

    try:
        model = auth_service._get_model()
        user = model.find_user_by_openid(user_id)

        if not user:
            # 返回默认状态
            return flask_success_response(data={
                "enabled": False,
                "hasBackupCodes": False
            })

        return flask_success_response(data={
            "enabled": user.get('two_factor_enabled', False),
            "hasBackupCodes": len(user.get('backup_codes', [])) > 0,
            "enabledAt": user.get('two_factor_enabled_at')
        })

    except Exception as e:
        logger.error(f"获取2FA状态失败: {e}")
        return flask_success_response(data={"enabled": False, "hasBackupCodes": False})


@auth_bp.route("/2fa/regenerate-backup-codes", methods=["POST"])
@require_auth
@rate_limit(limit=3, window=60)
@audit_log("2FA_REGENERATE_BACKUP")
def regenerate_backup_codes():
    """重新生成备用码"""
    payload = getattr(g, "admin", None)
    if not isinstance(payload, dict):
        return flask_error_response("未登录", 401)

    user_id = payload.get("sub")

    data = request.get_json(silent=True) or {}
    code = data.get("code")

    if not code:
        return flask_error_response("需要验证码", 400)

    try:
        model = auth_service._get_model()
        user = model.find_user_by_openid(user_id)

        if not user or not user.get('two_factor_enabled'):
            return flask_error_response("未启用双因素认证", 400)

        # 验证TOTP
        secret = user.get('two_factor_secret')
        from services.two_factor_auth import get_2fa_service
        service = get_2fa_service()

        if not service.verify_totp(secret, code):
            return flask_error_response("验证码错误", 400)

        # 生成新备用码
        new_backup_codes = service.generate_backup_codes()
        hashed_backup_codes = [service.hash_backup_code(c) for c in new_backup_codes]

        # 更新
        model.update_user_profile(user_id, {"backup_codes": hashed_backup_codes})

        logger.info(f"用户重新生成备用码: {user_id}")
        return flask_success_response(
            data={"backupCodes": new_backup_codes},
            message="备用码已重新生成，请妥善保存"
        )

    except Exception as e:
        logger.error(f"重新生成备用码失败: {e}")
        return flask_error_response("操作失败", 500)
