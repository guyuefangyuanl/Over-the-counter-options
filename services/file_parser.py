import json
import io
import logging
import os
import re
import tempfile
import time
import uuid
import hashlib
from typing import Any, Dict, List, Optional, Tuple
from contextlib import contextmanager

# 配置日志
logger = logging.getLogger(__name__)


# ================== 正则安全模块 ==================

# 正则表达式元字符（需要转义的字符）
REGEX_META_CHARS = r'\^$.|?*+()[]{}'

def escape_regex_pattern(pattern: str) -> str:
    """
    转义正则表达式特殊字符，防止ReDoS攻击
    
    Args:
        pattern: 原始字符串
        
    Returns:
        转义后的安全字符串
    """
    if not pattern:
        return ''
    # 转义所有正则元字符
    return re.escape(pattern)

def sanitize_for_regex(value: Any, max_length: int = 100) -> str:
    """
    安全地处理用于正则匹配的用户输入
    
    安全措施：
    1. 类型检查和转换
    2. 长度限制（防止DoS）
    3. 移除控制字符
    4. 转义正则元字符
    
    Args:
        value: 用户输入值
        max_length: 最大允许长度
        
    Returns:
        安全的字符串
    """
    if value is None:
        return ''
    
    # 转换为字符串
    raw = str(value).strip()
    
    # 长度限制
    if len(raw) > max_length:
        raw = raw[:max_length]
        logger.debug(f"输入已截断至 {max_length} 字符")
    
    # 移除控制字符（保留常见空白）
    clean = ''.join(c for c in raw if ord(c) >= 32 or c in '\t\n\r')
    
    # 转义正则元字符
    return re.escape(clean)

def validate_regex_pattern(pattern: str, max_complexity: int = 100) -> Tuple[bool, str]:
    """
    验证正则表达式模式的安全性
    
    检测潜在的ReDoS模式：
    - 嵌套量词
    - 重叠的交替分支
    - 过长的模式
    
    Args:
        pattern: 正则表达式模式
        max_complexity: 最大允许的复杂度评分
        
    Returns:
        (是否安全, 原因说明)
    """
    if not pattern:
        return True, "空模式"
    
    # 长度检查
    if len(pattern) > 1000:
        return False, "正则表达式过长"
    
    # 检测危险的嵌套量词模式（如 (a+)+, (a*)+, (a|b)+ 等）
    dangerous_patterns = [
        r'\([^)]*[+*][^)]*\)[+*]',  # 嵌套量词
        r'\([^)]*\|[^)]*\)[+*]',     # 带交替的量词
        r'\[[^\]]*\][+*][+*]',       # 字符类后的双重量词
    ]
    
    for dangerous in dangerous_patterns:
        if re.search(dangerous, pattern):
            return False, "检测到潜在的ReDoS模式"
    
    # 复杂度评估（简单评分）
    complexity = 0
    complexity += pattern.count('+') * 2
    complexity += pattern.count('*') * 2
    complexity += pattern.count('?') * 1
    complexity += pattern.count('|') * 3
    complexity += pattern.count('(') * 2
    complexity += pattern.count('[') * 2
    
    if complexity > max_complexity:
        return False, f"正则表达式复杂度过高 ({complexity})"
    
    return True, "安全"


# ================== 安全配置 ==================

# 允许的文件扩展名
ALLOWED_EXTENSIONS = {'.xlsx', '.xls', '.csv'}

# 文件大小限制（字节）
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB

# 最大单元格数量（防止DoS攻击）
MAX_CELLS = 1_000_000

# 最大行列数
MAX_ROWS = 100_000
MAX_COLS = 500

# 文件名最大长度
MAX_FILENAME_LENGTH = 255

# 允许的MIME类型
ALLOWED_MIME_TYPES = {
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  # xlsx
    'application/vnd.ms-excel',  # xls
    'application/excel',
    'application/x-excel',
    'application/x-msexcel',
    'text/csv',
    'text/plain',
    'application/csv',
}

