// pages/position/position.js
const { RiskMonitor, TransactionManager } = require('../../utils/enhanced-features.js');
const api = require('../../utils/request');

Page({
  data: {
    currentTab: 0, // 0:存续持仓, 1:近期到期, 2:已到期, 3:已完结
    currentPositions: [], // 当前显示的持仓列表
    tabList: [
      { name: '存续持仓', count: 0, key: 'active' },
      { name: '近期到期', count: 0, key: 'nearExpiry' },
      { name: '已到期', count: 0, key: 'expired' },
      { name: '已完结', count: 0, key: 'completed' }
    ],
    positionData: {
      active: [],
      nearExpiry: [],
      expired: [],
      completed: []
    },
    selectedPosition: null,
    showPositionDetail: false,
    sortBy: 'createTime', // 排序方式: createTime, profitLoss, scale, expireTime
    sortOrder: 'desc', // asc, desc
    filterRisk: 'ALL', // ALL, LOW, MEDIUM, HIGH
    searchKeyword: '',
    riskMonitor: null,
    transactionManager: null,
    isLoading: false
  },

  onLoad: function (options) {
    this.initPage();
    this.initManagers();
    // Check login first? api.get will handle 401 but better check
  },

  onShow: function () {
    this.loadPositionData();
  },

  // ... (initPage, initManagers unchanged)

  // 加载持仓数据
  loadPositionData: function () {
    this.setData({ isLoading: true });
    
    // Call API
    api.get('/trade/positions', { pageSize: 100 }) // Get all for now or implement pagination
      .then(res => {
          const items = res.items || [];
          this.processPositionData(items);
      })
      .catch(err => {
          console.error("Fetch positions error:", err);
          wx.showToast({ title: '获取持仓失败', icon: 'none' });
      })
      .finally(() => {
          this.setData({ isLoading: false });
          wx.stopPullDownRefresh();
      });
  },

  processPositionData: function(items) {
      // Categorize items
      const now = new Date();
      const active = [];
      const nearExpiry = [];
      const expired = [];
      const completed = [];

      items.forEach(item => {
          // Adapt backend model to frontend model
          // Backend: productCode, productName, quantity, price, marketValue, profitLoss, status, createdAt
          // Frontend needs: id, type, underlying, scale...
          
          // Basic mapping
          const pos = {
              id: item._id,
              type: '香草看涨', // Default or from backend
              underlying: item.productName || item.productCode,
              scale: item.quantity / 10000, // Assuming quantity is units, scale is Wan
              openScale: item.quantity / 10000,
              currentPrice: item.price, // This should be real-time, but for now use stored
              strikePrice: item.price * 0.9, // Mock if missing
              openPrice: item.price,
              strikeType: '100%',
              profitLoss: item.profitLoss,
              profitRate: (item.profitLoss / (item.quantity * item.price)) * 100,
              status: item.status === 'active' ? '开仓' : '完结',
              createTime: item.createdAt,
              expireTime: '2025-12-31', // Mock
              remainingDays: 30, // Mock
              optionFee: 0,
              breakEvenPoint: 0,
              distanceToStrike: 0,
              distanceToBreakEven: 0,
              riskLevel: 'LOW' // Recalculate later
          };
          
          if (pos.status === '开仓') {
              active.push(pos);
          } else {
              completed.push(pos);
          }
      });
      
      const positionData = {
          active, nearExpiry, expired, completed
      };
      
      // Update counts
      const tabList = this.data.tabList.map(tab => ({
          ...tab,
          count: positionData[tab.key].length
      }));
      
      this.setData({ positionData, tabList });
      this.updateCurrentPositions();
      this.calculateRiskLevels();
  },

    selectedPosition: null,
    showPositionDetail: false,
    sortBy: 'createTime', // 排序方式: createTime, profitLoss, scale, expireTime
    sortOrder: 'desc', // asc, desc
    filterRisk: 'ALL', // ALL, LOW, MEDIUM, HIGH
    searchKeyword: '',
    riskMonitor: null,
    transactionManager: null
  },

  onLoad: function (options) {
    this.initPage();
    this.initManagers();
    this.loadPositionData();
  },

  onShow: function () {
    this.refreshPositionData();
  },

  // 初始化页面
  initPage: function () {
    wx.setNavigationBarTitle({
      title: '持仓管理'
    });
  },

  // 初始化管理器
  initManagers: function () {
    this.setData({
      riskMonitor: new RiskMonitor(),
      transactionManager: new TransactionManager()
    });
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.loadPositionData();
  },

  // 更新当前显示的持仓列表
  updateCurrentPositions: function () {
    const { currentTab, tabList, positionData } = this.data;
    const currentKey = tabList[currentTab].key;
    const positions = positionData[currentKey] || [];
    
    this.setData({
      currentPositions: positions
    });
  },

  // 刷新持仓数据
  refreshPositionData: function () {
    wx.showLoading({
      title: '刷新中...'
    });

    // 模拟实时价格更新
    this.updateRealTimePrices();
    
    setTimeout(() => {
      this.loadPositionData();
      wx.hideLoading();
      wx.showToast({
        title: '刷新完成',
        icon: 'success'
      });
    }, 1500);
  },

  // 更新实时价格
  updateRealTimePrices: function () {
    const positionData = { ...this.data.positionData };
    
    Object.keys(positionData).forEach(category => {
      positionData[category].forEach(position => {
        // 模拟价格波动 ±2%
        const fluctuation = (Math.random() - 0.5) * 0.04;
        position.currentPrice = position.currentPrice * (1 + fluctuation);
        
        // 重新计算盈亏
        this.recalculatePosition(position);
      });
    });

    this.setData({ positionData });
  },

  // 重新计算持仓盈亏
  recalculatePosition: function (position) {
    const { currentPrice, strikePrice, openPrice, scale, optionFee } = position;
    
    // 简化的盈亏计算
    const intrinsicValue = Math.max(0, (currentPrice - strikePrice) / openPrice);
    const totalValue = intrinsicValue * scale * 10000; // 转换为元
    const totalCost = scale * 10000 * (optionFee / 100);
    
    position.profitLoss = totalValue - totalCost;
    position.profitRate = (position.profitLoss / totalCost) * 100;
    
    // 更新距离指标
    position.distanceToStrike = ((currentPrice - strikePrice) / currentPrice) * 100;
    position.distanceToBreakEven = ((currentPrice - position.breakEvenPoint) / currentPrice) * 100;
  },

  // 计算风险等级
  calculateRiskLevels: function () {
    const { riskMonitor } = this.data;
    if (!riskMonitor) return;

    Object.keys(this.data.positionData).forEach(category => {
      this.data.positionData[category].forEach(position => {
        // 基于多个因素评估风险
        const riskFactors = {
          timeToExpiry: position.remainingDays,
          profitLoss: position.profitLoss,
          leverage: position.scale / 50, // 简化的杠杆计算
          moneyness: Math.abs(position.distanceToStrike)
        };

        // 简化的风险评估
        let riskScore = 0;
        if (riskFactors.timeToExpiry < 7) riskScore += 2;
        if (riskFactors.profitLoss < -10000) riskScore += 2;
        if (riskFactors.leverage > 2) riskScore += 1;
        if (riskFactors.moneyness > 10) riskScore += 1;

        if (riskScore >= 4) {
          position.riskLevel = 'HIGH';
        } else if (riskScore >= 2) {
          position.riskLevel = 'MEDIUM';
        } else {
          position.riskLevel = 'LOW';
        }
      });
    });
  },

  // 切换标签
  switchTab: function (e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      currentTab: index
    });
    this.updateCurrentPositions();
  },

  // 查看持仓详情
  viewPositionDetail: function (e) {
    const position = e.currentTarget.dataset.position;
    this.setData({
      selectedPosition: position,
      showPositionDetail: true
    });
  },

  // 关闭持仓详情
  closePositionDetail: function () {
    this.setData({
      showPositionDetail: false,
      selectedPosition: null
    });
  },

  // 排序持仓
  sortPositions: function (e) {
    const sortBy = e.currentTarget.dataset.sortBy;
    let sortOrder = this.data.sortOrder;
    
    if (this.data.sortBy === sortBy) {
      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      sortOrder = 'desc';
    }

    this.setData({
      sortBy: sortBy,
      sortOrder: sortOrder
    });

    this.applySortAndFilter();
  },

  // 风险筛选
  filterByRisk: function (e) {
    const riskLevel = e.currentTarget.dataset.risk;
    this.setData({
      filterRisk: riskLevel
    });
    this.applySortAndFilter();
  },

  // 搜索持仓
  searchPositions: function (e) {
    const keyword = e.detail.value;
    this.setData({
      searchKeyword: keyword
    });
    this.applySortAndFilter();
  },

  // 应用排序和筛选
  applySortAndFilter: function () {
    const { currentTab, tabList, positionData, sortBy, sortOrder, filterRisk, searchKeyword } = this.data;
    const currentKey = tabList[currentTab].key;
    let positions = [...positionData[currentKey]];

    // 搜索筛选
    if (searchKeyword) {
      positions = positions.filter(p => 
        p.underlying.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        p.type.toLowerCase().includes(searchKeyword.toLowerCase())
      );
    }

    // 风险筛选
    if (filterRisk !== 'ALL') {
      positions = positions.filter(p => p.riskLevel === filterRisk);
    }

    // 排序
    positions.sort((a, b) => {
      let valueA = a[sortBy];
      let valueB = b[sortBy];

      if (sortBy === 'createTime' || sortBy === 'expireTime') {
        valueA = new Date(valueA);
        valueB = new Date(valueB);
      }

      if (sortOrder === 'asc') {
        return valueA > valueB ? 1 : -1;
      } else {
        return valueA < valueB ? 1 : -1;
      }
    });

    // 更新显示数据
    this.setData({
      currentPositions: positions
    });
  },

  // 平仓操作
  closePosition: function () {
    const { selectedPosition } = this.data;
    if (!selectedPosition) return;

    wx.showModal({
      title: '确认平仓',
      content: `确定要平仓${selectedPosition.type}(${selectedPosition.underlying})持仓吗？`,
      success: (res) => {
        if (res.confirm) {
          this.executeClosePosition(selectedPosition);
        }
      }
    });
  },

  // 执行平仓
  executeClosePosition: function (position) {
    wx.showLoading({
      title: '平仓中...'
    });

    // 模拟平仓操作
    setTimeout(() => {
      // 记录交易
      const { transactionManager } = this.data;
      if (transactionManager) {
        transactionManager.recordTransaction({
          type: '平仓',
          positionId: position.id,
          underlying: position.underlying,
          amount: position.scale * 10000,
          pnl: position.profitLoss,
          price: position.currentPrice
        });
      }

      // 移动到已完结
      this.movePositionToCompleted(position);
      
      wx.hideLoading();
      wx.showToast({
        title: '平仓成功',
        icon: 'success'
      });

      this.closePositionDetail();
    }, 2000);
  },

  // 移动持仓到已完结
  movePositionToCompleted: function (position) {
    const positionData = { ...this.data.positionData };
    const currentKey = this.data.tabList[this.data.currentTab].key;
    
    // 从当前分类移除
    positionData[currentKey] = positionData[currentKey].filter(p => p.id !== position.id);
    
    // 添加到已完结，更新状态
    position.status = '完结';
    position.statusClass = 'closed';
    position.closeTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
    positionData.completed.push(position);

    this.setData({ positionData });
    this.loadPositionData(); // 重新计算计数
  },

  // 风险预警
  checkRiskWarnings: function () {
    const { positionData, riskMonitor } = this.data;
    if (!riskMonitor) return;

    const allPositions = [
      ...positionData.active,
      ...positionData.nearExpiry
    ];

    const warnings = [];
    
    allPositions.forEach(position => {
      if (position.remainingDays <= 5) {
        warnings.push(`${position.underlying}持仓将在${position.remainingDays}天后到期`);
      }
      
      if (position.profitLoss < -position.scale * 1000) {
        warnings.push(`${position.underlying}持仓亏损较大，请关注风险`);
      }
    });

    if (warnings.length > 0) {
      wx.showModal({
        title: '风险提醒',
        content: warnings.join('\n'),
        showCancel: false
      });
    }
  },

  // 导出持仓报告
  exportReport: function () {
    wx.showToast({
      title: '报告生成中...',
      icon: 'loading',
      duration: 2000
    });

    setTimeout(() => {
      wx.showToast({
        title: '报告已生成',
        icon: 'success'
      });
    }, 2000);
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
  },

  // 获取风险颜色
  getRiskColor: function (level) {
    const colors = {
      LOW: '#52c41a',
      MEDIUM: '#faad14',
      HIGH: '#ff4d4f'
    };
    return colors[level] || '#666';
  },

  // 获取状态类名
  getStatusClass: function (status) {
    const statusMap = {
      '开仓': 'open',
      '部分完结': 'partial',
      '完结': 'closed'
    };
    return statusMap[status] || 'open';
  }
});