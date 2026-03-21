const app = getApp();
const optionsService = require('../../services/options.js');
const holdingsService = require('../../services/holdings.js');
const { uiEnhancer, dataFormatter, performanceMonitor } = require('../../utils/enhancedUtils');

// 首页持仓案例 tab 与账户页 tab 的映射关系
// 首页：active / expiring / finished
// 账户：continuing / expiring / closed
const INDEX_TAB_MAP = {
  active: 'continuing',
  expiring: 'expiring',
  finished: 'closed'
};

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
    // Banner 轮播图
    // 注意：当前使用 Gitee 外链，建议后续迁移到微信云存储以提高稳定性
    swiperImgurls: [
      {
        id: 1,
        url: 'https://foruda.gitee.com/images/1753933592927170033/941a7b09_15547261.png',
        title: '场外期权专业服务',
        loaded: false,
        error: false
      },
      {
        id: 2,
        url: 'https://foruda.gitee.com/images/1753933678767460248/b6cdc705_15547261.png',
        title: '一键询价，高效便捷',
        loaded: false,
        error: false
      },
      {
        id: 3,
        url: 'https://foruda.gitee.com/images/1753933748782644798/7113f0b4_15547261.png',
        title: '实时行情，精准分析',
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
        params: { tab: '自选' },
        color: 'transparent'
      },
      { 
        id: 2, 
        icon: '/images/个股.svg', 
        name: '个股', 
        path: '/pages/quotes/quotes',
        params: { tab: '个股' },
        color: 'transparent'
      },
      { 
        id: 3, 
        icon: '/images/指数.svg', 
        name: '指数', 
        path: '/pages/quotes/quotes',
        params: { tab: '指数' },
        color: 'transparent'
      },
      { 
        id: 4, 
        icon: '/images/询价.svg', 
        name: '询价', 
        path: '/pages/inquiry/inquiry',
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

    // 持仓案例动画开关
    holdingsAnimate: false,

    // 持仓案例数据（真实数据加载后覆盖）
    holdingsData: {
      // 首页 tab：active=存续中 / expiring=临近到期 / finished=已完结
      activeTab: 'active',
      // 所有持仓（来自 accountService，格式与 account.js 一致）
      allPositions: [],
      // 当前 tab 过滤后的持仓（供 wxml 渲染）
      filteredPositions: [],
      // 知识推荐
      knowledge: holdingsService.getKnowledgeList()
    },
    // 持仓数据加载错误标记
    holdingsError: false,
    // 是否为 Mock 示例数据（未登录 / API 失败时为 true）
    holdingsIsMock: false,

    // 加载状态
    loading: true,
    refreshing: false
  },

  safeNavigate(url) {
    console.log('safeNavigate调用, url:', url, 'isNavigating:', this.data.isNavigating);
    if (this.data.isNavigating) {
      console.log('导航被阻止，isNavigating为true');
      return;
    }
    
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
    console.log('path:', path, 'isTabBar:', isTabBar, 'queryStr:', queryStr);

    if (isTabBar) {
      // 如果有参数，存入全局变量
      if (queryStr) {
        const params = {};
        queryStr.split('&').forEach(pair => {
          const [key, value] = pair.split('=');
          if (key) params[key] = decodeURIComponent(value || '');
        });
        console.log('存入全局参数:', params);
        app.globalData.pendingQuoteParams = params;
      }
      
      wx.switchTab({
        url: path,
        success: () => { 
          console.log('switchTab成功');
          this.setData({ isNavigating: false, selectedResultCode: null }); 
        },
        fail: (err) => {
          console.error('switchTab失败:', err);
        }
      });
      return;
    }

    this.setData({ isNavigating: true });
    wx.navigateTo({
      url,
      success: () => { console.log('navigateTo成功'); },
      fail: (err) => { console.error('navigateTo失败:', err); },
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
      this.getTabBar().setData({ selected: 0 });
    }
    // 每次页面显示时刷新持仓案例（含从账户页返回的情形）
    this.loadHoldingsData();
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
          // changeRate 可能已是格式化字符串('+0.37%')或数值，统一处理
          changeRate: index.changeRate || dataFormatter.formatPercent(index.changePercent),
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
      console.log('loadHotOptions获取到的原始数据:', options);
      const mappedOptions = options.map(option => ({
        ...option,
        formattedPrice: dataFormatter.formatNumber(option.price || option.lastPrice, 4),
        changeRate: option.changeRate || dataFormatter.formatPercent(option.change),
        volume: option.volume ? dataFormatter.formatVolume(option.volume) : '--'
      }));
      console.log('loadHotOptions映射后的数据:', mappedOptions);
      this.setData({ hotOptions: mappedOptions });
    } catch (error) {
      console.error('加载热门期权失败:', error);
      throw error;
    }
  },

  // 加载持仓案例数据（从 accountService 获取真实数据，未登录/失败时降级到 Mock）
  async loadHoldingsData() {
    try {
      this.setData({ holdingsError: false });
      const { positions, knowledge, isReal } = await holdingsService.getIndexHoldingsData();
      this.setData({
        'holdingsData.allPositions': positions,
        'holdingsData.knowledge': knowledge,
        // isReal=false 时展示「示例数据」角标，引导用户登录查看真实持仓
        holdingsIsMock: !isReal
      });
      this._filterIndexPositions();
    } catch (e) {
      // getIndexHoldingsData 内部已完全吞掉异常，此处只是保险
      console.error('[index] 加载持仓数据异常:', e);
      this.setData({ holdingsError: false, holdingsIsMock: true });
      // 确保 Mock 数据已被初始化
      this._filterIndexPositions();
    }
  },

  // 根据首页 activeTab 过滤持仓列表
  _filterIndexPositions() {
    const { activeTab, allPositions = [] } = this.data.holdingsData;
    let filtered = [];
    if (activeTab === 'active') {
      // 存续中：CONTINUING 且 daysLeft > 7
      filtered = allPositions.filter(p => p.indexStatus === 'active');
    } else if (activeTab === 'expiring') {
      // 临近到期：CONTINUING 且 daysLeft <= 7
      filtered = allPositions.filter(p => p.indexStatus === 'expiring');
    } else if (activeTab === 'finished') {
      // 已完结：CLOSED
      filtered = allPositions.filter(p => p.indexStatus === 'finished');
    }
    this.setData({ 'holdingsData.filteredPositions': filtered });
  },

  // 持仓案例 Tab 切换（与 account 页分类逻辑对齐）
  onHoldingTabChange(e) {
    try {
      const tab = e.currentTarget.dataset.tab;
      if (!tab) return;
      if (typeof uiEnhancer.hapticFeedback === 'function') uiEnhancer.hapticFeedback('light');
      this.setData({
        'holdingsData.activeTab': tab,
        holdingsAnimate: true
      });
      // 重新过滤当前 tab 的数据
      this._filterIndexPositions();
      setTimeout(() => {
        this.setData({ holdingsAnimate: false });
      }, 300);
    } catch (err) {
      console.error('切换Tab失败:', err);
    }
  },

  // 持仓案例点击 —— 跳转到账户页并定位到对应 tab
  onHoldingItemTap(e) {
    try {
      const { id, indexstatus } = e.currentTarget.dataset;
      if (typeof uiEnhancer.hapticFeedback === 'function') uiEnhancer.hapticFeedback('light');

      // 首页 indexStatus → 账户页 tab 映射
      const accountTab = INDEX_TAB_MAP[indexstatus] || 'continuing';

      // 将目标持仓 id 和 tab 存入全局，账户页 onShow 时读取高亮
      app.globalData.pendingPositionFocus = { positionId: id, tab: accountTab };

      // 账户是 tabBar 页面，使用 switchTab 跳转
      wx.switchTab({
        url: '/pages/account/account',
        fail: () => {
          uiEnhancer.showToast('跳转失败', 'error');
        }
      });
    } catch (err) {
      console.error('打开持仓失败:', err);
      uiEnhancer.showToast('跳转失败', 'error');
    }
  },

  // 新增：知识文章点击 - 跳转到知识详情页面
  onKnowledgeItemTap(e) {
    try {
      const { id } = e.currentTarget.dataset;
      console.log('[知识] 点击文章ID:', id);
      if (typeof uiEnhancer.hapticFeedback === 'function') uiEnhancer.hapticFeedback('light');
      // 跳转到知识详情页面，显示已编写好的知识内容
      wx.navigateTo({ url: `/pages/knowledge-detail/knowledge-detail?id=${id}` });
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
    const { path, params } = e.currentTarget.dataset;
    if (!path) return;
    // 如果有 params（如 tab 参数），拼接为 query string 或存入 globalData
    if (params) {
      const queryStr = Object.keys(params).map(k => k + '=' + encodeURIComponent(params[k])).join('&');
      this.safeNavigate(path + '?' + queryStr);
    } else {
      this.safeNavigate(path);
    }
  },

  // 市场指数点击
  onIndexTap(e) {
    const { code } = e.currentTarget.dataset;
    this.safeNavigate(`/pages/quotes/quotes?code=${code}`);
  },

  // 期权卡片点击 - 跳转到股票详情页面
  onOptionTap(e) {
    const { code, name, market, structure } = e.currentTarget.dataset;
    console.log('onOptionTap点击热门产品:', { code, name, market, structure });
    this.setData({ selectedResultCode: code, isNavigating: false });

    // 对参数进行URL编码，确保中文等特殊字符正确传递
    const encodedCode = encodeURIComponent(code || '');
    const encodedName = encodeURIComponent(name || '');

    // 跳转到股票详情页面（参考search.js的跳转逻辑）
    const url = `/pages/stock-detail/stock-detail?code=${encodedCode}&name=${encodedName}`;
    console.log('[热门产品] 跳转到股票详情页:', url);

    wx.navigateTo({
      url: url,
      success: () => {
        console.log('[热门产品] 跳转成功');
      },
      fail: (err) => {
        console.error('[热门产品] 跳转失败:', err);
        // 如果跳转失败，降级到报价页面
        wx.switchTab({
          url: '/pages/quotes/quotes',
          success: () => {
            // 将参数存入全局变量供报价页面使用
            app.globalData.pendingQuoteParams = {
              code: code,
              name: name,
              market: market,
              structure: structure,
              source: 'hotOption'
            };
          }
        });
      }
    });
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
        url = '/pages/quotes/quotes?tab=指数';
        break;
      case 'holdings':
        url = '/pages/account/account';
        break;
      case 'knowledge':
        url = '/pages/data-explanation/data-explanation';
        break;
      default:
        return;
    }
    this.safeNavigate(url);
  }
});
