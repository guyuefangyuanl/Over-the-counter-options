import akshare as ak
from typing import Any, Dict, List, Optional, Sequence, Tuple
import logging

from sina_quotes import SinaQuote, fetch_sina_quotes

logger = logging.getLogger(__name__)


def get_all_stock_codes() -> List[str]:
    """
    获取所有 A 股股票代码
    """
    try:
        # 尝试 1: 使用 akshare 获取所有 A 股实时行情 (东财接口)
        logger.info("正在尝试从 ak.stock_zh_a_spot_em 获取股票列表...")
        df = ak.stock_zh_a_spot_em()
        if not df.empty:
            codes = df["代码"].tolist()
            logger.info(f"成功获取 {len(codes)} 条 A 股股票代码 (source: spot_em)")
            return codes
    except Exception as e:
        logger.warning(f"从 stock_zh_a_spot_em 获取 A 股列表失败: {e}")

    try:
        # 尝试 2: 使用备用接口 (证券代码和简称)
        logger.info("正在尝试从 ak.stock_info_a_code_name 获取股票列表...")
        df = ak.stock_info_a_code_name()
        if not df.empty:
            codes = df["code"].tolist()
            logger.info(f"成功获取 {len(codes)} 条 A 股股票代码 (source: code_name)")
            return codes
    except Exception as e:
        logger.error(f"从 stock_info_a_code_name 获取 A 股列表失败: {e}")

    return []


def _is_suspended(q: SinaQuote) -> bool:
    if q.price in (None, 0) and q.volume in (None, 0):
        return True
    return False


def crawl_quotes(
    codes: Sequence[str],
    *,
    timeout: float = 8.0,
    retries: int = 3,
    chunk_size: int = 50,
    max_workers: Optional[int] = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    quotes, errors = fetch_sina_quotes(
        codes,
        timeout=timeout,
        retries=retries,
        chunk_size=chunk_size,
        max_workers=max_workers,
    )
    items: List[Dict[str, Any]] = []
    for q in quotes:
        if _is_suspended(q):
            continue
        items.append(q.to_admin_stock_item())
    return items, errors
