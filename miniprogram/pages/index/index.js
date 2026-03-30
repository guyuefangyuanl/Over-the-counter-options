/**
 * 首页
 * 重构版本：使用 behaviors 拆分逻辑，集成数据缓存和请求节流
 */
const app = getApp();
const optionsService = require('../../services/options.js');
const holdingsService = require('../../services/holdings.js');
const { uiEnhancer, dataFormatter, performanceMonitor } = require('../../utils/enhancedUtils');
const { DataCacheManager, CACHE_PREFIX, DEFAULT_TTL } = require('../../utils/data-cache.js');
const { getKnowledgeArticles, getArticleById } = require('../../utils/knowledgeConfig.js');

// 引入 behaviors
const searchBehavior = require('../../behaviors/search-behavior.js');
const holdingsBehavior = require('../../behaviors/holdings-behavior.js');

// 首页持仓案例 tab 与账户页 tab 的映射关系
const INDEX_TAB_MAP = {
  active: 'continuing',
  expiring: 'expiring',
  finished: 'closed'
};

// TabBar 页面配置
const TAB_BAR_PAGES = [
  '/pages/index/index',
  '/pages/quotes/quotes',
  '/pages/account/account',
  '/pages/profile/profile'
];

// 页面刷新间隔配置
const REFRESH_CONFIG = {
  MIN_INTERVAL: 30 * 1000 // 最小刷新间隔 30秒
};

