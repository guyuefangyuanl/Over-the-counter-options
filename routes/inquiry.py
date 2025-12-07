from flask import Blueprint, jsonify, request
import datetime

inquiry_bp = Blueprint('inquiry', __name__)

# 模拟数据库 - 报价列表
# 真实场景中，这应该从数据库读取，或者通过 akshare 实时获取
MOCK_QUOTES = [
    { "id": 1, "group": "group1", "type": "stock", "name": "贵州茅台", "code": "600519", "changePercent": 1.23, "term": "1M", "structure": "vanilla", "dealers": ["CICC", "CITIC"], "rates": { "100": 10.50, "105": 8.30, "110": 6.50 } },
    { "id": 2, "group": "group1", "type": "stock", "name": "宁德时代", "code": "300750", "changePercent": -2.45, "term": "1M", "structure": "vanilla", "dealers": ["CICC", "GJS"], "rates": { "100": 12.80, "105": 10.20, "110": 8.90 } },
    { "id": 3, "group": "group2", "type": "stock", "name": "比亚迪", "code": "002594", "changePercent": 3.10, "term": "2M", "structure": "vanilla", "dealers": ["CITIC"], "rates": { "100": 15.25, "105": 12.85, "110": 10.45 } },
    { "id": 4, "group": "holding", "type": "stock", "name": "药明康德", "code": "603259", "changePercent": 0.55, "term": "3M", "structure": "snowball", "dealers": ["CICC", "CITIC", "GJS"], "rates": { "100": 18.00, "105": 15.50, "110": 13.00 } },
    { "id": 5, "group": "all", "type": "index", "name": "沪深300指数", "code": "000300", "changePercent": -0.55, "term": "1M", "structure": "vanilla", "dealers": ["GJS"], "rates": { "100": 5.50, "105": 4.30, "110": 3.50 } },
]

# 模拟数据库 - 询价记录表
MOCK_INQUIRIES = []

@inquiry_bp.route('/quotes', methods=['GET'])
def get_quotes():
    """获取报价列表"""
    # 这里可以添加筛选逻辑，比如 request.args.get('type')
    return jsonify({
        "success": True,
        "message": "获取成功",
        "data": MOCK_QUOTES
    })

@inquiry_bp.route('/inquiry', methods=['POST'])
def create_inquiry():
    """提交询价"""
    data = request.json
    
    # 简单的后端校验
    if not data.get('selectedProduct'):
        return jsonify({"success": False, "message": "未选择产品"}), 400
    
    # 构造存储对象
    new_inquiry = {
        "id": len(MOCK_INQUIRIES) + 1,
        "product": data.get('selectedProduct'),
        "quantity": data.get('quantity'),
        "contactName": data.get('contactName'),
        "phone": data.get('contactPhone'),
        "status": "pending", # 待处理
        "createdAt": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    
    # 存入"数据库"
    MOCK_INQUIRIES.append(new_inquiry)
    
    print(f"收到新询价: {new_inquiry}") # 打印日志方便调试
    
    return jsonify({
        "success": True,
        "message": "询价提交成功",
        "data": new_inquiry
    })
