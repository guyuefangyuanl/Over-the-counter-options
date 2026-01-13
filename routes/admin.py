# -*- coding: utf-8 -*-
from flask import Blueprint, request, current_app
import logging
import os
import time
import uuid
from utils.response import flask_success_response, flask_error_response, flask_paginated_response
from models.stock import StockModel
from models.inquiry import InquiryModel
from models.order import OrderModel
from routes.auth import require_auth, require_roles
from services.cloud_db import CloudDbClient, CloudDbConfigError, CloudDbRequestError
from services.file_parser import (
    create_upload_session,
    delete_upload_session,
    load_upload_session,
    parse_quotes_file,
    load_upload_session_payload,
    save_upload_session_payload,
)
from services.sync_service import sync_quotes, upsert_quotes_from_file, delete_quotes, sync_all_quotes

logger = logging.getLogger(__name__)
admin_bp = Blueprint('admin', __name__)

def _parse_int(value, default: int) -> int:
    if value is None:
        return default
    try:
        return int(value)
    except Exception:
        return default


def _parse_pagination():
    page = _parse_int(request.args.get('page'), 1)
    page_size = _parse_int(request.args.get('pageSize'), 20)

    if page < 1:
        return None, flask_error_response("page 必须为正整数", 400)
    if page_size < 1 or page_size > 200:
        return None, flask_error_response("pageSize 必须为 1-200", 400)

    return {"page": page, "page_size": page_size}, None


@admin_bp.route('/stats', methods=['GET'])
@require_auth
def get_stats():
    """管理后台：获取统计数据"""
    try:
        db = getattr(current_app, 'db', None)
        if not db:
            stock_model = StockModel(None)
            return flask_success_response(
                data={
                    "stockCount": stock_model.count_stocks(),
                    "inquiryCount": 0,
                    "pendingInquiryCount": 0,
                    "orderCount": 0
                },
                message="数据库未连接，返回默认统计数据"
            )
            
        stock_model = StockModel(db)
        inquiry_model = InquiryModel(db)
        order_model = OrderModel(db)
        
        # 获取统计信息
        stock_count = stock_model.collection.count_documents({})
        inquiry_count = inquiry_model.collection.count_documents({})
        pending_inquiry_count = inquiry_model.collection.count_documents({"status": "pending"})
        order_count = order_model.collection.count_documents({})
        
        return flask_success_response(data={
            "stockCount": stock_count,
            "inquiryCount": inquiry_count,
            "pendingInquiryCount": pending_inquiry_count,
            "orderCount": order_count
        })
    except Exception as e:
        logger.error(f"获取统计数据失败: {e}")
        return flask_error_response(str(e), 500)

@admin_bp.route('/orders', methods=['GET'])
@require_auth
def get_orders():
    """管理后台：获取订单列表"""
    try:
        pagination, err = _parse_pagination()
        if err:
            return err

        db = getattr(current_app, 'db', None)
        if not db:
            return flask_success_response(data=[], message="数据库未连接，返回空订单列表")
            
        order_model = OrderModel(db)
        page = pagination["page"]
        page_size = pagination["page_size"]

        orders = order_model.get_orders(limit=page_size, skip=(page - 1) * page_size)
        total = order_model.collection.count_documents({})
        return flask_paginated_response(
            data=orders,
            page=page,
            per_page=page_size,
            total=total,
        )
    except Exception as e:
        logger.error(f"获取订单列表失败: {e}")
        return flask_error_response(str(e), 500)

@admin_bp.route('/quotes', methods=['GET'])
@require_auth
def get_quotes():
    """管理后台：获取报价列表"""
    try:
        pagination, err = _parse_pagination()
        if err:
            return err
        page = pagination["page"]
        page_size = pagination["page_size"]
        skip = (page - 1) * page_size

        try:
            cloud = CloudDbClient.from_env()
            stocks = cloud.query(
                f'db.collection("quotes").orderBy("updated_at","desc").skip({skip}).limit({page_size}).get()'
            )
            total = cloud.count('db.collection("quotes").count()')
        except CloudDbConfigError:
            # 回退到本地 Mock 存储
            from models.stock import StockModel
            stock_model = StockModel(None) # None 表示使用本地 mock_db.json
            stocks = stock_model.get_all_stocks(skip=skip, limit=page_size)
            total = stock_model.count_stocks()
            return flask_paginated_response(
                data=stocks,
                page=page,
                per_page=page_size,
                total=total,
                message="微信云未配置，已从本地存储加载行情"
            )

        return flask_paginated_response(
            data=stocks,
            page=page,
            per_page=page_size,
            total=total,
        )
    except Exception as e:
        logger.error(f"获取报价列表失败: {e}")
        return flask_error_response(f"获取失败: {str(e)}", 500)

