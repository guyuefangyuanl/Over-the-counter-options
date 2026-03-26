"""
安全增强服务
包含：IP白名单管理、登录历史记录、异常登录检测
"""

import hashlib
import time
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from functools import wraps
from flask import current_app, g, request

# 尝试导入数据库服务
try:
    from services.database_service import get_db_service
except ImportError:
    get_db_service = None


# ==================== IP白名单管理 ====================

class IPWhitelistService:
    """
    IP白名单服务
    支持管理后台访问控制、API访问限制
    """

    # 白名单类型
    TYPE_ADMIN = 'admin'           # 管理后台访问
    TYPE_API = 'api'               # API访问
    TYPE_WEBHOOK = 'webhook'       # Webhook回调
    TYPE_PARTNER = 'partner'       # 合作伙伴

    def __init__(self):
        self.db = get_db_service() if get_db_service else None
        self._cache = {}  # 内存缓存
        self._cache_time = {}
        self._cache_ttl = 300  # 缓存5分钟

    def add_to_whitelist(self, ip_address: str, ip_type: str = 'admin',
                        description: str = '', created_by: str = '',
                        expires_at: Optional[str] = None) -> Dict[str, Any]:
        """
        添加IP到白名单

        Args:
            ip_address: IP地址（支持CIDR格式，如 192.168.1.0/24）
            ip_type: 白名单类型
            description: 描述
            created_by: 创建者
            expires_at: 过期时间（可选）
        """
        # 验证IP格式
        if not self._validate_ip_format(ip_address):
            return {'success': False, 'error': 'IP地址格式无效'}

        # 检查是否已存在
        if self._check_exists(ip_address, ip_type):
            return {'success': False, 'error': '该IP已存在于白名单中'}

        entry = {
            'id': str(uuid.uuid4()),
            'ip_address': ip_address,
            'ip_type': ip_type,
            'description': description,
            'created_by': created_by,
            'created_at': datetime.now().isoformat(),
            'expires_at': expires_at,
            'is_active': True
        }

        if self.db:
            try:
                self.db.insert('ip_whitelist', entry)
                self._invalidate_cache(ip_type)
            except Exception as e:
                current_app.logger.error(f"添加IP白名单失败: {e}")
                return {'success': False, 'error': '添加失败'}

        return {'success': True, 'data': entry}

    def remove_from_whitelist(self, ip_address: str,
                              ip_type: str = 'admin') -> Dict[str, Any]:
        """
        从白名单移除IP
        """
        if self.db:
            try:
                self.db.delete('ip_whitelist',
                              {'ip_address': ip_address, 'ip_type': ip_type})
                self._invalidate_cache(ip_type)
            except Exception as e:
                current_app.logger.error(f"移除IP白名单失败: {e}")
                return {'success': False, 'error': '移除失败'}

        return {'success': True}

    def is_ip_allowed(self, ip_address: str, ip_type: str = 'admin') -> bool:
        """
        检查IP是否在白名单中

        Args:
            ip_address: 要检查的IP地址
            ip_type: 白名单类型
        """
        # 检查缓存
        cache_key = f"{ip_type}:{ip_address}"
        if cache_key in self._cache:
            cache_time = self._cache_time.get(cache_key, 0)
            if time.time() - cache_time < self._cache_ttl:
                return self._cache[cache_key]

        # 从数据库查询
        whitelist = self._get_whitelist(ip_type)

        # 检查IP匹配
        is_allowed = self._check_ip_match(ip_address, whitelist)

        # 更新缓存
        self._cache[cache_key] = is_allowed
        self._cache_time[cache_key] = time.time()

        return is_allowed

    def get_whitelist(self, ip_type: Optional[str] = None) -> List[Dict]:
        """
        获取白名单列表
        """
        if ip_type:
            return self._get_whitelist(ip_type)

        if self.db:
            try:
                return self.db.query('ip_whitelist', {'is_active': True})
            except Exception:
                pass

        return []

    def _get_whitelist(self, ip_type: str) -> List[Dict]:
        """获取指定类型的白名单"""
        if self.db:
            try:
                entries = self.db.query('ip_whitelist',
                                        {'ip_type': ip_type, 'is_active': True})
                # 过滤过期的条目
                now = datetime.now()
                valid_entries = []
                for entry in entries:
                    if entry.get('expires_at'):
                        if datetime.fromisoformat(entry['expires_at']) < now:
                            continue
                    valid_entries.append(entry)
                return valid_entries
            except Exception:
                pass
        return []

    def _check_ip_match(self, ip_address: str, whitelist: List[Dict]) -> bool:
        """
        检查IP是否匹配白名单
        支持单IP和CIDR格式
        """
        for entry in whitelist:
            entry_ip = entry.get('ip_address', '')

            if '/' in entry_ip:
                # CIDR格式，检查IP范围
                if self._check_cidr_match(ip_address, entry_ip):
                    return True
            else:
                # 单IP，精确匹配
                if ip_address == entry_ip:
                    return True

        return False

    def _check_cidr_match(self, ip_address: str, cidr: str) -> bool:
        """
        检查IP是否在CIDR范围内
        """
        try:
            import ipaddress
            network = ipaddress.ip_network(cidr, strict=False)
            addr = ipaddress.ip_address(ip_address)
            return addr in network
        except ImportError:
            # 简化处理：只检查前缀匹配
            prefix = cidr.split('/')[0]
            parts = prefix.split('.')
            ip_parts = ip_address.split('.')

            # 简单的前缀匹配
            match_count = sum(1 for i in range(4) if parts[i] == ip_parts[i] or parts[i] == '*')
            return match_count >= 3
        except Exception:
            return False

    def _validate_ip_format(self, ip_address: str) -> bool:
        """验证IP格式"""
        try:
            import ipaddress
            if '/' in ip_address:
                ipaddress.ip_network(ip_address, strict=False)
            else:
                ipaddress.ip_address(ip_address)
            return True
        except Exception:
            return False

    def _check_exists(self, ip_address: str, ip_type: str) -> bool:
        """检查IP是否已存在"""
        if self.db:
            try:
                existing = self.db.query_one('ip_whitelist',
                                             {'ip_address': ip_address,
                                              'ip_type': ip_type})
                return existing is not None
            except Exception:
                pass
        return False

    def _invalidate_cache(self, ip_type: str):
        """清除缓存"""
        keys_to_remove = [k for k in self._cache.keys() if k.startswith(f"{ip_type}:")]
        for k in keys_to_remove:
            self._cache.pop(k, None)
            self._cache_time.pop(k, None)


