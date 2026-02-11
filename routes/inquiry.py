from flask import Blueprint, jsonify, request, current_app, g
import logging
from backend_utils.response import flask_success_response, flask_error_response, flask_paginated_response
from routes.auth import require_auth
from services.trade_service import TradeService

logger = logging.getLogger(__name__)
inquiry_bp = Blueprint('inquiry', __name__)
trade_service = TradeService()

@inquiry_bp.route('/inquiry', methods=['POST'])
def create_inquiry():
    """提交询价"""
    try:
        data = request.json
        if not data.get('selectedProduct'):
            return flask_error_response("未选择产品", 400)
        
        # 如果是小程序用户，关联openid
        # 目前 API 是公开的吗？或者是通过微信登录后的 token 访问？
        # 如果是公开的（app.py 中似乎没有 require_auth），则可能无法获取 g.admin
        # 但通常提交询价应该需要登录。
        # 如果没有 require_auth，我们尝试获取 user_id
        # 暂时保持原逻辑，只负责创建
        
        inquiry_id = trade_service.create_inquiry(data)
        
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
        page = request.args.get('page', 1, type=int)
        page_size = request.args.get('pageSize', 20, type=int)
        status = request.args.get('status')
        # keyword filtering is not yet fully implemented in generic service for all fields,
        # but we can filter in memory or extend service later.
        # For now, let's just get by status.
        
        items, total = trade_service.get_inquiries(limit=page_size, page=page, status=status)
        
        return flask_paginated_response(
            data=items,
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
            
        operator = "system"
        if hasattr(g, 'admin'):
            operator = g.admin.get("sub", "unknown")
            
        success = trade_service.update_inquiry_status(id, status, remark, operator)
        
        if success:
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
        stats = trade_service.get_inquiry_statistics()
        return flask_success_response(data=stats, message="统计成功")
    except Exception as e:
        logger.error(f"获取统计信息失败: {e}")
        return flask_error_response(str(e), 500)

@inquiry_bp.route('/admin/inquiries/batch-update', methods=['POST'])
@require_auth
def admin_batch_update_inquiries():
    """批量更新询价状态"""
    try:
        data = request.json
        ids = data.get('ids', [])
        status = data.get('status')
        
        if not ids or not isinstance(ids, list) or not status:
             return flask_error_response("参数错误", 400)
        
        operator = "system"
        if hasattr(g, 'admin'):
            operator = g.admin.get("sub", "unknown")
            
        count = 0
        for iid in ids:
            # 简单循环更新，生产环境可优化为批量操作
            if trade_service.update_inquiry_status(iid, status, operator=operator):
                count += 1
        
        return flask_success_response(message=f"成功更新 {count} 条记录")
    except Exception as e:
        logger.error(f"批量更新失败: {e}")
        return flask_error_response(str(e), 500)

@inquiry_bp.route('/admin/inquiries/export', methods=['GET'])
@require_auth
def admin_export_inquiries():
    """导出询价列表"""
    try:
        status = request.args.get('status')
        # 导出限制1000条
        items, _ = trade_service.get_inquiries(limit=1000, page=1, status=status)
        
        if not items:
            return flask_error_response("没有数据可导出", 404)

        import pandas as pd
        from io import BytesIO
        from flask import send_file
        
        # 格式化数据
        export_data = []
        for item in items:
            prod = item.get('selectedProduct', {})
            export_data.append({
                "ID": item.get('_id'),
                "提交时间": item.get('createdAt'),
                "客户姓名": item.get('contactName'),
                "电话": item.get('phone'),
                "产品名称": item.get('productName') or prod.get('name'),
                "代码": item.get('productCode') or prod.get('code'),
                "方向": item.get('optionType'),
                "结构": item.get('structure'),
                "期限": item.get('term'),
                "名义本金(万)": item.get('notionalAmount'),
                "行权价(%)": item.get('strikePrice'),
                "状态": item.get('status'),
                "备注": item.get('remark')
            })
            
        df = pd.DataFrame(export_data)
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False)
        output.seek(0)
        
        return send_file(
            output, 
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            download_name=f"inquiries_{status or 'all'}.xlsx", 
            as_attachment=True
        )
    except Exception as e:
        logger.error(f"导出失败: {e}")
        return flask_error_response(str(e), 500)
