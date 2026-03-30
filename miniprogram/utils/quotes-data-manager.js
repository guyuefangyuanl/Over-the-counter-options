/**
 * 报价数据加载管理器
 * 统一管理报价页面的数据加载、缓存、刷新和更新逻辑
 * 
 * 核心功能：
 * 1. 按需加载不同Tab数据（自选、个股、指数、ETF）
 * 2. 智能缓存与请求去重
 * 3. 实时报价更新机制（节流控制）
 * 4. 分页与下拉刷新支持
 * 5. 统一的错误处理与状态管理
 */

const { DataCacheManager, CACHE_PREFIX, DEFAULT_TTL } = require('./data-cache.js');
const quotesApi = require('./api-quotes.js');
const favoritesService = require('./favoritesService.js');

// 缓存键扩展
const QUOTES_CACHE_PREFIX = {
  WATCHLIST_QUOTES: 'watchlist_quotes',
  HOT_STOCKS: 'hot_stocks',
  INDEX_QUOTES: 'index_quotes',
  ETF_QUOTES: 'etf_quotes',
  STOCK_DETAIL: 'stock_detail',
  OPTION_MATRIX: 'option_matrix'
};

// TTL配置（毫秒）
const QUOTES_TTL = {
  WATCHLIST_QUOTES: 30 * 1000,     // 30秒（自选数据实时性要求高）
  HOT_STOCKS: 60 * 1000,           // 1分钟
  INDEX_QUOTES: 60 * 1000,         // 1分钟
  ETF_QUOTES: 60 * 1000,           // 1分钟
  STOCK_DETAIL: 30 * 1000,         // 30秒
  OPTION_MATRIX: 120 * 1000        // 2分钟（期权矩阵数据更新较慢）
};

// 实时更新配置
const REALTIME_CONFIG = {
  UPDATE_INTERVAL: 10000,          // 10秒更新间隔
  THROTTLE_INTERVAL: 5000,         // 5秒节流间隔
  MAX_RETRY_COUNT: 3,              // 最大重试次数
  RETRY_DELAY: 2000                // 重试延迟
};

// 分页配置
const PAGE_CONFIG = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
  PRELOAD_THRESHOLD: 5             // 预加载阈值（剩余多少条时触发）
};

/**
 * 报价数据管理器类
 */
class QuotesDataManager {
  constructor() {
    // 加载状态
    this.loadingStates = {
      watchlist: false,
      hotStocks: false,
      indexQuotes: false,
      etfQuotes: false,
      stockDetail: false
    };

    // 分页状态
    this.pageStates = {
      hotStocks: { page: 1, pageSize: 20, hasMore: true, total: 0 },
      indexQuotes: { page: 1, pageSize: 20, hasMore: true, total: 0 },
      etfQuotes: { page: 1, pageSize: 20, hasMore: true, total: 0 }
    };

    // 实时更新定时器
    this.updateTimers = {
      watchlist: null,
      hotStocks: null
    };

    // 更新回调函数
    this.updateCallbacks = new Map();

    // 上次更新时间戳
    this.lastUpdateTimes = {};

    // 错误计数
    this.errorCounts = {};

    // 网络状态监听
    this._initNetworkListener();
  }

  /**
   * 初始化网络状态监听
   * @private
   */
  _initNetworkListener() {
    wx.onNetworkStatusChange((res) => {
      if (res.isConnected) {
        console.log('[报价管理器] 网络恢复，重新同步数据');
        this._resyncAfterNetworkRecovery();
      } else {
        console.log('[报价管理器] 网络断开，暂停实时更新');
        this._pauseRealtimeUpdates();
      }
    });
  }

  /**
   * 网络恢复后重新同步
   * @private
   */
  _resyncAfterNetworkRecovery() {
    // 清除过期缓存
    this.clearExpiredCache();
    // 重新启动实时更新
    this._resumeRealtimeUpdates();
  }

  /**
   * 暂停实时更新
   * @private
   */
  _pauseRealtimeUpdates() {
    Object.keys(this.updateTimers).forEach(key => {
      if (this.updateTimers[key]) {
        clearInterval(this.updateTimers[key]);
        this.updateTimers[key] = null;
      }
    });
  }

