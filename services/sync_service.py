import os
import time
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


def sync_quotes(
    *,
    codes: Optional[Sequence[str]] = None,
    requested_by: Optional[str] = None,
    source: str = "crawler_sina",
    timeout: float = 8.0,
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
    items, crawl_errors = crawl_quotes(target_codes, timeout=timeout, retries=3, chunk_size=50)

    now_iso = _utc_now_iso()
    docs: List[Dict[str, Any]] = []
    for it in items:
        doc = _build_quote_doc(it, source=source)
        doc["updated_at"] = now_iso
        docs.append(doc)

    processed = 0
    upsert_errors: List[Dict[str, Any]] = []
    try:
        processed, upsert_errors = cloud.batch_upsert(
            collection="quotes",
            unique_key="stock_code",
            items=docs,
            chunk_size=50,
        )
    except CloudDbRequestError as e:
        upsert_errors.append({"code": "CLOUD_DB_WRITE_FAILED", "message": str(e)})

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
    try:
        cloud = CloudDbClient.from_env()
    except CloudDbConfigError as e:
        return {"success": False, "message": str(e)}

    try:
        import json

        if codes:
            target_codes = _parse_codes(codes)
            if not target_codes:
                return {"success": True, "deleted": 0}
            where_js = "{" + f'stock_code: db.command.in({json.dumps(target_codes)})' + "}"
            deleted = cloud.delete_where(collection="quotes", where_js=where_js)
            return {"success": True, "deleted": deleted}

        total_deleted = 0
        for _ in range(2000):
            batch = cloud.query('db.collection("quotes").limit(100).get()')
            if not batch:
                return {"success": True, "deleted": total_deleted}

            ids: List[str] = []
            for doc in batch:
                if not isinstance(doc, dict):
                    continue
                _id = doc.get("_id")
                if _id is None:
                    continue
                s = str(_id).strip()
                if s:
                    ids.append(s)

            if not ids:
                return {"success": True, "deleted": total_deleted}

            where_js = "{" + f'_id: db.command.in({json.dumps(ids, ensure_ascii=False)})' + "}"
            deleted = cloud.delete_where(collection="quotes", where_js=where_js)
            total_deleted += int(deleted or 0)

        return {"success": False, "message": "清空失败：删除迭代次数超限"}
    except Exception as e:
        return {"success": False, "message": str(e)}
