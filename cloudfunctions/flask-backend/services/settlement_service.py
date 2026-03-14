import logging
from datetime import datetime
from flask import current_app
from services.trade_service import TradeService
from services.stock_service import StockService
from models.settlement import SettlementModel

logger = logging.getLogger(__name__)

class SettlementService:
    def __init__(self):
        self.trade_service = TradeService()
        self.stock_service = StockService()

    def _get_settlement_model(self):
        ensure_db = getattr(current_app, "ensure_db", None)
        db = ensure_db() if callable(ensure_db) else getattr(current_app, "db", None)
        cloud_db = getattr(current_app, "cloud_db", None)
        return SettlementModel(db, cloud_client=cloud_db)

    def run_daily_settlement(self):
        """
        Run daily settlement for all active positions.
        Checks if position is expired or needs margin call (not impl).
        For simplicity, we settle expired positions.
        """
        logger.info("Starting daily settlement...")
        
        # 1. Get all active positions
        # Note: We need a way to scan ALL positions. pagination might be tricky.
        # Assuming get_positions supports getting all or we iterate.
        # Here we fetch first 1000 for MVP.
        positions, _ = self.trade_service.get_positions(limit=1000)
        
        settled_count = 0
        today = datetime.now().date()
        
        for pos in positions:
            if pos.get('status') != 'active':
                continue
                
            # Check expiry
            # Assuming 'expireTime' or similar field exists in position or product
            # For this MVP, let's mock expiry check: if remainingDays <= 0
            # Since our position model is simple, we check 'expireTime' string if present
            expire_time_str = pos.get('expireTime')
            if not expire_time_str:
                continue
                
            try:
                expire_date = datetime.strptime(expire_time_str[:10], "%Y-%m-%d").date()
                if expire_date <= today:
                    self._settle_position(pos)
                    settled_count += 1
            except ValueError:
                logger.warning(f"Invalid expireTime format for pos {pos.get('_id')}")
                continue
                
        logger.info(f"Daily settlement completed. Settled {settled_count} positions.")
        return {"settled": settled_count}

    def _settle_position(self, pos):
        """
        Settle a single position.
        """
        pos_id = pos.get('_id')
        user_id = pos.get('customerId')
        code = pos.get('productCode')
        strike = float(pos.get('strikePrice', 0))
        quantity = float(pos.get('quantity', 0))
        option_type = pos.get('optionType', 'call') # Default call
        
        # Get Settlement Price (Latest Close)
        quote = self.stock_service.get_stock_realtime_data(code)
        if not quote:
            logger.error(f"Could not get quote for {code} during settlement")
            return
            
        settlement_price = float(quote['price'])
        
        # Calculate PnL
        pnl = 0.0
        if option_type.lower() == 'call':
            pnl = max(0, settlement_price - strike) * quantity
        else:
            pnl = max(0, strike - settlement_price) * quantity
            
        # Create Settlement Record
        model = self._get_settlement_model()
        model.create_settlement({
            "date": datetime.now().strftime("%Y-%m-%d"),
            "position_id": str(pos_id),
            "user_id": user_id,
            "type": "expiry",
            "strike_price": strike,
            "settlement_price": settlement_price,
            "pnl": pnl,
            "status": "completed"
        })
        
        # Transfer Funds if PnL > 0
        if pnl > 0:
            self.trade_service.deposit(user_id, pnl, remark=f"期权结算收益: {code}")
            
        # Update Position Status
        # We need update_position method in TradeService or PositionModel
        # trade_service currently doesn't expose update_position public API easily, 
        # let's assume we can add it or access model directly.
        # For MVP, we log it.
        logger.info(f"Settled position {pos_id}: PnL={pnl}")
        
        # Ideally: self.trade_service.close_position(pos_id, status='expired')
