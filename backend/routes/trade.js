const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { Trade, User, MarketData } = require('../models');
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

// 获取用户交易列表
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('页码必须大于0'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须在1-100之间'),
  query('status').optional().isIn(['pending', 'confirmed', 'settled', 'exercised', 'expired', 'cancelled']).withMessage('状态值不正确'),
  query('symbol').optional().notEmpty().withMessage('股票代码不能为空'),
  query('accountId').optional().notEmpty().withMessage('账户ID不能为空')
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
      query['optionContract.underlyingAsset.symbol'] = req.query.symbol;
    }
    if (req.query.accountId) {
      query.accountId = req.query.accountId;
    }

    // 查询交易列表
    const [trades, total] = await Promise.all([
      Trade.find(query)
        .populate('userId', 'nickname avatar')
        .populate('dealerId', 'dealerName displayName logo')
        .sort({ tradeDate: -1 })
        .skip(skip)
        .limit(limit),
      Trade.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        trades,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('获取交易列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取交易列表失败',
      error: error.message
    });
  }
});

// 获取单个交易详情
router.get('/:tradeId', [
  param('tradeId').notEmpty().withMessage('交易ID不能为空')
], validateRequest, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { tradeId } = req.params;

    const trade = await Trade.findOne({ 
      tradeId, 
      userId 
    })
    .populate('userId', 'nickname avatar phone')
    .populate('dealerId', 'dealerName displayName logo contact');

    if (!trade) {
      return res.status(404).json({
        success: false,
        message: '交易不存在'
      });
    }

    res.json({
      success: true,
      data: trade
    });

  } catch (error) {
    console.error('获取交易详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取交易详情失败',
      error: error.message
    });
  }
});

// 获取活跃持仓
router.get('/positions/active', [
  query('accountId').optional().notEmpty().withMessage('账户ID不能为空')
], validateRequest, async (req, res) => {
  try {
    const userId = req.user.userId;
    const query = { userId };
    
    if (req.query.accountId) {
      query.accountId = req.query.accountId;
    }

    const activePositions = await Trade.findActivePositions(userId);

    // 按标的资产分组
    const positionsByAsset = {};
    let totalValue = 0;
    let totalPnl = 0;

    for (const position of activePositions) {
      const symbol = position.optionContract.underlyingAsset.symbol;
      
      if (!positionsByAsset[symbol]) {
        positionsByAsset[symbol] = {
          symbol,
          name: position.optionContract.underlyingAsset.name,
          positions: [],
          totalValue: 0,
          totalPnl: 0,
          netDelta: 0,
          netGamma: 0,
          netTheta: 0,
          netVega: 0
        };
      }

      // 更新持仓估值
      const latestMarketData = await MarketData.findBySymbol(symbol, 1);
      if (latestMarketData.length > 0) {
        await position.updateValuation(latestMarketData[0].currentPrice, latestMarketData[0].impliedVolatility || 0.25);
      }

      positionsByAsset[symbol].positions.push(position);
      positionsByAsset[symbol].totalValue += position.currentValuation?.marketValue || 0;
      positionsByAsset[symbol].totalPnl += position.currentValuation?.pnl || 0;
      
      // 累计希腊字母
      if (position.currentGreeks) {
        positionsByAsset[symbol].netDelta += position.currentGreeks.delta || 0;
        positionsByAsset[symbol].netGamma += position.currentGreeks.gamma || 0;
        positionsByAsset[symbol].netTheta += position.currentGreeks.theta || 0;
        positionsByAsset[symbol].netVega += position.currentGreeks.vega || 0;
      }

      totalValue += position.currentValuation?.marketValue || 0;
      totalPnl += position.currentValuation?.pnl || 0;
    }

    res.json({
      success: true,
      data: {
        summary: {
          totalPositions: activePositions.length,
          totalValue,
          totalPnl,
          totalPnlPercent: totalValue > 0 ? (totalPnl / totalValue) * 100 : 0
        },
        positionsByAsset: Object.values(positionsByAsset),
        allPositions: activePositions
      }
    });

  } catch (error) {
    console.error('获取活跃持仓失败:', error);
    res.status(500).json({
      success: false,
      message: '获取活跃持仓失败',
      error: error.message
    });
  }
});

// 获取即将到期的持仓
router.get('/positions/expiring', [
  query('days').optional().isInt({ min: 1, max: 30 }).withMessage('天数必须在1-30之间')
], validateRequest, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const expiringPositions = await Trade.findExpiringPositions(days);
    
    // 过滤当前用户的持仓
    const userExpiringPositions = expiringPositions.filter(
      position => position.userId.toString() === req.user.userId
    );

    res.json({
      success: true,
      data: {
        count: userExpiringPositions.length,
        positions: userExpiringPositions
      }
    });

  } catch (error) {
    console.error('获取即将到期持仓失败:', error);
    res.status(500).json({
      success: false,
      message: '获取即将到期持仓失败',
      error: error.message
    });
  }
});

