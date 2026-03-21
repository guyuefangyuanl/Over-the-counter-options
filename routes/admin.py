# -*- coding: utf-8 -*-
from flask import Blueprint, request, current_app
import logging
import os
import time
import uuid
from backend_utils.response import flask_success_response, flask_error_response, flask_paginated_response
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
from services.cache import get_quotes_cache, invalidate_quotes_cache

logger = logging.getLogger(__name__)
admin_bp = Blueprint('admin', __name__)

# 缓存实例
_quotes_cache = get_quotes_cache()

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
    """管理后台：获取报价列表（支持筛选和缓存）"""
    try:
        pagination, err = _parse_pagination()
        if err:
            return err
        page = pagination["page"]
        page_size = pagination["page_size"]
        skip = (page - 1) * page_size

        # 获取筛选参数
        keyword = request.args.get('keyword', '').strip()
        filter_type = request.args.get('type', '').strip()
        filter_trader = request.args.get('trader', '').strip()
        
        # 检查是否禁用缓存（用于强制刷新）
        no_cache = request.args.get('noCache', '').lower() == 'true'
        
        # 构建缓存键
        cache_key = f"quotes:{page}:{page_size}:{keyword}:{filter_type}:{filter_trader}"
        
        # 尝试从缓存获取
        if not no_cache:
            cached_result = _quotes_cache.get(cache_key)
            if cached_result:
                logger.info(f"缓存命中: {cache_key}")
                return flask_paginated_response(
                    data=cached_result['stocks'],
                    page=cached_result['page'],
                    per_page=cached_result['per_page'],
                    total=cached_result['total'],
                    message="from_cache"
                )

        try:
            cloud = CloudDbClient.from_env()
            
            # 构建查询条件
            where_conditions = []
            
            # 关键词搜索（股票代码或名称）
            if keyword:
                # 使用正则表达式进行模糊匹配
                keyword_escaped = keyword.replace('"', '\\"')
                where_conditions.append(f'(stock_code: /{keyword_escaped}/i || name: /{keyword_escaped}/i)')
            
            # 类型筛选
            if filter_type:
                filter_type_escaped = filter_type.replace('"', '\\"')
                where_conditions.append(f'type: "{filter_type_escaped}"')
            
            # 交易商筛选
            if filter_trader:
                filter_trader_escaped = filter_trader.replace('"', '\\"')
                where_conditions.append(f'trader: "{filter_trader_escaped}"')
            
            # 构建完整查询
            if where_conditions:
                where_clause = ' && '.join(where_conditions)
                query = f'db.collection("quotes").where({{{where_clause}}}).orderBy("updated_at","desc").skip({skip}).limit({page_size}).get()'
                count_query = f'db.collection("quotes").where({{{where_clause}}}).count()'
            else:
                query = f'db.collection("quotes").orderBy("updated_at","desc").skip({skip}).limit({page_size}).get()'
                count_query = 'db.collection("quotes")'
            
            stocks = cloud.query(query)
            total = cloud.count(count_query)
            
            # 缓存结果
            result_data = {
                'stocks': stocks if isinstance(stocks, list) else [],
                'page': page,
                'per_page': page_size,
                'total': total if isinstance(total, int) else 0
            }
            _quotes_cache.set(cache_key, result_data, ttl=30.0)  # 缓存 30 秒
            
        except (CloudDbConfigError, CloudDbRequestError) as e:
            # 回退到本地 Mock 存储
            logger.warning(f"云数据库访问失败，回退到本地存储: {e}")
            from models.stock import StockModel
            stock_model = StockModel(None) # None 表示使用本地 mock_db.json
            stocks = stock_model.get_all_stocks(skip=skip, limit=page_size)
            total = stock_model.count_stocks()
            return flask_paginated_response(
                data=stocks if isinstance(stocks, list) else [],
                page=page,
                per_page=page_size,
                total=total if isinstance(total, int) else 0,
                message=f"云数据库不可用 ({type(e).__name__})，已加载本地数据"
            )

        return flask_paginated_response(
            data=stocks if isinstance(stocks, list) else [],
            page=page,
            per_page=page_size,
            total=total if isinstance(total, int) else 0,
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
                # 使缓存失效
                invalidate_quotes_cache()
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
            "progress": {
                "percent": 0,
                "current": 0,
                "total": 0,
                "message": "正在准备清空任务...",
            },
            "result": None,
        }
        save_upload_session_payload(upload_id=task_id, payload=session_payload)

        import threading

        def _run_job(delete_task_id: str):
            try:
                started_at = time.time()
                
                def _on_progress(p_data):
                    try:
                        p = load_upload_session_payload(upload_id=delete_task_id)
                        p["deleted"] = p_data.get("deleted", 0)
                        p["progress"] = {
                            "percent": p_data.get("percent", 0),
                            "current": p_data.get("deleted", 0),
                            "total": p_data.get("total", 0),
                            "message": f"正在删除: {p_data.get('deleted', 0)} / {p_data.get('total', 0)}",
                        }
                        save_upload_session_payload(upload_id=delete_task_id, payload=p)
                    except Exception:
                        pass

                result = delete_quotes(codes=None, progress_callback=_on_progress)
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
                    # 使缓存失效
                    invalidate_quotes_cache()
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
            data={"status": "processing", "taskId": safe_task_id, "deleted": deleted, "progress": session_payload.get("progress")},
            message="清空进行中，请稍后刷新",
            code=202,
        )
    except Exception as e:
        logger.error(f"查询删除任务失败: {e}")
        return flask_error_response(f"查询任务失败: {str(e)}", 500)