# 危险的文件名字符（需要移除）
DANGEROUS_FILENAME_CHARS = ['..', '/', '\\', '\x00', '\n', '\r', '\t', '<', '>', ':', '"', '|', '?', '*']


class FileValidationError(Exception):
    """文件验证错误"""
    def __init__(self, message: str, code: str = None):
        self.message = message
        self.code = code or 'FILE_VALIDATION_ERROR'
        super().__init__(self.message)


# ================== 安全函数 ==================

def sanitize_filename(filename: str) -> str:
    """
    清理文件名，防止路径遍历攻击
    
    Args:
        filename: 原始文件名
        
    Returns:
        安全的文件名
        
    Raises:
        FileValidationError: 文件名无效
    """
    if not filename:
        raise FileValidationError("文件名不能为空", "EMPTY_FILENAME")
    
    # 截断过长的文件名
    if len(filename) > MAX_FILENAME_LENGTH:
        filename = filename[-MAX_FILENAME_LENGTH:]
    
    # 移除危险字符
    clean = filename
    for char in DANGEROUS_FILENAME_CHARS:
        clean = clean.replace(char, '_')
    
    # 移除控制字符
    clean = ''.join(c for c in clean if ord(c) >= 32 or c in '\t')
    
    # 移除首尾空格和点
    clean = clean.strip(' .')
    
    if not clean:
        raise FileValidationError("文件名无效", "INVALID_FILENAME")
    
    # 检查扩展名
    ext = os.path.splitext(clean)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise FileValidationError(
            f"不支持的文件类型: {ext}，仅支持: {', '.join(ALLOWED_EXTENSIONS)}",
            "UNSUPPORTED_EXTENSION"
        )
    
    return clean


def generate_safe_filename(original_filename: str) -> str:
    """
    生成安全的唯一文件名
    
    Args:
        original_filename: 原始文件名
        
    Returns:
        安全的唯一文件名（UUID + 扩展名）
    """
    ext = os.path.splitext(original_filename)[1].lower() if original_filename else '.xlsx'
    if ext not in ALLOWED_EXTENSIONS:
        ext = '.xlsx'  # 默认扩展名
    return f"{uuid.uuid4().hex}{ext}"


def validate_file_size(content: bytes, filename: str = None) -> None:
    """
    验证文件大小
    
    Args:
        content: 文件内容
        filename: 文件名（用于日志）
        
    Raises:
        FileValidationError: 文件大小超限
    """
    size = len(content)
    if size == 0:
        raise FileValidationError("文件内容为空", "EMPTY_FILE")
    
    if size > MAX_FILE_SIZE:
        size_mb = size / (1024 * 1024)
        max_mb = MAX_FILE_SIZE / (1024 * 1024)
        logger.warning(f"文件大小超限: {filename or 'unknown'}, {size_mb:.2f}MB > {max_mb}MB")
        raise FileValidationError(
            f"文件大小超过限制 ({size_mb:.2f}MB > {max_mb}MB)",
            "FILE_TOO_LARGE"
        )


def detect_mime_type(content: bytes) -> Optional[str]:
    """
    检测文件MIME类型（基于魔数）
    
    Args:
        content: 文件内容（前1024字节足够）
        
    Returns:
        MIME类型字符串，如果无法识别则返回None
    """
    if len(content) < 4:
        return None
    
    # 检查常见文件签名
    # XLSX (ZIP格式): 50 4B 03 04 或 50 4B 05 06 或 50 4B 07 08
    if content[:4] in (b'PK\x03\x04', b'PK\x05\x06', b'PK\x07\x08'):
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    
    # XLS (OLE格式): D0 CF 11 E0
    if content[:4] == b'\xD0\xCF\x11\xE0':
        return 'application/vnd.ms-excel'
    
    # CSV/文本: 检查是否为可打印文本
    try:
        sample = content[:512]
        # 尝试解码为UTF-8
        sample.decode('utf-8')
        # 检查是否主要是可打印字符
        printable_ratio = sum(1 for c in sample if 32 <= c < 127 or c in (9, 10, 13)) / len(sample)
        if printable_ratio > 0.85:
            # 检查是否包含CSV特征（逗号或制表符分隔）
            if b',' in sample or b'\t' in sample:
                return 'text/csv'
            return 'text/plain'
    except UnicodeDecodeError:
        pass
    
    return None


