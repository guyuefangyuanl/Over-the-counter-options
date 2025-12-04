// pages/account/account.js
Page({
  data: {
    selectedAccount: '场外期权账户（W0008888）',
    accountOptions: [
      { id: 'W0008888', name: '场外期权账户（W0008888）', type: 'real' },
      { id: 'M0008888', name: '模拟账户 (M0008888)', type: 'demo' }
    ],
    showAccountDropdown: false,
    currentTab: 0, // 0:存续持仓, 1:近期到期, 2:已到期, 3:已完结
    tabList: [
      { name: '存续持仓', count: 1 },
      { name: '近期到期', count: 0 },
      { name: '已到期', count: 0 },
      { name: '已完结', count: 0 }
    ],
    accountSummary: {
      totalScale: 100, // 存续规模（万）
      totalProfit: -379993.13, // 存续净收益（元）
      completedProfit: 0, // 完结净收益（元）
      totalInvestment: 50000 // 投入成本（万）
    },
    positionList: [
      {
        id: 1,
        type: '香草',
        scale: 100,
        underlyingAsset: '中证1000',
        currentPrice: 6420.35,
        strikePrice: 6500,
        profitLoss: -37999.31,
        profitRate: -7.6,
        status: '开仓',
        createTime: '2024-12-30',
        expireTime: '2025-01-30',
        isNearExpiry: false
      }
    ],
    showCostDetail: false
  },

  onLoad: function (options) {
    this.loadAccountData();
  },

  onShow: function () {
    // 刷新数据
    this.refreshData();
  },

  // 加载账户数据
  loadAccountData: function () {
    // 模拟从后端获取账户数据
    this.setData({
      accountSummary: {
        totalScale: 100,
        totalProfit: -379993.13,
        completedProfit: 0,
        totalInvestment: 50000
      }
    });
  },

  // 刷新数据
  refreshData: function () {
    wx.showLoading({
      title: '刷新中...'
    });
    
    setTimeout(() => {
      this.loadAccountData();
      this.loadPositionList();
      wx.hideLoading();
      wx.showToast({
        title: '刷新成功',
        icon: 'success',
        duration: 1500
      });
    }, 1000);
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.refreshData();
    setTimeout(() => {
      wx.stopPullDownRefresh();
    }, 1500);
  },

  // 切换账户下拉框
  toggleAccountDropdown: function () {
    this.setData({
      showAccountDropdown: !this.data.showAccountDropdown
    });
  },

  // 选择账户
  selectAccount: function (e) {
    const account = e.currentTarget.dataset.account;
    this.setData({
      selectedAccount: account.name,
      showAccountDropdown: false
    });
    
    // 重新加载该账户的数据
    this.loadAccountData();
    this.loadPositionList();
    
    wx.showToast({
      title: `已切换到${account.type === 'real' ? '真实' : '模拟'}账户`,
      icon: 'success'
    });
  },

  // 切换持仓标签
  switchTab: function (e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      currentTab: index
    });
    this.loadPositionList();
  },

  // 加载持仓列表
  loadPositionList: function () {
    const { currentTab } = this.data;
    let positionList = [];
    
    // 根据当前标签加载不同的持仓数据
    switch(currentTab) {
      case 0: // 存续持仓
        positionList = [
          {
            id: 1,
            type: '香草',
            scale: 100,
            underlyingAsset: '中证1000',
            currentPrice: 6420.35,
            strikePrice: 6500,
            profitLoss: -37999.31,
            profitRate: -7.6,
            status: '开仓',
            createTime: '2024-12-30',
            expireTime: '2025-01-30',
            isNearExpiry: false,
            distanceToStrike: -1.23, // 距执行价百分比
            breakEvenPoint: 6750.5,
            distanceToBreakEven: -4.89 // 距盈亏平衡点百分比
          }
        ];
        break;
      case 1: // 近期到期
        positionList = [];
        break;
      case 2: // 已到期
        positionList = [];
        break;
      case 3: // 已完结
        positionList = [];
        break;
    }
    
    this.setData({
      positionList: positionList
    });
  },

  // 录入持仓
  addPosition: function () {
    wx.showModal({
      title: '录入持仓',
      content: '此功能需要后端支持，暂未开放',
      showCancel: false
    });
  },

  // 查看持仓详情
  viewPositionDetail: function (e) {
    const position = e.currentTarget.dataset.position;
    wx.navigateTo({
      url: `/pages/position-detail/position-detail?id=${position.id}`
    });
  },

  // 切换投入成本详情
  toggleCostDetail: function () {
    this.setData({
      showCostDetail: !this.data.showCostDetail
    });
  },

  // 查看数据说明
  viewDataExplanation: function () {
    wx.navigateTo({
      url: '/pages/data-explanation/data-explanation'
    });
  },

  // 格式化数字
  formatNumber: function (num) {
    if (Math.abs(num) >= 10000) {
      return (num / 10000).toFixed(2) + '万';
    }
    return num.toFixed(2);
  },

  // 格式化百分比
  formatPercent: function (num) {
    return (num > 0 ? '+' : '') + num.toFixed(2) + '%';
  }
});