// 行权期权
router.post('/:tradeId/exercise', [
  param('tradeId').notEmpty().withMessage('交易ID不能为空'),
  body('exerciseType').optional().isIn(['automatic', 'manual']).withMessage('行权类型不正确')
], validateRequest, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { tradeId } = req.params;
    const { exerciseType = 'manual' } = req.body;

    const trade = await Trade.findOne({ 
      tradeId, 
      userId 
    });

    if (!trade) {
      return res.status(404).json({
        success: false,
        message: '交易不存在'
      });
    }

    await trade.exercise(exerciseType);

    // 推送行权通知
    req.io.to(`user_${userId}`).emit('option_exercised', {
      tradeId: trade.tradeId,
      exercise: trade.exercise
    });

    res.json({
      success: true,
      message: '期权行权成功',
      data: {
        tradeId: trade.tradeId,
        exercise: trade.exercise
      }
    });

  } catch (error) {
    console.error('期权行权失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '期权行权失败'
    });
  }
});

// 更新持仓估值
router.patch('/:tradeId/valuation', [
  param('tradeId').notEmpty().withMessage('交易ID不能为空')
], validateRequest, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { tradeId } = req.params;

    const trade = await Trade.findOne({ 
      tradeId, 
      userId 
    });

    if (!trade) {
      return res.status(404).json({
        success: false,
        message: '交易不存在'
      });
    }

    // 获取最新市场数据
    const symbol = trade.optionContract.underlyingAsset.symbol;
    const latestMarketData = await MarketData.findBySymbol(symbol, 1);
    
    if (latestMarketData.length === 0) {
      return res.status(400).json({
        success: false,
        message: '无法获取最新市场数据'
      });
    }

    const marketData = latestMarketData[0];
    await trade.updateValuation(marketData.currentPrice, marketData.impliedVolatility || 0.25);

    res.json({
      success: true,
      message: '估值更新成功',
      data: {
        currentValuation: trade.currentValuation,
        lastUpdated: trade.currentValuation.lastUpdated
      }
    });

  } catch (error) {
    console.error('更新持仓估值失败:', error);
    res.status(500).json({
      success: false,
      message: '更新持仓估值失败',
      error: error.message
    });
  }
});

// 获取交易统计信息
router.get('/stats/summary', [
  query('period').optional().isIn(['7d', '30d', '90d', '1y', 'all']).withMessage('统计周期不正确'),
  query('accountId').optional().notEmpty().withMessage('账户ID不能为空')
], validateRequest, async (req, res) => {
  try {
    const userId = req.user.userId;
    const period = req.query.period || '30d';
    
    // 计算时间范围
    let startDate = new Date();
    if (period === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === '30d') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (period === '90d') {
      startDate.setDate(startDate.getDate() - 90);
    } else if (period === '1y') {
      startDate.setFullYear(startDate.getFullYear() - 1);
    } else {
      startDate = new Date('2020-01-01'); // 全部时间
    }

    const matchQuery = { 
      userId: new require('mongoose').Types.ObjectId(userId),
      tradeDate: { $gte: startDate }
    };

    if (req.query.accountId) {
      matchQuery.accountId = req.query.accountId;
    }

    const stats = await Trade.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalTrades: { $sum: 1 },
          totalVolume: { $sum: '$notionalAmount' },
          totalPremium: { $sum: '$totalPremium' },
          avgPremium: { $avg: '$totalPremium' },
          callTrades: {
            $sum: {
              $cond: [{ $eq: ['$optionContract.optionType', 'call'] }, 1, 0]
            }
          },
          putTrades: {
            $sum: {
              $cond: [{ $eq: ['$optionContract.optionType', 'put'] }, 1, 0]
            }
          },
          buyTrades: {
            $sum: {
              $cond: [{ $eq: ['$direction', 'buy'] }, 1, 0]
            }
          },
          sellTrades: {
            $sum: {
              $cond: [{ $eq: ['$direction', 'sell'] }, 1, 0]
            }
          }
        }
      }
    ]);

    const summary = stats.length > 0 ? stats[0] : {
      totalTrades: 0,
      totalVolume: 0,
      totalPremium: 0,
      avgPremium: 0,
      callTrades: 0,
      putTrades: 0,
      buyTrades: 0,
      sellTrades: 0
    };

    // 获取按状态分组的统计
    const statusStats = await Trade.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalVolume: { $sum: '$notionalAmount' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        period,
        summary,
        statusBreakdown: statusStats
      }
    });

  } catch (error) {
    console.error('获取交易统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取交易统计失败',
      error: error.message
    });
  }
});

// 批量更新持仓估值
router.patch('/positions/update-valuations', async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const activePositions = await Trade.findActivePositions(userId);
    const updatePromises = [];

    for (const position of activePositions) {
      const symbol = position.optionContract.underlyingAsset.symbol;
      const latestMarketData = await MarketData.findBySymbol(symbol, 1);
      
      if (latestMarketData.length > 0) {
        const marketData = latestMarketData[0];
        updatePromises.push(
          position.updateValuation(marketData.currentPrice, marketData.impliedVolatility || 0.25)
        );
      }
    }

    await Promise.all(updatePromises);

    res.json({
      success: true,
      message: '持仓估值批量更新成功',
      data: {
        updatedCount: updatePromises.length
      }
    });

  } catch (error) {
    console.error('批量更新持仓估值失败:', error);
    res.status(500).json({
      success: false,
      message: '批量更新持仓估值失败',
      error: error.message
    });
  }
});

module.exports = router;