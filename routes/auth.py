from __future__ import annotations

import os
import base64
import hashlib
import hmac
import requests
import logging
from datetime import datetime, timedelta
from functools import wraps
from typing import Any, Callable, Dict, Optional, TypeVar, cast, List, Tuple

import jwt
from flask import Blueprint, g, request, current_app

from backend_utils.response import flask_error_response, flask_success_response

auth_bp = Blueprint("auth", __name__)

logger = logging.getLogger(__name__)

JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_SECRET = os.getenv("JWT_SECRET") or os.getenv("SECRET_KEY") or "dev-secret-key-change-in-production"
JWT_EXPIRES_SECONDS = int(os.getenv("JWT_EXPIRES_SECONDS", "86400"))

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
ADMIN_ROLE = os.getenv("ADMIN_ROLE", "admin")
ADMIN_USERS_JSON = os.getenv("ADMIN_USERS_JSON", "")

F = TypeVar("F", bound=Callable[..., Any])

ROLE_ORDER = {
    "viewer": 10,
    "editor": 20,
    "admin": 30,
}


def _get_bearer_token() -> Optional[str]:
    raw = request.headers.get("Authorization", "")
    if not raw or not isinstance(raw, str):
        return None
    if not raw.startswith("Bearer "):
        return None
    token = raw[len("Bearer ") :].strip()
    return token or None


