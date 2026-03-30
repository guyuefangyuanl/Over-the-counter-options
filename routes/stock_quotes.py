# -*- coding: utf-8 -*-
"""
期权报价API路由模块
提供批量获取期权报价的API接口
"""

from flask import Blueprint, request, current_app, jsonify
from backend_utils.response import success_response, error_response, flask_success_response, flask_error_response
from services.batch_quote_service import get_batch_quote_service
from services.stock_service import StockService
import logging

# 配置日志
logger = logging.getLogger(__name__)

# 创建期权报价API蓝图
stock_quotes_bp = Blueprint('stock_quotes', __name__, url_prefix='/api/stock')


@stock_quotes_bp.route('/option-quotes/batch', methods=['POST'])
def get_batch_option_quotes():
    """
    批量获取期权报价接口
    
    Request Body:
    {
        "stockCodes": ["300750.SZ", "600519.SH", ...],  // 必填，最多50个
        "term": "1M",           // 可选，默认1M，可选值: 2W, 1M, 2M, 3M, 6M, 9M, 1Y
        "optionType": "call",   // 可选，默认call，可选值: call, put
        "structure": "vanilla"  // 可选，默认vanilla
    }
    
    Response:
    {
        "success": true,
        "data": {
            "quotes": [
                {
                    "stockCode": "300750.SZ",
                    "stockName": "宁德时代",
                    "price": 180.50,
                    "atm": {
                        "strikeRatio": 100,
                        "premium": 11.83,
                        "premiumPercent": 6.56
                    },
                    "otm105": {
                        "strikeRatio": 105,
                        "premium": 9.77,
                        "premiumPercent": 5.43
                    },
                    "otm110": {
                        "strikeRatio": 110,
                        "premium": 8.01,
                        "premiumPercent": 4.45
                    },
                    "greeks": {
                        "delta": 0.52,
                        "gamma": 0.015,
                        "theta": -0.023,
                        "vega": 0.35,
                        "rho": 0.08
                    },
                    "volatility": 0.30,
                    "updateTime": "2026-03-28T15:30:00Z"
                }
            ],
            "term": "1M",
            "optionType": "call",
            "modelUsed": "black_scholes",
            "totalCount": 2,
            "successCount": 2,
            "cacheHit": false
        },
        "message": "获取成功"
    }
    """
    try:
        # 解析请求参数
        data = request.get_json()
        
        if not data:
            return jsonify(flask_error_response("请求体不能为空", 400)), 400
        
        # 获取股票代码列表
        stock_codes = data.get('stockCodes', [])
        
        if not stock_codes:
            return jsonify(flask_error_response("股票代码列表不能为空", 400)), 400
        
        if not isinstance(stock_codes, list):
            return jsonify(flask_error_response("股票代码必须是数组格式", 400)), 400
        
        if len(stock_codes) > 50:
            return jsonify(flask_error_response("股票代码数量超过限制（最多50个）", 400)), 400
        
        # 标准化股票代码格式（统一大写）
        stock_codes = [code.upper() for code in stock_codes]
        
        # 获取可选参数
        term = data.get('term', '1M').upper()
        option_type = data.get('optionType', 'call').lower()
        structure = data.get('structure', 'vanilla').lower()
        
        # 验证参数
        valid_terms = ['2W', '1M', '2M', '3M', '6M', '9M', '1Y', '12M']
        if term not in valid_terms:
            return jsonify(flask_error_response(f"期限参数无效，可选值: {', '.join(valid_terms)}", 400)), 400
        
        valid_option_types = ['call', 'put']
        if option_type not in valid_option_types:
            return jsonify(flask_error_response(f"期权类型无效，可选值: {', '.join(valid_option_types)}", 400)), 400
        
        # 尝试获取股票当前价格（可选）
        stock_prices = {}
        try:
            # 批量获取股票实时数据
            for code in stock_codes:
                try:
                    # 去掉后缀获取纯代码
                    pure_code = code.split('.')[0]
                    stock_data = StockService.get_stock_realtime_data(pure_code)
                    if stock_data and 'price' in stock_data:
                        stock_prices[code] = stock_data['price']
                except Exception as e:
                    logger.debug(f"获取股票价格失败 {code}: {e}")
                    # 失败时使用模拟价格（在服务层处理）
        except Exception as e:
            logger.warning(f"批量获取股票价格失败，将使用模拟价格: {e}")
        
        # 调用批量报价服务
        quote_service = get_batch_quote_service()
        result = quote_service.get_batch_quotes(
            stock_codes=stock_codes,
            term=term,
            option_type=option_type,
            structure=structure,
            stock_prices=stock_prices if stock_prices else None
        )
        
        # 检查是否有错误
        if 'error' in result:
            return jsonify(flask_error_response(result['error'], 400)), 400
        
        # 返回成功响应
        return jsonify(flask_success_response(result, "获取期权报价成功")), 200
        
    except Exception as e:
        logger.error(f"批量获取期权报价时发生异常: {e}", exc_info=True)
        return jsonify(flask_error_response("服务器内部错误", 500)), 500


@stock_quotes_bp.route('/option-quotes/single', methods=['GET'])
def get_single_option_quote():
    """
    获取单个股票的期权报价（便捷接口）
    
    Query Parameters:
        code: 股票代码（必填），如 300750.SZ
        term: 期限（可选），默认 1M
        optionType: 期权类型（可选），默认 call
    
    Example:
        GET /api/stock/option-quotes/single?code=300750.SZ&term=1M&optionType=call
    """
    try:
        # 获取查询参数
        stock_code = request.args.get('code', '').upper()
        term = request.args.get('term', '1M').upper()
        option_type = request.args.get('optionType', 'call').lower()
        
        if not stock_code:
            return jsonify(flask_error_response("股票代码不能为空", 400)), 400
        
        # 调用批量接口（单个股票）
        quote_service = get_batch_quote_service()
        result = quote_service.get_batch_quotes(
            stock_codes=[stock_code],
            term=term,
            option_type=option_type
        )
        
        if 'error' in result:
            return jsonify(flask_error_response(result['error'], 400)), 400
        
        # 提取单个报价
        quotes = result.get('quotes', [])
        if not quotes:
            return jsonify(flask_error_response("无法计算期权报价", 500)), 500
        
        single_quote = quotes[0]
        
        return jsonify(flask_success_response(single_quote, "获取期权报价成功")), 200
        
    except Exception as e:
        logger.error(f"获取单个股指报价时发生异常: {e}", exc_info=True)
        return jsonify(flask_error_response("服务器内部错误", 500)), 500


@stock_quotes_bp.route('/option-quotes/terms', methods=['GET'])
def get_supported_terms():
    """
    获取支持的期限列表
    """
    terms = [
        {'code': '2W', 'name': '2周', 'days': 14},
        {'code': '1M', 'name': '1个月', 'days': 30},
        {'code': '2M', 'name': '2个月', 'days': 60},
        {'code': '3M', 'name': '3个月', 'days': 90},
        {'code': '6M', 'name': '6个月', 'days': 180},
        {'code': '9M', 'name': '9个月', 'days': 270},
        {'code': '1Y', 'name': '1年', 'days': 365}
    ]
    
    return jsonify(flask_success_response(terms, "获取成功")), 200