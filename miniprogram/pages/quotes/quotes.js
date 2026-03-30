// 报价页面 - 核心功能页面（个股期权报价）
const OptionPricingSystem = require('../../utils/option-pricing.js');
const logic = require('../../utils/inquiry-logic.js');
const api = require('../../utils/api-group.js');
const { submitInquiry } = require('../../utils/inquiryService.js');
const { FAVORITES_STORAGE_KEY, CUSTOM_GROUPS_STORAGE_KEY } = require('../../utils/storage-keys.js');
const favoritesService = require('../../utils/favoritesService.js');
const { quotesDataManager, QUOTES_TTL, REALTIME_CONFIG, PAGE_CONFIG } = require('../../utils/quotes-data-manager.js');

// ==================== 交易商名称缩写映射 ====================
const TRADER_ABBREVIATION_MAP = {
  '中信证券': 'ZXZZ',
  '中信中证': 'ZXZZ',
  '中信': 'ZXZZ',
  '华泰财富': 'HTCC',
  '华泰长城': 'HTCC',
  '华泰': 'HTCC',
  '银河瑞德': 'YHRD',
  '银河德睿': 'YHRD',
  '银河': 'YHRD',
  '海通证券': 'HTZQ',
  '海通': 'HTZQ',
  '国金证券': 'GJZQ',
  '国金': 'GJZQ',
  '国泰君安': 'GTJA',
  '国君': 'GTJA',
  '招商证券': 'ZSZQ',
  '招商': 'ZSZQ',
  '中金': 'ZJZQ',
  '中金公司': 'ZJZQ',
  '申万宏源': 'SWHY',
  '申万': 'SWHY',
  '广发证券': 'GFZQ',
  '广发': 'GFZQ',
  '兴业证券': 'XYZQ',
  '兴业': 'XYZQ',
  '中信建投': 'ZXJS',
  '建投': 'ZXJS'
};

/**
 * 获取交易商名称缩写
 * @param {string} trader 交易商全名或代码
 * @returns {string} 交易商缩写
 */
function getTraderAbbreviation(trader) {
  if (!trader) return '-';
  // 已经是缩写格式（2-6个大写字母）
  if (/^[A-Z]{2,6}$/.test(trader)) return trader;
  // 查找映射表
  const abbr = TRADER_ABBREVIATION_MAP[trader];
  if (abbr) return abbr;
  // 未知交易商，取前4个字符
  return trader.length > 4 ? trader.slice(0, 4) : trader;
}

// ==================== 日期格式化工具函数 ====================

/**
 * 格式化最近日期显示（今天/昨天/MM-DD）
 * @param {Date|string} date 日期对象或日期字符串
 * @returns {string} 格式化后的日期字符串
 */
function formatDateShort(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '--';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const dateDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  if (dateDay.getTime() === today.getTime()) {
    return `今天 ${timeStr}`;
  } else if (dateDay.getTime() === yesterday.getTime()) {
    return `昨天 ${timeStr}`;
  } else {
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${month}-${day} ${timeStr}`;
  }
}

/**
 * 格式化完整日期时间（用于更新时间显示）
 * @param {Date|number} date 日期对象或时间戳
 * @returns {string} 格式化后的日期时间字符串
 */
function formatDateTime(date) {
  const d = typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '--';

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');

  return `${year}/${month}/${day} ${hours}:${minutes}更新`;
}

/**
 * 获取最近交易日日期对象
 * @returns {{latest: string, yesterday: string, latestLabel: string, yesterdayLabel: string}}
 */
function getRecentTradingDates() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // 简单处理：使用当前日期作为最新交易日
  // 实际应用中可能需要考虑周末和节假日
  const latest = today;
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

  const formatDate = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatLabel = (d) => {
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${month}/${day}`;
  };

  return {
    latest: formatDate(latest),
    yesterday: formatDate(yesterday),
    latestLabel: `最新${formatLabel(latest)}`,
    yesterdayLabel: `昨日${formatLabel(yesterday)}`
  };
}

// 节流控制：防止loadGroups频繁调用
let _lastLoadGroupsTime = 0;
const LOAD_GROUPS_THROTTLE_MS = 5000; // 5秒内不重复静默加载

// 页面刷新状态
let _isRefreshing = false;
let _lastRefreshTime = 0;
const REFRESH_THROTTLE_MS = 3000; // 3秒内不重复刷新

