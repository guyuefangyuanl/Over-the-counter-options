# -*- coding: utf-8 -*-
"""
双因素认证(2FA)服务

支持TOTP(基于时间的一次性密码)方式的二次验证
"""

import os
import time
import base64
import hashlib
import hmac
import secrets
import logging
from typing import Optional, Tuple, Dict, Any
from datetime import datetime

logger = logging.getLogger(__name__)


class TwoFactorAuthService:
    """
    双因素认证服务

    功能:
    - 生成TOTP密钥
    - 验证TOTP验证码
    - 生成备用码
    - 管理用户2FA状态
    """

    # TOTP配置
    TOTP_DIGITS = 6
    TOTP_INTERVAL = 30  # 30秒时间窗口
    TOTP_WINDOW = 1  # 允许前后1个时间窗口的误差

    # 备用码配置
    BACKUP_CODES_COUNT = 10
    BACKUP_CODE_LENGTH = 8

    def __init__(self):
        self._issuer = os.getenv('APP_NAME', '期权交易系统')

    def generate_secret(self) -> str:
        """
        生成TOTP密钥

        Returns:
            Base32编码的密钥字符串
        """
        # 生成20字节随机数据
        random_bytes = secrets.token_bytes(20)
        # 编码为Base32
        secret = base64.b32encode(random_bytes).decode('utf-8')
        return secret

    def generate_totp_uri(self, secret: str, account_name: str) -> str:
        """
        生成TOTP URI（用于二维码生成）

        Args:
            secret: Base32编码的密钥
            account_name: 账户名（通常是邮箱或用户名）

        Returns:
            otpauth://格式的URI
        """
        from urllib.parse import quote

        issuer_encoded = quote(self._issuer)
        account_encoded = quote(account_name)

        uri = f"otpauth://totp/{issuer_encoded}:{account_encoded}?secret={secret}&issuer={issuer_encoded}&digits={self.TOTP_DIGITS}&period={self.TOTP_INTERVAL}"
        return uri

    def generate_qr_code_data(self, secret: str, account_name: str) -> Dict[str, str]:
        """
        生成用于显示二维码的数据

        Returns:
            包含uri和secret的字典
        """
        return {
            'uri': self.generate_totp_uri(secret, account_name),
            'secret': secret,
            'issuer': self._issuer,
            'account': account_name,
            'digits': self.TOTP_DIGITS,
            'interval': self.TOTP_INTERVAL
        }

    def verify_totp(self, secret: str, code: str) -> bool:
        """
        验证TOTP验证码

        Args:
            secret: Base32编码的密钥
            code: 用户输入的6位验证码

        Returns:
            验证是否通过
        """
        if not secret or not code:
            return False

        # 确保code是6位数字
        code = str(code).strip()
        if not code.isdigit() or len(code) != self.TOTP_DIGITS:
            return False

        try:
            # 解码密钥
            key = base64.b32decode(secret, casefold=True)
        except Exception as e:
            logger.error(f"TOTP密钥解码失败: {e}")
            return False

        # 获取当前时间戳（时间窗口）
        current_time = int(time.time() / self.TOTP_INTERVAL)

        # 检查当前及前后时间窗口
        for offset in range(-self.TOTP_WINDOW, self.TOTP_WINDOW + 1):
            expected_code = self._generate_totp_code(key, current_time + offset)
            if hmac.compare_digest(code, expected_code):
                return True

        return False

    def _generate_totp_code(self, key: bytes, time_counter: int) -> str:
        """
        生成指定时间窗口的TOTP码

        Args:
            key: 解码后的密钥
            time_counter: 时间窗口计数器

        Returns:
            6位数字验证码
        """
        # 时间窗口转大端字节序
        time_bytes = time_counter.to_bytes(8, 'big')

        # HMAC-SHA1
        hmac_hash = hmac.new(key, time_bytes, hashlib.sha1).digest()

        # 动态截断
        offset = hmac_hash[-1] & 0x0F
        code_int = int.from_bytes(hmac_hash[offset:offset + 4], 'big') & 0x7FFFFFFF

        # 取模得到6位数字
        code = code_int % (10 ** self.TOTP_DIGITS)

        return f"{code:06d}"

    def generate_backup_codes(self) -> list:
        """
        生成备用验证码

        Returns:
            备用码列表
        """
        codes = []
        for _ in range(self.BACKUP_CODES_COUNT):
            # 生成8位随机数字码
            code = ''.join([str(secrets.randbelow(10)) for _ in range(self.BACKUP_CODE_LENGTH)])
            codes.append(code)
        return codes

    def hash_backup_code(self, code: str) -> str:
        """
        哈希备用码（用于存储）

        Args:
            code: 原始备用码

        Returns:
            哈希后的备用码
        """
        return hashlib.sha256(code.encode()).hexdigest()

    def verify_backup_code(self, code: str, hashed_codes: list) -> Tuple[bool, list]:
        """
        验证备用码

        Args:
            code: 用户输入的备用码
            hashed_codes: 存储的哈希备用码列表

        Returns:
            (验证是否通过, 更新后的哈希备用码列表)
        """
        if not code or not hashed_codes:
            return False, hashed_codes

        code_hash = self.hash_backup_code(code)

        for i, stored_hash in enumerate(hashed_codes):
            if hmac.compare_digest(code_hash, stored_hash):
                # 使用后移除该备用码
                new_codes = hashed_codes[:i] + hashed_codes[i + 1:]
                return True, new_codes

        return False, hashed_codes


