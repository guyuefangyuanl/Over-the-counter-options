from flask import Blueprint, jsonify, request, current_app, send_file
import datetime
import logging
import io
import json
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill
from models.inquiry import InquiryModel
from backend_utils.response import flask_success_response, flask_error_response, flask_paginated_response
from routes.auth import require_auth

logger = logging.getLogger(__name__)
inquiry_bp = Blueprint('inquiry', __name__)

# 模拟数据库 - 报价列表 (保留以向后兼容小程序端)
MOCK_QUOTES = [
    { "id": 1, "group": "group1", "type": "stock", "name": "贵州茅台", "code": "600519", "changePercent": 1.23, "term": "1M", "structure": "vanilla", "dealers": ["CICC", "CITIC"], "rates": { "100": 10.50, "105": 8.30, "110": 6.50 } },
    { "id": 2, "group": "group1", "type": "stock", "name": "宁德时代", "code": "300750", "changePercent": -2.45, "term": "1M", "structure": "vanilla", "dealers": ["CICC", "GJS"], "rates": { "100": 12.80, "105": 10.20, "110": 8.90 } },
    { "id": 3, "group": "group2", "type": "stock", "name": "比亚迪", "code": "002594", "changePercent": 3.10, "term": "2M", "structure": "vanilla", "dealers": ["CITIC"], "rates": { "100": 15.25, "105": 12.85, "110": 10.45 } },
    { "id": 4, "group": "holding", "type": "stock", "name": "药明康德", "code": "603259", "changePercent": 0.55, "term": "3M", "structure": "snowball", "dealers": ["CICC", "CITIC", "GJS"], "rates": { "100": 18.00, "105": 15.50, "110": 13.00 } },
    { "id": 5, "group": "all", "type": "index", "name": "沪深300指数", "code": "000300", "changePercent": -0.55, "term": "1M", "structure": "vanilla", "dealers": ["GJS"], "rates": { "100": 5.50, "105": 4.30, "110": 3.50 } },
]

@inquiry_bp.route('/quotes', methods=['GET'])
def get_quotes():
    """获取报价列表 - 从真实数据库读取"""
    try:
        # 优先使用微信云数据库
        cloud_db = getattr(current_app, 'cloud_db', None)
        if cloud_db:
            try:
                result = cloud_db.query('quotes', {})
                quotes_data = result.get('data', []) if isinstance(result, dict) else result
                if quotes_data:
                    logger.info(f"从云数据库获取到 {len(quotes_data)} 条报价数据")
                    return jsonify({
                        "success": True,
                        "message": "获取成功",
                        "data": quotes_data
                    })
            except Exception as e:
                logger.warning(f"从云数据库获取报价失败，尝试本地数据库: {e}")
        
        # 回退到本地MongoDB
        db = getattr(current_app, 'db', None)
        if db:
            quotes = list(db.quotes.find({}, {'_id': 0}).limit(100))
            if quotes:
                logger.info(f"从本地数据库获取到 {len(quotes)} 条报价数据")
                return jsonify({
                    "success": True,
                    "message": "获取成功",
                    "data": quotes
                })
        
        # 如果都没有数据，返回空列表而非模拟数据
        logger.warning("数据库中没有报价数据，返回空列表")
        return jsonify({
            "success": True,
            "message": "暂无报价数据",
            "data": []
        })
        
    except Exception as e:
        logger.error(f"获取报价失败: {e}")
        return jsonify({
            "success": False,
            "message": "获取报价失败，请稍后重试",
            "data": []
        }), 500

@inquiry_bp.route('/inquiry', methods=['POST'])
def create_inquiry():
    """提交询价"""
    try:
        data = request.json
        if not data.get('selectedProduct'):
            return flask_error_response("未选择产品", 400)
        
        db = getattr(current_app, 'db', None)
        if not db:
            return flask_error_response("数据库未连接", 500)
            
        inquiry_model = InquiryModel(db)
        inquiry_id = inquiry_model.create_inquiry(data)
        
        if inquiry_id:
            return flask_success_response(data={"id": inquiry_id}, message="询价提交成功")
        else:
            return flask_error_response("提交失败", 500)
    except Exception as e:
        logger.error(f"提交询价失败: {e}")
        return flask_error_response(str(e), 500)

