from __future__ import annotations

import os
import jwt
import logging
from functools import wraps
from typing import Any, Callable, Dict, Optional, TypeVar, cast

from flask import Blueprint, g, request, current_app
from backend_utils.response import flask_error_response, flask_success_response
from backend_utils.security import rate_limit, audit_log, store_sms_code, check_sms_code
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

        # 检查游客权限
        role = payload.get('role', 'viewer')
        logger.info(f"[require_auth] 用户: {payload.get('sub')}, 角色: {role}, 请求方法: {request.method}, 路径: {request.path}")
        
        if role == 'guest' and request.method not in ['GET', 'HEAD', 'OPTIONS']:
            logger.warning(f"[require_auth] 游客权限受限: 用户 {payload.get('sub')} 尝试 {request.method} {request.path}")
            return flask_error_response("游客模式仅支持查看功能。请登录后使用完整功能（持仓录入、平仓等操作需要登录）。", 403)

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
                logger.warning(f"[require_roles] 未登录或登录已过期，payload 类型: {type(payload)}")
                return flask_error_response("未登录或登录已过期", 401)

            user_role = str(payload.get("role") or "viewer")
            normalized_role = auth_service._normalize_role(user_role)

            # 调试日志：输出用户角色信息
            logger.info(f"[require_roles] 用户: {payload.get('sub')}, 原始角色: {user_role}, 规范化角色: {normalized_role}, 允许的角色: {allowed}")

            if normalized_role not in allowed:
                logger.warning(f"[require_roles] 权限不足: 用户 {payload.get('sub')} 角色 {normalized_role} 不在允许的角色列表 {allowed} 中")
                return flask_error_response(f"权限不足：当前角色({normalized_role})无权访问此功能。如需操作权限，请使用微信登录或联系管理员。", 403)
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

    ok, role, err = auth_service.authenticate_admin(username, password)
    if not ok:
        return flask_error_response(err or "登录失败", 401)

    token_data = auth_service.issue_token(username, role)
    return flask_success_response(
        data={
            "token": token_data["token"],
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
