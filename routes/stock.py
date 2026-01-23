# -*- coding: utf-8 -*-
"""
股票API路由模块
提供股票数据相关的API接口
"""

from flask import Blueprint, request, current_app, jsonify
from backend_utils.response import success_response, error_response, paginated_response, flask_success_response, flask_error_response
from services.stock_service import StockService
from models.stock import StockModel
from pymongo.errors import PyMongoError
import logging

# 配置日志
logger = logging.getLogger(__name__)

# 创建股票API蓝图
stock_bp = Blueprint('stock', __name__, url_prefix='/api/stock')


@stock_bp.route('/realtime/<symbol>', methods=['GET'])
def get_realtime_data(symbol):
    """
    获取股票实时数据接口
    
    Args:
        symbol (str): 股票代码
        
    Query Parameters:
        None
        
    Returns:
        JSON: 股票实时数据响应
        
    Example:
        GET /api/stock/realtime/000001
        Response:
        {
            "success": true,
            "message": "操作成功",
            "data": {
                "code": "000001",
                "name": "平安银行",
                "price": 12.5,
                "change_percent": 1.2,
                "volume": 1000000,
                "amount": 12500000,
                "open": 12.3,
                "high": 12.6,
                "low": 12.2,
                "pre_close": 12.4
            },
            "code": 200
        }
    """
    try:
        # 记录请求日志
        logger.info(f"获取股票实时数据: {symbol}")
        
        # 调用服务获取实时数据
        stock_data = StockService.get_stock_realtime_data(symbol)
        
        if stock_data is None:
            logger.warning(f"未找到股票实时数据: {symbol}")
            return jsonify(error_response("未找到股票数据", 404)), 404
        
        # 获取数据库实例并保存数据
        db = current_app.db
        stock_model = StockModel(db)
        
        # 保存数据到数据库
        save_result = stock_model.save_stock_data(symbol, stock_data)
        if not save_result:
            logger.warning(f"保存股票数据到数据库失败: {symbol}")
        
        # 返回成功响应
        return jsonify(success_response(stock_data, "获取股票实时数据成功")), 200
        
    except PyMongoError as e:
        logger.error(f"获取股票实时数据时数据库异常: {symbol}, 错误: {str(e)}")
        return jsonify(error_response("数据库错误", 500)), 500
    except Exception as e:
        logger.error(f"获取股票实时数据时发生未知异常: {symbol}, 错误: {str(e)}")
        return jsonify(error_response("服务器内部错误", 500)), 500


@stock_bp.route('/history/<symbol>', methods=['GET'])
def get_history_data(symbol):
    """
    获取股票历史数据接口
    
    Args:
        symbol (str): 股票代码
        
    Query Parameters:
        period (str): 周期类型，可选 "daily"(日线)、"weekly"(周线)、"monthly"(月线)，默认为"daily"
        start_date (str): 开始日期，格式 "YYYYMMDD"，默认为空表示最近一年
        end_date (str): 结束日期，格式 "YYYYMMDD"，默认为空表示今天
        
    Returns:
        JSON: 股票历史数据响应
        
    Example:
        GET /api/stock/history/000001?period=daily&start_date=20230101&end_date=20231231
        Response:
        {
            "success": true,
            "message": "操作成功",
            "data": [
                {
                    "date": "2023-01-01",
                    "open": 12.3,
                    "high": 12.6,
                    "low": 12.2,
                    "close": 12.5,
                    "volume": 1000000,
                    "amount": 12500000,
                    "change_percent": 1.2
                },
                ...
            ],
            "code": 200
        }
    """
    try:
        # 记录请求日志
        logger.info(f"获取股票历史数据: {symbol}")
        
        # 获取查询参数
        period = request.args.get('period', 'daily')
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')
        
        # 参数验证
        if period not in ["daily", "weekly", "monthly"]:
            logger.warning(f"不支持的周期类型: {period}")
            return jsonify(error_response("不支持的周期类型", 400)), 400
        
        # 调用服务获取历史数据
        history_data = StockService.get_stock_history_data(symbol, period, start_date, end_date)
        
        if history_data is None:
            logger.warning(f"获取股票历史数据失败: {symbol}")
            return jsonify(error_response("获取股票历史数据失败", 500)), 500
        
        # 返回成功响应
        return jsonify(success_response(history_data, "获取股票历史数据成功")), 200
        
    except ValueError as e:
        logger.error(f"获取股票历史数据时参数错误: {symbol}, 错误: {str(e)}")
        return jsonify(error_response("参数错误", 400)), 400
    except Exception as e:
        logger.error(f"获取股票历史数据时发生未知异常: {symbol}, 错误: {str(e)}")
        return jsonify(error_response("服务器内部错误", 500)), 500


