const app = getApp();
const optionsService = require('../../services/options.js');
const { uiEnhancer, dataFormatter, performanceMonitor } = require('../../utils/enhancedUtils');

Page({
  data: {
    // 用户数据
    userInfo: null,
    hasUserInfo: false,
    canIUseGetUserProfile: wx.canIUse('getUserProfile'),

    // 搜索相关
    searchValue: '',
    showSearchResults: false,
    searchResults: [],
    searchHistory: [],
    hotSearches: ['50ETF购', '300ETF沽', '沪深300', '上证50'],
    isSearching: false,

    // 轮播图配置
    swiperConfig: {
      indicatorDots: true,
      autoplay: true,
      interval: 3000,
      duration: 500,
      circular: true
    },
    bannerList: [
      {
        id: 1,
        image: '/images/首页/u258.png',
        title: '期权交易新手指南',
        desc: '从零开始学习期权交易',
        link: '/pages/tutorial/tutorial'
      },
      {
        id: 2,
        image: '/images/首页/u119.png',
        title: '市场行情实时更新',
        desc: '把握每一个投资机会',
        link: '/pages/quotes/quotes'
      },
      {
        id: 3,
        image: '/images/首页/u120.png',
        title: '智能计算器',
        desc: '精准计算期权价值',
        link: '/pages/calculator/calculator'
      },
      {
        id: 4,
        image: '/images/首页/u121.png',
        title: 'ETF期权专区',
        desc: '探索ETF期权投资策略',
        link: '/pages/etf/etf'
      }
    ],

    // 市场指数
    marketIndices: [],

    // 热门期权
    hotOptions: [],

    // 快捷功能
    quickActions: [
      { 
        id: 1, 
        icon: '/images/service.png', 
        name: '自选', 
        path: '/pages/quotes/quotes',
        color: 'transparent'
      },
      { 
        id: 2, 
        icon: '/images/quote.png', 
        name: '个股', 
        path: '/pages/learning/learning',
        color: 'transparent'
      },
      { 
        id: 3, 
        icon: '/images/analysis.png', 
        name: '指数', 
        path: '/pages/market/market',
        color: 'transparent'
      },
      { 
        id: 4, 
        icon: '/images/inquiry.png', 
        name: 'ETF', 
        path: '/pages/etf/etf',
        color: 'transparent'
      },
      { 
        id: 5, 
        icon: '/images/calculator.png', 
        name: '计算器', 
        path: '/pages/calculator/calculator',
        color: 'transparent'
      }
    ],

    // 新增：持仓案例动画开关
    holdingsAnimate: false,

    // 新增：持仓案例数据
    holdingsData: {
      activeTab: 'active', // active/expiring/expired
      holdings: [
        {
          id: 1,
          name: '平安银行',
          code: '000001',
          market: 'SZ',
          structure: '100C1m',
          feeRate: '5.28%',
          scale: '100万',
          profit: -4.91,
          profitRate: -98.28,
          status: 'active'
        },
        {
          id: 2,
          name: '上证50ETF',
          code: '510050',
          market: 'SH',
          structure: '50P3m',
          feeRate: '2.15%',
          scale: '200万',
          profit: 12.6,
          profitRate: 8.2,
          status: 'active'
        },
        {
          id: 3,
          name: '贵州茅台',
          code: '600519',
          market: 'SH',
          structure: '100C6m',
          feeRate: '4.85%',
          scale: '50万',
          profit: 34.2,
          profitRate: 12.7,
          status: 'active'
        },
        {
          id: 4,
          name: '招商银行',
          code: '600036',
          market: 'SH',
          structure: '100C1m',
          feeRate: '3.10%',
          scale: '80万',
          profit: -2.3,
          profitRate: -1.8,
          status: 'expiring'
        },
        {
          id: 5,
          name: '中国平安',
          code: '601318',
          market: 'SH',
          structure: '100P1m',
          feeRate: '2.90%',
          scale: '100万',
          profit: 1.2,
          profitRate: 0.9,
          status: 'expiring'
        },
        {
          id: 6,
          name: '宁德时代',
          code: '300750',
          market: 'SZ',
          structure: '50C3m',
          feeRate: '3.40%',
          scale: '60万',
          profit: 6.8,
          profitRate: 5.3,
          status: 'expired'
        },
        {
          id: 7,
          name: '隆基绿能',
          code: '601012',
          market: 'SH',
          structure: '50P6m',
          feeRate: '2.75%',
          scale: '120万',
          profit: -3.6,
          profitRate: -2.4,
          status: 'expired'
        }
      ],
      knowledge: [
        {
          id: 1,
          title: '沪深场外个股期权',
          date: '24-12-08 14:58',
          type: 'option',
          link: '/pages/article/article?id=1'
        },
        {
          id: 2,
          title: '香草期权基础入门',
          date: '24-12-12 09:30',
          type: 'vanilla',
          link: '/pages/article/article?id=2'
        },
        {
          id: 3,
          title: '持仓管理与风险控制',
          date: '24-12-20 16:20',
          type: 'knowledge',
          link: '/pages/article/article?id=3'
        }
      ]
    },

    // 加载状态
    loading: true,
    refreshing: false
  },

  onLoad() {
    performanceMonitor.markStart('pageLoad');
    this.loadUserInfo();
    this.loadSearchHistory();
    this.initPageData();
  },

  onShow() {
    if (this.data.hasUserInfo) {
      this.refreshData();
    }
  },

  onPullDownRefresh() {
    this.refreshData().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 初始化页面数据
  async initPageData() {
    try {
      await Promise.all([
        this.loadMarketIndices(),
        this.loadHotOptions(),
        this.loadHoldingsData()
      ]);
      performanceMonitor.markEnd('pageLoad');
    } catch (error) {
      console.error('初始化数据失败:', error);
      uiEnhancer.showToast('加载失败，请重试', 'error');
    } finally {
      this.setData({ loading: false });
    }
  },

  // 刷新数据
  async refreshData() {
    this.setData({ refreshing: true });
    try {
      await Promise.all([
        this.loadMarketIndices(),
        this.loadHotOptions()
      ]);
      uiEnhancer.showToast('刷新成功', 'success');
    } catch (error) {
      console.error('刷新失败:', error);
      uiEnhancer.showToast('刷新失败', 'error');
    } finally {
      this.setData({ refreshing: false });
    }
  },

  // 加载用户信息
  loadUserInfo() {
    const userInfo = app.globalData.userInfo;
    if (userInfo) {
      this.setData({
        userInfo,
        hasUserInfo: true
      });
    }
  },

  // 获取用户信息
  getUserProfile() {
    uiEnhancer.hapticFeedback('light');
    wx.getUserProfile({
      desc: '用于完善用户资料',
      success: (res) => {
        app.globalData.userInfo = res.userInfo;
        this.setData({
          userInfo: res.userInfo,
          hasUserInfo: true
        });
        uiEnhancer.showToast('登录成功', 'success');
      },
      fail: (err) => {
        console.error('获取用户信息失败:', err);
        uiEnhancer.showToast('登录失败', 'error');
      }
    });
  },

  // 加载市场指数
  async loadMarketIndices() {
    try {
      const indices = await optionsService.getMarketIndices();
      this.setData({
        marketIndices: indices.map(index => ({
          ...index,
          changeRate: dataFormatter.formatPercent(index.changeRate),
          formattedPrice: dataFormatter.formatNumber(index.price, 2)
        }))
      });
    } catch (error) {
      console.error('加载市场指数失败:', error);
      throw error;
    }
  },

  // 加载热门期权
  async loadHotOptions() {
    try {
      const options = await optionsService.getHotOptions();
      this.setData({
        hotOptions: options.map(option => ({
          ...option,
          formattedPrice: dataFormatter.formatNumber(option.price, 4),
          changeRate: dataFormatter.formatPercent(option.changeRate),
          volume: dataFormatter.formatVolume(option.volume)
        }))
      });
    } catch (error) {
      console.error('加载热门期权失败:', error);
      throw error;
    }
  },

  // 新增：加载持仓数据（可接后端数据源）
  async loadHoldingsData() {
    try {
      const { holdingsData } = this.data;
      this.setData({ holdingsData });
    } catch (e) {
      console.error('加载持仓数据失败:', e);
      uiEnhancer.showToast('持仓数据加载失败', 'error');
    }
  },

  // 新增：Tab 切换
  onHoldingTabChange(e) {
    try {
      const tab = e.currentTarget.dataset.tab;
      if (!tab) return;
      if (typeof uiEnhancer.hapticFeedback === 'function') uiEnhancer.hapticFeedback('light');
      this.setData({
        'holdingsData.activeTab': tab,
        holdingsAnimate: true
      });
      setTimeout(() => {
        this.setData({ holdingsAnimate: false });
      }, 300);
    } catch (err) {
      console.error('切换Tab失败:', err);
    }
  },

  // 新增：持仓项点击
  onHoldingItemTap(e) {
    try {
      const { id } = e.currentTarget.dataset;
      if (typeof uiEnhancer.hapticFeedback === 'function') uiEnhancer.hapticFeedback('light');
      wx.navigateTo({ url: `/pages/position/position?id=${id}` });
    } catch (err) {
      console.error('打开持仓失败:', err);
      uiEnhancer.showToast('页面开发中', 'none');
    }
  },

  // 新增：知识文章点击
  onKnowledgeItemTap(e) {
    try {
      const { id } = e.currentTarget.dataset;
      if (typeof uiEnhancer.hapticFeedback === 'function') uiEnhancer.hapticFeedback('light');
      wx.navigateTo({ url: `/pages/data-explanation/data-explanation?from=home&id=${id}` });
    } catch (err) {
      console.error('打开文章失败:', err);
      uiEnhancer.showToast('页面开发中', 'none');
    }
  },

  // 搜索相关方法
  onSearchInput(e) {
    this.setData({
      searchValue: e.detail.value
    });
  },

  onSearchFocus() {
    this.setData({
      showSearchResults: true
    });
  },

  async onSearch() {
    const { searchValue } = this.data;
    if (!searchValue.trim()) {
      uiEnhancer.showToast('请输入搜索内容', 'none');
      return;
    }

    uiEnhancer.hapticFeedback('light');
    this.setData({ isSearching: true });

    try {
      const results = await optionsService.searchOptions(searchValue);
      this.setData({
        searchResults: results,
        showSearchResults: true
      });
      this.saveSearchHistory(searchValue);
    } catch (error) {
      console.error('搜索失败:', error);
      uiEnhancer.showToast('搜索失败，请重试', 'error');
    } finally {
      this.setData({ isSearching: false });
    }
  },

  onSearchCancel() {
    uiEnhancer.hapticFeedback('light');
    this.setData({
      showSearchResults: false,
      searchValue: '',
      searchResults: []
    });
  },

  onHotSearchTap(e) {
    const { keyword } = e.currentTarget.dataset;
    uiEnhancer.hapticFeedback('light');
    this.setData({
      searchValue: keyword
    }, () => {
      this.onSearch();
    });
  },

  onHistoryItemTap(e) {
    const { keyword } = e.currentTarget.dataset;
    uiEnhancer.hapticFeedback('light');
    this.setData({
      searchValue: keyword
    }, () => {
      this.onSearch();
    });
  },

  clearSearchHistory() {
    uiEnhancer.hapticFeedback('medium');
    wx.showModal({
      title: '提示',
      content: '确定要清空搜索历史吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({ searchHistory: [] });
          wx.removeStorageSync('searchHistory');
          uiEnhancer.showToast('已清空', 'success');
        }
      }
    });
  },

  loadSearchHistory() {
    try {
      const history = wx.getStorageSync('searchHistory') || [];
      this.setData({ searchHistory: history });
    } catch (error) {
      console.error('加载搜索历史失败:', error);
    }
  },

  saveSearchHistory(keyword) {
    try {
      let history = this.data.searchHistory;
      history = history.filter(item => item !== keyword);
      history.unshift(keyword);
      history = history.slice(0, 10);
      
      this.setData({ searchHistory: history });
      wx.setStorageSync('searchHistory', history);
    } catch (error) {
      console.error('保存搜索历史失败:', error);
    }
  },

  // 轮播图点击事件
  onBannerTap(e) {
    const { index } = e.currentTarget.dataset;
    const banner = this.data.bannerList[index];
    
    if (typeof uiEnhancer.hapticFeedback === 'function') {
      uiEnhancer.hapticFeedback('light');
    }
    
    if (banner.link) {
      wx.navigateTo({
        url: banner.link,
        fail: () => {
          uiEnhancer.showToast('页面开发中', 'none');
        }
      });
    }
  },

  // 快捷功能点击
  onQuickActionTap(e) {
    const { path } = e.currentTarget.dataset;
    uiEnhancer.hapticFeedback('light');
    
    wx.navigateTo({
      url: path,
      fail: () => {
        uiEnhancer.showToast('页面开发中', 'none');
      }
    });
  },

  // 市场指数点击
  onIndexTap(e) {
    const { code } = e.currentTarget.dataset;
    uiEnhancer.hapticFeedback('light');
    
    wx.navigateTo({
      url: `/pages/indexDetail/indexDetail?code=${code}`,
      fail: () => {
        uiEnhancer.showToast('页面开发中', 'none');
      }
    });
  },

  // 期权卡片点击
  onOptionTap(e) {
    const { code } = e.currentTarget.dataset;
    uiEnhancer.hapticFeedback('light');
    
    wx.navigateTo({
      url: `/pages/optionDetail/optionDetail?code=${code}`,
      fail: () => {
        uiEnhancer.showToast('页面开发中', 'none');
      }
    });
  },

  // 查看更多
  onViewMore(e) {
    const { type } = e.currentTarget.dataset;
    uiEnhancer.hapticFeedback('light');
    
    let url = '';
    switch(type) {
      case 'options':
        url = '/pages/quotes/quotes';
        break;
      case 'indices':
        url = '/pages/market/market';
        break;
      default:
        return;
    }
    
    wx.navigateTo({
      url,
      fail: () => {
        uiEnhancer.showToast('页面开发中', 'none');
      }
    });
  }
});
