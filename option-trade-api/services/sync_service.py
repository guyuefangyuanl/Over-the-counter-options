import os
import time
import hashlib
import re
from typing import Any, Dict, List, Optional, Sequence, Callable

from services.cloud_db import CloudDbClient, CloudDbConfigError, CloudDbRequestError
from services.sina_crawler import crawl_quotes, get_all_stock_codes


def _utc_now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _parse_codes(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        out: List[str] = []
        for x in value:
            if x is None:
                continue
            s = str(x).strip()
            if s:
                out.append(s)
        return out
    raw = str(value).strip()
    if not raw:
        return []
    parts = [p.strip() for p in raw.replace(";", ",").replace(" ", ",").split(",")]
    return [p for p in parts if p]


def _default_codes_from_env() -> List[str]:
    raw = os.getenv("SINA_DEFAULT_CODES") or os.getenv("DEFAULT_QUOTE_CODES") or ""
    codes = _parse_codes(raw)
    if codes:
        return codes
    return ["600519", "000001"]


def _build_quote_doc(item: Dict[str, Any], *, source: str) -> Dict[str, Any]:
    stock_code = str(item.get("stock_code") or "").strip()
    out: Dict[str, Any] = dict(item)
    out["stock_code"] = stock_code
    out["code"] = stock_code
    out["updateSource"] = source
    out["updated_at"] = out.get("updated_at") or _utc_now_iso()
    out.setdefault("name", "")
    return out


def _shard_codes(codes: Sequence[str], *, shard_index: int, shard_count: int) -> List[str]:
    if shard_count <= 1:
        return list(codes)
    si = int(shard_index)
    sc = int(shard_count)
    if si < 0 or sc < 1 or si >= sc:
        return list(codes)

    selected: List[str] = []
    for c in codes:
        s = str(c).strip()
        if not s:
            continue
        h = hashlib.md5(s.encode("utf-8")).hexdigest()
        if (int(h, 16) % sc) == si:
            selected.append(s)
    return selected


def sync_quotes(
    *,
    codes: Optional[Sequence[str]] = None,
    requested_by: Optional[str] = None,
    source: str = "crawler_sina",
    timeout: float = 8.0,
    max_workers: Optional[int] = None,
    shard_index: Optional[int] = None,
    shard_count: Optional[int] = None,
) -> Dict[str, Any]:
    started_at = time.time()
    cloud = None
    try:
        cloud = CloudDbClient.from_env()
    except CloudDbConfigError:
        import logging
        logging.getLogger(__name__).warning("微信云数据库配置未就绪，将尝试同步到本地 Mock 存储")

    target_codes = list(codes) if codes else _default_codes_from_env()

    if shard_index is None and shard_count is None:
        raw_si = os.getenv("SINA_SHARD_INDEX") or ""
        raw_sc = os.getenv("SINA_SHARD_COUNT") or ""
        if raw_si.strip() and raw_sc.strip():
            try:
                shard_index = int(raw_si)
                shard_count = int(raw_sc)
            except Exception:
                shard_index = None
                shard_count = None
    if shard_index is not None and shard_count is not None:
        target_codes = _shard_codes(target_codes, shard_index=int(shard_index), shard_count=int(shard_count))

    def _load_int_env(name: str, default: int) -> int:
        raw = os.getenv(name) or ""
        if not raw.strip():
            return int(default)
        try:
            return int(raw)
        except Exception:
            return int(default)

    crawl_retries = max(0, _load_int_env("SINA_FETCH_RETRIES", 3))
    crawl_chunk_size = _load_int_env("SINA_FETCH_CHUNK_SIZE", 50)
    if crawl_chunk_size < 1:
        crawl_chunk_size = 1
    if crawl_chunk_size > 200:
        crawl_chunk_size = 200

    crawl_max_workers_raw = os.getenv("SINA_FETCH_MAX_WORKERS") or ""
    crawl_max_workers: Optional[int] = None
    if crawl_max_workers_raw.strip():
        try:
            crawl_max_workers = int(crawl_max_workers_raw)
        except Exception:
            crawl_max_workers = None

    if max_workers is not None:
        crawl_max_workers = int(max_workers)

    crawl_t0 = time.time()
    items, crawl_errors = crawl_quotes(
        target_codes,
        timeout=timeout,
        retries=crawl_retries,
        chunk_size=crawl_chunk_size,
        max_workers=crawl_max_workers,
    )
    crawl_ms = int((time.time() - crawl_t0) * 1000)

    now_iso = _utc_now_iso()
    docs: List[Dict[str, Any]] = []
    for it in items:
        doc = _build_quote_doc(it, source=source)
        doc["updated_at"] = now_iso
        docs.append(doc)

    processed = 0
    upsert_errors: List[Dict[str, Any]] = []
    upsert_ms = 0

    if cloud:
        try:
            upsert_t0 = time.time()
            processed, upsert_errors = cloud.batch_upsert(
                collection="quotes",
                unique_key="code",
                items=docs,
                chunk_size=_load_int_env("WX_DB_UPSERT_CHUNK_SIZE", 100),
                max_workers=max_workers,
            )
            upsert_ms = int((time.time() - upsert_t0) * 1000)
        except CloudDbRequestError as e:
            upsert_errors.append({"code": "CLOUD_DB_WRITE_FAILED", "message": str(e)})
            upsert_ms = 0
    else:
        # 回退到本地 Mock 存储
        try:
            from sina_quotes import SinaQuote, upsert_quotes_to_mock_db
            quotes_objs = []
            for d in docs:
                # 转换回 SinaQuote 对象以便复用现有逻辑
                q = SinaQuote(
                    stock_code=d.get("stock_code"),
                    name=d.get("name"),
                    price=d.get("price"),
                    change_percent=d.get("changePercent"),
                    open=d.get("open"),
                    high=d.get("high"),
                    low=d.get("low"),
                    pre_close=d.get("pre_close"),
                    volume=d.get("volume"),
                    amount=d.get("amount"),
                    updated_at=d.get("updated_at")
                )
                quotes_objs.append(q)
            
            mock_db_path = os.getenv("FILE_DB_PATH", "mock_db.json")
            upsert_quotes_to_mock_db(quotes_objs, file_path=mock_db_path)
            processed = len(quotes_objs)
            logger.info(f"成功同步 {processed} 条行情到本地 Mock 存储: {mock_db_path}")
        except Exception as e:
            upsert_errors.append({"code": "MOCK_DB_WRITE_FAILED", "message": str(e)})

    duration_ms = int((time.time() - started_at) * 1000)
    errors = list(crawl_errors) + list(upsert_errors)

    if cloud:
        try:
            cloud.add(
                collection="sync_logs",
                data={
                    "type": "sync_quotes",
                    "source": source,
                    "requested_by": requested_by or "",
                    "codes": target_codes,
                    "fetched": len(items),
                    "processed": processed,
                    "crawlMs": crawl_ms,
                    "upsertMs": upsert_ms,
                    "crawlErrorCount": len(crawl_errors),
                    "upsertErrorCount": len(upsert_errors),
                    "shardIndex": int(shard_index) if shard_index is not None else None,
                    "shardCount": int(shard_count) if shard_count is not None else None,
                    "errorCount": len(errors),
                    "errors": errors[:50],
                    "durationMs": duration_ms,
                    "created_at": now_iso,
                },
            )
        except Exception:
            pass

    return {
        "success": len(errors) == 0,
        "processed": processed,
        "fetched": len(items),
        "codes": target_codes,
        "errors": errors,
        "durationMs": duration_ms,
        "crawlMs": crawl_ms,
        "upsertMs": upsert_ms,
        "crawlErrorCount": len(crawl_errors),
        "upsertErrorCount": len(upsert_errors),
        "shardIndex": int(shard_index) if shard_index is not None else None,
        "shardCount": int(shard_count) if shard_count is not None else None,
    }


def sync_all_quotes(
    *,
    requested_by: Optional[str] = None,
    source: str = "crawler_sina_all",
    timeout: float = 15.0,
    max_workers: Optional[int] = None,
) -> Dict[str, Any]:
    """
    抓取并同步所有股票的行情数据
    """
    codes = get_all_stock_codes()
    if not codes:
        return {
            "success": False,
            "message": "未能获取到股票代码列表",
            "processed": 0,
        }

    return sync_quotes(
        codes=codes,
        requested_by=requested_by,
        source=source,
        timeout=timeout,
        max_workers=max_workers,
    )


def clean_and_validate_item(item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """验证并清洗单条记录"""
    try:
        # 1. 股票代码标准化
        stock_code = str(item.get("stock_code") or "").strip()
        if not stock_code or not stock_code.isdigit():
            # 尝试从 code 字段恢复，某些情况下 code 可能包含 stock_code
            if not stock_code and item.get("code") and item.get("code").isdigit():
                stock_code = item.get("code")
            else:
                return None
        
        if len(stock_code) < 6:
            stock_code = stock_code.zfill(6)
        elif len(stock_code) > 6:
            stock_code = stock_code[:6]
            
        # 2. 判断记录类型：期权矩阵 or 标准行情
        is_option = all(item.get(k) for k in ("trader", "term", "type"))
        
        if is_option:
            # 期权矩阵处理
            rate = item.get("rate")
            if rate is None:
                return None
            try:
                rate = round(float(rate), 6)
                if rate < 0: return None
            except (ValueError, TypeError):
                return None
                
            clean_item = {
                "stock_code": stock_code,
                "name": str(item.get("name") or "").strip(),
                "type": str(item.get("type")).strip(),
                "term": str(item.get("term")).strip(),
                "trader": str(item.get("trader")).strip(),
                "rate": rate,
                "updated_at": item.get("updated_at") or _utc_now_iso(),
            }
            
            safe_trader = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fa5]", "", clean_item["trader"])
            safe_term = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fa5]", "", clean_item["term"])
            clean_item["code"] = f"opt_{stock_code}_{clean_item['type']}_{safe_term}_{safe_trader}"
            return clean_item
        else:
            # 标准行情处理
            clean_item = {
                "stock_code": stock_code,
                "code": stock_code, # 标准行情 code 就是股票代码
                "name": str(item.get("name") or "").strip(),
                "updated_at": item.get("updated_at") or _utc_now_iso(),
            }
            
            # 复制数值字段
            for k in ("price", "changePercent", "open", "high", "low", "pre_close", "volume", "amount"):
                if item.get(k) is not None:
                    try:
                        clean_item[k] = float(item[k])
                    except (ValueError, TypeError):
                        pass
            
            return clean_item
    except Exception:
        return None

