import argparse
import json
import os
import re
import sys
import time
import random
from dataclasses import dataclass
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import requests


_LINE_RE = re.compile(r'^var\s+hq_str_(?P<fullcode>[a-z]{2}\d{6})="(?P<payload>.*)";\s*$')


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _is_six_digit(code: str) -> bool:
    return bool(re.fullmatch(r"\d{6}", code))


def _normalize_fullcode(code: str) -> Optional[str]:
    raw = str(code).strip().lower()
    if raw.startswith(("sh", "sz")) and len(raw) == 8 and raw[2:].isdigit():
        return raw
    if not _is_six_digit(raw):
        return None
    if raw.startswith("6"):
        return f"sh{raw}"
    if raw.startswith(("0", "3")):
        return f"sz{raw}"
    return None


def _chunked(items: Sequence[str], chunk_size: int) -> Iterable[List[str]]:
    if chunk_size <= 0:
        yield list(items)
        return
    for i in range(0, len(items), chunk_size):
        yield list(items[i : i + chunk_size])


def _safe_float(value: str) -> Optional[float]:
    try:
        v = float(value)
        if v != v:
            return None
        return v
    except Exception:
        return None


def _safe_int(value: str) -> Optional[int]:
    try:
        return int(float(value))
    except Exception:
        return None


@dataclass(frozen=True)
class SinaQuote:
    stock_code: str
    name: str
    price: Optional[float]
    change_percent: Optional[float]
    open: Optional[float]
    high: Optional[float]
    low: Optional[float]
    pre_close: Optional[float]
    volume: Optional[int]
    amount: Optional[float]
    updated_at: str
    date: Optional[str] = None
    time: Optional[str] = None

    def to_admin_stock_item(self) -> Dict[str, Any]:
        out: Dict[str, Any] = {
            "stock_code": self.stock_code,
            "code": self.stock_code,
            "name": self.name,
            "price": self.price,
            "changePercent": self.change_percent,
            "change_percent": self.change_percent,
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "pre_close": self.pre_close,
            "volume": self.volume,
            "amount": self.amount,
            "updateSource": "crawler_sina",
            "updated_at": self.updated_at,
        }
        return {k: v for k, v in out.items() if v is not None}


def parse_sina_hq(raw_text: str) -> Dict[str, List[str]]:
    result: Dict[str, List[str]] = {}
    for line in raw_text.splitlines():
        line = line.strip()
        if not line:
            continue
        m = _LINE_RE.match(line)
        if not m:
            continue
        fullcode = m.group("fullcode")
        payload = m.group("payload")
        fields = payload.split(",") if payload else []
        result[fullcode] = fields
    return result


def _fields_to_quote(fullcode: str, fields: Sequence[str]) -> Optional[SinaQuote]:
    if not fullcode.startswith(("sh", "sz")) or len(fullcode) != 8:
        return None
    stock_code = fullcode[2:]
    name = (fields[0].strip() if len(fields) > 0 else "") or ""
    if name == "":
        return None

    open_ = _safe_float(fields[1]) if len(fields) > 1 else None
    pre_close = _safe_float(fields[2]) if len(fields) > 2 else None
    price = _safe_float(fields[3]) if len(fields) > 3 else None
    high = _safe_float(fields[4]) if len(fields) > 4 else None
    low = _safe_float(fields[5]) if len(fields) > 5 else None
    volume = _safe_int(fields[8]) if len(fields) > 8 else None
    amount = _safe_float(fields[9]) if len(fields) > 9 else None
    date = fields[30].strip() if len(fields) > 30 and fields[30].strip() else None
    tm = fields[31].strip() if len(fields) > 31 and fields[31].strip() else None

    change_percent: Optional[float] = None
    if price is not None and pre_close not in (None, 0):
        change_percent = round((price - float(pre_close)) / float(pre_close) * 100.0, 4)

    return SinaQuote(
        stock_code=stock_code,
        name=name,
        price=price,
        change_percent=change_percent,
        open=open_,
        high=high,
        low=low,
        pre_close=pre_close,
        volume=volume,
        amount=amount,
        updated_at=_utc_now_iso(),
        date=date,
        time=tm,
    )


