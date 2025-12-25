from flask import Blueprint, jsonify, request, current_app
import datetime
import logging
from models.inquiry import InquiryModel
from utils.response import flask_success_response, flask_error_response

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
    """获取报价列表"""
    return jsonify({
        "success": True,
        "message": "获取成功",
        "data": MOCK_QUOTES
    })

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
def admin_get_inquiries():
    """管理后台：获取询价列表"""
    try:
        db = getattr(current_app, 'db', None)
        if not db:
            return flask_success_response(data=[], message="数据库未连接，返回空询价列表")
            
        inquiry_model = InquiryModel(db)
        page = int(request.args.get('page', 1))
        page_size = int(request.args.get('pageSize', 20))
        status = request.args.get('status')
        
        inquiries = inquiry_model.get_inquiries(
            limit=page_size, 
            skip=(page - 1) * page_size,
            status=status
        )
        return flask_success_response(data=inquiries)
    except Exception as e:
        logger.error(f"获取询价列表失败: {e}")
        return flask_error_response(str(e), 500)

@inquiry_bp.route('/admin/inquiries/<id>/status', methods=['PUT'])
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
        success = inquiry_model.update_status(id, status, remark)
        
        if success:
            return flask_success_response(message="状态更新成功")
        else:
            return flask_error_response("状态更新失败", 500)
    except Exception as e:
        logger.error(f"更新询价状态失败: {e}")
        return flask_error_response(str(e), 500)