Page({
  // 混入 behaviors
  behaviors: [searchBehavior, holdingsBehavior],

  data: {
    // 用户数据
    userInfo: null,
    hasUserInfo: false,
    canIUseGetUserProfile: wx.canIUse('getUserProfile'),

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

    // 市场指数
    marketIndices: [],

    // 热门期权
    hotOptions: [],

    // 快捷功能
    quickActions: [
      { id: 1, icon: '/images/star.png', name: '自选', path: '/pages/quotes/quotes', params: { tab: '自选' } },
      { id: 2, icon: '/images/个股.svg', name: '个股', path: '/pages/quotes/quotes', params: { tab: '个股' } },
      { id: 3, icon: '/images/指数.svg', name: '指数', path: '/pages/quotes/quotes', params: { tab: '指数' } },
      { id: 4, icon: '/images/询价.svg', name: '询价', path: '/pages/quotes/quotes', params: { tab: '个股', action: 'inquiry' } },
      { id: 5, icon: '/images/计算器.svg', name: '计算器', path: '/pages/calculator/calculator' }
    ],

    // 加载状态
    loading: true,
    refreshing: false,
    isNavigating: false,

    // 知识文章
    knowledgeArticles: [],
    knowledgeLoading: true,

    // 上次刷新时间（用于节流）
    _lastRefreshTime: 0
  },

  // ==================== 生命周期 ====================

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

    // 节流刷新持仓数据
    this._throttledRefreshHoldings();

    // 已登录时刷新其他数据
    if (this.data.hasUserInfo) {
      this._throttledRefreshData();
    }
  },

  onPullDownRefresh() {
    this.refreshData(true).then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // ==================== 数据初始化 ====================

  /**
   * 初始化页面数据（并行加载）
   */
  async initPageData() {
    try {
      await Promise.all([
        this.loadMarketIndices(),
        this.loadHotOptions(),
        this.loadHoldingsData(),
        this.loadKnowledgeArticles()
      ]);
      performanceMonitor.markEnd('pageLoad');
    } catch (error) {
      console.error('初始化数据失败:', error);
      uiEnhancer.showToast('加载失败，请重试', 'error');
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 刷新数据（带缓存和节流）
   */
  async refreshData(forceRefresh = false) {
    const now = Date.now();
    const lastRefresh = this.data._lastRefreshTime || 0;

    // 节流检查
    if (!forceRefresh && now - lastRefresh < REFRESH_CONFIG.MIN_INTERVAL) {
      console.log('[刷新] 节流拦截');
      return;
    }

    this.setData({ refreshing: true, _lastRefreshTime: now });

    try {
      await Promise.all([
        this.loadMarketIndices(forceRefresh),
        this.loadHotOptions(forceRefresh)
      ]);
      uiEnhancer.showToast('刷新成功', 'success');
    } catch (error) {
      console.error('刷新失败:', error);
      uiEnhancer.showToast('刷新失败', 'error');
    } finally {
      this.setData({ refreshing: false });
    }
  },

  // ==================== 市场数据加载 ====================

  /**
   * 加载市场指数（带缓存）
   */
  async loadMarketIndices(forceRefresh = false) {
    try {
      const { data, fromCache } = await DataCacheManager.fetchWithCache(
        CACHE_PREFIX.MARKET_INDICES,
        () => optionsService.getMarketIndices(),
        { ttl: DEFAULT_TTL.MARKET_INDICES, forceRefresh }
      );

      const indices = data.map(index => ({
        ...index,
        changeRate: index.changeRate || dataFormatter.formatPercent(index.changePercent),
        formattedPrice: dataFormatter.formatNumber(index.price, 2)
      }));

      this.setData({ marketIndices: indices });
      console.log(`[市场指数] ${fromCache ? '缓存' : '网络'}加载完成`);
    } catch (error) {
      console.error('加载市场指数失败:', error);
      throw error;
    }
  },

  /**
   * 加载热门期权（带缓存）
   */
  async loadHotOptions(forceRefresh = false) {
    try {
      const { data, fromCache } = await DataCacheManager.fetchWithCache(
        CACHE_PREFIX.HOT_OPTIONS,
        () => optionsService.getHotOptions(),
        { ttl: DEFAULT_TTL.HOT_OPTIONS, forceRefresh }
      );

      const mappedOptions = data.map(option => ({
        ...option,
        formattedPrice: dataFormatter.formatNumber(option.price || option.lastPrice, 4),
        changeRate: option.changeRate || dataFormatter.formatPercent(option.change),
        volume: option.volume ? dataFormatter.formatVolume(option.volume) : '--'
      }));

      this.setData({ hotOptions: mappedOptions });
      console.log(`[热门期权] ${fromCache ? '缓存' : '网络'}加载完成`);
    } catch (error) {
      console.error('加载热门期权失败:', error);
      throw error;
    }
  },

  /**
   * 加载知识文章（首页展示前3篇）
   */
  loadKnowledgeArticles() {
    return new Promise((resolve) => {
      this.setData({ knowledgeLoading: true });

      // 模拟网络延迟
      setTimeout(() => {
        try {
          const allArticles = getKnowledgeArticles();
          // 首页只显示前3篇
          const articles = allArticles.slice(0, 3).map(article => ({
            ...article,
            coverLoaded: false
          }));

          this.setData({
            knowledgeArticles: articles,
            knowledgeLoading: false
          });
          console.log('[知识文章] 加载完成，共', articles.length, '篇');
          resolve(articles);
        } catch (error) {
          console.error('加载知识文章失败:', error);
          this.setData({ knowledgeLoading: false });
          resolve([]);
        }
      }, 300);
    });
  },

  /**
   * 知识文章点击
   */
  onKnowledgeItemTap(e) {
    const { id } = e.currentTarget.dataset;
    uiEnhancer.hapticFeedback('light');

    // 跳转到知识详情页
    wx.navigateTo({
      url: `/subpackages/info/knowledge-detail/knowledge-detail?id=${id}`,
      fail: () => {
        // 降级处理：复制链接
        const article = getArticleById(id);
        if (article) {
          const { openArticleInBrowser } = require('../../utils/knowledgeConfig.js');
          openArticleInBrowser(article);
        }
      }
    });
  },

  // ==================== 用户相关 ====================

  /**
   * 加载用户信息
   */
  loadUserInfo() {
    const userInfo = app.globalData.userInfo;
    if (userInfo) {
      this.setData({ userInfo, hasUserInfo: true });
    }
  },

  /**
   * 获取用户信息
   */
  getUserProfile() {
    uiEnhancer.hapticFeedback('light');
    wx.getUserProfile({
      desc: '用于完善用户资料',
      success: (res) => {
        app.globalData.userInfo = res.userInfo;
        this.setData({ userInfo: res.userInfo, hasUserInfo: true });
        uiEnhancer.showToast('登录成功', 'success');
      },
      fail: (err) => {
        console.error('获取用户信息失败:', err);
        uiEnhancer.showToast('登录失败', 'error');
      }
    });
  },

  // ==================== 导航相关 ====================

  /**
   * 安全导航（防止重复点击）
   */
  safeNavigate(url) {
    if (this.data.isNavigating) return;

    const path = url.split('?')[0];
    const queryStr = url.split('?')[1] || '';
    const isTabBar = TAB_BAR_PAGES.some(p => path.endsWith(p));

    if (isTabBar) {
      // TabBar 页面参数存入全局
      if (queryStr) {
        const params = {};
        queryStr.split('&').forEach(pair => {
          const [key, value] = pair.split('=');
          if (key) params[key] = decodeURIComponent(value || '');
        });
        app.globalData.pendingQuoteParams = params;
      }
      wx.switchTab({ url: path });
      return;
    }

    this.setData({ isNavigating: true });
    wx.navigateTo({
      url,
      complete: () => this.setData({ isNavigating: false, selectedResultCode: null })
    });
  },

  // ==================== 事件处理 ====================

  /**
   * 轮播图点击
   */
  onBannerTap(e) {
    const { index } = e.currentTarget.dataset;
    const item = this.data.swiperImgurls[index];
    if (item && item.link) this.safeNavigate(item.link);
  },

  /**
   * 轮播图加载完成
   */
  onBannerImageLoad(e) {
    const { index } = e.currentTarget.dataset;
    this.setData({ [`swiperImgurls[${index}].loaded`]: true });
  },

  /**
   * 轮播图加载失败
   */
  onBannerImageError(e) {
    const { index } = e.currentTarget.dataset;
    this.setData({ [`swiperImgurls[${index}].error`]: true });
    console.error(`Banner image ${index} failed to load`);
  },

  /**
   * 快捷功能点击
   */
  onQuickActionTap(e) {
    const { path, params } = e.currentTarget.dataset;
    if (!path) return;

    if (params) {
      const queryStr = Object.keys(params).map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');
      this.safeNavigate(`${path}?${queryStr}`);
    } else {
      this.safeNavigate(path);
    }
  },

  /**
   * 市场指数点击
   */
  onIndexTap(e) {
    const { code } = e.currentTarget.dataset;
    this.safeNavigate(`/pages/quotes/quotes?code=${code}`);
  },

  /**
   * 期权卡片点击
   */
  onOptionTap(e) {
    const { code, name, market, structure } = e.currentTarget.dataset;
    this.setData({ selectedResultCode: code, isNavigating: false });

    const encodedCode = encodeURIComponent(code || '');
    const encodedName = encodeURIComponent(name || '');
    // 修正：使用分包正确路径
    const url = `/subpackages/quotes/stock-detail/stock-detail?code=${encodedCode}&name=${encodedName}`;

    wx.navigateTo({
      url,
      fail: () => {
        // 降级到报价页面
        wx.switchTab({
          url: '/pages/quotes/quotes',
          success: () => {
            app.globalData.pendingQuoteParams = { code, name, market, structure, source: 'hotOption' };
          }
        });
      }
    });
  },

  /**
   * 查看更多
   */
  onViewMore(e) {
    const { type } = e.currentTarget.dataset;
    const urlMap = {
      options: '/pages/quotes/quotes',
      indices: '/pages/quotes/quotes?tab=指数',
      holdings: '/pages/account/account',
      knowledge: '/pages/data-explanation/data-explanation'
    };
    const url = urlMap[type];
    if (url) this.safeNavigate(url);
  },

  // ==================== 内部方法 ====================

  /**
   * 节流刷新持仓数据
   */
  _throttledRefreshHoldings() {
    DataCacheManager.throttleExecute('refresh_holdings', () => {
      this.loadHoldingsData();
    }, REFRESH_CONFIG.MIN_INTERVAL);
  },

  /**
   * 节流刷新其他数据
   */
  _throttledRefreshData() {
    DataCacheManager.throttleExecute('refresh_data', () => {
      this.refreshData();
    }, REFRESH_CONFIG.MIN_INTERVAL);
  }
});