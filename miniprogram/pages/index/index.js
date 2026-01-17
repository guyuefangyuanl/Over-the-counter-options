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
    quickSearchResults: [], // 新增：快速搜索建议
    showAdvanced: false,
    searchMode: 'fuzzy',
    filters: { type: '', underlying: '', expiryFrom: '', expiryTo: '', strikeMin: '', strikeMax: '' },
    page: 1,
    pageSize: 20,
    totalResults: -1,
    isNavigating: false,

    // 轮播图配置
    swiperConfig: {
      indicatorDots: true,
      autoplay: true,
      interval: 3000,
      duration: 500,
      circular: true
    },
    swiperImgurls: [
      {
        id: 1,
        url: 'https://foruda.gitee.com/images/1753933592927170033/941a7b09_15547261.png',
        loaded: false,
        error: false
      },
      {
        id: 2,
        url: 'https://foruda.gitee.com/images/1753933678767460248/b6cdc705_15547261.png',
        loaded: false,
        error: false
      },
      {
        id: 3,
        url: 'https://foruda.gitee.com/images/1753933748782644798/7113f0b4_15547261.png',
        loaded: false,
        error: false
      }
    ],
    // bannerList removed as replaced by swiperImgurls
    
    // 市场指数
    marketIndices: [],

    // 热门期权
    hotOptions: [],

    // 快捷功能
    quickActions: [
      { 
        id: 1, 
        icon: '/images/star.png', 
        name: '自选', 
        path: '/pages/quotes/quotes',
        color: 'transparent'
      },
      { 
        id: 2, 
        icon: '/images/个股.svg', 
        name: '个股', 
        path: '/pages/quotes/quotes',
        color: 'transparent'
      },
      { 
        id: 3, 
        icon: '/images/指数.svg', 
        name: '指数', 
        path: '/pages/quotes/quotes',
        color: 'transparent'
      },
      { 
        id: 4, 
        icon: '/images/ETF基金.svg', 
        name: 'ETF', 
        path: '/pages/quotes/quotes',
        color: 'transparent'
      },
      { 
        id: 5, 
        icon: '/images/计算器.svg', 
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
          link: '/pages/data-explanation/data-explanation?id=1'
        },
        {
          id: 2,
          title: '香草期权基础入门',
          date: '24-12-12 09:30',
          type: 'vanilla',
          link: '/pages/data-explanation/data-explanation?id=2'
        },
        {
          id: 3,
          title: '持仓管理与风险控制',
          date: '24-12-20 16:20',
          type: 'knowledge',
          link: '/pages/data-explanation/data-explanation?id=3'
        }
      ]
    },

    // 加载状态
    loading: true,
    refreshing: false
  },

  safeNavigate(url) {
    if (this.data.isNavigating) return;
    
    // 提取路径和参数
    const path = url.split('?')[0];
    const queryStr = url.split('?')[1] || '';
    
    // 判断是否是 tabBar 页面
    const tabBarPages = [
      '/pages/index/index',
      '/pages/quotes/quotes',
      '/pages/account/account',
      '/pages/profile/profile'
    ];
    
    const isTabBar = tabBarPages.some(p => path.endsWith(p));

    if (isTabBar) {
      // 如果有参数，存入全局变量
      if (queryStr) {
        const params = {};
        queryStr.split('&').forEach(pair => {
          const [key, value] = pair.split('=');
          if (key) params[key] = decodeURIComponent(value || '');
        });
        app.globalData.pendingQuoteParams = params;
      }
      
      wx.switchTab({
        url: path,
        success: () => { this.setData({ isNavigating: false, selectedResultCode: null }); }
      });
      return;
    }

    this.setData({ isNavigating: true });
    wx.navigateTo({
      url,
      complete: () => { this.setData({ isNavigating: false, selectedResultCode: null }); }
    });
  },

  onLoad() {
    performanceMonitor.markStart('pageLoad');
    this.loadUserInfo();
    this.loadSearchHistory();
    this.initPageData();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 0
      })
    }
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
    const value = e.detail.value;
    this.setData({
      searchValue: value
    });

    if (value) {
      this.debounceFetchSuggestions(value);
    } else {
      this.setData({
        quickSearchResults: []
      });
    }
  },

  // 新增：防抖函数获取建议
  debounceFetchSuggestions: (function() {
    let timer;
    return function(keyword) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        this.fetchSuggestions(keyword);
      }, 300); // 300ms 防抖
    }
  })(),

  // 新增：模拟获取建议
  async fetchSuggestions(keyword) {
    try {
      const suggestions = await optionsService.getSuggestions({ keyword, limit: 8 });
      this.setData({ quickSearchResults: suggestions });
    } catch (error) {
      console.error('获取建议失败:', error);
      this.setData({
        quickSearchResults: []
      });
    }
  },

  // 新增：点击建议项
  onSuggestionTap(e) {
    const { keyword } = e.currentTarget.dataset;
    uiEnhancer.hapticFeedback('light');
    this.setData({
      searchValue: keyword,
      quickSearchResults: [] // 清空建议
    }, () => {
      this.onSearch();
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
      const { searchMode, filters, pageSize } = this.data;
      const query = {
        keyword: searchValue,
        mode: searchMode,
        type: filters.type || undefined,
        underlying: filters.underlying || undefined,
        expiryFrom: filters.expiryFrom || undefined,
        expiryTo: filters.expiryTo || undefined,
        strikeMin: filters.strikeMin !== '' ? Number(filters.strikeMin) : undefined,
        strikeMax: filters.strikeMax !== '' ? Number(filters.strikeMax) : undefined,
        page: 1,
        pageSize,
        sortBy: 'relevance'
      };
      const { items, total, page } = await optionsService.searchOptions(query);
      const mapped = items.map(it => ({
        ...it,
        changeRate: dataFormatter.formatPercent(it.change),
        displayText: `${it.underlyingName} ${it.expiry} ${it.type==='call' ? '看涨' : '看跌'} ${it.strike}`
      }));
      this.setData({
        searchResults: mapped,
        totalResults: total,
        page,
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

  async loadMore() {
    const { searchValue, searchMode, filters, page, pageSize, searchResults } = this.data;
    const nextPage = page + 1;
    try {
      const query = {
        keyword: searchValue,
        mode: searchMode,
        type: filters.type || undefined,
        underlying: filters.underlying || undefined,
        expiryFrom: filters.expiryFrom || undefined,
        expiryTo: filters.expiryTo || undefined,
        strikeMin: filters.strikeMin !== '' ? Number(filters.strikeMin) : undefined,
        strikeMax: filters.strikeMax !== '' ? Number(filters.strikeMax) : undefined,
        page: nextPage,
        pageSize,
        sortBy: 'relevance'
      };
      const { items, total } = await optionsService.searchOptions(query);
      const mapped = items.map(it => ({
        ...it,
        changeRate: dataFormatter.formatPercent(it.change),
        displayText: `${it.underlyingName} ${it.expiry} ${it.type==='call' ? '看涨' : '看跌'} ${it.strike}`
      }));
      this.setData({ searchResults: searchResults.concat(mapped), totalResults: total, page: nextPage });
    } catch (e) {
      console.error('加载更多失败', e);
    }
  },

  toggleAdvanced() { this.setData({ showAdvanced: !this.data.showAdvanced }); },
  onModeChange(e) { const v = e.detail.value; this.setData({ searchMode: v }); },
  onTypeChange(e) { const v = e.detail.value; this.setData({ 'filters.type': v }); },
  onUnderlyingInput(e) { this.setData({ 'filters.underlying': e.detail.value }); },
  onExpiryFromInput(e) { this.setData({ 'filters.expiryFrom': e.detail.value }); },
  onExpiryToInput(e) { this.setData({ 'filters.expiryTo': e.detail.value }); },
  onStrikeMinInput(e) { this.setData({ 'filters.strikeMin': e.detail.value }); },
  onStrikeMaxInput(e) { this.setData({ 'filters.strikeMax': e.detail.value }); },

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
    const item = this.data.swiperImgurls[index];
    if (item && item.link) this.safeNavigate(item.link);
  },

  onBannerImageLoad(e) {
    const { index } = e.currentTarget.dataset;
    const key = `swiperImgurls[${index}].loaded`;
    this.setData({ [key]: true });
  },

  onBannerImageError(e) {
    const { index } = e.currentTarget.dataset;
    const key = `swiperImgurls[${index}].error`;
    this.setData({ [key]: true });
    console.error(`Banner image ${index} failed to load`);
  },

  // 快捷功能点击
  onQuickActionTap(e) {
    const { path } = e.currentTarget.dataset;
    if (!path) return;
    this.safeNavigate(path);
  },

  // 市场指数点击
  onIndexTap(e) {
    const { code } = e.currentTarget.dataset;
    this.safeNavigate(`/pages/quotes/quotes?code=${code}`);
  },

  // 期权卡片点击
  onOptionTap(e) {
    const { code } = e.currentTarget.dataset;
    this.setData({ selectedResultCode: code });
    this.safeNavigate(`/pages/quotes/quotes?code=${code}`);
  },

  // 查看更多
  onViewMore(e) {
    const { type } = e.currentTarget.dataset;
    let url = '';
    switch(type) {
      case 'options':
        url = '/pages/quotes/quotes';
        break;
      case 'indices':
        url = '/pages/quotes/quotes';
        break;
      default:
        return;
    }
    this.safeNavigate(url);
  }
});