@stock_bp.route('/search', methods=['GET'])
def search_stocks():
    """
    搜索股票接口
    
    Args:
        None
        
    Query Parameters:
        keyword (str): 搜索关键词，必填
        
    Returns:
        JSON: 股票搜索结果响应
        
    Example:
        GET /api/stock/search?keyword=平安
        Response:
        {
            "success": true,
            "message": "操作成功",
            "data": [
                {
                    "code": "000001",
                    "name": "平安银行",
                    "price": 12.5,
                    "change_percent": 1.2
                },
                ...
            ],
            "code": 200
        }
    """
    try:
        # 记录请求日志
        logger.info("搜索股票")
        
        # 获取查询参数
        keyword = request.args.get('keyword', '')
        
        # 参数验证
        if not keyword:
            logger.warning("搜索关键词不能为空")
            return jsonify(error_response("搜索关键词不能为空", 400)), 400
        
        # 调用服务搜索股票
        search_results = StockService.search_stock(keyword)
        
        if search_results is None:
            logger.warning(f"股票搜索失败: {keyword}")
            return jsonify(error_response("股票搜索失败", 500)), 500
        
        # 返回成功响应
        return jsonify(success_response(search_results, "股票搜索成功")), 200
        
    except ValueError as e:
        logger.error(f"股票搜索时参数错误: {str(e)}")
        return jsonify(error_response("参数错误", 400)), 400
    except Exception as e:
        logger.error(f"股票搜索时发生未知异常: {str(e)}")
        return jsonify(error_response("服务器内部错误", 500)), 500


@stock_bp.route('/quotes/compare', methods=['GET'])
def compare_quotes():
    """
    跨交易商报价比较接口
    """
    try:
        stock_code = request.args.get('stock_code')
        quote_type = request.args.get('type')
        term = request.args.get('term')
        
        if not stock_code:
            return jsonify(error_response("缺少 stock_code", 400)), 400
            
        cloud_client = getattr(current_app, 'cloud_db', None)
        quotes = StockService.get_quotes_comparison(stock_code, quote_type, term, cloud_client)
        
        # 找出最低报价并标记
        if quotes:
            min_rate = float('inf')
            min_idx = -1
            for i, q in enumerate(quotes):
                rate = q.get('rate')
                if rate is not None and rate < min_rate:
                    min_rate = rate
                    min_idx = i
            
            if min_idx != -1:
                quotes[min_idx]['is_lowest'] = True
        
        return flask_success_response(quotes, "获取报价比较成功")
    except Exception as e:
        logger.error(f"报价比较接口异常: {e}")
        return flask_error_response(str(e), 500)


@stock_bp.route('/quotes/lowest', methods=['GET'])
def get_lowest_quote():
    """
    获取指定股票最低报价接口
    """
    try:
        stock_code = request.args.get('stock_code')
        quote_type = request.args.get('type')
        term = request.args.get('term')
        
        if not stock_code or not quote_type or not term:
            return flask_error_response("缺少参数 (stock_code, type, term)", 400)
            
        cloud_client = getattr(current_app, 'cloud_db', None)
        quote = StockService.get_lowest_quote(stock_code, quote_type, term, cloud_client)
        
        if not quote:
            return flask_error_response("未找到相关报价", 404)
            
        return flask_success_response(quote, "获取最低报价成功")
    except Exception as e:
        logger.error(f"获取最低报价接口异常: {e}")
        return flask_error_response(str(e), 500)


@stock_bp.route('/list', methods=['GET'])
def get_stock_list():
    """
    获取股票列表接口（从数据库）
    
    Args:
        None
        
    Query Parameters:
        page (int): 页码，默认为1
        per_page (int): 每页数量，默认为20，最大100
        
    Returns:
        JSON: 分页的股票列表响应
        
    Example:
        GET /api/stock/list?page=1&per_page=20
        Response:
        {
            "success": true,
            "message": "获取成功",
            "data": {
                "items": [...],
                "pagination": {
                    "page": 1,
                    "per_page": 20,
                    "total": 100,
                    "pages": 5
                }
            },
            "code": 200
        }
    """
    try:
        # 记录请求日志
        logger.info("获取股票列表")
        
        # 获取查询参数
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        
        # 参数验证和处理
        if page < 1:
            page = 1
        if per_page < 1:
            per_page = 20
        if per_page > 100:
            per_page = 100
            
        # 计算跳过的记录数
        skip = (page - 1) * per_page
        
        # 获取数据库实例
        db = current_app.db
        stock_model = StockModel(db)
        
        # 获取股票列表
        stocks = stock_model.get_all_stocks(skip, per_page)
        
        # 获取总数
        total = stock_model.count_stocks()
        
        # 返回分页响应
        return jsonify(paginated_response(stocks, page, per_page, total, "获取股票列表成功")), 200
        
    except PyMongoError as e:
        logger.error(f"获取股票列表时数据库异常: {str(e)}")
        return jsonify(error_response("数据库错误", 500)), 500
    except ValueError as e:
        logger.error(f"获取股票列表时参数错误: {str(e)}")
        return jsonify(error_response("参数错误", 400)), 400
    except Exception as e:
        logger.error(f"获取股票列表时发生未知异常: {str(e)}")
        return jsonify(error_response("服务器内部错误", 500)), 500