def upsert_quotes_from_file(
    *,
    items: Sequence[Dict[str, Any]],
    requested_by: Optional[str] = None,
    source: str = "file_upload",
    progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    max_workers: Optional[int] = None
) -> Dict[str, Any]:
    started_at = time.time()
    
    def report_progress(step: str, current: int, total: int, status: str = "processing", extra: Dict = None):
        if progress_callback:
            data = {
                "step": step,
                "current": current,
                "total": total,
                "percent": int(current * 100 / total) if total > 0 else 0,
                "status": status
            }
            if extra: data.update(extra)
            progress_callback(data)

    try:
        cloud = CloudDbClient.from_env()
    except CloudDbConfigError as e:
        return {
            "success": False,
            "message": str(e),
            "processed": 0,
            "errors": [{"code": "CLOUD_DB_NOT_CONFIGURED", "message": str(e)}],
        }

    total_count = len(items)
    now_iso = _utc_now_iso()
    
    # 第一阶段：数据清洗（并行化）
    report_progress("cleaning", 0, total_count, status="processing")
    cleaned_docs: List[Dict[str, Any]] = []
    invalid_count = 0
    
    # 使用 ThreadPoolExecutor 并行清洗数据
    from concurrent.futures import ThreadPoolExecutor, as_completed
    max_clean_workers = min(8, os.cpu_count() or 4)
    
    def _clean_batch(batch_items):
        local_cleaned = []
        local_invalid = 0
        for it in batch_items:
            clean_doc = clean_and_validate_item(it)
            if clean_doc:
                clean_doc["updateSource"] = source
                local_cleaned.append(clean_doc)
            else:
                local_invalid += 1
        return local_cleaned, local_invalid
    
    batch_size = max(100, len(items) // max_clean_workers)
    clean_batches = [items[i:i+batch_size] for i in range(0, len(items), batch_size)]
    
    with ThreadPoolExecutor(max_workers=max_clean_workers) as executor:
        clean_futures = [executor.submit(_clean_batch, batch) for batch in clean_batches]
        processed_items = 0
        for fut in as_completed(clean_futures):
            batch_cleaned, batch_invalid = fut.result()
            cleaned_docs.extend(batch_cleaned)
            invalid_count += batch_invalid
            processed_items += len(batch_cleaned) + batch_invalid
            if processed_items % 500 == 0 or processed_items == total_count:
                report_progress("cleaning", processed_items, total_count, extra={"invalid": invalid_count})

    # 第二阶段：入库处理
    if not cleaned_docs:
        duration_ms = int((time.time() - started_at) * 1000)
        result = {
            "success": False,
            "processed": 0,
            "valid": 0,
            "invalid": invalid_count,
            "count": total_count,
            "errors": [{"code": "NO_VALID_DATA", "message": "未解析出任何有效记录，请检查文件格式或必填字段"}],
            "durationMs": duration_ms,
        }
        report_progress("failed", total_count, total_count, status="failed", extra=result)
        return result

    report_progress("ingesting", 0, len(cleaned_docs), status="processing")
    processed = 0
    errors: List[Dict[str, Any]] = []
    
    try:
        # 直接利用 cloud.batch_upsert 的并行处理能力，不再手动分批
        # 这允许 batch_upsert 内部更有效地管理连接池和 QPS
        chunk_size = int(os.getenv("WX_DB_UPSERT_CHUNK_SIZE") or "100")
        processed, batch_errors = cloud.batch_upsert(
            collection="quotes",
            unique_key="code",
            items=cleaned_docs,
            chunk_size=chunk_size,
            max_workers=max_workers,
        )
        errors.extend(batch_errors)
        
        report_progress("ingesting", len(cleaned_docs), len(cleaned_docs), extra={"success": processed, "failed": len(errors)})

    except Exception as e:
        errors.append({"code": "CLOUD_DB_WRITE_FAILED", "message": str(e)})

    duration_ms = int((time.time() - started_at) * 1000)
    
    # 记录同步日志
    try:
        cloud.add(
            collection="sync_logs",
            data={
                "type": "upload_quotes",
                "source": source,
                "requested_by": requested_by or "",
                "count": total_count,
                "validCount": len(cleaned_docs),
                "processed": processed,
                "errorCount": len(errors),
                "errors": errors[:50],
                "durationMs": duration_ms,
                "created_at": now_iso,
            },
        )
    except Exception:
        pass

    result = {
        "success": len(errors) == 0,
        "processed": processed,
        "valid": len(cleaned_docs),
        "invalid": invalid_count,
        "count": total_count,
        "errors": errors,
        "durationMs": duration_ms,
    }
    
    report_progress("completed", total_count, total_count, status="success", extra=result)
    return result


def delete_quotes(*, codes: Optional[Sequence[str]] = None, progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None) -> Dict[str, Any]:
    started_at = time.time()
    cloud = None
    try:
        cloud = CloudDbClient.from_env()
    except CloudDbConfigError:
        pass

    try:
        import json
        if cloud:
            if codes:
                target_codes = _parse_codes(codes)
                if not target_codes:
                    return {"success": True, "deleted": 0, "durationMs": int((time.time() - started_at) * 1000)}
                total_deleted = 0
                total_count = len(target_codes)
                
                # 优化：使用更大的批次（从 500 改为 2000）
                batch_size = 2000
                for i, batch in enumerate([target_codes[j : j + batch_size] for j in range(0, len(target_codes), batch_size)]):
                    where_js = "{" + f'"stock_code": db.command.in({json.dumps(batch)})' + "}"
                    deleted = cloud.delete_where(collection="quotes", where_js=where_js)
                    total_deleted += int(deleted or 0)
                    
                    if progress_callback:
                        progress_callback({
                            "deleted": total_deleted,
                            "total": total_count,
                            "percent": int(total_deleted * 100 / total_count) if total_count > 0 else 100,
                            "status": "processing"
                        })

                return {
                    "success": True,
                    "deleted": total_deleted,
                    "durationMs": int((time.time() - started_at) * 1000),
                }

            # 清空所有数据的高性能逻辑 - 使用并行删除
            total_deleted = 0
            batch_size = 1000  # 微信云数据库单次删除限制
            max_iterations = 1000
            consecutive_empty = 0
            last_progress_update = time.time()
            
            # 使用并行删除加速（4个并行线程）
            max_parallel_deletes = 4
            executor = ThreadPoolExecutor(max_workers=max_parallel_deletes)
            pending_futures = []
            
            try:
                for attempt in range(max_iterations):
                    # 查询下一批待删除的 ID
                    rows = cloud.query(f'db.collection("quotes").field({{_id: true}}).limit({batch_size}).get()')
                    
                    if not rows or len(rows) == 0:
                        consecutive_empty += 1
                        if consecutive_empty >= 2:
                            break
                        time.sleep(0.1)
                        continue
                    
                    consecutive_empty = 0
                    batch_ids = [str(r.get("_id")).strip() for r in rows if isinstance(r, dict) and r.get("_id")]
                    batch_ids = list(dict.fromkeys(batch_ids))
                    
                    if not batch_ids:
                        break

                    # 提交删除任务到线程池（并行执行）
                    def _delete_batch(ids_batch):
                        try:
                            where_js = "{" + f'"_id": db.command.in({json.dumps(ids_batch)})' + "}"
                            deleted = cloud.delete_where(collection="quotes", where_js=where_js)
                            return int(deleted or 0)
                        except Exception as e:
                            import logging
                            logging.getLogger(__name__).warning(f"删除批次失败: {e}")
                            return 0

                    future = executor.submit(_delete_batch, batch_ids)
                    pending_futures.append(future)
                    
                    # 如果待处理任务过多，等待一些完成
                    if len(pending_futures) >= max_parallel_deletes:
                        done_future = next(as_completed(pending_futures))
                        deleted_count = done_future.result()
                        total_deleted += deleted_count
                        pending_futures.remove(done_future)
                        
                        # 定期更新进度（每 2 秒）
                        now = time.time()
                        if now - last_progress_update >= 2.0 and progress_callback:
                            last_progress_update = now
                            percent = min(99, int(total_deleted / 100)) if total_deleted > 0 else 0
                            progress_callback({
                                "deleted": total_deleted,
                                "total": total_deleted + batch_size,
                                "percent": percent,
                                "status": "processing"
                            })
                
                # 等待所有待处理任务完成
                for future in as_completed(pending_futures):
                    deleted_count = future.result()
                    total_deleted += deleted_count
                    
            finally:
                executor.shutdown(wait=True)
            
            if progress_callback:
                progress_callback({
                    "deleted": total_deleted,
                    "total": total_deleted,
                    "percent": 100,
                    "status": "processed"
                })

            return {
                "success": True,
                "deleted": total_deleted,
                "durationMs": int((time.time() - started_at) * 1000),
                "message": f"已清空 {total_deleted} 条记录"
            }
        else:
            # 回退到本地存储删除
            from models.stock import StockModel
            from flask import current_app
            
            db = None
            try:
                db = getattr(current_app, 'db', None)
            except Exception:
                pass
                
            model = StockModel(db)
            target_codes = _parse_codes(codes) if codes else None
            deleted = model.delete_stock_data(target_codes)
            
            return {
                "success": True,
                "deleted": deleted,
                "durationMs": int((time.time() - started_at) * 1000),
                "message": "已从本地存储删除记录"
            }
    except Exception as e:
        return {"success": False, "message": str(e), "durationMs": int((time.time() - started_at) * 1000)}
