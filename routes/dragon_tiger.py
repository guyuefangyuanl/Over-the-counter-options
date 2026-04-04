# -*- coding: utf-8 -*-
"""
龙虎榜API路由模块
提供场外期权龙虎榜数据相关的API接口
"""

from flask import Blueprint, request, current_app
from backend_utils.response import flask_success_response, flask_error_response
from datetime import datetime, timedelta
import logging
import random

logger = logging.getLogger(__name__)

dragon_tiger_bp = Blueprint('dragon_tiger', __name__, url_prefix='/api/v1/dragon-tiger')


def generate_mock_dragon_tiger_data(date=None, limit=20, offset=0, sort_by='turnover', sort_order='desc', stock_type=None):
    """
    生成模拟龙虎榜数据
    
    Args:
        date: 日期字符串 YYYY-MM-DD
        limit: 返回数量
        offset: 偏移量
        sort_by: 排序字段 (turnover, change_percent, amount)
        sort_order: 排序方向 (asc, desc)
        stock_type: 股票类型筛选
        
    Returns:
        dict: 包含列表和分页信息的数据
    """
    # 模拟股票池
    stocks = [
        {'code': '000001.SZ', 'name': '平安银行', 'base_price': 12.50},
        {'code': '000002.SZ', 'name': '万科A', 'base_price': 8.20},
        {'code': '000063.SZ', 'name': '中兴通讯', 'base_price': 28.50},
        {'code': '000333.SZ', 'name': '美的集团', 'base_price': 58.00},
        {'code': '000651.SZ', 'name': '格力电器', 'base_price': 35.20},
        {'code': '000725.SZ', 'name': '京东方A', 'base_price': 4.50},
        {'code': '000858.SZ', 'name': '五粮液', 'base_price': 168.00},
        {'code': '002415.SZ', 'name': '海康威视', 'base_price': 32.00},
        {'code': '002594.SZ', 'name': '比亚迪', 'base_price': 268.00},
        {'code': '300059.SZ', 'name': '东方财富', 'base_price': 18.50},
        {'code': '300750.SZ', 'name': '宁德时代', 'base_price': 198.00},
        {'code': '600000.SH', 'name': '浦发银行', 'base_price': 7.80},
        {'code': '600036.SH', 'name': '招商银行', 'base_price': 32.50},
        {'code': '600519.SH', 'name': '贵州茅台', 'base_price': 1780.00},
        {'code': '600900.SH', 'name': '长江电力', 'base_price': 25.00},
        {'code': '601318.SH', 'name': '中国平安', 'base_price': 45.00},
        {'code': '601398.SH', 'name': '工商银行', 'base_price': 4.80},
        {'code': '601857.SH', 'name': '中国石油', 'base_price': 7.50},
        {'code': '601888.SH', 'name': '中国中免', 'base_price': 85.00},
        {'code': '603259.SH', 'name': '药明康德', 'base_price': 72.00},
        {'code': '600309.SH', 'name': '万华化学', 'base_price': 92.00},
        {'code': '002475.SZ', 'name': '立讯精密', 'base_price': 28.00},
        {'code': '300124.SZ', 'name': '汇川技术', 'base_price': 65.00},
        {'code': '600276.SH', 'name': '恒瑞医药', 'base_price': 42.00},
        {'code': '601012.SH', 'name': '隆基绿能', 'base_price': 22.00},
        {'code': '600887.SH', 'name': '伊利股份', 'base_price': 28.00},
        {'code': '002352.SZ', 'name': '顺丰控股', 'base_price': 42.00},
        {'code': '600048.SH', 'name': '保利发展', 'base_price': 10.50},
        {'code': '601166.SH', 'name': '兴业银行', 'base_price': 16.00},
        {'code': '000568.SZ', 'name': '泸州老窖', 'base_price': 185.00},
    ]
    
    # 类型标记
    stock_types = ['沪深', '沪市', '深市', '创业板', '科创板']
    
    # 生成龙虎榜数据
    dragon_tiger_list = []
    for i, stock in enumerate(stocks):
        # 随机涨跌幅 (-10% ~ +10%)
        change_percent = round(random.uniform(-10, 10), 2)
        # 计算当前价格
        current_price = round(stock['base_price'] * (1 + change_percent / 100), 2)
        # 成交额 (千万级别)
        turnover = round(random.uniform(1000, 50000), 2)
        # 期权费率
        atm_rate = round(random.uniform(5, 20), 2)
        otm105_rate = round(atm_rate * 0.85, 2)
        otm110_rate = round(atm_rate * 0.7, 2)
        # 上榜原因
        reasons = ['日涨幅偏离值达7%', '日跌幅偏离值达7%', '日换手率达到20%', 
                   '连续三日涨幅偏离值累计达20%', '连续三日跌幅偏离值累计达20%']
        reason = random.choice(reasons)
        
        item = {
            'rank': i + 1,
            'code': stock['code'],
            'name': stock['name'],
            'price': current_price,
            'changePercent': change_percent,
            'turnover': turnover,  # 成交额（万元）
            'amount': round(turnover * current_price / 1000, 2),  # 成交量（手）
            'atm': atm_rate,  # 平值期权费率
            'otm105': otm105_rate,  # 虚值105期权费率
            'otm110': otm110_rate,  # 虚值110期权费率
            'reason': reason,  # 上榜原因
            'type': random.choice(stock_types),  # 股票类型
            'date': date or datetime.now().strftime('%Y-%m-%d'),
        }
        dragon_tiger_list.append(item)
    
    # 按条件筛选
    if stock_type and stock_type != '全部':
        dragon_tiger_list = [item for item in dragon_tiger_list if item['type'] == stock_type]
    
    # 排序
    reverse = sort_order == 'desc'
    if sort_by == 'turnover':
        dragon_tiger_list.sort(key=lambda x: x['turnover'], reverse=reverse)
    elif sort_by == 'changePercent':
        dragon_tiger_list.sort(key=lambda x: x['changePercent'], reverse=reverse)
    elif sort_by == 'amount':
        dragon_tiger_list.sort(key=lambda x: x['amount'], reverse=reverse)
    
    # 更新排名
    for i, item in enumerate(dragon_tiger_list):
        item['rank'] = i + 1
    
    # 分页
    total = len(dragon_tiger_list)
    paginated_list = dragon_tiger_list[offset:offset + limit]
    
    return {
        'list': paginated_list,
        'pagination': {
            'total': total,
            'page': offset // limit + 1,
            'pageSize': limit,
            'totalPages': (total + limit - 1) // limit
        },
        'updateTime': datetime.now().strftime('%Y/%m/%d %H:%M'),
        'date': date or datetime.now().strftime('%Y-%m-%d'),
    }


