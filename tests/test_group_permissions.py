import unittest
from unittest.mock import patch

from app import create_app


class _FakeGroupModel:
    def __init__(self, group=None):
        self.db = True
        self.cloud_client = None
        self._group = group
        self.create_called = False
        self.update_called = False
        self.delete_called = False

    def create_group(self, data):
        self.create_called = True
        return "g_test"

    def get_group_by_id(self, group_id):
        return self._group

    def update_group(self, group_id, data):
        self.update_called = True
        return True

    def delete_group(self, group_id):
        self.delete_called = True
        return True


class GroupPermissionTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

    @patch("routes.group.get_current_user_id", return_value="u1")
    def test_create_protected_group_name_rejected(self, _mock_uid):
        model = _FakeGroupModel()
        with patch("routes.group.get_model", return_value=model):
            res = self.client.post("/api/v1/groups", headers={"X-User-ID": "u1"}, json={"name": "指数"})
        self.assertEqual(res.status_code, 400)
        self.assertFalse(model.create_called)

    @patch("routes.group.get_current_user_id", return_value="u1")
    def test_update_protected_group_rejected(self, _mock_uid):
        group = {"id": "g1", "creator_id": "u1", "name": "全部"}
        model = _FakeGroupModel(group=group)
        with patch("routes.group.get_model", return_value=model):
            res = self.client.put("/api/v1/groups/g1", headers={"X-User-ID": "u1"}, json={"name": "新名字"})
        self.assertEqual(res.status_code, 403)
        self.assertFalse(model.update_called)

    @patch("routes.group.get_current_user_id", return_value="u1")
    def test_update_rename_to_protected_name_rejected(self, _mock_uid):
        group = {"id": "g1", "creator_id": "u1", "name": "我的分组"}
        model = _FakeGroupModel(group=group)
        with patch("routes.group.get_model", return_value=model):
            res = self.client.put("/api/v1/groups/g1", headers={"X-User-ID": "u1"}, json={"name": "指数"})
        self.assertEqual(res.status_code, 400)
        self.assertFalse(model.update_called)

    @patch("routes.group.get_current_user_id", return_value="u1")
    def test_delete_protected_group_rejected(self, _mock_uid):
        group = {"id": "g1", "creator_id": "u1", "name": "持仓"}
        model = _FakeGroupModel(group=group)
        with patch("routes.group.get_model", return_value=model):
            res = self.client.delete("/api/v1/groups/g1", headers={"X-User-ID": "u1"})
        self.assertEqual(res.status_code, 403)
        self.assertFalse(model.delete_called)


if __name__ == "__main__":
    unittest.main()
