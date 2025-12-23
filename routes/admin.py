# -*- coding: utf-8 -*-
from flask import Blueprint, request, current_app
import pandas as pd
import io
import logging
from utils.response import flask_success_response, flask_error_response
from models.stock import StockModel
from models.inquiry import InquiryModel
from models.order import OrderModel

logger = logging.getLogger(__name__)
admin_bp = Blueprint('admin', __name__)

@admin_bp.route('/stats', methods=['GET'])
def get_stats():
    """管理后台：获取统计数据"""
    try:
        db = getattr(current_app, 'db', None)
        if not db:
            return flask_error_response("数据库未连接", 500)
            
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
def get_orders():
    """管理后台：获取订单列表"""
    try:
        db = getattr(current_app, 'db', None)
        if not db:
            return flask_error_response("数据库未连接", 500)
            
        order_model = OrderModel(db)
        page = int(request.args.get('page', 1))
        page_size = int(request.args.get('pageSize', 20))
        
        orders = order_model.get_orders(limit=page_size, skip=(page - 1) * page_size)
        return flask_success_response(data=orders)
    except Exception as e:
        logger.error(f"获取订单列表失败: {e}")
        return flask_error_response(str(e), 500)

@admin_bp.route('/quotes', methods=['GET'])
def get_quotes():
    """管理后台：获取报价列表"""
    try:
        db = getattr(current_app, 'db', None)
        if not db:
            return flask_error_response("数据库未连接", 500)
            
        stock_model = StockModel(db)
        page = int(request.args.get('page', 1))
        page_size = int(request.args.get('pageSize', 20))
        
        stocks = stock_model.get_all_stocks(limit=page_size, skip=(page - 1) * page_size)
        return flask_success_response(data=stocks)
    except Exception as e:
        logger.error(f"获取报价列表失败: {e}")
        return flask_error_response(f"获取失败: {str(e)}", 500)

@admin_bp.route('/upload-quotes', methods=['POST'])
def upload_quotes():
    """管理后台：上传 Excel/CSV 更新报价数据"""
    if 'file' not in request.files:
        return flask_error_response("未找到上传文件", 400)
    
    file = request.files['file']
    if file.filename == '':
        return flask_error_response("文件名不能为空", 400)

    try:
        # 获取文件扩展名
        ext = file.filename.rsplit('.', 1)[-1].lower()
        
        # 根据文件类型读取数据
        if ext == 'xlsx' or ext == 'xls':
            df = pd.read_excel(io.BytesIO(file.read()))
        elif ext == 'csv':
            df = pd.read_csv(io.BytesIO(file.read()))
        else:
            return flask_error_response("仅支持 Excel (.xlsx, .xls) 或 CSV 文件", 400)
        
        db = getattr(current_app, 'db', None)
        if not db:
            return flask_error_response("数据库未连接", 500)
            
        stock_model = StockModel(db)
        
        # 批量处理数据
        stock_list = []
        
        # 模仿 convert_excel_to_json.py 的列映射逻辑
        column_mapping = {
            'code': ['代码', '股票代码', 'Code', '证券代码', 'A股代码'],
            'name': ['名称', '股票名称', 'Name', '证券简称', 'A股简称'],
            'price': ['现价', '最新价', '价格', 'Price', '收盘价'],
            'changePercent': ['涨跌幅', '涨跌', 'Change', '涨跌幅(%)'],
            'volume': ['成交量', 'Volume', '总手'],
            'amount': ['成交额', 'Amount', '金额']
        }

        found_cols = {}
        for key, candidates in column_mapping.items():
            for col in df.columns:
                if any(cand in str(col) for cand in candidates):
                    found_cols[key] = col
                    break
        
        if 'code' not in found_cols:
            return flask_error_response("无法识别 '代码' 列", 400)

        for _, row in df.iterrows():
            # 提取代码
            import re
            raw_code = str(row[found_cols['code']])
            code_match = re.search(r'\d{6}', raw_code)
            if not code_match: continue
            code = code_match.group(0)
            
            # 提取名称
            name = str(row[found_cols.get('name')]) if 'name' in found_cols else ""
            
            # 辅助函数：安全获取浮点数
            def get_float(col_key, default=0.0):
                if col_key in found_cols:
                    try:
                        val = row[found_cols[col_key]]
                        return float(val) if not pd.isna(val) else default
                    except:
                        return default
                return default

            stock_list.append({
                "stock_code": code,
                "name": name,
                "price": get_float('price'),
                "changePercent": get_float('changePercent'),
                "volume": get_float('volume'),
                "amount": get_float('amount'),
                "updateSource": "file_upload"
            })
            
        success_count = stock_model.bulk_save_stock_data(stock_list)
            
        return flask_success_response(
            data={"processed": success_count}, 
            message=f"成功处理 {success_count} 条数据"
        )
    except Exception as e:
        logger.error(f"文件解析失败: {e}")
        return flask_error_response(f"解析失败: {str(e)}", 500)

@admin_bp.route('/crawl-quotes', methods=['POST'])
def crawl_quotes():
    """管理后台：触发爬虫抓取最新行情"""
    try:
        import akshare as ak
        # 获取 A 股实时行情 (东财源)
        df = ak.stock_zh_a_spot_em()
        if df.empty:
            return flask_error_response("抓取数据为空", 500)
            
        db = getattr(current_app, 'db', None)
        if not db:
            return flask_error_response("数据库未连接", 500)
            
        stock_model = StockModel(db)
        stock_list = []
        
        # 只取前 200 条作为示例，或者根据需求取全部
        df_sample = df.head(200) 
        
        for _, row in df_sample.iterrows():
            stock_list.append({
                "stock_code": str(row['代码']),
                "name": str(row['名称']),
                "price": float(row['最新价']),
                "changePercent": float(row['涨跌幅']),
                "open": float(row.get('开盘', 0)),
                "high": float(row.get('最高', 0)),
                "low": float(row.get('最低', 0)),
                "volume": float(row['成交量']),
                "amount": float(row['成交额']),
                "updateSource": "crawler_sina"
            })
            
        success_count = stock_model.bulk_save_stock_data(stock_list)
        
        return flask_success_response(
            data={"processed": success_count},
            message=f"成功从新浪财经/东财抓取并更新 {success_count} 条数据"
        )
    except Exception as e:
        logger.error(f"爬虫抓取失败: {e}")
        return flask_error_response(f"抓取失败: {str(e)}", 500)
