# -*- coding: utf-8 -*-
from flask import Blueprint, request, current_app
import pandas as pd
import io
import logging
from utils.response import flask_success_response, flask_error_response
from models.stock import StockModel

logger = logging.getLogger(__name__)
admin_bp = Blueprint('admin', __name__)

@admin_bp.route('/upload-quotes', methods=['POST'])
def upload_quotes():
    """管理后台：上传 Excel 更新报价数据"""
    if 'file' not in request.files:
        return flask_error_response("未找到上传文件", 400)
    
    file = request.files['file']
    if file.filename == '':
        return flask_error_response("文件名不能为空", 400)

    try:
        # 读取 Excel 文件
        df = pd.read_excel(io.BytesIO(file.read()))
        
        db = getattr(current_app, 'db', None)
        if not db:
            return flask_error_response("数据库未连接", 500)
            
        stock_model = StockModel(db)
        
        # 遍历 Excel 数据并更新数据库
        success_count = 0
        for _, row in df.iterrows():
            # 自动适配列名
            code = str(row.get('代码', row.get('code', ''))).strip()
            if not code or code == 'nan': continue
            
            data = {
                "name": row.get('名称', row.get('name', '')),
                "price": float(row.get('现价', row.get('price', 0))),
                "changePercent": float(row.get('涨跌幅', row.get('changePercent', 0))),
                "updateSource": "admin_system"
            }
            stock_model.save_stock_data(code, data)
            success_count += 1
            
        return flask_success_response(
            data={"processed": success_count}, 
            message=f"成功处理 {success_count} 条数据"
        )
    except Exception as e:
        logger.error(f"Excel 解析失败: {e}")
        return flask_error_response(f"解析失败: {str(e)}", 500)
