import unittest
import json
import sys
import os

# Add root directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from unittest.mock import patch, MagicMock
from app import create_app

class TestRefactorIntegration(unittest.TestCase):
    def setUp(self):
        os.environ['NODE_ENV'] = 'testing'
        os.environ['SKIP_DB_INIT'] = '1'
        os.environ['JWT_SECRET'] = 'test-secret'
        
        self.app = create_app()
        self.client = self.app.test_client()
        self.ctx = self.app.app_context()
        self.ctx.push()
        
        # Mock DBs
        self.app.db = MagicMock()
        self.app.cloud_db = None # Use local mock for tests
        
        # Mock collections
        self.users = MagicMock()
        self.admin_users = MagicMock()
        self.groups = MagicMock()
        self.inquiries = MagicMock()
        self.orders = MagicMock()
        self.positions = MagicMock()
        
        self.app.db.__getitem__ = lambda s, x: {
            'users': self.users,
            'admin_users': self.admin_users,
            'groups': self.groups,
            'inquiries': self.inquiries,
            'orders': self.orders,
            'positions': self.positions
        }.get(x)

    def tearDown(self):
        self.ctx.pop()

    def test_01_admin_login(self):
        """Test Admin Login"""
        # Mock finding admin user
        self.admin_users.find_one.return_value = {
            "username": "admin",
            "password_hash": "pbkdf2_sha256$200000$salt$hash", # We won't verify hash in mock if we mock service, but let's mock service auth
            "role": "admin"
        }
        
        # We can also rely on env admin
        with patch('services.auth_service.AuthService._verify_password', return_value=True):
            resp = self.client.post('/api/v1/auth/login', json={
                "username": "admin",
                "password": "password"
            })
            self.assertEqual(resp.status_code, 200)
            data = resp.json['data']
            self.assertIn('token', data)
            self.token = data['token']
            return self.token

    def test_02_wechat_login(self):
        """Test WeChat Login"""
        with patch('requests.get') as mock_get:
            mock_get.return_value.json.return_value = {
                "openid": "test_openid_123",
                "session_key": "test_key"
            }
            
            self.users.find_one.return_value = None # New user
            self.users.insert_one.return_value.inserted_id = "new_user_id"
            
            resp = self.client.post('/api/v1/auth/wechat/login', json={"code": "mock_code"})
            self.assertEqual(resp.status_code, 200)
            self.assertIn('token', resp.json['data'])
            self.assertIn('openid', resp.json['data'])

    def test_03_inquiry_flow(self):
        """Test Inquiry Creation and Admin List"""
        # 1. App Create Inquiry
        valid_oid = "507f1f77bcf86cd799439011"
        self.inquiries.insert_one.return_value.inserted_id = valid_oid
        
        resp = self.client.post('/api/v1/inquiry', json={
            "selectedProduct": {"code": "000001", "name": "Test Product"},
            "phone": "13800000000"
        })
        self.assertEqual(resp.status_code, 200)
        
        # 2. Admin List Inquiries (Need Token)
        token = self.test_01_admin_login()
        
        # Mock cursor for list
        mock_cursor = MagicMock()
        mock_cursor.sort.return_value.skip.return_value.limit.return_value = [
            {"_id": valid_oid, "status": "pending", "selectedProduct": {"name": "Test"}}
        ]
        self.inquiries.find.return_value = mock_cursor
        self.inquiries.count_documents.return_value = 1
        
        resp = self.client.get('/api/v1/admin/inquiries', headers={
            "Authorization": f"Bearer {token}"
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json['data']['items']), 1)
        
        # 3. Admin Reply
        self.inquiries.update_one.return_value.modified_count = 1
        resp = self.client.put(f'/api/v1/admin/inquiries/{valid_oid}/status', json={
            "status": "processing",
            "remark": "Processing"
        }, headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(resp.status_code, 200)

    def test_04_trade_flow(self):
        """Test Order and Position"""
        token = self.test_01_admin_login()
        valid_oid = "507f1f77bcf86cd799439012"
        
        # 1. Create Order
        self.orders.insert_one.return_value.inserted_id = valid_oid
        resp = self.client.post('/api/v1/trade/orders', json={
            "productCode": "000001",
            "quantity": 1000,
            "openid": "test_openid_123"
        }, headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(resp.status_code, 200)
        
        # 2. Get Positions (App)
        # Mock user token login
        with patch('jwt.decode') as mock_jwt:
            mock_jwt.return_value = {"sub": "test_openid_123", "role": "user"}
            
            mock_cursor = MagicMock()
            mock_cursor.sort.return_value.skip.return_value.limit.return_value = []
            self.positions.find.return_value = mock_cursor
            
            resp = self.client.get('/api/v1/trade/positions', headers={
                "Authorization": "Bearer user_token"
            })
            self.assertEqual(resp.status_code, 200)

if __name__ == '__main__':
    unittest.main()
