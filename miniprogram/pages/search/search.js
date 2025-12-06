
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
  console.log(`Fetching results for: ${query}`);
  return new Promise(resolve => {
    setTimeout(() => {
      if (query) {
        resolve([
          { id: 101, title: `关于“${query}”的个股期权`, description: '提供多种到期日和行权价，满足不同策略需求。' },
          { id: 102, title: `“${query}”指数期权`, description: '挂钩主流指数，有效对冲市场风险。' },
          { id: 103, title: `“${query}”ETF期权`, description: '兼具灵活性与成本效益，适合波段操作。' },
          { id: 104, title: `“${query}”相关资讯`, description: '最新市场动态与专家解读，助您把握先机。' },
        ]);
      } else {
        resolve([]);
      }
    }, 500); // 模拟网络延迟
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
      // 如果是从询价页面过来的，修改搜索结果为股票标的
      if (this.data.fromInquiry) {
        const q = String(query).trim();
        const stockResults = [
          { 
            id: 1, 
            title: `${q} (600519)`, 
            description: '贵州茅台 - 白酒行业龙头',
            code: '600519',
            name: q,
            type: 'stock'
          },
          { 
            id: 2, 
            title: `${q} (000858)`, 
            description: '五粮液 - 知名白酒品牌',
            code: '000858',
            name: q,
            type: 'stock'
          },
          { 
            id: 3, 
            title: `${q} (002304)`, 
            description: '洋河股份 - 白酒行业',
            code: '002304',
            name: q,
            type: 'stock'
          }
        ];
        this.setData({
          results: stockResults,
          isLoading: false,
          isNoResult: stockResults.length === 0,
        });
      } else {
        this.setData({
          results,
          isLoading: false,
          isNoResult: results.length === 0,
        });
      }
      const duration = Date.now() - start;
      console.log(`[搜索] 完成，耗时 ${duration}ms，结果数: ${this.data.results.length}`);
    }).catch(err => {
      console.error('[搜索] 失败：', err);
      this.setData({ isLoading: false, isNoResult: true });
      wx.showToast({ title: '搜索失败，请重试', icon: 'none' });
    });
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
    
    // 如果是从询价页面过来的，跳转到期权报价页面
    if (this.data.fromInquiry) {
      // 跳转到期权报价页面，传递股票信息
      const url = `/pages/quotes/quotes?stockCode=${item.code}&stockName=${item.name}&source=inquiry`;
      wx.navigateTo({
        url,
        success: () => {
          console.log('[跳转] 报价页成功:', url);
        },
        fail: (err) => {
          console.error('[跳转] 报价页失败，尝试备用详情页:', err);
          const fallback = `/pages/inquiry/detail/detail?id=${item.id || 1}`;
          wx.navigateTo({ url: fallback, fail: (e2) => console.error('[跳转] 备用详情页失败:', e2) });
        }
      });
    } else {
      // 原有的搜索结果处理逻辑
      console.log('点击搜索结果:', item);
    }
  },
});
