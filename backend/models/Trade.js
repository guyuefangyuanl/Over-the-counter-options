const mongoose = require('mongoose');

// 交易状态枚举
const TradeStatus = {
  PENDING: 'pending',           // 待处理
  ACTIVE: 'active',             // 活跃
  EXERCISED: 'exercised',       // 已行权
  EXPIRED: 'expired',           // 已过期
  CLOSED: 'closed',             // 已平仓
  CANCELLED: 'cancelled'        // 已取消
};

// 期权类型枚举
const OptionType = {
  CALL: 'call',                 // 看涨期权
  PUT: 'put'                    // 看跌期权
};

// 交易方向枚举
const TradeDirection = {
  BUY: 'buy',                   // 买入
  SELL: 'sell'                  // 卖出
};

// 交易Schema
const tradeSchema = new mongoose.Schema({
  // 基本信息
  tradeId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  
  // 期权信息
  optionType: {
    type: String,
    enum: Object.values(OptionType),
    required: true
  },
  direction: {
    type: String,
    enum: Object.values(TradeDirection),
    required: true
  },
  underlyingAsset: {
    type: String,
    required: true,
    index: true
  },
  
  // 价格信息
  strikePrice: {
    type: Number,
    required: true,
    min: 0
  },
  premium: {
    type: Number,
    required: true,
    min: 0
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  
  // 时间信息
  expiryDate: {
    type: Date,
    required: true,
    index: true
  },
  tradeDate: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // 状态信息
  status: {
    type: String,
    enum: Object.values(TradeStatus),
    default: TradeStatus.PENDING,
    index: true
  },
  
  // 行权信息
  exerciseData: {
    exercisedAt: Date,
    exercisePrice: Number,
    profit: Number
  },
  
  // 平仓信息
  closeData: {
    closedAt: Date,
    closePrice: Number,
    profit: Number
  },
  
  // 风险指标
  greeks: {
    delta: Number,
    gamma: Number,
    theta: Number,
    vega: Number,
    rho: Number
  },
  
  // 保证金
  margin: {
    initial: Number,
    maintenance: Number,
    current: Number
  },
  
  // 备注
  notes: String,
  
  // 元数据
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 索引
tradeSchema.index({ userId: 1, status: 1 });
tradeSchema.index({ userId: 1, tradeDate: -1 });
tradeSchema.index({ expiryDate: 1, status: 1 });

// 虚拟字段：是否已过期
tradeSchema.virtual('isExpired').get(function() {
  return this.expiryDate < new Date() && this.status === TradeStatus.ACTIVE;
});

// 虚拟字段：剩余天数
tradeSchema.virtual('daysToExpiry').get(function() {
  const now = new Date();
  const diffTime = this.expiryDate - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// 虚拟字段：总价值
tradeSchema.virtual('totalValue').get(function() {
  return this.premium * this.quantity;
});

// 实例方法：行权
tradeSchema.methods.exerciseOption = async function(exercisePrice) {
  if (this.status !== TradeStatus.ACTIVE) {
    throw new Error('只能行权状态为活跃的交易');
  }
  
  if (new Date() > this.expiryDate) {
    throw new Error('期权已过期，无法行权');
  }
  
  // 计算盈亏
  let profit = 0;
  if (this.optionType === OptionType.CALL) {
    profit = (exercisePrice - this.strikePrice) * this.quantity - this.totalValue;
  } else {
    profit = (this.strikePrice - exercisePrice) * this.quantity - this.totalValue;
  }
  
  this.status = TradeStatus.EXERCISED;
  this.exerciseData = {
    exercisedAt: new Date(),
    exercisePrice: exercisePrice,
    profit: profit
  };
  
  return await this.save();
};

// 实例方法：平仓
tradeSchema.methods.closePosition = async function(closePrice) {
  if (this.status !== TradeStatus.ACTIVE) {
    throw new Error('只能平仓状态为活跃的交易');
  }
  
  // 计算盈亏
  let profit = 0;
  if (this.direction === TradeDirection.BUY) {
    profit = (closePrice - this.premium) * this.quantity;
  } else {
    profit = (this.premium - closePrice) * this.quantity;
  }
  
  this.status = TradeStatus.CLOSED;
  this.closeData = {
    closedAt: new Date(),
    closePrice: closePrice,
    profit: profit
  };
  
  return await this.save();
};

// 实例方法：取消交易
tradeSchema.methods.cancel = async function() {
  if (this.status !== TradeStatus.PENDING) {
    throw new Error('只能取消待处理的交易');
  }
  
  this.status = TradeStatus.CANCELLED;
  return await this.save();
};

// 实例方法：更新希腊值
tradeSchema.methods.updateGreeks = async function(greeks) {
  this.greeks = {
    delta: greeks.delta || this.greeks?.delta,
    gamma: greeks.gamma || this.greeks?.gamma,
    theta: greeks.theta || this.greeks?.theta,
    vega: greeks.vega || this.greeks?.vega,
    rho: greeks.rho || this.greeks?.rho
  };
  
  return await this.save();
};

// 静态方法：获取用户活跃交易
tradeSchema.statics.getActiveTrades = function(userId) {
  return this.find({
    userId: userId,
    status: TradeStatus.ACTIVE
  }).sort({ tradeDate: -1 });
};

// 静态方法：获取即将到期的交易
tradeSchema.statics.getExpiringTrades = function(days = 7) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  
  return this.find({
    status: TradeStatus.ACTIVE,
    expiryDate: { $lte: futureDate, $gte: new Date() }
  }).sort({ expiryDate: 1 });
};

// 静态方法：检查并更新过期交易
tradeSchema.statics.updateExpiredTrades = async function() {
  const result = await this.updateMany(
    {
      status: TradeStatus.ACTIVE,
      expiryDate: { $lt: new Date() }
    },
    {
      $set: { status: TradeStatus.EXPIRED }
    }
  );
  
  return result.modifiedCount;
};

// 中间件：保存前验证
tradeSchema.pre('save', function(next) {
  // 确保到期日期在未来
  if (this.isNew && this.expiryDate <= new Date()) {
    return next(new Error('到期日期必须在未来'));
  }
  
  // 确保执行价格为正数
  if (this.strikePrice <= 0) {
    return next(new Error('执行价格必须大于0'));
  }
  
  next();
});

// 导出模型
const Trade = mongoose.model('Trade', tradeSchema);

module.exports = Trade;
module.exports.TradeStatus = TradeStatus;
module.exports.OptionType = OptionType;
module.exports.TradeDirection = TradeDirection;