@dragon_tiger_bp.route('/list', methods=['GET'])
def get_dragon_tiger_list():
    """
    获取龙虎榜列表
    
    Query Parameters:
        date: 日期筛选 (YYYY-MM-DD)，默认今天
        type: 股票类型筛选 (全部/沪深/沪市/深市/创业板/科创板)
        sort_by: 排序字段 (turnover/changePercent/amount)，默认 turnover
        sort_order: 排序方向 (asc/desc)，默认 desc
        page: 页码，默认 1
        pageSize: 每页数量，默认 20
        
    Returns:
        JSON: 龙虎榜列表数据
    """
    try:
        # 获取查询参数
        date = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
        stock_type = request.args.get('type', '全部')
        sort_by = request.args.get('sort_by', 'turnover')
        sort_order = request.args.get('sort_order', 'desc')
        page = request.args.get('page', 1, type=int)
        page_size = request.args.get('pageSize', 20, type=int)
        
        # 参数验证
        if sort_by not in ['turnover', 'changePercent', 'amount']:
            return flask_error_response('无效的排序字段', 400)
        
        if sort_order not in ['asc', 'desc']:
            return flask_error_response('无效的排序方向', 400)
        
        if page < 1:
            page = 1
        if page_size < 1 or page_size > 100:
            page_size = 20
        
        offset = (page - 1) * page_size
        
        # 尝试从云数据库获取数据
        cloud_db = getattr(current_app, 'cloud_db', None)
        
        if cloud_db:
            try:
                # 构建查询
                query = f"db.collection('dragon_tiger').where({{date: '{date}'}}).orderBy('{sort_by}', '{sort_order}').skip({offset}).limit({page_size}).get()"
                result = cloud_db.query(query)
                
                if result:
                    # 获取总数
                    count_query = f"db.collection('dragon_tiger').where({{date: '{date}'}}).count()"
                    count_result = cloud_db.query(count_query)
                    total = count_result.get('total', 0) if count_result else 0
                    
                    return flask_success_response({
                        'list': result,
                        'pagination': {
                            'total': total,
                            'page': page,
                            'pageSize': page_size,
                            'totalPages': (total + page_size - 1) // page_size
                        },
                        'updateTime': datetime.now().strftime('%Y/%m/%d %H:%M'),
                        'date': date,
                    }, '获取龙虎榜数据成功')
            except Exception as e:
                logger.warning(f'从云数据库获取龙虎榜数据失败: {e}，使用模拟数据')
        
        # 使用模拟数据
        data = generate_mock_dragon_tiger_data(
            date=date,
            limit=page_size,
            offset=offset,
            sort_by=sort_by,
            sort_order=sort_order,
            stock_type=stock_type
        )
        
        return flask_success_response(data, '获取龙虎榜数据成功')
        
    except Exception as e:
        logger.error(f'获取龙虎榜列表异常: {e}')
        return flask_error_response(str(e), 500)


