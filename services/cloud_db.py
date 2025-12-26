import json
import logging
import os
import threading
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple

import requests

logger = logging.getLogger(__name__)


class CloudDbConfigError(RuntimeError):
    pass


class CloudDbRequestError(RuntimeError):
    pass


def _utc_now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _chunked(items: Sequence[str], chunk_size: int) -> List[List[str]]:
    if chunk_size <= 0:
        return [list(items)]
    out: List[List[str]] = []
    for i in range(0, len(items), chunk_size):
        out.append(list(items[i : i + chunk_size]))
    return out


class AccessTokenProvider:
    def __init__(
        self,
        *,
        appid: str,
        secret: str,
        timeout: float = 8.0,
        session: Optional[requests.Session] = None,
        refresh_margin_seconds: int = 300,
    ) -> None:
        self._appid = appid.strip()
        self._secret = secret.strip()
        self._timeout = timeout
        self._session = session or requests.Session()
        self._refresh_margin_seconds = max(0, int(refresh_margin_seconds))

        self._lock = threading.Lock()
        self._access_token: Optional[str] = None
        self._expires_at: float = 0.0

    def get_access_token(self) -> str:
        now = time.time()
        with self._lock:
            if self._access_token and now < (self._expires_at - self._refresh_margin_seconds):
                return self._access_token

            token, expires_in = self._fetch_access_token()
            self._access_token = token
            self._expires_at = now + max(0, int(expires_in))
            return token

    def _fetch_access_token(self) -> Tuple[str, int]:
        url = "https://api.weixin.qq.com/cgi-bin/token"
        params = {
            "grant_type": "client_credential",
            "appid": self._appid,
            "secret": self._secret,
        }
        last_err: Optional[str] = None
        for attempt in range(3):
            try:
                resp = self._session.get(url, params=params, timeout=self._timeout)
                resp.raise_for_status()
                payload = resp.json()
                if not isinstance(payload, dict):
                    raise CloudDbRequestError("access_token 响应格式错误")

                errcode = payload.get("errcode")
                if errcode not in (None, 0):
                    raise CloudDbRequestError(payload.get("errmsg") or f"token errcode={errcode}")

                token = payload.get("access_token")
                expires_in = payload.get("expires_in")
                if not isinstance(token, str) or not token:
                    raise CloudDbRequestError("access_token 缺失")
                if not isinstance(expires_in, int):
                    try:
                        expires_in = int(expires_in)
                    except Exception:
                        expires_in = 7200
                return token, int(expires_in)
            except Exception as e:
                last_err = str(e)
                if attempt < 2:
                    time.sleep(min(2.0, 0.3 * (2**attempt)))
        raise CloudDbRequestError(last_err or "获取 access_token 失败")