def fetch_sina_quotes(
    codes: Sequence[str],
    *,
    timeout: float = 8.0,
    retries: int = 2,
    chunk_size: int = 50,
    max_workers: Optional[int] = None,
    session: Optional[requests.Session] = None,
) -> Tuple[List[SinaQuote], List[Dict[str, Any]]]:
    normalized: List[str] = []
    for c in codes:
        fc = _normalize_fullcode(c)
        if fc is None:
            continue
        normalized.append(fc)
    normalized = sorted(set(normalized))

    if not normalized:
        return [], [{"code": "NO_VALID_CODES", "message": "未提供有效股票代码"}]

    url_base = "http://hq.sinajs.cn/list="
    headers = {
        "Referer": "https://finance.sina.com.cn",
        "User-Agent": "Mozilla/5.0",
    }

    quotes: List[SinaQuote] = []
    errors: List[Dict[str, Any]] = []

    batches = list(_chunked(normalized, chunk_size))

    def _resolve_max_workers() -> int:
        raw = os.getenv("SINA_FETCH_MAX_WORKERS") or ""
        env_workers: Optional[int] = None
        if raw.strip():
            try:
                env_workers = int(raw)
            except Exception:
                env_workers = None
        requested = max_workers if max_workers is not None else env_workers
        if requested is None:
            requested = 4
        try:
            requested = int(requested)
        except Exception:
            requested = 4
        return max(1, min(int(requested), len(batches)))

    def _fetch_batch(batch: List[str]) -> Tuple[List[SinaQuote], List[Dict[str, Any]]]:
        batch_quotes: List[SinaQuote] = []
        batch_errors: List[Dict[str, Any]] = []

        query = ",".join(batch)
        url = f"{url_base}{query}"

        sess_local = session or requests.Session()

        last_err: Optional[str] = None
        for attempt in range(max(0, retries) + 1):
            try:
                if attempt == 0:
                    time.sleep(random.random() * 0.05)
                resp = sess_local.get(url, headers=headers, timeout=timeout)
                resp.raise_for_status()
                # 使用 gb18030 解码，比 gbk 更全面，减少乱码
                raw_text = resp.content.decode("gb18030", errors="replace")
                parsed = parse_sina_hq(raw_text)
                for fullcode, fields in parsed.items():
                    q = _fields_to_quote(fullcode, fields)
                    if q is not None:
                        batch_quotes.append(q)
                return batch_quotes, batch_errors
            except Exception as e:
                last_err = str(e)
                if attempt < max(0, retries):
                    time.sleep(min(2.0, 0.3 * (2**attempt)) + random.random() * 0.05)
                    continue
        batch_errors.append({"code": "FETCH_FAILED", "message": last_err or "请求失败", "url": url})
        return batch_quotes, batch_errors

    workers = _resolve_max_workers()
    if workers <= 1 or len(batches) <= 1:
        for batch in batches:
            bq, be = _fetch_batch(batch)
            quotes.extend(bq)
            errors.extend(be)
    else:
        with ThreadPoolExecutor(max_workers=workers) as ex:
            futs = [ex.submit(_fetch_batch, batch) for batch in batches]
            for fut in as_completed(futs):
                bq, be = fut.result()
                quotes.extend(bq)
                errors.extend(be)

    return quotes, errors


def _load_json_file(file_path: str) -> Dict[str, Any]:
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _write_json_file(file_path: str, data: Dict[str, Any]) -> None:
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def upsert_quotes_to_mock_db(quotes: Sequence[SinaQuote], *, file_path: str) -> Dict[str, Any]:
    db = _load_json_file(file_path)
    stocks = db.get("stocks")
    if not isinstance(stocks, list):
        stocks = []

    now_iso = _utc_now_iso()
    by_code: Dict[str, Dict[str, Any]] = {}
    for item in stocks:
        if isinstance(item, dict) and item.get("stock_code") is not None:
            by_code[str(item.get("stock_code"))] = item

    for q in quotes:
        existing = by_code.get(q.stock_code)
        update_item = q.to_admin_stock_item()
        if existing is None:
            update_item["created_at"] = now_iso
            stocks.append(update_item)
            by_code[q.stock_code] = update_item
        else:
            if "created_at" not in existing:
                existing["created_at"] = now_iso
            existing.update(update_item)

    db["stocks"] = stocks
    _write_json_file(file_path, db)
    return db


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--codes", nargs="+")
    parser.add_argument("--all", action="store_true", help="抓取全量 A 股行情")
    parser.add_argument("--timeout", type=float, default=8.0)
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--chunk-size", type=int, default=50)
    parser.add_argument("--update-mock-db", action="store_true")
    parser.add_argument("--mock-db-path", default=os.getenv("FILE_DB_PATH", "mock_db.json"))
    args = parser.parse_args(list(argv) if argv is not None else None)

    target_codes = args.codes or []
    code_name_map = {}
    if args.all:
        try:
            import akshare as ak
            df = ak.stock_zh_a_spot_em()
            if not df.empty:
                target_codes = df["代码"].tolist()
                # 记录代码到名称的映射，作为新浪解析乱码时的回退
                for _, row in df.iterrows():
                    code_name_map[str(row["代码"])] = str(row["名称"])
        except Exception as e:
            sys.stderr.write(f"获取全量代码失败: {e}\n")
            return 1

    if not target_codes:
        sys.stderr.write("未提供股票代码且未指定 --all\n")
        return 1

    quotes, errors = fetch_sina_quotes(
        target_codes,
        timeout=args.timeout,
        retries=args.retries,
        chunk_size=args.chunk_size,
    )

    # 修复可能存在的乱码名称
    final_quotes = []
    for q in quotes:
        # 如果名称包含乱码（通过检测是否包含特殊字符或利用 akshare 映射回退）
        if q.stock_code in code_name_map:
            # 重新创建一个带有正确名称的对象
            new_q = SinaQuote(
                stock_code=q.stock_code,
                name=code_name_map[q.stock_code],
                price=q.price,
                change_percent=q.change_percent,
                open=q.open,
                high=q.high,
                low=q.low,
                pre_close=q.pre_close,
                volume=q.volume,
                amount=q.amount,
                updated_at=q.updated_at,
                date=q.date,
                time=q.time
            )
            final_quotes.append(new_q)
        else:
            final_quotes.append(q)

    payload: Dict[str, Any] = {
        "success": len(errors) == 0,
        "data": [q.to_admin_stock_item() for q in final_quotes],
        "errors": errors,
    }

    if args.update_mock_db:
        db = upsert_quotes_to_mock_db(final_quotes, file_path=args.mock_db_path)
        payload["mock_db_path"] = args.mock_db_path
        payload["mock_db_stock_count"] = len(db.get("stocks") or [])

    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.write("\n")
    return 0 if payload["success"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