# 全局实例
_2fa_service: Optional[TwoFactorAuthService] = None


def get_2fa_service() -> TwoFactorAuthService:
    """获取2FA服务实例"""
    global _2fa_service
    if _2fa_service is None:
        _2fa_service = TwoFactorAuthService()
    return _2fa_service


def require_2fa(f):
    """
    2FA验证装饰器

    在需要2FA验证的路由上使用，用户需要在请求体中提供totp_code

    使用方式:
        @require_auth
        @require_2fa
        def sensitive_operation():
            ...
    """
    from functools import wraps
    from flask import request, g

    @wraps(f)
    def wrapper(*args, **kwargs):
        # 检查用户是否启用了2FA
        from models.user import UserModel
        from flask import current_app

        payload = getattr(g, 'admin', None)
        if not isinstance(payload, dict):
            return flask_error_response("未登录", 401)

        user_id = payload.get('sub')

        # 获取用户2FA设置
        try:
            ensure_db = getattr(current_app, "ensure_db", None)
            db = ensure_db() if callable(ensure_db) else getattr(current_app, "db", None)
            cloud_db = getattr(current_app, "cloud_db", None)
            model = UserModel(db, cloud_client=cloud_db)

            user = model.find_user_by_openid(user_id) if payload.get('role') == 'user' else model.find_admin_user(user_id)

            if not user:
                return f(*args, **kwargs)  # 用户不存在，跳过2FA检查

            two_factor_enabled = user.get('two_factor_enabled', False)

            if not two_factor_enabled:
                # 未启用2FA，直接执行
                return f(*args, **kwargs)

            # 需要2FA验证
            data = request.get_json(silent=True) or {}
            totp_code = data.get('totp_code')
            backup_code = data.get('backup_code')

            if not totp_code and not backup_code:
                return flask_error_response("需要双因素认证验证", 403, error_code=2004)

            service = get_2fa_service()
            secret = user.get('two_factor_secret')

            # 尝试TOTP验证
            if totp_code and secret:
                if service.verify_totp(secret, totp_code):
                    logger.info(f"2FA TOTP验证通过: user={user_id}")
                    return f(*args, **kwargs)

            # 尝试备用码验证
            if backup_code:
                hashed_codes = user.get('backup_codes', [])
                valid, new_codes = service.verify_backup_code(backup_code, hashed_codes)
                if valid:
                    # 更新备用码列表（移除已使用的）
                    model.update_user_profile(user_id, {'backup_codes': new_codes})
                    logger.info(f"2FA备用码验证通过: user={user_id}")
                    return f(*args, **kwargs)

            return flask_error_response("双因素认证验证失败", 403, error_code=2004)

        except Exception as e:
            logger.error(f"2FA验证异常: {e}")
            return f(*args, **kwargs)  # 异常时降级处理

    return wrapper


# 导入flask_error_response（在文件末尾避免循环导入）
from backend_utils.response import flask_error_response