const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { Inquiry, Dealer, User } = require('../models');
const mongoose = require('mongoose');
const router = express.Router();

// 验证请求参数的中间件
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: '请求参数验证失败',
      errors: errors.array()
    });
  }
  next();
};

// 创建询价
router.post('/', [
  body('optionType').isIn(['call', 'put']).withMessage('期权类型必须是call或put'),
  body('underlyingAsset.symbol').notEmpty().withMessage('标的资产代码不能为空'),
  body('underlyingAsset.name').notEmpty().withMessage('标的资产名称不能为空'),
  body('underlyingAsset.market').notEmpty().withMessage('市场不能为空'),
  body('underlyingAsset.currentPrice').isFloat({ min: 0 }).withMessage('当前价格必须大于0'),
  body('strikePrice').isFloat({ min: 0 }).withMessage('执行价格必须大于0'),
  body('expiryDate').isISO8601().withMessage('到期日期格式不正确'),
  body('notionalAmount').isFloat({ min: 1000 }).withMessage('名义本金必须大于1000'),
  body('quantity').isInt({ min: 1 }).withMessage('数量必须大于0'),
  body('direction').isIn(['buy', 'sell']).withMessage('方向必须是buy或sell'),
  body('validUntil').isISO8601().withMessage('询价有效期格式不正确')
], validateRequest, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 生成询价ID
    const inquiryId = `INQ${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    // 创建询价数据
    const inquiryData = {
      inquiryId,
      userId,
      accountId: user.activeAccountId,
      ...req.body
    };

    // 创建询价
    const inquiry = new Inquiry(inquiryData);
    await inquiry.save();

    // 异步处理：向合适的交易商发送询价请求
    setImmediate(async () => {
      try {
        const eligibleDealers = await Dealer.findActiveOnlineDealers();
        
        for (const dealer of eligibleDealers) {
          const { canQuote } = dealer.canQuote(inquiryData);
          if (canQuote && dealer.quotingStrategy.autoQuoting) {
            // 生成自动报价
            const marketData = {
              spotPrice: inquiryData.underlyingAsset.currentPrice,
              volatility: 0.25, // 默认波动率
              riskFreeRate: 0.03
            };
            
            try {
              const quote = dealer.generateQuote(inquiryData, marketData);
              
              const quoteData = {
                quoteId: `QUO${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
                dealerId: dealer._id,
                dealerName: dealer.dealerName,
                premium: quote.premium,
                bidPrice: quote.bidPrice,
                askPrice: quote.askPrice,
                spread: quote.spread,
                validUntil: quote.validUntil,
                greeks: {
                  delta: 0.5,
                  gamma: 0.1,
                  theta: -0.05,
                  vega: 0.2,
                  rho: 0.1
                }
              };
              
            await inquiry.addQuote(quoteData);
            if (req.io) {
              req.io.to(`user_${userId}`).emit('quote_received', {
                inquiryId: inquiry.inquiryId,
                quote: quoteData
              });
            }
              
            } catch (quoteError) {
              console.error('生成报价失败:', quoteError);
            }
          }
        }
      } catch (error) {
        console.error('处理询价报价失败:', error);
      }
    });

    res.status(201).json({
      success: true,
      message: '询价创建成功',
      data: {
        inquiryId: inquiry.inquiryId,
        inquiry
      }
    });

  } catch (error) {
    console.error('创建询价失败:', error);
    res.status(500).json({
      success: false,
      message: '创建询价失败',
      error: error.message
    });
  }
});

// 获取用户询价列表
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('页码必须大于0'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须在1-100之间'),
  query('status').optional().isIn(['pending', 'quoted', 'expired', 'cancelled', 'traded']).withMessage('状态值不正确'),
  query('symbol').optional().notEmpty().withMessage('股票代码不能为空')
], validateRequest, async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // 构建查询条件
    const query = { userId };
    if (req.query.status) {
      query.status = req.query.status;
    }
    if (req.query.symbol) {
      query['underlyingAsset.symbol'] = req.query.symbol;
    }

    // 查询询价列表
    const [inquiries, total] = await Promise.all([
      Inquiry.find(query)
        .populate('userId', 'nickname avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Inquiry.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        inquiries,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('获取询价列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取询价列表失败',
      error: error.message
    });
  }
});

// 获取单个询价详情
router.get('/:inquiryId', [
  param('inquiryId').notEmpty().withMessage('询价ID不能为空')
], validateRequest, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { inquiryId } = req.params;

    const inquiry = await Inquiry.findOne({ 
      inquiryId, 
      userId 
    }).populate('quotes.dealerId', 'dealerName displayName logo');

    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: '询价不存在'
      });
    }

    res.json({
      success: true,
      data: inquiry
    });

  } catch (error) {
    console.error('获取询价详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取询价详情失败',
      error: error.message
    });
  }
});

