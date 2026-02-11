import logging
import time
from typing import List, Dict, Any, Optional
from flask import current_app
from services.stock_service import StockService

logger = logging.getLogger(__name__)

class QuoteService:
    _cache = {}
    _cache_ttl = 60  # seconds

    def __init__(self):
        pass

    def _get_group_model(self):
        from models.group import GroupModel
        ensure_db = getattr(current_app, "ensure_db", None)
        db = None
        if callable(ensure_db):
            db = ensure_db()
        if db is None:
            db = getattr(current_app, "db", None)
        
        cloud_db = getattr(current_app, "cloud_db", None)
        return GroupModel(db, cloud_client=cloud_db)

    def get_group_quotes(self, group_id: str) -> List[Dict[str, Any]]:
        """
        获取分组内的股票实时行情
        """
        # Check cache
        cache_key = f"group_quotes_{group_id}"
        cached = self._cache.get(cache_key)
        if cached:
            timestamp, data = cached
            if time.time() - timestamp < self._cache_ttl:
                return data

        model = self._get_group_model()
        group = model.get_group_by_id(group_id)
        
        if not group or not group.get('members'):
            return []
            
        quotes = []
        members = group.get('members', [])
        
        # Parallel fetch could be better but for now sequential is safer/simpler
        # Or if Akshare supports batch fetch, use that.
        # Akshare usually fetches all spot data in one go efficiently if we use the right function, 
        # but StockService.get_stock_realtime_data fetches all and filters.
        # It's better to fetch once and filter.
        
        # Optimization: Fetch all spot data once
        import akshare as ak
        try:
            # Check if we can cache this call or if StockService has caching
            # For now, let's call akshare directly here for batch processing to avoid N calls
            stock_data = ak.stock_zh_a_spot_em()
            
            for member in members:
                code = member.get('stock_code')
                if not code:
                    continue
                    
                # Filter from stock_data
                filtered = stock_data[stock_data['代码'] == code]
                if not filtered.empty:
                    row = filtered.iloc[0]
                    quote = {
                        "code": row['代码'],
                        "name": row['名称'],
                        "price": float(row['最新价']) if row['最新价'] != '-' else 0.0,
                        "change_percent": float(row['涨跌幅'].strip('%')) if row['涨跌幅'] != '-' else 0.0,
                        "volume": int(row['成交量']) if row['成交量'] != '-' else 0,
                        "amount": float(row['成交额']) if row['成交额'] != '-' else 0.0,
                        "open": float(row['今开']) if row['今开'] != '-' else 0.0,
                        "high": float(row['最高']) if row['最高'] != '-' else 0.0,
                        "low": float(row['最低']) if row['最低'] != '-' else 0.0,
                        "pre_close": float(row['昨收']) if row['昨收'] != '-' else 0.0,
                        "market": member.get('market', '')
                    }
                    quotes.append(quote)
                else:
                    # Fallback or indicate missing
                    quotes.append({
                        "code": code,
                        "name": member.get('name', '未知'),
                        "price": 0.0,
                        "change_percent": 0.0,
                        "error": "Not found"
                    })
            
            # Update cache
            self._cache[cache_key] = (time.time(), quotes)
                    
        except Exception as e:
            logger.error(f"批量获取行情失败: {e}")
            # Fallback to individual fetch (slow)
            for member in members:
                code = member.get('stock_code')
                q = StockService.get_stock_realtime_data(code)
                if q:
                    q['market'] = member.get('market', '')
                    quotes.append(q)
                    
        return quotes