def validate_file_content(content: bytes, filename: str = None) -> Tuple[bool, str]:
    """
    验证文件内容安全性
    
    Args:
        content: 文件内容
        filename: 文件名（用于日志）
        
    Returns:
        (是否有效, MIME类型)
        
    Raises:
        FileValidationError: 文件内容无效
    """
    # 验证文件大小
    validate_file_size(content, filename)
    
    # 检测MIME类型
    mime_type = detect_mime_type(content)
    
    if mime_type is None:
        logger.warning(f"无法识别文件类型: {filename}")
        raise FileValidationError(
            "无法识别的文件格式",
            "UNKNOWN_FILE_FORMAT"
        )
    
    if mime_type not in ALLOWED_MIME_TYPES:
        logger.warning(f"不支持的文件类型: {filename}, mime={mime_type}")
        raise FileValidationError(
            f"不支持的文件格式: {mime_type}",
            "UNSUPPORTED_MIME_TYPE"
        )
    
    return True, mime_type


def calculate_file_hash(content: bytes) -> str:
    """
    计算文件SHA256哈希值（用于审计）
    
    Args:
        content: 文件内容
        
    Returns:
        哈希值字符串
    """
    return hashlib.sha256(content).hexdigest()[:32]


@contextmanager
def parsing_timeout(seconds: int = 30):
    """
    解析超时上下文管理器（跨平台支持）
    
    Args:
        seconds: 超时秒数
        
    Note:
        - Unix: 使用 signal.SIGALRM 实现精确超时（可中断阻塞操作）
        - Windows: 使用 watchdog 线程检测超时（在块结束时触发）
    """
    import signal
    
    # Unix 系统优先使用 signal（更高效，可中断阻塞操作）
    if hasattr(signal, 'SIGALRM'):
        def timeout_handler(signum, frame):
            raise TimeoutError(f"文件解析超时 ({seconds}秒)")
        
        old_handler = signal.signal(signal.SIGALRM, timeout_handler)
        signal.alarm(seconds)
        try:
            yield
        finally:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, old_handler)
    else:
        # Windows系统：使用超时检测机制
        import threading
        import time
        
        timeout_event = threading.Event()
        start_time = time.time()
        
        def timeout_watcher():
            """超时监控线程"""
            while not timeout_event.is_set():
                if time.time() - start_time > seconds:
                    timeout_event.set()
                    return
                time.sleep(0.1)
        
        # 启动监控线程
        watcher_thread = threading.Thread(target=timeout_watcher, daemon=True)
        watcher_thread.start()
        
        try:
            yield
        finally:
            # 检查是否已超时
            if timeout_event.is_set():
                raise TimeoutError(f"文件解析超时 ({seconds}秒)")
            timeout_event.set()  # 停止监控线程


