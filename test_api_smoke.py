import os
import unittest


class ApiSmokeTest(unittest.TestCase):
    def test_health(self):
        os.environ.setdefault("SKIP_DB_INIT", "1")
        os.environ.setdefault("NODE_ENV", "testing")
        from app import create_app

        app = create_app()
        client = app.test_client()
        resp = client.get("/api/v1/health")
        self.assertEqual(resp.status_code, 200)
        payload = resp.get_json(silent=True) or {}
        self.assertTrue(payload.get("success"))

