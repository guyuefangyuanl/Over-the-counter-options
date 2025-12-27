import unittest
import json
import sys
import os
from unittest.mock import patch

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app


class _InMemoryGroupModel:
    def __init__(self):
        self.db = True
        self.cloud_client = None
        self._groups = {}

    def create_group(self, data):
        gid = f"g_{len(self._groups) + 1}"
        self._groups[gid] = {
            "id": gid,
            "name": data.get("name"),
            "creator_id": data.get("creator_id"),
            "members": [],
        }
        return gid

    def get_groups(self, creator_id=None):
        items = list(self._groups.values())
        if creator_id:
            items = [g for g in items if g.get("creator_id") == creator_id]
        return [dict(g) for g in items]

    def get_group_by_id(self, group_id):
        g = self._groups.get(group_id)
        return dict(g) if g else None

    def update_group(self, group_id, data):
        if group_id not in self._groups:
            return False
        if "name" in (data or {}):
            self._groups[group_id]["name"] = data["name"]
        return True

    def delete_group(self, group_id):
        return self._groups.pop(group_id, None) is not None

    def add_member(self, group_id, data):
        g = self._groups.get(group_id)
        if not g:
            return False
        stock_code = (data or {}).get("stock_code")
        if not stock_code:
            return False
        members = g.get("members") or []
        if any(m.get("stock_code") == stock_code for m in members):
            return False
        members.append({"stock_code": stock_code, "name": (data or {}).get("name", "")})
        g["members"] = members
        return True


class GroupApiTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.app.config['NODE_ENV'] = 'testing'
        # Mock DB connection for testing if needed, or use a test DB
        # For simplicity in this environment, we might rely on the actual Mongo connection 
        # but targeting a test DB would be better.
        # Assuming app handles test config.
        self.client = self.app.test_client()
        self.user_id = 'test_user_001'
        self.headers = {'X-User-ID': self.user_id}
        self.model = _InMemoryGroupModel()

    def tearDown(self):
        # Cleanup created groups
        # In a real test env, we would drop the test database
        pass

    def _with_patched_group_model(self):
        return patch("routes.group.get_model", return_value=self.model), patch(
            "routes.group.get_current_user_id", return_value=self.user_id
        )

    def _create_group(self):
        response = self.client.post(
            "/api/v1/groups",
            headers=self.headers,
            json={"name": "Test Group", "description": "Desc"},
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIn("id", data["data"])
        return data["data"]["id"]

    def test_create_group(self):
        p1, p2 = self._with_patched_group_model()
        with p1, p2:
            self._create_group()

    def test_get_groups(self):
        p1, p2 = self._with_patched_group_model()
        with p1, p2:
            self._create_group()

            response = self.client.get("/api/v1/groups", headers=self.headers)
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertTrue(len(data["data"]) > 0)
            self.assertEqual(data["data"][0]["name"], "Test Group")

    def test_update_group(self):
        p1, p2 = self._with_patched_group_model()
        with p1, p2:
            group_id = self._create_group()

            response = self.client.put(
                f"/api/v1/groups/{group_id}",
                headers=self.headers,
                json={"name": "Updated Name"},
            )
            self.assertEqual(response.status_code, 200)

            response = self.client.get("/api/v1/groups", headers=self.headers)
            data = json.loads(response.data)
            self.assertEqual(data["data"][0]["name"], "Updated Name")

    def test_delete_group(self):
        p1, p2 = self._with_patched_group_model()
        with p1, p2:
            group_id = self._create_group()

            response = self.client.delete(f"/api/v1/groups/{group_id}", headers=self.headers)
            self.assertEqual(response.status_code, 200)

            response = self.client.get("/api/v1/groups", headers=self.headers)
            data = json.loads(response.data)
            ids = [g.get("id") for g in (data.get("data") or [])]
            self.assertNotIn(group_id, ids)

    def test_add_member(self):
        p1, p2 = self._with_patched_group_model()
        with p1, p2:
            group_id = self._create_group()

            response = self.client.post(
                f"/api/v1/groups/{group_id}/members",
                headers=self.headers,
                json={"stock_code": "000001", "name": "平安银行"},
            )
            self.assertEqual(response.status_code, 200)

if __name__ == '__main__':
    unittest.main()
