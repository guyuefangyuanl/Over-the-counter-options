// 搜索股票页面
const stockService = require('../../utils/stock-service.js');

Page({
  data: {
    keyword: '',
    results: [],
    hotStocks: [],
    showResults: false,
    loading: false
  },

  onLoad: function() {
    console.log('搜索股票页面加载');
    this.loadHotStocks();
  },

  // 加载热门股票
  loadHotStocks: function() {
    // 模拟热门股票数据
    const hotStocks = [
      { code: '000001', name: '平安银行', price: 11.36, change: 0.61, changePercent: 5.68 },
      { code: '000002', name: '万科A', price: 8.92, change: -0.23, changePercent: -2.51 },
      { code: '600036', name: '招商银行', price: 35.67, change: 1.25, changePercent: 3.63 },
      { code: '600519', name: '贵州茅台', price: 1678.90, change: -12.30, changePercent: -0.73 },
      { code: '000858', name: '五粮液', price: 128.45, change: 2.15, changePercent: 1.70 },
      { code: '600000', name: '浦发银行', price: 8.45, change: 0.15, changePercent: 1.81 },
      { code: '000333', name: '美的集团', price: 56.78, change: -0.89, changePercent: -1.54 },
      { code: '002415', name: '海康威视', price: 32.15, change: 0.45, changePercent: 1.42 }
    ];

    this.setData({ hotStocks });
  },

  // 输入事件
  onInput: function(e) {
    const keyword = e.detail.value.trim();
    this.setData({ keyword });

    // 延迟搜索，避免频繁请求
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }

    if (keyword) {
      this.searchTimer = setTimeout(() => {
        this.onSearch();
      }, 500);
    } else {
      this.setData({ showResults: false, results: [] });
    }
  },

  // 搜索事件
  onSearch: function() {
    const { keyword } = this.data;
    if (!keyword) {
      this.setData({ showResults: false, results: [] });
      return;
    }

    this.setData({ loading: true, showResults: true });

    // 模拟搜索延迟
    setTimeout(() => {
      const results = this.mockSearch(keyword);
      this.setData({ results, loading: false });
    }, 600);
  },

  // 模拟搜索
  mockSearch: function(keyword) {
    const stockDatabase = [
      { code: '000001', name: '平安银行', price: 11.36, change: 0.61, changePercent: 5.68 },
      { code: '000002', name: '万科A', price: 8.92, change: -0.23, changePercent: -2.51 },
      { code: '600000', name: '浦发银行', price: 8.45, change: 0.15, changePercent: 1.81 },
      { code: '600036', name: '招商银行', price: 35.67, change: 1.25, changePercent: 3.63 },
      { code: '600519', name: '贵州茅台', price: 1678.90, change: -12.30, changePercent: -0.73 },
      { code: '000858', name: '五粮液', price: 128.45, change: 2.15, changePercent: 1.70 },
      { code: '000333', name: '美的集团', price: 56.78, change: -0.89, changePercent: -1.54 },
      { code: '002415', name: '海康威视', price: 32.15, change: 0.45, changePercent: 1.42 },
      { code: '300750', name: '宁德时代', price: 198.50, change: 3.20, changePercent: 1.64 },
      { code: '600887', name: '伊利股份', price: 28.90, change: -0.45, changePercent: -1.53 }
    ];

    return stockDatabase.filter(stock => 
      stock.code.includes(keyword) || 
      stock.name.includes(keyword)
    );
  },

  // 选择股票
  onSelectStock: function(e) {
    const stock = e.currentTarget.dataset.item;
    console.log('选择股票:', stock);

    // 构造股票信息对象
    const stockInfo = {
      code: stock.code,
      name: stock.name,
      price: stock.price,
      change: stock.change,
      changePercent: stock.changePercent,
      market: stock.code.startsWith('6') ? 'SH' : 'SZ'
    };

    // 返回上一页并传递数据
    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2];
    
    if (prevPage && prevPage.route === 'pages/quotes/quotes') {
      // 直接调用上一页的方法更新数据
      prevPage.updateStockInfo(stockInfo);
      wx.navigateBack();
    } else {
      // 如果没有上一页，直接跳转到报价页
      wx.redirectTo({
        url: `/pages/quotes/quotes?stock=${encodeURIComponent(JSON.stringify(stockInfo))}`
      });
    }
  },

  // 返回上一页
  goBack: function() {
    wx.navigateBack();
  },

  onUnload: function() {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
  }
});