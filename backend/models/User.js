const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // 用户基本信息
  openId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  unionId: {
    type: String,
    index: true
  },
  // QQ登录相关
  qqOpenId: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  qqUnionId: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  // 登录方式记录
  loginType: {
    type: String,
    enum: ['wechat', 'qq', 'phone', 'guest'],
    default: 'wechat'
  },
  nickname: {
    type: String,
    required: true
  },
  avatar: {
    type: String,
    default: ''
  },
  phone: {
    type: String,
    unique: true,
    sparse: true
  },
  email: {
    type: String,
    unique: true,
    sparse: true
  },
  
  // 认证信息
  isVerified: {
    type: Boolean,
    default: false
  },
  idCard: {
    type: String,
    sparse: true
  },
  realName: {
    type: String,
    sparse: true
  },
  
  // 风险等级评估
  riskLevel: {
    type: String,
    enum: ['conservative', 'moderate', 'aggressive'],
    default: 'conservative'
  },
  riskScore: {
    type: Number,
    default: 0
  },
  riskAssessmentDate: {
    type: Date
  },
  
  // 账户信息
  accounts: [{
    accountId: {
      type: String,
      required: true
    },
    accountName: {
      type: String,
      required: true
    },
    accountType: {
      type: String,
      enum: ['demo', 'real'],
      default: 'demo'
    },
    balance: {
      type: Number,
      default: 0
    },
    frozenAmount: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: 'CNY'
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  
  // 当前活跃账户
  activeAccountId: {
    type: String
  },
  
  // 用户偏好设置
  preferences: {
    language: {
      type: String,
      default: 'zh-CN'
    },
    timezone: {
      type: String,
      default: 'Asia/Shanghai'
    },
    notifications: {
      priceAlert: {
        type: Boolean,
        default: true
      },
      tradeAlert: {
        type: Boolean,
        default: true
      },
      marketNews: {
        type: Boolean,
        default: false
      }
    },
    displaySettings: {
      theme: {
        type: String,
        enum: ['light', 'dark'],
        default: 'light'
      },
      priceFormat: {
        type: String,
        enum: ['decimal', 'fraction'],
        default: 'decimal'
      }
    }
  },
  
  // 状态信息
  status: {
    type: String,
    enum: ['active', 'suspended', 'disabled'],
    default: 'active'
  },
  lastLoginTime: {
    type: Date
  },
  lastActiveTime: {
    type: Date,
    default: Date.now
  },
  
  // 系统字段
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
userSchema.index({ openId: 1 });
userSchema.index({ qqOpenId: 1 });
userSchema.index({ qqUnionId: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ email: 1 });
userSchema.index({ createdAt: -1 });

// 虚拟字段
userSchema.virtual('activeAccount').get(function() {
  return this.accounts.find(account => account.accountId === this.activeAccountId);
});

userSchema.virtual('totalBalance').get(function() {
  return this.accounts.reduce((total, account) => total + account.balance, 0);
});

// 实例方法
userSchema.methods.addAccount = function(accountData) {
  this.accounts.push(accountData);
  if (!this.activeAccountId) {
    this.activeAccountId = accountData.accountId;
  }
  return this.save();
};

userSchema.methods.switchAccount = function(accountId) {
  const account = this.accounts.find(acc => acc.accountId === accountId && acc.isActive);
  if (!account) {
    throw new Error('账户不存在或已禁用');
  }
  this.activeAccountId = accountId;
  return this.save();
};

userSchema.methods.updateBalance = function(accountId, amount, type = 'add') {
  const account = this.accounts.find(acc => acc.accountId === accountId);
  if (!account) {
    throw new Error('账户不存在');
  }
  
  if (type === 'add') {
    account.balance += amount;
  } else if (type === 'subtract') {
    if (account.balance < amount) {
      throw new Error('余额不足');
    }
    account.balance -= amount;
  } else if (type === 'set') {
    account.balance = amount;
  }
  
  return this.save();
};

userSchema.methods.freezeAmount = function(accountId, amount) {
  const account = this.accounts.find(acc => acc.accountId === accountId);
  if (!account) {
    throw new Error('账户不存在');
  }
  
  if (account.balance < amount) {
    throw new Error('可用余额不足');
  }
  
  account.balance -= amount;
  account.frozenAmount += amount;
  return this.save();
};

userSchema.methods.unfreezeAmount = function(accountId, amount) {
  const account = this.accounts.find(acc => acc.accountId === accountId);
  if (!account) {
    throw new Error('账户不存在');
  }
  
  if (account.frozenAmount < amount) {
    throw new Error('冻结金额不足');
  }
  
  account.frozenAmount -= amount;
  account.balance += amount;
  return this.save();
};

// 静态方法
userSchema.statics.findByOpenId = function(openId) {
  return this.findOne({ openId });
};

userSchema.statics.findByQQOpenId = function(qqOpenId) {
  return this.findOne({ qqOpenId });
};

userSchema.statics.findByPhone = function(phone) {
  return this.findOne({ phone });
};

userSchema.statics.findActiveUsers = function() {
  return this.find({ status: 'active' });
};

// 中间件
userSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('User', userSchema);