@admin_bp.route('/quotes/<quote_id>', methods=['PUT'])
@require_auth
@require_roles("admin", "editor")
def update_quote(quote_id: str):
    """管理后台：更新单条行情记录"""
    try:
        import json as json_module
        payload = request.get_json(silent=True) or {}
        if not payload:
            return flask_error_response("请求体不能为空", 400)
        
        # 验证 quote_id
        safe_id = str(quote_id).strip()
        if not safe_id:
            return flask_error_response("quote_id 无效", 400)
        
        try:
            cloud = CloudDbClient.from_env()
        except CloudDbConfigError as e:
            return flask_error_response(str(e), 500)
        
        # 准备更新数据
        update_data = {}
        allowed_fields = ['name', 'price', 'rate', 'type', 'term', 'trader', 
                          'changePercent', 'open', 'high', 'low', 'pre_close', 
                          'volume', 'amount']
        
        for field in allowed_fields:
            if field in payload:
                value = payload[field]
                # 数值字段转换
                if field in ['price', 'rate', 'changePercent', 'open', 'high', 'low', 'pre_close', 'volume', 'amount']:
                    try:
                        value = float(value) if value is not None else None
                    except (ValueError, TypeError):
                        continue
                if value is not None:
                    update_data[field] = value
        
        if not update_data:
            return flask_error_response("没有有效的更新字段", 400)
        
        # 添加更新时间
        update_data['updated_at'] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        
        # 执行更新
        try:
            # 先查询记录是否存在，确定使用 _id 还是 code 查询
            existing = cloud.query(f'db.collection("quotes").where({{_id: "{safe_id}"}}).limit(1).get()')
            where_field = "_id"
            
            if not existing or len(existing) == 0:
                # 尝试使用 code 字段查询
                existing = cloud.query(f'db.collection("quotes").where({{code: "{safe_id}"}}).limit(1).get()')
                if not existing or len(existing) == 0:
                    return flask_error_response("记录不存在", 404)
                where_field = "code"
            
            # 构建 where_js 字符串
            where_js = json_module.dumps({where_field: safe_id})
            
            # 执行更新
            result = cloud.update_where(
                collection="quotes",
                where_js=where_js,
                data=update_data
            )
            
            if result > 0:
                # 使缓存失效
                invalidate_quotes_cache()
                return flask_success_response(
                    data={"updated": True, "quote_id": safe_id, "modified_count": result},
                    message="更新成功"
                )
            else:
                return flask_success_response(
                    data={"updated": True, "quote_id": safe_id, "modified_count": 0},
                    message="更新成功（无变化）"
                )
                
        except CloudDbRequestError as e:
            logger.error(f"更新行情失败: {e}")
            return flask_error_response(f"更新失败: {str(e)}", 500)
            
    except Exception as e:
        logger.error(f"更新行情失败: {e}")
        return flask_error_response(f"更新失败: {str(e)}", 500)


