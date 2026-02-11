import unittest
import json
import sys
import os

# Add root to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from unittest.mock import patch, MagicMock
from app import create_app

class TestAccountFlow(unittest.TestCase):
    def setUp(self):
        os.environ['NODE_ENV'] = 'testing'
        os.environ['SKIP_DB_INIT'] = '1'
        
        self.app = create_app()
        self.client = self.app.test_client()
        self.ctx = self.app.app_context()
        self.ctx.push()
        
        # Mock DBs
        self.app.db = MagicMock()
        self.app.cloud_db = None
        
        self.users = MagicMock()
        self.transactions = MagicMock()
        self.positions = MagicMock()
        
        def get_collection(name):
            mapping = {
                'users': self.users,
                'transactions': self.transactions,
                'positions': self.positions
            }
            return mapping.get(name, MagicMock())
            
        self.app.db.__getitem__ = MagicMock(side_effect=get_collection)

    def tearDown(self):
        self.ctx.pop()

    def test_account_flow(self):
        # Mock StockService to avoid real network calls
        with patch('services.stock_service.StockService.get_stock_realtime_data') as mock_stock:
            mock_stock.return_value = {"price": 10.0}
            
            # 1. Login (Mock)
            user_id = "test_openid_123"
            with patch('jwt.decode', return_value={"sub": user_id, "role": "user"}):
                headers = {"Authorization": "Bearer mock_token"}
                
                # 2. Get Account Summary (Initial)
                # Mock user
                self.users.find_one.return_value = {"_id": "mock_id", "openid": user_id, "balance": 0.0}
                
                # Mock positions cursor
                mock_pos_cursor = MagicMock()
                mock_pos_cursor.sort.return_value.skip.return_value.limit.return_value = []
                self.positions.find.return_value = mock_pos_cursor
                self.positions.count_documents.return_value = 0
                
                resp = self.client.get('/api/v1/trade/account', headers=headers)
                if resp.status_code != 200:
                    print(resp.json)
                self.assertEqual(resp.status_code, 200)
                data = resp.json['data']
                self.assertEqual(data['balance'], 0.0)
                self.assertEqual(data['total_asset'], 0.0)
                
                # 3. Deposit
                self.users.update_one.return_value.modified_count = 1
                # User starts with 0
                self.users.find_one.return_value = {"_id": "mock_id", "openid": user_id, "balance": 0.0}
                
                resp = self.client.post('/api/v1/trade/account/deposit', json={"amount": 10000}, headers=headers)
                self.assertEqual(resp.status_code, 200)
                self.assertEqual(resp.json['data']['balance'], 10000.0)
                
                # 4. Withdraw
                # User now has 10000
                self.users.find_one.return_value = {"_id": "mock_id", "openid": user_id, "balance": 10000.0}
                
                resp = self.client.post('/api/v1/trade/account/withdraw', json={"amount": 5000}, headers=headers)
                self.assertEqual(resp.status_code, 200)
                self.assertEqual(resp.json['data']['balance'], 5000.0)
                
                # 5. Transaction History
                mock_cursor = MagicMock()
                mock_cursor.sort.return_value.skip.return_value.limit.return_value = [
                    {"type": "withdraw", "amount": -5000, "balance_after": 5000},
                    {"type": "deposit", "amount": 10000, "balance_after": 10000}
                ]
                self.transactions.find.return_value = mock_cursor
                self.transactions.count_documents.return_value = 2
                
                resp = self.client.get('/api/v1/trade/account/transactions', headers=headers)
                self.assertEqual(resp.status_code, 200)
                self.assertEqual(len(resp.json['data']['items']), 2)

if __name__ == '__main__':
    unittest.main()