class CloudDbClient:
    def __init__(
        self,
        *,
        env_id: str,
        token_provider: AccessTokenProvider,
        timeout: float = 8.0,
        session: Optional[requests.Session] = None,
    ) -> None:
        self._env_id = env_id.strip()
        self._token_provider = token_provider
        self._timeout = timeout
        self._session = session or requests.Session()

    @classmethod
    def from_env(cls) -> "CloudDbClient":
        raw_env_id = os.getenv("WX_CLOUD_ENV")
        if raw_env_id is None:
            raw_env_id = os.getenv("WX_ENV_ID")

        raw_appid = os.getenv("WX_APPID")
        if raw_appid is None:
            raw_appid = os.getenv("WECHAT_APPID")

        raw_secret = os.getenv("WX_SECRET")
        if raw_secret is None:
            raw_secret = os.getenv("WECHAT_SECRET")

        env_id = (raw_env_id or "").strip()
        appid = (raw_appid or "").strip()
        secret = (raw_secret or "").strip()

        def _state(raw: Optional[str], trimmed: str) -> str:
            if raw is None:
                return "missing"
            if not trimmed:
                return "empty"
            return "set"

        logger.info(
            "正在从环境变量加载云配置: "
            f"env_id={_state(raw_env_id, env_id)}, "
            f"appid={_state(raw_appid, appid)}, "
            f"secret={_state(raw_secret, secret)}"
        )

        if raw_env_id is None:
            raise CloudDbConfigError("缺少环境变量 WX_CLOUD_ENV")
        if not env_id:
            raise CloudDbConfigError("环境变量 WX_CLOUD_ENV 为空")
        if raw_appid is None or raw_secret is None:
            raise CloudDbConfigError("缺少环境变量 WX_APPID/WX_SECRET")
        if not appid or not secret:
            raise CloudDbConfigError("环境变量 WX_APPID/WX_SECRET 为空")

        provider = AccessTokenProvider(appid=appid, secret=secret)
        return cls(env_id=env_id, token_provider=provider)

    def query(self, query: str) -> List[Dict[str, Any]]:
        try:
            payload = self._post_api("tcb/databasequery", {"env": self._env_id, "query": query})
            raw = payload.get("data")
            if raw is None:
                return []
            if not isinstance(raw, list):
                raise CloudDbRequestError("databasequery 返回 data 非数组")
            out: List[Dict[str, Any]] = []
            for item in raw:
                if not isinstance(item, str):
                    continue
                try:
                    parsed = json.loads(item)
                    if isinstance(parsed, dict):
                        out.append(parsed)
                except Exception:
                    continue
            return out
        except CloudDbRequestError as e:
            if "[ResourceNotFound]" in str(e):
                logger.warning(f"云数据库查询失败: 集合不存在 ({e})")
                return []
            raise

    def count(self, query: str) -> int:
        try:
            payload = self._post_api("tcb/databasecount", {"env": self._env_id, "query": query})
            count = payload.get("count")
            try:
                return int(count)
            except Exception:
                return 0
        except CloudDbRequestError as e:
            if "[ResourceNotFound]" in str(e):
                logger.warning(f"云数据库统计失败: 集合不存在 ({e})")
                return 0
            raise

    def add(self, *, collection: str, data: Dict[str, Any]) -> List[str]:
        query = f'db.collection("{collection}").add({{data: {json.dumps(data, ensure_ascii=False)}}})'
        payload = self._post_api("tcb/databaseadd", {"env": self._env_id, "query": query})
        ids = payload.get("id_list")
        if isinstance(ids, list):
            return [str(x) for x in ids]
        return []

    def update_where(self, *, collection: str, where_js: str, data: Dict[str, Any]) -> int:
        query = (
            f'db.collection("{collection}").where({where_js}).update({{data: {json.dumps(data, ensure_ascii=False)}}})'
        )
        payload = self._post_api("tcb/databaseupdate", {"env": self._env_id, "query": query})
        updated = payload.get("updated")
        try:
            return int(updated)
        except Exception:
            return 0

    def delete_where(self, *, collection: str, where_js: str) -> int:
        query = f'db.collection("{collection}").where({where_js}).remove()'
        payload = self._post_api("tcb/databasedelete", {"env": self._env_id, "query": query})
        deleted = payload.get("deleted")
        try:
            return int(deleted)
        except Exception:
            return 0

    def upsert(
        self,
        *,
        collection: str,
        unique_key: str,
        unique_value: str,
        data: Dict[str, Any],
        create_data: Optional[Dict[str, Any]] = None,
    ) -> str:
        where_js = json.dumps({unique_key: unique_value}, ensure_ascii=False)
        existing = self.query(
            f'db.collection("{collection}").where({where_js}).limit(1).get()'
        )
        if existing:
            update_data = dict(data)
            update_data["updated_at"] = data.get("updated_at") or _utc_now_iso()
            self.update_where(collection=collection, where_js=where_js, data=update_data)
            return "updated"

        insert_data = dict(create_data or {})
        insert_data.update(data)
        insert_data.setdefault("created_at", _utc_now_iso())
        insert_data.setdefault("updated_at", _utc_now_iso())
        self.add(collection=collection, data=insert_data)
        return "inserted"

    def batch_upsert(
        self,
        *,
        collection: str,
        unique_key: str,
        items: Sequence[Dict[str, Any]],
        chunk_size: int = 50,
    ) -> Tuple[int, List[Dict[str, Any]]]:
        normalized: List[Dict[str, Any]] = []
        for it in items:
            if not isinstance(it, dict):
                continue
            v = it.get(unique_key)
            if v is None:
                continue
            copied = dict(it)
            copied[unique_key] = str(v)
            normalized.append(copied)

        if not normalized:
            return 0, []

        by_key: Dict[str, Dict[str, Any]] = {}
        for it in normalized:
            by_key[str(it.get(unique_key))] = it

        keys = list(by_key.keys())
        processed = 0
        errors: List[Dict[str, Any]] = []

        for batch in _chunked(keys, chunk_size):
            arr_js = json.dumps(batch, ensure_ascii=False)
            where_js = "{" + f'{unique_key}: db.command.in({arr_js})' + "}"
            existing = self.query(f'db.collection("{collection}").where({where_js}).get()')
            existing_keys = set()
            for doc in existing:
                val = doc.get(unique_key)
                if val is not None:
                    existing_keys.add(str(val))

            for k in batch:
                item = by_key.get(k)
                if item is None:
                    continue
                try:
                    now_iso = item.get("updated_at") or _utc_now_iso()
                    if k in existing_keys:
                        update_data = dict(item)
                        update_data["updated_at"] = now_iso
                        self.update_where(
                            collection=collection,
                            where_js=json.dumps({unique_key: k}, ensure_ascii=False),
                            data=update_data,
                        )
                        processed += 1
                    else:
                        insert_data = dict(item)
                        insert_data.setdefault("created_at", now_iso)
                        insert_data.setdefault("updated_at", now_iso)
                        self.add(collection=collection, data=insert_data)
                        processed += 1
                except Exception as e:
                    errors.append({"key": k, "message": str(e)})
        return processed, errors

    def _post_api(self, api_path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        access_token = self._token_provider.get_access_token()
        url = f"https://api.weixin.qq.com/{api_path}?access_token={access_token}"

        last_err: Optional[str] = None
        for attempt in range(3):
            try:
                resp = self._session.post(url, json=payload, timeout=self._timeout)
                resp.raise_for_status()
                data = resp.json()
                if not isinstance(data, dict):
                    raise CloudDbRequestError("云数据库响应格式错误")

                errcode = data.get("errcode")
                if errcode not in (None, 0):
                    raise CloudDbRequestError(data.get("errmsg") or f"cloud errcode={errcode}")
                return data
            except Exception as e:
                last_err = str(e)
                if attempt < 2:
                    time.sleep(min(2.0, 0.3 * (2**attempt)))
        raise CloudDbRequestError(last_err or "云数据库请求失败")