@dragon_tiger_bp.route('/detail/<code>', methods=['GET'])
def get_dragon_tiger_detail(code):
    """
    获取龙虎榜个股详情
    
    Args:
        code: 股票代码
        
    Query Parameters:
        date: 日期筛选 (YYYY-MM-DD)，默认今天
        
    Returns:
        JSON: 个股龙虎榜详情数据
    """
    try:
        date = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
        
        # 尝试从云数据库获取
        cloud_db = getattr(current_app, 'cloud_db', None)
        
        if cloud_db:
            try:
                query = f"db.collection('dragon_tiger').where({{code: '{code}', date: '{date}'}}).get()"
                result = cloud_db.query(query)
                
                if result and len(result) > 0:
                    return flask_success_response(result[0], '获取龙虎榜详情成功')
            except Exception as e:
                logger.warning(f'从云数据库获取龙虎榜详情失败: {e}')
        
        # 生成模拟详情数据
        detail = {
            'code': code,
            'name': '模拟股票',
            'price': 25.50,
            'changePercent': 5.23,
            'turnover': 15000,
            'amount': 600,
            'atm': 12.5,
            'otm105': 10.5,
            'otm110': 8.5,
            'reason': '日涨幅偏离值达7%',
            'type': '沪深',
            'date': date,
            'updateTime': datetime.now().strftime('%Y/%m/%d %H:%M'),
            'traders': [
                {'name': '中信证券', 'buyAmount': 5000, 'sellAmount': 2000, 'netBuy': 3000},
                {'name': '华泰证券', 'buyAmount': 3500, 'sellAmount': 1500, 'netBuy': 2000},
                {'name': '招商证券', 'buyAmount': 2000, 'sellAmount': 1800, 'netBuy': 200},
            ]
        }
        
        return flask_success_response(detail, '获取龙虎榜详情成功')
        
    except Exception as e:
        logger.error(f'获取龙虎榜详情异常: {e}')
        return flask_error_response(str(e), 500)


@dragon_tiger_bp.route('/dates', methods=['GET'])
def get_available_dates():
    """
    获取有龙虎榜数据的日期列表
    
    Returns:
        JSON: 日期列表
    """
    try:
        # 生成最近5个交易日的日期
        dates = []
        today = datetime.now()
        for i in range(5):
            date = today - timedelta(days=i)
            if date.weekday() < 5:  # 排除周末
                dates.append({
                    'date': date.strftime('%Y-%m-%d'),
                    'label': date.strftime('%m/%d'),
                    'isToday': i == 0
                })
        
        return flask_success_response({
            'dates': dates,
            'latestDate': dates[0]['date'] if dates else None
        }, '获取日期列表成功')
        
    except Exception as e:
        logger.error(f'获取日期列表异常: {e}')
        return flask_error_response(str(e), 500)


@dragon_tiger_bp.route('/summary', methods=['GET'])
def get_dragon_tiger_summary():
    """
    获取龙虎榜统计摘要
    
    Query Parameters:
        date: 日期筛选 (YYYY-MM-DD)，默认今天
        
    Returns:
        JSON: 统计摘要数据
    """
    try:
        date = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
        
        summary = {
            'totalStocks': 30,
            'upCount': 18,
            'downCount': 12,
            'avgChange': 2.35,
            'maxUp': {'code': '300750.SZ', 'name': '宁德时代', 'changePercent': 9.98},
            'maxDown': {'code': '601857.SH', 'name': '中国石油', 'changePercent': -8.56},
            'totalTurnover': 580000,
            'date': date,
            'updateTime': datetime.now().strftime('%Y/%m/%d %H:%M'),
        }
        
        return flask_success_response(summary, '获取统计摘要成功')
        
    except Exception as e:
        logger.error(f'获取统计摘要异常: {e}')
        return flask_error_response(str(e), 500)