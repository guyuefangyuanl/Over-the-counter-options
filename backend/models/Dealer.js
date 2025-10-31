const mongoose = require('mongoose');

const dealerSchema = new mongoose.Schema({
  // 交易商基本信息
  dealerId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  dealerName: {
    type: String,
    required: true
  },
  displayName: {
    type: String,
    required: true
  },
  logo: {
    type: String,
    default: ''
  },
  
  // 交易商类型
  dealerType: {
    type: String,
    enum: ['bank', 'securities', 'insurance', 'fund', 'private'],
    required: true
  },
  
  // 联系信息
  contact: {
    email: {
      type: String,
      required: true
    },
    phone: {
      type: String,
      required: true
    },
    address: {
      type: String,
      required: true
    },
    website: {
      type: String
    }
  },
  
  // 业务资质
  licenses: [{
    licenseType: String,
    licenseNumber: String,
    issueDate: Date,
    expiryDate: Date,
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  
  // 交易能力
  tradingCapabilities: {
    supportedAssets: [{
      type: String,
      enum: ['stock', 'index', 'commodity', 'currency', 'bond']
    }],
    supportedMarkets: [String],
    maxNotionalAmount: {
      type: Number,
      default: 0
    },
    minNotionalAmount: {
      type: Number,
      default: 1000
    },
    maxTenor: {
      type: Number, // 天数
      default: 365
    }
  },
  
  // 风险管理
  riskLimits: {
    dailyLimit: {
      type: Number,
      default: 0
    },
    positionLimit: {
      type: Number,
      default: 0
    },
    deltaLimit: {
      type: Number,
      default: 0
    },
    vegaLimit: {
      type: Number,
      default: 0
    }
  },
  
  // 当前风险暴露
  currentExposure: {
    totalNotional: {
      type: Number,
      default: 0
    },
    netDelta: {
      type: Number,
      default: 0
    },
    netGamma: {
      type: Number,
      default: 0
    },
    netVega: {
      type: Number,
      default: 0
    },
    netTheta: {
      type: Number,
      default: 0
    }
  },
  
  // 定价参数
  pricingParams: {
    volatilityAdjustment: {
      type: Number,
      default: 0 // 基准波动率的调整百分比
    },
    riskFreeRateAdjustment: {
      type: Number,
      default: 0
    },
    creditSpread: {
      type: Number,
      default: 0
    },
    minimumSpread: {
      type: Number,
      default: 0.001 // 最小买卖价差
    }
  },
  
  // 报价策略
  quotingStrategy: {
    autoQuoting: {
      type: Boolean,
      default: false
    },
    quoteValidityPeriod: {
      type: Number,
      default: 300 // 秒
    },
    maxQuotesPerDay: {
      type: Number,
      default: 1000
    },
    blackoutPeriods: [{
      startTime: String, // HH:mm格式
      endTime: String,
      timezone: {
        type: String,
        default: 'Asia/Shanghai'
      }
    }]
  },
  
  // 业绩统计
  performance: {
    totalVolume: {
      type: Number,
      default: 0
    },
    totalTrades: {
      type: Number,
      default: 0
    },
    averageSpread: {
      type: Number,
      default: 0
    },
    quoteAcceptanceRate: {
      type: Number,
      default: 0
    },
    lastTradeDate: Date
  },
  
  // 评级信息
  rating: {
    creditRating: {
      type: String,
      enum: ['AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-', 'BBB+', 'BBB', 'BBB-']
    },
    ratingAgency: String,
    ratingDate: Date,
    outlook: {
      type: String,
      enum: ['positive', 'stable', 'negative']
    }
  },
  
  // 状态信息
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  lastOnlineTime: Date,
  
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
dealerSchema.index({ dealerId: 1 });
dealerSchema.index({ status: 1, isOnline: 1 });
dealerSchema.index({ dealerType: 1 });
dealerSchema.index({ 'tradingCapabilities.supportedAssets': 1 });

// 虚拟字段
dealerSchema.virtual('utilizationRate').get(function() {
  if (this.riskLimits.positionLimit === 0) return 0;
  return (this.currentExposure.totalNotional / this.riskLimits.positionLimit) * 100;
});

dealerSchema.virtual('isWithinLimits').get(function() {
  return this.currentExposure.totalNotional <= this.riskLimits.positionLimit;
});

// 实例方法
dealerSchema.methods.canQuote = function(inquiryData) {
  // 检查交易商状态
  if (this.status !== 'active' || !this.isOnline) {
    return { canQuote: false, reason: '交易商不在线或状态异常' };
  }
  
  // 检查资产类型支持
  if (!this.tradingCapabilities.supportedAssets.includes('stock')) {
    return { canQuote: false, reason: '不支持该资产类型' };
  }
  
  // 检查金额限制
  if (inquiryData.notionalAmount < this.tradingCapabilities.minNotionalAmount ||
      inquiryData.notionalAmount > this.tradingCapabilities.maxNotionalAmount) {
    return { canQuote: false, reason: '金额超出可交易范围' };
  }
  
  // 检查风险限制
  const newTotalNotional = this.currentExposure.totalNotional + inquiryData.notionalAmount;
  if (newTotalNotional > this.riskLimits.positionLimit) {
    return { canQuote: false, reason: '超出风险限额' };
  }
  
  return { canQuote: true };
};

dealerSchema.methods.updateExposure = function(delta, gamma, vega, theta, notional) {
  this.currentExposure.totalNotional += notional;
  this.currentExposure.netDelta += delta;
  this.currentExposure.netGamma += gamma;
  this.currentExposure.netVega += vega;
  this.currentExposure.netTheta += theta;
  return this.save();
};

dealerSchema.methods.generateQuote = function(inquiryData, marketData) {
  const { canQuote, reason } = this.canQuote(inquiryData);
  if (!canQuote) {
    throw new Error(reason);
  }
  
  // 基础期权定价（这里简化处理）
  const timeToExpiry = (inquiryData.expiryDate - Date.now()) / (1000 * 60 * 60 * 24 * 365);
  const moneyness = inquiryData.strikePrice / marketData.spotPrice;
  
  // 应用交易商特定的定价调整
  const adjustedVolatility = marketData.volatility * (1 + this.pricingParams.volatilityAdjustment);
  const adjustedRate = marketData.riskFreeRate + this.pricingParams.riskFreeRateAdjustment;
  
  // 模拟计算权利金（实际应使用Black-Scholes公式）
  let premium = inquiryData.notionalAmount * 0.05; // 简化计算
  premium += this.pricingParams.creditSpread * inquiryData.notionalAmount;
  
  const spread = Math.max(premium * this.pricingParams.minimumSpread, 100);
  
  return {
    premium: Math.round(premium * 100) / 100,
    bidPrice: premium - spread / 2,
    askPrice: premium + spread / 2,
    spread: spread,
    validUntil: new Date(Date.now() + this.quotingStrategy.quoteValidityPeriod * 1000)
  };
};

// 静态方法
dealerSchema.statics.findActiveOnlineDealers = function() {
  return this.find({
    status: 'active',
    isOnline: true
  });
};

dealerSchema.statics.findByAssetType = function(assetType) {
  return this.find({
    'tradingCapabilities.supportedAssets': assetType,
    status: 'active'
  });
};

// 中间件
dealerSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Dealer', dealerSchema);