def _issue_token(username: str, role: str) -> str:
    now = datetime.utcnow()
    exp = now + timedelta(seconds=JWT_EXPIRES_SECONDS)
    payload: Dict[str, Any] = {
        "sub": username,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return cast(str, token)


def _normalize_role(role: str) -> str:
    raw = (role or "").strip().lower()
    return raw if raw in ROLE_ORDER else "viewer"


def _hash_password(password: str, *, iterations: int = 200_000) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return "pbkdf2_sha256${}${}${}".format(
        iterations,
        base64.urlsafe_b64encode(salt).decode("ascii").rstrip("="),
        base64.urlsafe_b64encode(dk).decode("ascii").rstrip("="),
    )


def _verify_password(password: str, stored: str) -> bool:
    if not isinstance(stored, str) or stored.strip() == "":
        return False
    stored = stored.strip()
    if stored.startswith("pbkdf2_sha256$"):
        parts = stored.split("$")
        if len(parts) != 4:
            return False
        _, iter_raw, salt_b64, dk_b64 = parts
        try:
            iterations = int(iter_raw)
        except Exception:
            return False

        def _pad(b64: str) -> str:
            return b64 + "=" * ((4 - (len(b64) % 4)) % 4)

        try:
            salt = base64.urlsafe_b64decode(_pad(salt_b64))
            dk_expected = base64.urlsafe_b64decode(_pad(dk_b64))
        except Exception:
            return False

        dk_actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
        return hmac.compare_digest(dk_actual, dk_expected)

    return hmac.compare_digest(password, stored)


def _get_db():
    db = getattr(current_app, "db", None)
    return db


def _find_admin_user_in_db(username: str) -> Optional[Dict[str, Any]]:
    db = _get_db()
    if not db:
        return None
    try:
        user = db["admin_users"].find_one({"username": username})
        if not user:
            return None
        return user
    except Exception:
        return None


def _list_admin_users_in_db() -> List[Dict[str, Any]]:
    db = _get_db()
    if not db:
        return []
    try:
        return list(db["admin_users"].find({}, {"_id": 0, "password_hash": 0}))
    except Exception:
        return []


def _upsert_admin_user_in_db(username: str, password: str, role: str) -> Dict[str, Any]:
    db = _get_db()
    if not db:
        raise RuntimeError("数据库未连接，无法管理账号")
    normalized_role = _normalize_role(role)
    now_iso = datetime.utcnow().isoformat() + "Z"
    password_hash = _hash_password(password)
    doc = {
        "username": username,
        "role": normalized_role,
        "password_hash": password_hash,
        "updated_at": now_iso,
    }
    existing = db["admin_users"].find_one({"username": username})
    if existing:
        db["admin_users"].update_one({"username": username}, {"$set": doc})
        return {"username": username, "role": normalized_role, "updated_at": now_iso}
    doc["created_at"] = now_iso
    db["admin_users"].insert_one(doc)
    return {"username": username, "role": normalized_role, "created_at": now_iso, "updated_at": now_iso}


def _delete_admin_user_in_db(username: str) -> bool:
    db = _get_db()
    if not db:
        raise RuntimeError("数据库未连接，无法管理账号")
    result = db["admin_users"].delete_one({"username": username})
    return bool(getattr(result, "deleted_count", 0))


def _parse_env_users() -> List[Dict[str, Any]]:
    raw = ADMIN_USERS_JSON.strip()
    if raw == "":
        return []
    try:
        import json

        parsed = json.loads(raw)
    except Exception:
        return []
    if not isinstance(parsed, list):
        return []
    users: List[Dict[str, Any]] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        username = item.get("username")
        role = item.get("role", "viewer")
        password_hash = item.get("password_hash")
        password_plain = item.get("password")
        if not isinstance(username, str) or username.strip() == "":
            continue
        user: Dict[str, Any] = {"username": username.strip(), "role": _normalize_role(str(role))}
        if isinstance(password_hash, str) and password_hash.strip() != "":
            user["password_hash"] = password_hash.strip()
        if isinstance(password_plain, str) and password_plain.strip() != "":
            user["password"] = password_plain
        users.append(user)
    return users


def _authenticate_admin(username: str, password: str) -> Tuple[bool, Optional[str], Optional[str]]:
    user = _find_admin_user_in_db(username)
    if user:
        stored_hash = user.get("password_hash")
        if isinstance(stored_hash, str) and _verify_password(password, stored_hash):
            role = _normalize_role(str(user.get("role") or "viewer"))
            return True, role, None
        return False, None, "用户名或密码错误"

    env_users = _parse_env_users()
    for u in env_users:
        if u.get("username") == username:
            stored_hash = u.get("password_hash")
            if isinstance(stored_hash, str) and _verify_password(password, stored_hash):
                return True, _normalize_role(str(u.get("role") or "viewer")), None
            stored_plain = u.get("password")
            if isinstance(stored_plain, str) and _verify_password(password, stored_plain):
                return True, _normalize_role(str(u.get("role") or "viewer")), None
            return False, None, "用户名或密码错误"

    if username == ADMIN_USERNAME and _verify_password(password, ADMIN_PASSWORD):
        return True, _normalize_role(ADMIN_ROLE), None

    return False, None, "用户名或密码错误"


def require_auth(fn: F) -> F:
    @wraps(fn)
    def wrapper(*args: Any, **kwargs: Any):
        token = _get_bearer_token()
        if not token:
            return flask_error_response("未登录或登录已过期", 401)

        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        except jwt.ExpiredSignatureError:
            return flask_error_response("登录已过期，请重新登录", 401)
        except jwt.InvalidTokenError:
            return flask_error_response("无效的登录凭证", 401)

        g.admin = payload
        return fn(*args, **kwargs)

    return cast(F, wrapper)


def require_roles(*allowed_roles: str):
    allowed = {_normalize_role(r) for r in allowed_roles if isinstance(r, str)}

    def decorator(fn: F) -> F:
        @wraps(fn)
        def wrapper(*args: Any, **kwargs: Any):
            payload = getattr(g, "admin", None)
            if not isinstance(payload, dict):
                return flask_error_response("未登录或登录已过期", 401)
            role = _normalize_role(str(payload.get("role") or "viewer"))
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

    if not isinstance(username, str) or username.strip() == "":
        return flask_error_response("username 不能为空", 400)
    if not isinstance(password, str) or password.strip() == "":
        return flask_error_response("password 不能为空", 400)

    ok, role, err = _authenticate_admin(username, password)
    if not ok or not role:
        return flask_error_response(err or "用户名或密码错误", 401)

    token = _issue_token(username, role)
    return flask_success_response(
        data={
            "token": token,
            "tokenType": "Bearer",
            "expiresIn": JWT_EXPIRES_SECONDS,
            "role": role,
        },
        message="登录成功",
    )


@auth_bp.route("/me", methods=["GET"])
@require_auth
def admin_me():
    payload = getattr(g, "admin", None)
    if not isinstance(payload, dict):
        return flask_error_response("未登录或登录已过期", 401)
    return flask_success_response(
        data={
            "username": payload.get("sub"),
            "role": payload.get("role"),
        }
    )


@auth_bp.route("/users", methods=["GET"])
@require_auth
@require_roles("admin")
def list_admin_users():
    users = _list_admin_users_in_db()
    return flask_success_response(data=users)


@auth_bp.route("/users", methods=["POST"])
@require_auth
@require_roles("admin")
def upsert_admin_user():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")
    role = data.get("role", "viewer")

    if not isinstance(username, str) or username.strip() == "":
        return flask_error_response("username 不能为空", 400)
    if not isinstance(password, str) or password.strip() == "":
        return flask_error_response("password 不能为空", 400)
    normalized_role = _normalize_role(str(role))

    try:
        saved = _upsert_admin_user_in_db(username.strip(), password, normalized_role)
    except Exception as e:
        return flask_error_response(str(e), 500)
    return flask_success_response(data=saved, message="保存成功")


@auth_bp.route("/users/<username>", methods=["DELETE"])
@require_auth
@require_roles("admin")
def delete_admin_user(username: str):
    payload = getattr(g, "admin", None)
    current_username = payload.get("sub") if isinstance(payload, dict) else None
    if isinstance(current_username, str) and current_username == username:
        return flask_error_response("不能删除当前登录账号", 400)
    try:
        deleted = _delete_admin_user_in_db(username)
    except Exception as e:
        return flask_error_response(str(e), 500)
    if not deleted:
        return flask_error_response("账号不存在", 404)
    return flask_success_response(data=None, message="删除成功")


@auth_bp.route("/wechat/login", methods=["POST"])
def wechat_login():
    """微信登录 - 小程序端调用"""
    try:
        data = request.get_json()
        code = data.get('code')  # wx.login() 获取的code
        
        if not code:
            return flask_error_response("缺少code参数", 400)
        
        # 调用微信接口换取openid
        wx_appid = os.getenv('WX_APPID')
        wx_secret = os.getenv('WX_SECRET')
        
        if not wx_appid or not wx_secret:
            logger.error("微信配置未设置: WX_APPID 或 WX_SECRET")
            return flask_error_response("服务器配置错误，请联系管理员", 500)
        
        url = 'https://api.weixin.qq.com/sns/jscode2session'
        params = {
            'appid': wx_appid,
            'secret': wx_secret,
            'js_code': code,
            'grant_type': 'authorization_code'
        }
        
        response = requests.get(url, params=params, timeout=10)
        result = response.json()
        
        if 'openid' not in result:
            error_msg = result.get('errmsg', '微信登录失败')
            logger.error(f"微信登录失败: {error_msg}, code: {code}")
            return flask_error_response(f"微信登录失败: {error_msg}", 500)
        
        openid = result['openid']
        session_key = result.get('session_key')
        unionid = result.get('unionid')
        
        # 查询或创建用户
        db = _get_db()
        if not db:
            return flask_error_response("数据库未连接", 503)
        
        user = db.users.find_one({'openid': openid})
        
        if not user:
            # 创建新用户
            user = {
                'openid': openid,
                'unionid': unionid,
                'nickname': '微信用户',
                'avatar': '',
                'phone': '',
                'created_at': datetime.utcnow(),
                'last_login': datetime.utcnow()
            }
            result_insert = db.users.insert_one(user)
            user['_id'] = str(result_insert.inserted_id)
            logger.info(f"创建新用户: openid={openid}")
        else:
            # 更新最后登录时间
            db.users.update_one(
                {'openid': openid},
                {'$set': {'last_login': datetime.utcnow()}}
            )
            user['_id'] = str(user['_id'])
            logger.info(f"用户登录: openid={openid}")
        
        # 生成JWT token
        token = _issue_token(openid, 'user')
        
        return flask_success_response(
            data={
                'token': token,
                'openid': openid,
                'unionid': unionid,
                'nickname': user.get('nickname', '微信用户'),
                'avatar': user.get('avatar', ''),
                'phone': user.get('phone', '')
            },
            message="登录成功"
        )
        
    except requests.RequestException as e:
        logger.error(f"调用微信API失败: {e}")
        return flask_error_response("网络连接失败，请稍后重试", 500)
    except Exception as e:
        logger.error(f"微信登录失败: {e}", exc_info=True)
        return flask_error_response(str(e), 500)