@inquiry_bp.route('/admin/inquiries', methods=['GET'])
@require_auth
def admin_get_inquiries():
    """管理后台：获取询价列表"""
    try:
        page = request.args.get('page', 1)
        page_size = request.args.get('pageSize', 20)
        try:
            page = int(page)
        except Exception:
            page = 1
        try:
            page_size = int(page_size)
        except Exception:
            page_size = 20

        if page < 1:
            return flask_error_response("page 必须为正整数", 400)
        if page_size < 1 or page_size > 200:
            return flask_error_response("pageSize 必须为 1-200", 400)

        status = request.args.get('status')
        keyword = request.args.get('keyword')
        start_date_raw = request.args.get('startDate')
        end_date_raw = request.args.get('endDate')
        
        # 优先使用云数据库
        cloud_db = getattr(current_app, 'cloud_db', None)
        if cloud_db:
            try:
                logger.info("=" * 60)
                logger.info("开始从云数据库获取询价列表")
                logger.info(f"查询参数: page={page}, pageSize={page_size}, status={status}, keyword={keyword}")
                logger.info("=" * 60)
                
                # 先获取全部数据用于过滤（只在前几页时这样做，数据量大时需要优化）
                # 注意：为了正确分页，我们需要先获取所有数据再进行内存过滤
                all_query_js = "db.collection('inquiries').orderBy('createdAt', 'desc').get()"
                logger.info(f"云数据库查询语句: {all_query_js}")
                
                all_data = cloud_db.query(all_query_js)
                logger.info(f"✓ 云数据库查询完成，返回类型: {type(all_data)}, 数据长度: {len(all_data) if isinstance(all_data, list) else 'N/A'}")
                
                # 检查是否为None或空
                if all_data is None:
                    logger.error("❌ 云数据库返回 None，可能是查询失败或集合不存在")
                    logger.warning("⚠️ 继续尝试本地数据库...")
                elif not isinstance(all_data, list):
                    logger.error(f"❌ 云数据库返回数据类型错误: {type(all_data)}, 期望 list")
                    logger.warning("⚠️ 继续尝试本地数据库...")
                elif len(all_data) == 0:
                    logger.warning("⚠️ 云数据库查询成功但返回空列表，可能是：")
                    logger.warning("  1. inquiries 集合确实没有数据")
                    logger.warning("  2. 小程序未提交询价数据")
                    logger.warning("  3. 数据未正确同步到云数据库")
                    logger.info("返回空结果给前端")
                    return flask_paginated_response(
                        data=[],
                        page=page,
                        per_page=page_size,
                        total=0,
                        message="云数据库中暂无询价数据"
                    )
                
                if all_data is not None and isinstance(all_data, list):
                    # 打印前3条数据样例
                    if len(all_data) > 0:
                        logger.info(f"数据样例 (前3条):")
                        for i, item in enumerate(all_data[:3], 1):
                            logger.info(f"  记录 {i}: ID={item.get('_id')}, 产品={item.get('productName', 'N/A')}, 状态={item.get('status', 'N/A')}, 联系人={item.get('contactName', 'N/A')}")
                    
                    filtered_data = all_data
                    
                    # 应用状态过滤
                    if status:
                        before_count = len(filtered_data)
                        filtered_data = [item for item in filtered_data if item.get('status') == status]
                        logger.info(f"状态过滤: '{status}' - 过滤前 {before_count} 条，过滤后 {len(filtered_data)} 条")
                    
                    # 应用关键词过滤
                    if isinstance(keyword, str) and keyword.strip() != "":
                        kw = keyword.strip().lower()
                        before_count = len(filtered_data)
                        filtered_data = [
                            item for item in filtered_data 
                            if (kw in str(item.get('contactName', '')).lower() or
                                kw in str(item.get('productName', '')).lower() or
                                kw in str(item.get('productCode', '')).lower())
                        ]
                        logger.info(f"关键词过滤: '{kw}' - 过滤前 {before_count} 条，过滤后 {len(filtered_data)} 条")
                    
                    # 计算分页
                    total = len(filtered_data)
                    start_idx = (page - 1) * page_size
                    end_idx = start_idx + page_size
                    page_data = filtered_data[start_idx:end_idx]
                    
                    logger.info("=" * 60)
                    logger.info(f"✓✓✓ 云数据库查询成功")
                    logger.info(f"  - 原始数据: {len(all_data)} 条")
                    logger.info(f"  - 过滤后: {total} 条")
                    logger.info(f"  - 当前页: {len(page_data)} 条 (page={page}, pageSize={page_size})")
                    logger.info("=" * 60)
                    
                    return flask_paginated_response(
                        data=page_data,
                        page=page,
                        per_page=page_size,
                        total=total,
                    )
            except Exception as e:
                logger.error("=" * 60)
                logger.error(f"❌❌❌ 从云数据库获取询价列表失败")
                logger.error(f"错误类型: {type(e).__name__}")
                logger.error(f"错误信息: {str(e)}")
                logger.error("=" * 60)
                import traceback
                logger.error(traceback.format_exc())
                logger.warning("⚠️ 尝试回退到本地数据库...")

        db = getattr(current_app, 'db', None)
        if not db:
            return flask_paginated_response(data=[], page=page, per_page=page_size, total=0, message="数据库未连接，返回空询价列表")
            
        inquiry_model = InquiryModel(db)



        def parse_dt(raw: str, is_end: bool) -> datetime.datetime:
            raw = raw.strip()
            if len(raw) == 10:
                d = datetime.date.fromisoformat(raw)
                if is_end:
                    return datetime.datetime(d.year, d.month, d.day, 23, 59, 59, 999999)
                return datetime.datetime(d.year, d.month, d.day, 0, 0, 0, 0)

            iso = raw.replace("Z", "+00:00")
            dt = datetime.datetime.fromisoformat(iso)
            if dt.tzinfo is not None:
                dt = dt.astimezone(datetime.timezone.utc).replace(tzinfo=None)
            return dt

        query = {}
        if status:
            query["status"] = status
        if isinstance(keyword, str) and keyword.strip() != "":
            kw = keyword.strip()
            query["$or"] = [
                {"contactName": {"$regex": kw, "$options": "i"}},
                {"phone": {"$regex": kw, "$options": "i"}},
                {"selectedProduct.name": {"$regex": kw, "$options": "i"}},
                {"selectedProduct.code": {"$regex": kw, "$options": "i"}},
            ]

        created_at = {}
        if isinstance(start_date_raw, str) and start_date_raw.strip() != "":
            try:
                created_at["$gte"] = parse_dt(start_date_raw, False)
            except Exception:
                return flask_error_response("startDate 格式不正确", 400)
        if isinstance(end_date_raw, str) and end_date_raw.strip() != "":
            try:
                created_at["$lte"] = parse_dt(end_date_raw, True)
            except Exception:
                return flask_error_response("endDate 格式不正确", 400)
        if created_at:
            query["createdAt"] = created_at
        
        cursor = inquiry_model.collection.find(query).sort("createdAt", -1).skip((page - 1) * page_size).limit(page_size)
        inquiries = []
        for item in cursor:
            item["_id"] = str(item["_id"])
            inquiries.append(item)

        total = inquiry_model.collection.count_documents(query)
        return flask_paginated_response(
            data=inquiries,
            page=page,
            per_page=page_size,
            total=total,
        )
    except Exception as e:
        logger.error(f"获取询价列表失败: {e}")
        return flask_error_response(str(e), 500)