@admin_bp.route('/quotes', methods=['DELETE'])
@require_auth
@require_roles("admin", "editor")
def delete_quotes_api():
    """管理后台：删除报价"""
    try:
        payload = request.get_json(silent=True) or {}
        codes = payload.get("codes")

        has_codes = (isinstance(codes, list) and len(codes) > 0) or (isinstance(codes, str) and codes.strip() != "")
        if has_codes:
            result = delete_quotes(codes=codes)
            if result.get("success"):
                return flask_success_response(
                    data={"deleted": result.get("deleted", 0)},
                    message=f"已成功删除 {result.get('deleted', 0)} 条记录",
                )
            return flask_error_response(result.get("message") or "删除失败", 500)

        try:
            CloudDbClient.from_env()
        except CloudDbConfigError as e:
            return flask_error_response(str(e), 500)

        task_id = uuid.uuid4().hex
        session_payload = {
            "type": "clear_quotes",
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "processing_started_at_ms": int(time.time() * 1000),
            "status": "processing",
            "deleted": 0,
            "result": None,
        }
        save_upload_session_payload(upload_id=task_id, payload=session_payload)

        import threading

        def _run_job(delete_task_id: str):
            try:
                started_at = time.time()
                result = delete_quotes(codes=None)
                duration_ms = int((time.time() - started_at) * 1000)

                try:
                    payload = load_upload_session_payload(upload_id=delete_task_id)
                except Exception:
                    payload = {"type": "clear_quotes"}

                payload["processed_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

                if result.get("success"):
                    payload["status"] = "processed"
                    payload["deleted"] = int(result.get("deleted") or 0)
                    payload["result"] = {
                        "success": True,
                        "deleted": int(result.get("deleted") or 0),
                        "durationMs": int(result.get("durationMs") or duration_ms),
                    }
                else:
                    payload["status"] = "failed"
                    payload["deleted"] = int(result.get("deleted") or payload.get("deleted") or 0)
                    payload["result"] = {
                        "success": False,
                        "message": result.get("message") or "删除失败",
                        "deleted": int(payload.get("deleted") or 0),
                        "durationMs": int(result.get("durationMs") or duration_ms),
                    }

                save_upload_session_payload(upload_id=delete_task_id, payload=payload)
            except Exception as e:
                try:
                    payload = load_upload_session_payload(upload_id=delete_task_id)
                except Exception:
                    payload = {"type": "clear_quotes"}
                payload["status"] = "failed"
                payload["processed_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                payload["result"] = {"success": False, "message": str(e)}
                save_upload_session_payload(upload_id=delete_task_id, payload=payload)

        threading.Thread(target=_run_job, args=(task_id,), daemon=True).start()

        return flask_success_response(
            data={"status": "processing", "taskId": task_id},
            message="清空任务已创建，正在处理中",
            code=202,
        )
    except Exception as e:
        logger.error(f"删除报价失败: {e}")
        return flask_error_response(f"删除失败: {str(e)}", 500)

@admin_bp.route('/quotes/delete-task/<task_id>', methods=['GET'])
@require_auth
def delete_quotes_task_status(task_id: str):
    try:
        safe_task_id = str(task_id or "").strip()
        if not safe_task_id:
            return flask_error_response("缺少 taskId", 400)

        try:
            session_payload = load_upload_session_payload(upload_id=safe_task_id)
        except Exception:
            return flask_error_response("任务不存在或已过期", 404)

        if session_payload.get("type") != "clear_quotes":
            return flask_error_response("任务不存在或已过期", 404)

        status = session_payload.get("status")
        result = session_payload.get("result")
        deleted = int(session_payload.get("deleted") or 0)

        if status == "processed" and isinstance(result, dict) and result.get("success"):
            return flask_success_response(
                data={
                    "status": "processed",
                    "taskId": safe_task_id,
                    "deleted": deleted,
                    "durationMs": int(result.get("durationMs") or 0),
                },
                message=f"已清空 {deleted} 条记录",
            )

        if status == "failed":
            if isinstance(result, dict):
                return flask_error_response("删除失败", 500, data=result)
            return flask_error_response("删除失败", 500)

        return flask_success_response(
            data={"status": "processing", "taskId": safe_task_id, "deleted": deleted},
            message="清空进行中，请稍后刷新",
            code=202,
        )
    except Exception as e:
        logger.error(f"查询删除任务失败: {e}")
        return flask_error_response(f"查询任务失败: {str(e)}", 500)

@admin_bp.route('/sync-quotes', methods=['POST'])
@require_auth
@require_roles("admin", "editor")
def sync_quotes_api():
    """管理后台：触发同步行情（Sina）"""
    try:
        payload = request.get_json(silent=True) or {}
        codes = payload.get("codes")
        result = sync_quotes(codes=codes, requested_by="admin")
        if result.get("success"):
            return flask_success_response(
                data={
                    "processed": result.get("processed", 0),
                    "fetched": result.get("fetched", 0),
                    "durationMs": result.get("durationMs", 0),
                    "errors": result.get("errors", []),
                },
                message="同步完成",
            )
        return flask_error_response(result.get("message") or "同步失败", 500, data=result)
    except Exception as e:
        logger.error(f"同步行情失败: {e}")
        return flask_error_response(f"同步失败: {str(e)}", 500)


@admin_bp.route('/sync-all-quotes', methods=['POST'])
@require_auth
@require_roles("admin", "editor")
def sync_all_quotes_api():
    """管理后台：触发同步所有 A 股行情"""
    try:
        # 这是一个耗时任务，建议异步执行
        task_id = uuid.uuid4().hex
        session_payload = {
            "type": "sync_all_quotes",
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "status": "processing",
            "result": None,
        }
        save_upload_session_payload(upload_id=task_id, payload=session_payload)

        import threading

        def _run_sync_all(sync_task_id: str):
            try:
                result = sync_all_quotes(requested_by="admin")
                try:
                    payload = load_upload_session_payload(upload_id=sync_task_id)
                except Exception:
                    payload = {"type": "sync_all_quotes"}

                payload["status"] = "processed" if result.get("success") else "failed"
                payload["processed_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                payload["result"] = result
                save_upload_session_payload(upload_id=sync_task_id, payload=payload)
            except Exception as e:
                logger.error(f"异步同步全量行情失败: {e}")
                try:
                    payload = load_upload_session_payload(upload_id=sync_task_id)
                    payload["status"] = "failed"
                    payload["result"] = {"success": False, "message": str(e)}
                    save_upload_session_payload(upload_id=sync_task_id, payload=payload)
                except Exception:
                    pass

        threading.Thread(target=_run_sync_all, args=(task_id,), daemon=True).start()

        return flask_success_response(
            data={"status": "processing", "taskId": task_id},
            message="全量同步任务已创建，后台处理中",
            code=202,
        )
    except Exception as e:
        logger.error(f"同步全量行情失败: {e}")
        return flask_error_response(f"启动全量同步失败: {str(e)}", 500)


@admin_bp.route('/sync-all-quotes/status/<task_id>', methods=['GET'])
@require_auth
def sync_all_quotes_status(task_id: str):
    """查询全量同步任务状态"""
    try:
        session_payload = load_upload_session_payload(upload_id=str(task_id))
        if session_payload.get("type") != "sync_all_quotes":
            return flask_error_response("任务不存在", 404)

        return flask_success_response(data=session_payload)
    except Exception:
        return flask_error_response("任务不存在或已过期", 404)


@admin_bp.route('/bench-quotes', methods=['POST'])
@require_auth
@require_roles("admin", "editor")
def bench_quotes_api():
    if os.getenv("ENABLE_BENCHMARK_API", "false").lower() != "true":
        return flask_error_response("Not Found", 404)

    payload = request.get_json(silent=True) or {}
    compare = bool(payload.get("compare"))

    count = _parse_int(payload.get("count"), 500)
    if count < 1 or count > 20000:
        return flask_error_response("count 必须为 1-20000", 400)

    chunk_size = _parse_int(payload.get("chunkSize") or payload.get("chunk_size"), 50)
    if chunk_size < 1 or chunk_size > 200:
        return flask_error_response("chunkSize 必须为 1-200", 400)

    max_workers = payload.get("maxWorkers") or payload.get("max_workers")
    if max_workers is not None:
        try:
            max_workers = int(max_workers)
        except Exception:
            return flask_error_response("maxWorkers 必须为整数", 400)

    mode = str(payload.get("mode") or "roundtrip").strip().lower()
    if mode not in ("upsert", "delete", "roundtrip"):
        return flask_error_response("mode 必须为 upsert/delete/roundtrip", 400)

    codes = payload.get("codes")
    if mode == "delete" and (not codes):
        return flask_error_response("delete 模式必须提供 codes", 400)

    try:
        cloud = CloudDbClient.from_env()
    except CloudDbConfigError as e:
        return flask_error_response(str(e), 500)

    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    seed = str(time.time_ns())
    bench_codes = [f"BENCH_{seed}_{i:06d}" for i in range(count)]
    docs = [
        {
            "stock_code": code,
            "code": code,
            "name": "BENCH",
            "price": float(i),
            "changePercent": 0.0,
            "updateSource": "benchmark",
            "updated_at": now_iso,
        }
        for i, code in enumerate(bench_codes)
    ]

    def _run_once(label: str, *, workers: int):
        t0 = time.perf_counter()
        processed, errors = cloud.batch_upsert(
            collection="quotes",
            unique_key="stock_code",
            items=docs,
            chunk_size=chunk_size,
            max_workers=workers,
        )
        upsert_ms = int((time.perf_counter() - t0) * 1000)

        deleted = 0
        delete_ms = 0
        if mode in ("delete", "roundtrip"):
            t1 = time.perf_counter()
            target = bench_codes if mode == "roundtrip" else codes
            result = delete_quotes(codes=target)
            delete_ms = int((time.perf_counter() - t1) * 1000)
            if result.get("success"):
                deleted = int(result.get("deleted") or 0)

        total_ms = upsert_ms + delete_ms
        return {
            "label": label,
            "maxWorkers": workers,
            "count": count,
            "chunkSize": chunk_size,
            "processed": int(processed or 0),
            "deleted": deleted,
            "errors": errors[:20] if isinstance(errors, list) else [],
            "upsertMs": upsert_ms,
            "deleteMs": delete_ms,
            "totalMs": total_ms,
        }

    try:
        if compare:
            baseline = _run_once("baseline", workers=1)
            target_workers = int(max_workers or int(os.getenv("WX_DB_MAX_WORKERS") or 8))
            target_workers = max(1, target_workers)
            optimized = _run_once("optimized", workers=target_workers)
            return flask_success_response(data={"results": [baseline, optimized]}, message="基准测试完成")

        workers = int(max_workers or int(os.getenv("WX_DB_MAX_WORKERS") or 8))
        workers = max(1, workers)
        single = _run_once("single", workers=workers)
        return flask_success_response(data=single, message="基准测试完成")
    except Exception as e:
        logger.error(f"行情基准测试失败: {e}")
        return flask_error_response(f"基准测试失败: {str(e)}", 500)


@admin_bp.route('/sync-logs', methods=['GET'])
@require_auth
def get_sync_logs():
    """管理后台：获取同步历史"""
    try:
        pagination, err = _parse_pagination()
        if err:
            return err
        page = pagination["page"]
        page_size = pagination["page_size"]
        skip = (page - 1) * page_size

        try:
            cloud = CloudDbClient.from_env()
        except CloudDbConfigError as e:
            return flask_paginated_response(
                data=[],
                page=page,
                per_page=page_size,
                total=0,
                message=str(e),
            )

        try:
            items = cloud.query(
                f'db.collection("sync_logs").orderBy("created_at","desc").skip({skip}).limit({page_size}).get()'
            )
            total = cloud.count('db.collection("sync_logs").count()')
        except CloudDbRequestError as e:
            if "[ResourceNotFound]" in str(e) or "Db or Table not exist" in str(e):
                return flask_paginated_response(
                    data=[],
                    page=page,
                    per_page=page_size,
                    total=0,
                    message="同步历史未初始化（sync_logs 集合不存在）",
                )
            raise
        return flask_paginated_response(data=items, page=page, per_page=page_size, total=total)
    except Exception as e:
        logger.error(f"获取同步历史失败: {e}")
        return flask_error_response(f"获取失败: {str(e)}", 500)


@admin_bp.route('/upload-quotes/preview', methods=['POST'])
@require_auth
@require_roles("admin", "editor")
def upload_quotes_preview():
    if 'file' not in request.files:
        return flask_error_response("未找到上传文件", 400)

    file = request.files['file']
    if file.filename == '':
        return flask_error_response("文件名不能为空", 400)

    try:
        content = file.read()
        items = parse_quotes_file(filename=file.filename, content=content)
        session = create_upload_session(items=items)
        return flask_success_response(
            data={
                "uploadId": session["upload_id"],
                "total": session["total"],
                "preview": session["preview"],
            },
            message="解析成功，请确认入库",
        )
    except Exception as e:
        logger.error(f"文件预览解析失败: {e}")
        return flask_error_response(f"解析失败: {str(e)}", 500)


@admin_bp.route('/upload-quotes/confirm', methods=['POST'])
@require_auth
@require_roles("admin", "editor")
def upload_quotes_confirm():
    from services.file_parser import load_upload_session_payload, save_upload_session_payload
    import time
    import threading

    payload = request.get_json(silent=True) or {}
    upload_id = payload.get("uploadId") or payload.get("upload_id")
    if not upload_id:
        return flask_error_response("缺少 uploadId", 400)

    try:
        session_payload = load_upload_session_payload(upload_id=str(upload_id))
    except Exception as e:
        return flask_error_response(f"读取预览数据失败: {str(e)}", 400)

    try:
        status = session_payload.get("status")
        existing_result = session_payload.get("result")

        if status == "processed" and isinstance(existing_result, dict):
            if existing_result.get("success"):
                return flask_success_response(
                    data={
                        "status": "processed",
                        "processed": existing_result.get("processed", 0),
                        "durationMs": existing_result.get("durationMs", 0),
                    },
                    message="入库完成",
                )
            return flask_error_response("入库失败", 500, data=existing_result)

        if status == "failed" and isinstance(existing_result, dict):
            return flask_error_response("入库失败", 500, data=existing_result)

        if status == "processing":
            return flask_success_response(
                data={"status": "processing"},
                message="入库进行中，请稍后刷新",
                code=202,
            )

        items = session_payload.get("items")
        if not isinstance(items, list):
            items = []

        session_payload["status"] = "processing"
        session_payload["processing_started_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        save_upload_session_payload(upload_id=str(upload_id), payload=session_payload)

        def _run_job(upload_id_value: str, items_value):
            try:
                result = upsert_quotes_from_file(items=items_value, requested_by="admin", source="file_upload")
            except Exception as err:
                result = {"success": False, "processed": 0, "errors": [{"message": str(err)}], "durationMs": 0}

            try:
                latest = load_upload_session_payload(upload_id=upload_id_value)
                latest["status"] = "processed" if result.get("success") else "failed"
                latest["processed_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                latest["result"] = result
                save_upload_session_payload(upload_id=upload_id_value, payload=latest)
            except Exception:
                pass

        threading.Thread(target=_run_job, args=(str(upload_id), items), daemon=True).start()

        return flask_success_response(
            data={"status": "processing"},
            message="已开始入库，请稍后刷新",
            code=202,
        )
    except Exception as e:
        logger.error(f"文件确认入库失败: {e}")
        return flask_error_response(f"入库失败: {str(e)}", 500)


@admin_bp.route('/upload-quotes', methods=['POST'])
@require_auth
@require_roles("admin", "editor")
def upload_quotes():
    if 'file' not in request.files:
        return flask_error_response("未找到上传文件", 400)

    file = request.files['file']
    if file.filename == '':
        return flask_error_response("文件名不能为空", 400)

    try:
        content = file.read()
        items = parse_quotes_file(filename=file.filename, content=content)
        result = upsert_quotes_from_file(items=items, requested_by="admin", source="file_upload")
        if result.get("success"):
            return flask_success_response(
                data={"processed": result.get("processed", 0), "durationMs": result.get("durationMs", 0)},
                message="上传并入库完成",
            )
        return flask_error_response("入库失败", 500, data=result)
    except Exception as e:
        logger.error(f"文件解析入库失败: {e}")
        return flask_error_response(f"入库失败: {str(e)}", 500)


@admin_bp.route('/crawl-quotes', methods=['POST'])
@require_auth
@require_roles("admin", "editor")
def crawl_quotes():
    return sync_quotes_api()
