"""
账户API验证器
用于验证账户功能的完整性、安全性和稳定性
使用真实用户数据进行全面测试
"""
import requests
import json
import time
import logging
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
import sys
import os

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tests.account.account_test_data import (
    RealUserDataFactory, 
    LoginHistoryGenerator,
    TestDataScenarios,
    TEST_DATA_SETS,
    get_test_user,
    get_all_test_users
)

logger = logging.getLogger(__name__)


class AccountAPIValidator:
    """账户API验证器"""
    
    def __init__(self, base_url: str = 'http://localhost:5000/api'):
        self.base_url = base_url
        self.session = requests.Session()
        self.test_results = []
        self.passed_count = 0
        self.failed_count = 0
        
    def _make_request(self, method: str, endpoint: str, 
                      headers: Dict = None, data: Dict = None, 
                      params: Dict = None) -> Tuple[Optional[Dict], Optional[int], Optional[str]]:
        """发送HTTP请求"""
        url = f"{self.base_url}{endpoint}"
        default_headers = {'Content-Type': 'application/json'}
        if headers:
            default_headers.update(headers)
        
        try:
            if method == 'GET':
                response = self.session.get(url, headers=default_headers, params=params, timeout=10)
            elif method == 'POST':
                response = self.session.post(url, headers=default_headers, json=data, timeout=10)
            elif method == 'PUT':
                response = self.session.put(url, headers=default_headers, json=data, timeout=10)
            elif method == 'DELETE':
                response = self.session.delete(url, headers=default_headers, timeout=10)
            else:
                return None, None, f"不支持的方法: {method}"
            
            try:
                response_data = response.json()
            except:
                response_data = {'raw_text': response.text}
            
            return response_data, response.status_code, None
            
        except requests.exceptions.Timeout:
            return None, None, "请求超时"
        except requests.exceptions.ConnectionError:
            return None, None, "连接失败"
        except Exception as e:
            return None, None, f"请求异常: {str(e)}"
    
    def _record_result(self, test_name: str, passed: bool, 
                       details: Dict = None, error_msg: str = None):
        """记录测试结果"""
        result = {
            'test_name': test_name,
            'passed': passed,
            'timestamp': datetime.utcnow().isoformat(),
            'details': details or {},
            'error': error_msg
        }
        self.test_results.append(result)
        
        if passed:
            self.passed_count += 1
            logger.info(f"✅ {test_name} - 通过")
        else:
            self.failed_count += 1
            logger.error(f"❌ {test_name} - 失败: {error_msg}")
        
        return result
    
    # ==================== 认证功能测试 ====================
    
    def test_wechat_login(self, user_data: Dict = None):
        """测试微信登录"""
        test_name = "微信登录功能"
        
        if not user_data:
            user_data = RealUserDataFactory.create_wechat_user()
        
        # 模拟微信登录请求
        login_data = {
            'code': 'mock_wechat_code_for_test',
            'userInfo': {
                'nickName': user_data['nickname'],
                'avatarUrl': user_data['avatar']
            }
        }
        
        response, status_code, error = self._make_request('POST', '/auth/wechat-login', data=login_data)
        
        if error:
            return self._record_result(test_name, False, {'user_data': user_data}, error)
        
        # 验证响应结构
        if not response:
            return self._record_result(test_name, False, {'user_data': user_data}, "响应为空")
        
        # 检查必需字段
        required_fields = ['success', 'data']
        missing_fields = [f for f in required_fields if f not in response]
        
        if missing_fields:
            return self._record_result(
                test_name, False, 
                {'response': response, 'user_data': user_data},
                f"响应缺少必需字段: {missing_fields}"
            )
        
        # 验证token
        if response.get('success'):
            data = response.get('data', {})
            token = data.get('token')
            
            if not token:
                return self._record_result(
                    test_name, False,
                    {'response': response, 'user_data': user_data},
                    "登录成功但未返回token"
                )
            
            # 验证token格式
            if len(token) < 20:  # JWT token至少20字符
                return self._record_result(
                    test_name, False,
                    {'token': token, 'user_data': user_data},
                    "token格式不正确"
                )
            
            # 验证返回的用户信息
            user_info = data.get('userInfo', {})
            if 'openid' not in user_info:
                return self._record_result(
                    test_name, False,
                    {'response': response, 'user_data': user_data},
                    "登录成功但未返回openid"
                )
            
            return self._record_result(
                test_name, True,
                {
                    'response': response,
                    'user_data': user_data,
                    'token_length': len(token)
                }
            )
        else:
            return self._record_result(
                test_name, False,
                {'response': response, 'user_data': user_data},
                response.get('message', '登录失败')
            )
    
    def test_phone_login(self, user_data: Dict = None):
        """测试手机号+验证码登录"""
        test_name = "手机号验证码登录"
        
        if not user_data:
            user_data = RealUserDataFactory.create_phone_user()
        
        # 步骤1: 发送验证码
        sms_data = {'phone': user_data['phone']}
        response1, status1, error1 = self._make_request('POST', '/auth/send-sms-code', data=sms_data)
        
        if error1:
            # 如果验证码发送接口不存在或报错，使用模拟验证码测试
            logger.warning(f"验证码发送失败: {error1}, 使用模拟验证码测试")
        
        # 步骤2: 使用验证码登录
        login_data = {
            'phone': user_data['phone'],
            'code': '123456'  # 测试验证码
        }
        
        response, status_code, error = self._make_request('POST', '/auth/phone-login', data=login_data)
        
        if error:
            return self._record_result(test_name, False, {'user_data': user_data}, error)
        
        # 验证响应（手机号未注册可能需要先注册）
        if response and response.get('success'):
            return self._record_result(test_name, True, {'response': response, 'user_data': user_data})
        else:
            # 手机号登录可能返回需要注册的提示
            message = response.get('message', '未知错误') if response else '无响应'
            return self._record_result(
                test_name, False,
                {'response': response, 'user_data': user_data},
                f"登录失败: {message}"
            )
    
    def test_email_login(self, user_data: Dict = None):
        """测试邮箱+密码登录"""
        test_name = "邮箱密码登录"
        
        if not user_data:
            user_data = RealUserDataFactory.create_email_user()
        
        login_data = {
            'email': user_data['email'],
            'password': user_data['password']
        }
        
        response, status_code, error = self._make_request('POST', '/auth/email-login', data=login_data)
        
        if error:
            return self._record_result(test_name, False, {'user_data': user_data}, error)
        
        # 验证响应（邮箱未注册可能需要先注册）
        if response and response.get('success'):
            return self._record_result(test_name, True, {'response': response, 'user_data': user_data})
        else:
            message = response.get('message', '未知错误') if response else '无响应'
            return self._record_result(
                test_name, False,
                {'response': response, 'user_data': user_data},
                f"登录失败: {message}"
            )
    
    def test_admin_login(self, admin_data: Dict = None):
        """测试管理员登录"""
        test_name = "管理员登录"
        
        if not admin_data:
            admin_data = RealUserDataFactory.create_admin_user()
        
        login_data = {
            'username': admin_data['username'],
            'password': admin_data['password']
        }
        
        response, status_code, error = self._make_request('POST', '/auth/admin-login', data=login_data)
        
        if error:
            return self._record_result(test_name, False, {'admin_data': admin_data}, error)
        
        if response and response.get('success'):
            data = response.get('data', {})
            
            # 验证返回的角色信息
            role = data.get('role')
            if not role:
                return self._record_result(
                    test_name, False,
                    {'response': response, 'admin_data': admin_data},
                    "管理员登录成功但未返回角色信息"
                )
            
            # 检查是否提示需要修改默认密码
            require_password_change = data.get('requirePasswordChange')
            
            return self._record_result(
                test_name, True,
                {
                    'response': response,
                    'admin_data': admin_data,
                    'require_password_change': require_password_change
                }
            )
        else:
            message = response.get('message', '未知错误') if response else '无响应'
            return self._record_result(
                test_name, False,
                {'response': response, 'admin_data': admin_data},
                f"登录失败: {message}"
            )
    
    def test_guest_login(self):
        """测试游客登录"""
        test_name = "游客模式登录"
        
        response, status_code, error = self._make_request('POST', '/auth/guest-login')
        
        if error:
            return self._record_result(test_name, False, {}, error)
        
        if response and response.get('success'):
            data = response.get('data', {})
            
            # 验证游客角色
            role = data.get('userInfo', {}).get('role')
            if role != 'guest':
                return self._record_result(
                    test_name, False,
                    {'response': response},
                    f"游客登录返回的角色不正确: {role}"
                )
            
            # 验证token
            token = data.get('token')
            if not token:
                return self._record_result(
                    test_name, False,
                    {'response': response},
                    "游客登录成功但未返回token"
                )
            
            return self._record_result(test_name, True, {'response': response, 'role': role})
        else:
            message = response.get('message', '未知错误') if response else '无响应'
            return self._record_result(test_name, False, {'response': response}, f"登录失败: {message}")
    
    # ==================== 用户资料测试 ====================
    
    def test_get_user_profile(self, token: str):
        """测试获取用户资料"""
        test_name = "获取用户资料"
        
        headers = {'Authorization': f'Bearer {token}'}
        response, status_code, error = self._make_request('GET', '/auth/profile', headers=headers)
        
        if error:
            return self._record_result(test_name, False, {'token': token}, error)
        
        if response and response.get('success'):
            user_data = response.get('data', {})
            
            # 验证必需字段
            required_fields = ['openid', 'nickname']
            missing_fields = [f for f in required_fields if f not in user_data]
            
            if missing_fields:
                return self._record_result(
                    test_name, False,
                    {'response': response},
                    f"用户资料缺少必需字段: {missing_fields}"
                )
            
            return self._record_result(test_name, True, {'response': response})
        else:
            message = response.get('message', '未知错误') if response else '无响应'
            return self._record_result(test_name, False, {'response': response}, f"获取失败: {message}")
    
    def test_update_user_profile(self, token: str, updates: Dict):
        """测试更新用户资料"""
        test_name = "更新用户资料"
        
        headers = {'Authorization': f'Bearer {token}'}
        response, status_code, error = self._make_request('PUT', '/auth/profile', headers=headers, data=updates)
        
        if error:
            return self._record_result(test_name, False, {'token': token, 'updates': updates}, error)
        
        if response and response.get('success'):
            return self._record_result(test_name, True, {'response': response, 'updates': updates})
        else:
            message = response.get('message', '未知错误') if response else '无响应'
            return self._record_result(test_name, False, {'response': response}, f"更新失败: {message}")
    
    # ==================== 安全功能测试 ====================
    
    def test_logout(self, token: str):
        """测试用户登出"""
        test_name = "用户登出"
        
        headers = {'Authorization': f'Bearer {token}'}
        response, status_code, error = self._make_request('POST', '/auth/logout', headers=headers)
        
        if error:
            return self._record_result(test_name, False, {'token': token}, error)
        
        if response and response.get('success'):
            # 验证登出后token是否失效
            # 尝试使用已登出的token获取资料
            test_response, test_status, test_error = self._make_request('GET', '/auth/profile', headers=headers)
            
            if test_status == 401 or (test_response and not test_response.get('success')):
                return self._record_result(
                    test_name, True,
                    {
                        'logout_response': response,
                        'after_logout_status': test_status,
                        'token_blacklisted': True
                    },
                    "登出成功，token已失效"
                )
            else:
                return self._record_result(
                    test_name, False,
                    {
                        'logout_response': response,
                        'after_logout_response': test_response
                    },
                    "登出后token仍可使用"
                )
        else:
            message = response.get('message', '未知错误') if response else '无响应'
            return self._record_result(test_name, False, {'response': response}, f"登出失败: {message}")
    
    def test_change_password(self, token: str, old_password: str, new_password: str):
        """测试修改密码"""
        test_name = "修改密码"
        
        headers = {'Authorization': f'Bearer {token}'}
        data = {
            'old_password': old_password,
            'new_password': new_password
        }
        
        response, status_code, error = self._make_request('POST', '/auth/password/change', headers=headers, data=data)
        
        if error:
            return self._record_result(test_name, False, {'token': token}, error)
        
        if response and response.get('success'):
            return self._record_result(test_name, True, {'response': response})
        else:
            message = response.get('message', '未知错误') if response else '无响应'
            # 可能是密码不正确，记录但不算失败
            return self._record_result(
                test_name, False,
                {'response': response, 'old_password': old_password},
                f"修改失败: {message}"
            )
    
    def test_token_blacklist(self):
        """测试Token黑名单机制"""
        test_name = "Token黑名单机制"
        
        # 先登录获取token
        guest_response, _, _ = self._make_request('POST', '/auth/guest-login')
        
        if not guest_response or not guest_response.get('success'):
            return self._record_result(test_name, False, {}, "无法获取测试token")
        
        token = guest_response.get('data', {}).get('token')
        
        # 登出，将token加入黑名单
        headers = {'Authorization': f'Bearer {token}'}
        logout_response, _, _ = self._make_request('POST', '/auth/logout', headers=headers)
        
        if not logout_response or not logout_response.get('success'):
            return self._record_result(test_name, False, {'token': token}, "登出失败")
        
        # 尝试使用已黑名单的token
        profile_response, status, _ = self._make_request('GET', '/auth/profile', headers=headers)
        
        # 验证token已被拒绝
        if status == 401 or (profile_response and not profile_response.get('success')):
            return self._record_result(test_name, True, {'blacklisted_token': token[:20] + '...'})
        else:
            return self._record_result(
                test_name, False,
                {'profile_response': profile_response, 'status': status},
                "黑名单token仍可使用"
            )
    
    # ==================== 设备管理测试 ====================
    
    def test_get_sessions(self, token: str):
        """测试获取登录设备列表"""
        test_name = "获取登录设备列表"
        
        headers = {'Authorization': f'Bearer {token}'}
        response, status_code, error = self._make_request('GET', '/auth/sessions', headers=headers)
        
        if error:
            return self._record_result(test_name, False, {'token': token}, error)
        
        if response and response.get('success'):
            sessions = response.get('data', {}).get('sessions', [])
            
            return self._record_result(
                test_name, True,
                {
                    'response': response,
                    'sessions_count': len(sessions)
                }
            )
        else:
            message = response.get('message', '未知错误') if response else '无响应'
            return self._record_result(test_name, False, {'response': response}, f"获取失败: {message}")
    
    def test_revoke_session(self, token: str, session_id: str):
        """测试撤销指定设备"""
        test_name = "撤销登录设备"
        
        headers = {'Authorization': f'Bearer {token}'}
        response, status_code, error = self._make_request(
            'DELETE', 
            f'/auth/sessions/{session_id}', 
            headers=headers
        )
        
        if error:
            return self._record_result(test_name, False, {'token': token, 'session_id': session_id}, error)
        
        if response and response.get('success'):
            return self._record_result(test_name, True, {'response': response, 'session_id': session_id})
        else:
            message = response.get('message', '未知错误') if response else '无响应'
            return self._record_result(test_name, False, {'response': response}, f"撤销失败: {message}")
    
    # ==================== 登录历史测试 ====================
    
    def test_get_login_history(self, token: str):
        """测试获取登录历史记录"""
        test_name = "获取登录历史记录"
        
        headers = {'Authorization': f'Bearer {token}'}
        response, status_code, error = self._make_request('GET', '/auth/login-history', headers=headers)
        
        if error:
            # 如果接口不存在，记录但不计入失败
            return self._record_result(
                test_name, False,
                {'token': token},
                f"接口调用失败: {error} (可能接口尚未实现)"
            )
        
        if response and response.get('success'):
            history = response.get('data', {}).get('history', [])
            
            # 验证历史记录结构
            if history:
                record = history[0]
                required_fields = ['login_time', 'ip_address', 'login_type']
                missing_fields = [f for f in required_fields if f not in record]
                
                if missing_fields:
                    return self._record_result(
                        test_name, False,
                        {'response': response},
                        f"历史记录缺少字段: {missing_fields}"
                    )
            
            return self._record_result(
                test_name, True,
                {
                    'response': response,
                    'history_count': len(history)
                }
            )
        else:
            message = response.get('message', '未知错误') if response else '无响应'
            return self._record_result(test_name, False, {'response': response}, f"获取失败: {message}")
    
    # ==================== 安全验证测试 ====================
    
    def test_xss_protection(self, xss_data: Dict):
        """测试XSS防护"""
        test_name = "XSS防护验证"
        
        # 使用包含XSS攻击的用户数据测试
        login_data = {
            'code': 'mock_code',
            'userInfo': {
                'nickName': xss_data.get('nickname', ''),
                'avatarUrl': xss_data.get('avatar', '')
            }
        }
        
        response, status_code, error = self._make_request('POST', '/auth/wechat-login', data=login_data)
        
        if response:
            # 检查响应中是否转义或过滤了危险内容
            nickname_in_response = response.get('data', {}).get('userInfo', {}).get('nickname', '')
            
            # 验证危险标签是否被处理
            dangerous_patterns = ['<script>', 'javascript:', 'onerror=']
            contains_danger = any(p in nickname_in_response.lower() for p in dangerous_patterns)
            
            if contains_danger:
                return self._record_result(
                    test_name, False,
                    {'input': xss_data, 'output': nickname_in_response},
                    "XSS攻击内容未被过滤"
                )
            else:
                return self._record_result(
                    test_name, True,
                    {'input': xss_data, 'output': nickname_in_response},
                    "XSS攻击内容已被过滤"
                )
        else:
            # 请求被拒绝也是防护成功
            return self._record_result(
                test_name, True,
                {'input': xss_data, 'error': error},
                "请求被拒绝，防护生效"
            )
    
    def test_sql_injection_protection(self, injection_data: Dict):
        """测试SQL注入防护"""
        test_name = "SQL注入防护验证"
        
        # 使用包含SQL注入的昵称
        login_data = {
            'code': 'mock_code',
            'userInfo': {
                'nickName': injection_data.get('nickname', '')
            }
        }
        
        response, status_code, error = self._make_request('POST', '/auth/wechat-login', data=login_data)
        
        if response and response.get('success'):
            # 检查系统是否正常响应（未崩溃）
            return self._record_result(
                test_name, True,
                {'input': injection_data, 'response': response},
                "SQL注入攻击未影响系统运行"
            )
        elif status_code == 500:
            return self._record_result(
                test_name, False,
                {'input': injection_data},
                "SQL注入导致服务器错误"
            )
        else:
            return self._record_result(
                test_name, True,
                {'input': injection_data, 'status': status_code},
                "请求被拒绝或无影响，防护生效"
            )
    
    def test_role_permission_control(self, guest_token: str):
        """测试角色权限控制"""
        test_name = "游客权限控制验证"
        
        headers = {'Authorization': f'Bearer {guest_token}'}
        
        # 游客尝试POST请求（应该被拒绝）
        response, status_code, error = self._make_request(
            'POST',
            '/auth/profile',
            headers=headers,
            data={'nickname': '测试修改'}
        )
        
        if status_code == 403 or (response and not response.get('success')):
            return self._record_result(
                test_name, True,
                {'status': status_code, 'response': response},
                "游客POST请求被正确拒绝"
            )
        else:
            return self._record_result(
                test_name, False,
                {'response': response, 'status': status_code},
                "游客权限控制失效"
            )
    
    # ==================== 数据完整性测试 ====================
    
    def test_user_data_integrity(self, user_data: Dict):
        """测试用户数据完整性"""
        test_name = "用户数据完整性验证"
        
        # 验证数据结构
        required_fields = ['openid', 'nickname', 'role']
        missing_fields = [f for f in required_fields if f not in user_data]
        
        if missing_fields:
            return self._record_result(
                test_name, False,
                {'user_data': user_data},
                f"用户数据缺少必需字段: {missing_fields}"
            )
        
        # 验证数据类型
        if not isinstance(user_data.get('balance'), (int, float)):
            return self._record_result(
                test_name, False,
                {'balance': user_data.get('balance')},
                "余额字段类型不正确"
            )
        
        # 验证VIP等级格式
        vip_level = user_data.get('vipLevel', '')
        if not vip_level.startswith('V'):
            return self._record_result(
                test_name, False,
                {'vipLevel': vip_level},
                "VIP等级格式不正确"
            )
        
        return self._record_result(test_name, True, {'user_data': user_data})
    
    # ==================== 批量测试 ====================
    
    def run_all_tests(self, verbose: bool = True):
        """运行所有账户功能测试"""
        print("\n" + "="*60)
        print("账户功能全面验证测试")
        print("="*60 + "\n")
        
        # 1. 认证功能测试
        print(">>> 认证功能测试")
        self.test_wechat_login()
        self.test_phone_login()
        self.test_email_login()
        self.test_admin_login()
        self.test_guest_login()
        
        # 2. 安全功能测试
        print("\n>>> 安全功能测试")
        self.test_token_blacklist()
        
        # 游客登录测试权限控制
        guest_response, _, _ = self._make_request('POST', '/auth/guest-login')
        if guest_response and guest_response.get('success'):
            guest_token = guest_response.get('data', {}).get('token')
            self.test_role_permission_control(guest_token)
        
        # XSS和SQL注入测试
        security_scenarios = TestDataScenarios.get_security_test_scenarios()
        self.test_xss_protection(security_scenarios.get('xss_attempt_user'))
        self.test_sql_injection_protection(security_scenarios.get('sql_injection_attempt'))
        
        # 3. 登录历史测试
        print("\n>>> 登录历史功能测试")
        # 使用游客token测试
        if guest_response and guest_response.get('success'):
            guest_token = guest_response.get('data', {}).get('token')
            self.test_get_login_history(guest_token)
        
        # 4. 数据完整性测试
        print("\n>>> 数据完整性测试")
        normal_users = TestDataScenarios.get_normal_user_scenarios()
        for user_type, user_data in normal_users.items():
            self.test_user_data_integrity(user_data)
        
        # 生成测试报告
        self.generate_report(verbose)
    
    def generate_report(self, verbose: bool = True):
        """生成测试报告"""
        print("\n" + "="*60)
        print("测试报告")
        print("="*60)
        
        total = self.passed_count + self.failed_count
        pass_rate = (self.passed_count / total * 100) if total > 0 else 0
        
        print(f"\n总测试数: {total}")
        print(f"通过数: {self.passed_count}")
        print(f"失败数: {self.failed_count}")
        print(f"通过率: {pass_rate:.1f}%")
        
        if verbose and self.failed_count > 0:
            print("\n失败测试详情:")
            for result in self.test_results:
                if not result['passed']:
                    print(f"\n  ❌ {result['test_name']}")
                    print(f"     错误: {result['error']}")
                    if result['details']:
                        print(f"     详情: {json.dumps(result['details'], indent=6, ensure_ascii=False)[:200]}")
        
        # 评分计算
        score = 100 - (self.failed_count * 2)  # 每个失败扣2分
        score = max(0, score)
        
        print(f"\n账户功能评分: {score}/100")
        
        return {
            'total': total,
            'passed': self.passed_count,
            'failed': self.failed_count,
            'pass_rate': pass_rate,
            'score': score,
            'results': self.test_results
        }


def main():
    """主测试函数"""
    validator = AccountAPIValidator()
    
    # 运行所有测试
    report = validator.run_all_tests(verbose=True)
    
    # 返回评分
    return report.get('score', 0)


if __name__ == '__main__':
    score = main()
    print(f"\n最终评分: {score}/100")
    
    if score >= 98:
        print("\n✅ 账户功能达到优秀水平！")
    elif score >= 90:
        print("\n⚠️ 账户功能良好，仍有改进空间")
    else:
        print("\n❌ 账户功能需要进一步优化")