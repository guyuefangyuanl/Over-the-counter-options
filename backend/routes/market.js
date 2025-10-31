const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { MarketData } = require('../models');
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

// 获取股票实时行情
router.get('/quote/:symbol', [
  param('symbol').notEmpty().withMessage('股票代码不能为空')
], validateRequest, async (req, res) => {
  try {
    const { symbol } = req.params;
    
    const marketData = await MarketData.findBySymbol(symbol, 1);
    
    if (marketData.length === 0) {
      return res.status(404).json({
        success: false,
        message: '未找到该股票的行情数据'
      });
    }

    const quote = marketData[0];
    
    res.json({
      success: true,
      data: {
        symbol: quote.symbol,
        name: quote.name,
        market: quote.market,
        currentPrice: quote.currentPrice,
        change: quote.change,
        changePercent: quote.changePercent,
        openPrice: quote.openPrice,
        highPrice: quote.highPrice,
        lowPrice: quote.lowPrice,
        prevClosePrice: quote.prevClosePrice,
        volume: quote.volume,
        turnover: quote.turnover,
        marketStatus: quote.marketStatus,
        timestamp: quote.timestamp,
        isActive: quote.isActive,
        amplitude: quote.amplitude,
        impliedVolatility: quote.impliedVolatility,
        historicalVolatility: quote.historicalVolatility
      }
    });

  } catch (error) {
    console.error('获取行情数据失败:', error);
    res.status(500).json({
      success: false,
      message: '获取行情数据失败',
      error: error.message
    });
  }
});

// 批量获取股票行情
router.post('/quotes', [
  body('symbols').isArray().withMessage('股票代码列表必须是数组'),
  body('symbols.*').notEmpty().withMessage('股票代码不能为空')
], validateRequest, async (req, res) => {
  try {
    const { symbols } = req.body;
    
    if (symbols.length > 50) {
      return res.status(400).json({
        success: false,
        message: '一次最多查询50只股票'
      });
    }

    const marketDataList = await MarketData.findLatestBySymbols(symbols);
    
    const quotes = marketDataList.map(quote => ({
      symbol: quote.symbol,
      name: quote.name,
      market: quote.market,
      currentPrice: quote.currentPrice,
      change: quote.change,
      changePercent: quote.changePercent,
      marketStatus: quote.marketStatus,
      timestamp: quote.timestamp,
      isActive: quote.isActive
    }));

    res.json({
      success: true,
      data: quotes
    });

  } catch (error) {
    console.error('批量获取行情数据失败:', error);
    res.status(500).json({
      success: false,
      message: '批量获取行情数据失败',
      error: error.message
    });
  }
});

// 获取历史数据
router.get('/history/:symbol', [
  param('symbol').notEmpty().withMessage('股票代码不能为空'),
  query('days').optional().isInt({ min: 1, max: 365 }).withMessage('天数必须在1-365之间'),
  query('interval').optional().isIn(['1m', '5m', '15m', '30m', '1h', '1d']).withMessage('时间间隔不正确')
], validateRequest, async (req, res) => {
  try {
    const { symbol } = req.params;
    const days = parseInt(req.query.days) || 30;
    const interval = req.query.interval || '1d';

    const historicalData = await MarketData.getHistoricalData(symbol, days);
    
    if (historicalData.length === 0) {
      return res.status(404).json({
        success: false,
        message: '未找到历史数据'
      });
    }

    // 根据时间间隔处理数据
    let processedData = historicalData.map(data => ({
      date: data.tradingDate,
      open: data.openPrice,
      high: data.highPrice,
      low: data.lowPrice,
      close: data.currentPrice,
      volume: data.volume,
      turnover: data.turnover
    }));

    res.json({
      success: true,
      data: {
        symbol,
        interval,
        days,
        data: processedData
      }
    });

  } catch (error) {
    console.error('获取历史数据失败:', error);
    res.status(500).json({
      success: false,
      message: '获取历史数据失败',
      error: error.message
    });
  }
});

