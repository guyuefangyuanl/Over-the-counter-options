// pages/workspace/workspace.js
Page({
  data: {
    userInfo: {
      name: '投资者',
      accountId: 'W0008888',
      isVip: true
    },
    marketData: {
      mainIndex: {
        name: '上证50ETF',
        code: '510050',
        price: 2.445,
        change: -0.016,
        changePercent: -0.65,
        volume: '15.2亿'
      },
      indexList: [
        { name: '上证指数', price: 3420.35, change: +12.48, changePercent: +0.37 },
        { name: '深证成指', price: 10856.24, change: -45.67, changePercent: -0.42 },
        { name: '创业板指', price: 2198.76, change: +8.93, changePercent: +0.41 },
        { name: '中证1000', price: 6420.35, change: -28.12, changePercent: -0.44 }
      ]
    },
    portfolioSummary: {
      totalAssets: 5000000, // 总资产（元）
      availableFunds: 3500000, // 可用资金（元）
      totalPositions: 1500000, // 持仓市值（元）
      todayPnL: -37999.31, // 今日盈亏（元）
      totalPnL: -125678.89, // 累计盈亏（元）
      totalPnLPercent: -2.51 // 累计盈亏率
    },
    positionOverview: {
      activePositions: 5, // 存续持仓数
      nearExpiry: 2, // 近期到期数
      totalScale: 500, // 总规模（万）
      riskLevel: 'medium' // 风险等级: low, medium, high
    },
    recentTransactions: [
      {
        id: 1,
        type: '买入开仓',
        product: '香草看涨',
        underlying: '中证1000',
        scale: 100,
        price: 6420.35,
        time: '2024-12-30 09:30:00',
        status: '已成交'
      },
      {
        id: 2,
        type: '卖出平仓',
        product: '香草看跌',
        underlying: '上证50ETF',
        scale: 50,
        price: 2.445,
        time: '2024-12-29 14:25:00',
        status: '已成交'
      }
    ],
    quickActions: [
      { id: 1, name: '期权报价', icon: '/images/quote.png', path: '/pages/index/index' },
      { id: 2, name: '期权计算器', icon: '/images/calculator.png', path: '/pages/calculator/calculator' },
      { id: 3, name: '询价中心', icon: '/images/inquiry.png', path: '/pages/inquiry/inquiry' },
      { id: 4, name: '持仓管理', icon: '/images/position.png', path: '/pages/account/account' },
      { id: 5, name: '市场分析', icon: '/images/analysis.png', path: '/pages/analysis/analysis' },
      { id: 6, name: '资讯中心', icon: '/images/news.png', path: '/pages/news/news' },
    ],
    showRefreshAnimation: false
  },

  onLoad: function (options) {
    this.initWorkspace();
    this.loadUserInfo();
    this.loadMarketData();
    this.loadPortfolioData();
  },

  onShow: function () {
    // 每次显示页面时刷新数据
    this.refreshWorkspaceData();
    
    // 确保 tabBar 正确显示
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 1
      });
    }
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.refreshAllData();
    setTimeout(() => {
      wx.stopPullDownRefresh();
    }, 2000);
  },

  // 初始化工作台
  initWorkspace: function () {
    // 设置导航栏标题
    wx.setNavigationBarTitle({
      title: '工作台'
    });
  },

  // 加载用户信息
  loadUserInfo: function () {
    const userInfo = wx.getStorageSync('userInfo') || {};
    this.setData({
      'userInfo.name': userInfo.nickname || '投资者',
      'userInfo.accountId': userInfo.accountId || 'W0008888',
      'userInfo.isVip': userInfo.vipLevel && userInfo.vipLevel !== 'V0'
    });
  },

  // 加载市场数据
  loadMarketData: function () {
    // 模拟实时市场数据
    const marketData = {
      mainIndex: {
        name: '上证50ETF',
        code: '510050',
        price: 2.445 + (Math.random() - 0.5) * 0.02,
        change: (Math.random() - 0.5) * 0.05,
      },
      indexList: [
        { 
          name: '上证指数', 
          price: 3420.35 + (Math.random() - 0.5) * 20,
          change: (Math.random() - 0.5) * 30
        },
        { 
          name: '深证成指', 
          price: 10856.24 + (Math.random() - 0.5) * 100,
          change: (Math.random() - 0.5) * 80
        },
        { 
          name: '创业板指', 
          price: 2198.76 + (Math.random() - 0.5) * 30,
          change: (Math.random() - 0.5) * 20
        },
        { 
          name: '中证1000', 
          price: 6420.35 + (Math.random() - 0.5) * 50,
          change: (Math.random() - 0.5) * 40
        }
      ]
    };

    // 计算涨跌幅
    marketData.mainIndex.changePercent = (marketData.mainIndex.change / marketData.mainIndex.price) * 100;
    marketData.indexList.forEach(item => {
      item.changePercent = (item.change / item.price) * 100;
    });

    this.setData({ marketData });
  },

  // 加载投资组合数据
  loadPortfolioData: function () {
    // 模拟获取投资组合数据
    const portfolioSummary = {
      totalAssets: 5000000,
      availableFunds: 3500000,
      totalPositions: 1500000,
      todayPnL: (Math.random() - 0.5) * 100000,
      totalPnL: (Math.random() - 0.5) * 200000,
    };
    
    portfolioSummary.totalPnLPercent = (portfolioSummary.totalPnL / portfolioSummary.totalAssets) * 100;

    this.setData({ portfolioSummary });
  },

  // 刷新工作台数据
  refreshWorkspaceData: function () {
    this.setData({ showRefreshAnimation: true });
    
    this.loadMarketData();
    this.loadPortfolioData();
    
    setTimeout(() => {
      this.setData({ showRefreshAnimation: false });
    }, 1500);
  },

  // 刷新所有数据
  refreshAllData: function () {
    wx.showLoading({ title: '刷新中...' });
    
    Promise.all([
      this.loadUserInfo(),
      this.loadMarketData(),
      this.loadPortfolioData()
    ]).then(() => {
      wx.hideLoading();
      wx.showToast({
        title: '刷新完成',
        icon: 'success',
        duration: 1500
      });
    });
  },

  // 快捷操作
  onQuickAction: function (e) {
    const action = e.currentTarget.dataset.action;
    if (action && action.path) {
      const tabPages = [
        '/pages/index/index',
        '/pages/workspace/workspace',
        '/pages/inquiry/inquiry',
        '/pages/account/account',
        '/pages/profile/profile'
      ];
      if (tabPages.includes(action.path)) {
        wx.switchTab({ url: action.path });
      } else {
        wx.navigateTo({ url: action.path });
      }
    } else {
      wx.showToast({
        title: '功能开发中',
        icon: 'none'
      });
    }
  },

  // 查看详细持仓
  viewPositionDetail: function () {
    wx.switchTab({
      url: '/pages/account/account'
    });
  },

  // 查看市场详情
  viewMarketDetail: function () {
    wx.navigateTo({
      url: '/pages/market/market'
    });
  },

  // 查看交易记录
  viewTransactionHistory: function () {
    wx.navigateTo({
      url: '/pages/transaction/transaction'
    });
  },

  // 风险管理
  riskManagement: function () {
    wx.navigateTo({
      url: '/pages/risk/risk'
    });
  },

  // 资产分析
  assetAnalysis: function () {
    wx.navigateTo({
      url: '/pages/analysis/analysis'
    });
  },

  // 格式化数字
  formatNumber: function (num) {
    if (Math.abs(num) >= 100000000) {
      return (num / 100000000).toFixed(2) + '亿';
    } else if (Math.abs(num) >= 10000) {
      return (num / 10000).toFixed(2) + '万';
    }
    return num.toFixed(2);
  },

  // 格式化百分比
  formatPercent: function (num) {
    return (num > 0 ? '+' : '') + num.toFixed(2) + '%';
  },

  // 获取风险等级颜色
  getRiskLevelColor: function (level) {
    const colors = {
      low: '#03B615',
      medium: '#FF8C00', 
      high: '#FF4444'
    };
    return colors[level] || '#666';
  },

  // 获取风险等级文本
  getRiskLevelText: function (level) {
    const texts = {
      low: '低风险',
      medium: '中风险',
      high: '高风险'
    };
    return texts[level] || '未知';
  }
});