# ==================== 登录历史记录 ====================

class LoginHistoryService:
    """
    登录历史服务
    记录登录日志、检测异常登录
    """

    # 登录状态
    STATUS_SUCCESS = 'success'
    STATUS_FAILED = 'failed'
    STATUS_BLOCKED = 'blocked'   # 被安全策略拦截

    # 设备类型
    DEVICE_MOBILE = 'mobile'
    DEVICE_DESKTOP = 'desktop'
    DEVICE_TABLET = 'tablet'
    DEVICE_MINIPROGRAM = 'miniprogram'  # 小程序

    # 异常类型
    ANOMALY_NEW_DEVICE = 'new_device'
    ANOMALY_NEW_LOCATION = 'new_location'
    ANOMALY_UNUSUAL_TIME = 'unusual_time'
    ANOMALY_MULTIPLE_FAILED = 'multiple_failed'
    ANOMALY_RAPID_LOGIN = 'rapid_login'      # 短时间内多地登录

    # 安全配置
    MAX_FAILED_ATTEMPTS = 5          # 最大失败次数
    FAILED_LOCKOUT_TIME = 30 * 60    # 锁定时间（秒）
    RAPID_LOGIN_THRESHOLD = 5 * 60   # 快速登录阈值（秒）

    def __init__(self):
        self.db = get_db_service() if get_db_service else None

    def record_login(self, user_id: str, login_method: str,
                    status: str = 'success',
                    ip_address: str = '',
                    user_agent: str = '',
                    device_info: Optional[Dict] = None,
                    location_info: Optional[Dict] = None,
                    failure_reason: str = '') -> Dict[str, Any]:
        """
        记录登录日志

        Args:
            user_id: 用户ID
            login_method: 登录方式 (password/sms/wechat/email)
            status: 登录状态
            ip_address: IP地址
            user_agent: User-Agent
            device_info: 设备信息
            location_info: 位置信息
            failure_reason: 失败原因

        Returns:
            记录结果，包含异常检测结果
        """
        login_id = f"LOGIN_{uuid.uuid4().hex[:12].upper()}"

        # 解析设备和位置信息
        if not device_info:
            device_info = self._parse_user_agent(user_agent)
        if not location_info:
            location_info = self._get_location_by_ip(ip_address)

        # 检测异常
        anomalies = []
        if status == self.STATUS_SUCCESS:
            anomalies = self._detect_anomalies(user_id, ip_address, device_info)

        login_record = {
            'login_id': login_id,
            'user_id': user_id,
            'login_method': login_method,
            'status': status,
            'ip_address': ip_address,
            'user_agent': user_agent,
            'device_type': device_info.get('device_type', 'unknown'),
            'device_name': device_info.get('device_name', 'Unknown'),
            'os': device_info.get('os', 'Unknown'),
            'browser': device_info.get('browser', 'Unknown'),
            'country': location_info.get('country', ''),
            'province': location_info.get('province', ''),
            'city': location_info.get('city', ''),
            'latitude': location_info.get('latitude'),
            'longitude': location_info.get('longitude'),
            'failure_reason': failure_reason,
            'anomalies': anomalies,
            'login_at': datetime.now().isoformat()
        }

        # 存储记录
        if self.db:
            try:
                self.db.insert('login_history', login_record)
            except Exception as e:
                current_app.logger.error(f"记录登录日志失败: {e}")

        # 处理异常登录
        if anomalies:
            self._handle_anomaly_login(user_id, anomalies, login_record)

        return {
            'success': True,
            'login_id': login_id,
            'anomalies': anomalies,
            'has_anomaly': len(anomalies) > 0
        }

    def get_login_history(self, user_id: str, limit: int = 20,
                         offset: int = 0) -> List[Dict]:
        """
        获取登录历史

        Args:
            user_id: 用户ID
            limit: 返回数量
            offset: 偏移量
        """
        if self.db:
            try:
                records = self.db.query('login_history',
                                        {'user_id': user_id},
                                        order_by='-login_at',
                                        limit=limit,
                                        offset=offset)
                return records
            except Exception as e:
                current_app.logger.error(f"获取登录历史失败: {e}")

        return []

    def get_active_sessions(self, user_id: str) -> List[Dict]:
        """
        获取活跃会话（最近的登录设备）
        """
        if self.db:
            try:
                # 获取最近24小时内的成功登录
                since = datetime.now() - timedelta(hours=24)
                records = self.db.query('login_history',
                                        {'user_id': user_id,
                                         'status': self.STATUS_SUCCESS},
                                        order_by='-login_at',
                                        limit=10)

                # 按设备去重
                seen_devices = set()
                sessions = []
                for record in records:
                    device_key = f"{record.get('device_type')}_{record.get('ip_address')}"
                    if device_key not in seen_devices:
                        seen_devices.add(device_key)
                        sessions.append({
                            'login_id': record.get('login_id'),
                            'device_name': record.get('device_name', 'Unknown'),
                            'device_type': record.get('device_type', 'unknown'),
                            'ip_address': record.get('ip_address'),
                            'location': self._format_location(record),
                            'login_at': record.get('login_at'),
                            'is_current': record.get('login_id') == g.get('login_id') if hasattr(g, 'login_id') else False
                        })

                return sessions
            except Exception as e:
                current_app.logger.error(f"获取活跃会话失败: {e}")

        return []

    def check_brute_force(self, user_id: str, ip_address: str) -> Dict[str, Any]:
        """
        检查暴力破解风险

        Returns:
            {'is_blocked': bool, 'failed_count': int, 'lockout_until': str}
        """
        # 获取最近的失败登录
        time_window = datetime.now() - timedelta(minutes=30)

        if self.db:
            try:
                failed_logins = self.db.query('login_history',
                                              {'user_id': user_id,
                                               'status': self.STATUS_FAILED},
                                              order_by='-login_at',
                                              limit=self.MAX_FAILED_ATTEMPTS + 1)

                # 过滤时间窗口内的记录
                recent_failed = [
                    r for r in failed_logins
                    if datetime.fromisoformat(r.get('login_at', '1970-01-01')) > time_window
                ]

                failed_count = len(recent_failed)
                is_blocked = failed_count >= self.MAX_FAILED_ATTEMPTS

                lockout_until = None
                if is_blocked and recent_failed:
                    last_failed_time = datetime.fromisoformat(recent_failed[0].get('login_at'))
                    lockout_until = (last_failed_time + timedelta(seconds=self.FAILED_LOCKOUT_TIME)).isoformat()

                return {
                    'is_blocked': is_blocked,
                    'failed_count': failed_count,
                    'lockout_until': lockout_until,
                    'remaining_attempts': max(0, self.MAX_FAILED_ATTEMPTS - failed_count)
                }
            except Exception as e:
                current_app.logger.error(f"检查暴力破解失败: {e}")

        return {'is_blocked': False, 'failed_count': 0, 'remaining_attempts': self.MAX_FAILED_ATTEMPTS}

    def _detect_anomalies(self, user_id: str, ip_address: str,
                         device_info: Dict) -> List[str]:
        """
        检测登录异常
        """
        anomalies = []

        # 获取历史登录信息
        history = self.get_login_history(user_id, limit=10)
        if not history:
            # 首次登录
            return [self.ANOMALY_NEW_DEVICE]

        # 检查新设备
        known_devices = set()
        for h in history:
            device_key = f"{h.get('device_type')}_{h.get('os')}_{h.get('browser')}"
            known_devices.add(device_key)

        current_device_key = f"{device_info.get('device_type')}_{device_info.get('os')}_{device_info.get('browser')}"
        if current_device_key not in known_devices:
            anomalies.append(self.ANOMALY_NEW_DEVICE)

        # 检查新位置
        known_ips = set(h.get('ip_address') for h in history if h.get('ip_address'))
        if ip_address not in known_ips:
            anomalies.append(self.ANOMALY_NEW_LOCATION)

        # 检查异常时间（凌晨2-6点）
        current_hour = datetime.now().hour
        if 2 <= current_hour <= 6:
            # 检查用户是否有这个时间段的登录历史
            unusual_time_login = any(
                2 <= datetime.fromisoformat(h.get('login_at', '1970-01-01')).hour <= 6
                for h in history
            )
            if not unusual_time_login:
                anomalies.append(self.ANOMALY_UNUSUAL_TIME)

        # 检查快速多地登录
        if history:
            last_login = history[0]
            last_login_time = datetime.fromisoformat(last_login.get('login_at', '1970-01-01'))
            time_diff = (datetime.now() - last_login_time).total_seconds()

            if time_diff < self.RAPID_LOGIN_THRESHOLD:
                last_ip = last_login.get('ip_address')
                if last_ip and last_ip != ip_address:
                    anomalies.append(self.ANOMALY_RAPID_LOGIN)

        return anomalies

    def _handle_anomaly_login(self, user_id: str, anomalies: List[str],
                              login_record: Dict):
        """
        处理异常登录
        """
        # 发送安全提醒
        try:
            # from services.notification_service import send_security_alert
            # send_security_alert(user_id, anomalies, login_record)
            current_app.logger.info(f"检测到异常登录: user={user_id}, anomalies={anomalies}")
        except Exception as e:
            current_app.logger.error(f"发送安全提醒失败: {e}")

    def _parse_user_agent(self, user_agent: str) -> Dict:
        """解析User-Agent"""
        device_info = {
            'device_type': self.DEVICE_DESKTOP,
            'device_name': 'Unknown',
            'os': 'Unknown',
            'browser': 'Unknown'
        }

        if not user_agent:
            return device_info

        ua_lower = user_agent.lower()

        # 检测小程序
        if 'miniprogram' in ua_lower or 'micromessenger' in ua_lower:
            device_info['device_type'] = self.DEVICE_MINIPROGRAM
            device_info['device_name'] = '微信小程序'

        # 检测移动设备
        elif 'mobile' in ua_lower or 'android' in ua_lower or 'iphone' in ua_lower:
            device_info['device_type'] = self.DEVICE_MOBILE
            if 'iphone' in ua_lower:
                device_info['device_name'] = 'iPhone'
            elif 'android' in ua_lower:
                device_info['device_name'] = 'Android'
            elif 'ipad' in ua_lower:
                device_info['device_type'] = self.DEVICE_TABLET
                device_info['device_name'] = 'iPad'

        # 检测操作系统
        if 'windows' in ua_lower:
            device_info['os'] = 'Windows'
        elif 'mac' in ua_lower:
            device_info['os'] = 'macOS'
        elif 'linux' in ua_lower:
            device_info['os'] = 'Linux'
        elif 'android' in ua_lower:
            device_info['os'] = 'Android'
        elif 'ios' in ua_lower or 'iphone' in ua_lower or 'ipad' in ua_lower:
            device_info['os'] = 'iOS'

        # 检测浏览器
        if 'chrome' in ua_lower:
            device_info['browser'] = 'Chrome'
        elif 'safari' in ua_lower:
            device_info['browser'] = 'Safari'
        elif 'firefox' in ua_lower:
            device_info['browser'] = 'Firefox'
        elif 'edge' in ua_lower:
            device_info['browser'] = 'Edge'

        return device_info

    def _get_location_by_ip(self, ip_address: str) -> Dict:
        """根据IP获取位置信息"""
        # 这里应该调用IP地理位置服务
        # 简化处理：返回空信息
        return {
            'country': '',
            'province': '',
            'city': '',
            'latitude': None,
            'longitude': None
        }

    def _format_location(self, record: Dict) -> str:
        """格式化位置信息"""
        parts = []
        if record.get('city'):
            parts.append(record['city'])
        if record.get('province') and record.get('province') != record.get('city'):
            parts.append(record['province'])
        if not parts and record.get('country'):
            parts.append(record['country'])
        return ' '.join(parts) if parts else '未知位置'


