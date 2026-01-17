
// pages/search/search.js
const app = getApp();

// 模拟异步获取建议
const fetchSuggestions = (query) => {
  console.log(`Fetching suggestions for: ${query}`);
  return new Promise(resolve => {
    setTimeout(() => {
      if (query) {
        resolve([
          { id: 1, text: `${query} - 热门建议` },
          { id: 2, text: `${query} - 相关产品` },
          { id: 3, text: `${query} - 深度分析` },
        ]);
      } else {
        resolve([]);
      }
    }, 200); // 模拟网络延迟
  });
};

// 模拟异步获取搜索结果
const fetchResults = (query) => {
  console.log(`[搜索] 开始查询: ${query}`);
  const db = wx.cloud.database();
  const _ = db.command;
  
  // 支持代码、名称、拼音首字母 (假设数据库中有 pinyin 字段，如果没有则只搜代码和名称)
  return db.collection('quotes')
    .where(_.or([
      { code: db.RegExp({ regexp: query, options: 'i' }) },
      { name: db.RegExp({ regexp: query, options: 'i' }) },
      { pinyin: db.RegExp({ regexp: query, options: 'i' }) }
    ]))
    .limit(20)
    .get()
    .then(res => {
      return res.data.map(item => ({
        id: item._id,
        name: item.name,
        code: item.code,
        price: item.price,
        changePercent: item.changePercent,
        type: item.type || 'stock'
      }));
    });
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
  },

  // --- 生命周期 ---
  onLoad: function (options) {
    this.loadHistory();
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

  // 快速查询
  onQuickQuery: function (e) {
    const type = e.currentTarget.dataset.type;
    console.log('[快速查询] 类型:', type);
    
    // 根据类型设置预设搜索词或直接跳转
    let query = '';
    switch(type) {
      case 'otc': query = '场外个股'; break;
      case 'vanilla': query = '香草'; break;
      case 'exchange': query = '场内期权'; break;
    }
    
    if (query) {
      this.executeSearch(query);
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
    const app = getApp();
    
    // 设置全局参数，跳转到报价页面
    app.globalData.pendingQuoteParams = {
      code: item.code,
      name: item.name,
      price: item.price,
      changePercent: item.changePercent,
      source: this.data.source || 'search'
    };

    // 报价页是 tabBar 页面，必须使用 switchTab
    wx.switchTab({
      url: '/pages/quotes/quotes',
      success: () => {
        console.log('[跳转] 报价页成功');
      },
      fail: (err) => {
        console.error('[跳转] 报价页失败:', err);
        wx.showToast({ title: '跳转失败', icon: 'none' });
      }
    });
  },
});
