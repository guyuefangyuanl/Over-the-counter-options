// 首页
const uiEnhancer = require('../../utils/ui-enhancer.js');
const performanceOptimizer = require('../../utils/performance-optimizer.js');
const api = require('../../utils/api.js');

Page({
  data: {
    // 页面状态
    pageLoading: false,
    pageError: false,
    errorMessage: '',
    
    // 市场数据
    marketData: {
      overview: {
        totalVolume: '12.5亿',
        dailyChange: '+2.3%',
        activeOptions: 156,
        topGainers: 8
      },
      hotStocks: []
    },
    quickActions: [
      { id: 'quotes', name: '实时报价', icon: 'chart', path: '/pages/quotes/quotes', desc: '查看最新期权报价' },
      { id: 'calculator', name: '期权计算器', icon: 'calculator', path: '/pages/calculator/calculator', desc: '专业的期权定价工具' },
      { id: 'inquiry', name: '询价中心', icon: 'message', path: '/pages/inquiry/inquiry', desc: '发起询价和管理订单' },
      { id: 'profile', name: '我的', icon: 'folder', path: '/pages/profile/profile', desc: '个人中心和设置' }
    ],
    announcements: [
      { id: 1, title: '系统维护通知', time: '2025-01-15', type: 'system' },
      { id: 2, title: '新增期权品种公告', time: '2025-01-14', type: 'product' },
      { id: 3, title: '交易规则更新', time: '2025-01-13', type: 'rule' }
    ],
    // 市场指数数据
    marketIndices: [
      { name: '上证指数', value: '3156.42', change: '+1.23%', color: '#4caf50' },
      { name: '深证成指', value: '11247.89', change: '-0.45%', color: '#f44336' },
      { name: '创业板指', value: '2456.78', change: '+2.11%', color: '#4caf50' }
    ],
    // 通知数据
    notifications: {
      unreadCount: 0,
      latestNotification: null
    }
  },

  onLoad: function (options) {
    console.log('首页加载');
    this.initPage();
  },
  
  // 初始化页面
  async initPage() {
    try {
      await uiEnhancer.pageLoadWithAnimation(this, async () => {
        // 并行加载多个数据源
        await Promise.all([
          this.loadMarketData(),
          this.loadAnnouncements(),
          this.loadMarketIndices()
        ]);
      }, {
        loadingText: '正在加载首页数据...',
        errorText: '首页数据加载失败'
      });
      
      // 页面加载成功后的操作
      this.setupAutoRefresh();
      
    } catch (error) {
      console.error('首页初始化失败:', error);
    }
  },

  // 页面显示时的处理
  onShow: function () {
    // 页面显示时刷新数据
    this.refreshData(false);
  },
  
  // 页面隐藏时的处理
  onHide: function() {
    // 清理定时器
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  },
  
  // 页面卸载时的处理
  onUnload: function() {
    // 清理资源
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    
    // 清理UI增强器状态
    uiEnhancer.cleanup();
  },
  
  // 页面错误重试
  onRetry: function() {
    this.initPage();
  },

  // 加载市场数据（使用缓存优化）
  async loadMarketData() {
    try {
      // 使用性能优化器的数据预处理功能
      const hotStocks = await performanceOptimizer.preprocessData(
        'hot_stocks_data',
        this.processStockData,
        null,
        { ttl: 5 * 60 * 1000 } // 5分钟缓存
      );

      this.setData({
        'marketData.hotStocks': hotStocks
      });
      
    } catch (error) {
      console.error('加载市场数据失败:', error);
      throw error;
    }
  },
  
  // 处理股票数据
  processStockData() {
    // 模拟热门股票数据生成
    return [
      { code: '000001', name: '平安银行', price: '12.45', change: '+1.88%', volume: '2.1亿' },
      { code: '000002', name: '万科A', price: '8.92', change: '-0.67%', volume: '1.8亿' },
      { code: '000858', name: '五粮液', price: '128.67', change: '+2.34%', volume: '1.5亿' },
      { code: '600036', name: '招商银行', price: '42.18', change: '+1.12%', volume: '3.2亿' }
    ];
  },
  
  // 加载公告数据
  async loadAnnouncements() {
    try {
      // 模拟从服务器加载公告
      const announcements = await new Promise(resolve => {
        setTimeout(() => {
          resolve([
            { id: 1, title: '系统维护通知', time: '2025-01-15', type: 'system' },
            { id: 2, title: '新增期权品种公告', time: '2025-01-14', type: 'product' },
            { id: 3, title: '交易规则更新', time: '2025-01-13', type: 'rule' }
          ]);
        }, 500); // 模拟网络延迟
      });
      
      this.setData({ announcements });
      
    } catch (error) {
      console.error('加载公告失败:', error);
      throw error;
    }
  },
  
  // 加载市场指数
  async loadMarketIndices() {
    try {
      const marketIndices = [
        { name: '上证指数', value: '3156.42', change: '+1.23%', color: '#4caf50' },
        { name: '深证成指', value: '11247.89', change: '-0.45%', color: '#f44336' },
        { name: '创业板指', value: '2456.78', change: '+2.11%', color: '#4caf50' }
      ];
      
      this.setData({ marketIndices });
      
    } catch (error) {
      console.error('加载市场指数失败:', error);
      throw error;
    }
  },

  // 设置自动刷新
  setupAutoRefresh() {
    // 每30秒自动刷新数据
    this.refreshTimer = setInterval(() => {
      this.refreshData(false); // 静默刷新，不显示加载提示
    }, 30000);
  },
  // 刷新数据（增强版）
  async refreshData(showLoading = true) {
    try {
      if (showLoading) {
        uiEnhancer.showLoading('正在刷新...', 'refresh');
      }
      
      // 模拟数据更新
      const updates = {
        'marketData.overview.totalVolume': (Math.random() * 5 + 10).toFixed(1) + '亿',
        'marketData.overview.dailyChange': (Math.random() * 4 - 2).toFixed(1) + '%',
        'marketData.overview.activeOptions': Math.floor(Math.random() * 50 + 120),
        'marketData.overview.topGainers': Math.floor(Math.random() * 10 + 5)
      };

      this.setData(updates);
      
      if (showLoading) {
        uiEnhancer.hideLoading('refresh');
        uiEnhancer.showSuccess('刷新成功');
      }
      
    } catch (error) {
      console.error('刷新失败:', error);
      if (showLoading) {
        uiEnhancer.hideLoading('refresh');
        uiEnhancer.showError('刷新失败，请重试');
      }
    }
  },

  // 快捷操作点击（增强版）
  onQuickAction: function(e) {
    const action = e.currentTarget.dataset.action;
    const path = e.currentTarget.dataset.path;
    
    // 触感反馈
    uiEnhancer.hapticFeedback('light');
    
    if (path) {
      uiEnhancer.showLoading('正在跳转...', 'navigate');
      
      wx.navigateTo({
        url: path,
        success: () => {
          uiEnhancer.hideLoading('navigate');
        },
        fail: (error) => {
          uiEnhancer.hideLoading('navigate');
          uiEnhancer.showError('跳转失败，请重试');
        }
      });
    } else {
      uiEnhancer.showToast('功能开发中，敬请期待');
    }
  },

  // 查看股票详情（增强版）
  onStockTap: function(e) {
    const stock = e.currentTarget.dataset.stock;
    
    uiEnhancer.hapticFeedback('light');
    
    uiEnhancer.showLoading('正在加载股票详情...', 'stock-detail');
    
    wx.navigateTo({
      url: `/pages/quotes/quotes?stock=${encodeURIComponent(JSON.stringify(stock))}`,
      success: () => {
        uiEnhancer.hideLoading('stock-detail');
      },
      fail: (error) => {
        uiEnhancer.hideLoading('stock-detail');
        uiEnhancer.showError('跳转失败，请重试');
      }
    });
  },

  // 查看公告详情（增强版）
  async onAnnouncementTap(e) {
    const announcement = e.currentTarget.dataset.item;
    
    uiEnhancer.hapticFeedback('light');
    
    const confirmed = await uiEnhancer.showConfirm(
      announcement.title,
      '这是公告的详细内容，包含重要信息，请仔细阅读。\n\n类型：' + announcement.type + '\n时间：' + announcement.time,
      {
        confirmText: '知道了',
        showCancel: false
      }
    );
  },

  // 下拉刷新（增强版）
  async onPullDownRefresh() {
    await uiEnhancer.enhancedPullRefresh(this, async () => {
      await this.refreshData(false); // 不显示加载提示，因为下拉刷新已有视觉反馈
      await this.loadMarketData();
    });
  },

  // 分享页面
  onShareAppMessage: function() {
    return {
      title: '场外期权交易平台',
      path: '/pages/index/index'
    };
  }
});