  /**
   * 恢复实时更新
   * @private
   */
  _resumeRealtimeUpdates() {
    // 根据当前激活的Tab恢复更新
    if (this.updateCallbacks.has('watchlist')) {
      this.startWatchlistRealtimeUpdate();
    }
    if (this.updateCallbacks.has('hotStocks')) {
      this.startHotStocksRealtimeUpdate();
    }
  }

  /**
   * 注册更新回调
   * @param {string} type 数据类型
   * @param {Function} callback 回调函数
   */
  registerCallback(type, callback) {
    this.updateCallbacks.set(type, callback);
  }

  /**
   * 取消注册回调
   * @param {string} type 数据类型
   */
  unregisterCallback(type) {
    this.updateCallbacks.delete(type);
    // 如果是实时更新类型，停止定时器
    if (this.updateTimers[type]) {
      clearInterval(this.updateTimers[type]);
      this.updateTimers[type] = null;
    }
  }

  // ==================== 自选列表数据加载 ====================

  /**
   * 加载自选列表数据（带缓存）
   * @param {Object} options 配置选项
   * @returns {Promise<Object>} 自选数据
   */
  async loadWatchlist(options = {}) {
    const { forceRefresh = false, term = '1M' } = options;

    // 防止重复加载
    if (this.loadingStates.watchlist && !forceRefresh) {
      console.log('[自选加载] 已有加载任务进行中，跳过');
      return { data: null, loading: true };
    }

    this.loadingStates.watchlist = true;

    try {
      // 1. 获取本地自选列表
      let favorites = favoritesService.getFavorites();

      // 空列表处理
      if (!favorites || favorites.length === 0) {
        this.loadingStates.watchlist = false;
        return { data: [], empty: true };
      }

      // 2. 提取股票代码
      const stockCodes = this._normalizeStockCodes(favorites);

      // 3. 尝试从缓存获取
      const cacheKey = `${QUOTES_CACHE_PREFIX.WATCHLIST_QUOTES}:${term}`;
      if (!forceRefresh) {
        const cached = DataCacheManager.get(cacheKey);
        if (cached) {
          // 合并自选列表与缓存的报价数据
          const mergedData = this._mergeWatchlistWithQuotes(favorites, cached);
          this.loadingStates.watchlist = false;
          return { data: mergedData, fromCache: true };
        }
      }

      // 4. 调用API获取期权报价
      const result = await this._fetchWithRetry(
        () => quotesApi.getBatchOptionQuotes(stockCodes, term, 'call'),
        'watchlist'
      );

      if (result && result.success && result.data && result.data.quotes) {
        // 缓存报价数据
        DataCacheManager.set(cacheKey, result.data.quotes, QUOTES_TTL.WATCHLIST_QUOTES);
        
        // 合并数据
        const mergedData = this._mergeWatchlistWithQuotes(favorites, result.data.quotes);
        this.lastUpdateTimes.watchlist = Date.now();
        
        return { data: mergedData, fromCache: false };
      } else {
        // API失败，使用降级数据
        const fallbackData = this._generateFallbackWatchlist(favorites);
        return { data: fallbackData, fallback: true };
      }
    } catch (error) {
      console.error('[自选加载] 加载失败:', error);
      this.errorCounts.watchlist = (this.errorCounts.watchlist || 0) + 1;
      
      // 返回降级数据
      const favorites = favoritesService.getFavorites();
      const fallbackData = this._generateFallbackWatchlist(favorites);
      return { data: fallbackData, error: error.message };
    } finally {
      this.loadingStates.watchlist = false;
    }
  }

  /**
   * 启动自选列表实时更新
   * @param {number} interval 更新间隔（毫秒）
   */
  startWatchlistRealtimeUpdate(interval = REALTIME_CONFIG.UPDATE_INTERVAL) {
    // 清除已有定时器
    if (this.updateTimers.watchlist) {
      clearInterval(this.updateTimers.watchlist);
    }

    // 节流控制：检查上次更新时间
    const startUpdate = async () => {
      const now = Date.now();
      const lastUpdate = this.lastUpdateTimes.watchlist || 0;
      
      if (now - lastUpdate < REALTIME_CONFIG.THROTTLE_INTERVAL) {
        return; // 节流跳过
      }

      const result = await this.loadWatchlist({ forceRefresh: true });
      
      // 触发回调
      if (this.updateCallbacks.has('watchlist')) {
        this.updateCallbacks.get('watchlist')(result);
      }
    };

    this.updateTimers.watchlist = setInterval(startUpdate, interval);
    console.log('[自选更新] 实时更新已启动，间隔:', interval);
  }

