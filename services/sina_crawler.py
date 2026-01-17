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
        # 使用 akshare 获取所有 A 股实时行情，从中提取代码
        df = ak.stock_zh_a_spot_em()
        if df.empty:
            return []
        codes = df["代码"].tolist()
        logger.info(f"成功获取 {len(codes)} 条 A 股股票代码")
        return codes
    except Exception as e:
        logger.error(f"获取 A 股列表失败: {e}")
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