@inquiry_bp.route('/admin/inquiries/<id>/status', methods=['PUT'])
@require_auth
def admin_update_inquiry_status(id):
    """管理后台：更新询价状态"""
    try:
        data = request.json
        status = data.get('status')
        remark = data.get('remark')
        
        if not status:
            return flask_error_response("状态不能为空", 400)
            
        db = getattr(current_app, 'db', None)
        if not db:
            return flask_error_response("数据库未连接", 503)
            
        inquiry_model = InquiryModel(db)
        
        # 获取当前操作人
        operator = "system"
        admin_payload = getattr(g, "admin", None)
        if isinstance(admin_payload, dict):
            operator = admin_payload.get("sub", "unknown")
        
        # 同步更新云数据库
        cloud_db = getattr(current_app, 'cloud_db', None)
        cloud_success = False
        if cloud_db:
            try:
                # 微信云数据库更新，假设集合名为 inquiries
                now_iso = datetime.datetime.utcnow().isoformat() + "Z"
                update_data = {"status": status, "updateTime": now_iso}
                if remark:
                    update_data["remark"] = remark
                
                # 云数据库也记录历史（简化版）
                history_entry = {
                    "status": status,
                    "remark": remark,
                    "operator": operator,
                    "time": now_iso
                }
                
                # 注意：云数据库中的 _id 通常是字符串
                affected = cloud_db.update_where(
                    collection="inquiries",
                    where_js=f"{{_id: '{id}'}}",
                    data={
                        **update_data,
                        "$push": {"history": history_entry}
                    }
                )
                cloud_success = affected > 0
                logger.info(f"云数据库更新结果: {cloud_success}, id: {id}")
            except Exception as e:
                logger.error(f"同步更新云数据库失败: {e}")
        
        success = inquiry_model.update_status(id, status, remark, operator)
        
        if success or cloud_success:
            return flask_success_response(message="状态更新成功")
        else:
            return flask_error_response("状态更新失败", 500)
    except Exception as e:
        logger.error(f"更新询价状态失败: {e}")
        return flask_error_response(str(e), 500)

