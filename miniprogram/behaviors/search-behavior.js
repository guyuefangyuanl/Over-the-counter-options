/**
 * 搜索行为模块
 * 提取首页搜索相关逻辑，支持复用
 */
const optionsService = require('../services/options.js');
const { cacheGet, cacheSet, checkDuplicate, markComplete, debounce } = require('../utils/performance-optimizer.js');
const { uiEnhancer, dataFormatter } = require('../utils/enhancedUtils.js');

// 缓存配置
const CACHE_CONFIG = {
  SEARCH_HISTORY: 'search_history',
  SUGGESTIONS_TTL: 5 * 60 * 1000, // 5分钟
  HISTORY_MAX_COUNT: 10
};

module.exports = Behavior({
  properties: {},

  data: {
    // 搜索相关状态
    searchValue: '',
    showSearchResults: false,
    searchResults: [],
    searchHistory: [],
    hotSearches: ['50ETF购', '300ETF沽', '沪深300', '上证50'],
    isSearching: false,
    quickSearchResults: [],
    showAdvanced: false,
    searchMode: 'fuzzy',
    filters: {
      type: '',
      underlying: '',
      expiryFrom: '',
      expiryTo: '',
      strikeMin: '',
      strikeMax: ''
    },
    page: 1,
    pageSize: 20,
    totalResults: -1
  },

  methods: {
    // ==================== 搜索输入处理 ====================

    /**
     * 搜索输入事件（带防抖）
     */
    onSearchInput(e) {
      const value = e.detail.value;
      this.setData({ searchValue: value });

      if (value) {
        // 使用性能优化器的防抖功能
        debounce('search-suggest', () => {
          this.fetchSuggestions(value);
        }, 300);
      } else {
        this.setData({ quickSearchResults: [] });
      }
    },

    /**
     * 搜索框获取焦点 - 跳转到搜索页面
     */
    onSearchFocus() {
      wx.navigateTo({
        url: '/subpackages/quotes/search/search'
      });
    },

    /**
     * 执行搜索（带缓存和去重）
     */
    async onSearch() {
      const { searchValue } = this.data;
      if (!searchValue.trim()) {
        uiEnhancer.showToast('请输入搜索内容', 'none');
        return;
      }

      uiEnhancer.hapticFeedback('light');

      // 检查重复请求
      const { isDuplicate, key } = checkDuplicate('search', { keyword: searchValue });
      if (isDuplicate) {
        console.log('[搜索] 重复请求已拦截');
        return;
      }

      this.setData({ isSearching: true });

      try {
        const { searchMode, filters, pageSize } = this.data;
        const query = this._buildSearchQuery(searchValue, searchMode, filters, 1, pageSize);

        // 尝试从缓存获取
        const cacheKey = `search:${JSON.stringify(query)}`;
        const cached = cacheGet(cacheKey);
        if (cached) {
          console.log('[搜索] 使用缓存结果');
          this._setSearchResults(cached);
          this.saveSearchHistory(searchValue);
          return;
        }

        const { items, total, page } = await optionsService.searchOptions(query);
        const mapped = this._mapSearchResults(items);

        // 缓存结果
        cacheSet(cacheKey, { items: mapped, total, page }, CACHE_CONFIG.SUGGESTIONS_TTL);

        this._setSearchResults({ items: mapped, total, page });
        this.saveSearchHistory(searchValue);
      } catch (error) {
        console.error('搜索失败:', error);
        uiEnhancer.showToast('搜索失败，请重试', 'error');
      } finally {
        this.setData({ isSearching: false });
        markComplete(key);
      }
    },

    /**
     * 加载更多结果
     */
    async loadMore() {
      const { searchValue, searchMode, filters, page, pageSize, searchResults } = this.data;
      const nextPage = page + 1;

      // 检查重复请求
      const { isDuplicate, key } = checkDuplicate('loadMore', { keyword: searchValue, page: nextPage });
      if (isDuplicate) return;

      try {
        const query = this._buildSearchQuery(searchValue, searchMode, filters, nextPage, pageSize);
        const { items, total } = await optionsService.searchOptions(query);
        const mapped = this._mapSearchResults(items);

        this.setData({
          searchResults: searchResults.concat(mapped),
          totalResults: total,
          page: nextPage
        });
      } catch (e) {
        console.error('加载更多失败', e);
      } finally {
        markComplete(key);
      }
    },

    // ==================== 建议和历史 ====================

    /**
     * 获取搜索建议
     */
    async fetchSuggestions(keyword) {
      try {
        // 尝试从缓存获取
        const cacheKey = `suggest:${keyword}`;
        const cached = cacheGet(cacheKey);
        if (cached) {
          this.setData({ quickSearchResults: cached });
          return;
        }

        const suggestions = await optionsService.getSuggestions({ keyword, limit: 8 });

        // 缓存建议结果
        cacheSet(cacheKey, suggestions, CACHE_CONFIG.SUGGESTIONS_TTL);
        this.setData({ quickSearchResults: suggestions });
      } catch (error) {
        console.error('获取建议失败:', error);
        this.setData({ quickSearchResults: [] });
      }
    },

    /**
     * 点击建议项
     */
    onSuggestionTap(e) {
      const { keyword } = e.currentTarget.dataset;
      uiEnhancer.hapticFeedback('light');
      this.setData({
        searchValue: keyword,
        quickSearchResults: []
      }, () => {
        this.onSearch();
      });
    },

    /**
     * 热门搜索点击
     */
    onHotSearchTap(e) {
      const { keyword } = e.currentTarget.dataset;
      uiEnhancer.hapticFeedback('light');
      this.setData({ searchValue: keyword }, () => {
        this.onSearch();
      });
    },

    /**
     * 历史记录点击
     */
    onHistoryItemTap(e) {
      const { keyword } = e.currentTarget.dataset;
      uiEnhancer.hapticFeedback('light');
      this.setData({ searchValue: keyword }, () => {
        this.onSearch();
      });
    },

    // ==================== 历史记录管理 ====================

    /**
     * 加载搜索历史
     */
    loadSearchHistory() {
      try {
        const history = wx.getStorageSync(CACHE_CONFIG.SEARCH_HISTORY) || [];
        this.setData({ searchHistory: history });
      } catch (error) {
        console.error('加载搜索历史失败:', error);
      }
    },

    /**
     * 保存搜索历史
     */
    saveSearchHistory(keyword) {
      try {
        let history = this.data.searchHistory;
        history = history.filter(item => item !== keyword);
        history.unshift(keyword);
        history = history.slice(0, CACHE_CONFIG.HISTORY_MAX_COUNT);

        this.setData({ searchHistory: history });
        wx.setStorageSync(CACHE_CONFIG.SEARCH_HISTORY, history);
      } catch (error) {
        console.error('保存搜索历史失败:', error);
      }
    },

    /**
     * 清空搜索历史
     */
    clearSearchHistory() {
      uiEnhancer.hapticFeedback('medium');
      wx.showModal({
        title: '提示',
        content: '确定要清空搜索历史吗？',
        success: (res) => {
          if (res.confirm) {
            this.setData({ searchHistory: [] });
            wx.removeStorageSync(CACHE_CONFIG.SEARCH_HISTORY);
            uiEnhancer.showToast('已清空', 'success');
          }
        }
      });
    },

    // ==================== 筛选和取消 ====================

    /**
     * 切换高级筛选
     */
    toggleAdvanced() {
      this.setData({ showAdvanced: !this.data.showAdvanced });
    },

    /**
     * 筛选条件变更
     */
    onModeChange(e) { this.setData({ searchMode: e.detail.value }); },
    onTypeChange(e) { this.setData({ 'filters.type': e.detail.value }); },
    onUnderlyingInput(e) { this.setData({ 'filters.underlying': e.detail.value }); },
    onExpiryFromInput(e) { this.setData({ 'filters.expiryFrom': e.detail.value }); },
    onExpiryToInput(e) { this.setData({ 'filters.expiryTo': e.detail.value }); },
    onStrikeMinInput(e) { this.setData({ 'filters.strikeMin': e.detail.value }); },
    onStrikeMaxInput(e) { this.setData({ 'filters.strikeMax': e.detail.value }); },

    /**
     * 取消搜索
     */
    onSearchCancel() {
      uiEnhancer.hapticFeedback('light');
      this.setData({
        showSearchResults: false,
        searchValue: '',
        searchResults: [],
        quickSearchResults: []
      });
    },

    // ==================== 内部方法 ====================

    /**
     * 构建搜索查询参数
     */
    _buildSearchQuery(keyword, mode, filters, page, pageSize) {
      return {
        keyword,
        mode,
        type: filters.type || undefined,
        underlying: filters.underlying || undefined,
        expiryFrom: filters.expiryFrom || undefined,
        expiryTo: filters.expiryTo || undefined,
        strikeMin: filters.strikeMin !== '' ? Number(filters.strikeMin) : undefined,
        strikeMax: filters.strikeMax !== '' ? Number(filters.strikeMax) : undefined,
        page,
        pageSize,
        sortBy: 'relevance'
      };
    },

    /**
     * 映射搜索结果
     */
    _mapSearchResults(items) {
      return items.map(it => ({
        ...it,
        changeRate: dataFormatter.formatPercent(it.change),
        displayText: `${it.underlyingName} ${it.expiry} ${it.type === 'call' ? '看涨' : '看跌'} ${it.strike}`
      }));
    },

    /**
     * 设置搜索结果
     */
    _setSearchResults({ items, total, page }) {
      this.setData({
        searchResults: items,
        totalResults: total,
        page,
        showSearchResults: true
      });
    }
  }
});