// 计算器页面
Page({
  data: {
    calculatorType: 'black-scholes', // black-scholes, binomial, monte-carlo
    inputs: {
      stockPrice: '',
      strikePrice: '',
      riskFreeRate: '3.0',
      volatility: '25.0',
      timeToExpiry: '',
      dividendYield: '0.0',
      optionType: 'call' // call, put
    },
    results: null,
    calculating: false,
    history: []
  },

  onLoad: function (options) {
    console.log('计算器页面加载');
    this.loadHistory();
  },

  // 输入变化处理
  onInputChange: function(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    
    this.setData({
      [`inputs.${field}`]: value
    });
  },

  // 期权类型选择
  onOptionTypeChange: function(e) {
    this.setData({
      'inputs.optionType': e.detail.value
    });
  },

  // 计算器类型选择
  onCalculatorTypeChange: function(e) {
    this.setData({
      calculatorType: e.detail.value,
      results: null
    });
  },

  // 执行计算
  calculate: function() {
    const inputs = this.data.inputs;
    
    // 输入验证
    if (!this.validateInputs(inputs)) {
      return;
    }

    this.setData({ calculating: true });

    // 模拟计算过程
    setTimeout(() => {
      const results = this.performCalculation(inputs);
      
      this.setData({
        results: results,
        calculating: false
      });

      // 保存到历史记录
      this.saveToHistory(inputs, results);
    }, 1500);
  },

  // 输入验证
  validateInputs: function(inputs) {
    const required = ['stockPrice', 'strikePrice', 'timeToExpiry'];
    
    for (let field of required) {
      if (!inputs[field] || isNaN(parseFloat(inputs[field]))) {
        wx.showToast({
          title: '请填写所有必填项',
          icon: 'none'
        });
        return false;
      }
    }

    const stockPrice = parseFloat(inputs.stockPrice);
    const strikePrice = parseFloat(inputs.strikePrice);
    const timeToExpiry = parseFloat(inputs.timeToExpiry);
    const volatility = parseFloat(inputs.volatility);
    const riskFreeRate = parseFloat(inputs.riskFreeRate);

    if (stockPrice <= 0 || strikePrice <= 0) {
      wx.showToast({
        title: '价格必须大于0',
        icon: 'none'
      });
      return false;
    }

    if (timeToExpiry <= 0) {
      wx.showToast({
        title: '到期时间必须大于0',
        icon: 'none'
      });
      return false;
    }

    if (volatility <= 0 || volatility > 200) {
      wx.showToast({
        title: '波动率应在0-200%之间',
        icon: 'none'
      });
      return false;
    }

    if (riskFreeRate < 0 || riskFreeRate > 50) {
      wx.showToast({
        title: '无风险利率应在0-50%之间',
        icon: 'none'
      });
      return false;
    }

    return true;
  },

  // 执行计算（简化的Black-Scholes公式）
  performCalculation: function(inputs) {
    const S = parseFloat(inputs.stockPrice);
    const K = parseFloat(inputs.strikePrice);
    const r = parseFloat(inputs.riskFreeRate) / 100;
    const sigma = parseFloat(inputs.volatility) / 100;
    const T = parseFloat(inputs.timeToExpiry) / 365;
    const q = parseFloat(inputs.dividendYield) / 100;
    const isCall = inputs.optionType === 'call';

    // 简化的Black-Scholes计算
    const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    // 累积标准正态分布函数（近似）
    const normCDF = (x) => {
      return 0.5 * (1 + this.erf(x / Math.sqrt(2)));
    };

    const erf = (x) => {
      const a1 =  0.254829592;
      const a2 = -0.284496736;
      const a3 =  1.421413741;
      const a4 = -1.453152027;
      const a5 =  1.061405429;
      const p  =  0.3275911;

      const sign = x < 0 ? -1 : 1;
      x = Math.abs(x);

      const t = 1.0 / (1.0 + p * x);
      const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

      return sign * y;
    };

    this.erf = erf;

    let optionPrice, delta, gamma, theta, vega, rho;

    if (isCall) {
      optionPrice = S * Math.exp(-q * T) * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
      delta = Math.exp(-q * T) * normCDF(d1);
    } else {
      optionPrice = K * Math.exp(-r * T) * normCDF(-d2) - S * Math.exp(-q * T) * normCDF(-d1);
      delta = -Math.exp(-q * T) * normCDF(-d1);
    }

    // 计算希腊字母
    const phi = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
    
    gamma = Math.exp(-q * T) * phi(d1) / (S * sigma * Math.sqrt(T));
    vega = S * Math.exp(-q * T) * phi(d1) * Math.sqrt(T) / 100;
    
    if (isCall) {
      theta = (-S * Math.exp(-q * T) * phi(d1) * sigma / (2 * Math.sqrt(T)) 
               - r * K * Math.exp(-r * T) * normCDF(d2)
               + q * S * Math.exp(-q * T) * normCDF(d1)) / 365;
      rho = K * T * Math.exp(-r * T) * normCDF(d2) / 100;
    } else {
      theta = (-S * Math.exp(-q * T) * phi(d1) * sigma / (2 * Math.sqrt(T))
               + r * K * Math.exp(-r * T) * normCDF(-d2)
               - q * S * Math.exp(-q * T) * normCDF(-d1)) / 365;
      rho = -K * T * Math.exp(-r * T) * normCDF(-d2) / 100;
    }

    return {
      optionPrice: optionPrice.toFixed(4),
      delta: delta.toFixed(4),
      gamma: gamma.toFixed(6),
      theta: theta.toFixed(4),
      vega: vega.toFixed(4),
      rho: rho.toFixed(4),
      intrinsicValue: Math.max(isCall ? S - K : K - S, 0).toFixed(4),
      timeValue: (optionPrice - Math.max(isCall ? S - K : K - S, 0)).toFixed(4),
      moneyness: isCall ? (S > K ? '价内' : S < K ? '价外' : '平价') : (S < K ? '价内' : S > K ? '价外' : '平价')
    };
  },

  // 保存到历史记录
  saveToHistory: function(inputs, results) {
    const history = this.data.history;
    const record = {
      id: Date.now(),
      timestamp: new Date().toLocaleString(),
      inputs: { ...inputs },
      results: { ...results },
      calculatorType: this.data.calculatorType
    };

    history.unshift(record);
    if (history.length > 10) {
      history.pop();
    }

    this.setData({ history });
    
    // 保存到本地存储
    wx.setStorageSync('calculator_history', history);
  },

  // 加载历史记录
  loadHistory: function() {
    try {
      const history = wx.getStorageSync('calculator_history') || [];
      this.setData({ history });
    } catch (e) {
      console.error('加载历史记录失败:', e);
    }
  },

  // 清空输入
  clearInputs: function() {
    this.setData({
      inputs: {
        stockPrice: '',
        strikePrice: '',
        riskFreeRate: '3.0',
        volatility: '25.0',
        timeToExpiry: '',
        dividendYield: '0.0',
        optionType: 'call'
      },
      results: null
    });
  },

  // 查看历史记录
  viewHistory: function(e) {
    const index = e.currentTarget.dataset.index;
    const record = this.data.history[index];
    
    this.setData({
      inputs: record.inputs,
      results: record.results,
      calculatorType: record.calculatorType
    });

    wx.showToast({
      title: '已加载历史记录',
      icon: 'success'
    });
  },

  // 删除历史记录
  deleteHistory: function(e) {
    const index = e.currentTarget.dataset.index;
    const history = this.data.history;
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条历史记录吗？',
      success: (res) => {
        if (res.confirm) {
          history.splice(index, 1);
          this.setData({ history });
          wx.setStorageSync('calculator_history', history);
        }
      }
    });
  }
});