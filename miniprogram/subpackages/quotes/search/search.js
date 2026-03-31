
// pages/search/search.js
const app = getApp();
const { quotesDataManager } = require('../../../utils/quotes-data-manager.js');

// ================== 安全函数 ==================

/**
 * 转义正则表达式特殊字符（防止ReDoS攻击）
 * @param {string} string 用户输入
 * @returns {string} 转义后的安全字符串
 */
const escapeRegExp = (string) => {
  if (!string) return '';
  // 转义正则元字符: \ ^ $ . | ? * + ( ) [ ] { }
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * 安全地构建正则搜索条件
 * @param {string} query 用户输入
 * @param {number} maxLength 最大长度限制
 * @returns {string} 安全的正则模式
 */
const buildSafeRegex = (query, maxLength = 50) => {
  if (!query) return '';
  // 限制长度防止DoS
  const trimmed = query.trim().slice(0, maxLength);
  return escapeRegExp(trimmed);
};

// ================== 模拟数据已移除 ==================
// 股票数据来源于后台管理系统API
// 搜索通过后台API /api/stock/search 获取数据

// ================== 数据获取 ====================

/**
 * 获取搜索建议 - 从后台API获取
 */
const fetchSuggestions = async (query) => {
  console.log(`[搜索建议] 查询: ${query}`);

  if (!query || query.trim().length < 1) {
    return [];
  }

  try {
    // 从后台API获取搜索建议
    const suggestions = await quotesDataManager.searchStocksFromAPI(query, 5);

    if (suggestions && suggestions.length > 0) {
      return suggestions.map((item, index) => ({
        id: index,
        code: item.code,
        text: `${item.name} (${item.code})`,
        name: item.name,
        price: item.price,
        changePercent: item.changePercent,
        type: item.type
      }));
    }

    // 无数据时返回空数组
    console.log('[搜索建议] 未找到匹配结果');
    return [];
  } catch (error) {
    console.error('[搜索建议] 获取失败:', error);
    return [];
  }
};

// 从后台API搜索股票
const fetchResults = async (query) => {
  console.log(`[搜索] 开始查询: ${query}`);

  // 安全处理用户输入
  const safeQuery = buildSafeRegex(query);
  if (!safeQuery) {
    return [];
  }

  try {
    // 从后台API获取搜索结果
    const results = await quotesDataManager.searchStocksFromAPI(query, 20);

    if (results && results.length > 0) {
      return results.map(item => ({
        id: item.id || item.code,
        name: item.name,
        code: item.code,
        price: item.price,
        changePercent: item.changePercent,
        type: item.type || 'stock'
      }));
    }

    // 无数据时返回空数组
    console.log('[搜索] 未找到匹配结果');
    return [];
  } catch (err) {
    console.error('[搜索] 查询失败:', err);
    return [];
  }
};

Page({
  data: {
    inputValue: '', // 输入框内容
    history: [], // 搜索历史
    suggestions: [], // 实时建议
    results: [], // 搜索结果
    showSuggestions: false, // 是否显示建议
    showResults: false, // 是否显示结果
    isLoading: false, // 是否正在加载
    isNoResult: false, // 是否无结果
    historyVisible: true, // 历史记录是否可见
    // 动态快速查询关键词
    quickQueries: [
      { type: 'otc', name: '沪深场外个股期权', keyword: '', enabled: true },
      { type: 'vanilla', name: '香草期权', keyword: '', enabled: true },
      { type: 'exchange', name: '沪深场内期权', keyword: '', enabled: true }
    ]
  },

  // --- 生命周期 ---
  onLoad: function (options) {
    this.loadHistory();
    // 加载动态快速查询关键词
    this.loadQuickQueries();
    // 保存来源页面，用于后续跳转逻辑
    this.setData({ 
      source: options.source || '',
      fromInquiry: options.source === 'inquiry'
    });
    if (options.q) {
      const preset = decodeURIComponent(options.q);
      this.setData({ inputValue: preset, historyVisible: !preset });
      this.debounceFetchSuggestions(preset);
    }
  },

  // --- 事件处理 ---

  // 输入框内容变化
  onInput: function (e) {
    const query = e.detail.value.trim();
    this.setData({
      inputValue: query,
      historyVisible: !query, // 输入时隐藏历史记录
      showResults: false,
      isNoResult: false,
    });
    this.debounceFetchSuggestions(query);
  },

  // 点击键盘“搜索”或建议项
  onConfirm: function (e) {
    // e.currentTarget.dataset.query 用于处理点击建议项的场景
    const query = e.currentTarget.dataset.query || this.data.inputValue;
    if (!query) return;

    this.executeSearch(query);
  },

  // 清空输入框
  onClearInput: function () {
    this.setData({
      inputValue: '',
      suggestions: [],
      showSuggestions: false,
      showResults: false,
      isNoResult: false,
      historyVisible: true,
    });
  },

  // 点击历史/建议标签
  onTagTap: function (e) {
    const query = e.currentTarget.dataset.query;
    this.executeSearch(query);
  },

  // 清空历史记录
  onClearHistory: function () {
    wx.showModal({
      title: '提示',
      content: '确定要清空历史记录吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({ history: [] });
          wx.removeStorageSync('searchHistory');
        }
      },
    });
  },

  // 点击“取消”
  onCancel: function () {
    wx.navigateBack();
  },

  // --- 核心逻辑 ---

  // 执行搜索
  executeSearch: function (query) {
    if (!query) return;
    try { wx.vibrateShort({ type: 'light' }); } catch (_) {}
    
    this.setData({
      inputValue: query,
      isLoading: true,
      showSuggestions: false,
      historyVisible: false,
      showResults: true,
      isNoResult: false,
    });
    
    this.saveHistory(query);
    const start = Date.now();
    
    fetchResults(query).then(results => {
      this.setData({
        results,
        isLoading: false,
        isNoResult: results.length === 0,
      });
      const duration = Date.now() - start;
      console.log(`[搜索] 完成，耗时 ${duration}ms，结果数: ${results.length}`);
    }).catch(err => {
      console.error('[搜索] 失败：', err);
      this.setData({ isLoading: false, isNoResult: true });
      wx.showToast({ title: '搜索失败，请重试', icon: 'none' });
    });
  },

  // 快速查询 - 支持动态关键词
  onQuickQuery: function (e) {
    const type = e.currentTarget.dataset.type;
    console.log('[快速查询] 类型:', type);
    
    // 从动态配置中获取关键词
    const quickQuery = this.data.quickQueries.find(q => q.type === type);
    
    if (quickQuery && quickQuery.enabled) {
      // 如果有关键词配置，使用配置的关键词
      const query = quickQuery.keyword || quickQuery.name;
      this.executeSearch(query);
    } else {
      // 降级：使用默认关键词
      let query = '';
      switch(type) {
        case 'otc': query = '场外个股期权'; break;
        case 'vanilla': query = '香草期权'; break;
        case 'exchange': query = '场内期权'; break;
      }
      if (query) {
        this.executeSearch(query);
      }
    }
  },

  // 加载动态快速查询关键词
  loadQuickQueries: async function() {
    try {
      // 从云端获取热门关键词配置
      const hotKeywords = await quotesDataManager.getHotKeywords(6);
      
      if (hotKeywords && hotKeywords.length > 0) {
        // 更新快速查询配置
        const quickQueries = this.data.quickQueries.map(q => {
          // 根据类型匹配热门关键词
          const matchedKeyword = hotKeywords.find(k => 
            (q.type === 'otc' && (k.keyword.includes('场外') || k.type === 'otc')) ||
            (q.type === 'vanilla' && (k.keyword.includes('香草') || k.type === 'vanilla')) ||
            (q.type === 'exchange' && (k.keyword.includes('场内') || k.type === 'exchange'))
          );
          
          return {
            ...q,
            keyword: matchedKeyword ? matchedKeyword.keyword : '',
            enabled: true
          };
        });
        
        this.setData({ quickQueries });
      }
    } catch (error) {
      console.warn('[快速查询] 加载动态关键词失败:', error);
    }
  },

  // 防抖获取建议
  debounceFetchSuggestions: (function () {
    let timer = null;
    return function (query) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (query) {
          fetchSuggestions(query).then(suggestions => {
            this.setData({
              suggestions,
              showSuggestions: suggestions.length > 0,
            });
          });
        } else {
          this.setData({ suggestions: [], showSuggestions: false });
        }
      }, 300); // 300ms 防抖
    };
  })(),

  // --- 本地存储 ---

  // 加载历史记录
  loadHistory: function () {
    const history = wx.getStorageSync('searchHistory') || [];
    this.setData({ history });
  },

  // 保存历史记录
  saveHistory: function (query) {
    let history = this.data.history;
    // 移除已存在的相同项，并添加到最前
    history = history.filter(item => item !== query);
    history.unshift(query);
    // 保留最多8条
    if (history.length > 8) {
      history = history.slice(0, 8);
    }
    this.setData({ history });
    wx.setStorageSync('searchHistory', history);
  },

  // 点击搜索结果
  onResultTap: function (e) {
    const item = e.currentTarget.dataset.item;
    console.log('[搜索] 点击结果:', item, '来源:', this.data.source);

    // 对参数进行URL编码，确保中文等特殊字符正确传递
    const encodedName = encodeURIComponent(item.name || '');
    const encodedCode = encodeURIComponent(item.code || '');
    const price = item.price || '';
    const changePercent = item.changePercent || '';

    // 询价来源特殊处理：跳转到stock-detail并标记需要显示询价
    if (this.data.source === 'inquiry') {
      const url = `/subpackages/quotes/stock-detail/stock-detail?code=${encodedCode}&name=${encodedName}&price=${price}&changePercent=${changePercent}&showInquiry=1`;
      console.log('[跳转-询价] 目标URL:', url);
      
      wx.navigateTo({
        url: url,
        success: () => {
          console.log('[跳转-询价] 股票详情页成功');
        },
        fail: (err) => {
          console.error('[跳转-询价] 股票详情页失败:', err);
          wx.showToast({ title: '跳转失败，请重试', icon: 'none' });
        }
      });
      return;
    }

    // 其他来源：跳转到股票详情页面（原有逻辑）
    const url = `/subpackages/quotes/stock-detail/stock-detail?code=${encodedCode}&name=${encodedName}&price=${price}&changePercent=${changePercent}`;
    console.log('[跳转] 目标URL:', url);

    wx.navigateTo({
      url: url,
      success: () => {
        console.log('[跳转] 股票详情页成功');
      },
      fail: (err) => {
        console.error('[跳转] 股票详情页失败:', err);
        // 如果跳转失败，降级回退到旧的逻辑 (tabBar 报价页)
        const app = getApp();
        app.globalData.pendingQuoteParams = {
          code: item.code,
          name: item.name,
          price: item.price,
          changePercent: item.changePercent,
          source: this.data.source || 'search'
        };
        wx.switchTab({
          url: '/pages/quotes/quotes'
        });
      }
    });
  },
});
