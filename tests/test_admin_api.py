import os
import unittest

os.environ.setdefault("NODE_ENV", "testing")
os.environ.setdefault("SKIP_DB_INIT", "1")

from app import app


class AdminApiTestCase(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        token = None
        resp = self.client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin123"})
        if resp.status_code == 200:
            payload = resp.get_json() or {}
            token = (payload.get("data") or {}).get("token")
        self.auth_headers = {"Authorization": f"Bearer {token}"} if token else {}

    def test_health_v1(self):
        resp = self.client.get("/api/v1/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIsInstance(data, dict)
        self.assertTrue(data.get("success"))
        payload = data.get("data")
        self.assertIsInstance(payload, dict)
        self.assertEqual(payload.get("version"), "v1")

    def test_admin_stats_no_db(self):
        resp = self.client.get("/api/v1/admin/stats", headers=self.auth_headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertTrue(data.get("success"))
        payload = data.get("data")
        self.assertIsInstance(payload, dict)
        self.assertIn("stockCount", payload)
        self.assertIn("orderCount", payload)

    def test_admin_quotes_pagination_validation(self):
        resp = self.client.get("/api/v1/admin/quotes?page=0&pageSize=10", headers=self.auth_headers)
        self.assertEqual(resp.status_code, 400)
        data = resp.get_json()
        self.assertFalse(data.get("success"))

        resp = self.client.get("/api/v1/admin/quotes?page=1&pageSize=9999", headers=self.auth_headers)
        self.assertEqual(resp.status_code, 400)
        data = resp.get_json()
        self.assertFalse(data.get("success"))


if __name__ == "__main__":
    unittest.main()