def validate_dataframe_size(df: Any) -> None:
    """
    验证DataFrame大小，防止内存耗尽
    
    Args:
        df: pandas DataFrame
        
    Raises:
        FileValidationError: DataFrame过大
    """
    try:
        rows = len(df)
        cols = len(df.columns)
        cells = rows * cols
        
        if rows > MAX_ROWS:
            raise FileValidationError(
                f"行数超过限制 ({rows} > {MAX_ROWS})",
                "TOO_MANY_ROWS"
            )
        
        if cols > MAX_COLS:
            raise FileValidationError(
                f"列数超过限制 ({cols} > {MAX_COLS})",
                "TOO_MANY_COLS"
            )
        
        if cells > MAX_CELLS:
            raise FileValidationError(
                f"单元格数量超过限制 ({cells:,} > {MAX_CELLS:,})",
                "TOO_MANY_CELLS"
            )
    except FileValidationError:
        raise
    except Exception as e:
        logger.warning(f"验证DataFrame大小失败: {e}")


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
    
    安全措施：
    1. 文件名清理（防止路径遍历）
    2. 文件大小验证
    3. MIME类型检测
    4. DataFrame大小限制
    5. 解析超时保护
    
    支持两种格式：
    1. 期权矩阵格式：多行表头，包含 type/term/trader/rate 字段
    2. 简单行情格式：标准列头，包含 stock_code/name/price 等字段
    
    返回解析后的数据列表
    
    Raises:
        FileValidationError: 文件验证失败
    """
    import pandas as pd
    
    # ========== 安全验证 ==========
    # 1. 清理文件名
    safe_filename = sanitize_filename(filename)
    
    # 2. 验证文件内容
    is_valid, mime_type = validate_file_content(content, safe_filename)
    
    # 3. 计算文件哈希（用于审计日志）
    file_hash = calculate_file_hash(content)
    
    logger.info(f"开始解析文件: {safe_filename}, size={len(content)}bytes, hash={file_hash}, mime={mime_type}")
    
    items: List[Dict[str, Any]] = []
    parsing_errors: List[Dict[str, Any]] = []
    
    try:
        # 使用超时保护（仅Unix系统有效）
        with parsing_timeout(seconds=30):
            # 根据文件扩展名选择解析方式
            ext = os.path.splitext(safe_filename)[1].lower()
            
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
                raise FileValidationError(f"不支持的文件格式: {ext}", "UNSUPPORTED_EXTENSION")
            
            if df.empty:
                logger.warning(f"文件为空或无法解析: {safe_filename}")
                return []
            
            # 4. 验证DataFrame大小
            validate_dataframe_size(df)
            
            logger.info(f"解析文件 {safe_filename}, 行数: {len(df)}, 列数: {len(df.columns)}")
            
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
                        parsing_errors.append({"row": idx, "error": str(e)})
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
        
        logger.info(f"文件解析完成: {safe_filename}, 共解析 {len(items)} 条记录, 错误 {len(parsing_errors)} 条")
        
    except FileValidationError:
        # 文件验证错误直接抛出
        raise
    except TimeoutError as e:
        logger.error(f"解析文件超时: {safe_filename}, 错误: {e}")
        raise FileValidationError(f"文件解析超时，请检查文件大小或格式", "PARSE_TIMEOUT")
    except Exception as e:
        logger.error(f"解析文件失败: {safe_filename}, 错误: {e}")
        raise FileValidationError(f"文件解析失败: {str(e)}", "PARSE_ERROR")
    
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


def cleanup_expired_upload_sessions(max_age_hours: int = 24) -> int:
    """
    清理过期的上传会话临时文件
    
    Args:
        max_age_hours: 文件最大保留时间（小时）
        
    Returns:
        清理的文件数量
    """
    cache_dir = _upload_cache_dir()
    if not os.path.exists(cache_dir):
        return 0
    
    max_age_seconds = max_age_hours * 3600
    current_time = time.time()
    cleaned_count = 0
    
    try:
        for filename in os.listdir(cache_dir):
            if not filename.endswith('.json'):
                continue
            
            filepath = os.path.join(cache_dir, filename)
            try:
                file_age = current_time - os.path.getmtime(filepath)
                if file_age > max_age_seconds:
                    os.remove(filepath)
                    cleaned_count += 1
                    logger.debug(f"清理过期上传会话: {filename}")
            except Exception as e:
                logger.warning(f"清理文件失败 {filename}: {e}")
                
        if cleaned_count > 0:
            logger.info(f"清理了 {cleaned_count} 个过期上传会话文件")
    except Exception as e:
        logger.error(f"清理上传缓存目录失败: {e}")
    
    return cleaned_count


# 启动时自动清理过期文件（静默执行）
def _init_cleanup():
    """初始化时执行一次清理"""
    try:
        cleanup_expired_upload_sessions(max_age_hours=1)
    except Exception:
        pass

_init_cleanup()