@admin_bp.route('/quotes/<quote_id>', methods=['GET'])
@require_auth
def get_quote_detail(quote_id: str):
    """管理后台：获取单条行情详情"""
    try:
        safe_id = str(quote_id).strip()
        if not safe_id:
            return flask_error_response("quote_id 无效", 400)
        
        try:
            cloud = CloudDbClient.from_env()
        except CloudDbConfigError as e:
            return flask_error_response(str(e), 500)
        
        # 查询记录
        try:
            result = cloud.query(f'db.collection("quotes").where({{_id: "{safe_id}"}}).limit(1).get()')
            if not result or len(result) == 0:
                # 尝试使用 code 字段查询
                result = cloud.query(f'db.collection("quotes").where({{code: "{safe_id}"}}).limit(1).get()')
                if not result or len(result) == 0:
                    return flask_error_response("记录不存在", 404)
            
            return flask_success_response(data=result[0])
        except CloudDbRequestError as e:
            logger.error(f"查询行情详情失败: {e}")
            return flask_error_response(f"查询失败: {str(e)}", 500)
            
    except Exception as e:
        logger.error(f"查询行情详情失败: {e}")
        return flask_error_response(f"查询失败: {str(e)}", 500)


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
            "progress": {
                "percent": 0,
                "step": "cleaning",
                "message": "正在启动全量同步...",
                "current": 0,
                "total": 0,
            },
            "result": None,
        }
        save_upload_session_payload(upload_id=task_id, payload=session_payload)

        import threading

        # 进度更新回调 - 限制更新频率
        _last_progress_update = [0.0]  # 使用列表以便在闭包中修改

        def _on_progress(progress_data: dict):
            """进度回调函数"""
            now = time.time()
            # 限制更新频率：每 2 秒最多更新一次，或者进度完成时更新
            if now - _last_progress_update[0] < 2.0 and progress_data.get("percent", 0) < 100:
                return
            _last_progress_update[0] = now

            try:
                payload = load_upload_session_payload(upload_id=sync_task_id)
                if payload.get("status") == "processing":
                    payload["progress"] = progress_data
                    save_upload_session_payload(upload_id=sync_task_id, payload=payload)
            except Exception as e:
                logger.warning(f"更新全量同步进度失败: {e}")

        def _run_sync_all(sync_task_id: str):
            try:
                result = sync_all_quotes(requested_by="admin", progress_callback=_on_progress)
                try:
                    payload = load_upload_session_payload(upload_id=sync_task_id)
                except Exception:
                    payload = {"type": "sync_all_quotes"}

                payload["status"] = "processed" if result.get("success") else "failed"
                payload["processed_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                payload["result"] = result
                # 更新最终进度
                if result.get("success"):
                    payload["progress"] = {
                        "percent": 100,
                        "step": "completed",
                        "message": f"全量同步完成：写入 {result.get('processed', 0)} 条",
                        "current": result.get("processed", 0),
                        "total": result.get("fetched", 0),
                    }
                save_upload_session_payload(upload_id=sync_task_id, payload=payload)
            except Exception as e:
                logger.error(f"异步同步全量行情失败: {e}")
                try:
                    payload = load_upload_session_payload(upload_id=sync_task_id)
                    payload["status"] = "failed"
                    payload["result"] = {"success": False, "message": str(e)}
                    payload["progress"] = {
                        "percent": 0,
                        "step": "failed",
                        "message": f"同步失败: {str(e)}",
                        "current": 0,
                        "total": 0,
                    }
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
            items = cloud.query(
                f'db.collection("sync_logs").orderBy("created_at","desc").skip({skip}).limit({page_size}).get()'
            )
            total = cloud.count('db.collection("sync_logs")')
        except CloudDbConfigError as e:
            return flask_paginated_response(
                data=[],
                page=page,
                per_page=page_size,
                total=0,
                message=str(e),
            )
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
        return flask_paginated_response(
            data=items if isinstance(items, list) else [],
            page=page,
            per_page=page_size,
            total=total if isinstance(total, int) else 0
        )
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
    from services.sync_service import upsert_quotes_from_file
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
        progress = session_payload.get("progress")
        existing_result = session_payload.get("result")

        # 如果已经处理完成或正在处理
        if status == "processed" and isinstance(existing_result, dict):
            return flask_success_response(data={"status": "processed", "result": existing_result})
        
        if status == "processing":
            return flask_success_response(data={"status": "processing", "progress": progress}, code=202)

        items = session_payload.get("items", [])
        
        # 优化：在启动线程前就从会话中移除 items，确保轮询接口响应迅速
        if "items" in session_payload:
            del session_payload["items"]
        
        # 更新状态为 processing
        session_payload["status"] = "processing"
        session_payload["progress"] = {
            "percent": 0,
            "step": "cleaning",
            "status": "processing",
            "message": "正在清洗数据...",
            "current": 0,
            "total": len(items)
        }
        save_upload_session_payload(upload_id=str(upload_id), payload=session_payload)

        def _run_job(uid: str, data_items):
            def _on_progress(p_data):
                try:
                    # 再次确保不加载 items
                    current_session = load_upload_session_payload(upload_id=uid)
                    if "items" in current_session:
                        del current_session["items"]
                    
                    current_session["progress"] = p_data
                    # 根据 step 映射友好消息
                    messages = {
                        "cleaning": "正在清洗并验证数据...",
                        "ingesting": "正在同步至云数据库...",
                        "completed": "入库完成",
                        "failed": "入库失败"
                    }
                    if not p_data.get("message"):
                        current_session["progress"]["message"] = messages.get(p_data["step"], "处理中...")
                    save_upload_session_payload(upload_id=uid, payload=current_session)
                except Exception:
                    pass

            try:
                logger.info(f"开始执行入库任务: {uid}, 记录数: {len(data_items)}")
                res = upsert_quotes_from_file(
                    items=data_items, 
                    requested_by="admin", 
                    source="file_upload",
                    progress_callback=_on_progress
                )
                logger.info(f"入库任务完成: {uid}, 成功: {res.get('processed')}, 失败: {len(res.get('errors', []))}")
            except Exception as err:
                logger.error(f"入库任务异常: {uid}, 错误: {err}")
                res = {"success": False, "processed": 0, "errors": [{"message": str(err)}]}

            try:
                latest = load_upload_session_payload(upload_id=uid)
                latest["status"] = "processed" if res.get("success") else "failed"
                latest["result"] = res
                save_upload_session_payload(upload_id=uid, payload=latest)
            except Exception:
                pass

        threading.Thread(target=_run_job, args=(str(upload_id), items), daemon=True).start()

        return flask_success_response(
            data={"status": "processing", "progress": session_payload["progress"]},
            message="已开始入库",
            code=202
        )
    except Exception as e:
        return flask_error_response(f"确认入库失败: {str(e)}", 500)

@admin_bp.route('/upload-quotes/bulk-local', methods=['POST'])
@require_auth
@require_roles("admin", "editor")
def upload_quotes_bulk_local():
    """管理后台：批量导入服务器本地指定的 8 个 Excel 文件"""
    import threading
    from services.file_parser import parse_quotes_file
    from services.sync_service import upsert_quotes_from_file
    
    task_id = uuid.uuid4().hex
    files = [
        '中金国际 香草.xlsx', 
        '中信中证资本期权报价表2024-11-19 香草.xlsx', 
        '浙期实业-2024-11-19.xlsx', 
        '银河德睿-2024-11-19.xlsx', 
        '华泰长城报价2024-11-19.xlsx', 
        '国君风险子-2024-11-19.xlsx', 
        '永安资本 香草.xlsx', 
        '中信中证资本期权报价表2024-11-19.xlsx'
    ]
    
    session_payload = {
        "type": "bulk_import_local",
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "processing",
        "progress": {
            "percent": 0,
            "message": "准备开始批量导入...",
            "current": 0,
            "total": len(files)
        },
        "result": None,
    }
    save_upload_session_payload(upload_id=task_id, payload=session_payload)

    def _run_bulk_job(tid: str):
        from concurrent.futures import ThreadPoolExecutor
        workspace_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        total_processed = 0
        all_errors = []
        all_parsed_items = []
        
        # 1. 并行解析所有文件
        def _process_one_file(filename):
            file_path = os.path.join(workspace_root, filename)
            if not os.path.exists(file_path):
                return [], [{"file": filename, "message": "文件不存在"}]
            try:
                with open(file_path, 'rb') as f:
                    content = f.read()
                items = parse_quotes_file(filename=filename, content=content)
                if not items:
                    return [], [{"file": filename, "message": "未提取到有效数据"}]
                return items, []
            except Exception as e:
                return [], [{"file": filename, "message": str(e)}]

        try:
            p = load_upload_session_payload(upload_id=tid)
            p["progress"]["message"] = "正在并行解析 Excel 文件..."
            save_upload_session_payload(upload_id=tid, payload=p)
        except: pass

        with ThreadPoolExecutor(max_workers=min(len(files), 8)) as executor:
            results = list(executor.map(_process_one_file, files))
        
        for items, errs in results:
            all_parsed_items.extend(items)
            all_errors.extend(errs)

        if not all_parsed_items:
            # 更新最终状态
            try:
                p = load_upload_session_payload(upload_id=tid)
                p["status"] = "processed"
                p["progress"]["percent"] = 100
                p["progress"]["message"] = "处理完成，但未发现有效数据"
                p["result"] = {
                    "success": len(all_errors) == 0,
                    "processed": 0,
                    "errors": all_errors
                }
                save_upload_session_payload(upload_id=tid, payload=p)
            except: pass
            return

        # 2. 数据去重（基于 code），确保合并后的数据项唯一
        # 使用字典按 code 去重，后出现的数据覆盖先出现的
        deduped_map = {}
        for it in all_parsed_items:
            code = it.get("code")
            if code:
                deduped_map[code] = it
        
        final_items = list(deduped_map.values())
        logger.info(f"批量导入：合并后共 {len(final_items)} 条待入库记录 (原始总计 {len(all_parsed_items)} 条)")

        # 3. 单次批量入库
        last_progress_update = 0
        def _on_sub_progress(sub_p):
            nonlocal last_progress_update
            now = time.time()
            # 限制进度更新频率，减少 session 文件 I/O (每 2 秒更新一次)
            if now - last_progress_update < 2 and sub_p.get("status") != "completed":
                return
            
            try:
                last_progress_update = now
                sp = load_upload_session_payload(upload_id=tid)
                sub_msg = sub_p.get("message") or f"{sub_p.get('step')}: {sub_p.get('current')}/{sub_p.get('total')}"
                sp["progress"]["message"] = f"正在入库: {sub_msg}"
                sp["progress"]["percent"] = 20 + int(sub_p.get("percent", 0) * 0.8) # 假设入库占 80% 的进度
                save_upload_session_payload(upload_id=tid, payload=sp)
            except: pass

        res = upsert_quotes_from_file(
            items=final_items, 
            requested_by="admin_bulk_api",
            source="local_bulk_merged",
            progress_callback=_on_sub_progress,
            max_workers=128 # 进一步提升并行能力
        )
        
        if res.get("success"):
            total_processed = res.get("processed", 0)
        else:
            all_errors.extend(res.get("errors", []))

        # 4. 完成后更新状态
        try:
            p = load_upload_session_payload(upload_id=tid)
            p["status"] = "processed"
            p["progress"]["current"] = len(files)
            p["progress"]["percent"] = 100
            p["progress"]["message"] = "批量导入完成"
            p["result"] = {
                "success": True,
                "processed": total_processed,
                "count": total_processed,
                "valid": total_processed,
                "invalid": 0,
                "durationMs": 0,
                "errors": all_errors
            }
            save_upload_session_payload(upload_id=tid, payload=p)
        except: pass

    threading.Thread(target=_run_bulk_job, args=(task_id,), daemon=True).start()

    return flask_success_response(
        data={"status": "processing", "uploadId": task_id},
        message="批量导入任务已创建",
        code=202
    )

@admin_bp.route('/upload-quotes/progress', methods=['GET'])
@require_auth
def upload_quotes_progress():
    from services.file_parser import load_upload_session_payload
    upload_id = request.args.get("uploadId")
    if not upload_id:
        return flask_error_response("缺少 uploadId", 400)
    
    try:
        session = load_upload_session_payload(upload_id=str(upload_id))
        return flask_success_response(data={
            "status": session.get("status"),
            "progress": session.get("progress"),
            "result": session.get("result")
        })
    except Exception as e:
        return flask_error_response(f"获取进度失败: {str(e)}", 404)


@admin_bp.route('/debug/cloud-db', methods=['GET'])
@require_auth
def debug_cloud_db():
    """诊断云数据库连接状态"""
    try:
        import os
        from flask import current_app
        
        # 获取环境变量信息（部分脱敏）
        secret = os.getenv("WX_SECRET") or ""
        masked_secret = f"{secret[:4]}***{secret[-4:]}" if len(secret) > 8 else "***"
        
        env_info = {
            "WX_CLOUD_ENV": os.getenv("WX_CLOUD_ENV"),
            "WX_APPID": os.getenv("WX_APPID"),
            "WX_SECRET": masked_secret,
            "WX_DB_MAX_INFLIGHT": os.getenv("WX_DB_MAX_INFLIGHT"),
        }
        
        cloud_db = getattr(current_app, 'cloud_db', None)
        status = "initialized" if cloud_db else "not_initialized"
        
        test_result = None
        query_error = None
        
        if cloud_db:
            try:
                # 尝试简单查询
                test_result = cloud_db.query('db.collection("inquiries").limit(1).get()')
            except Exception as e:
                query_error = str(e)
        
        return flask_success_response(
            data={
                "env": env_info,
                "status": status,
                "test_result": test_result,
                "query_error": query_error
            },
            message="诊断完成"
        )
    except Exception as e:
        return flask_error_response(f"诊断失败: {str(e)}", 500)


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
