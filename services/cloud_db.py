import json
import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
import random
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
        verify: bool = True,
    ) -> None:
        self._appid = appid.strip()
        self._secret = secret.strip()
        self._timeout = timeout
        self._session = session or requests.Session()
        self._refresh_margin_seconds = max(0, int(refresh_margin_seconds))
        # 🔧 修复：在云托管环境中，可能需要禁用 SSL 验证
        # 检查环境变量以决定是否验证 SSL
        ssl_verify_env = os.getenv('SSL_VERIFY', 'true').lower()
        self._verify = verify if ssl_verify_env == 'true' else False
        if not self._verify:
            logger.warning("SSL 验证已禁用（通过 SSL_VERIFY 环境变量）")

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
                resp = self._session.get(
                    url, params=params, timeout=self._timeout, verify=self._verify
                )
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
        verify: bool = True,
    ) -> None:
        self._env_id = env_id.strip()
        self._token_provider = token_provider
        self._timeout = timeout
        # 配置连接池大小以匹配并发工作线程数
        if session is None:
            from requests.adapters import HTTPAdapter
            session = requests.Session()
            max_workers = self._load_max_inflight()
            adapter = HTTPAdapter(
                pool_connections=max_workers,
                pool_maxsize=max_workers,
                max_retries=0,
                pool_block=False
            )
            session.mount('https://', adapter)
            session.mount('http://', adapter)
        self._session = session
        self._verify = verify
        self._thread_local = threading.local()
        self._request_semaphore = threading.BoundedSemaphore(self._load_max_inflight())
        self._max_retries = self._load_max_retries()

    @staticmethod
    def _load_max_inflight() -> int:
        raw = os.getenv("WX_DB_MAX_INFLIGHT") or os.getenv("WX_CLOUD_MAX_INFLIGHT") or ""
        if not raw.strip():
            return 64 # 提升默认并发数，以应对全量行情同步需求
        try:
            n = int(raw)
        except Exception:
            return 64
        return max(1, n)

    @staticmethod
    def _load_max_retries() -> int:
        raw = os.getenv("WX_DB_MAX_RETRIES") or os.getenv("WX_CLOUD_MAX_RETRIES") or ""
        if not raw.strip():
            return 3
        try:
            n = int(raw)
        except Exception:
            return 3
        return max(1, n)

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

        verify_ssl = os.getenv("WX_VERIFY_SSL", "true").lower() != "false"

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
            f"secret={_state(raw_secret, secret)}, "
            f"verify_ssl={verify_ssl}"
        )

        if raw_env_id is None or "your_" in env_id:
            raise CloudDbConfigError("缺少或未配置环境变量 WX_CLOUD_ENV")
        if not env_id:
            raise CloudDbConfigError("环境变量 WX_CLOUD_ENV 为空")
        if raw_appid is None or raw_secret is None or "your_" in appid or "your_" in secret:
            raise CloudDbConfigError("缺少或未配置环境变量 WX_APPID/WX_SECRET")
        if not appid or not secret:
            raise CloudDbConfigError("环境变量 WX_APPID/WX_SECRET 为空")

        provider = AccessTokenProvider(appid=appid, secret=secret, verify=verify_ssl)
        return cls(env_id=env_id, token_provider=provider, verify=verify_ssl)

    def query(self, query: str) -> List[Dict[str, Any]]:
        logger.info(f">>> 云数据库查询开始: {query}")
        try:
            payload = self._post_api("tcb/databasequery", {"env": self._env_id, "query": query})
            logger.info(f"<<< 云数据库API响应: errcode={payload.get('errcode', 0)}, 有data字段={('data' in payload)}")
            
            raw = payload.get("data")
            if raw is None:
                logger.warning(f"⚠️ 云数据库返回payload中无data字段，返回空列表。完整payload: {payload}")
                return []
            if not isinstance(raw, list):
                logger.error(f"❌ 云数据库查询返回格式错误: data类型为{type(raw)}(期望list), query={query}")
                return []
            
            logger.info(f"✓ 云数据库返回 {len(raw)} 条原始记录字符串")
            out: List[Dict[str, Any]] = []
            for idx, item in enumerate(raw):
                if not isinstance(item, str):
                    logger.warning(f"记录 {idx} 不是字符串类型: {type(item)}")
                    continue
                try:
                    parsed = json.loads(item)
                    if isinstance(parsed, dict):
                        out.append(parsed)
                    else:
                        logger.warning(f"记录 {idx} JSON解析结果不是dict: {type(parsed)}")
                except Exception as e:
                    logger.warning(f"云数据库查询解析记录 {idx} 失败: {e}, item前100字符={item[:100]}")
                    continue
            
            logger.info(f"✓✓ 云数据库查询成功，解析出 {len(out)} 条有效记录")
            return out
        except CloudDbRequestError as e:
            err_msg = str(e)
            if "[ResourceNotFound]" in err_msg or "Db or Table not exist" in err_msg or "集合不存在" in err_msg:
                logger.warning(f"⚠️ 云数据库查询失败: 集合不存在 ({e})")
                return []
            logger.error(f"❌ 云数据库查询异常: {e}, query={query}")
            raise

    def count(self, query: str) -> int:
        # 确保 query 包含 .count() 结尾
        final_query = query
        if not final_query.strip().endswith(".count()"):
            final_query = f"{final_query.strip()}.count()"
            
        logger.debug(f"云数据库统计查询: {final_query}")
        try:
            payload = self._post_api("tcb/databasecount", {"env": self._env_id, "query": final_query})
            count_val = payload.get("count")
            try:
                return int(count_val)
            except (TypeError, ValueError) as e:
                logger.warning(f"云数据库统计值转换失败: {e}, val={count_val}")
                return 0
        except CloudDbRequestError as e:
            err_msg = str(e)
            if "[ResourceNotFound]" in err_msg or "Db or Table not exist" in err_msg or "集合不存在" in err_msg:
                logger.warning(f"云数据库统计失败: 集合不存在 ({e})")
                return 0
            logger.error(f"云数据库统计查询异常: {e}, query={final_query}")
            raise

    def add(self, *, collection: str, data: Any) -> List[str]:
        if isinstance(data, list):
            # 微信限制批量 add 最大 100 条（云函数 native），HTTP API 建议也保持在此范围内
            query = f'db.collection("{collection}").add({{data: {json.dumps(data)}}})'
        else:
            query = f'db.collection("{collection}").add({{data: {json.dumps(data)}}})'
            
        payload = self._post_api("tcb/databaseadd", {"env": self._env_id, "query": query})
        ids = payload.get("id_list")
        if isinstance(ids, list):
            return [str(x) for x in ids]
        return []

    def update_where(self, *, collection: str, where_js: str, data: Dict[str, Any]) -> int:
        query = (
            f'db.collection("{collection}").where({where_js}).update({{data: {json.dumps(data)}}})'
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
        where_js = json.dumps({unique_key: unique_value})
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
        max_workers: Optional[int] = None,
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

        raw_workers = os.getenv("WX_DB_MAX_WORKERS") or os.getenv("WX_CLOUD_MAX_WORKERS") or ""
        env_workers: Optional[int] = None
        if raw_workers.strip():
            try:
                env_workers = int(raw_workers)
            except Exception:
                env_workers = None

        worker_count = max_workers if max_workers is not None else env_workers
        if worker_count is None:
            worker_count = 32 # 提高默认工作线程数
        try:
            worker_count = int(worker_count)
        except Exception:
            worker_count = 32
        if worker_count < 1:
            worker_count = 1

        executor: Optional[ThreadPoolExecutor] = None
        if worker_count > 1:
            executor = ThreadPoolExecutor(max_workers=worker_count)
        try:
            # 1. 并行查询现有键，确定哪些需要插入，哪些需要更新
            existing_keys = set()
            query_chunk_size = 100 # 微信查询限制
            
            def _query_existing(batch_keys):
                local_existing = set()
                try:
                    arr_js = json.dumps(batch_keys)
                    where_js = "{" + f'"{unique_key}": db.command.in({arr_js})' + "}"
                    res = self.query(f'db.collection("{collection}").where({where_js}).field({{{unique_key}: true}}).get()')
                    for doc in res:
                        val = doc.get(unique_key)
                        if val is not None:
                            local_existing.add(str(val))
                except Exception as e:
                    pass # 静默查询错误，假设不存在
                return local_existing

            query_batches = list(_chunked(keys, query_chunk_size))
            if executor:
                query_futures = [executor.submit(_query_existing, b) for b in query_batches]
                for fut in as_completed(query_futures):
                    existing_keys.update(fut.result())
            else:
                for b in query_batches:
                    existing_keys.update(_query_existing(b))

            existing_batch = [k for k in keys if k in existing_keys]
            new_batch = [k for k in keys if k not in existing_keys]

            # 2. 并行处理插入和更新
            insert_futures_list = []
            update_futures_list = []
            
            # 2.1 准备插入任务
            if new_batch:
                insert_docs = []
                for k in new_batch:
                    item = by_key.get(k)
                    if item:
                        doc = dict(item)
                        if "_id" in doc: del doc["_id"]
                        now = doc.get("updated_at") or _utc_now_iso()
                        doc.setdefault("created_at", now)
                        doc.setdefault("updated_at", now)
                        insert_docs.append(doc)

                def _insert_batch(docs_batch):
                    count = 0
                    try:
                        added_ids = self.add(collection=collection, data=docs_batch)
                        count = len(added_ids)
                    except Exception as e:
                        errors.append({"batch": "insert", "message": str(e), "count": len(docs_batch)})
                    return count

                add_chunk_size = 100
                insert_batches = list(_chunked(insert_docs, add_chunk_size))
                if executor:
                    insert_futures_list = [executor.submit(_insert_batch, b) for b in insert_batches]
                else:
                    for b in insert_batches:
                        processed += _insert_batch(b)

            # 2.2 准备更新任务
            if existing_batch:
                def _update_one(k):
                    item = by_key.get(k)
                    if not item: return False, None
                    try:
                        where_one = json.dumps({unique_key: k})
                        update_data = dict(item)
                        if "_id" in update_data: del update_data["_id"]
                        update_data["updated_at"] = item.get("updated_at") or _utc_now_iso()
                        self.update_where(collection=collection, where_js=where_one, data=update_data)
                        return True, None
                    except Exception as e:
                        return False, {"key": k, "message": str(e)}

                if executor:
                    update_futures_list = [executor.submit(_update_one, k) for k in existing_batch]
                else:
                    for k in existing_batch:
                        ok, err = _update_one(k)
                        if ok: processed += 1
                        elif err: errors.append(err)
            
            # 2.3 等待所有插入和更新任务完成
            if executor:
                for fut in as_completed(insert_futures_list + update_futures_list):
                    res = fut.result()
                    if isinstance(res, int):
                        processed += res
                    elif isinstance(res, tuple):
                        ok, err = res
                        if ok: processed += 1
                        elif err: errors.append(err)
        finally:
            if executor is not None:
                executor.shutdown(wait=True)
        return processed, errors

    def _post_api(self, api_path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        access_token = self._token_provider.get_access_token()
        url = f"https://api.weixin.qq.com/{api_path}?access_token={access_token}"

        last_err: Optional[str] = None
        for attempt in range(self._max_retries):
            try:
                acquired = self._request_semaphore.acquire(timeout=max(0.1, float(self._timeout)))
                if not acquired:
                    raise CloudDbRequestError("云数据库请求繁忙，请稍后重试")

                session = getattr(self._thread_local, "session", None)
                if session is None:
                    # 使用共享的配置好的 session
                    session = self._session
                    self._thread_local.session = session

                try:
                    resp = session.post(
                        url, json=payload, timeout=self._timeout, verify=self._verify
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    if not isinstance(data, dict):
                        raise CloudDbRequestError("云数据库响应格式错误")

                    errcode = data.get("errcode")
                    if errcode not in (None, 0):
                        errmsg = data.get("errmsg") or f"cloud errcode={errcode}"
                        if "Db or Table not exist" in errmsg:
                            raise CloudDbRequestError(
                                f"云数据库集合不存在。请确保已在微信云开发控制台中创建名为该请求所使用的集合。详情: {errmsg}"
                            )
                        raise CloudDbRequestError(errmsg)
                    return data
                finally:
                    self._request_semaphore.release()
            except Exception as e:
                last_err = str(e)
                if attempt < (self._max_retries - 1):
                    raw = (last_err or "").lower()
                    jitter = random.random() * 0.15
                    if "rate" in raw or "qps" in raw or "freq" in raw or "too many" in raw:
                        time.sleep(min(3.0, 0.6 * (2**attempt) + jitter))
                    else:
                        time.sleep(min(2.0, 0.3 * (2**attempt) + jitter))
        raise CloudDbRequestError(last_err or "云数据库请求失败")
