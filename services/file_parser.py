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


def _parse_complex_matrix(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """解析复杂的多级嵌套矩阵格式"""
    # 处理表头：前 4 行为表头
    if len(df) < 5:
        return []

    header_rows = df.iloc[0:4].copy()
    # 填充合并单元格（前 2 行通常是合并的）
    header_rows.iloc[0] = header_rows.iloc[0].ffill()
    header_rows.iloc[1] = header_rows.iloc[1].ffill()

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
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext in ("xlsx", "xls"):
        # 读取时不指定 header，以便我们手动处理多级表头
        if sheet_name:
            df = pd.read_excel(io.BytesIO(content), header=None, sheet_name=sheet_name)
        else:
            # 如果没有指定 sheet_name，我们先尝试寻找包含 "个股" 和 "香草" 的 sheet
            excel_file = pd.ExcelFile(io.BytesIO(content))
            target_sheet = None
            for s in excel_file.sheet_names:
                if "个股" in s and "香草" in s:
                    target_sheet = s
                    break
            if not target_sheet:
                for s in excel_file.sheet_names:
                    if "个股" in s or "香草" in s:
                        target_sheet = s
                        break
            
            if target_sheet:
                df = pd.read_excel(io.BytesIO(content), header=None, sheet_name=target_sheet)
            else:
                df = pd.read_excel(io.BytesIO(content), header=None)
    elif ext == "csv":
        df = pd.read_csv(io.BytesIO(content), header=None)
    else:
        raise ValueError("仅支持 Excel (.xlsx, .xls) 或 CSV 文件")

    if df.empty:
        return []

    # 启发式判断：如果前几行包含 "普通香草" 或 "代码" 在 Row 3，说明是复杂矩阵
    is_matrix = False
    # 增加搜索范围到前 20 行
    first_few_rows_df = df.iloc[:20]
    first_few_rows_str = str(first_few_rows_df.values)
    
    matrix_keywords = ["普通香草", "证券简称", "标的简称", "行权价", "参与率", "期限", "交易商", "香草报价"]
    if any(kw in first_few_rows_str for kw in matrix_keywords):
        is_matrix = True
        
    # 如果 sheet 名包含香草且没有明确判定为非矩阵，也尝试矩阵解析
    if not is_matrix and sheet_name and ("香草" in sheet_name or "矩阵" in sheet_name):
        if any(kw in first_few_rows_str for kw in ["代码", "简称", "名称", "证券"]):
            is_matrix = True

    if is_matrix:
        # 寻找矩阵表头的起始行（包含 "证券简称" 或 "代码" 的行通常是第 4 行表头的末尾）
        # 我们假设 "证券简称" 所在的行是 row 4 (index 3) 或者附近
        matrix_header_start = 0
        for i in range(min(10, len(df))):
            row_str = str(df.iloc[i].values)
            if "证券简称" in row_str or "标的简称" in row_str:
                # 矩阵格式通常：
                # 0: 类型 (香草)
                # 1: 期限 (1M)
                # 2: 挂钩 (价格) -> 这一行可能没有，或者是交易商
                # 3: 交易商
                # 所以 证券简称 所在的通常是第 4 行 (index 3)
                matrix_header_start = max(0, i - 3)
                break
        
        if matrix_header_start > 0:
            df = df.iloc[matrix_header_start:].reset_index(drop=True)
            
        return _parse_complex_matrix(df)

    # 否则按原有扁平逻辑处理
    # 寻找表头行
    column_mapping = {
        "stock_code": ["代码", "股票代码", "Code", "证券代码", "A股代码", "code", "stock_code", "指数代码", "合约编码", "标的代码"],
        "name": ["名称", "股票名称", "Name", "证券简称", "A股简称", "name", "指数简称", "合约简称", "标的名称"],
        "price": ["现价", "最新价", "价格", "Price", "收盘价", "price", "今收", "今收盘价"],
        "changePercent": ["涨跌幅", "涨跌", "Change", "涨跌幅(%)", "changePercent"],
        "open": ["开盘", "open"],
        "high": ["最高", "high"],
        "low": ["最低", "low"],
        "pre_close": ["昨收", "昨收盘", "pre_close", "preClose"],
        "volume": ["成交量", "Volume", "总手", "volume"],
        "amount": ["成交额", "Amount", "金额", "amount"],
    }

    header_idx = 0
    found_stock_col = False
    for i in range(min(20, len(df))):
        row_vals = [str(v).strip().lower() for v in df.iloc[i].values if not pd.isna(v)]
        # 检查该行是否包含 stock_code 的候选词
        for val in row_vals:
            if any(cand.lower() == val or cand.lower() in val for cand in column_mapping["stock_code"]):
                header_idx = i
                found_stock_col = True
                break
        if found_stock_col:
            break
            
    df.columns = df.iloc[header_idx]
    df = df[header_idx + 1:].reset_index(drop=True)
    
    found_cols: Dict[str, Any] = {}
    cols = list(df.columns)
    for key, candidates in column_mapping.items():
        for col in cols:
            col_str = str(col).strip().lower()
            if any(cand.lower() == col_str or cand.lower() in col_str for cand in candidates):
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
