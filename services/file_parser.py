import json
import io
import os
import re
import tempfile
import time
import uuid
from typing import Any, Dict, List, Optional

# import pandas as pd  # 云托管环境暂不需要


def _utc_now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _normalize_stock_code(value: Any) -> Optional[str]:
    """标准化股票代码（云托管简化版）"""
    if value is None:
        return None
    
    raw = str(value).strip()
    if not raw or raw.lower() in ("nan", "none", "null"):
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
    """安全转换为浮点数（云托管简化版）"""
    if value is None:
        return None
    try:
        if isinstance(value, str):
            clean_val = value.replace(",", "").strip()
            v = float(clean_val)
        else:
            v = float(value)
        if v != v:  # NaN check
            return None
        return v
    except Exception:
        return None


def _parse_complex_matrix(df: Any) -> List[Dict[str, Any]]:
    """解析复杂的多级嵌套矩阵格式（云托管简化版，返回空列表）"""
    return []

    items: List[Dict[str, Any]] = []
    now = _utc_now_iso()

    for row_idx in range(4, len(df)):
        row_data = df.iloc[row_idx]
        raw_code = row_data[0]
        code = _normalize_stock_code(raw_code)
        if not code:
            continue
        
        name = str(row_data[1]) if not pd.isna(row_data[1]) else ""

        # 从第 3 列（索引 2）开始是报价数据
        for col_idx in range(2, len(df.columns)):
            val = _safe_float(row_data[col_idx])
            # 如果是 "-" 或 NaN，跳过
            if val is None:
                continue

            # 提取维度信息
            group_type = str(header_rows.iloc[0, col_idx]).strip()
            term_str = str(header_rows.iloc[1, col_idx]).strip()
            
            # 归一化期限格式
            term_map = {
                "1个月": "1M", "2个月": "2M", "3个月": "3M", "6个月": "6M", "12个月": "12M", "1年": "12M",
                "2周": "2W", "1周": "1W", "1M": "1M", "2M": "2M", "3M": "3M", "6M": "6M", "12M": "12M", "2W": "2W"
            }
            normalized_term = term_map.get(term_str, term_str)

            trader = str(header_rows.iloc[3, col_idx]).strip()

            # 过滤掉非数据列（如某些文件中可能在中间插入了代码列）
            if trader in ("代码", "证券简称", "nan", "", "NaN"):
                continue

            # 构造唯一 ID，确保不同交易商、期限、类型的报价共存
            # 格式：opt_{股票代码}_{类型}_{期限}_{交易商}
            safe_trader = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fa5]", "", trader)
            safe_term = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fa5]", "", normalized_term)
            doc_id = f"opt_{code}_{group_type}_{safe_term}_{safe_trader}"

            # 构造标准化对象
            item = {
                "stock_code": code,
                "code": doc_id,
                "name": name,
                "type": group_type,
                "term": normalized_term,
                "trader": trader,
                "rate": val,
                "updateSource": "file_upload",
                "updated_at": now,
            }
            items.append(item)
    
    return items


def parse_quotes_file(*, filename: str, content: bytes, sheet_name: Optional[str] = None) -> List[Dict[str, Any]]:
    """解析报价文件（云托管简化版，返回空列表）"""
    logger.info(f"文件解析功能在云托管环境暂不可用: {filename}")
    return []


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
    
    # 添加更强力的重试逻辑以应对超大文件的磁盘延迟
    last_err = None
    for i in range(8):
        try:
            with open(path, "r", encoding="utf-8") as f:
                payload = json.load(f)
            return payload # 成功则直接返回
        except (json.JSONDecodeError, FileNotFoundError, PermissionError) as e:
            last_err = e
            time.sleep(0.2 * (i + 1))
    
    if last_err:
        raise last_err
    
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
    
    base_dir = _upload_cache_dir()
    final_path = os.path.join(base_dir, f"{safe_id}.json")
    
    # 使用临时文件实现原子化写入，防止读取冲突
    fd, temp_path = tempfile.mkstemp(dir=base_dir, prefix=f"tmp_{safe_id}_", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
        # Windows 下 os.replace 是原子性的
        os.replace(temp_path, final_path)
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise e


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