// 获取期权链数据
router.get('/option-chain/:symbol', [
  param('symbol').notEmpty().withMessage('股票代码不能为空'),
  query('expiryDate').optional().isISO8601().withMessage('到期日期格式不正确')
], validateRequest, async (req, res) => {
  try {
    const { symbol } = req.params;
    
    const marketData = await MarketData.findBySymbol(symbol, 1);
    
    if (marketData.length === 0) {
      return res.status(404).json({
        success: false,
        message: '未找到该股票的数据'
      });
    }

    const quote = marketData[0];
    
    if (!quote.optionData || !quote.optionData.optionChain) {
      return res.status(404).json({
        success: false,
        message: '该股票暂无期权数据'
      });
    }

    let optionChain = quote.optionData.optionChain;
    
    // 如果指定了到期日，只返回该到期日的数据
    if (req.query.expiryDate) {
      const expiryDate = new Date(req.query.expiryDate);
      optionChain = optionChain.filter(chain => 
        chain.expiryDate.getTime() === expiryDate.getTime()
      );
    }

    res.json({
      success: true,
      data: {
        symbol,
        spotPrice: quote.currentPrice,
        riskFreeRate: quote.optionData.riskFreeRate,
        dividendYield: quote.optionData.dividendYield,
        optionChain
      }
    });

  } catch (error) {
    console.error('获取期权链数据失败:', error);
    res.status(500).json({
      success: false,
      message: '获取期权链数据失败',
      error: error.message
    });
  }
});

// 获取股票技术指标
router.get('/indicators/:symbol', [
  param('symbol').notEmpty().withMessage('股票代码不能为空')
], validateRequest, async (req, res) => {
  try {
    const { symbol } = req.params;
    
    const marketData = await MarketData.findBySymbol(symbol, 1);
    
    if (marketData.length === 0) {
      return res.status(404).json({
        success: false,
        message: '未找到该股票的数据'
      });
    }

    const quote = marketData[0];
    
    res.json({
      success: true,
      data: {
        symbol,
        currentPrice: quote.currentPrice,
        technicalIndicators: quote.technicalIndicators,
        historicalVolatility: quote.historicalVolatility,
        impliedVolatility: quote.impliedVolatility,
        timestamp: quote.timestamp
      }
    });

  } catch (error) {
    console.error('获取技术指标失败:', error);
    res.status(500).json({
      success: false,
      message: '获取技术指标失败',
      error: error.message
    });
  }
});

