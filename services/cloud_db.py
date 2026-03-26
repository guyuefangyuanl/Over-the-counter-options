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
        # 使用 WX_VERIFY_SSL 统一控制 SSL 验证（兼容 SSL_VERIFY）
        ssl_verify_env = os.getenv('WX_VERIFY_SSL', os.getenv('SSL_VERIFY', 'true')).lower()
        self._verify = verify if ssl_verify_env != 'false' else False
        if not self._verify:
            logger.warning("SSL 验证已禁用（WX_VERIFY_SSL=false）")

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
        # 🚀 优化连接池配置：动态调整大小，支持更多并发场景
        if session is None:
            from requests.adapters import HTTPAdapter
            session = requests.Session()
            max_workers = self._load_max_inflight()
            # 连接池大小设置为工作线程数的2倍，避免连接汲取
            pool_connections = max_workers * 2
            pool_maxsize = max_workers * 2
            # 启用连接重试机制
            from urllib3.util.retry import Retry
            retry_strategy = Retry(
                total=3,
                backoff_factor=0.3,
                status_forcelist=[429, 500, 502, 503, 504],
                allowed_methods=["HEAD", "GET", "OPTIONS", "POST"]
            )
            adapter = HTTPAdapter(
                pool_connections=pool_connections,
                pool_maxsize=pool_maxsize,
                max_retries=retry_strategy,
                pool_block=False
            )
            session.mount('https://', adapter)
            session.mount('http://', adapter)
            logger.info(f"🔗 连接池配置: pool_connections={pool_connections}, pool_maxsize={pool_maxsize}, max_retries=3")
        self._session = session
        self._verify = verify
        self._thread_local = threading.local()
        self._request_semaphore = threading.BoundedSemaphore(self._load_max_inflight())
        self._max_retries = self._load_max_retries()
        # 📊 连接池性能指标（扩展版）
        self._metrics = {
            # 基础计数
            'total_requests': 0,
            'successful_requests': 0,
            'failed_requests': 0,
            'retried_requests': 0,
            'timeout_requests': 0,
            # 错误分类计数
            'rate_limited_count': 0,
            'connection_error_count': 0,
            'server_error_count': 0,
            'validation_error_count': 0,
            'not_found_error_count': 0,
            'auth_error_count': 0,
            # 延迟统计
            'total_latency_ms': 0,
            'max_latency_ms': 0,
            # 重试统计
            'total_retry_delay_ms': 0,
        }
        self._metrics_lock = threading.Lock()

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

    def truncate_collection(self, *, collection: str, max_workers: int = 32) -> int:
        """
        高速清空集合：并行发起多次全量删除请求直到集合为空。
        微信云数据库每次 remove() 最多删除约 500 条，
        通过并行+轮询直到连续两轮返回 deleted=0 为止。
        """
        total_deleted = 0
        lock = threading.Lock()
        # _id 字段在所有文档中必然存在，用 gte("") 匹配所有文档
        where_js = '{_id: db.command.gte("")}'

        def _one_delete():
            try:
                n = self.delete_where(collection=collection, where_js=where_js)
                if n > 0:
                    with lock:
                        nonlocal total_deleted
                        total_deleted += n
                return n
            except Exception as e:
                logger.warning(f"truncate_collection 删除批次失败: {e}")
                return 0

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            consecutive_zero_rounds = 0
            while consecutive_zero_rounds < 3:
                futures = [executor.submit(_one_delete) for _ in range(max_workers)]
                round_deleted = sum(f.result() for f in as_completed(futures))
                logger.info(f"truncate_collection 本轮删除: {round_deleted} 条，累计: {total_deleted} 条")
                if round_deleted == 0:
                    consecutive_zero_rounds += 1
                else:
                    consecutive_zero_rounds = 0
        logger.info(f"truncate_collection 完成，共删除 {total_deleted} 条")
        return total_deleted

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
        """
        发送API请求并处理重试
        
        重试策略：
        1. 限流错误(429/QPS)：使用指数退避，最大延迟5秒
        2. 服务器错误(5xx)：使用指数退避，最大延迟4秒
        3. 连接超时：使用快速重试，最大延迟2秒
        4. 超时错误：使用线性退避，最大延迟3秒
        5. 验证/认证/资源不存在错误：不重试
        """
        access_token = self._token_provider.get_access_token()
        url = f"https://api.weixin.qq.com/{api_path}?access_token={access_token}"

        last_err: Optional[str] = None
        start_time = time.time()
        total_retry_delay_ms = 0
        
        with self._metrics_lock:
            self._metrics['total_requests'] += 1
        
        for attempt in range(self._max_retries):
            try:
                acquired = self._request_semaphore.acquire(timeout=max(0.1, float(self._timeout)))
                if not acquired:
                    with self._metrics_lock:
                        self._metrics['timeout_requests'] += 1
                    raise CloudDbRequestError("云数据库请求繁忙，请稍后重试")

                session = getattr(self._thread_local, "session", None)
                if session is None:
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
                    
                    # 记录成功请求和延迟
                    latency_ms = int((time.time() - start_time) * 1000)
                    with self._metrics_lock:
                        self._metrics['successful_requests'] += 1
                        self._metrics['total_latency_ms'] += latency_ms
                        if latency_ms > self._metrics['max_latency_ms']:
                            self._metrics['max_latency_ms'] = latency_ms
                    
                    # 记录重试次数和延迟
                    if attempt > 0:
                        with self._metrics_lock:
                            self._metrics['retried_requests'] += 1
                            self._metrics['total_retry_delay_ms'] += total_retry_delay_ms
                        logger.info(f"🔄 请求重试成功 (第{attempt+1}次尝试, 延迟{total_retry_delay_ms}ms)")
                    
                    return data
                finally:
                    self._request_semaphore.release()
                    
            except Exception as e:
                last_err = str(e)
                error_type = self._classify_error(last_err)
                
                # 按错误类型记录计数
                error_count_key = f'{error_type}_count'
                with self._metrics_lock:
                    if error_count_key in self._metrics:
                        self._metrics[error_count_key] += 1
                
                # 判断是否可重试
                if not self._is_retryable_error(error_type):
                    # 不可重试错误，直接失败
                    with self._metrics_lock:
                        self._metrics['failed_requests'] += 1
                    logger.error(f"❌ 不可重试错误 ({error_type}): {last_err}")
                    raise CloudDbRequestError(last_err)
                
                if attempt < (self._max_retries - 1):
                    delay = self._calculate_retry_delay(error_type, attempt)
                    delay_ms = int(delay * 1000)
                    total_retry_delay_ms += delay_ms
                    logger.warning(f"⚠️ 请求失败 ({attempt+1}/{self._max_retries}): {error_type}, {delay:.2f}s后重试...")
                    time.sleep(delay)
                else:
                    # 最后一次尝试失败
                    with self._metrics_lock:
                        self._metrics['failed_requests'] += 1
                        self._metrics['total_retry_delay_ms'] += total_retry_delay_ms
                    logger.error(f"❌ 请求失败 (已重试{self._max_retries}次): {last_err}")
                    
        raise CloudDbRequestError(last_err or "云数据库请求失败")
    
    def _classify_error(self, error_msg: str) -> str:
        """
        分类错误类型
        
        错误类型分类:
        - rate_limit: 限流错误，可重试，指数退避
        - timeout: 超时错误，可重试，线性退避
        - connection: 连接错误，可重试，快速重试
        - server_error: 服务器错误，可重试，指数退避
        - validation: 验证错误，不可重试
        - not_found: 资源不存在，不可重试
        - auth: 认证错误，不可重试
        - unknown: 未知错误，可重试（保守策略）
        """
        error_lower = error_msg.lower()
        
        # 限流相关
        if any(kw in error_lower for kw in ['rate', 'qps', 'freq', 'too many', 'limit', '429', 'throttl']):
            return 'rate_limit'
        # 超时相关
        elif any(kw in error_lower for kw in ['timeout', 'timed out', 'time out']):
            return 'timeout'
        # 连接相关
        elif any(kw in error_lower for kw in ['connection', 'refused', 'reset', 'network', 'unreachable']):
            return 'connection'
        # 服务器错误
        elif any(kw in error_lower for kw in ['500', '502', '503', '504', 'server', 'internal', 'service unavailable']):
            return 'server_error'
        # 验证错误（不可重试）
        elif any(kw in error_lower for kw in ['invalid', 'validation', 'format', 'parse', 'schema']):
            return 'validation'
        # 资源不存在（不可重试）
        elif any(kw in error_lower for kw in ['not found', 'not exist', '404', 'resource not found', 'db or table not exist']):
            return 'not_found'
        # 认证错误（不可重试）
        elif any(kw in error_lower for kw in ['unauthorized', 'forbidden', '401', '403', 'auth', 'permission', 'access denied']):
            return 'auth'
        else:
            return 'unknown'
    
    def _is_retryable_error(self, error_type: str) -> bool:
        """判断错误是否可重试"""
        retryable_types = {'rate_limit', 'timeout', 'connection', 'server_error', 'unknown'}
        return error_type in retryable_types
    
    def _calculate_retry_delay(self, error_type: str, attempt: int) -> float:
        """
        根据错误类型计算重试延迟
        
        Args:
            error_type: 错误类型
            attempt: 当前重试次数（从0开始）
            
        Returns:
            重试延迟秒数
        """
        jitter = random.random() * 0.2  # 增加抖动范围
        
        if error_type == 'rate_limit':
            # 限流错误：指数退避，最大5秒
            return min(5.0, 0.8 * (2 ** attempt) + jitter)
        elif error_type == 'timeout':
            # 超时错误：线性退避，最大3秒
            return min(3.0, 0.6 * (attempt + 1) + jitter)
        elif error_type == 'connection':
            # 连接错误：快速重试，最大2秒
            return min(2.0, 0.2 * (attempt + 1) + jitter)
        elif error_type == 'server_error':
            # 服务器错误：指数退避，最大4秒
            return min(4.0, 0.5 * (2 ** attempt) + jitter)
        else:
            # 其他错误：基础退避，最大2秒
            return min(2.0, 0.3 * (attempt + 1) + jitter)
    
    def get_metrics(self) -> Dict[str, Any]:
        """获取连接池性能指标"""
        with self._metrics_lock:
            metrics = self._metrics.copy()
        
        # 计算衍生指标
        if metrics['total_requests'] > 0:
            metrics['success_rate'] = metrics['successful_requests'] / metrics['total_requests']
            metrics['error_rate'] = metrics['failed_requests'] / metrics['total_requests']
        else:
            metrics['success_rate'] = 0.0
            metrics['error_rate'] = 0.0
        
        # 计算平均延迟
        if metrics.get('total_latency_ms', 0) > 0 and metrics['total_requests'] > 0:
            metrics['avg_latency_ms'] = metrics['total_latency_ms'] / metrics['total_requests']
        else:
            metrics['avg_latency_ms'] = 0.0
        
        return metrics
    
    def reset_metrics(self):
        """重置性能指标"""
        with self._metrics_lock:
            self._metrics = {
                # 基础计数
                'total_requests': 0,
                'successful_requests': 0,
                'failed_requests': 0,
                'retried_requests': 0,
                'timeout_requests': 0,
                # 错误分类计数
                'rate_limited_count': 0,
                'connection_error_count': 0,
                'server_error_count': 0,
                'validation_error_count': 0,
                'not_found_error_count': 0,
                'auth_error_count': 0,
                # 延迟统计
                'total_latency_ms': 0,
                'max_latency_ms': 0,
                # 重试统计
                'total_retry_delay_ms': 0,
            }
    
    def get_error_rate(self) -> float:
        """获取错误率"""
        with self._metrics_lock:
            total = self._metrics['total_requests']
            if total == 0:
                return 0.0
            return self._metrics['failed_requests'] / total
    
    def get_health_status(self) -> Dict[str, Any]:
        """获取健康状态"""
        metrics = self.get_metrics()
        
        # 判断健康状态
        if metrics['error_rate'] > 0.5:
            status = 'unhealthy'
        elif metrics['error_rate'] > 0.1:
            status = 'degraded'
        elif metrics['avg_latency_ms'] > 2000:
            status = 'slow'
        else:
            status = 'healthy'
        
        return {
            'status': status,
            'error_rate': metrics['error_rate'],
            'success_rate': metrics['success_rate'],
            'avg_latency_ms': metrics['avg_latency_ms'],
            'total_requests': metrics['total_requests'],
            'failed_requests': metrics['failed_requests'],
            'last_updated': _utc_now_iso()
        }
