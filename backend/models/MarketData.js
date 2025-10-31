const mongoose = require('mongoose');

const marketDataSchema = new mongoose.Schema({
  // 标的资产信息
  symbol: {
    type: String,
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  market: {
    type: String,
    required: true
  },
  assetType: {
    type: String,
    enum: ['stock', 'index', 'commodity', 'currency', 'bond'],
    default: 'stock'
  },
  
  // 价格信息
  currentPrice: {
    type: Number,
    required: true
  },
  openPrice: {
    type: Number,
    required: true
  },
  highPrice: {
    type: Number,
    required: true
  },
  lowPrice: {
    type: Number,
    required: true
  },
  prevClosePrice: {
    type: Number,
    required: true
  },
  
  // 变动信息
  change: {
    type: Number,
    required: true
  },
  changePercent: {
    type: Number,
    required: true
  },
  
  // 交易量信息
  volume: {
    type: Number,
    default: 0
  },
  turnover: {
    type: Number,
    default: 0
  },
  
  // 波动率信息
  impliedVolatility: {
    type: Number,
    default: 0
  },
  historicalVolatility: {
    h5d: Number,    // 5日历史波动率
    h10d: Number,   // 10日历史波动率
    h20d: Number,   // 20日历史波动率
    h30d: Number,   // 30日历史波动率
    h60d: Number,   // 60日历史波动率
    h90d: Number    // 90日历史波动率
  },
  
  // 期权相关数据
  optionData: {
    riskFreeRate: {
      type: Number,
      default: 0.03
    },
    dividendYield: {
      type: Number,
      default: 0
    },
    exDividendDate: Date,
    
    // 期权链数据
    optionChain: [{
      expiryDate: Date,
      strikes: [{
        strikePrice: Number,
        call: {
          lastPrice: Number,
          bid: Number,
          ask: Number,
          volume: Number,
          openInterest: Number,
          impliedVolatility: Number,
          delta: Number,
          gamma: Number,
          theta: Number,
          vega: Number,
          rho: Number
        },
        put: {
          lastPrice: Number,
          bid: Number,
          ask: Number,
          volume: Number,
          openInterest: Number,
          impliedVolatility: Number,
          delta: Number,
          gamma: Number,
          theta: Number,
          vega: Number,
          rho: Number
        }
      }]
    }]
  },
  
  // 技术指标
  technicalIndicators: {
    sma: {
      sma5: Number,
      sma10: Number,
      sma20: Number,
      sma50: Number,
      sma200: Number
    },
    ema: {
      ema12: Number,
      ema26: Number
    },
    macd: {
      macd: Number,
      signal: Number,
      histogram: Number
    },
    rsi: {
      rsi14: Number
    },
    bollinger: {
      upper: Number,
      middle: Number,
      lower: Number
    }
  },
  
  // 基本面数据
  fundamentals: {
    marketCap: Number,
    peRatio: Number,
    pbRatio: Number,
    eps: Number,
    dividend: Number,
    dividendYield: Number,
    bookValue: Number,
    totalShares: Number,
    floatShares: Number
  },
  
  // 新闻和公告
  news: [{
    title: String,
    summary: String,
    url: String,
    publishTime: Date,
    source: String,
    sentiment: {
      type: String,
      enum: ['positive', 'neutral', 'negative']
    }
  }],
  
  // 数据质量指标
  dataQuality: {
    lastUpdateTime: {
      type: Date,
      default: Date.now
    },
    dataSource: {
      type: String,
      required: true
    },
    isReliable: {
      type: Boolean,
      default: true
    },
    delaySeconds: {
      type: Number,
      default: 0
    }
  },
  
  // 市场状态
  marketStatus: {
    type: String,
    enum: ['pre_market', 'open', 'close', 'after_hours', 'holiday'],
    default: 'close'
  },
  
  // 时间戳
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  tradingDate: {
    type: Date,
    required: true,
    index: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 复合索引
marketDataSchema.index({ symbol: 1, timestamp: -1 });
marketDataSchema.index({ symbol: 1, tradingDate: -1 });
marketDataSchema.index({ market: 1, marketStatus: 1 });
marketDataSchema.index({ assetType: 1, marketStatus: 1 });

// 虚拟字段
marketDataSchema.virtual('isUpTrend').get(function() {
  return this.change > 0;
});

marketDataSchema.virtual('amplitude').get(function() {
  return ((this.highPrice - this.lowPrice) / this.prevClosePrice) * 100;
});

marketDataSchema.virtual('isActive').get(function() {
  const now = new Date();
  const updateTime = this.dataQuality.lastUpdateTime;
  const diffMinutes = (now - updateTime) / (1000 * 60);
  return diffMinutes < 5; // 5分钟内更新的数据认为是活跃的
});

// 实例方法
marketDataSchema.methods.updatePrice = function(newPrice, volume = 0) {
  this.currentPrice = newPrice;
  this.change = newPrice - this.prevClosePrice;
  this.changePercent = (this.change / this.prevClosePrice) * 100;
  this.volume += volume;
  
  // 更新最高最低价
  if (newPrice > this.highPrice) {
    this.highPrice = newPrice;
  }
  if (newPrice < this.lowPrice) {
    this.lowPrice = newPrice;
  }
  
  this.dataQuality.lastUpdateTime = new Date();
  return this.save();
};

marketDataSchema.methods.addNewsItem = function(newsData) {
  this.news.unshift(newsData);
  
  // 只保留最新的20条新闻
  if (this.news.length > 20) {
    this.news = this.news.slice(0, 20);
  }
  
  return this.save();
};

marketDataSchema.methods.updateVolatility = function(period, volatility) {
  if (!this.historicalVolatility) {
    this.historicalVolatility = {};
  }
  
  const periodKey = `h${period}d`;
  this.historicalVolatility[periodKey] = volatility;
  
  return this.save();
};

marketDataSchema.methods.getOptionQuote = function(expiryDate, strikePrice, optionType) {
  const expiry = this.optionData.optionChain.find(chain => 
    chain.expiryDate.getTime() === expiryDate.getTime()
  );
  
  if (!expiry) {
    return null;
  }
  
  const strike = expiry.strikes.find(s => s.strikePrice === strikePrice);
  if (!strike) {
    return null;
  }
  
  return strike[optionType];
};

// 静态方法
marketDataSchema.statics.findBySymbol = function(symbol, limit = 1) {
  return this.find({ symbol }).sort({ timestamp: -1 }).limit(limit);
};

marketDataSchema.statics.findLatestBySymbols = function(symbols) {
  return this.aggregate([
    { $match: { symbol: { $in: symbols } } },
    { $sort: { symbol: 1, timestamp: -1 } },
    { $group: {
      _id: '$symbol',
      latestData: { $first: '$$ROOT' }
    }},
    { $replaceRoot: { newRoot: '$latestData' } }
  ]);
};

marketDataSchema.statics.findByMarket = function(market, marketStatus = 'open') {
  return this.find({ 
    market, 
    marketStatus,
    timestamp: { 
      $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // 最近24小时的数据
    }
  }).sort({ timestamp: -1 });
};

marketDataSchema.statics.getHistoricalData = function(symbol, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.find({
    symbol,
    tradingDate: { $gte: startDate }
  }).sort({ tradingDate: 1 });
};

// 中间件
marketDataSchema.pre('save', function(next) {
  // 自动设置交易日期
  if (!this.tradingDate) {
    this.tradingDate = new Date();
    this.tradingDate.setHours(0, 0, 0, 0);
  }
  
  next();
});

// TTL索引 - 自动删除30天前的数据
marketDataSchema.index({ 
  timestamp: 1 
}, { 
  expireAfterSeconds: 30 * 24 * 60 * 60 // 30天
});

module.exports = mongoose.model('MarketData', marketDataSchema);