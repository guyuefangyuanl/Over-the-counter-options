"""
真实用户数据测试模块
用于验证账户功能的完整性、安全性和稳定性
"""
from datetime import datetime, timedelta
import random
import string
import hashlib
import uuid

class RealUserDataFactory:
    """真实用户数据工厂"""
    
    @staticmethod
    def generate_phone():
        """生成真实的手机号格式"""
        prefixes = ['138', '139', '150', '151', '152', '158', '159', '186', '187', '188', '189']
        return random.choice(prefixes) + ''.join(random.choices(string.digits, k=8))
    
    @staticmethod
    def generate_email():
        """生成真实的邮箱格式"""
        domains = ['gmail.com', 'qq.com', '163.com', '126.com', 'outlook.com', 'hotmail.com']
        username = ''.join(random.choices(string.ascii_lowercase, k=8))
        return f"{username}@{random.choice(domains)}"
    
    @staticmethod
    def generate_password():
        """生成符合安全策略的密码"""
        # 密码要求: 8-20位，包含大小写字母、数字和特殊字符
        upper = random.choice(string.ascii_uppercase)
        lower = ''.join(random.choices(string.ascii_lowercase, k=4))
        digits = ''.join(random.choices(string.digits, k=3))
        special = random.choice(['@', '#', '$', '%', '&', '*', '!'])
        return f"{upper}{lower}{digits}{special}"
    
    @staticmethod
    def generate_nickname():
        """生成真实的昵称"""
        prefixes = ['小明', '小花', '大山', '清风', '明月', '星海', '云霞', '晨曦', '暮雪', '秋水']
        suffixes = ['用户', '会员', 'VIP', '会员', '交易员', '投资者', '分析师']
        return random.choice(prefixes) + random.choice(suffixes) + str(random.randint(100, 999))
    
    @staticmethod
    def generate_openid():
        """生成模拟的微信openid"""
        return hashlib.md5(uuid.uuid4().bytes).hexdigest()
    
    @staticmethod
    def generate_vip_id(openid):
        """生成VIP ID"""
        return openid[:8].upper()
    
    @staticmethod
    def create_wechat_user():
        """创建微信登录用户数据"""
        openid = RealUserDataFactory.generate_openid()
        return {
            'openid': openid,
            'nickname': RealUserDataFactory.generate_nickname(),
            'avatar': f'https://avatar.example.com/{openid[:8]}.jpg',
            'vipLevel': random.choice(['V1', 'V2', 'V3', 'V4']),
            'vipId': RealUserDataFactory.generate_vip_id(openid),
            'memberType': random.choice(['普通会员', 'VIP会员', '企业会员']),
            'role': 'user',
            'balance': round(random.uniform(0, 100000), 2),
            'created_at': datetime.utcnow(),
            'last_login': datetime.utcnow(),
            'login_count': random.randint(1, 100),
            'is_active': True,
            'statistics': {
                'totalInquiries': random.randint(0, 50),
                'successfulTrades': random.randint(0, 20),
                'favoriteStocks': random.randint(0, 10),
                'daysUsed': random.randint(1, 365)
            }
        }
    
    @staticmethod
    def create_phone_user():
        """创建手机号登录用户数据"""
        phone = RealUserDataFactory.generate_phone()
        openid = f'phone_{hashlib.md5(phone.encode()).hexdigest()[:24]}'
        return {
            'openid': openid,
            'phone': phone,
            'nickname': RealUserDataFactory.generate_nickname(),
            'password': RealUserDataFactory.generate_password(),
            'avatar': '',
            'vipLevel': 'V1',
            'vipId': openid[:8].upper(),
            'memberType': '普通会员',
            'role': 'user',
            'balance': 0.0,
            'created_at': datetime.utcnow(),
            'last_login': datetime.utcnow(),
            'login_count': 1,
            'is_active': True,
            'statistics': {
                'totalInquiries': 0,
                'successfulTrades': 0,
                'favoriteStocks': 0,
                'daysUsed': 1
            }
        }
    
    @staticmethod
    def create_email_user():
        """创建邮箱登录用户数据"""
        email = RealUserDataFactory.generate_email()
        openid = f'email_{hashlib.md5(email.encode()).hexdigest()[:24]}'
        return {
            'openid': openid,
            'email': email,
            'nickname': RealUserDataFactory.generate_nickname(),
            'password': RealUserDataFactory.generate_password(),
            'avatar': '',
            'vipLevel': 'V1',
            'vipId': openid[:8].upper(),
            'memberType': '普通会员',
            'role': 'user',
            'balance': 0.0,
            'created_at': datetime.utcnow(),
            'last_login': datetime.utcnow(),
            'login_count': 1,
            'is_active': True,
            'statistics': {
                'totalInquiries': 0,
                'successfulTrades': 0,
                'favoriteStocks': 0,
                'daysUsed': 1
            }
        }
    
    @staticmethod
    def create_guest_user():
        """创建游客用户数据"""
        guest_id = f'guest_{uuid.uuid4().hex[:16]}'
        return {
            'openid': guest_id,
            'nickname': '游客用户',
            'avatar': '',
            'vipLevel': 'V0',
            'vipId': guest_id[:8].upper(),
            'memberType': '游客',
            'role': 'guest',
            'balance': 0.0,
            'created_at': datetime.utcnow(),
            'last_login': datetime.utcnow(),
            'login_count': 1,
            'is_active': True,
            'statistics': {
                'totalInquiries': 0,
                'successfulTrades': 0,
                'favoriteStocks': 0,
                'daysUsed': 1
            }
        }
    
    @staticmethod
    def create_admin_user():
        """创建管理员用户数据"""
        username = f'admin_{random.choice(["test", "super", "manager"])}'
        return {
            'username': username,
            'password': RealUserDataFactory.generate_password(),
            'role': random.choice(['admin', 'super_admin', 'manager']),
            'nickname': username,
            'email': f'{username}@company.com',
            'is_active': True,
            'created_at': datetime.utcnow(),
            'last_login': None,
            'login_count': 0,
            'permissions': {
                'can_create_inquiry': True,
                'can_update_quote': True,
                'can_delete_user': random.choice([True, False]),
                'can_view_all_inquiries': True,
                'can_manage_users': random.choice([True, False])
            }
        }


