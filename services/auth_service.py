import os
import base64
import hashlib
import hmac
import jwt
import logging
import requests
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple, List
from flask import current_app

logger = logging.getLogger(__name__)

class AuthService:
    def __init__(self):
        self.jwt_secret = os.getenv("JWT_SECRET") or os.getenv("SECRET_KEY") or "dev-secret-key-change-in-production"
        self.jwt_algorithm = os.getenv("JWT_ALGORITHM", "HS256")
        self.jwt_expires_seconds = int(os.getenv("JWT_EXPIRES_SECONDS", "86400"))
        
        self.admin_username = os.getenv("ADMIN_USERNAME", "admin")
        self.admin_password = os.getenv("ADMIN_PASSWORD", "admin123")
        self.admin_role = os.getenv("ADMIN_ROLE", "admin")
        
        self.wx_appid = os.getenv('WX_APPID')
        self.wx_secret = os.getenv('WX_SECRET')
        
        # 检查微信配置是否有效（排除占位符）
        if self.wx_secret and ('请从' in self.wx_secret or 'your_' in self.wx_secret.lower() or len(self.wx_secret) < 10):
            logger.warning(f"WX_SECRET 是占位符或无效值，将使用模拟登录模式")
            self.wx_secret = None

        self.role_order = {
            "viewer": 10,
            "user": 15,   # 微信小程序登录用户
            "editor": 20,
            "admin": 30,
        }

    def _get_model(self):
        from models.user import UserModel
        ensure_db = getattr(current_app, "ensure_db", None)
        db = None
        if callable(ensure_db):
            db = ensure_db()
        if db is None:
            db = getattr(current_app, "db", None)
        
        cloud_db = getattr(current_app, "cloud_db", None)
        return UserModel(db, cloud_client=cloud_db)

    def _normalize_role(self, role: str) -> str:
        raw = (role or "").strip().lower()
        return raw if raw in self.role_order else "viewer"
    
    def _validate_password_strength(self, password: str) -> Tuple[bool, Optional[str]]:
        """验证密码强度"""
        import os
        import re
        
        min_length = int(os.getenv("PASSWORD_MIN_LENGTH", "8"))
        require_special = os.getenv("PASSWORD_REQUIRE_SPECIAL", "true").lower() == "true"
        require_number = os.getenv("PASSWORD_REQUIRE_NUMBER", "true").lower() == "true"
        require_uppercase = os.getenv("PASSWORD_REQUIRE_UPPERCASE", "true").lower() == "true"
        
        if len(password) < min_length:
            return False, f"密码长度不能少于{min_length}位"
        
        if require_uppercase and not re.search(r'[A-Z]', password):
            return False, "密码必须包含大写字母"
        
        if require_number and not re.search(r'\d', password):
            return False, "密码必须包含数字"
        
        if require_special and not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
            return False, "密码必须包含特殊字符"
        
        return True, None

    def _hash_password(self, password: str, *, iterations: int = 200_000) -> str:
        salt = os.urandom(16)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
        return "pbkdf2_sha256${}${}${}".format(
            iterations,
            base64.urlsafe_b64encode(salt).decode("ascii").rstrip("="),
            base64.urlsafe_b64encode(dk).decode("ascii").rstrip("="),
        )

    def _verify_password(self, password: str, stored: str) -> bool:
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

    def issue_token(self, username: str, role: str) -> Dict[str, str]:
        import time
        import uuid
        now_ts = int(time.time())
        
        # Access Token (15 min)
        access_exp = now_ts + 900 
        access_payload = {
            "sub": username,
            "role": role,
            "iat": now_ts,
            "exp": access_exp,
            "type": "access"
        }
        access_token = jwt.encode(access_payload, self.jwt_secret, algorithm=self.jwt_algorithm)
        
        # Refresh Token (7 days)
        refresh_exp = now_ts + (7 * 86400)
        refresh_id = str(uuid.uuid4())
        refresh_payload = {
            "sub": username,
            "role": role,
            "iat": now_ts,
            "exp": refresh_exp,
            "jti": refresh_id,
            "type": "refresh"
        }
        refresh_token = jwt.encode(refresh_payload, self.jwt_secret, algorithm=self.jwt_algorithm)
        
        # Store session in DB (optional - don't fail if DB is not available)
        try:
            from flask import request
            # 获取设备信息和IP地址
            device_info = request.headers.get('User-Agent', 'unknown') if request else 'unknown'
            ip = request.remote_addr if request else 'unknown'
            
            refresh_token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
            model = self._get_model()
            if model and (model.db is not None or model.cloud_client is not None):
                model.create_session(
                    user_id=username,
                    device_info=device_info,
                    ip=ip,
                    refresh_token_hash=refresh_token_hash,
                    expires_at=datetime.fromtimestamp(refresh_exp)
                )
        except Exception as e:
            logger.warning(f"创建会话失败（非关键错误）: {e}")
        
        return {
            "token": access_token, # Keep 'token' for backward compatibility
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_in": 900
        }

    def refresh_token(self, refresh_token: str) -> Tuple[bool, Optional[Dict[str, str]], Optional[str]]:
        try:
            payload = jwt.decode(refresh_token, self.jwt_secret, algorithms=[self.jwt_algorithm])
            if payload.get("type") != "refresh":
                return False, None, "Invalid token type"
                
            username = payload["sub"]
            role = payload["role"]
            
            # Verify session in DB
            refresh_token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
            model = self._get_model()
            session = model.find_session(refresh_token_hash)
            
            if not session:
                return False, None, "Session expired or revoked"
                
            # Revoke old session (Refresh Token Rotation)
            model.revoke_session(session["_id"])
            
            # Issue new tokens
            new_tokens = self.issue_token(username, role)
            return True, new_tokens, None
            
        except jwt.ExpiredSignatureError:
            return False, None, "Refresh token expired"
        except jwt.InvalidTokenError:
            return False, None, "Invalid refresh token"

    def login_by_email(self, email: str, password: str) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str]]:
        model = self._get_model()
        user = model.find_user_by_email(email)
        
        if not user:
            return False, None, "用户不存在"
            
        stored_hash = user.get("password_hash")
        if not stored_hash:
            return False, None, "该用户未设置密码"
            
        if self._verify_password(password, stored_hash):
            model.update_user_login_time(user['openid'])
            self._sync_user_to_customer(user)
            return True, user, None
            
        return False, None, "密码错误"
        
    def request_password_reset(self, email_or_phone: str) -> Tuple[bool, str]:
        # Generate token
        import uuid
        token = str(uuid.uuid4())[:6] # Simple 6-digit code for now
        
        # Send code
        if "@" in email_or_phone:
            from services.captcha_service import CaptchaService
            CaptchaService.send_email(email_or_phone, token)
        else:
            from services.captcha_service import CaptchaService
            CaptchaService.send_sms(email_or_phone, token)
            
        # TODO: Store token in Redis with expiry
        return True, "验证码已发送"

    def authenticate_admin(self, username: str, password: str) -> Tuple[bool, Optional[str], Optional[str]]:
        # 1. Check Env/Default Admin
        if username == self.admin_username:
            # Support both plain text and hashed passwords
            if self.admin_password.startswith("pbkdf2_sha256$"):
                # Hashed password
                password_match = self._verify_password(password, self.admin_password)
            else:
                # Plain text password (for development/first setup)
                password_match = (password == self.admin_password)
            
            if password_match:
                return True, self._normalize_role(self.admin_role), None

        # 2. Check DB Admin (only if database is available)
        try:
            model = self._get_model()
            user = model.find_admin_user(username)
            if user:
                stored_hash = user.get("password_hash")
                if isinstance(stored_hash, str) and self._verify_password(password, stored_hash):
                    role = self._normalize_role(str(user.get("role") or "viewer"))
                    return True, role, None
        except Exception as e:
            logger.warning(f"数据库查询失败，仅使用环境变量配置的管理员: {e}")
        
        return False, None, "用户名或密码错误"

    def upsert_admin_user(self, username: str, password: str, role: str):
        normalized_role = self._normalize_role(role)
        password_hash = self._hash_password(password)
        
        model = self._get_model()
        data = {
            "role": normalized_role,
            "password_hash": password_hash
        }
        return model.upsert_admin_user(username, data)

    def delete_admin_user(self, username: str) -> bool:
        model = self._get_model()
        return model.delete_admin_user(username)

    def list_admin_users(self) -> List[Dict[str, Any]]:
        model = self._get_model()
        return model.list_admin_users()

    def _get_customer_model(self):
        from models.customer import CustomerModel
        ensure_db = getattr(current_app, "ensure_db", None)
        db = None
        if callable(ensure_db):
            db = ensure_db()
        if db is None:
            db = getattr(current_app, "db", None)
        cloud_db = getattr(current_app, "cloud_db", None)
        return CustomerModel(db, cloud_client=cloud_db)

    def _sync_user_to_customer(self, user: Dict[str, Any]):
        """
        Sync user data to customer collection to ensure Unified Identity.
        """
        try:
            cust_model = self._get_customer_model()
            cust_model.upsert_customer_from_user(user)
            logger.info(f"Synced user {user.get('openid')} to customer collection.")
        except Exception as e:
            logger.error(f"Failed to sync user to customer: {e}")

    def wechat_login(self, code: str) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str]]:
        # Dev Mode Support - 支持 mock code 或配置缺失时自动降级
        node_env = os.getenv("NODE_ENV", "development")
        is_dev_mode = node_env == "development"
        has_wx_config = self.wx_appid and self.wx_secret
        
        # 检查数据库连接状态
        try:
            model = self._get_model()
            has_db_connection = model and (model.db is not None or model.cloud_client is not None)
        except Exception:
            has_db_connection = False
        
        # 如果是 mock code，或者缺少微信配置，使用模拟登录（任何环境都支持 mock code）
        if code.startswith("mock_") or not has_wx_config:
            try:
                logger.info(f"[Mock登录] 开始处理. Code: {code[:20]}..., has_wx_config: {has_wx_config}, has_db: {has_db_connection}")
                
                openid = f"mock_openid_{code[:20]}"
                unionid = f"mock_unionid_{code[:20]}"
                
                logger.info(f"[Mock登录] 生成openid: {openid}, unionid: {unionid}")
                
                # 模拟登录时，始终返回内存中的模拟用户数据，不依赖数据库
                # 这样即使数据库连接失败（MongoDB 或云数据库），登录仍可正常工作
                user = {
                    'openid': openid,
                    'unionid': unionid,
                    'nickname': '开发用户',
                    'avatar': '',
                    'phone': '',
                    'created_at': datetime.utcnow(),
                    'last_login': datetime.utcnow()
                }
                
                logger.info(f"[Mock登录] 用户对象创建成功: {user}")
                
                # 尝试同步到客户表（非阻塞，失败不影响登录）
                try:
                    logger.info(f"[Mock登录] 尝试同步用户到客户表...")
                    self._sync_user_to_customer(user)
                    logger.info(f"[Mock登录] 用户同步成功")
                except Exception as sync_err:
                    logger.warning(f"[Mock登录] 同步用户到客户表失败（不影响登录）: {sync_err}")
                
                logger.info(f"[Mock登录] 返回成功: openid={openid}")
                return True, user, None
                
            except Exception as e:
                logger.exception(f"[Mock登录] 失败: {e}")
                return False, None, f"模拟登录失败: {str(e)}"
            
        url = 'https://api.weixin.qq.com/sns/jscode2session'
        params = {
            'appid': self.wx_appid,
            'secret': self.wx_secret,
            'js_code': code,
            'grant_type': 'authorization_code'
        }
        
        try:
            response = requests.get(url, params=params, timeout=10)
            result = response.json()
            
            if 'openid' not in result:
                return False, None, f"微信登录失败: {result.get('errmsg', '未知错误')}"
                
            openid = result['openid']
            unionid = result.get('unionid')
            
            # 如果没有数据库连接，返回内存中的用户数据
            if not has_db_connection:
                logger.warning("数据库未连接，返回内存中的微信用户数据")
                user = {
                    'openid': openid,
                    'unionid': unionid,
                    'nickname': '微信用户',
                    'avatar': '',
                    'phone': '',
                    'created_at': datetime.utcnow(),
                    'last_login': datetime.utcnow()
                }
                return True, user, None
            
            model = self._get_model()
            user = model.find_user_by_openid(openid)
            
            if not user:
                # Create
                user_data = {
                    'openid': openid,
                    'unionid': unionid,
                    'nickname': '微信用户',
                    'avatar': '',
                    'phone': '',
                    'created_at': datetime.utcnow(),
                    'last_login': datetime.utcnow()
                }
                model.create_user(user_data)
                user = user_data # return the data
            else:
                # Update login time
                model.update_user_login_time(openid)
            
            # Sync Identity
            self._sync_user_to_customer(user)
            return True, user, None
            
        except requests.RequestException as e:
            logger.error(f"微信API请求失败，降级到模拟登录: {e}")
            # 网络错误时降级到模拟登录
            openid = f"mock_openid_{code[:20]}"
            unionid = f"mock_unionid_{code[:20]}"
            user = {
                'openid': openid,
                'unionid': unionid,
                'nickname': '微信用户(离线)',
                'avatar': '',
                'phone': '',
                'created_at': datetime.utcnow(),
                'last_login': datetime.utcnow()
            }
            return True, user, None
        except Exception as e:
            logger.error(f"微信登录系统错误，降级到模拟登录: {e}")
            # 任何错误都降级到模拟登录
            openid = f"mock_openid_{code[:20]}"
            unionid = f"mock_unionid_{code[:20]}"
            user = {
                'openid': openid,
                'unionid': unionid,
                'nickname': '微信用户(离线)',
                'avatar': '',
                'phone': '',
                'created_at': datetime.utcnow(),
                'last_login': datetime.utcnow()
            }
            return True, user, None

    def update_user_profile(self, openid: str, data: Dict[str, Any]) -> bool:
        updates = {}
        if 'nickname' in data:
            updates['nickname'] = data['nickname']
        if 'avatar' in data:
            updates['avatar'] = data['avatar']
        if 'phone' in data:
            updates['phone'] = data['phone']
            
        if not updates:
            return False
            
        model = self._get_model()
        success = model.update_user_profile(openid, updates)
        
        if success:
            # Re-fetch user to get full data for sync
            user = model.find_user_by_openid(openid)
            if user:
                self._sync_user_to_customer(user)
                
        return success

    def register_user(self, phone: str, password: str, email: str = None, nickname: str = None) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str]]:
        model = self._get_model()
        
        # Check if user already exists
        if model.find_user_by_phone(phone):
            return False, None, "该手机号已注册"
        if email and model.find_user_by_email(email):
            return False, None, "该邮箱已注册"
        
        # 验证密码强度
        is_valid, error_msg = self._validate_password_strength(password)
        if not is_valid:
            return False, None, error_msg

        password_hash = self._hash_password(password)
        
        # Create user data
        # Use phone as temporary openid if not provided (or generate a unique ID)
        import uuid
        user_id = str(uuid.uuid4())
        
        user_data = {
            'openid': user_id, # For compatibility with existing system
            'unionid': None,
            'nickname': nickname or f'用户{phone[-4:]}',
            'avatar': '',
            'phone': phone,
            'email': email,
            'password_hash': password_hash,
            'created_at': datetime.utcnow(),
            'last_login': datetime.utcnow(),
            'role': 'user'
        }
        
        try:
            model.create_user(user_data)
            # Sync Identity
            self._sync_user_to_customer(user_data)
            return True, user_data, None
        except Exception as e:
            return False, None, str(e)

    def login_by_phone(self, phone: str, password: str) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str]]:
        model = self._get_model()
        user = model.find_user_by_phone(phone)
        
        if not user:
            return False, None, "用户不存在"
            
        stored_hash = user.get("password_hash")
        if not stored_hash:
            return False, None, "该用户未设置密码，请使用验证码登录"
            
        if self._verify_password(password, stored_hash):
            # Update login time
            model.update_user_login_time(user['openid'])
            # Sync Identity (in case it was missed)
            self._sync_user_to_customer(user)
            return True, user, None
            
        return False, None, "密码错误"

    def login_or_register_by_phone(self, phone: str) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str]]:
        """验证码登录：已注册则登录，未注册则自动创建账号"""
        model = self._get_model()
        user = model.find_user_by_phone(phone)

        if user:
            # 已注册，直接登录
            model.update_user_login_time(user['openid'])
            self._sync_user_to_customer(user)
            return True, user, None

        # 未注册，自动创建新账号
        import uuid
        user_data = {
            'openid': str(uuid.uuid4()),
            'unionid': None,
            'nickname': f'用户{phone[-4:]}',
            'avatar': '',
            'phone': phone,
            'email': None,
            'password_hash': None,  # 验证码注册无密码
            'created_at': datetime.utcnow(),
            'last_login': datetime.utcnow(),
            'role': 'user'
        }
        try:
            model.create_user(user_data)
            self._sync_user_to_customer(user_data)
            return True, user_data, None
        except Exception as e:
            return False, None, str(e)

    def get_user_profile(self, openid: str) -> Optional[Dict[str, Any]]:
        model = self._get_model()
        return model.find_user_by_openid(openid)
