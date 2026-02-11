from __future__ import annotations

import os
import jwt
import logging
from functools import wraps
from typing import Any, Callable, Dict, Optional, TypeVar, cast

from flask import Blueprint, g, request, current_app
from backend_utils.response import flask_error_response, flask_success_response
from backend_utils.security import rate_limit, audit_log
from services.auth_service import AuthService

auth_bp = Blueprint("auth", __name__)
logger = logging.getLogger(__name__)

auth_service = AuthService()

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

        try:
            # Decode token using service's secret config
            payload = jwt.decode(token, auth_service.jwt_secret, algorithms=[auth_service.jwt_algorithm])
        except jwt.ExpiredSignatureError:
            logger.warning("Request rejected: Token expired")
            return flask_error_response("登录已过期，请重新登录", 401)
        except jwt.InvalidTokenError as e:
            logger.warning(f"Request rejected: Invalid token - {str(e)}")
            return flask_error_response("无效的登录凭证", 401)

        g.admin = payload
        return fn(*args, **kwargs)

    return cast(F, wrapper)

def require_roles(*allowed_roles: str):
    allowed = {auth_service._normalize_role(r) for r in allowed_roles if isinstance(r, str)}

    def decorator(fn: F) -> F:
        @wraps(fn)
        def wrapper(*args: Any, **kwargs: Any):
            payload = getattr(g, "admin", None)
            if not isinstance(payload, dict):
                return flask_error_response("未登录或登录已过期", 401)
            role = auth_service._normalize_role(str(payload.get("role") or "viewer"))
            if role not in allowed:
                return flask_error_response("权限不足", 403)
            return fn(*args, **kwargs)

        return cast(F, wrapper)

    return decorator

@auth_bp.route("/login", methods=["POST"])
def admin_login():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return flask_error_response("用户名和密码不能为空", 400)

    ok, role, err = auth_service.authenticate_admin(username, password)
    if not ok:
        return flask_error_response(err or "登录失败", 401)

    token = auth_service.issue_token(username, role)
    return flask_success_response(
        data={
            "token": token,
            "tokenType": "Bearer",
            "expiresIn": auth_service.jwt_expires_seconds,
            "role": role,
        },
        message="登录成功",
    )

@auth_bp.route("/me", methods=["GET"])
@require_auth
def admin_me():
    payload = getattr(g, "admin", None)
    if not isinstance(payload, dict):
        return flask_error_response("未登录", 401)
    
    username = payload.get("sub")
    role = payload.get("role")
    
    if role == 'user':
        user = auth_service.get_user_profile(username)
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

@auth_bp.route("/users", methods=["GET"])
@require_auth
@require_roles("admin")
def list_admin_users():
    users = auth_service.list_admin_users()
    return flask_success_response(data=users)

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

    if not phone or not password:
        return flask_error_response("手机号和密码不能为空", 400)

    ok, user, err = auth_service.login_by_phone(phone, password)
    if not ok:
        return flask_error_response(err or "登录失败", 401)

    token = auth_service.issue_token(user['openid'], 'user')
    return flask_success_response(
        data={
            "token": token,
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

    # In a real system, verify SMS code here
    # if not verify_sms_code(phone, code):
    #     return flask_error_response("验证码错误", 400)

    # For now, we assume code verification is handled by a separate service or passed
    # Update password logic would go here
    # auth_service.reset_password(phone, new_password)
    
    return flask_success_response(message="密码重置成功(模拟)")

@auth_bp.route("/wechat/login", methods=["POST"])
def wechat_login():
    data = request.get_json() or {}
    code = data.get('code')
    
    if not code:
        return flask_error_response("缺少code参数", 400)
    
    try:
        ok, user, err = auth_service.wechat_login(code)
        
        if not ok:
            logger.error(f"微信登录失败: {err}")
            return flask_error_response(err or "登录失败", 500)
        
        token = auth_service.issue_token(user['openid'], 'user')
        
        return flask_success_response(
            data={
                'token': token,
                'openid': user['openid'],
                'unionid': user.get('unionid'),
                'nickname': user.get('nickname', '微信用户'),
                'avatar': user.get('avatar', ''),
                'phone': user.get('phone', '')
            },
            message="登录成功"
        )
    except Exception as e:
        logger.exception("微信登录接口异常")
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
        
        # 获取询价统计
        from services.trade_service import TradeService
        trade_service = TradeService()
        
        # 获取用户的询价记录总数
        _, total_inquiries = trade_service.get_inquiries(
            limit=1, 
            page=1, 
            user_id=user_id
        )
        
        # 获取成功交易数量（completed状态的订单）
        _, total_orders = trade_service.get_orders(
            limit=1,
            page=1,
            user_id=user_id,
            status="completed"
        )
        
        # 获取关注标的数量（从groups集合中统计）
        favorites_count = 0
        try:
            from models.group import GroupModel
            ensure_db = getattr(current_app, "ensure_db", None)
            db = None
            if callable(ensure_db):
                db = ensure_db()
            if db is None:
                db = getattr(current_app, "db", None)
            cloud_db = getattr(current_app, "cloud_db", None)
            
            group_model = GroupModel(db, cloud_client=cloud_db)
            # 获取用户所有分组中的标的数量
            groups, _ = group_model.get_groups(user_id=user_id, limit=100)
            for group in groups:
                members = group.get('members', [])
                favorites_count += len(members)
        except Exception as e:
            logger.warning(f"获取关注标的数量失败: {e}")
            favorites_count = 0
        
        # 计算使用天数（从用户创建时间到现在）
        user = auth_service.get_user_profile(user_id)
        created_at = user.get('created_at') if user else None
        if created_at:
            from datetime import datetime
            if isinstance(created_at, str):
                created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            days_used = (datetime.utcnow() - created_at).days
            if days_used < 1:
                days_used = 1
        else:
            days_used = 1
        
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
        return flask_error_response("获取统计信息失败", 500)
