# -*- coding: utf-8 -*-
from flask import Blueprint, request, current_app
import logging
from utils.response import flask_success_response, flask_error_response, flask_paginated_response
from models.stock import StockModel
from models.inquiry import InquiryModel
from models.order import OrderModel
from routes.auth import require_auth
from services.cloud_db import CloudDbClient, CloudDbConfigError, CloudDbRequestError
from services.file_parser import (
    create_upload_session,
    delete_upload_session,
    load_upload_session,
    parse_quotes_file,
)
from services.sync_service import sync_quotes, upsert_quotes_from_file, delete_quotes

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
        except CloudDbConfigError as e:
            return flask_paginated_response(
                data=[],
                page=page,
                per_page=page_size,
                total=0,
                message=str(e),
            )

        stocks = cloud.query(
            f'db.collection("quotes").orderBy("updated_at","desc").skip({skip}).limit({page_size}).get()'
        )
        total = cloud.count('db.collection("quotes").count()')
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
def delete_quotes_api():
    """管理后台：删除报价"""
    try:
        payload = request.get_json(silent=True) or {}
        codes = payload.get("codes")
        # 如果 codes 为空数组或未提供，则视为清空所有（慎用，或根据需求调整为必须提供 codes）
        result = delete_quotes(codes=codes)
        if result.get("success"):
            return flask_success_response(
                data={"deleted": result.get("deleted", 0)},
                message=f"已成功删除 {result.get('deleted', 0)} 条记录",
            )
        return flask_error_response(result.get("message") or "删除失败", 500)
    except Exception as e:
        logger.error(f"删除报价失败: {e}")
        return flask_error_response(f"删除失败: {str(e)}", 500)

@admin_bp.route('/sync-quotes', methods=['POST'])
@require_auth
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
def crawl_quotes():
    return sync_quotes_api()
