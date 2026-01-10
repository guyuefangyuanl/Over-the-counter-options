from typing import Any, Dict, List, Optional, Sequence, Tuple

from sina_quotes import SinaQuote, fetch_sina_quotes


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