class LoginHistoryGenerator:
    """登录历史记录生成器"""
    
    @staticmethod
    def create_login_history(user_id: str, count: int = 10):
        """创建登录历史记录"""
        history = []
        base_time = datetime.utcnow() - timedelta(days=30)
        
        devices = [
            {'device': 'iPhone 13 Pro', 'browser': 'Safari', 'os': 'iOS 16.5'},
            {'device': 'Samsung Galaxy S21', 'browser': 'Chrome', 'os': 'Android 12'},
            {'device': 'Windows PC', 'browser': 'Chrome', 'os': 'Windows 10'},
            {'device': 'MacBook Pro', 'browser': 'Safari', 'os': 'macOS 13.0'},
            {'device': 'iPad Air', 'browser:': 'Safari', 'os': 'iOS 16.5'}
        ]
        
        locations = [
            {'ip': '192.168.1.' + str(random.randint(1, 255)), 'city': '北京', 'country': '中国'},
            {'ip': '192.168.2.' + str(random.randint(1, 255)), 'city': '上海', 'country': '中国'},
            {'ip': '10.0.0.' + str(random.randint(1, 255)), 'city': '深圳', 'country': '中国'},
            {'ip': '172.16.0.' + str(random.randint(1, 255)), 'city': '广州', 'country': '中国'},
        ]
        
        for i in range(count):
            login_time = base_time + timedelta(
                days=random.randint(0, 30),
                hours=random.randint(0, 23),
                minutes=random.randint(0, 59)
            )
            
            device_info = random.choice(devices)
            location_info = random.choice(locations)
            
            history.append({
                'user_id': user_id,
                'login_time': login_time.isoformat(),
                'login_type': random.choice(['wechat', 'phone', 'email', 'admin']),
                'ip_address': location_info['ip'],
                'location': {
                    'city': location_info['city'],
                    'country': location_info['country']
                },
                'device': {
                    'name': device_info['device'],
                    'browser': device_info['browser'],
                    'os': device_info['os']
                },
                'status': random.choice(['success', 'success', 'success', 'failed']),
                'session_duration': random.randint(60, 7200) if i < count - 1 else None,  # 最后一次登录可能还在进行
                'logout_time': (login_time + timedelta(seconds=random.randint(60, 7200))).isoformat() if i < count - 1 else None
            })
        
        # 按时间倒序排列
        history.sort(key=lambda x: x['login_time'], reverse=True)
        return history


