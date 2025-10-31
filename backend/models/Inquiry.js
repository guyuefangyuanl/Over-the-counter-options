const mongoose = require('mongoose');

const inquirySchema = new mongoose.Schema({
  // 询价基本信息
  inquiryId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  accountId: {
    type: String,
    required: true
  },
  
  // 期权基本信息
  optionType: {
    type: String,
    enum: ['call', 'put'],
    required: true
  },
  underlyingAsset: {
    symbol: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    market: {
      type: String,
      required: true
    },
    currentPrice: {
      type: Number,
      required: true
    }
  },
  
  // 期权条款
  strikePrice: {
    type: Number,
    required: true
  },
  expiryDate: {
    type: Date,
    required: true
  },
  exerciseStyle: {
    type: String,
    enum: ['european', 'american'],
    default: 'european'
  },
  settlementType: {
    type: String,
    enum: ['cash', 'physical'],
    default: 'cash'
  },
  
  // 交易信息
  notionalAmount: {
    type: Number,
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  direction: {
    type: String,
    enum: ['buy', 'sell'],
    required: true
  },
  
  // 询价状态
  status: {
    type: String,
    enum: ['pending', 'quoted', 'expired', 'cancelled', 'traded'],
    default: 'pending'
  },
  
  // 报价信息
  quotes: [{
    quoteId: {
      type: String,
      required: true
    },
    dealerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dealer',
      required: true
    },
    dealerName: {
      type: String,
      required: true
    },
    
    // 报价详情
    bidPrice: {
      type: Number
    },
    askPrice: {
      type: Number
    },
    premium: {
      type: Number,
      required: true
    },
    spread: {
      type: Number
    },
    
    // 希腊字母
    greeks: {
      delta: Number,
      gamma: Number,
      theta: Number,
      vega: Number,
      rho: Number
    },
    
    // 报价有效期
    validUntil: {
      type: Date,
      required: true
    },
    
    // 报价状态
    quoteStatus: {
      type: String,
      enum: ['active', 'expired', 'withdrawn', 'traded'],
      default: 'active'
    },
    
    // 时间戳
    quotedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // 最优报价
  bestQuote: {
    quoteId: String,
    dealerId: mongoose.Schema.Types.ObjectId,
    premium: Number,
    quotedAt: Date
  },
  
  // 市场数据快照
  marketData: {
    spotPrice: Number,
    volatility: Number,
    riskFreeRate: Number,
    dividendYield: Number,
    timeToExpiry: Number,
    capturedAt: {
      type: Date,
      default: Date.now
    }
  },
  
  // 风险评估
  riskMetrics: {
    probabilityOfProfit: Number,
    maxPotentialLoss: Number,
    maxPotentialGain: Number,
    breakEvenPoint: Number,
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    }
  },
  
  // 询价来源
  source: {
    type: String,
    enum: ['manual', 'strategy', 'api'],
    default: 'manual'
  },
  
  // 备注信息
  notes: {
    type: String,
    maxlength: 500
  },
  
  // 有效期
  validUntil: {
    type: Date,
    required: true
  },
  
  // 时间戳
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 索引
inquirySchema.index({ inquiryId: 1 });
inquirySchema.index({ userId: 1, createdAt: -1 });
inquirySchema.index({ 'underlyingAsset.symbol': 1, status: 1 });
inquirySchema.index({ status: 1, validUntil: 1 });
inquirySchema.index({ expiryDate: 1 });
inquirySchema.index({ createdAt: -1 });

// 虚拟字段
inquirySchema.virtual('timeToExpiry').get(function() {
  return (this.expiryDate - Date.now()) / (1000 * 60 * 60 * 24);
});

inquirySchema.virtual('activeQuotes').get(function() {
  return this.quotes.filter(quote => 
    quote.quoteStatus === 'active' && 
    quote.validUntil > new Date()
  );
});

inquirySchema.virtual('isExpired').get(function() {
  return this.validUntil < new Date();
});

// 实例方法
inquirySchema.methods.addQuote = function(quoteData) {
  this.quotes.push(quoteData);
  this.status = 'quoted';
  this.updateBestQuote();
  return this.save();
};

inquirySchema.methods.updateBestQuote = function() {
  const activeQuotes = this.activeQuotes;
  if (activeQuotes.length === 0) {
    this.bestQuote = null;
    return;
  }
  
  // 找到最低权利金的报价
  const bestQuote = activeQuotes.reduce((best, current) => {
    return current.premium < best.premium ? current : best;
  });
  
  this.bestQuote = {
    quoteId: bestQuote.quoteId,
    dealerId: bestQuote.dealerId,
    premium: bestQuote.premium,
    quotedAt: bestQuote.quotedAt
  };
};

inquirySchema.methods.expireQuotes = function() {
  this.quotes.forEach(quote => {
    if (quote.validUntil < new Date() && quote.quoteStatus === 'active') {
      quote.quoteStatus = 'expired';
    }
  });
  this.updateBestQuote();
  return this.save();
};

inquirySchema.methods.cancel = function() {
  if (this.status === 'traded') {
    throw new Error('已成交的询价无法取消');
  }
  this.status = 'cancelled';
  return this.save();
};

// 静态方法
inquirySchema.statics.findByUserId = function(userId, options = {}) {
  const query = { userId };
  if (options.status) {
    query.status = options.status;
  }
  return this.find(query).sort({ createdAt: -1 });
};

inquirySchema.statics.findActiveInquiries = function() {
  return this.find({
    status: { $in: ['pending', 'quoted'] },
    validUntil: { $gt: new Date() }
  });
};

inquirySchema.statics.findBySymbol = function(symbol) {
  return this.find({ 'underlyingAsset.symbol': symbol });
};

// 中间件
inquirySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // 检查询价是否过期
  if (this.validUntil < new Date() && this.status === 'pending') {
    this.status = 'expired';
  }
  
  next();
});

// 自动过期处理
inquirySchema.index({ validUntil: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Inquiry', inquirySchema);