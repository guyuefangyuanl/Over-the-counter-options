import os
import time
import hashlib
from typing import Any, Dict, List, Optional, Sequence

from services.cloud_db import CloudDbClient, CloudDbConfigError, CloudDbRequestError
from services.sina_crawler import crawl_quotes


def _utc_now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _parse_codes(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        out: List[str] = []
        for x in value:
            if x is None:
                continue
            s = str(x).strip()
            if s:
                out.append(s)
        return out
    raw = str(value).strip()
    if not raw:
        return []
    parts = [p.strip() for p in raw.replace(";", ",").replace(" ", ",").split(",")]
    return [p for p in parts if p]


def _default_codes_from_env() -> List[str]:
    raw = os.getenv("SINA_DEFAULT_CODES") or os.getenv("DEFAULT_QUOTE_CODES") or ""
    codes = _parse_codes(raw)
    if codes:
        return codes
    return ["600519", "000001"]


def _build_quote_doc(item: Dict[str, Any], *, source: str) -> Dict[str, Any]:
    stock_code = str(item.get("stock_code") or "").strip()
    out: Dict[str, Any] = dict(item)
    out["stock_code"] = stock_code
    out["code"] = stock_code
    out["updateSource"] = source
    out["updated_at"] = out.get("updated_at") or _utc_now_iso()
    out.setdefault("name", "")
    return out


def _shard_codes(codes: Sequence[str], *, shard_index: int, shard_count: int) -> List[str]:
    if shard_count <= 1:
        return list(codes)
    si = int(shard_index)
    sc = int(shard_count)
    if si < 0 or sc < 1 or si >= sc:
        return list(codes)

    selected: List[str] = []
    for c in codes:
        s = str(c).strip()
        if not s:
            continue
        h = hashlib.md5(s.encode("utf-8")).hexdigest()
        if (int(h, 16) % sc) == si:
            selected.append(s)
    return selected


def sync_quotes(
    *,
    codes: Optional[Sequence[str]] = None,
    requested_by: Optional[str] = None,
    source: str = "crawler_sina",
    timeout: float = 8.0,
    max_workers: Optional[int] = None,
    shard_index: Optional[int] = None,
    shard_count: Optional[int] = None,
) -> Dict[str, Any]:
    started_at = time.time()
    try:
        cloud = CloudDbClient.from_env()
    except CloudDbConfigError as e:
        return {
            "success": False,
            "message": str(e),
            "processed": 0,
            "errors": [{"code": "CLOUD_DB_NOT_CONFIGURED", "message": str(e)}],
        }

    target_codes = list(codes) if codes else _default_codes_from_env()

    if shard_index is None and shard_count is None:
        raw_si = os.getenv("SINA_SHARD_INDEX") or ""
        raw_sc = os.getenv("SINA_SHARD_COUNT") or ""
        if raw_si.strip() and raw_sc.strip():
            try:
                shard_index = int(raw_si)
                shard_count = int(raw_sc)
            except Exception:
                shard_index = None
                shard_count = None
    if shard_index is not None and shard_count is not None:
        target_codes = _shard_codes(target_codes, shard_index=int(shard_index), shard_count=int(shard_count))

    def _load_int_env(name: str, default: int) -> int:
        raw = os.getenv(name) or ""
        if not raw.strip():
            return int(default)
        try:
            return int(raw)
        except Exception:
            return int(default)

    crawl_retries = max(0, _load_int_env("SINA_FETCH_RETRIES", 3))
    crawl_chunk_size = _load_int_env("SINA_FETCH_CHUNK_SIZE", 50)
    if crawl_chunk_size < 1:
        crawl_chunk_size = 1
    if crawl_chunk_size > 200:
        crawl_chunk_size = 200

    crawl_max_workers_raw = os.getenv("SINA_FETCH_MAX_WORKERS") or ""
    crawl_max_workers: Optional[int] = None
    if crawl_max_workers_raw.strip():
        try:
            crawl_max_workers = int(crawl_max_workers_raw)
        except Exception:
            crawl_max_workers = None

    if max_workers is not None:
        crawl_max_workers = int(max_workers)

    crawl_t0 = time.time()
    items, crawl_errors = crawl_quotes(
        target_codes,
        timeout=timeout,
        retries=crawl_retries,
        chunk_size=crawl_chunk_size,
        max_workers=crawl_max_workers,
    )
    crawl_ms = int((time.time() - crawl_t0) * 1000)

    now_iso = _utc_now_iso()
    docs: List[Dict[str, Any]] = []
    for it in items:
        doc = _build_quote_doc(it, source=source)
        doc["updated_at"] = now_iso
        docs.append(doc)

    processed = 0
    upsert_errors: List[Dict[str, Any]] = []
    try:
        upsert_t0 = time.time()
        processed, upsert_errors = cloud.batch_upsert(
            collection="quotes",
            unique_key="stock_code",
            items=docs,
            chunk_size=_load_int_env("WX_DB_UPSERT_CHUNK_SIZE", 50),
            max_workers=max_workers,
        )
        upsert_ms = int((time.time() - upsert_t0) * 1000)
    except CloudDbRequestError as e:
        upsert_errors.append({"code": "CLOUD_DB_WRITE_FAILED", "message": str(e)})
        upsert_ms = 0

    duration_ms = int((time.time() - started_at) * 1000)
    errors = list(crawl_errors) + list(upsert_errors)

    try:
        cloud.add(
            collection="sync_logs",
            data={
                "type": "sync_quotes",
                "source": source,
                "requested_by": requested_by or "",
                "codes": target_codes,
                "fetched": len(items),
                "processed": processed,
                "crawlMs": crawl_ms,
                "upsertMs": upsert_ms,
                "crawlErrorCount": len(crawl_errors),
                "upsertErrorCount": len(upsert_errors),
                "shardIndex": int(shard_index) if shard_index is not None else None,
                "shardCount": int(shard_count) if shard_count is not None else None,
                "errorCount": len(errors),
                "errors": errors[:50],
                "durationMs": duration_ms,
                "created_at": now_iso,
            },
        )
    except Exception:
        pass

    return {
        "success": len(errors) == 0,
        "processed": processed,
        "fetched": len(items),
        "codes": target_codes,
        "errors": errors,
        "durationMs": duration_ms,
        "crawlMs": crawl_ms,
        "upsertMs": upsert_ms,
        "crawlErrorCount": len(crawl_errors),
        "upsertErrorCount": len(upsert_errors),
        "shardIndex": int(shard_index) if shard_index is not None else None,
        "shardCount": int(shard_count) if shard_count is not None else None,
    }


def upsert_quotes_from_file(
    *,
    items: Sequence[Dict[str, Any]],
    requested_by: Optional[str] = None,
    source: str = "file_upload",
) -> Dict[str, Any]:
    started_at = time.time()
    try:
        cloud = CloudDbClient.from_env()
    except CloudDbConfigError as e:
        return {
            "success": False,
            "message": str(e),
            "processed": 0,
            "errors": [{"code": "CLOUD_DB_NOT_CONFIGURED", "message": str(e)}],
        }

    now_iso = _utc_now_iso()
    docs: List[Dict[str, Any]] = []
    for it in items:
        doc = _build_quote_doc(it, source=source)
        doc["updated_at"] = now_iso
        docs.append(doc)

    processed = 0
    errors: List[Dict[str, Any]] = []
    try:
        processed, upsert_errors = cloud.batch_upsert(
            collection="quotes",
            unique_key="stock_code",
            items=docs,
            chunk_size=50,
        )
        errors.extend(upsert_errors)
    except Exception as e:
        errors.append({"code": "CLOUD_DB_WRITE_FAILED", "message": str(e)})

    duration_ms = int((time.time() - started_at) * 1000)

    try:
        cloud.add(
            collection="sync_logs",
            data={
                "type": "upload_quotes",
                "source": source,
                "requested_by": requested_by or "",
                "count": len(items),
                "processed": processed,
                "errorCount": len(errors),
                "errors": errors[:50],
                "durationMs": duration_ms,
                "created_at": now_iso,
            },
        )
    except Exception:
        pass

    return {
        "success": len(errors) == 0,
        "processed": processed,
        "count": len(items),
        "errors": errors,
        "durationMs": duration_ms,
    }


def delete_quotes(*, codes: Optional[Sequence[str]] = None) -> Dict[str, Any]:
    started_at = time.time()
    try:
        cloud = CloudDbClient.from_env()
    except CloudDbConfigError as e:
        return {"success": False, "message": str(e)}

    try:
        import json

        if codes:
            target_codes = _parse_codes(codes)
            if not target_codes:
                return {"success": True, "deleted": 0, "durationMs": int((time.time() - started_at) * 1000)}
            total_deleted = 0
            for batch in [target_codes[i : i + 200] for i in range(0, len(target_codes), 200)]:
                where_js = "{" + f'stock_code: db.command.in({json.dumps(batch, ensure_ascii=False)})' + "}"
                deleted = cloud.delete_where(collection="quotes", where_js=where_js)
                total_deleted += int(deleted or 0)
            return {
                "success": True,
                "deleted": total_deleted,
                "durationMs": int((time.time() - started_at) * 1000),
            }

        total_deleted = 0
        for _ in range(200000):
            rows = cloud.query('db.collection("quotes").field({_id: true}).limit(200).get()')
            if not rows:
                return {
                    "success": True,
                    "deleted": total_deleted,
                    "durationMs": int((time.time() - started_at) * 1000),
                }

            batch_ids: List[str] = []
            for r in rows:
                if not isinstance(r, dict):
                    continue
                _id = r.get("_id")
                s = str(_id or "").strip()
                if s:
                    batch_ids.append(s)

            batch_ids = list(dict.fromkeys(batch_ids))
            if not batch_ids:
                return {
                    "success": False,
                    "message": "清空失败：无法获取 _id 批次",
                    "deleted": total_deleted,
                    "durationMs": int((time.time() - started_at) * 1000),
                }

            where_js = "{" + f'_id: db.command.in({json.dumps(batch_ids, ensure_ascii=False)})' + "}"
            deleted = cloud.delete_where(collection="quotes", where_js=where_js)
            n = int(deleted or 0)
            if n <= 0:
                return {
                    "success": False,
                    "message": "清空失败：删除进度停滞",
                    "deleted": total_deleted,
                    "durationMs": int((time.time() - started_at) * 1000),
                }
            total_deleted += n

        return {
            "success": False,
            "message": "清空失败：删除迭代次数超限",
            "deleted": total_deleted,
            "durationMs": int((time.time() - started_at) * 1000),
        }
    except Exception as e:
        return {"success": False, "message": str(e), "durationMs": int((time.time() - started_at) * 1000)}