class TestDataScenarios:
    """测试数据场景"""
    
    @staticmethod
    def get_normal_user_scenarios():
        """正常用户场景"""
        return {
            'new_user': RealUserDataFactory.create_phone_user(),
            'active_user': RealUserDataFactory.create_wechat_user(),
            'vip_user': {
                **RealUserDataFactory.create_wechat_user(),
                'vipLevel': 'V4',
                'memberType': '企业会员',
                'balance': 50000.0
            },
            'enterprise_user': {
                **RealUserDataFactory.create_email_user(),
                'vipLevel': 'V5',
                'memberType': '企业会员',
                'role': 'enterprise',
                'balance': 100000.0
            }
        }
    
    @staticmethod
    def get_edge_case_scenarios():
        """边界测试场景"""
        return {
            'guest_user': RealUserDataFactory.create_guest_user(),
            'user_with_no_balance': {
                **RealUserDataFactory.create_wechat_user(),
                'balance': 0.0
            },
            'user_with_max_balance': {
                **RealUserDataFactory.create_wechat_user(),
                'balance': 99999999.99
            },
            'user_with_long_nickname': {
                **RealUserDataFactory.create_wechat_user(),
                'nickname': '这是一个非常长的昵称用来测试系统的限制能力超过二十个字符'
            },
            'user_with_special_chars_nickname': {
                **RealUserDataFactory.create_wechat_user(),
                'nickname': '用户@#$%^&*()_+{}[]|\\:;"<>?,./'
            }
        }
    
    @staticmethod
    def get_security_test_scenarios():
        """安全测试场景"""
        return {
            'xss_attempt_user': {
                **RealUserDataFactory.create_wechat_user(),
                'nickname': '<script>alert("xss")</script>用户',
                'avatar': 'javascript:alert("xss")'
            },
            'sql_injection_attempt': {
                **RealUserDataFactory.create_phone_user(),
                'nickname': "用户'; DROP TABLE users; --"
            },
            'csrf_attempt': {
                **RealUserDataFactory.create_email_user(),
                'nickname': '<img src="x" onerror="alert(1)">'
            },
            'admin_impersonation_attempt': {
                **RealUserDataFactory.create_wechat_user(),
                'role': 'admin'  # 尝试通过前端修改角色
            }
        }
    
    @staticmethod
    def get_performance_test_scenarios():
        """性能测试场景"""
        users = []
        for i in range(100):
            user = RealUserDataFactory.create_wechat_user()
            user['nickname'] = f'批量测试用户_{i:03d}'
            users.append(user)
        return {
            'bulk_users': users,
            'concurrent_login_users': users[:20]
        }


# 预定义的测试数据集
TEST_DATA_SETS = {
    'normal': TestDataScenarios.get_normal_user_scenarios(),
    'edge_cases': TestDataScenarios.get_edge_case_scenarios(),
    'security': TestDataScenarios.get_security_test_scenarios(),
    'performance': TestDataScenarios.get_performance_test_scenarios()
}


def get_test_user(scenario_type: str = 'normal', user_type: str = 'active_user'):
    """获取指定类型的测试用户"""
    return TEST_DATA_SETS.get(scenario_type, {}).get(user_type)


def get_all_test_users():
    """获取所有测试用户"""
    all_users = []
    for scenario_type, scenarios in TEST_DATA_SETS.items():
        if scenario_type == 'performance':
            all_users.extend(scenarios.get('bulk_users', []))
        else:
            for user_type, user_data in scenarios.items():
                all_users.append(user_data)
    return all_users


if __name__ == '__main__':
    # 测试数据工厂功能
    print("=== 真实用户数据测试工厂 ===")
    
    wechat_user = RealUserDataFactory.create_wechat_user()
    print(f"\n微信用户示例:")
    print(f"  OpenID: {wechat_user['openid']}")
    print(f"  昵称: {wechat_user['nickname']}")
    print(f"  VIP等级: {wechat_user['vipLevel']}")
    print(f"  余额: ¥{wechat_user['balance']:,.2f}")
    
    phone_user = RealUserDataFactory.create_phone_user()
    print(f"\n手机号用户示例:")
    print(f"  手机号: {phone_user['phone']}")
    print(f"  密码: {phone_user['password']}")
    
    admin_user = RealUserDataFactory.create_admin_user()
    print(f"\n管理员用户示例:")
    print(f"  用户名: {admin_user['username']}")
    print(f"  角色: {admin_user['role']}")
    
    login_history = LoginHistoryGenerator.create_login_history(wechat_user['openid'], 5)
    print(f"\n登录历史记录示例:")
    for record in login_history[:3]:
        print(f"  时间: {record['login_time']}")
        print(f"  IP: {record['ip_address']}")
        print(f"  设备: {record['device']['name']}")
        print(f"  状态: {record['status']}")
    
    print("\n=== 测试数据集统计 ===")
    for scenario_type, scenarios in TEST_DATA_SETS.items():
        if scenario_type == 'performance':
            print(f"{scenario_type}: {len(scenarios.get('bulk_users', []))} 个用户")
        else:
            print(f"{scenario_type}: {len(scenarios)} 种场景")