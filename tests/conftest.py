# -*- coding: utf-8 -*-
"""
测试配置文件
配置 pytest fixtures 和测试环境
"""

import pytest
import os
import sys
from unittest.mock import MagicMock, patch

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture
def app():
    """创建测试应用"""
    from app import app as flask_app
    
    # 配置测试环境
    flask_app.config['TESTING'] = True
    flask_app.config['DEBUG'] = True
    
    yield flask_app


@pytest.fixture
def client(app):
    """创建测试客户端"""
    return app.test_client()


@pytest.fixture
def runner(app):
    """创建测试CLI运行器"""
    return app.test_cli_runner()


@pytest.fixture
def mock_db():
    """模拟数据库"""
    mock = MagicMock()
    mock.__getitem__ = MagicMock(return_value=MagicMock())
    return mock


@pytest.fixture
def mock_cloud_db():
    """模拟云数据库客户端"""
    mock = MagicMock()
    mock.query = MagicMock(return_value=[])
    mock.add = MagicMock(return_value=['test_id'])
    mock.update_where = MagicMock(return_value=1)
    mock.count = MagicMock(return_value=0)
    return mock


@pytest.fixture
def auth_headers():
    """认证请求头"""
    from services.auth_service import AuthService
    import jwt
    import time
    
    # 创建测试token
    payload = {
        'sub': 'test_user',
        'role': 'admin',
        'exp': int(time.time()) + 3600,
        'iat': int(time.time())
    }
    secret = os.getenv('JWT_SECRET', 'test-secret')
    token = jwt.encode(payload, secret, algorithm='HS256')
    
    return {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }


@pytest.fixture
def sample_inquiry():
    """示例询价数据"""
    return {
        'productCode': '600519',
        'productName': '贵州茅台',
        'optionType': 'call',
        'structure': 'vanilla',
        'term': '1M',
        'notionalAmount': 1000,
        'strikePrice': 100,
        'selectedDealers': ['CICC'],
        'contactName': '测试用户',
        'contactPhone': '13800138000',
        'contactEmail': 'test@example.com',
        'notes': '测试询价'
    }


@pytest.fixture
def sample_quote():
    """示例行情数据"""
    return {
        'code': '600519',
        'name': '贵州茅台',
        'price': 1702.35,
        'change': -35.42,
        'changePercent': -2.04,
        'type': 'stock'
    }


@pytest.fixture
def sample_user():
    """示例用户数据"""
    return {
        'openid': 'test_openid_123',
        'nickname': '测试用户',
        'phone': '13800138000',
        'role': 'user',
        'balance': 100000.00
    }


# 测试环境变量设置
@pytest.fixture(autouse=True)
def setup_test_env(monkeypatch):
    """设置测试环境变量"""
    monkeypatch.setenv('NODE_ENV', 'test')
    monkeypatch.setenv('JWT_SECRET', 'test-jwt-secret-key')
    monkeypatch.setenv('SECRET_KEY', 'test-secret-key')
    monkeypatch.setenv('ADMIN_PASSWORD', 'Test@123456')
    monkeypatch.setenv('SKIP_DB_INIT', '1')