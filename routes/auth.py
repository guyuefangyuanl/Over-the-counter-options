from __future__ import annotations

import os
from datetime import datetime, timedelta
from functools import wraps
from typing import Any, Callable, Dict, Optional, TypeVar, cast

import jwt
from flask import Blueprint, g, request

from utils.response import flask_error_response, flask_success_response

auth_bp = Blueprint("auth", __name__)

JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_SECRET = os.getenv("JWT_SECRET") or os.getenv("SECRET_KEY") or "dev-secret-key-change-in-production"
JWT_EXPIRES_SECONDS = int(os.getenv("JWT_EXPIRES_SECONDS", "86400"))

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")

F = TypeVar("F", bound=Callable[..., Any])


def _get_bearer_token() -> Optional[str]:
    raw = request.headers.get("Authorization", "")
    if not raw or not isinstance(raw, str):
        return None
    if not raw.startswith("Bearer "):
        return None
    token = raw[len("Bearer ") :].strip()
    return token or None


def _issue_token(username: str) -> str:
    now = datetime.utcnow()
    exp = now + timedelta(seconds=JWT_EXPIRES_SECONDS)
    payload: Dict[str, Any] = {
        "sub": username,
        "role": "admin",
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return cast(str, token)


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


@auth_bp.route("/login", methods=["POST"])
def admin_login():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")

    if not isinstance(username, str) or username.strip() == "":
        return flask_error_response("username 不能为空", 400)
    if not isinstance(password, str) or password.strip() == "":
        return flask_error_response("password 不能为空", 400)

    if username != ADMIN_USERNAME or password != ADMIN_PASSWORD:
        return flask_error_response("用户名或密码错误", 401)

    token = _issue_token(username)
    return flask_success_response(
        data={
            "token": token,
            "tokenType": "Bearer",
            "expiresIn": JWT_EXPIRES_SECONDS,
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