@inquiry_bp.route('/admin/inquiries/statistics', methods=['GET'])
@require_auth
def get_inquiry_statistics():
    """获取询价统计信息"""
    try:
        # 优先使用云数据库
        cloud_db = getattr(current_app, 'cloud_db', None)
        if cloud_db:
            try:
                stats = {
                    "pending": cloud_db.count("db.collection('inquiries').where({status: 'pending'}).count()"),
                    "processing": cloud_db.count("db.collection('inquiries').where({status: 'processing'}).count()"),
                    "completed": cloud_db.count("db.collection('inquiries').where({status: 'completed'}).count()"),
                    "rejected": cloud_db.count("db.collection('inquiries').where({status: 'rejected'}).count()"),
                }
                logger.info(f"从云数据库获取询价统计成功: {stats}")
                return flask_success_response(data=stats, message="统计成功")
            except Exception as e:
                logger.error(f"从云数据库获取统计信息失败，尝试回退到本地数据库: {e}")
        
        # 回退到本地数据库
        db = getattr(current_app, 'db', None)
        if not db:
            return flask_success_response(data={"pending": 0, "processing": 0, "completed": 0, "rejected": 0}, message="数据库未连接")
            
        inquiry_model = InquiryModel(db)
        
        stats = {
            "pending": inquiry_model.collection.count_documents({"status": "pending"}),
            "processing": inquiry_model.collection.count_documents({"status": "processing"}),
            "completed": inquiry_model.collection.count_documents({"status": "completed"}),
            "rejected": inquiry_model.collection.count_documents({"status": "rejected"}),
        }
        
        return flask_success_response(data=stats, message="统计成功")
    except Exception as e:
        logger.error(f"获取统计信息失败: {e}")
        return flask_error_response(str(e), 500)

@inquiry_bp.route('/admin/inquiries/batch-update', methods=['POST'])
@require_auth
def batch_update_inquiries():
    """批量更新询价状态"""
    try:
        data = request.json
        ids = data.get('ids', [])
        status = data.get('status')
        
        if not ids or not isinstance(ids, list):
            return flask_error_response("请选择要更新的询价", 400)
            
        if not status:
            return flask_error_response("状态不能为空", 400)
            
        db = getattr(current_app, 'db', None)
        if not db:
            return flask_error_response("数据库未连接", 503)
            
        inquiry_model = InquiryModel(db)
        success_count = inquiry_model.batch_update_status(ids, status)
        
        return flask_success_response(data={"updated": success_count}, message=f"已批量更新{success_count}条询价")
    except Exception as e:
        logger.error(f"批量更新失败: {e}")
        return flask_error_response(str(e), 500)