Page({
  data: {
    // 新增：匹配图片设计的 UI 状态数据
    statusBarHeight: 20, // 默认值，onLoad 会更新
    navBarHeight: 44,
    currentTab: '自选',
    subFilter: '全部',
    selectedTerm: '1M',
    // ==================== 修复：初始 watchlist 为空，由 loadWatchlist() 加载 ====================
    watchlist: [],
    hotStocks: [], // 热门10支个股
    updateTime: formatDateTime(new Date()), // 动态更新时间
    terms: ['1M', '2M', '3M', '6M'],
    traders: [
      { code: 'BEST', name: '最优报价' },
      { code: 'ZXZZ', name: 'ZXZZ' },
      { code: 'HTCC', name: 'HTCC' },
      { code: 'YHRD', name: 'YHRD' },
      { code: 'YAZB', name: 'YAZB' }
    ],
    selectedTrader: '最优报价',
    selectedTraderCode: 'BEST',

    // 指数页面数据
    indexUpdate: formatDateTime(new Date()), // 动态更新时间
    topIndices: [
      { name: '中证500', price: '5818.55', changePercent: -1.67 },
      { name: '中证1000', price: '6096.38', changePercent: -2.80 },
      { name: '沪深300', price: '3933.57', changePercent: 0.15 }
    ],
    indexQuotes: [
      { name: '中证500', code: '000905.SH', changePercent: 2.47, atm: 11.83, otm105: 9.77, otm110: 8.01 },
      { name: '中证1000', code: '000852.SH', changePercent: 0.50, atm: 16.20, otm105: 14.21, otm110: 12.44 },
      { name: '沪深300', code: '000300.SH', changePercent: -0.35, atm: 6.53, otm105: 4.46, otm110: 2.94 },
      { name: '上证50', code: '000016.SH', changePercent: -1.26, atm: 7.92, otm105: 5.83, otm110: 4.21 },
      { name: '创业板', code: '399006.SZ', changePercent: -2.26, atm: 12.16, otm105: 10.16, otm110: 8.16 }
    ],

    // ETF 页面数据
    etfUpdate: formatDateTime(new Date()), // 动态更新时间
    etfQuotes: [
      { name: '芯片ETF', code: '159995.SZ', changePercent: 2.47, atm: 11.83, otm105: 9.77, otm110: 8.01 },
      { name: '5GETF', code: '515050.SH', changePercent: 0.50, atm: 16.20, otm105: 14.21, otm110: 12.44 },
      { name: '新能源车ETF', code: '515030.SH', changePercent: -0.35, atm: 6.53, otm105: 4.46, otm110: 2.94 },
      { name: '消费ETF', code: '159928.SZ', changePercent: -1.26, atm: 7.92, otm105: 5.83, otm110: 4.21 },
      { name: '医药ETF', code: '512010.SH', changePercent: -2.26, atm: 12.16, otm105: 12.16, otm110: 8.16 }
    ],

    // 当前股票信息
    currentStock: {
      code: '000001',
      name: '平安银行',
      market: 'SZ',
      price: 11.36,
      change: 0.61,
      changePercent: 5.68,
      displayText: '11.36  +0.61%'
    },

    // 收藏状态
    isFavorited: false,

    // 当前询价项目
    currentQuote: null,

    // 报价日期选择（动态生成）
    quoteDates: (() => {
      const dates = getRecentTradingDates();
      return [
        { id: 'latest', label: dates.latestLabel, value: dates.latest, isActive: true },
        { id: 'yesterday', label: dates.yesterdayLabel, value: dates.yesterday, isActive: false }
      ];
    })(),
    selectedQuoteDate: (() => {
      const dates = getRecentTradingDates();
      return dates.latestLabel;
    })(),

    // 交易商选择（使用缩写）
    traders: [
      { code: 'ALL', name: '全部交易商', isActive: true },
      { code: 'ZXZZ', name: 'ZXZZ', isActive: false },
      { code: 'HTCC', name: 'HTCC', isActive: false },
      { code: 'YHRD', name: 'YHRD', isActive: false },
      { code: 'HTZQ', name: 'HTZQ', isActive: false },
      { code: 'GJZQ', name: 'GJZQ', isActive: false }
    ],
    selectedTrader: '全部交易商',
    selectedTraderCode: 'ALL',
    
    // 期权报价数据
    optionQuotes: [],
    
    // 页面状态
    loading: false,
    showSearch: false,
    showDatePicker: false,
    showTraderPicker: false,
    searchKeyword: '',
    
    // 编辑自选状态
    isEditing: false,
    selectedForEdit: [],
    showStockDetail: false,
    sortField: 'changePercent',
    sortOrder: 'desc',
    
    // === 新增：搜索和空状态 ===
    watchlistSearchKeyword: '',       // 自选搜索关键词
    originalWatchlist: [],            // 原始自选列表（用于搜索筛选）
    filteredWatchlist: [],            // 筛选后的自选列表
    // ==================== 修复：初始值改为 true，确保空状态能显示 ====================
    showEmptyState: true,            // 是否显示空状态引导（初始为 true，由 loadWatchlist 根据数据更新）

    // === 新增：矩阵视图数据 ===
    bizType: 'vanilla',
    matrixColumns: ['2W', '1M', '2M', '3M', '6M', '12M'],
    matrixData: [],
    matrixScrollLeft: 0,
    
    // 筛选条件
    filterOptions: {
      optionType: 'ALL', // ALL, CALL, PUT
      timeToExpiry: 'ALL', // ALL, 1M, 3M, 6M, 1Y
      moneyness: 'ALL' // ALL, ITM, ATM, OTM
    },
    showOrderModal: false,
    showDataModal: false,
    modalAnimationClass: '',
    orderForm: {
      direction: '买入',
      traderCode: '',
      traderName: '',
      underlying: '',
      structure: '',
      premiumPercent: '',
      notional: 100,
      buyPrice: ''
    },
    
    // === 分组功能状态 ===
    systemGroups: [
      { id: 'all', name: '全部' },
      { id: 'holding', name: '我的持仓' }
    ],
    customGroups: [],
    showGroupManagePopup: false,
    showNewGroupDialog: false,
    newGroupName: '',
    newGroupError: '',
    canConfirmNewGroup: false,
    showRenameGroupDialog: false,
    editingGroupId: '',
    editingGroupName: '',
    renameGroupError: '',
    canConfirmRenameGroup: false,
    groupCountsById: {},
    activeGroupId: 'all', // 当前激活的分组ID
    topGroups: [],
    topGroupAnimationClass: '',
    loadingGroups: false,
    pendingGroupSwitchId: '',
    showDeleteGroupDialog: false,
    deleteGroupId: '',
    deleteGroupName: '',
    deleteRemoveFavorites: false,
    
    // === 新增：下拉刷新和分页状态 ===
    isPullRefreshing: false,          // 下拉刷新状态
    hasMoreHotStocks: true,           // 热门个股是否有更多
    hasMoreIndexQuotes: true,         // 指数是否有更多
    hasMoreEtfQuotes: true,           // ETF是否有更多
    currentPage: {
      hotStocks: 1,
      indexQuotes: 1,
      etfQuotes: 1
    },
    pageSize: 20,
    
    // === 新增：实时更新状态 ===
    isRealtimeUpdating: false,        // 是否正在实时更新
    lastUpdateTime: 0,                // 上次更新时间戳
    
    // === 新增：网络状态 ===
    isNetworkAvailable: true          // 网络是否可用
  },

  onLoad: function (options) {
    // ==================== 安全包装：防止任何错误导致黑屏 ====================
    try {
      console.log('个股期权报价页面加载', options);

      // ==================== 设置状态栏样式为白色主题 ====================
      // 由于使用自定义导航栏，需要动态设置状态栏文字为深色
      wx.setNavigationBarColor({
        frontColor: '#000000',  // 状态栏文字颜色：黑色
        backgroundColor: '#ffffff',  // 导航栏背景色：白色
        animation: {
          duration: 0,
          timingFunc: 'easeIn'
        }
      });

      // 获取系统信息以适配自定义导航栏
      const windowInfo = wx.getWindowInfo();
      this.setData({
        statusBarHeight: windowInfo.statusBarHeight,
        navBarHeight: 44 // iOS标准，Android可能是48，这里简化
      });

      // 解析跳转参数，确定目标Tab
      const targetTab = options.tab || '自选';
      this.setData({ currentTab: targetTab });

      // 检查收藏状态
      this.checkFavoriteStatus();

      // 注册数据管理器回调（用于实时更新）
      this._registerDataManagerCallbacks();

      // 检查网络状态
      this._checkNetworkStatus();

      // 根据目标Tab按需加载数据（优化首次加载）
      this._loadDataForTab(targetTab, options);

      // 加载分组数据（静默）
      this.loadGroups({ silent: true });

      // 初始化期权报价系统
      this.initPricingSystem();

    } catch (error) {
      // 关键：捕获任何初始化错误，确保页面至少能渲染
      console.error('[quotes onLoad] 初始化错误:', error);

      // 设置安全的默认状态，确保页面能正常显示
      this.setData({
        loading: false,
        showEmptyState: true,
        watchlist: [],
        hotStocks: [],
        indexQuotes: [],
        etfQuotes: []
      });

      // 显示友好提示
      wx.showToast({
        title: '页面加载异常，请重试',
        icon: 'none',
        duration: 2000
      });
    }
  },
  
  // 注册数据管理器回调
  _registerDataManagerCallbacks: function() {
    // 自选列表更新回调
    quotesDataManager.registerCallback('watchlist', (result) => {
      if (result && result.data) {
        this.setData({
          watchlist: result.data,
          updateTime: quotesDataManager.formatUpdateTime(Date.now()),
          lastUpdateTime: Date.now()
        });
      }
    });
    
    // 热门个股更新回调
    quotesDataManager.registerCallback('hotStocks', (result) => {
      if (result && result.data) {
        this.setData({
          hotStocks: result.data,
          updateTime: quotesDataManager.formatUpdateTime(Date.now()),
          lastUpdateTime: Date.now()
        });
      }
    });
  },
  
  // 检查网络状态
  _checkNetworkStatus: function() {
    wx.getNetworkType({
      success: (res) => {
        const isOnline = res.networkType !== 'none';
        this.setData({ isNetworkAvailable: isOnline });
        
        if (!isOnline) {
          wx.showToast({
            title: '网络不可用，显示缓存数据',
            icon: 'none',
            duration: 2000
          });
        }
      }
    });
  },
  
  // 按Tab加载数据（优化首次加载性能）
  _loadDataForTab: function(tab, options) {
    console.log(`[加载] 按需加载Tab数据: ${tab}`);

    // ==================== 修复：所有异步调用添加 .catch() 错误处理 ====================
    switch (tab) {
      case '自选':
        this.loadWatchlist().catch(err => {
          console.error('[loadWatchlist] 加载失败:', err);
          this.setData({ loading: false, showEmptyState: true, watchlist: [] });
        });
        break;
      case '个股':
        this.loadIndexData();
        this.loadEtfData();
        // 如果有跳转参数中的股票信息，使用该股票
        if (options && (options.code || options.stock)) {
          this.handleNavigationParams(options);
        } else {
          this.loadHotStocks();
        }
        break;
      case '指数':
        this.loadIndexData();
        break;
      case 'ETF':
        this.loadEtfData();
        break;
      default:
        // 默认加载所有
        this.loadWatchlist().catch(err => {
          console.error('[loadWatchlist] 加载失败:', err);
          this.setData({ loading: false, showEmptyState: true, watchlist: [] });
        });
        this.loadIndexData();
        this.loadEtfData();
        if (!options || (!options.code && !options.stock)) {
          this.loadHotStocks();
        }
    }
  },

  onShow: function() {
    // 适配自定义 tabBar
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 1 // 报价页在 tabBar 中的索引
      })
    }

    // 检查是否有全局跳转参数
    const app = getApp();
    if (app.globalData.pendingQuoteParams) {
      console.log('处理全局跳转参数', app.globalData.pendingQuoteParams);
      this.handleNavigationParams(app.globalData.pendingQuoteParams);
      app.globalData.pendingQuoteParams = null; // 处理完清空
    }

    // 页面显示时刷新数据
    if (this.pricingSystem) {
      this.refreshPricing();
    }

    // 加载自选列表（添加错误处理）
    this.loadWatchlist().catch(err => {
      console.error('[onShow loadWatchlist] 加载失败:', err);
      this.setData({ loading: false, showEmptyState: true, watchlist: [] });
    });
    this.loadGroups({ silent: true });

    // 重新检查收藏状态
    this.checkFavoriteStatus();

    // 根据当前Tab启动实时更新
    this._startRealtimeUpdateForCurrentTab();
  },
  
  // 根据当前Tab启动实时更新
  _startRealtimeUpdateForCurrentTab: function() {
    const { currentTab } = this.data;
    
    // 自选列表启用实时更新
    if (currentTab === '自选') {
      quotesDataManager.startWatchlistRealtimeUpdate();
    }
  },
  
  // 页面隐藏时停止实时更新
  onHide: function() {
    quotesDataManager.stopWatchlistRealtimeUpdate();
  },
  
  // 页面卸载时清理资源
  onUnload: function() {
    // 取消所有数据管理器回调
    quotesDataManager.unregisterCallback('watchlist');
    quotesDataManager.unregisterCallback('hotStocks');
    quotesDataManager.stopWatchlistRealtimeUpdate();
  },

  // ==================== 性能优化函数 ====================
  
  /**
   * 批量setData优化
   * 合并多次数据更新，减少渲染次数
   */
  _batchSetData: function(updates, callback) {
    if (Object.keys(updates).length === 0) return;
    
    // 使用 nextTick 确保在下一个时间片更新
    wx.nextTick(() => {
      this.setData(updates, callback);
    });
  },

  /**
   * 虚拟列表计算
   * 计算可视区域内的数据项，优化大数据渲染
   */
  _calculateVisibleData: function(list, startIndex, visibleCount) {
    const endIndex = Math.min(startIndex + visibleCount, list.length);
    return {
      visibleList: list.slice(startIndex, endIndex),
      startIndex,
      endIndex,
      total: list.length
    };
  },

  /**
   * 分页加载更多数据
   * @param {string} type - 数据类型：hotStocks/indexQuotes/etfQuotes
   */
  loadMoreData: function(type) {
    const { currentPage, pageSize, hasMoreHotStocks, hasMoreIndexQuotes, hasMoreEtfQuotes } = this.data;
    
    // 检查是否还有更多数据
    if (type === 'hotStocks' && !hasMoreHotStocks) return;
    if (type === 'indexQuotes' && !hasMoreIndexQuotes) return;
    if (type === 'etfQuotes' && !hasMoreEtfQuotes) return;
    
    // 增加页码
    const newPage = { ...currentPage, [type]: currentPage[type] + 1 };
    this.setData({ currentPage: newPage });
    
    // 加载下一页数据
    console.log(`[分页加载] ${type} 第 ${newPage[type]} 页`);
    
    // 实际项目中应调用API获取数据，这里模拟加载
    // 示例：this._loadPagedDataFromAPI(type, newPage[type], pageSize);
  },

  /**
   * 下拉刷新处理
   */
  onPullDownRefresh: function() {
    const { currentTab } = this.data;
    this.setData({ isPullRefreshing: true });
    
    // 刷新当前Tab数据
    const refreshPromise = new Promise((resolve) => {
      switch (currentTab) {
        case '自选':
          this.loadWatchlist();
          break;
        case '个股':
          this.loadHotStocks();
          break;
        case '指数':
          this.loadIndexData();
          break;
        case 'ETF':
          this.loadEtfData();
          break;
        default:
          resolve();
      }
      // 模拟刷新完成
      setTimeout(resolve, 800);
    });
    
    refreshPromise.then(() => {
      this.setData({ isPullRefreshing: false });
      wx.stopPullDownRefresh();
      wx.showToast({
        title: '刷新成功',
        icon: 'success',
        duration: 1500
      });
    });
  },

  /**
   * 触底加载更多
   */
  onReachBottom: function() {
    const { currentTab } = this.data;
    this.loadMoreData(
      currentTab === '个股' ? 'hotStocks' :
      currentTab === '指数' ? 'indexQuotes' :
      currentTab === 'ETF' ? 'etfQuotes' : 'hotStocks'
    );
  },

  /**
   * 价格闪烁动画触发
   * 在数据更新时调用，为变化的项添加闪烁效果
   */
  _triggerPriceFlash: function(code, isUp) {
    const flashClass = isUp ? 'flash-up' : 'flash-down';
    // 通过自定义属性标记需要闪烁的元素
    this.setData({
      [`flashItem_${code}`]: flashClass
    });
    
    // 400ms后移除闪烁效果
    setTimeout(() => {
      this.setData({
        [`flashItem_${code}`]: ''
      });
    }, 400);
  },

  // ==================== 性能优化函数结束 ====================

  handleNavigationParams: function(options) {
    console.log('handleNavigationParams收到参数:', options);
    if (!options) return;

    // 支持 tab 参数切换到指定分类
    if (options.tab) {
      console.log('设置tab:', options.tab);
      this.setData({ currentTab: options.tab });
    }

    // 如果有传入的股票信息，使用传入的股票
    if (options.stock) {
      try {
        const stockInfo = typeof options.stock === 'string' ? JSON.parse(decodeURIComponent(options.stock)) : options.stock;
        console.log('解析stock信息:', stockInfo);
        this.setData({
          currentTab: '个股',
          currentStock: {
            code: stockInfo.code || '000001',
            name: stockInfo.name || '平安银行',
            price: stockInfo.price || 11.36,
            change: stockInfo.change || 0.61,
            changePercent: stockInfo.changePercent || 5.68,
            displayText: `${stockInfo.price || 11.36}  +${stockInfo.changePercent || 5.68}%`
          }
        });
        // 重新加载热门股票列表和期权报价
        this.loadHotStocks();
        this.loadOptionQuotes();
      } catch (e) {
        console.error('解析股票信息失败:', e);
      }
    } else {
      const sc = (options.stockCode || options.code);
      const sn = (options.stockName || options.name);
      console.log('处理code/name参数:', { sc, sn });
      if (sc) {
        const code = this.normalizeParam(sc);
        const name = this.normalizeParam(sn) || '平安银行';
        const price = options.price || Number((Math.random() * 100 + 10).toFixed(2));
        const changePercent = options.changePercent || Number((Math.random() * 4 - 2).toFixed(2));
        const change = Number((price * changePercent / 100).toFixed(2));
        
        console.log('设置currentStock:', { code, name, price, change, changePercent });
        this.setData({
          currentTab: '个股',
          currentStock: {
            code,
            name,
            price,
            change,
            changePercent,
            displayText: `${price}  ${changePercent >= 0 ? '+' : ''}${changePercent}%`
          }
        });
        
        // 如果是从搜索跳转，重新加载热门股票列表和期权报价
        this.loadHotStocks();
        this.loadOptionQuotes();
      }
    }
  },

  // 加载 ETF 数据
  loadEtfData: function() {
    this.setData({ loading: true });
    // 模拟从后端获取 ETF 数据
    setTimeout(() => {
      this.setData({
        loading: false,
        etfUpdate: new Date().toLocaleString('zh-CN', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit', 
          hour: '2-digit', 
          minute: '2-digit' 
        }).replace(/\//g, '/') + '更新'
      });
    }, 500);
  },

  // 加载指数数据
  loadIndexData: function() {
    this.setData({ loading: true });
    // 模拟从后端获取指数数据
    setTimeout(() => {
      this.setData({
        loading: false,
        indexUpdate: new Date().toLocaleString('zh-CN', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit', 
          hour: '2-digit', 
          minute: '2-digit' 
        }).replace(/\//g, '/') + '更新'
      });
    }, 500);
  },

  // 加载热门个股
  loadHotStocks: function() {
    this.setData({ loading: true });
    
    // 模拟或调用 API 获取热门个股数据
    // 实际项目中应优先从后端实时获取
    setTimeout(() => {
      let baseStocks = [
        { name: '宁德时代', code: '300750.SZ', changePercent: 2.47, price: 180.50, atm: 11.83, otm105: 9.77, otm110: 8.01 },
        { name: '东方财富', code: '300059.SZ', changePercent: 0.50, price: 13.45, atm: 16.20, otm105: 14.21, otm110: 12.44 },
        { name: '平安银行', code: '000001.SZ', changePercent: -0.35, price: 10.20, atm: 6.53, otm105: 4.46, otm110: 2.94 },
        { name: '药明康德', code: '603259.SH', changePercent: -1.26, price: 45.30, atm: 7.92, otm105: 5.83, otm110: 4.21 },
        { name: '上海贝岭', code: '600171.SH', changePercent: -2.26, price: 28.16, atm: 12.16, otm105: 10.16, otm110: 8.16 },
        { name: '中信证券', code: '600030.SH', changePercent: 1.45, price: 22.34, atm: 10.23, otm105: 8.56, otm110: 7.12 },
        { name: '贵州茅台', code: '600519.SH', changePercent: 0.12, price: 1650.00, atm: 15.32, otm105: 13.12, otm110: 11.45 },
        { name: '五粮液', code: '000858.SZ', changePercent: -0.56, price: 150.20, atm: 14.12, otm105: 12.34, otm110: 10.56 },
        { name: '比亚迪', code: '002594.SZ', changePercent: 3.12, price: 210.50, atm: 18.56, otm105: 16.45, otm110: 14.23 },
        { name: '隆基绿能', code: '601012.SH', changePercent: -1.89, price: 18.45, atm: 22.34, otm105: 20.12, otm110: 18.45 }
      ];
      
      // 如果有当前选中的股票（从首页跳转过来），将其插入到列表顶部
      const { currentStock } = this.data;
      console.log('loadHotStocks currentStock:', currentStock);
      let selectedStock = null;
      
      if (currentStock && currentStock.code) {
        // 检查是否已存在该股票
        const existingIndex = baseStocks.findIndex(s => s.code.split('.')[0] === currentStock.code.split('.')[0]);
        if (existingIndex >= 0) {
          // 已存在，移除并更新数据
          const existing = baseStocks.splice(existingIndex, 1)[0];
          existing.name = currentStock.name || existing.name;
          existing.price = currentStock.price || existing.price;
          existing.changePercent = currentStock.changePercent || existing.changePercent;
          selectedStock = existing;
        } else {
          // 不存在，创建新条目
          selectedStock = {
            name: currentStock.name,
            code: currentStock.code + (currentStock.market === 'SH' ? '.SH' : '.SZ'),
            changePercent: currentStock.changePercent || 0,
            price: currentStock.price || 0,
            atm: 10.00,
            otm105: 8.50,
            otm110: 7.20
          };
        }
        console.log('选中的股票:', selectedStock);
      }
      
      // 对剩余股票应用排序
      const { sortField, sortOrder } = this.data;
      const sortedStocks = baseStocks.sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        
        // 处理数值
        valA = typeof valA === 'string' ? parseFloat(valA) : valA;
        valB = typeof valB === 'string' ? parseFloat(valB) : valB;
        
        if (sortOrder === 'asc') {
          return valA - valB;
        } else {
          return valB - valA;
        }
      });

      // 如果有选中的股票，放在最前面
      if (selectedStock) {
        sortedStocks.unshift(selectedStock);
      }

      const now = new Date();
      const formattedTime = `${now.getFullYear()}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}更新`;

      this.setData({ 
        hotStocks: sortedStocks,
        loading: false,
        updateTime: formattedTime
      });
    }, 600);
  },

  // 排序切换
  onSortChange: function(e) {
    const field = e.currentTarget.dataset.sort;
    let { sortField, sortOrder, currentTab } = this.data;
    
    // 切换排序字段或方向
    if (sortField === field) {
      sortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
    } else {
      sortField = field;
      sortOrder = 'desc'; // 新字段默认降序
    }
    
    this.setData({ sortField, sortOrder });
    
    // 根据当前Tab对数据进行排序（不重新加载）
    this._sortCurrentTabData();
  },
  
  // 对当前Tab数据进行排序（本地排序，无需重新请求）
  _sortCurrentTabData: function() {
    const { currentTab, sortField, sortOrder } = this.data;
    let dataKey = '';
    let data = [];
    
    switch (currentTab) {
      case '自选':
        dataKey = 'watchlist';
        data = [...this.data.watchlist];
        break;
      case '个股':
        dataKey = 'hotStocks';
        data = [...this.data.hotStocks];
        break;
      case '指数':
        dataKey = 'indexQuotes';
        data = [...this.data.indexQuotes];
        break;
      case 'ETF':
        dataKey = 'etfQuotes';
        data = [...this.data.etfQuotes];
        break;
      default:
        return;
    }
    
    if (data.length === 0) return;
    
    // 通用排序函数
    const sortedData = data.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      
      // 处理不同类型的值
      if (typeof valA === 'string') {
        valA = parseFloat(valA.replace('%', '')) || 0;
      }
      if (typeof valB === 'string') {
        valB = parseFloat(valB.replace('%', '')) || 0;
      }
      
      // 处理NaN
      if (isNaN(valA)) valA = 0;
      if (isNaN(valB)) valB = 0;
      
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });
    
    this.setData({ [dataKey]: sortedData });
  },

  // 切换顶部 Tab（自选/个股/指数/ETF）
  onTabChange: function(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.currentTab) return;
    
    this.setData({ currentTab: tab });
    
    // 根据切换的 Tab 加载对应数据
    if (tab === '自选') {
      this.loadWatchlist();
    } else if (tab === '个股') {
      this.loadHotStocks();
    } else if (tab === '指数') {
      this.loadIndexData();
    } else if (tab === 'ETF') {
      this.loadEtfData();
    }
  },

  // 切换期限
  onTermChange: function(e) {
    const term = e.currentTarget.dataset.term;
    this.setData({ selectedTerm: term });
    this.loadHotStocks(); // 实际应重新获取对应期限的数据
  },

  // 切换交易商
  onTraderChange: function(e) {
    const { code, name } = e.currentTarget.dataset;
    this.setData({ 
      selectedTrader: name,
      selectedTraderCode: code,
      showTraderPicker: false
    });
    this.loadHotStocks();
  },

  toggleTraderPicker: function() {
    this.setData({ showTraderPicker: !this.data.showTraderPicker });
  },

  // 切换业务类型 (香草/雪球)
  onBizTypeChange: function(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ bizType: type });
    this.loadOptionQuotes();
  },

  // 将列表数据转换为矩阵格式
  transformToMatrix: function(quotes) {
    const { matrixColumns, selectedTraderCode, bizType } = this.data;
    
    // 根据业务类型决定行标识策略
    let strikes = [];
    
    if (bizType === 'vanilla' && quotes.length > 0) {
      // 香草数据：按交易商作为行标识（展示不同交易商的报价）
      const traders = [...new Set(quotes.map(q => q.trader).filter(Boolean))];
      if (traders.length > 0) {
        strikes = traders;
      } else {
        // 如果没有 trader 字段，使用默认结构类型
        strikes = ['香草看涨', '香草看跌'];
      }
    } else {
      // 非香草数据：尝试从数据中提取类型，或使用预设结构类型
      const rawStrikes = [...new Set(quotes.map(q => q.type))].filter(Boolean);
      // 过滤掉"香草"这个通用类型，保留结构类型（如100C、105C等）
      const structureStrikes = rawStrikes.filter(s => s !== '香草' && !s.includes('香草'));
      strikes = structureStrikes.length > 0 ? structureStrikes : ['100C', '103C', '105C', '110C', '80C', '90C', '95C'];
    }
    
    console.log('[transformToMatrix] bizType:', bizType, 'strikes:', strikes, 'quotes数量:', quotes.length);
    
    const matrix = strikes.map(strike => {
      const row = { strike: strike, values: [] };
      matrixColumns.forEach(term => {
        let value = '--';
        let badge = null;
        
        // 在传入的报价中查找匹配项
        // 匹配规则：类型(strike)匹配，期限(term)匹配
        const match = quotes.find(q => {
          // 香草模式：按交易商匹配
          if (bizType === 'vanilla') {
            const traderMatch = q.trader === strike || (q.trader && q.trader.includes(strike));
            const termMatch = q.term === term || (q.term && q.term.includes(term));
            return traderMatch && termMatch;
          }
          // 非香草模式：按类型匹配
          const typeMatch = q.type === strike || (q.type && q.type.includes(strike));
          const termMatch = q.term === term || (q.term && q.term.includes(term));
          const traderMatch = selectedTraderCode === 'ALL' || selectedTraderCode === 'BEST' || q.trader === selectedTraderCode;
          return typeMatch && termMatch && traderMatch;
        });

        if (match) {
          // 如果是 float，转换为百分比
          if (typeof match.rate === 'number') {
            value = (match.rate * 100).toFixed(2) + '%';
          } else {
            value = match.rate || '--';
          }
          // 如果是“最优报价”模式，可以添加角标或特殊处理
          if (selectedTraderCode === 'BEST') {
            badge = '1'; 
          }
        } else if (quotes.length > 0 && bizType !== 'vanilla') {
          // 非香草模式的兜底：显示示例数据
          if (strike === '100C' && term === '1M') {
            value = '3.65%';
            badge = '1';
          }
        }

        row.values.push({ term: term, value: value, badge: badge });
      });
      return row;
    });

    this.setData({ matrixData: matrix });
  },

  // 同步滚动 (已由 CSS sticky 实现，此处留作备用或移除)
  onMatrixHeaderScroll: function(e) {},
  onMatrixRowScroll: function(e) {},

  // 显示/隐藏选择器
  showDatePicker: function() {
    wx.showActionSheet({
      itemList: this.data.quoteDates.map(d => d.label),
      success: (res) => {
        const date = this.data.quoteDates[res.tapIndex];
        this.setData({ selectedQuoteDate: date.label });
        this.loadOptionQuotes();
      }
    });
  },

  showTraderPicker: function() {
    wx.showActionSheet({
      itemList: this.data.traders.map(t => t.name),
      success: (res) => {
        const trader = this.data.traders[res.tapIndex];
        this.setData({ 
          selectedTrader: trader.name,
          selectedTraderCode: trader.code
        });
        this.loadOptionQuotes();
      }
    });
  },

  // 点击矩阵单元格
  onCellTap: function(e) {
    const { strike, term } = e.currentTarget.dataset;
    const { currentStock, matrixData, selectedTrader, selectedTraderCode } = this.data;
    
    // 从矩阵数据中查找费率
    const row = matrixData.find(r => r.strike === strike);
    const cell = row ? row.values.find(v => v.term === term) : null;
    const premiumPercent = cell ? cell.value.replace('%', '') : '';

    this.setData({
      showOrderModal: true,
      orderForm: {
        direction: '买入',
        traderCode: selectedTraderCode,
        traderName: selectedTrader,
        underlying: `${currentStock.name} ${currentStock.code}`,
        structure: `${strike} - ${term}`,
        premiumPercent: premiumPercent,
        notional: 100,
        buyPrice: ''
      }
    });
  },

  // 跳转到计算器
  goToCalculator: function() {
    wx.navigateTo({ url: '/pages/calculator/calculator' });
  },

  // 跳转到工作台
  goToWorkspace: function() {
    // 检查 workspace 是否在 tabBar 中，不在的话使用 navigateTo
    wx.navigateTo({ 
      url: '/pages/workspace/workspace',
      fail: (err) => {
        console.log('navigateTo workspace failed, trying switchTab', err);
        wx.switchTab({ url: '/pages/workspace/workspace' });
      }
    });
  },

  normalizeParam: function(v) {
    if (v === undefined || v === null) return '';
    const s = String(v);
    if (s === 'undefined' || s === 'null') return '';
    return s;
  },

  // 更新股票信息（供搜索页回调）
  updateStockInfo: function(stockInfo) {
    console.log('更新股票信息:', stockInfo);
    this.setData({
      currentStock: {
        code: stockInfo.code,
        name: stockInfo.name,
        price: stockInfo.price,
        change: stockInfo.change,
        changePercent: stockInfo.changePercent,
        displayText: `${stockInfo.price}  ${stockInfo.changePercent >= 0 ? '+' : ''}${stockInfo.changePercent}%`
      }
    });
    
    // 重新检查收藏状态
    this.checkFavoriteStatus();
    
    // 重新加载期权报价
    this.loadOptionQuotes();
  },

  // 移除冗余的 onShow 定义
  /*
  onShow: function () {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 1
      })
    }
    // 页面显示时刷新数据
    if (this.pricingSystem) {
      this.refreshPricing();
    }
    
    // 加载自选列表
    this.loadWatchlist();
    this.loadGroups({ silent: true });
    
    // 重新检查收藏状态
    this.checkFavoriteStatus();
  },
  */

  // 加载自选列表数据（对接后端期权报价API）
  loadWatchlist: async function() {
    // ==================== 修复：最外层 try-catch 确保任何错误都能被捕获 ====================
    try {
      // 1. 获取本地自选列表
      let favorites = favoritesService.getFavorites();

      // 空列表显示引导
      if (!favorites || favorites.length === 0) {
        this.setData({
          watchlist: [],
          showEmptyState: true,
          loading: false
        });
        return;
      }

      // 2. 提取股票代码（确保格式统一）
      const stockCodes = favorites.map(item => {
        let code = item.code;
        if (!code.includes('.')) {
          const market = item.market || (code.startsWith('6') ? 'SH' : 'SZ');
          code = `${code}.${market}`;
        }
        return code.toUpperCase();
      });

      // 3. 调用批量期权报价API
      this.setData({ loading: true });

      try {
        const quotesApi = require('../../utils/api-quotes.js');
        const result = await quotesApi.getBatchOptionQuotes(
          stockCodes,
          this.data.selectedTerm || '1M',
          'call'
        );

        if (result && result.success && result.data && result.data.quotes) {
          // 4. 合并自选列表与期权报价数据
          this._mergeWatchlistWithQuotes(favorites, result.data.quotes);
          console.log('[自选加载] 成功获取期权报价数据');
        } else {
          // API返回失败，降级到模拟数据
          console.warn('[自选加载] API返回失败，使用降级数据');
          this._loadFallbackWatchlist(favorites);
        }
      } catch (error) {
        console.error('[自选加载] 获取期权报价失败:', error);
        // 降级处理：使用前端模拟数据
        this._loadFallbackWatchlist(favorites);
      } finally {
        this.setData({ loading: false });
      }
    } catch (outerError) {
      // 捕获任何未预料的错误（如 favoritesService 未定义等）
      console.error('[loadWatchlist] 严重错误:', outerError);
      this.setData({
        loading: false,
        showEmptyState: true,
        watchlist: []
      });
    }
  },

  // 合并自选列表与期权报价数据
  _mergeWatchlistWithQuotes: function(favorites, quotes) {
    // 构建报价映射表（按股票代码查找）
    const quoteMap = {};
    quotes.forEach(q => {
      if (q && q.stockCode) {
        const pureCode = q.stockCode.split('.')[0];
        quoteMap[pureCode] = q;
      }
    });

    // 合并数据
    const watchlist = favorites.map(item => {
      const pureCode = item.code.split('.')[0];
      const quote = quoteMap[pureCode] || {};

      // 格式化代码（确保有市场后缀）
      let displayCode = item.code;
      if (!displayCode.includes('.')) {
        const market = item.market || (item.code.startsWith('6') ? 'SH' : 'SZ');
        displayCode = `${item.code}.${market}`;
      }

      return {
        ...item,
        code: displayCode,
        price: quote.price || item.price || '--',
        changePercent: Number(quote.changePercent || item.changePercent || 0).toFixed(2),
        // 期权费率（百分比）
        atm: quote.atm?.premiumPercent?.toFixed(2) || '--',
        otm105: quote.otm105?.premiumPercent?.toFixed(2) || '--',
        otm110: quote.otm110?.premiumPercent?.toFixed(2) || '--'
      };
    });

    // 更新时间
    const now = new Date();
    const updateTime = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}更新`;

    this.setData({
      watchlist,
      originalWatchlist: watchlist,   // 保存原始列表用于搜索
      filteredWatchlist: watchlist,   // 筛选后的列表
      updateTime,
      showEmptyState: false
    });
  },

  // 降级处理：使用前端模拟数据
  _loadFallbackWatchlist: function(favorites) {
    const watchlist = favorites.map(item => {
      let displayCode = item.code;
      if (!displayCode.includes('.')) {
        const market = item.market || (item.code.startsWith('6') ? 'SH' : 'SZ');
        displayCode = `${item.code}.${market}`;
      }

      // 使用前端简化计算生成模拟期权数据
      const price = item.price || 50;
      const volatility = 0.30;  // 默认波动率30%
      const T = 30 / 365;  // 默认1个月期限

      // 简化BS模型计算（ATM）
      const atmPremium = this._calculateSimpleOptionPremium(price, price, T, volatility);
      const otm105Premium = this._calculateSimpleOptionPremium(price, price * 1.05, T, volatility);
      const otm110Premium = this._calculateSimpleOptionPremium(price, price * 1.10, T, volatility);

      // 转换为费率百分比
      const atm = ((atmPremium / price) * 100).toFixed(2);
      const otm105 = ((otm105Premium / price) * 100).toFixed(2);
      const otm110 = ((otm110Premium / price) * 100).toFixed(2);

      return {
        ...item,
        code: displayCode,
        atm,
        otm105,
        otm110,
        changePercent: Number(item.changePercent || 0).toFixed(2)
      };
    });

    this.setData({
      watchlist,
      originalWatchlist: watchlist,
      filteredWatchlist: watchlist,
      showEmptyState: false
    });
  },

  // 简化期权费计算（用于降级场景）
  _calculateSimpleOptionPremium: function(S, K, T, sigma) {
    // 极简BS模型近似（仅用于降级）
    if (T <= 0) return 0;

    const r = 0.03;  // 无风险利率
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    // 标准正态分布CDF近似
    const N = (x) => {
      const a1 = 0.254829592;
      const a2 = -0.284496736;
      const a3 = 1.421413741;
      const a4 = -1.453152027;
      const a5 = 1.061405429;
      const p = 0.3275911;
      const sign = x < 0 ? -1 : 1;
      x = Math.abs(x) / Math.sqrt(2);
      const t = 1.0 / (1.0 + p * x);
      const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
      return 0.5 * (1.0 + sign * y);
    };

    const price = S * N(d1) - K * Math.exp(-r * T) * N(d2);
    return Math.max(price, 0);
  },

  // ==================== 自选搜索筛选 ====================

  // 自选搜索输入
  onWatchlistSearch: function(e) {
    const keyword = e.detail.value.trim().toLowerCase();
    this.setData({ watchlistSearchKeyword: keyword });

    if (!keyword) {
      // 清空搜索，显示全部
      this.setData({ filteredWatchlist: this.data.originalWatchlist });
      return;
    }

    // 实时筛选（按代码或名称匹配）
    const filtered = this.data.originalWatchlist.filter(item => {
      const codeMatch = item.code.toLowerCase().includes(keyword);
      const nameMatch = item.name.toLowerCase().includes(keyword);
      const pureCode = item.code.split('.')[0].toLowerCase();
      const pureCodeMatch = pureCode.includes(keyword);

      return codeMatch || nameMatch || pureCodeMatch;
    });

    this.setData({ filteredWatchlist: filtered });
  },

  // 清空自选搜索
  clearWatchlistSearch: function() {
    this.setData({
      watchlistSearchKeyword: '',
      filteredWatchlist: this.data.originalWatchlist
    });
  },

  // ==================== 自选编辑逻辑 ====================

  // 开始编辑自选
  onEditFavorites: function() {
    const { watchlist } = this.data;
    if (!watchlist || watchlist.length === 0) {
      wx.showToast({ title: '暂无自选可编辑', icon: 'none' });
      return;
    }
    this.setData({ 
      isEditing: true, 
      selectedForEdit: [] 
    });
  },

  // 取消编辑
  cancelEditing: function() {
    this.setData({ 
      isEditing: false, 
      selectedForEdit: [] 
    });
  },

  // 切换选中状态
  toggleSelection: function(e) {
    const code = e.currentTarget.dataset.code;
    const { selectedForEdit } = this.data;
    const idx = selectedForEdit.indexOf(code);
    
    let newSelected;
    if (idx > -1) {
      newSelected = [...selectedForEdit];
      newSelected.splice(idx, 1);
    } else {
      newSelected = [...selectedForEdit, code];
    }
    
    this.setData({ selectedForEdit: newSelected });
  },

  // 删除选中的自选
  deleteSelectedFavorites: function() {
    const { selectedForEdit, watchlist } = this.data;
    
    if (selectedForEdit.length === 0) {
      wx.showToast({ title: '请先选择要删除的条目', icon: 'none' });
      return;
    }

    // 检查存储空间
    const storageCheck = favoritesService.checkStorageSpace();
    if (!storageCheck.available) {
      wx.showModal({
        title: '存储空间不足',
        content: storageCheck.message,
        showCancel: false
      });
      return;
    }

    wx.showModal({
      title: '确认删除',
      content: `确定要删除这 ${selectedForEdit.length} 个自选吗？\n删除后可在回收站恢复（7天内）`,
      confirmText: '删除',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          // 使用 favoritesService 批量删除（支持回收站）
          const result = favoritesService.removeFavorites(selectedForEdit, { useRecycleBin: true });
          
          if (result.success) {
            // 更新页面数据
            const newWatchlist = watchlist.filter(item => !selectedForEdit.includes(item.code));
            this.setData({
              watchlist: newWatchlist,
              isEditing: false,
              selectedForEdit: []
            });
            
            wx.showToast({ 
              title: result.message, 
              icon: 'success',
              duration: 2000
            });
          } else {
            wx.showToast({ title: result.message || '删除失败', icon: 'none' });
          }
        }
      }
    });
  },
  
  // 显示回收站
  showRecycleBin: function() {
    const recycleBin = favoritesService.getRecycleBin();
    
    if (recycleBin.length === 0) {
      wx.showToast({ title: '回收站为空', icon: 'none' });
      return;
    }
    
    wx.showActionSheet({
      itemList: recycleBin.map(item => `${item.name} (${item.code})`).concat(['清空回收站']),
      success: (res) => {
        if (res.tapIndex === recycleBin.length) {
          // 清空回收站
          wx.showModal({
            title: '确认清空',
            content: '确定要清空回收站吗？清空后无法恢复。',
            success: (modalRes) => {
              if (modalRes.confirm) {
                favoritesService.clearRecycleBin();
                wx.showToast({ title: '已清空回收站', icon: 'success' });
              }
            }
          });
        } else if (res.tapIndex < recycleBin.length) {
          // 恢复选中项
          const item = recycleBin[res.tapIndex];
          favoritesService.recoverFromRecycleBin(item.code);
          this.loadWatchlist();
          wx.showToast({ title: '已恢复', icon: 'success' });
        }
      }
    });
  },

  // ==================== 自选编辑逻辑结束 ====================

  // ==================== 数据说明弹窗逻辑 ====================
  showDataInfo: function() {
    this.setData({
      showDataModal: true,
      modalAnimationClass: 'fade-in'
    });
  },

  hideDataInfo: function() {
    this.setData({
      modalAnimationClass: 'fade-out'
    });
    // 动画结束后移除 DOM
    setTimeout(() => {
      this.setData({
        showDataModal: false,
        modalAnimationClass: ''
      });
    }, 300); // 300ms 与 CSS 动画时间一致
  },

  preventTouchMove: function() {
    // 阻止背景滚动
    return;
  },

  stopBubble: function() {
    // 阻止点击弹窗内容时关闭弹窗
    return;
  },
  // ==================== 数据说明弹窗逻辑结束 ====================

  // ==================== 分组功能逻辑 ====================
  onGroupClick: function() {
    console.log('打开分组管理');
    this.setData({ showGroupManagePopup: true });
    this.loadGroups({ silent: false });
  },

  closeGroupManagePopup: function() {
    this.setData({ showGroupManagePopup: false });
  },

  // 加载分组列表
  loadGroups: function(options) {
    const silent = options && options.silent;
    const now = Date.now();

    // 静默模式下检查节流，避免频繁请求
    if (silent && now - _lastLoadGroupsTime < LOAD_GROUPS_THROTTLE_MS) {
      return;
    }
    _lastLoadGroupsTime = now;

    this.setData({ loadingGroups: true });
    if (!silent) {
      wx.showLoading({ title: '加载中...' });
    }
    api.getGroups()
      .then(res => {
        if (!silent) {
          wx.hideLoading();
        }
        const groups = Array.isArray(res && res.data) ? res.data : [];
        const enhancedGroups = groups.map(g => ({ ...g, _protected: logic.isProtectedGroup(g) }));
        const pendingGroupId = this.data.pendingGroupSwitchId;
        this.setData({ customGroups: enhancedGroups, topGroups: enhancedGroups, loadingGroups: false, topGroupAnimationClass: enhancedGroups.length ? 'fade-in' : '' });
        this.updateGroupCounts();
        if (enhancedGroups.length) {
          setTimeout(() => {
            if (this.data.topGroupAnimationClass) {
              this.setData({ topGroupAnimationClass: '' });
            }
          }, 260);
        }
        if (pendingGroupId) {
          const exists = (enhancedGroups || []).some(g => g && g.id === pendingGroupId);
          if (exists) {
            this.setData({ pendingGroupSwitchId: '' });
            this.onSwitchGroup({ currentTarget: { dataset: { id: pendingGroupId } } });
          } else {
            this.setData({ pendingGroupSwitchId: '' });
          }
        }
        if (!silent && res && typeof res.message === 'string' && res.message.indexOf('数据库未连接') > -1) {
          wx.showToast({ title: '数据服务暂不可用，请稍后重试', icon: 'none' });
        }
      })
      .catch(err => {
        if (!silent) {
          wx.hideLoading();
          const msg = (err && err.message) ? err.message : '加载分组失败，请检查网络后重试';
          wx.showToast({ title: msg, icon: 'none' });
        }
        this.setData({ customGroups: [], topGroups: [], loadingGroups: false, pendingGroupSwitchId: '' });
        this.updateGroupCounts();
      });
  },

  // 更新各分组数量
  updateGroupCounts: function() {
    const counts = {};
    const { watchlist, customGroups } = this.data;
    
    // 系统分组计数
    counts['all'] = watchlist.length;
    // 持仓分组计数：检查 groupId === 'holding' 或 isHolding === true
    counts['holding'] = watchlist.filter(item => item && (item.groupId === 'holding' || item.isHolding === true)).length || 0;

    // 自定义分组计数
    (customGroups || []).forEach(group => {
      // 使用后端返回的 members 长度
      if (group.members) {
        counts[group.id] = group.members.length;
      } else {
        counts[group.id] = 0;
      }
    });

    this.setData({ groupCountsById: counts });
  },

  // 切换分组
  onSwitchGroup: function(e) {
    const groupId = e.currentTarget.dataset.id;
    this.setData({ 
      activeGroupId: groupId,
      showGroupManagePopup: false
    });
    
    // 执行筛选逻辑
    this.filterWatchlistByGroup(groupId);
    
    wx.showToast({ title: '已切换分组', icon: 'none' });
  },

  // 根据分组筛选自选列表
  filterWatchlistByGroup: function(groupId) {
    // 使用 favoritesService 进行筛选
    const { customGroups } = this.data;
    const filtered = favoritesService.filterByGroup(groupId, customGroups);
    
    // 如果分组不存在且不是系统分组，显示提示
    if (filtered.length === 0 && groupId !== 'all' && groupId !== 'holding') {
      const group = customGroups.find(g => g.id === groupId);
      if (!group) {
        wx.showToast({ title: '分组数据加载中...', icon: 'none', duration: 1500 });
      }
    }
    
    const formatted = this.formatWatchlistItems(filtered);
    this.setData({ watchlist: formatted });
  },
  
  // 提取格式化逻辑
  formatWatchlistItems: function(items) {
    return items.map(item => {
      let displayCode = item.code;
      if (!displayCode.includes('.')) {
        const market = item.market || (item.code.startsWith('6') ? 'SH' : 'SZ');
        displayCode = `${item.code}.${market}`;
      }
      const atm = item.atm || (Math.random() * 10 + 5).toFixed(2);
      const otm105 = item.otm105 || (atm * 0.8).toFixed(2);
      const otm110 = item.otm110 || (atm * 0.6).toFixed(2);
      return {
        ...item,
        code: displayCode,
        atm: Number(atm).toFixed(2),
        otm105: Number(otm105).toFixed(2),
        otm110: Number(otm110).toFixed(2),
        changePercent: Number(item.changePercent).toFixed(2)
      };
    });
  },

  // --- 新建分组 ---
  onShowNewGroupDialog: function() {
    this.setData({ 
      showNewGroupDialog: true,
      newGroupName: '',
      newGroupError: '',
      canConfirmNewGroup: false
    });
  },

  onCloseNewGroupDialog: function() {
    this.setData({ showNewGroupDialog: false });
  },

  onNewGroupNameInput: function(e) {
    const name = e.detail.value;
    const { canConfirm, error } = logic.validateNewGroupName(name, this.data.customGroups);
    this.setData({
      newGroupName: name,
      newGroupError: error || '',
      canConfirmNewGroup: canConfirm
    });
  },

  onConfirmNewGroup: function() {
    if (!this.data.canConfirmNewGroup) return;
    
    const name = this.data.newGroupName;
    
    wx.showLoading({ title: '创建中...' });
    
    api.createGroup(name)
      .then(res => {
        wx.hideLoading();
        wx.showToast({ title: '创建成功', icon: 'success' });
        const groupId = res && res.data && res.data.id ? res.data.id : '';
        if (groupId) {
          this.setData({ showNewGroupDialog: false, pendingGroupSwitchId: groupId, activeGroupId: groupId });
        } else {
          this.setData({ showNewGroupDialog: false });
        }
        this.loadGroups();
      })
      .catch(err => {
        wx.hideLoading();
        this.setData({ newGroupError: err.message || '创建失败' });
      });
  },

  // --- 重命名分组 ---
  onShowRenameGroupDialog: function(e) {
    const { id, name } = e.currentTarget.dataset;
    this.setData({
      showRenameGroupDialog: true,
      editingGroupId: id,
      editingGroupName: name,
      renameGroupError: '',
      canConfirmRenameGroup: false 
    });
  },

  onCloseRenameGroupDialog: function() {
    this.setData({ showRenameGroupDialog: false });
  },

  onRenameGroupNameInput: function(e) {
    const name = e.detail.value;
    const { canConfirm, error } = logic.validateRenameGroupName(name, this.data.editingGroupId, this.data.customGroups);
    
    this.setData({
      editingGroupName: name,
      renameGroupError: error || '',
      canConfirmRenameGroup: canConfirm
    });
  },

  onConfirmRenameGroup: function() {
    if (!this.data.canConfirmRenameGroup) return;
    
    const groupId = this.data.editingGroupId;
    const name = this.data.editingGroupName;
    
    wx.showLoading({ title: '更新中...' });
    
    api.updateGroup(groupId, { name })
      .then(res => {
        wx.hideLoading();
        wx.showToast({ title: '重命名成功', icon: 'success' });
        this.setData({ showRenameGroupDialog: false });
        this.loadGroups();
      })
      .catch(err => {
        wx.hideLoading();
        this.setData({ renameGroupError: err.message || '更新失败' });
      });
  },

  onOpenGroupActions: function(e) {
    const { id, name, protected: protectedRaw } = e.currentTarget.dataset || {};
    if (!id) return;
    const isProtected = protectedRaw === true || protectedRaw === 'true' || protectedRaw === 1 || protectedRaw === '1';
    if (isProtected) {
      wx.showToast({ title: '系统保护分组不可重命名或删除', icon: 'none' });
      return;
    }
    wx.showActionSheet({
      itemList: ['重命名分组', '删除分组'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.onShowRenameGroupDialog({ currentTarget: { dataset: { id, name } } });
          return;
        }
        if (res.tapIndex === 1) {
          this.onDeleteGroup({ currentTarget: { dataset: { id, name } } });
        }
      }
    });
  },

  // --- 删除分组 ---
  onDeleteGroup: function(e) {
    const { id, name } = e.currentTarget.dataset;

    this.setData({
      showDeleteGroupDialog: true,
      deleteGroupId: id,
      deleteGroupName: name || '',
      deleteRemoveFavorites: false
    });
  },

  onToggleDeleteRemoveFavorites: function() {
    this.setData({ deleteRemoveFavorites: !this.data.deleteRemoveFavorites });
  },

  onCancelDeleteGroupDialog: function() {
    this.setData({
      showDeleteGroupDialog: false,
      deleteGroupId: '',
      deleteGroupName: '',
      deleteRemoveFavorites: false
    });
  },

  onConfirmDeleteGroupDialog: function() {
    const groupId = this.data.deleteGroupId;
    if (!groupId) {
      this.onCancelDeleteGroupDialog();
      return;
    }

    const removeFavorites = this.data.deleteRemoveFavorites === true;
    const group = (this.data.customGroups || []).find(g => g && g.id === groupId);
    const memberCodes = logic.extractGroupMemberCodes(group);

    wx.showLoading({ title: '删除中...' });
    api.deleteGroup(groupId, { removeFavorites })
      .then(() => {
        wx.hideLoading();

        if (removeFavorites) {
          const storedFavorites = favoritesService.getFavorites();
          const nextFavorites = logic.removeFavoritesByCodes(storedFavorites, memberCodes);
          favoritesService.saveFavorites(nextFavorites);
        }

        this.setData({
          showDeleteGroupDialog: false,
          deleteGroupId: '',
          deleteGroupName: '',
          deleteRemoveFavorites: false
        });

        if (this.data.activeGroupId === groupId) {
          this.onSwitchGroup({ currentTarget: { dataset: { id: 'all' } } });
        } else {
          this.filterWatchlistByGroup(this.data.activeGroupId);
        }

        this.loadGroups({ silent: true });
        wx.showToast({ title: '已删除', icon: 'success' });
      })
      .catch(err => {
        wx.hideLoading();
        wx.showToast({ title: err.message || '删除失败', icon: 'none' });
      });
  },

  removeGroupFromItems: function(groupId) {
    let allItems = wx.getStorageSync('favorites') || [];
    const newItems = allItems.map(item => {
      if (item.groupIds && item.groupIds.includes(groupId)) {
        return {
          ...item,
          groupIds: item.groupIds.filter(gid => gid !== groupId)
        };
      }
      return item;
    });
    wx.setStorageSync('favorites', newItems);
  },
  // ==================== 分组功能逻辑结束 ====================

  // 初始化期权报价系统
  initPricingSystem: function() {
    this.pricingSystem = new OptionPricingSystem();
    this.pricingSystem.setUpdateCallback(() => {
      const raw = this.pricingSystem.getOptionQuotes({});
      const mapped = this.normalizeSystemQuotes(raw);
      this.setData({ optionQuotes: mapped, loading: false });
      this.applyFilters();
    });
    this.pricingSystem.setQuoteUpdateCallback((inquiry) => {
      this.setData({ loading: false });
    });
  },

  normalizeSystemQuotes: function(list) {
    const price = this.data.currentStock.price || this.data.currentStock.currentPrice || 1;
    const termDays = { '1个月': 30, '3个月': 90, '6个月': 180, '12个月': 365, '1年': 365 };
    return (list || []).map(item => {
      const termLabel = item.term === '12个月' ? '1年' : item.term;
      const days = termDays[termLabel] || termDays[item.term] || 30;
      const optionType = item.direction === '看涨' ? '看涨' : '看跌';
      const trader = item.trader ? { code: item.trader.code, name: item.trader.name } : { code: 'BEST', name: '最优报价' };
      const premiumPercent = ((Number(item.premium) / Number(price)) * 100).toFixed(2);
      return {
        id: item.id,
        optionType,
        expiryTerm: termLabel,
        expiryDays: days,
        strikePrice: Number(item.strikePrice),
        premium: Number(item.premium),
        premiumPercent,
        moneyness: this.getMoneyness((Number(item.strikePrice) / Number(price))),
        trader,
        bidPrice: (Number(item.premium) * 0.98).toFixed(2),
        askPrice: (Number(item.premium) * 1.02).toFixed(2),
        updateTime: new Date().toLocaleTimeString('zh-CN', { hour12: false })
      };
    });
  },

  // 加载期权报价数据
  loadOptionQuotes: function() {
    this.setData({ loading: true });
    
    const { currentStock } = this.data;
    const stockCode = currentStock.code.split('.')[0]; // 去掉后缀进行查询
    
    // 如果是“个股”模式，尝试从云数据库获取
    if (this.data.currentTab === '个股') {
      const db = wx.cloud.database();
      // 查询该股票的所有期权报价
      // 构建查询条件，支持香草数据筛选
      const queryCondition = { stock_code: stockCode };
      // bizType: 'vanilla' 对应 type: '香草'
      if (this.data.bizType === 'vanilla') {
        queryCondition.type = '香草';
      }
      console.log('[loadOptionQuotes] 查询条件:', queryCondition, 'bizType:', this.data.bizType);
      
      db.collection('quotes').where(queryCondition).limit(100).get().then(res => {
        console.log('[loadOptionQuotes] 从云数据库获取到报价:', res.data, '共', res.data?.length, '条');
        if (res.data && res.data.length > 0) {
           // 使用真实数据
           this.transformToMatrix(res.data);
           // 更新时间（从数据中取最新更新时间）
           const latestUpdate = res.data.reduce((max, item) => {
             const itemTime = new Date(item.updated_at || 0).getTime();
             return itemTime > max ? itemTime : max;
           }, 0);
           if (latestUpdate > 0) {
             const updateTime = new Date(latestUpdate);
             const formattedTime = `${updateTime.getFullYear()}/${String(updateTime.getMonth() + 1).padStart(2, '0')}/${String(updateTime.getDate()).padStart(2, '0')} ${String(updateTime.getHours()).padStart(2, '0')}:${String(updateTime.getMinutes()).padStart(2, '0')}更新`;
             this.setData({ updateTime: formattedTime });
           }
        } else {
           // 无香草数据时的提示
           console.log('[loadOptionQuotes] 未找到香草数据，使用降级数据');
           const quotes = this.generateRealisticQuotes(currentStock);
           this.transformToMatrix(quotes);
        }
        this.setData({ loading: false });
      }).catch(err => {
        console.error('获取期权报价失败:', err);
        const quotes = this.generateRealisticQuotes(currentStock);
        this.transformToMatrix(quotes);
        this.setData({ loading: false });
      });
    } else {
      const quotes = this.generateRealisticQuotes(currentStock);
      this.setData({
        optionQuotes: quotes,
        loading: false
      });
    }
  },
  
  // 生成真实的期权报价数据
  generateRealisticQuotes: function(stock) {
    const quotes = [];
    const basePrice = stock.price;
    
    // 期权类型和期限
    const optionTypes = ['看涨', '看跌'];
    const expiryTerms = [
      { label: '1个月', days: 30, code: '1M' },
      { label: '3个月', days: 90, code: '3M' },
      { label: '6个月', days: 180, code: '6M' },
      { label: '1年', days: 365, code: '1Y' }
    ];
    
    // 执行价水平（相对于现价）
    const strikeRatios = [0.90, 0.95, 1.00, 1.05, 1.10];
    
    optionTypes.forEach(optionType => {
      expiryTerms.forEach(term => {
        strikeRatios.forEach((ratio, index) => {
          const strikePrice = (basePrice * ratio).toFixed(2);
          const isCall = optionType === '看涨';
          const moneyness = this.getMoneyness(ratio);
          
          // 计算期权费
          const premium = this.calculateOptionPremium(basePrice, strikePrice, term.days, isCall);
          
          // 随机选择交易商
          const randomTrader = this.getRandomTrader();
          
          quotes.push({
            id: `${optionType}_${term.code}_${ratio}`,
            optionType: optionType,
            expiryTerm: term.label,
            expiryDays: term.days,
            strikePrice: parseFloat(strikePrice),
            premium: premium,
            premiumPercent: ((premium / basePrice) * 100).toFixed(2),
            moneyness: moneyness,
            trader: randomTrader,
            bidPrice: (premium * 0.98).toFixed(2),
            askPrice: (premium * 1.02).toFixed(2),
            volume: Math.floor(Math.random() * 1000 + 100),
            openInterest: Math.floor(Math.random() * 5000 + 500),
            impliedVol: (15 + Math.random() * 30).toFixed(1),
            delta: this.calculateDelta(isCall, ratio),
            gamma: (Math.random() * 0.05).toFixed(4),
            theta: (-(Math.random() * 0.1 + 0.01)).toFixed(4),
            vega: (Math.random() * 0.3 + 0.1).toFixed(3),
            updateTime: new Date().toLocaleTimeString('zh-CN', { hour12: false })
          });
        });
      });
    });
    
    return quotes.sort((a, b) => a.premium - b.premium);
  },

  // 获取期权价值状态
  getMoneyness: function(ratio) {
    if (ratio < 0.98) return 'ITM'; // 实值
    if (ratio > 1.02) return 'OTM'; // 虚值  
    return 'ATM'; // 平值
  },
  
  // 计算期权费
  calculateOptionPremium: function(spot, strike, days, isCall) {
    const S = parseFloat(spot);
    const K = parseFloat(strike);
    const T = days / 365;
    const r = 0.03; // 无风险利率
    const sigma = 0.25 + Math.random() * 0.15; // 波动率
    
    // 简化的Black-Scholes公式
    const d1 = (Math.log(S/K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    
    let premium;
    if (isCall) {
      premium = S * this.normalCDF(d1) - K * Math.exp(-r * T) * this.normalCDF(d2);
    } else {
      premium = K * Math.exp(-r * T) * this.normalCDF(-d2) - S * this.normalCDF(-d1);
    }
    
    return Math.max(0.01, premium).toFixed(2);
  },
  
  // 正态分布累积函数（简化版）
  normalCDF: function(x) {
    return 0.5 * (1 + this.erf(x / Math.sqrt(2)));
  },
  
  // 误差函数近似
  erf: function(x) {
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;
    
    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);
    
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    
    return sign * y;
  },
  
  // 计算Delta
  calculateDelta: function(isCall, strikeRatio) {
    let delta;
    if (isCall) {
      delta = strikeRatio < 1 ? 0.6 + Math.random() * 0.3 : 0.2 + Math.random() * 0.4;
    } else {
      delta = -(strikeRatio < 1 ? 0.2 + Math.random() * 0.4 : 0.6 + Math.random() * 0.3);
    }
    return delta.toFixed(3);
  },
  
  // 获取随机交易商
  getRandomTrader: function() {
    const traders = this.data.traders.filter(t => t.code !== 'ALL');
    return traders[Math.floor(Math.random() * traders.length)];
  },
  // 切换报价日期
  onQuoteDateChange: function(e) {
    const selectedDate = e.currentTarget.dataset.date;
    const quoteDates = this.data.quoteDates.map(date => ({
      ...date,
      isActive: date.label === selectedDate.label
    }));
    
    this.setData({
      quoteDates: quoteDates,
      selectedQuoteDate: selectedDate.label,
      showDatePicker: false
    });
    
    this.loadOptionQuotes();
    
    wx.showToast({
      title: `已切换到${selectedDate.label}`,
      icon: 'success',
      duration: 1500
    });
  },
  
  // 切换交易商 (组件回调)
  onTraderChangeFromComponent: function(e) {
    const { value, label } = e.detail;
    
    // 更新选中状态
    const traders = this.data.traders.map(trader => ({
      ...trader,
      isActive: trader.code === value
    }));
    
    this.setData({
      traders: traders,
      selectedTrader: label,
      selectedTraderCode: value
    });
    
    this.filterQuotesByTrader(value);
    
    wx.showToast({
      title: `已筛选${label}`,
      icon: 'success',
      duration: 1500
    });
  },

  // 切换交易商 (旧)
  onTraderChange: function(e) {
    const selectedTrader = e.currentTarget.dataset.trader;
    const traders = this.data.traders.map(trader => ({
      ...trader,
      isActive: trader.name === selectedTrader.name
    }));
    
    this.setData({
      traders: traders,
      selectedTrader: selectedTrader.name,
      showTraderPicker: false
    });
    
    this.filterQuotesByTrader(selectedTrader.code);
    
    wx.showToast({
      title: `已筛选${selectedTrader.name}`,
      icon: 'success',
      duration: 1500
    });
  },
  
  // 按交易商筛选报价
  filterQuotesByTrader: function(traderCode) {
    if (traderCode === 'ALL') {
      this.loadOptionQuotes(); // 重新加载所有报价
      return;
    }
    
    const filteredQuotes = this.data.optionQuotes.filter(quote => 
      quote.trader.code === traderCode
    );
    
    this.setData({
      optionQuotes: filteredQuotes
    });
  },
  
  // 显示/隐藏日期选择器
  toggleDatePicker: function() {
    this.setData({
      showDatePicker: !this.data.showDatePicker,
      showTraderPicker: false
    });
  },
  
  // 显示/隐藏交易商选择器
  toggleTraderPicker: function() {
    this.setData({
      showTraderPicker: !this.data.showTraderPicker,
      showDatePicker: false
    });
  },
  
  // 搜索股票
  onSearchStock: function() {
    this.goToSearchStock();
  },
  
  // 搜索输入
  onSearchInput: function(e) {
    this.setData({
      searchKeyword: e.detail.value
    });
  },
  
  // 执行搜索
  performSearch: function() {
    const keyword = this.data.searchKeyword.trim();
    if (!keyword) {
      wx.showToast({
        title: '请输入股票代码或名称',
        icon: 'none'
      });
      return;
    }
    
    this.setData({ loading: true });
    
    // 模拟搜索结果
    setTimeout(() => {
      const stockDatabase = {
        '000001': { name: '平安银行', price: 11.36 },
        '000002': { name: '万科A', price: 8.92 },
        '600036': { name: '招商银行', price: 35.67 },
        '600519': { name: '贵州茅台', price: 1678.90 },
        '000858': { name: '五粮液', price: 128.45 }
      };
      
      const stock = stockDatabase[keyword] || stockDatabase['000001'];
      const newStock = {
        code: keyword,
        name: stock.name,
        price: stock.price,
        change: (Math.random() * 2 - 1).toFixed(2),
        changePercent: (Math.random() * 4 - 2).toFixed(2)
      };
      
      newStock.displayText = `${newStock.price}  ${newStock.changePercent}%`;
      
      this.setData({
        currentStock: newStock,
        showSearch: false,
        searchKeyword: ''
      });
      
      this.loadOptionQuotes();
    }, 1000);
  },
  
  // 取消搜索
  cancelSearch: function() {
    this.setData({
      showSearch: false,
      searchKeyword: ''
    });
  },
  
  // 打开下单弹窗
  openOrderModal: function(e) {
    const quote = e.currentTarget.dataset.quote;
    const { currentStock } = this.data;
    const typeCode = quote && quote.optionType === '看涨' ? 'C' : 'P';
    const termCode = this.getTermCode(quote);
    const structure = `${Math.round(quote.strikePrice)}${typeCode} - ${termCode}`;
    this.setData({
      currentQuote: quote,
      showOrderModal: true,
      orderForm: {
        direction: '买入',
        traderCode: quote.trader.code,
        traderName: quote.trader.name,
        underlying: `${currentStock.name} ${currentStock.code}`,
        structure,
        premiumPercent: String(quote.premiumPercent || ''),
        notional: 100,
        buyPrice: ''
      }
    });
  },

  getTermCode: function(quote) {
    const map = { '1个月': '1M', '3个月': '3M', '6个月': '6M', '1年': '1Y', '12个月': '1Y' };
    if (quote && quote.expiryTerm && map[quote.expiryTerm]) return map[quote.expiryTerm];
    const days = quote && quote.expiryDays;
    if (typeof days === 'number') {
      if (days <= 30) return '1M';
      if (days <= 90) return '3M';
      if (days <= 180) return '6M';
      if (days <= 365) return '1Y';
    }
    return quote && quote.expiryTerm ? quote.expiryTerm : '1M';
  },

  closeOrderModal: function() {
    this.setData({ showOrderModal: false });
  },

  updateOrderField: function(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    const form = { ...this.data.orderForm, [field]: value };
    this.setData({ orderForm: form });
  },

  changeDirection: function(e) {
    const dirs = ['买入','卖出'];
    const idx = e.detail.value;
    const form = { ...this.data.orderForm, direction: dirs[idx] };
    this.setData({ orderForm: form });
  },

  confirmForwardText: function() {
    const text = this.generateOrderTextFromForm(this.data.orderForm);
    this.generateForwardTextImage(text);
    this.setData({ showOrderModal: false });
  },
  
  // 提交询价
  submitInquiry: function(quote) {
    if (!quote) {
      wx.showToast({ title: '询价信息不完整', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '提交询价中...' });
    
    // 获取用户信息
    const storedUserInfo = wx.getStorageSync('userInfo') || {};
    const loginService = require('../../utils/loginService.js');
    const currentUser = loginService.getCurrentUser() || {};
    
    // 组合用户信息
    const userInfo = {
      ...storedUserInfo,
      ...currentUser,
      userId: currentUser.userId || storedUserInfo.userId || 'anonymous_' + Date.now(),
      openid: currentUser.openid || storedUserInfo.openid || 'anonymous',
      nickname: currentUser.nickName || storedUserInfo.nickName || storedUserInfo.userInfo?.nickName || '匿名用户'
    };
    
    // 解析期权类型
    let optionType = 'call';
    if (quote.optionType) {
      if (quote.optionType.includes('看跌') || quote.optionType.toLowerCase().includes('put')) {
        optionType = 'put';
      }
    }
    
    // 构造提交数据（与inquiry页面格式保持一致）
    const submitData = {
      // 产品信息
      selectedProduct: {
        name: quote.underlyingAsset || quote.name || '未知标的',
        code: quote.code || quote.underlyingCode || '',
        type: 'stock'
      },
      productName: quote.underlyingAsset || quote.name || '未知标的',
      productCode: quote.code || quote.underlyingCode || '',
      
      // 询价参数
      optionType: optionType,
      structure: quote.structure || 'vanilla',
      term: quote.term || quote.maturity || '1M',
      notionalAmount: quote.notionalAmount || 100,
      strikePrice: quote.strikePrice || quote.strike || '100',
      selectedDealers: quote.trader ? [quote.trader.name || quote.trader] : [],
      
      // 报价信息
      premiumPercent: quote.premiumPercent || '',
      premium: quote.premium || '',
      
      // 联系信息
      contactName: storedUserInfo.nickName || storedUserInfo.userInfo?.nickName || '报价用户',
      phone: storedUserInfo.phone || '',
      contactPhone: storedUserInfo.phone || '',
      contactEmail: storedUserInfo.email || '',
      notes: `通过报价列表提交询价 - ${quote.optionType || '期权'}`,
      
      // 状态与时间
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      
      // 用户信息
      userId: userInfo.userId || userInfo.openid || 'anonymous_' + Date.now(),
      userName: userInfo.nickname || '报价用户',
      openid: userInfo.openid || 'anonymous',
      
      // 额外字段
      source: 'miniprogram_quotes',  // 标识来源为报价列表
      history: [],
      
      contactInfo: {
        name: storedUserInfo.nickName || storedUserInfo.userInfo?.nickName || '报价用户',
        phone: storedUserInfo.phone || '',
        email: storedUserInfo.email || ''
      }
    };
    
    console.log('报价列表提交询价数据:', submitData);
    
    // 通过云函数提交询价
    submitInquiry(submitData).then(result => {
      console.log('询价提交成功，ID:', result.data.inquiryId);
      wx.hideLoading();
      wx.showToast({
        title: '询价已提交',
        icon: 'success',
        duration: 2000
      });
      
      // 延迟跳转到询价中心（仅成功时跳转）
      setTimeout(() => {
        wx.navigateTo({
          url: '/subpackages/inquiry/inquiry/inquiry'
        });
      }, 1500);
    }).catch(err => {
      console.error('询价提交失败:', err);
      wx.hideLoading();
      // 失败时不跳转，保持在当前页面显示错误提示，让用户可以重新尝试
      wx.showToast({
        title: '提交失败：' + (err.message || '请检查网络后重试'),
        icon: 'none',
        duration: 3000
      });
      // 不跳转，用户可以修改信息后重新提交
    });
  },
  
  // 查看详情 - 跳转到股票详情页面
  onViewDetail: function(e) {
    const item = e.currentTarget.dataset.item;

    // 如果处于编辑模式，点击行切换选中状态
    if (this.data.isEditing) {
      // 构造一个模拟事件对象传给 toggleSelection，或者直接调用逻辑
      // toggleSelection 需要 dataset.code
      const code = item.code;
      // 复用 toggleSelection 逻辑
      this.toggleSelection({ currentTarget: { dataset: { code } } });
      return;
    }

    // 防重复点击机制
    if (this._lastViewDetailTime && Date.now() - this._lastViewDetailTime < 500) {
      return;
    }
    this._lastViewDetailTime = Date.now();

    // 验证股票数据
    if (!item || !item.code) {
      console.warn('[onViewDetail] 股票数据不完整:', item);
      wx.showToast({ title: '股票信息不完整', icon: 'none' });
      return;
    }

    // 提取股票信息
    const stockCode = item.code;
    const stockName = item.name || '未知股票';
    const price = item.price || '--';
    const change = item.change || 0;
    const changePercent = item.changePercent || 0;

    // URL 编码处理中文字符
    const encodedCode = encodeURIComponent(stockCode);
    const encodedName = encodeURIComponent(stockName);

    // 构造跳转 URL
    const targetUrl = `/subpackages/quotes/stock-detail/stock-detail?code=${encodedCode}&name=${encodedName}&price=${price}&change=${change}&changePercent=${changePercent}`;

    console.log('[onViewDetail] 跳转到股票详情:', { stockCode, stockName, price, changePercent });

    // 检查页面栈深度，防止超过10层限制
    const pages = getCurrentPages();
    const pageCount = pages.length;

    // 如果页面栈接近上限，尝试使用 redirectTo 替代 navigateTo
    if (pageCount >= 9) {
      console.warn('[onViewDetail] 页面栈接近上限，使用 redirectTo');
      wx.redirectTo({
        url: targetUrl,
        success: () => {
          console.log('[onViewDetail] redirectTo 成功');
        },
        fail: (err) => {
          console.error('[onViewDetail] redirectTo 失败:', err);
          // 如果 redirectTo 也失败，尝试 reLaunch
          wx.reLaunch({
            url: '/pages/quotes/quotes',
            fail: () => {
              wx.showToast({ title: '页面跳转失败', icon: 'none' });
            }
          });
        }
      });
      return;
    }

    // 执行页面跳转（带超时处理）
    let navigateCompleted = false;
    const navigateTimeout = setTimeout(() => {
      if (!navigateCompleted) {
        console.warn('[onViewDetail] 跳转超时，可能网络较慢');
        // 不立即显示错误，可能是分包加载中
      }
    }, 3000);

    wx.navigateTo({
      url: targetUrl,
      success: () => {
        navigateCompleted = true;
        clearTimeout(navigateTimeout);
        console.log('[onViewDetail] 成功跳转到股票详情页');
      },
      fail: (err) => {
        navigateCompleted = true;
        clearTimeout(navigateTimeout);
        console.error('[onViewDetail] 跳转失败:', err);

        // 根据错误类型处理
        if (err.errMsg && err.errMsg.includes('timeout')) {
          // 超时错误，可能是分包加载慢，提示用户
          wx.showToast({
            title: '页面加载中，请稍后重试',
            icon: 'none',
            duration: 2000
          });
        } else {
          // 其他错误，尝试使用 redirectTo
          wx.redirectTo({
            url: targetUrl,
            fail: () => {
              wx.showToast({
                title: '跳转失败，请重试',
                icon: 'none',
                duration: 2000
              });
            }
          });
        }
      }
    });
  },

  // 跳转到龙虎榜页面
  onGoToRankList: function() {
    wx.navigateTo({
      url: '/pages/rank-list/rank-list',
      fail: (err) => {
        console.error('[onGoToRankList] 跳转失败:', err);
        wx.showToast({
          title: '龙虎榜页面开发中',
          icon: 'none',
          duration: 2000
        });
      }
    });
  },

  // 刷新报价
  refreshQuotes: async function() {
    // 节流控制
    const now = Date.now();
    if (_isRefreshing || now - _lastRefreshTime < REFRESH_THROTTLE_MS) {
      console.log('[刷新] 节流跳过');
      return;
    }
    
    _isRefreshing = true;
    _lastRefreshTime = now;
    this.setData({ loading: true, isPullRefreshing: true });
    
    try {
      const { currentTab } = this.data;
      
      switch (currentTab) {
        case '自选':
          await this.loadWatchlist();
          break;
        case '个股':
          // 重置分页
          this.setData({ 'currentPage.hotStocks': 1, hasMoreHotStocks: true });
          await this.loadHotStocks();
          break;
        case '指数':
          await this.loadIndexData();
          break;
        case 'ETF':
          await this.loadEtfData();
          break;
      }
      
      this.setData({ lastUpdateTime: Date.now() });
      
      wx.showToast({
        title: '数据已更新',
        icon: 'success',
        duration: 1500
      });
    } catch (error) {
      console.error('[刷新] 失败:', error);
      wx.showToast({
        title: '刷新失败，请重试',
        icon: 'none',
        duration: 2000
      });
    } finally {
      _isRefreshing = false;
      this.setData({ loading: false, isPullRefreshing: false });
      wx.stopPullDownRefresh();
    }
  },
  
  // 下拉刷新
  onPullDownRefresh: function() {
    this.refreshQuotes();
  },
  
  // 加载更多数据（用于滚动加载）
  onLoadMore: async function() {
    const { currentTab, hasMoreHotStocks, hasMoreIndexQuotes, hasMoreEtfQuotes } = this.data;
    
    if (currentTab === '个股' && hasMoreHotStocks) {
      const result = await quotesDataManager.loadMoreHotStocks();
      if (result && result.data && result.data.length > 0) {
        const newHotStocks = [...this.data.hotStocks, ...result.data];
        this.setData({
          hotStocks: newHotStocks,
          hasMoreHotStocks: result.hasMore
        });
      }
    }
    // 指数和ETF数据量较小，暂不需要分页
  },
  
  // 触底加载更多
  onReachBottom: function() {
    this.onLoadMore();
  },
  
  // 联系客服
  contactService: function() {
    wx.showModal({
      title: '专属客服',
      content: '添加您的专属客服。\n\n客服微信：optionservice\n客服电话：400-888-8888',
      confirmText: '复制微信',
      success: (res) => {
        if (res.confirm) {
          wx.setClipboardData({
            data: 'optionservice',
            success: () => {
              wx.showToast({
                title: '微信号已复制',
                icon: 'success'
              });
            }
          });
        }
      }
    });
  },



  applyFilters: function() {
    let filteredQuotes = [...this.data.optionQuotes];
    const { optionType, timeToExpiry, moneyness } = this.data.filterOptions;
    const selectedTrader = this.data.selectedTrader;
    if (optionType !== 'ALL') {
      filteredQuotes = filteredQuotes.filter(quote => {
        if (optionType === 'VANILLA') {
          return quote.optionType.includes('看涨') || quote.optionType.includes('看跌');
        } else if (optionType === 'SNOWBALL') {
          return quote.optionType.includes('雪球');
        }
        return true;
      });
    }
    if (timeToExpiry !== 'ALL') {
      filteredQuotes = filteredQuotes.filter(quote => {
        const days = quote.expiryDays;
        switch (timeToExpiry) {
          case '1M': return days <= 30;
          case '3M': return days <= 90;
          case '6M': return days <= 180;
          case '1Y': return days <= 365;
          default: return true;
        }
      });
    }
    if (moneyness !== 'ALL') {
      filteredQuotes = filteredQuotes.filter(quote => quote.moneyness === moneyness);
    }
    if (selectedTrader && selectedTrader !== '全部交易商') {
      filteredQuotes = filteredQuotes.filter(quote => quote.trader && quote.trader.name === selectedTrader);
    }
    this.setData({ optionQuotes: filteredQuotes, loading: false });
  },

  // 刷新报价
  refreshPricing: function() {
    if (this.pricingSystem) {
      this.setData({ loading: true });
      this.pricingSystem.refreshPricing();
    }
  },

  // 询价 - 跳转到询价表单页面
  onInquiry: function(e) {
    const loginService = require('../../utils/loginService.js');
    const isLoggedIn = loginService.isLoggedIn();

    // 获取当前标的资产信息
    const index = e.currentTarget.dataset.index;
    const item = this.data.pricingData[index] || this.data.currentStock;

    if (!item || !item.code) {
      // 如果没有选中标的，提示用户选择
      wx.showToast({
        title: '请先选择标的资产',
        icon: 'none'
      });
      return;
    }

    // 构造标的信息
    const productInfo = {
      name: item.name || item.underlyingAsset || '',
      code: item.code || '',
      type: 'stock',
      price: item.price || item.currentPrice || ''
    };

    // 可选：解析已有的期权参数
    const inquiryParams = {
      product: productInfo,
      optionType: item.optionType?.includes('Put') || item.optionType?.includes('P') ? 'put' : 'call',
      strikePrice: item.strikePrice || item.strike || '100',
      term: item.term || item.maturity || '1M'
    };

    // 跳转到询价表单页面
    const encodedParams = encodeURIComponent(JSON.stringify(inquiryParams));
    wx.navigateTo({
      url: `/subpackages/inquiry/inquiry/inquiry?params=${encodedParams}`,
      fail: (err) => {
        console.error('跳转询价表单失败:', err);
        wx.showToast({
          title: '页面跳转失败，请重试',
          icon: 'none'
        });
      }
    });
  },

  // 查看详情
  // onViewDetail 已合并到上文，移除此重复定义
  // onViewDetail: function(e) {
  //   const index = e.currentTarget.dataset.index;
  //   const item = this.data.pricingData[index];
  //   
  //   wx.navigateTo({
  //     url: '/pages/detail/detail?data=' + encodeURIComponent(JSON.stringify(item))
  //   });
  // },

  // 显示高级筛选
  showAdvancedFilter: function() {
    this.setData({
      showAdvancedFilter: true
    });
  },

  // 隐藏高级筛选
  hideAdvancedFilter: function() {
    this.setData({
      showAdvancedFilter: false
    });
  },

  // 排序功能
  onSortChange: function(e) {
    const sortBy = e.currentTarget.dataset.sort;
    let sortOrder = 'asc';
    
    if (this.data.sortBy === sortBy) {
      sortOrder = this.data.sortOrder === 'asc' ? 'desc' : 'asc';
    }
    
    this.setData({
      sortBy: sortBy,
      sortOrder: sortOrder
    });
    
    this.applySorting();
  },

  // 应用排序
  applySorting: function() {
    const { sortBy, sortOrder } = this.data;
    let sortedData = [...this.data.pricingData];
    
    sortedData.sort((a, b) => {
      let valueA, valueB;
      
      switch (sortBy) {
        case 'premium':
          valueA = parseFloat(a.bidPrice || 0);
          valueB = parseFloat(b.bidPrice || 0);
          break;
        case 'volume':
          valueA = Math.random() * 1000; // 模拟交易量
          valueB = Math.random() * 1000;
          break;
        case 'time':
          valueA = new Date(a.updateTime).getTime();
          valueB = new Date(b.updateTime).getTime();
          break;
        case 'greeks':
          valueA = parseFloat(a.greeks?.delta || 0);
          valueB = parseFloat(b.greeks?.delta || 0);
          break;
        default:
          return 0;
      }
      
      if (sortOrder === 'asc') {
        return valueA - valueB;
      } else {
        return valueB - valueA;
      }
    });
    
    this.setData({
      pricingData: sortedData
    });
  },

  // 高级筛选应用
  applyAdvancedFilters: function() {
    // 这里可以添加复杂的筛选逻辑
    wx.showToast({
      title: '筛选已应用',
      icon: 'success'
    });
    
    this.hideAdvancedFilter();
  },

  // 查看价格趋势图
  viewPriceChart: function(e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.pricingData[index];
    
    wx.navigateTo({
      url: `/pages/chart/chart?data=${encodeURIComponent(JSON.stringify(item))}`
    });
  },

  // 下拉刷新
  onPullDownRefresh: function() {
    this.refreshPricing();
    setTimeout(() => {
      wx.stopPullDownRefresh();
    }, 1000);
  },

  // 选择期权类型
  selectOptionType: function(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      'filterOptions.optionType': type
    });
    this.applyFilters();
  },

  // 应用筛选条件
  applyFilters: function() {
    let filteredQuotes = [...this.data.optionQuotes];
    const { optionType, timeToExpiry, moneyness } = this.data.filterOptions;
    
    // 按期权类型筛选
    if (optionType !== 'ALL') {
      filteredQuotes = filteredQuotes.filter(quote => {
        if (optionType === 'VANILLA') {
          return quote.optionType.includes('看涨') || quote.optionType.includes('看跌');
        } else if (optionType === 'SNOWBALL') {
          return quote.optionType.includes('雪球');
        }
        return true;
      });
    }
    
    // 按到期时间筛选
    if (timeToExpiry !== 'ALL') {
      filteredQuotes = filteredQuotes.filter(quote => {
        const days = quote.expiryDays;
        switch (timeToExpiry) {
          case '1M': return days <= 30;
          case '3M': return days <= 90;
          case '6M': return days <= 180;
          case '1Y': return days <= 365;
          default: return true;
        }
      });
    }
    
    // 按价值状态筛选
    if (moneyness !== 'ALL') {
      filteredQuotes = filteredQuotes.filter(quote => quote.moneyness === moneyness);
    }
    
    this.setData({
      optionQuotes: filteredQuotes
    });
  },

  // 生成下单文本
  generateOrderText: function(quote) {
    const { currentStock } = this.data;
    const currentTime = new Date().toLocaleString('zh-CN');
    
    const orderText = `【场外期权询价】