  /**
   * 停止自选列表实时更新
   */
  stopWatchlistRealtimeUpdate() {
    if (this.updateTimers.watchlist) {
      clearInterval(this.updateTimers.watchlist);
      this.updateTimers.watchlist = null;
      console.log('[自选更新] 实时更新已停止');
    }
  }

  // ==================== 热门个股数据加载 ====================

  /**
   * 加载热门个股数据（支持分页）
   * @param {Object} options 配置选项
   * @returns {Promise<Object>} 热门个股数据
   */
  async loadHotStocks(options = {}) {
    const { forceRefresh = false, page = 1, pageSize = PAGE_CONFIG.DEFAULT_PAGE_SIZE } = options;

    // 防止重复加载
    if (this.loadingStates.hotStocks && !forceRefresh && page === 1) {
      console.log('[热门个股] 已有加载任务进行中，跳过');
      return { data: null, loading: true };
    }

    this.loadingStates.hotStocks = true;

    try {
      // 尝试从缓存获取（仅首页）
      if (page === 1 && !forceRefresh) {
        const cached = DataCacheManager.get(QUOTES_CACHE_PREFIX.HOT_STOCKS);
        if (cached) {
          this.loadingStates.hotStocks = false;
          return { data: cached, fromCache: true, hasMore: true };
        }
      }

      // 调用API获取数据
      const result = await this._fetchWithRetry(
        () => this._fetchHotStocksFromAPI(page, pageSize),
        'hotStocks'
      );

      if (result && result.data) {
        // 更新分页状态
        this.pageStates.hotStocks = {
          page,
          pageSize,
          hasMore: result.hasMore !== false,
          total: result.total || 0
        };

        // 仅缓存首页数据
        if (page === 1) {
          DataCacheManager.set(QUOTES_CACHE_PREFIX.HOT_STOCKS, result.data, QUOTES_TTL.HOT_STOCKS);
        }

        this.lastUpdateTimes.hotStocks = Date.now();
        return { data: result.data, fromCache: false, hasMore: this.pageStates.hotStocks.hasMore };
      } else {
        // 使用模拟数据
        const mockData = this._generateMockHotStocks(page, pageSize);
        return { data: mockData, fallback: true, hasMore: mockData.hasMore };
      }
    } catch (error) {
      console.error('[热门个股] 加载失败:', error);
      this.errorCounts.hotStocks = (this.errorCounts.hotStocks || 0) + 1;
      
      // 返回模拟数据
      const mockData = this._generateMockHotStocks(page, pageSize);
      return { data: mockData.list, error: error.message, hasMore: mockData.hasMore };
    } finally {
      this.loadingStates.hotStocks = false;
    }
  }

  /**
   * 加载更多热门个股（分页）
   * @returns {Promise<Object>} 更多数据
   */
  async loadMoreHotStocks() {
    const currentState = this.pageStates.hotStocks;
    
    if (!currentState.hasMore) {
      return { data: [], hasMore: false };
    }

    const nextPage = currentState.page + 1;
    return this.loadHotStocks({ page: nextPage, pageSize: currentState.pageSize });
  }

  // ==================== 指数数据加载 ====================

