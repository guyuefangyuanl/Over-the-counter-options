import json
import io
import logging
import os
import re
import tempfile
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

# 配置日志
logger = logging.getLogger(__name__)


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


def _parse_complex_matrix(df: Any, header_rows: Any) -> List[Dict[str, Any]]:
    """解析复杂的多级嵌套矩阵格式（期权报价表）"""
    import pandas as pd
    
    items: List[Dict[str, Any]] = []
    now = _utc_now_iso()

    for row_idx in range(4, len(df)):
        try:
            row_data = df.iloc[row_idx]
            raw_code = row_data.iloc[0] if hasattr(row_data, 'iloc') else row_data[0]
            code = _normalize_stock_code(raw_code)
            if not code:
                continue
            
            name_val = row_data.iloc[1] if hasattr(row_data, 'iloc') else row_data[1]
            name = str(name_val).strip() if not pd.isna(name_val) else ""

            # 从第 3 列（索引 2）开始是报价数据
            for col_idx in range(2, len(row_data)):
                try:
                    val = _safe_float(row_data.iloc[col_idx] if hasattr(row_data, 'iloc') else row_data[col_idx])
                    if val is None:
                        continue

                    # 提取维度信息
                    group_type = str(header_rows.iloc[0, col_idx]).strip() if col_idx < len(header_rows.columns) else ""
                    term_str = str(header_rows.iloc[1, col_idx]).strip() if len(header_rows) > 1 and col_idx < len(header_rows.columns) else ""
                    
                    # 归一化期限格式
                    term_map = {
                        "1个月": "1M", "2个月": "2M", "3个月": "3M", "6个月": "6M", "12个月": "12M", "1年": "12M",
                        "2周": "2W", "1周": "1W", "1M": "1M", "2M": "2M", "3M": "3M", "6M": "6M", "12M": "12M", "2W": "2W"
                    }
                    normalized_term = term_map.get(term_str, term_str)

                    trader = str(header_rows.iloc[3, col_idx]).strip() if len(header_rows) > 3 and col_idx < len(header_rows.columns) else ""

                    # 过滤掉非数据列
                    if trader in ("代码", "证券简称", "nan", "", "NaN", "None"):
                        continue

                    # 构造唯一 ID
                    safe_trader = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fa5]", "", trader)
                    safe_term = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fa5]", "", normalized_term)
                    doc_id = f"opt_{code}_{group_type}_{safe_term}_{safe_trader}"

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
                except Exception:
                    continue
        except Exception:
            continue
    
    return items


def _detect_file_format(df: Any) -> Tuple[str, int]:
    """
    检测文件格式类型
    返回: (格式类型, 数据起始行)
    格式类型: 'options_matrix' | 'simple_quotes' | 'unknown'
    """
    import pandas as pd
    
    # 检查前几行的结构来判断格式
    if len(df) < 2:
        return ('unknown', 0)
    
    # 检查是否为期权矩阵格式（多行表头）
    first_row = df.iloc[0] if len(df) > 0 else None
    if first_row is not None:
        first_vals = [str(v).strip() for v in first_row.values[:5]]
        # 期权矩阵通常第一行是类型（如 Call, Put 等）
        if any(v in first_vals for v in ['Call', 'Put', 'call', 'put', '看涨', '看跌', '香草', ' Vanilla ']):
            return ('options_matrix', 4)
    
    # 检查是否有标准列名
    second_row = df.iloc[1] if len(df) > 1 else None
    if second_row is not None:
        headers = [str(v).strip().lower() for v in second_row.values[:6]]
        if any(h in headers for h in ['代码', 'code', 'stock_code', '股票代码']):
            return ('simple_quotes', 2)
    
    # 检查第一行是否就是数据（简单格式）
    if first_row is not None:
        first_cell = str(first_row.iloc[0]).strip() if hasattr(first_row, 'iloc') else str(first_row[0]).strip()
        # 尝试解析为股票代码
        if re.match(r'^\d{6}$', _normalize_stock_code(first_cell) or ''):
            return ('simple_quotes', 0)
    
    return ('unknown', 0)


