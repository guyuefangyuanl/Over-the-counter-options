# Configuration
BASE_URL = "http://localhost:5002"
ADMIN_USER = "admin"
ADMIN_PASS = "admin123"

import unittest
import requests
import time

class TestFixes(unittest.TestCase):
    def setUp(self):
        # Login to get token
        self.session = requests.Session()
        try:
            resp = self.session.post(f"{BASE_URL}/api/v1/auth/login", json={
                "username": ADMIN_USER,
                "password": ADMIN_PASS
            })
            if resp.status_code == 200:
                token = resp.json()['data']['token']
                self.session.headers.update({"Authorization": f"Bearer {token}"})
            else:
                print(f"Login failed: {resp.text}")
        except Exception as e:
            print(f"Connection failed: {e}")

    def test_01_group_security(self):
        """Verify Group routes require auth"""
        # Test without token
        no_auth_session = requests.Session()
        resp = no_auth_session.get(f"{BASE_URL}/api/v1/groups")
        self.assertEqual(resp.status_code, 401, "Should be unauthorized without token")

    def test_02_group_crud(self):
        """Verify Group CRUD operations"""
        # 1. Create
        group_name = f"TestGroup_{int(time.time())}"
        resp = self.session.post(f"{BASE_URL}/api/v1/groups", json={"name": group_name})
        self.assertEqual(resp.status_code, 200, f"Create group failed: {resp.text}")
        group_id = resp.json()['data']['id']
        
        # 2. List
        resp = self.session.get(f"{BASE_URL}/api/v1/groups")
        self.assertEqual(resp.status_code, 200)
        groups = resp.json()['data']
        found = any(g['id'] == group_id for g in groups)
        self.assertTrue(found, "Created group not found in list")
        
        # 3. Update
        new_name = f"{group_name}_Updated"
        resp = self.session.put(f"{BASE_URL}/api/v1/groups/{group_id}", json={"name": new_name})
        self.assertEqual(resp.status_code, 200, f"Update group failed: {resp.text}")
        
        # 4. Add Member
        resp = self.session.post(f"{BASE_URL}/api/v1/groups/{group_id}/members", json={
            "stock_code": "000001", "market": "sh"
        })
        self.assertEqual(resp.status_code, 200, "Add member failed")
        
        # 5. Delete
        resp = self.session.delete(f"{BASE_URL}/api/v1/groups/{group_id}")
        self.assertEqual(resp.status_code, 200, "Delete group failed")

    def test_03_customer_crud(self):
        """Verify Customer extensions"""
        # 1. Create
        phone = f"138{int(time.time())}"
        resp = self.session.post(f"{BASE_URL}/api/v1/admin/customers", json={
            "name": "TestUser",
            "phone": phone,
            "groupName": "OldGroup"
        })
        self.assertEqual(resp.status_code, 200, f"Create customer failed: {resp.text}")
        customer_id = resp.json()['data']['_id']
        
        # 2. Rename Group (Batch Update)
        resp = self.session.put(f"{BASE_URL}/api/v1/admin/customer-groups/OldGroup", json={
            "name": "NewGroup"
        })
        self.assertEqual(resp.status_code, 200, f"Rename group failed: {resp.text}")
        
        # Verify update
        resp = self.session.get(f"{BASE_URL}/api/v1/admin/customers/{customer_id}")
        self.assertEqual(resp.json()['data']['groupName'], "NewGroup", "Group name not updated on customer")
        
        # 3. Delete Customer
        resp = self.session.delete(f"{BASE_URL}/api/v1/admin/customers/{customer_id}")
        self.assertEqual(resp.status_code, 200, "Delete customer failed")
        
        # Verify deletion
        resp = self.session.get(f"{BASE_URL}/api/v1/admin/customers/{customer_id}")
        self.assertEqual(resp.status_code, 404, "Customer should be gone")

if __name__ == '__main__':
    unittest.main()