  /**
   * 加载指数报价数据
   * @param {Object} options 配置选项
   * @returns {Promise<Object>} 指数数据
   */
  async loadIndexQuotes(options = {}) {
    const { forceRefresh = false, term = '1M' } = options;

    if (this.loadingStates.indexQuotes && !forceRefresh) {
      return { data: null, loading: true };
    }

    this.loadingStates.indexQuotes = true;

    try {
      // 缓存检查
      const cacheKey = `${QUOTES_CACHE_PREFIX.INDEX_QUOTES}:${term}`;
      if (!forceRefresh) {
        const cached = DataCacheManager.get(cacheKey);
        if (cached) {
          this.loadingStates.indexQuotes = false;
          return { data: cached, fromCache: true };
        }
      }

      // 获取指数数据
      const result = await this._fetchWithRetry(
        () => this._fetchIndexQuotesFromAPI(term),
        'indexQuotes'
      );

      if (result && result.data) {
        DataCacheManager.set(cacheKey, result.data, QUOTES_TTL.INDEX_QUOTES);
        this.lastUpdateTimes.indexQuotes = Date.now();
        return { data: result.data, fromCache: false };
      } else {
        // 模拟数据
        const mockData = this._generateMockIndexQuotes();
        return { data: mockData, fallback: true };
      }
    } catch (error) {
      console.error('[指数数据] 加载失败:', error);
      const mockData = this._generateMockIndexQuotes();
      return { data: mockData, error: error.message };
    } finally {
      this.loadingStates.indexQuotes = false;
    }
  }

  // ==================== ETF数据加载 ====================

  /**
   * 加载ETF报价数据
   * @param {Object} options 配置选项
   * @returns {Promise<Object>} ETF数据
   */
  async loadEtfQuotes(options = {}) {
    const { forceRefresh = false, term = '1M' } = options;

    if (this.loadingStates.etfQuotes && !forceRefresh) {
      return { data: null, loading: true };
    }

    this.loadingStates.etfQuotes = true;

    try {
      // 缓存检查
      const cacheKey = `${QUOTES_CACHE_PREFIX.ETF_QUOTES}:${term}`;
      if (!forceRefresh) {
        const cached = DataCacheManager.get(cacheKey);
        if (cached) {
          this.loadingStates.etfQuotes = false;
          return { data: cached, fromCache: true };
        }
      }

      // 获取ETF数据
      const result = await this._fetchWithRetry(
        () => this._fetchEtfQuotesFromAPI(term),
        'etfQuotes'
      );

      if (result && result.data) {
        DataCacheManager.set(cacheKey, result.data, QUOTES_TTL.ETF_QUOTES);
        this.lastUpdateTimes.etfQuotes = Date.now();
        return { data: result.data, fromCache: false };
      } else {
        // 模拟数据
        const mockData = this._generateMockEtfQuotes();
        return { data: mockData, fallback: true };
      }
    } catch (error) {
      console.error('[ETF数据] 加载失败:', error);
      const mockData = this._generateMockEtfQuotes();
      return { data: mockData, error: error.message };
    } finally {
      this.loadingStates.etfQuotes = false;
    }
  }

  // ==================== 股票详情数据加载 ====================