// 取消询价
router.patch('/:inquiryId/cancel', [
  param('inquiryId').notEmpty().withMessage('询价ID不能为空')
], validateRequest, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { inquiryId } = req.params;

    const inquiry = await Inquiry.findOne({ 
      inquiryId, 
      userId 
    });

    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: '询价不存在'
      });
    }

    await inquiry.cancel();

    res.json({
      success: true,
      message: '询价已取消',
      data: inquiry
    });

  } catch (error) {
    console.error('取消询价失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '取消询价失败'
    });
  }
});

// 接受报价（创建交易）
router.post('/:inquiryId/accept-quote', [
  param('inquiryId').notEmpty().withMessage('询价ID不能为空'),
  body('quoteId').notEmpty().withMessage('报价ID不能为空')
], validateRequest, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { inquiryId } = req.params;
    const { quoteId } = req.body;

    const inquiry = await Inquiry.findOne({ 
      inquiryId, 
      userId 
    }).populate('quotes.dealerId');

    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: '询价不存在'
      });
    }

    const quote = inquiry.quotes.find(q => q.quoteId === quoteId);
    if (!quote) {
      return res.status(404).json({
        success: false,
        message: '报价不存在'
      });
    }

    if (quote.quoteStatus !== 'active' || quote.validUntil < new Date()) {
      return res.status(400).json({
        success: false,
        message: '报价已失效'
      });
    }

    // 检查用户账户余额
    const user = await User.findById(userId);
    const activeAccount = user.activeAccount;
    
    if (!activeAccount) {
      return res.status(400).json({
        success: false,
        message: '没有活跃账户'
      });
    }

    const totalCost = quote.premium * inquiry.quantity;
    if (inquiry.direction === 'buy' && activeAccount.balance < totalCost) {
      return res.status(400).json({
        success: false,
        message: '账户余额不足'
      });
    }

    // 创建交易记录
    const Trade = require('../models/Trade');
    const tradeId = `TRD${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    const tradeData = {
      tradeId,
      inquiryId: inquiry.inquiryId,
      quoteId: quote.quoteId,
      userId,
      dealerId: quote.dealerId._id,
      accountId: user.activeAccountId,
      optionContract: {
        optionType: inquiry.optionType,
        underlyingAsset: inquiry.underlyingAsset,
        strikePrice: inquiry.strikePrice,
        expiryDate: inquiry.expiryDate,
        exerciseStyle: inquiry.exerciseStyle,
        settlementType: inquiry.settlementType
      },
      direction: inquiry.direction,
      notionalAmount: inquiry.notionalAmount,
      quantity: inquiry.quantity,
      premium: quote.premium,
      totalPremium: totalCost,
      marketDataAtTrade: inquiry.marketData,
      greeksAtTrade: quote.greeks,
      status: 'pending'
    };

    const trade = new Trade(tradeData);
    await trade.save();

    // 更新询价状态
    inquiry.status = 'traded';
    quote.quoteStatus = 'traded';
    await inquiry.save();

    // 冻结资金
    if (inquiry.direction === 'buy') {
      await user.freezeAmount(user.activeAccountId, totalCost);
    }

    // 推送交易创建通知
    if (req.io) {
      req.io.to(`user_${userId}`).emit('trade_created', {
        tradeId: trade.tradeId,
        trade
      });
    }

    res.status(201).json({
      success: true,
      message: '交易创建成功',
      data: {
        tradeId: trade.tradeId,
        trade
      }
    });

  } catch (error) {
    console.error('接受报价失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '接受报价失败'
    });
  }
});

// 获取询价统计信息
router.get('/stats/summary', async (req, res) => {
  try {
    const userId = req.user.userId;

    const stats = await Inquiry.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalNotional: { $sum: '$notionalAmount' }
        }
      }
    ]);

    const summary = {
      total: 0,
      pending: 0,
      quoted: 0,
      traded: 0,
      cancelled: 0,
      expired: 0,
      totalNotional: 0
    };

    stats.forEach(stat => {
      summary[stat._id] = stat.count;
      summary.total += stat.count;
      summary.totalNotional += stat.totalNotional;
    });

    res.json({
      success: true,
      data: summary
    });

  } catch (error) {
    console.error('获取询价统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取询价统计失败',
      error: error.message
    });
  }
});

module.exports = router;