def parse_quotes_file(*, filename: str, content: bytes, sheet_name: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    解析报价文件（支持 .xlsx/.xls/.csv 格式）
    
    支持两种格式：
    1. 期权矩阵格式：多行表头，包含 type/term/trader/rate 字段
    2. 简单行情格式：标准列头，包含 stock_code/name/price 等字段
    
    返回解析后的数据列表
    """
    import pandas as pd
    
    items: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    
    try:
        # 根据文件扩展名选择解析方式
        ext = os.path.splitext(filename)[1].lower()
        
        if ext == '.csv':
            # CSV 文件
            try:
                df = pd.read_csv(io.BytesIO(content), encoding='utf-8')
            except UnicodeDecodeError:
                df = pd.read_csv(io.BytesIO(content), encoding='gbk')
        elif ext in ('.xlsx', '.xls'):
            # Excel 文件
            df = pd.read_excel(io.BytesIO(content), sheet_name=sheet_name or 0, header=None)
        else:
            logger.warning(f"不支持的文件格式: {ext}")
            return []
        
        if df.empty:
            logger.warning(f"文件为空或无法解析: {filename}")
            return []
        
        logger.info(f"解析文件 {filename}, 行数: {len(df)}, 列数: {len(df.columns)}")
        
        # 检测文件格式
        file_format, data_start_row = _detect_file_format(df)
        logger.info(f"检测到文件格式: {file_format}, 数据起始行: {data_start_row}")
        
        if file_format == 'options_matrix':
            # 期权矩阵格式
            header_rows = df.iloc[:4]  # 前4行是表头
            data_df = df.iloc[data_start_row:]
            items = _parse_complex_matrix(data_df, header_rows)
            
        elif file_format == 'simple_quotes':
            # 简单行情格式
            now = _utc_now_iso()
            
            # 尝试识别列头
            if data_start_row > 0:
                headers = df.iloc[data_start_row - 1].values
                data_df = df.iloc[data_start_row:]
            else:
                # 假设第一行是列头
                headers = df.iloc[0].values
                data_df = df.iloc[1:]
            
            # 构建列名映射
            col_map = {}
            for i, h in enumerate(headers):
                h_lower = str(h).strip().lower()
                if h_lower in ('代码', 'code', 'stock_code', '股票代码'):
                    col_map['stock_code'] = i
                elif h_lower in ('名称', 'name', 'stock_name', '股票名称'):
                    col_map['name'] = i
                elif h_lower in ('价格', 'price', '现价'):
                    col_map['price'] = i
                elif h_lower in ('涨跌幅', 'changepercent', '涨跌'):
                    col_map['changePercent'] = i
                elif h_lower in ('开盘价', 'open'):
                    col_map['open'] = i
                elif h_lower in ('最高价', 'high'):
                    col_map['high'] = i
                elif h_lower in ('最低价', 'low'):
                    col_map['low'] = i
                elif h_lower in ('昨收', 'pre_close'):
                    col_map['pre_close'] = i
                elif h_lower in ('成交量', 'volume'):
                    col_map['volume'] = i
                elif h_lower in ('成交额', 'amount'):
                    col_map['amount'] = i
            
            # 解析数据行
            for idx, row in data_df.iterrows():
                try:
                    if 'stock_code' not in col_map:
                        # 尝试第一列作为代码
                        code = _normalize_stock_code(row.iloc[0])
                    else:
                        code = _normalize_stock_code(row.iloc[col_map['stock_code']])
                    
                    if not code:
                        continue
                    
                    item = {
                        "stock_code": code,
                        "code": code,
                        "name": str(row.iloc[col_map.get('name', 1)]).strip() if 'name' in col_map else "",
                        "updateSource": "file_upload",
                        "updated_at": now,
                    }
                    
                    # 添加可选字段
                    if 'price' in col_map:
                        item['price'] = _safe_float(row.iloc[col_map['price']])
                    if 'changePercent' in col_map:
                        item['changePercent'] = _safe_float(row.iloc[col_map['changePercent']])
                    if 'open' in col_map:
                        item['open'] = _safe_float(row.iloc[col_map['open']])
                    if 'high' in col_map:
                        item['high'] = _safe_float(row.iloc[col_map['high']])
                    if 'low' in col_map:
                        item['low'] = _safe_float(row.iloc[col_map['low']])
                    if 'pre_close' in col_map:
                        item['pre_close'] = _safe_float(row.iloc[col_map['pre_close']])
                    if 'volume' in col_map:
                        item['volume'] = _safe_float(row.iloc[col_map['volume']])
                    if 'amount' in col_map:
                        item['amount'] = _safe_float(row.iloc[col_map['amount']])
                    
                    items.append(item)
                except Exception as e:
                    errors.append({"row": idx, "error": str(e)})
                    continue
        else:
            # 未知格式，尝试通用解析
            logger.warning(f"无法识别文件格式，尝试通用解析")
            now = _utc_now_iso()
            
            for idx, row in df.iterrows():
                try:
                    # 假设第一列是代码，第二列是名称
                    if len(row) < 2:
                        continue
                    code = _normalize_stock_code(row.iloc[0])
                    if not code:
                        continue
                    
                    item = {
                        "stock_code": code,
                        "code": code,
                        "name": str(row.iloc[1]).strip() if not pd.isna(row.iloc[1]) else "",
                        "updateSource": "file_upload",
                        "updated_at": now,
                    }
                    
                    # 尝试解析其他列作为数值
                    for i in range(2, min(len(row), 10)):
                        val = _safe_float(row.iloc[i])
                        if val is not None:
                            item[f'field_{i}'] = val
                    
                    items.append(item)
                except Exception:
                    continue
        
        logger.info(f"文件解析完成: {filename}, 共解析 {len(items)} 条记录, 错误 {len(errors)} 条")
        
    except Exception as e:
        logger.error(f"解析文件失败: {filename}, 错误: {e}")
        return []
    
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
    payload = None
    for i in range(8):
        try:
            with open(path, "r", encoding="utf-8") as f:
                payload = json.load(f)
            break  # 成功则退出循环
        except (json.JSONDecodeError, FileNotFoundError, PermissionError) as e:
            last_err = e
            time.sleep(0.2 * (i + 1))
    
    if payload is None:
        if last_err:
            raise last_err
        return {"items": []}
    
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