  /**
   * 加载股票详情页期权矩阵数据
   * @param {Object} stock 股票信息
   * @param {Object} options 配置选项
   * @returns {Promise<Object>} 矩阵数据
   */
  async loadStockDetailMatrix(stock, options = {}) {
    const { forceRefresh = false, trader = 'ALL' } = options;

    if (!stock || !stock.code) {
      return { data: null, error: '股票信息不完整' };
    }

    if (this.loadingStates.stockDetail && !forceRefresh) {
      return { data: null, loading: true };
    }

    this.loadingStates.stockDetail = true;

    try {
      const cacheKey = `${QUOTES_CACHE_PREFIX.OPTION_MATRIX}:${stock.code}:${trader}`;
      
      // 缓存检查
      if (!forceRefresh) {
        const cached = DataCacheManager.get(cacheKey);
        if (cached) {
          this.loadingStates.stockDetail = false;
          return { data: cached, fromCache: true };
        }
      }

      // 从云数据库获取
      const result = await this._fetchWithRetry(
        () => this._fetchOptionMatrixFromCloud(stock.code, trader),
        'stockDetail'
      );

      if (result && result.data && result.data.length > 0) {
        const matrixData = this._transformToMatrix(result.data);
        DataCacheManager.set(cacheKey, matrixData, QUOTES_TTL.OPTION_MATRIX);
        return { data: matrixData, fromCache: false };
      } else {
        // 模拟矩阵数据
        const mockMatrix = this._generateMockMatrix(stock);
        return { data: mockMatrix, fallback: true };
      }
    } catch (error) {
      console.error('[股票详情] 加载矩阵失败:', error);
      const mockMatrix = this._generateMockMatrix(stock);
      return { data: mockMatrix, error: error.message };
    } finally {
      this.loadingStates.stockDetail = false;
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * 带重试的fetch
   * @private
   */
  async _fetchWithRetry(fetcher, type, retryCount = REALTIME_CONFIG.MAX_RETRY_COUNT) {
    for (let i = 0; i < retryCount; i++) {
      try {
        return await fetcher();
      } catch (error) {
        console.warn(`[${type}] 第${i + 1}次请求失败:`, error.message);
        if (i < retryCount - 1) {
          await this._sleep(REALTIME_CONFIG.RETRY_DELAY * Math.pow(2, i)); // 指数退避
        }
      }
    }
    throw new Error(`请求失败，已重试${retryCount}次`);
  }

  /**
   * 延迟函数
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 标准化股票代码
   * @private
   */
  _normalizeStockCodes(favorites) {
    return favorites.map(item => {
      let code = item.code;
      if (!code.includes('.')) {
        const market = item.market || (code.startsWith('6') ? 'SH' : 'SZ');
        code = `${code}.${market}`;
      }
      return code.toUpperCase();
    });
  }

  /**
   * 合并自选列表与报价数据
   * @private
   */
  _mergeWatchlistWithQuotes(favorites, quotes) {
    const quoteMap = {};
    quotes.forEach(q => {
      if (q && q.stockCode) {
        const pureCode = q.stockCode.split('.')[0];
        quoteMap[pureCode] = q;
      }
    });

    return favorites.map(item => {
      const pureCode = item.code.split('.')[0];
      const quote = quoteMap[pureCode] || {};

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
        atm: quote.atm?.premiumPercent?.toFixed(2) || '--',
        otm105: quote.otm105?.premiumPercent?.toFixed(2) || '--',
        otm110: quote.otm110?.premiumPercent?.toFixed(2) || '--'
      };
    });
  }

  /**
   * 生成降级自选数据
   * @private
   */
  _generateFallbackWatchlist(favorites) {
    return favorites.map(item => {
      let displayCode = item.code;
      if (!displayCode.includes('.')) {
        const market = item.market || (item.code.startsWith('6') ? 'SH' : 'SZ');
        displayCode = `${item.code}.${market}`;
      }

      const price = item.price || 50;
      const volatility = 0.30;
      const T = 30 / 365;

      // 简化BS计算
      const atmPremium = price * volatility * Math.sqrt(T) * 0.4;
      const atm = ((atmPremium / price) * 100).toFixed(2);
      const otm105 = (atm * 0.85).toFixed(2);
      const otm110 = (atm * 0.65).toFixed(2);

      return {
        ...item,
        code: displayCode,
        atm,
        otm105,
        otm110,
        changePercent: Number(item.changePercent || 0).toFixed(2)
      };
    });
  }

  /**
   * 从API获取热门个股
   * @private
   */
  async _fetchHotStocksFromAPI(page, pageSize) {
    // 尝试从云数据库获取
    const db = wx.cloud.database();
    try {
      const result = await db.collection('hot_stocks')
        .orderBy('volume', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get();

      return {
        data: result.data,
        hasMore: result.data.length === pageSize,
        total: result.data.length
      };
    } catch (error) {
      console.warn('[热门个股API] 云数据库查询失败:', error);
      return null;
    }
  }

  /**
   * 从API获取指数报价
   * @private
   */
  async _fetchIndexQuotesFromAPI(term) {
    const db = wx.cloud.database();
    try {
      const result = await db.collection('index_quotes')
        .where({ term })
        .limit(50)
        .get();
      return { data: result.data };
    } catch (error) {
      console.warn('[指数API] 云数据库查询失败:', error);
      return null;
    }
  }

  /**
   * 从API获取ETF报价
   * @private
   */
  async _fetchEtfQuotesFromAPI(term) {
    const db = wx.cloud.database();
    try {
      const result = await db.collection('etf_quotes')
        .where({ term })
        .limit(50)
        .get();
      return { data: result.data };
    } catch (error) {
      console.warn('[ETF API] 云数据库查询失败:', error);
      return null;
    }
  }

  /**
   * 从云数据库获取期权矩阵
   * @private
   */
  async _fetchOptionMatrixFromCloud(stockCode, trader) {
    const db = wx.cloud.database();
    const pureCode = stockCode.split('.')[0];
    
    try {
      const result = await db.collection('quotes')
        .where({
          stock_code: pureCode
        })
        .limit(100)
        .get();
      return { data: result.data };
    } catch (error) {
      console.warn('[期权矩阵] 云数据库查询失败:', error);
      return null;
    }
  }

  /**
   * 转换为矩阵格式
   * @private
   */
  _transformToMatrix(quotes) {
    const terms = ['2W', '1M', '2M', '3M', '6M', '12M'];
    let strikes = [...new Set(quotes.map(q => q.strike || q.type))].filter(Boolean);
    
    if (strikes.length === 0) {
      strikes = ['100C', '103C', '105C', '110C', '90C', '95C'];
    }

    return strikes.map(strike => {
      const row = { strike, values: [] };
      terms.forEach(term => {
        const match = quotes.find(q => {
          const typeMatch = (q.strike || q.type) === strike;
          const termMatch = q.term === term;
          return typeMatch && termMatch;
        });

        let value = '--';
        if (match && match.rate) {
          value = typeof match.rate === 'number' 
            ? `${(match.rate * 100).toFixed(2)}%` 
            : match.rate;
        }

        row.values.push({ term, value });
      });
      return row;
    });
  }

  /**
   * 生成模拟热门个股数据
   * @private
   */
  _generateMockHotStocks(page, pageSize) {
    const allStocks = [
      { name: '宁德时代', code: '300750.SZ', changePercent: 2.47, price: 180.50, atm: 11.83 },
      { name: '东方财富', code: '300059.SZ', changePercent: 0.50, price: 13.45, atm: 16.20 },
      { name: '平安银行', code: '000001.SZ', changePercent: -0.35, price: 10.20, atm: 6.53 },
      { name: '药明康德', code: '603259.SH', changePercent: -1.26, price: 45.30, atm: 7.92 },
      { name: '上海贝岭', code: '600171.SH', changePercent: -2.26, price: 28.16, atm: 12.16 },
      { name: '中信证券', code: '600030.SH', changePercent: 1.45, price: 22.34, atm: 10.23 },
      { name: '贵州茅台', code: '600519.SH', changePercent: 0.12, price: 1650.00, atm: 15.32 },
      { name: '五粮液', code: '000858.SZ', changePercent: -0.56, price: 150.20, atm: 14.12 },
      { name: '比亚迪', code: '002594.SZ', changePercent: 3.12, price: 210.50, atm: 18.56 },
      { name: '隆基绿能', code: '601012.SH', changePercent: -1.89, price: 18.45, atm: 22.34 }
    ];

    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const list = allStocks.slice(startIndex, endIndex);

    return {
      list: list.map(s => ({
        ...s,
        otm105: (s.atm * 0.85).toFixed(2),
        otm110: (s.atm * 0.65).toFixed(2)
      })),
      hasMore: endIndex < allStocks.length
    };
  }

  /**
   * 生成模拟指数数据
   * @private
   */
  _generateMockIndexQuotes() {
    return [
      { name: '中证500', code: '000905.SH', price: '5818.55', changePercent: -1.67, atm: 11.83, otm105: 9.77, otm110: 8.01 },
      { name: '中证1000', code: '000852.SH', price: '6096.38', changePercent: -2.80, atm: 16.20, otm105: 14.21, otm110: 12.44 },
      { name: '沪深300', code: '000300.SH', price: '3933.57', changePercent: 0.15, atm: 6.53, otm105: 4.46, otm110: 2.94 },
      { name: '上证50', code: '000016.SH', price: '2618.82', changePercent: -1.26, atm: 7.92, otm105: 5.83, otm110: 4.21 },
      { name: '创业板指', code: '399006.SZ', price: '2156.73', changePercent: -2.26, atm: 12.16, otm105: 10.16, otm110: 8.16 }
    ];
  }

  /**
   * 生成模拟ETF数据
   * @private
   */
  _generateMockEtfQuotes() {
    return [
      { name: '芯片ETF', code: '159995.SZ', changePercent: 2.47, atm: 11.83, otm105: 9.77, otm110: 8.01 },
      { name: '5GETF', code: '515050.SH', changePercent: 0.50, atm: 16.20, otm105: 14.21, otm110: 12.44 },
      { name: '新能源车ETF', code: '515030.SH', changePercent: -0.35, atm: 6.53, otm105: 4.46, otm110: 2.94 },
      { name: '消费ETF', code: '159928.SZ', changePercent: -1.26, atm: 7.92, otm105: 5.83, otm110: 4.21 },
      { name: '医药ETF', code: '512010.SH', changePercent: -2.26, atm: 12.16, otm105: 12.16, otm110: 8.16 }
    ];
  }

  /**
   * 生成模拟期权矩阵
   * @private
   */
  _generateMockMatrix(stock) {
    const strikes = ['100C', '103C', '105C', '110C', '90C', '95C'];
    const terms = ['2W', '1M', '2M', '3M', '6M', '12M'];

    // 基于股票价格生成相对合理的期权费率
    const basePrice = stock.price || 50;
    const volatility = 0.25 + Math.random() * 0.15;

    return strikes.map(strike => {
      const strikeMultiplier = parseFloat(strike.replace(/[CP]/, '')) / 100;
      const row = { strike, values: [] };

      terms.forEach(term => {
        const termDays = this._getTermDays(term);
        const T = termDays / 365;

        // 简化的期权费率计算
        let baseRate = volatility * Math.sqrt(T) * 0.4;
        if (strikeMultiplier > 1) {
          baseRate *= (1 - (strikeMultiplier - 1) * 0.3); // OTM更便宜
        } else if (strikeMultiplier < 1) {
          baseRate *= (1 + (1 - strikeMultiplier) * 0.5); // ITM更贵
        }

        const value = `${(baseRate * 100).toFixed(2)}%`;
        row.values.push({ term, value });
      });

      return row;
    });
  }

  /**
   * 获取期限对应的天数
   * @private
   */
  _getTermDays(term) {
    const map = {
      '2W': 14,
      '1M': 30,
      '2M': 60,
      '3M': 90,
      '6M': 180,
      '12M': 365
    };
    return map[term] || 30;
  }

  // ==================== 搜索建议功能 ====================

  /**
   * 获取搜索建议（从热门股票和自选中匹配）
   * @param {string} keyword 搜索关键词
   * @param {number} limit 返回数量限制
   * @returns {Promise<Array>} 搜索建议列表
   */
  async getSearchSuggestions(keyword, limit = 5) {
    if (!keyword || keyword.trim().length < 1) {
      return [];
    }

    // 安全处理关键词
    const safeKeyword = keyword.trim().toLowerCase().slice(0, 20);
    
    try {
      // 从热门股票中获取建议
      const hotResult = await this.loadHotStocks();
      const suggestions = [];
      
      if (hotResult && hotResult.data) {
        hotResult.data.forEach(item => {
          const code = (item.code || item.stock_code || '').toLowerCase();
          const name = (item.name || '').toLowerCase();
          
          if (code.includes(safeKeyword) || name.includes(safeKeyword)) {
            suggestions.push({
              code: item.code || item.stock_code,
              name: item.name,
              price: item.price || '--',
              changePercent: item.changePercent || 0,
              type: 'stock'
            });
          }
        });
      }
      
      // 从自选中获取建议
      const favorites = favoritesService.getFavorites() || [];
      favorites.forEach(item => {
        const code = (item.code || '').toLowerCase();
        const name = (item.name || '').toLowerCase();
        
        if ((code.includes(safeKeyword) || name.includes(safeKeyword)) &&
            !suggestions.some(s => s.code === item.code)) {
          suggestions.push({
            code: item.code,
            name: item.name,
            price: item.price || '--',
            changePercent: item.changePercent || 0,
            type: 'favorite'
          });
        }
      });

      return suggestions.slice(0, limit);
    } catch (error) {
      console.warn('[搜索建议] 获取失败:', error);
      return [];
    }
  }

  /**
   * 获取热门搜索关键词
   * @param {number} limit 返回数量
   * @returns {Promise<Array>} 热门关键词列表
   */
  async getHotKeywords(limit = 8) {
    try {
      const db = wx.cloud.database();
      const result = await db.collection('hot_keywords')
        .orderBy('searchCount', 'desc')
        .limit(limit)
        .get();

      if (result.data && result.data.length > 0) {
        return result.data.map(item => ({
          keyword: item.keyword || item.name,
          count: item.searchCount || 0,
          type: item.type || 'stock'
        }));
      }
    } catch (error) {
      console.warn('[热门关键词] 获取失败:', error);
    }

    // 降级：返回默认热门关键词
    return [
      { keyword: '贵州茅台', type: 'stock' },
      { keyword: '宁德时代', type: 'stock' },
      { keyword: '中证500', type: 'index' },
      { keyword: '沪深300', type: 'index' },
      { keyword: '比亚迪', type: 'stock' },
      { keyword: '药明康德', type: 'stock' }
    ];
  }

  // ==================== 矩阵自动刷新功能 ====================

  /**
   * 启动期权矩阵自动刷新
   * @param {Object} stock 股票信息
   * @param {Function} callback 刷新回调
   * @param {number} interval 刷新间隔（毫秒），默认60秒
   */
  startMatrixAutoRefresh(stock, callback, interval = 60000) {
    // 停止已有定时器
    this.stopMatrixAutoRefresh();
    
    if (!stock || !stock.code) {
      console.warn('[矩阵刷新] 股票信息无效');
      return;
    }

    console.log('[矩阵刷新] 启动自动刷新，间隔:', interval);
    
    this._matrixRefreshStock = stock;
    this._matrixRefreshCallback = callback;
    
    this.updateTimers.matrixRefresh = setInterval(async () => {
      try {
        console.log('[矩阵刷新] 执行自动刷新');
        const result = await this.loadStockDetailMatrix(stock, { forceRefresh: true });
        
        if (callback && typeof callback === 'function') {
          callback(result);
        }
      } catch (error) {
        console.error('[矩阵刷新] 刷新失败:', error);
      }
    }, interval);
  }

  /**
   * 停止期权矩阵自动刷新
   */
  stopMatrixAutoRefresh() {
    if (this.updateTimers.matrixRefresh) {
      clearInterval(this.updateTimers.matrixRefresh);
      this.updateTimers.matrixRefresh = null;
      console.log('[矩阵刷新] 已停止');
    }
    this._matrixRefreshStock = null;
    this._matrixRefreshCallback = null;
  }

  /**
   * 检查矩阵自动刷新状态
   * @returns {boolean} 是否正在自动刷新
   */
  isMatrixAutoRefreshing() {
    return this.updateTimers.matrixRefresh !== null;
  }

  // ==================== 公共方法 ====================

  /**
   * 清除过期缓存
   */
  clearExpiredCache() {
    Object.values(QUOTES_CACHE_PREFIX).forEach(prefix => {
      DataCacheManager.set(`${prefix}:expired`, null, 0);
    });
    console.log('[报价管理器] 已清除过期缓存');
  }

  /**
   * 获取加载状态
   */
  getLoadingStates() {
    return { ...this.loadingStates };
  }

  /**
   * 获取分页状态
   */
  getPageStates() {
    return { ...this.pageStates };
  }

  /**
   * 获取上次更新时间
   */
  getLastUpdateTimes() {
    return { ...this.lastUpdateTimes };
  }

  /**
   * 格式化更新时间显示
   */
  formatUpdateTime(timestamp) {
    if (!timestamp) return '--';
    const now = new Date();
    const date = new Date(timestamp);
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}/${month}/${day} ${hours}:${minutes}更新`;
  }

  /**
   * 销毁管理器
   */
  destroy() {
    this._pauseRealtimeUpdates();
    this.updateCallbacks.clear();
    this.loadingStates = {};
    this.pageStates = {};
    console.log('[报价管理器] 已销毁');
  }
}

// 导出单例
const quotesDataManager = new QuotesDataManager();

module.exports = {
  QuotesDataManager,
  quotesDataManager,
  QUOTES_CACHE_PREFIX,
  QUOTES_TTL,
  REALTIME_CONFIG,
  PAGE_CONFIG
};