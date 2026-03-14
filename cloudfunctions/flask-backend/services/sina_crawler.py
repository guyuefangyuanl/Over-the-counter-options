# import akshare as ak  # 云托管环境暂不需要
from typing import Any, Dict, List, Optional, Sequence, Tuple
import logging

from sina_quotes import SinaQuote, fetch_sina_quotes

logger = logging.getLogger(__name__)


def get_all_stock_codes() -> List[str]:
    """获取所有 A 股股票代码（云托管环境返回模拟数据）"""
    logger.info("返回模拟股票代码列表")
    return ["000001", "000002", "000333", "000858", "002415", "002594", "300750", "600000", "600519", "601318"]


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
