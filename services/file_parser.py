import json
import io
import os
import re
import tempfile
import time
import uuid
from typing import Any, Dict, List, Optional

import pandas as pd


def _utc_now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _normalize_stock_code(value: Any) -> Optional[str]:
    if value is None:
        return None
    try:
        if isinstance(value, (int, float)) and not pd.isna(value):
            code_int = int(value)
            if code_int <= 0:
                return None
            return str(code_int).zfill(6)
    except Exception:
        pass

    raw = str(value).strip()
    if not raw or raw.lower() in ("nan", "none"):
        return None
    if raw.endswith(".0"):
        raw = raw[:-2]
    digits = re.findall(r"\d+", raw)
    if not digits:
        return None
    merged = "".join(digits)
    if len(merged) < 6:
        return merged.zfill(6)
    return merged[:6]


def _safe_float(value: Any) -> Optional[float]:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    try:
        if isinstance(value, str):
            # Remove commas and other common non-numeric characters except decimal point
            clean_val = value.replace(",", "").strip()
            v = float(clean_val)
        else:
            v = float(value)
        if v != v:  # NaN check
            return None
        return v
    except Exception:
        return None


def parse_quotes_file(*, filename: str, content: bytes) -> List[Dict[str, Any]]:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext in ("xlsx", "xls"):
        df = pd.read_excel(io.BytesIO(content))
    elif ext == "csv":
        df = pd.read_csv(io.BytesIO(content))
    else:
        raise ValueError("仅支持 Excel (.xlsx, .xls) 或 CSV 文件")

    column_mapping = {
        "stock_code": ["代码", "股票代码", "Code", "证券代码", "A股代码", "code", "stock_code", "指数代码", "合约编码"],
        "name": ["名称", "股票名称", "Name", "证券简称", "A股简称", "name", "指数简称", "合约简称"],
        "price": ["现价", "最新价", "价格", "Price", "收盘价", "price", "今收", "今收盘价"],
        "changePercent": ["涨跌幅", "涨跌", "Change", "涨跌幅(%)", "changePercent"],
        "open": ["开盘", "open"],
        "high": ["最高", "high"],
        "low": ["最低", "low"],
        "pre_close": ["昨收", "昨收盘", "pre_close", "preClose"],
        "volume": ["成交量", "Volume", "总手", "volume"],
        "amount": ["成交额", "Amount", "金额", "amount"],
    }

    found_cols: Dict[str, Any] = {}
    cols = list(df.columns)
    for key, candidates in column_mapping.items():
        for col in cols:
            col_str = str(col)
            if any(cand == col_str or cand in col_str for cand in candidates):
                found_cols[key] = col
                break

    if "stock_code" not in found_cols:
        raise ValueError("无法识别 '代码' 列")

    items: List[Dict[str, Any]] = []
    seen = set()
    for _, row in df.iterrows():
        code = _normalize_stock_code(row.get(found_cols["stock_code"]))
        if not code or code in seen:
            continue
        seen.add(code)

        item: Dict[str, Any] = {
            "stock_code": code,
            "code": code,
            "name": str(row.get(found_cols.get("name"))) if "name" in found_cols else "",
            "updateSource": "file_upload",
            "updated_at": _utc_now_iso(),
        }

        for k in ("price", "changePercent", "open", "high", "low", "pre_close", "volume", "amount"):
            if k in found_cols:
                v = _safe_float(row.get(found_cols[k]))
                if v is not None:
                    item[k] = v
        items.append(item)
    return items


def _upload_cache_dir() -> str:
    base = os.getenv("UPLOAD_CACHE_DIR") or os.path.join(tempfile.gettempdir(), "otc_quote_upload_cache")
    os.makedirs(base, exist_ok=True)
    return base


def create_upload_session(*, items: List[Dict[str, Any]]) -> Dict[str, Any]:
    upload_id = uuid.uuid4().hex
    path = os.path.join(_upload_cache_dir(), f"{upload_id}.json")
    payload = {
        "created_at": _utc_now_iso(),
        "status": "pending",
        "processed_at": None,
        "result": None,
        "items": items,
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)
    preview = items[:20]
    return {"upload_id": upload_id, "total": len(items), "preview": preview}


def load_upload_session_payload(*, upload_id: str) -> Dict[str, Any]:
    safe_id = re.sub(r"[^a-zA-Z0-9]", "", upload_id or "")
    if not safe_id:
        raise ValueError("upload_id 无效")
    path = os.path.join(_upload_cache_dir(), f"{safe_id}.json")
    with open(path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    if not isinstance(payload, dict):
        return {"items": []}
    items = payload.get("items")
    if not isinstance(items, list):
        payload["items"] = []
    else:
        normalized_items: List[Dict[str, Any]] = []
        for it in items:
            if isinstance(it, dict):
                normalized_items.append(it)
        payload["items"] = normalized_items
    return payload


def save_upload_session_payload(*, upload_id: str, payload: Dict[str, Any]) -> None:
    safe_id = re.sub(r"[^a-zA-Z0-9]", "", upload_id or "")
    if not safe_id:
        raise ValueError("upload_id 无效")
    path = os.path.join(_upload_cache_dir(), f"{safe_id}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)


def load_upload_session(*, upload_id: str) -> List[Dict[str, Any]]:
    payload = load_upload_session_payload(upload_id=upload_id)
    items = payload.get("items")
    if isinstance(items, list):
        return [it for it in items if isinstance(it, dict)]
    return []


def delete_upload_session(*, upload_id: str) -> None:
    safe_id = re.sub(r"[^a-zA-Z0-9]", "", upload_id or "")
    if not safe_id:
        return
    path = os.path.join(_upload_cache_dir(), f"{safe_id}.json")
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception:
        return