标的：${currentStock.name} (${currentStock.code})
现价：${currentStock.price}元 (${currentStock.changePercent}%)
期权类型：${quote.optionType}
执行价：${quote.strikePrice}元
期限：${quote.expiryTerm}
期权费：${quote.premium}元 (${quote.premiumPercent}%)
交易商：${quote.trader.name}
询价时间：${currentTime}

注：以上报价仅供参考，具体以交易商确认为准。`;
    
    return orderText;
  },

  // 根据弹窗表单生成转发文本
  generateOrderTextFromForm: function(form) {
    const { currentStock } = this.data;
    const time = new Date().toLocaleString('zh-CN');
    const buyPriceText = form.buyPrice ? `${form.buyPrice}元` : '市价';
    const premiumAmount = (Number(form.notional) * Number(form.premiumPercent) / 100).toFixed(2);
    
    const text = `【场外期权下单】
标的资产：${form.underlying}
当前价格：${currentStock.price}元 (${currentStock.changePercent}%)
方向：${form.direction}
交易商：${form.traderName}
结构期限：${form.structure}
期权费率：${form.premiumPercent}%
预计期权费：${premiumAmount}万元
名义本金：${form.notional}万元
买入价格：${buyPriceText}
询价时间：${time}

注：以上报价仅供参考，具体以交易商确认为准。`;
    return text;
  },

  // 生成转发文本图片
  generateForwardTextImage: function(orderText) {
    const query = wx.createSelectorQuery();
    query.select('#forwardCanvas2d').node().exec((res) => {
      const node = res && res[0] && res[0].node;
      if (node) {
        const canvas = node;
        const w = 600;
        const h = 800;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 2;
        ctx.strokeRect(10, 10, w - 20, h - 20);
        ctx.font = '24px sans-serif';
        ctx.fillStyle = '#333333';
        ctx.textAlign = 'center';
        ctx.fillText('场外期权询价单', w / 2, 50);
        ctx.strokeStyle = '#ff6b35';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(50, 70);
        ctx.lineTo(w - 50, 70);
        ctx.stroke();
        ctx.font = '16px sans-serif';
        ctx.fillStyle = '#666666';
        ctx.textAlign = 'left';
        const lines = orderText.split('\n');
        let y = 100;
        lines.forEach((line) => { const t = String(line || '').trim(); if (t) { ctx.fillText(t, 30, y); y += 30; } });
        ctx.font = '14px sans-serif';
        ctx.fillStyle = '#999999';
        ctx.textAlign = 'center';
        ctx.fillText('长按识别二维码联系客服', w / 2, h - 60);
        ctx.fillText('专业场外期权服务', w / 2, h - 40);
        wx.canvasToTempFilePath({ canvas, success: (r) => { this.setData({ forwardImagePath: r.tempFilePath }); this.showForwardImagePreview(r.tempFilePath); }, fail: () => { wx.showToast({ title: '生成图片失败', icon: 'none' }); } });
      } else {
        const ctx = wx.createCanvasContext('forwardCanvas', this);
        const w = 600;
        const h = 800;
        ctx.setFillStyle('#ffffff');
        ctx.fillRect(0, 0, w, h);
        ctx.setStrokeStyle('#e0e0e0');
        ctx.setLineWidth(2);
        ctx.strokeRect(10, 10, w - 20, h - 20);
        ctx.setFontSize(24);
        ctx.setFillStyle('#333333');
        ctx.setTextAlign('center');
        ctx.fillText('场外期权询价单', w / 2, 50);
        ctx.setStrokeStyle('#ff6b35');
        ctx.setLineWidth(3);
        ctx.beginPath();
        ctx.moveTo(50, 70);
        ctx.lineTo(w - 50, 70);
        ctx.stroke();
        ctx.setFontSize(16);
        ctx.setFillStyle('#666666');
        ctx.setTextAlign('left');
        const lines = orderText.split('\n');
        let y = 100;
        lines.forEach((line) => { if (String(line || '').trim()) { ctx.fillText(String(line).trim(), 30, y); y += 30; } });
        ctx.setFontSize(14);
        ctx.setFillStyle('#999999');
        ctx.fillText('长按识别二维码联系客服', w / 2, h - 60);
        ctx.fillText('专业场外期权服务', w / 2, h - 40);
        ctx.draw(false, () => { wx.canvasToTempFilePath({ canvasId: 'forwardCanvas', success: (r) => { this.setData({ forwardImagePath: r.tempFilePath }); this.showForwardImagePreview(r.tempFilePath); }, fail: () => { wx.showToast({ title: '生成图片失败', icon: 'none' }); } }, this); });
      }
    });
  },

  // 显示转发图片预览
  showForwardImagePreview: function(imagePath) {
    wx.previewImage({
      urls: [imagePath],
      current: imagePath,
      success: () => {
        // 显示操作菜单
        wx.showActionSheet({
          itemList: ['保存图片', '发送给朋友', '复制文本'],
          success: (res) => {
            switch (res.tapIndex) {
              case 0:
                // 保存图片到相册
                this.saveForwardImage(imagePath);
                break;
              case 1:
                // 分享给朋友（通过小程序分享功能）
                this.shareForwardImage(imagePath);
                break;
              case 2:
                // 复制文本
                this.copyOrderText();
                break;
            }
          }
        });
      }
    });
  },

  // 保存转发图片
  saveForwardImage: function(imagePath) {
    wx.saveImageToPhotosAlbum({
      filePath: imagePath,
      success: () => {
        wx.showToast({
          title: '图片已保存到相册',
          icon: 'success'
        });
      },
      fail: () => {
        wx.showToast({
          title: '保存失败，请检查权限',
          icon: 'none'
        });
      }
    });
  },

  // 分享转发图片
  shareForwardImage: function(imagePath) {
    // 这里可以实现小程序的分享功能
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
    
    wx.showToast({
      title: '请点击右上角分享按钮',
      icon: 'none'
    });
  },

  // 复制订单文本
  copyOrderText: function() {
    const orderText = this.generateOrderText(this.data.currentQuote);
    
    wx.setClipboardData({
      data: orderText,
      success: () => {
        wx.showToast({
          title: '文本已复制',
          icon: 'success'
        });
      }
    });
  },

  // 从表单复制订单文本
  copyOrderTextFromForm: function() {
    const orderText = this.generateOrderTextFromForm(this.data.orderForm);
    
    wx.setClipboardData({
      data: orderText,
      success: () => {
        wx.showToast({
          title: '下单文本已复制',
          icon: 'success'
        });
        this.setData({ showOrderModal: false });
      }
    });
  },

  // 返回上一页
  goBack: function() {
    // 检查页面栈深度，防止返回到不存在的页面
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      // 如果当前是第一个页面，则跳转到首页
      wx.switchTab({
        url: '/pages/index/index'
      });
    }
  },

  // 打开计算器
  openCalculator: function() {
    wx.navigateTo({
      url: '/pages/calculator/calculator'
    });
  },

  // 打开工作台
  openWorkspace: function() {
    wx.navigateTo({
      url: '/pages/workspace/workspace'
    });
  },

  // 跳转到搜索股票页面（添加自选）
  goToSearchStock: function() {
    // 修正：使用分包正确路径
    const url = '/subpackages/quotes/search/search?source=quotes';
    wx.navigateTo({
      url,
      fail: () => {
        wx.redirectTo({
          url,
          fail: () => {
            wx.showToast({ title: '打开搜索页失败', icon: 'none' });
          }
        });
      }
    });
  },

  // 检查收藏状态
  checkFavoriteStatus: function() {
    const { currentStock } = this.data;
    if (!currentStock.code) return;
    
    // 获取现有收藏 (统一使用 INQUIRY_FAVORITES_V1)
    const favoritesMap = wx.getStorageSync(FAVORITES_STORAGE_KEY) || {};
    
    // 检查是否已收藏
    const isFavorited = !!favoritesMap[currentStock.code];
    
    this.setData({ isFavorited });
  },

  // 切换收藏状态
  toggleFavorite: function() {
    const { currentStock, isFavorited } = this.data;
    if (!currentStock.code) return;

    const favoritesMap = wx.getStorageSync(FAVORITES_STORAGE_KEY) || {};
    
    if (!isFavorited) {
      // 添加收藏
      favoritesMap[currentStock.code] = { 
        groupId: 'holding', // 默认分到持仓
        name: currentStock.name,
        code: currentStock.code,
        price: currentStock.price,
        changePercent: currentStock.changePercent,
        addedTime: Date.now()
      };
      wx.showToast({ title: '已添加到自选', icon: 'success' });
    } else {
      // 移除收藏
      delete favoritesMap[currentStock.code];
      wx.showToast({ title: '已从自选移除', icon: 'success' });
    }
    
    wx.setStorageSync(FAVORITES_STORAGE_KEY, favoritesMap);
    this.setData({ isFavorited: !isFavorited });
    
    // 同步更新旧的 'favorites' key 以保持兼容
    this.syncToOldFavorites(favoritesMap);
  },

  // 同步到旧的数组格式存储，保持向下兼容
  syncToOldFavorites: function(map) {
    const list = Object.keys(map).map(id => ({
      id,
      ...map[id]
    }));
    wx.setStorageSync('favorites', list);
  },

  // === 新增交互方法 ===
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
    
    // 如果切换出自选Tab，取消编辑模式
    if (tab !== '自选' && this.data.isEditing) {
      this.cancelEditing();
    }

    // 如果切换到个股Tab，加载热门个股数据
    if (tab === '个股') {
      this.loadHotStocks();
    }

    // 如果切换到指数Tab，加载指数数据
    if (tab === '指数') {
      this.loadIndexData();
    }

    // 如果切换到ETFTab，加载ETF数据
    if (tab === 'ETF') {
      this.loadEtfData();
    }
  },
  onSubFilterChange(e) {
    this.setData({ subFilter: e.currentTarget.dataset.filter });
  }
});