@inquiry_bp.route('/admin/inquiries/export', methods=['GET'])
@require_auth
def export_inquiries():
    """导出询价列表为Excel"""
    try:
        # 获取过滤条件
        status = request.args.get('status')
        keyword = request.args.get('keyword')
        
        inquiries = []
        
        # 优先使用云数据库
        cloud_db = getattr(current_app, 'cloud_db', None)
        if cloud_db:
            try:
                # 从云数据库获取数据
                logger.info("从云数据库导出询价数据")
                all_query_js = "db.collection('inquiries').orderBy('createdAt', 'desc').get()"
                all_data = cloud_db.query(all_query_js)
                logger.info(f"从云数据库获取到 {len(all_data)} 条记录")
                
                # 应用过滤条件
                filtered_data = all_data
                
                if status:
                    filtered_data = [item for item in filtered_data if item.get('status') == status]
                    logger.info(f"状态过滤后剩余 {len(filtered_data)} 条记录")
                
                if isinstance(keyword, str) and keyword.strip() != "":
                    kw = keyword.strip().lower()
                    filtered_data = [
                        item for item in filtered_data 
                        if (kw in str(item.get('contactName', '')).lower() or
                            kw in str(item.get('productName', '')).lower() or
                            kw in str(item.get('productCode', '')).lower())
                    ]
                    logger.info(f"关键词过滤后剩余 {len(filtered_data)} 条记录")
                
                inquiries = filtered_data[:1000]  # 限制最多导出1000条
                logger.info(f"准备导出 {len(inquiries)} 条记录")
                
            except Exception as e:
                logger.error(f"从云数据库获取导出数据失败: {e}")
                import traceback
                logger.error(traceback.format_exc())
                # 继续尝试本地数据库
        
        # 如果云数据库没有数据，回退到本地数据库
        if not inquiries:
            db = getattr(current_app, 'db', None)
            if not db:
                logger.warning("本地数据库未连接，且云数据库无数据")
                return flask_error_response("暂无数据可导出", 404)
            
            logger.info("从本地数据库导出询价数据")
            inquiry_model = InquiryModel(db)
            
            query = {}
            if status:
                query["status"] = status
            if isinstance(keyword, str) and keyword.strip() != "":
                kw = keyword.strip()
                query["$or"] = [
                    {"contactName": {"$regex": kw, "$options": "i"}},
                    {"phone": {"$regex": kw, "$options": "i"}},
                    {"selectedProduct.name": {"$regex": kw, "$options": "i"}},
                ]
            
            cursor = inquiry_model.collection.find(query).sort("createdAt", -1).limit(1000)
            for item in cursor:
                item["_id"] = str(item["_id"])
                inquiries.append(item)
        
        # 检查是否有数据
        if not inquiries:
            logger.warning("没有符合条件的询价数据")
            return flask_error_response("没有符合条件的数据可导出", 404)
        
        logger.info(f"开始生成Excel文件，共 {len(inquiries)} 条记录")
        
        # 创建Excel工作簿
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "询价列表"
        
        # 设置表头
        headers = ["产品名称", "产品代码", "期权类型", "结构", "期限", "名义本金(万)", "行权价(%)", "交易商", "联系人", "电话", "状态", "备注", "创建时间"]
        header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
        header_font = Font(color="FFFFFF", bold=True)
        
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col, value=header)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")
        
        # 填充数据
        status_map = {
            "pending": "待处理",
            "processing": "处理中",
            "completed": "已完成",
            "rejected": "已拒绝"
        }
        
        type_map = {
            "call": "看涨",
            "put": "看跌"
        }
        
        for row_idx, inquiry in enumerate(inquiries, 2):
            product = inquiry.get('selectedProduct', {})
            ws.cell(row=row_idx, column=1, value=inquiry.get('productName', product.get('name', '')))
            ws.cell(row=row_idx, column=2, value=inquiry.get('productCode', product.get('code', '')))
            ws.cell(row=row_idx, column=3, value=type_map.get(inquiry.get('optionType', ''), inquiry.get('optionType', '')))
            ws.cell(row=row_idx, column=4, value=inquiry.get('structure', ''))
            ws.cell(row=row_idx, column=5, value=inquiry.get('term', ''))
            ws.cell(row=row_idx, column=6, value=inquiry.get('notionalAmount', ''))
            ws.cell(row=row_idx, column=7, value=inquiry.get('strikePrice', ''))
            ws.cell(row=row_idx, column=8, value=", ".join(inquiry.get('selectedDealers', [])) if isinstance(inquiry.get('selectedDealers'), list) else '')
            ws.cell(row=row_idx, column=9, value=inquiry.get('contactName', ''))
            ws.cell(row=row_idx, column=10, value=inquiry.get('contactPhone', inquiry.get('phone', '')))
            ws.cell(row=row_idx, column=11, value=status_map.get(inquiry.get('status', ''), inquiry.get('status', '')))
            ws.cell(row=row_idx, column=12, value=inquiry.get('notes', inquiry.get('remark', '')))
            
            created_at = inquiry.get('createdAt')
            if created_at:
                # 处理 datetime 对象或 ISO 字符串
                formatted_time = ""
                if hasattr(created_at, 'strftime'):
                    formatted_time = created_at.strftime('%Y-%m-%d %H:%M:%S')
                else:
                    try:
                        # 尝试解析 ISO 字符串
                        dt = datetime.datetime.fromisoformat(str(created_at).replace('Z', '+00:00'))
                        formatted_time = dt.strftime('%Y-%m-%d %H:%M:%S')
                    except Exception:
                        formatted_time = str(created_at)
                ws.cell(row=row_idx, column=13, value=formatted_time)
        
        # 自动调整列宽
        for col in ws.columns:
            max_length = 0
            column = col[0].column_letter
            for cell in col:
                try:
                    if len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except:
                    pass
            adjusted_width = min(max_length + 2, 50)
            ws.column_dimensions[column].width = adjusted_width
        
        # 保存到内存缓冲区
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        
        logger.info(f"✓ Excel文件生成成功")
        
        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=f'inquiries_{datetime.datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx'
        )
    except Exception as e:
        logger.error(f"导出询价失败: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return flask_error_response(str(e), 500)