// 股票搜索
router.get('/search', [
  query('keyword').notEmpty().withMessage('搜索关键词不能为空'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('返回数量必须在1-50之间')
], validateRequest, async (req, res) => {
  try {
    const { keyword } = req.query;
    const limit = parseInt(req.query.limit) || 20;

    // 模糊搜索股票代码和名称
    const searchRegex = new RegExp(keyword, 'i');
    
    const results = await MarketData.aggregate([
      {
        $match: {
          $or: [
            { symbol: searchRegex },
            { name: searchRegex }
          ],
          timestamp: {
            $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // 最近24小时的数据
          }
        }
      },
      {
        $sort: { symbol: 1, timestamp: -1 }
      },
      {
        $group: {
          _id: '$symbol',
          latestData: { $first: '$$ROOT' }
        }
      },
      {
        $replaceRoot: { newRoot: '$latestData' }
      },
      {
        $limit: limit
      },
      {
        $project: {
          symbol: 1,
          name: 1,
          market: 1,
          currentPrice: 1,
          change: 1,
          changePercent: 1,
          marketStatus: 1
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        keyword,
        count: results.length,
        results
      }
    });

  } catch (error) {
    console.error('股票搜索失败:', error);
    res.status(500).json({
      success: false,
      message: '股票搜索失败',
      error: error.message
    });
  }
});

// 获取市场概览
router.get('/market-overview', [
  query('market').optional().notEmpty().withMessage('市场不能为空')
], validateRequest, async (req, res) => {
  try {
    const market = req.query.market || 'all';
    
    let matchQuery = {
      timestamp: {
        $gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
      }
    };
    
    if (market !== 'all') {
      matchQuery.market = market;
    }

    const overview = await MarketData.aggregate([
      { $match: matchQuery },
      {
        $sort: { symbol: 1, timestamp: -1 }
      },
      {
        $group: {
          _id: '$symbol',
          latestData: { $first: '$$ROOT' }
        }
      },
      {
        $group: {
          _id: '$latestData.market',
          totalStocks: { $sum: 1 },
          rising: {
            $sum: {
              $cond: [{ $gt: ['$latestData.change', 0] }, 1, 0]
            }
          },
          falling: {
            $sum: {
              $cond: [{ $lt: ['$latestData.change', 0] }, 1, 0]
            }
          },
          unchanged: {
            $sum: {
              $cond: [{ $eq: ['$latestData.change', 0] }, 1, 0]
            }
          },
          avgChange: { $avg: '$latestData.changePercent' },
          totalVolume: { $sum: '$latestData.volume' },
          totalTurnover: { $sum: '$latestData.turnover' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        market,
        overview,
        timestamp: new Date()
      }
    });

  } catch (error) {
    console.error('获取市场概览失败:', error);
    res.status(500).json({
      success: false,
      message: '获取市场概览失败',
      error: error.message
    });
  }
});

// 获取热门股票
router.get('/trending', [
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('返回数量必须在1-100之间'),
  query('sortBy').optional().isIn(['volume', 'turnover', 'changePercent']).withMessage('排序字段不正确')
], validateRequest, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const sortBy = req.query.sortBy || 'volume';
    
    const sortField = {};
    sortField[sortBy] = -1;

    const trending = await MarketData.aggregate([
      {
        $match: {
          timestamp: {
            $gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        }
      },
      {
        $sort: { symbol: 1, timestamp: -1 }
      },
      {
        $group: {
          _id: '$symbol',
          latestData: { $first: '$$ROOT' }
        }
      },
      {
        $replaceRoot: { newRoot: '$latestData' }
      },
      {
        $sort: sortField
      },
      {
        $limit: limit
      },
      {
        $project: {
          symbol: 1,
          name: 1,
          market: 1,
          currentPrice: 1,
          change: 1,
          changePercent: 1,
          volume: 1,
          turnover: 1,
          amplitude: 1
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        sortBy,
        count: trending.length,
        stocks: trending
      }
    });

  } catch (error) {
    console.error('获取热门股票失败:', error);
    res.status(500).json({
      success: false,
      message: '获取热门股票失败',
      error: error.message
    });
  }
});

// 更新股票价格（用于模拟实时数据推送）
router.patch('/quote/:symbol/price', [
  param('symbol').notEmpty().withMessage('股票代码不能为空'),
  body('price').isFloat({ min: 0 }).withMessage('价格必须大于0'),
  body('volume').optional().isInt({ min: 0 }).withMessage('成交量必须大于等于0')
], validateRequest, async (req, res) => {
  try {
    const { symbol } = req.params;
    const { price, volume = 0 } = req.body;

    const marketData = await MarketData.findOne({ symbol })
      .sort({ timestamp: -1 });

    if (!marketData) {
      return res.status(404).json({
        success: false,
        message: '未找到该股票的数据'
      });
    }

    await marketData.updatePrice(price, volume);

    // 推送实时价格更新
    req.io.emit('price_update', {
      symbol,
      price,
      change: marketData.change,
      changePercent: marketData.changePercent,
      volume: marketData.volume,
      timestamp: marketData.dataQuality.lastUpdateTime
    });

    res.json({
      success: true,
      message: '价格更新成功',
      data: {
        symbol,
        currentPrice: marketData.currentPrice,
        change: marketData.change,
        changePercent: marketData.changePercent,
        volume: marketData.volume
      }
    });

  } catch (error) {
    console.error('更新股票价格失败:', error);
    res.status(500).json({
      success: false,
      message: '更新股票价格失败',
      error: error.message
    });
  }
});

module.exports = router;