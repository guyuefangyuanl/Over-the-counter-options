/**
 * 搜索股票页面 - 优化版
 * 
 * 改进点：
 * 1. 使用 quotesDataManager 统一数据源，与行情页面保持一致
 * 2. 接入真实云数据库搜索，支持全市场股票
 * 3. 添加搜索历史记录功能
 * 4. 优化搜索性能与用户体验
 */

const { quotesDataManager, QUOTES_CACHE_PREFIX } = require('../../../utils/quotes-data-manager.js');

// 搜索缓存配置
const SEARCH_CACHE_TTL = 60 * 1000; // 1分钟缓存
const SEARCH_HISTORY_KEY = 'stock_search_history';
const MAX_HISTORY_COUNT = 10;

Page({
  data: {
    keyword: '',
    results: [],
    hotStocks: [],
    showResults: false,
    loading: false,
    searchHistory: [],      // 搜索历史
    showHistory: false,     // 是否显示历史记录
    hasMore: false,         // 是否有更多结果
    page: 1                 // 当前页码
  },

  onLoad: function() {
    console.log('[股票搜索] 页面加载');
    this.loadSearchHistory();
    this.loadHotStocks();
  },

  onShow: function() {
    // 页面显示时刷新热门股票
    this.loadHotStocks();
  },

  onUnload: function() {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
  },

  // ==================== 数据加载 ====================

  /**
   * 加载搜索历史
   */
  loadSearchHistory: function() {
    try {
      const history = wx.getStorageSync(SEARCH_HISTORY_KEY) || [];
      this.setData({ searchHistory: history.slice(0, MAX_HISTORY_COUNT) });
    } catch (e) {
      console.warn('[股票搜索] 加载历史失败:', e);
    }
  },

  /**
   * 保存搜索历史
   */
  saveSearchHistory: function(keyword) {
    if (!keyword || keyword.trim().length < 2) return;
    
    try {
      let history = wx.getStorageSync(SEARCH_HISTORY_KEY) || [];
      // 移除已存在的相同项
      history = history.filter(item => item !== keyword);
      // 添加到最前面
      history.unshift(keyword);
      // 保留最多10条
      history = history.slice(0, MAX_HISTORY_COUNT);
      
      wx.setStorageSync(SEARCH_HISTORY_KEY, history);
      this.setData({ searchHistory: history });
    } catch (e) {
      console.warn('[股票搜索] 保存历史失败:', e);
    }
  },

  /**
   * 清空搜索历史
   */
  clearSearchHistory: function() {
    wx.showModal({
      title: '提示',
      content: '确定要清空搜索历史吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync(SEARCH_HISTORY_KEY);
          this.setData({ searchHistory: [], showHistory: false });
          wx.showToast({ title: '已清空', icon: 'success' });
        }
      }
    });
  },

  /**
   * 加载热门股票 - 使用 quotesDataManager 统一数据源
   */
  loadHotStocks: async function() {
    try {
      // 使用数据管理器加载热门股票，与行情页面数据源一致
      const result = await quotesDataManager.loadHotStocks({ forceRefresh: false });
      
      if (result && result.data && result.data.length > 0) {
        // 标准化数据格式
        const hotStocks = result.data.map(item => this._normalizeStockData(item));
        this.setData({ hotStocks });
      } else {
        // 降级：使用内置热门股票
        this._loadFallbackHotStocks();
      }
    } catch (error) {
      console.warn('[股票搜索] 加载热门股票失败:', error);
      // 降级方案
      this._loadFallbackHotStocks();
    }
  },

  /**
   * 降级：加载内置热门股票数据
   * @private
   */
  _loadFallbackHotStocks: function() {
    const hotStocks = [
      { code: '300750.SZ', name: '宁德时代', price: 198.50, changePercent: 1.64, market: 'SZ' },
      { code: '600519.SH', name: '贵州茅台', price: 1678.90, changePercent: -0.73, market: 'SH' },
      { code: '000001.SZ', name: '平安银行', price: 11.36, changePercent: 5.68, market: 'SZ' },
      { code: '600036.SH', name: '招商银行', price: 35.67, changePercent: 3.63, market: 'SH' },
      { code: '000858.SZ', name: '五粮液', price: 128.45, changePercent: 1.70, market: 'SZ' },
      { code: '002415.SZ', name: '海康威视', price: 32.15, changePercent: 1.42, market: 'SZ' },
      { code: '000333.SZ', name: '美的集团', price: 56.78, changePercent: -1.54, market: 'SZ' },
      { code: '600030.SH', name: '中信证券', price: 22.34, changePercent: 1.45, market: 'SH' }
    ];
    this.setData({ hotStocks });
  },

  /**
   * 标准化股票数据格式
   * @private
   */
  _normalizeStockData: function(item) {
    // 处理代码格式
    let code = item.code || item.stock_code || '';
    let market = item.market || 'SZ';
    
    if (code.includes('.')) {
      const parts = code.split('.');
      code = parts[0];
      market = parts[1] || market;
    }
    
    // 判断市场
    if (!market || market === 'SZ' || market === 'SH') {
      market = code.startsWith('6') ? 'SH' : 'SZ';
    }
    
    return {
      code: code,
      market: market,
      displayCode: `${code}.${market}`,
      name: item.name || '',
      price: item.price || '--',
      changePercent: typeof item.changePercent === 'number' 
        ? item.changePercent.toFixed(2) 
        : (item.changePercent || '0.00'),
      // 期权相关字段
      atm: item.atm || '--',
      otm105: item.otm105 || '--',
      otm110: item.otm110 || '--'
    };
  },

  // ==================== 搜索功能 ====================

  /**
   * 输入事件
   */
  onInput: function(e) {
    const keyword = e.detail.value.trim();
    this.setData({ 
      keyword,
      showHistory: keyword.length === 0 && this.data.searchHistory.length > 0
    });

    // 清除之前的定时器
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }

    if (keyword) {
      // 防抖搜索
      this.searchTimer = setTimeout(() => {
        this.searchStocks(keyword);
      }, 400);
    } else {
      this.setData({ 
        showResults: false, 
        results: [],
        page: 1,
        hasMore: false
      });
    }
  },

  /**
   * 执行股票搜索 - 统一使用云数据库
   */
  searchStocks: async function(keyword) {
    if (!keyword || keyword.trim().length < 1) {
      this.setData({ showResults: false, results: [] });
      return;
    }

    console.log('[股票搜索] 搜索关键词:', keyword);
    this.setData({ loading: true, showResults: true, showHistory: false });

    try {
      // 使用云数据库搜索 - 安全的正则处理
      const results = await this._searchFromCloud(keyword);
      
      // 保存搜索历史
      if (results.length > 0) {
        this.saveSearchHistory(keyword);
      }

      this.setData({ 
        results: results.map(item => this._normalizeStockData(item)),
        loading: false,
        page: 1,
        hasMore: results.length >= 20
      });
    } catch (error) {
      console.error('[股票搜索] 搜索失败:', error);
      
      // 降级：使用本地搜索
      const fallbackResults = this._fallbackSearch(keyword);
      this.setData({ 
        results: fallbackResults,
        loading: false 
      });
      
      if (fallbackResults.length === 0) {
        wx.showToast({ title: '未找到相关股票', icon: 'none' });
      }
    }
  },

  /**
   * 从云数据库搜索股票
   * @private
   */
  _searchFromCloud: async function(keyword) {
    const db = wx.cloud.database();
    const _ = db.command;
    
    // 安全处理关键词，转义正则特殊字符防止注入
    const safeKeyword = this._escapeRegExp(keyword);
    
    try {
      // 构建安全的搜索条件
      const result = await db.collection('quotes')
        .where(_.or([
          // 代码匹配（前缀匹配更安全）
          { stock_code: db.RegExp({ regexp: `^${safeKeyword}`, options: 'i' }) },
          // 名称匹配（包含匹配）
          { name: db.RegExp({ regexp: safeKeyword, options: 'i' }) }
        ]))
        .limit(30)
        .get();

      console.log('[股票搜索] 云数据库结果:', result.data.length);
      return result.data;
    } catch (error) {
      console.warn('[股票搜索] 云数据库查询失败:', error);
      throw error;
    }
  },

  /**
   * 转义正则表达式特殊字符（防止ReDoS攻击）
   * @private
   */
  _escapeRegExp: function(string) {
    // 只保留安全字符，移除正则元字符
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  /**
   * 降级：本地搜索（热门股票中匹配）
   * @private
   */
  _fallbackSearch: function(keyword) {
    const { hotStocks } = this.data;
    const lowerKeyword = keyword.toLowerCase();
    
    return hotStocks.filter(stock => 
      stock.code.toLowerCase().includes(lowerKeyword) ||
      stock.name.toLowerCase().includes(lowerKeyword)
    );
  },

  /**
   * 加载更多搜索结果
   */
  loadMoreResults: async function() {
    if (this.data.loading || !this.data.hasMore) return;

    const { keyword, page, results } = this.data;
    const nextPage = page + 1;

    this.setData({ loading: true });

    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const safeKeyword = this._escapeRegExp(keyword);

      const result = await db.collection('quotes')
        .where(_.or([
          { stock_code: db.RegExp({ regexp: `^${safeKeyword}`, options: 'i' }) },
          { name: db.RegExp({ regexp: safeKeyword, options: 'i' }) }
        ]))
        .skip(nextPage * 20)
        .limit(20)
        .get();

      if (result.data.length > 0) {
        const newResults = result.data.map(item => this._normalizeStockData(item));
        this.setData({
          results: [...results, ...newResults],
          page: nextPage,
          loading: false,
          hasMore: result.data.length >= 20
        });
      } else {
        this.setData({ loading: false, hasMore: false });
      }
    } catch (error) {
      console.error('[股票搜索] 加载更多失败:', error);
      this.setData({ loading: false, hasMore: false });
    }
  },

  // ==================== 交互事件 ====================

  /**
   * 点击历史记录
   */
  onHistoryTap: function(e) {
    const keyword = e.currentTarget.dataset.keyword;
    this.setData({ keyword });
    this.searchStocks(keyword);
  },

  /**
   * 点击键盘搜索
   */
  onSearchConfirm: function() {
    const { keyword } = this.data;
    if (keyword) {
      this.searchStocks(keyword);
    }
  },

  /**
   * 清空输入
   */
  onClearInput: function() {
    this.setData({
      keyword: '',
      showResults: false,
      results: [],
      showHistory: this.data.searchHistory.length > 0
    });
  },

  /**
   * 选择股票 - 跳转到详情页
   */
  onSelectStock: function(e) {
    const stock = e.currentTarget.dataset.item;
    console.log('[股票搜索] 选择股票:', stock);

    // 标准化参数
    const stockCode = stock.code || stock.stock_code || '';
    const displayCode = stock.displayCode || `${stockCode}.${stock.market || 'SZ'}`;
    const name = encodeURIComponent(stock.name || '');
    const price = stock.price || '--';
    const changePercent = stock.changePercent || '0.00';

    wx.navigateTo({
      url: `/subpackages/quotes/stock-detail/stock-detail?code=${displayCode}&name=${name}&price=${price}&changePercent=${changePercent}`,
      success: () => {
        console.log('[股票搜索] 跳转成功');
      },
      fail: (err) => {
        console.error('[股票搜索] 跳转失败:', err);
        wx.showToast({ title: '跳转失败', icon: 'none' });
      }
    });
  },

  /**
   * 返回上一页
   */
  goBack: function() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/quotes/quotes' });
      }
    });
  }
});