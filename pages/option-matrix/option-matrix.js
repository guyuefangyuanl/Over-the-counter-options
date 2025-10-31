// pages/option-matrix/option-matrix.js
Page({
  data: {
    selectedUnderlying: '中证1000',
    underlyingOptions: [
      { code: '中证1000', name: '中证1000', price: 6420.35 },
      { code: '上证50ETF', name: '上证50ETF', price: 2.445 },
      { code: '沪深300ETF', name: '沪深300ETF', price: 3.852 },
      { code: '创业板ETF', name: '创业板ETF', price: 2.198 }
    ],
    currentPrice: 6420.35,
    maturityPeriods: ['2W', '1M', '2M', '3M', '6M', '12M'],
    strikeTypes: ['100C', '103C', '105C', '110C', '80C', '90C', '95C', '8080', '9090', '9070'],
    optionMatrix: {
      // 期权报价矩阵数据
      '100C': {
        '2W': '--', '1M': '3.65%', '2M': '5.16%', '3M': '6.16%', '6M': '8.97%', '12M': '--'
      },
      '103C': {
        '2W': '--', '1M': '3.43%', '2M': '5.43%', '3M': '6.56%', '6M': '9.07%', '12M': '--'
      },
      '105C': {
        '2W': '--', '1M': '2.22%', '2M': '3.75%', '3M': '4.78%', '6M': '7.76%', '12M': '--'
      },
      '110C': {
        '2W': '--', '1M': '2.04%', '2M': '3.49%', '3M': '4.58%', '6M': '7.06%', '12M': '--'
      },
      '80C': {
        '2W': '--', '1M': '20.45%', '2M': '21.14%', '3M': '21.68%', '6M': '23.34%', '12M': '--'
      },
      '90C': {
        '2W': '--', '1M': '11.28%', '2M': '12.74%', '3M': '13.65%', '6M': '15.89%', '12M': '--'
      },
      '95C': {
        '2W': '--', '1M': '--', '2M': '--', '3M': '--', '6M': '--', '12M': '--'
      },
      '8080': {
        '2W': '--', '1M': '19.63%', '2M': '20.04%', '3M': '20.40%', '6M': '21.66%', '12M': '--'
      },
      '9090': {
        '2W': '--', '1M': '10.89%', '2M': '12.19%', '3M': '13.01%', '6M': '15.05%', '12M': '--'
      },
      '9070': {
        '2W': '--', '1M': '10.11%', '2M': '11.09%', '3M': '11.73%', '6M': '13.37%', '12M': '--'
      }
    },
    selectedCell: null, // 选中的单元格
    showQuoteDetail: false, // 显示报价详情
    quoteDetail: null // 报价详情数据
  },

  onLoad: function (options) {
    this.initMatrix();
    this.loadMarketData();
  },

  // 初始化矩阵
  initMatrix: function () {
    wx.setNavigationBarTitle({
      title: '期权结构/期限'
    });
  },

  // 加载市场数据
  loadMarketData: function () {
    // 模拟获取实时市场数据
    const selectedUnderlying = this.data.underlyingOptions.find(
      item => item.code === this.data.selectedUnderlying
    );
    
    if (selectedUnderlying) {
      this.setData({
        currentPrice: selectedUnderlying.price
      });
    }
    
    // 更新期权报价矩阵
    this.updateOptionMatrix();
  },

  // 更新期权报价矩阵
  updateOptionMatrix: function () {
    // 基于当前价格动态计算期权报价
    const { currentPrice } = this.data;
    const baseVolatility = 0.25; // 基础波动率
    
    // 这里应该调用期权定价模型来计算实际价格
    // 暂时使用模拟数据
    this.simulateMatrixUpdate();
  },

  // 模拟矩阵数据更新
  simulateMatrixUpdate: function () {
    const matrix = JSON.parse(JSON.stringify(this.data.optionMatrix));
    
    // 为每个非'--'的价格添加微小波动
    Object.keys(matrix).forEach(strikeType => {
      Object.keys(matrix[strikeType]).forEach(period => {
        const currentValue = matrix[strikeType][period];
        if (currentValue !== '--') {
          const numValue = parseFloat(currentValue.replace('%', ''));
          const fluctuation = (Math.random() - 0.5) * 0.1; // ±0.05%的波动
          const newValue = Math.max(0.01, numValue + fluctuation);
          matrix[strikeType][period] = newValue.toFixed(2) + '%';
        }
      });
    });
    
    this.setData({ optionMatrix: matrix });
  },

  // 切换标的资产
  switchUnderlying: function (e) {
    const underlying = e.currentTarget.dataset.underlying;
    this.setData({
      selectedUnderlying: underlying.code,
      currentPrice: underlying.price
    });
    
    this.updateOptionMatrix();
    
    wx.showToast({
      title: `已切换到${underlying.name}`,
      icon: 'success',
      duration: 1500
    });
  },

  // 点击期权单元格
  onCellTap: function (e) {
    const { strike, period } = e.currentTarget.dataset;
    const price = this.data.optionMatrix[strike] && this.data.optionMatrix[strike][period];
    
    if (price === '--') {
      wx.showToast({
        title: '该期限暂无报价',
        icon: 'none'
      });
      return;
    }
    
    // 设置选中状态
    this.setData({
      selectedCell: `${strike}-${period}`,
      quoteDetail: {
        underlying: this.data.selectedUnderlying,
        currentPrice: this.data.currentPrice,
        strikeType: strike,
        period: period,
        optionPrice: price,
        strikePrice: this.calculateStrikePrice(strike),
        impliedVolatility: this.calculateImpliedVolatility(strike, period),
        greeks: this.calculateGreeks(strike, period)
      },
      showQuoteDetail: true
    });
  },

  // 计算执行价
  calculateStrikePrice: function (strikeType) {
    const { currentPrice } = this.data;
    
    if (strikeType.includes('C')) {
      // 香草期权
      const percentage = parseInt(strikeType.replace('C', '')) / 100;
      return (currentPrice * percentage).toFixed(2);
    } else {
      // 其他结构
      const firstPart = parseInt(strikeType.substring(0, 2)) / 100;
      return (currentPrice * firstPart).toFixed(2);
    }
  },

  // 计算隐含波动率
  calculateImpliedVolatility: function (strike, period) {
    // 简化的隐含波动率计算
    const baseVol = 0.25;
    const adjustment = Math.random() * 0.1 - 0.05;
    return ((baseVol + adjustment) * 100).toFixed(2) + '%';
  },

  // 计算希腊字母
  calculateGreeks: function (strike, period) {
    // 简化的希腊字母计算
    return {
      delta: (Math.random() * 0.8 + 0.1).toFixed(3),
      gamma: (Math.random() * 0.05).toFixed(4),
      theta: -(Math.random() * 0.1 + 0.01).toFixed(4),
      vega: (Math.random() * 0.3 + 0.1).toFixed(3),
      rho: (Math.random() * 0.2).toFixed(4)
    };
  },

  // 关闭报价详情
  closeQuoteDetail: function () {
    this.setData({
      showQuoteDetail: false,
      selectedCell: null,
      quoteDetail: null
    });
  },

  // 询价
  inquirePrice: function () {
    const { quoteDetail } = this.data;
    
    if (!quoteDetail) return;
    
    wx.navigateTo({
      url: `/pages/inquiry/inquiry?underlying=${quoteDetail.underlying}&strike=${quoteDetail.strikeType}&period=${quoteDetail.period}`
    });
  },

  // 刷新报价
  refreshQuotes: function () {
    wx.showLoading({
      title: '刷新中...'
    });
    
    setTimeout(() => {
      this.loadMarketData();
      wx.hideLoading();
      wx.showToast({
        title: '报价已更新',
        icon: 'success'
      });
    }, 1500);
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.refreshQuotes();
    setTimeout(() => {
      wx.stopPullDownRefresh();
    }, 2000);
  },

  // 获取单元格样式类
  getCellClass: function (strike, period, price) {
    let classes = ['matrix-cell'];
    
    if (price === '--') {
      classes.push('disabled');
    } else {
      classes.push('active');
    }
    
    if (this.data.selectedCell === `${strike}-${period}`) {
      classes.push('selected');
    }
    
    return classes.join(' ');
  },

  // 获取期权类型描述
  getStrikeTypeDesc: function (strikeType) {
    const descriptions = {
      '100C': '平值看涨',
      '103C': '虚值看涨(103%)',
      '105C': '虚值看涨(105%)',
      '110C': '虚值看涨(110%)',
      '80C': '实值看涨(80%)',
      '90C': '实值看涨(90%)',
      '95C': '实值看涨(95%)',
      '8080': '折价看涨(80-80)',
      '9090': '折价看涨(90-90)',
      '9070': '折价看涨(90-70)'
    };
    return descriptions[strikeType] || strikeType;
  }
});