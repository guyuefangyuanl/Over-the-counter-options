// pages/calculator/calculator.js
Page({
  data: {
    calculatorMode: 'profit', // profit: 香草收益, breakeven: 盈亏平衡
    underlying: {
      name: '宁德时代',
      code: '300750.SZ'
    },
    strategy: '平值看涨',
    inputs: {
      optionFeeRate: '13.6',
      entryPrice: '261.28',
      settlementPrice: '287.28',
      notionalPrincipal: '100',
      otherFees: '',
      taxRate: ''
    },
    results: null,
    calculating: false,
    showStrategyPicker: false,
    strategies: ['平值看涨', '平值看跌', '虚值看涨', '虚值看跌', '实值看涨', '实值看跌']
  },

  onLoad: function (options) {
    console.log('计算器页面加载');
  },

  // 切换计算模式
  onTabChange: function(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({
      calculatorMode: mode,
      results: null // 切换模式时清空结果
    });
  },

  // 输入变化处理
  onInputChange: function(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`inputs.${field}`]: value
    });
  },

  // 打开策略选择器
  onStrategySelect: function() {
    this.setData({ showStrategyPicker: true });
  },

  // 关闭策略选择器
  onStrategyPickerClose: function() {
    this.setData({ showStrategyPicker: false });
  },

  // 选择策略
  onStrategyChange: function(e) {
    const strategy = e.currentTarget.dataset.strategy;
    this.setData({
      strategy: strategy,
      showStrategyPicker: false
    });
  },

  // 跳转到标的物选择页面
  onUnderlyingTap: function() {
    wx.navigateTo({
      url: '/pages/search/search?target=underlying'
    });
  },

  // 执行计算
  calculate: function() {
    if (!this.validateInputs()) {
      return;
    }

    this.setData({ calculating: true, results: null });

    // 模拟计算延迟
    setTimeout(() => {
      const results = this.performCalculation();
      this.setData({
        results: results,
        calculating: false
      });
    }, 1000);
  },

  // 输入验证
  validateInputs: function() {
    const { inputs, calculatorMode } = this.data;
    const requiredFields = {
      profit: ['optionFeeRate', 'entryPrice', 'settlementPrice', 'notionalPrincipal'],
      breakeven: ['optionFeeRate', 'entryPrice']
    };

    for (const field of requiredFields[calculatorMode]) {
      if (inputs[field] === '' || isNaN(parseFloat(inputs[field]))) {
        wx.showToast({
          title: '请填写所有必填项',
          icon: 'none'
        });
        return false;
      }
    }
    return true;
  },

  // 执行计算逻辑（占位符）
  performCalculation: function() {
    const { inputs, calculatorMode, strategy } = this.data;
    const optionFeeRate = parseFloat(inputs.optionFeeRate) / 100;
    const entryPrice = parseFloat(inputs.entryPrice);
    const notionalPrincipal = parseFloat(inputs.notionalPrincipal) * 10000; // 万元转元

    if (calculatorMode === 'profit') {
      const settlementPrice = parseFloat(inputs.settlementPrice);
      const taxRate = inputs.taxRate ? parseFloat(inputs.taxRate) / 100 : 0;
      const otherFees = inputs.otherFees ? parseFloat(inputs.otherFees) * 10000 : 0;

      let pnl = 0;
      if (strategy.includes('看涨')) {
        pnl = (settlementPrice - entryPrice) / entryPrice;
      } else {
        pnl = (entryPrice - settlementPrice) / entryPrice;
      }

      const settlementPnl = pnl * notionalPrincipal;
      const optionFee = optionFeeRate * notionalPrincipal;
      const grossPnl = settlementPnl - optionFee - otherFees;
      const tax = grossPnl > 0 ? grossPnl * taxRate : 0;
      const netPnl = grossPnl - tax;
      const pnlRate = (netPnl / (optionFee + otherFees)) * 100;

      return {
        settlementPnl: settlementPnl.toFixed(2),
        netPnl: netPnl.toFixed(2),
        pnlRate: pnlRate.toFixed(2),
        optionFee: optionFee.toFixed(2),
        otherFees: otherFees.toFixed(2),
        tax: tax.toFixed(2)
      };
    } else { // breakeven
      let breakevenPrice;
      if (strategy.includes('看涨')) {
        breakevenPrice = entryPrice * (1 + optionFeeRate);
      } else {
        breakevenPrice = entryPrice * (1 - optionFeeRate);
      }
      return {
        breakevenPrice: breakevenPrice.toFixed(2)
      };
    }
  },

  // 重置所有输入
  reset: function() {
    this.setData({
      inputs: {
        optionFeeRate: '13.6',
        entryPrice: '261.28',
        settlementPrice: '287.28',
        notionalPrincipal: '100',
        otherFees: '',
        taxRate: ''
      },
      results: null,
      calculating: false
    });
  },

  // 分享结果
  share: function() {
    wx.showToast({
      title: '结果已复制，可以分享了',
      icon: 'success'
    });
  },

  // 录入持仓
  recordPosition: function() {
    const { results, underlying, strategy, inputs, calculatorMode } = this.data;

    // 检查是否有计算结果
    if (!results) {
      wx.showToast({
        title: '请先计算收益',
        icon: 'none'
      });
      return;
    }

    // 只支持收益计算模式的录入
    if (calculatorMode !== 'profit') {
      wx.showToast({
        title: '仅支持收益计算模式录入',
        icon: 'none'
      });
      return;
    }

    // 检查登录状态
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo || !userInfo.isLoggedIn) {
      wx.showModal({
        title: '提示',
        content: '请先登录后再录入持仓',
        confirmText: '去登录',
        success: function(res) {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/login/login'
            });
          }
        }
      });
      return;
    }

    // 检查是否是游客模式
    if (userInfo.isGuest) {
      wx.showModal({
        title: '提示',
        content: '游客模式下无法录入持仓，请先登录正式账户',
        confirmText: '去登录',
        success: function(res) {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/login/login'
            });
          }
        }
      });
      return;
    }

    // 构建持仓数据
    const positionData = {
      underlying: underlying,
      strategy: strategy,
      optionType: strategy.includes('看涨') ? 'call' : 'put',
      entryPrice: parseFloat(inputs.entryPrice),
      settlementPrice: parseFloat(inputs.settlementPrice),
      notionalAmount: parseFloat(inputs.notionalPrincipal),
      optionFeeRate: parseFloat(inputs.optionFeeRate),
      optionFee: results.optionFee,
      netPnl: results.netPnl,
      pnlRate: results.pnlRate,
      createdAt: new Date().toISOString()
    };

    // 跳转到账户页面创建持仓
    wx.navigateTo({
      url: '/pages/account/account?action=create&data=' + encodeURIComponent(JSON.stringify(positionData)),
      fail: function(err) {
        console.error('跳转失败:', err);
        // 降级处理：尝试switchTab
        wx.switchTab({
          url: '/pages/account/account',
          success: function() {
            // 存储待录入数据，账户页面可以读取
            wx.setStorageSync('pendingPositionData', positionData);
            wx.showToast({
              title: '请在账户页面完成录入',
              icon: 'none',
              duration: 2000
            });
          },
          fail: function() {
            wx.showToast({
              title: '页面跳转失败，请稍后重试',
              icon: 'none'
            });
          }
        });
      }
    });
  }
});