# 创建服务实例
ip_whitelist_service = IPWhitelistService()
login_history_service = LoginHistoryService()


# ==================== 装饰器 ====================

def require_ip_whitelist(ip_type: str = 'admin'):
    """
    IP白名单检查装饰器
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # 获取客户端IP
            client_ip = request.remote_addr
            if request.headers.get('X-Forwarded-For'):
                client_ip = request.headers.get('X-Forwarded-For').split(',')[0].strip()

            # 检查白名单
            if not ip_whitelist_service.is_ip_allowed(client_ip, ip_type):
                current_app.logger.warning(f"IP {client_ip} 不在白名单中")
                return {
                    'success': False,
                    'error': 'ACCESS_DENIED',
                    'message': '访问被拒绝，IP不在白名单中'
                }, 403

            return f(*args, **kwargs)
        return decorated_function
    return decorator


def log_login_activity(login_method: str):
    """
    登录活动记录装饰器
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # 执行登录逻辑
            result = f(*args, **kwargs)

            # 记录登录日志
            try:
                # 从结果中提取用户信息
                if isinstance(result, tuple):
                    response, status_code = result
                else:
                    response = result
                    status_code = 200

                user_id = None
                if isinstance(response, dict):
                    if response.get('success'):
                        user_id = response.get('data', {}).get('user_id') or \
                                  response.get('user_id')

                if user_id:
                    client_ip = request.remote_addr
                    if request.headers.get('X-Forwarded-For'):
                        client_ip = request.headers.get('X-Forwarded-For').split(',')[0].strip()

                    login_history_service.record_login(
                        user_id=user_id,
                        login_method=login_method,
                        status='success' if response.get('success') else 'failed',
                        ip_address=client_ip,
                        user_agent=request.headers.get('User-Agent', ''),
                        failure_reason=response.get('error', '') if not response.get('success') else ''
                    )
            except Exception as e:
                current_app.logger.error(f"记录登录活动失败: {e}")

            return result
        return decorated_function
    return decorator


# 导出
module_exports = {
    'IPWhitelistService': IPWhitelistService,
    'LoginHistoryService': LoginHistoryService,
    'ip_whitelist_service': ip_whitelist_service,
    'login_history_service': login_history_service,
    'require_ip_whitelist': require_ip_whitelist,
    'log_login_activity': log_login_activity
}