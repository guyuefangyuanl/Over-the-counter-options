/**
 * 市场详情页面
 */
const api = require('../../utils/api.js');

Page({
  data: {
    // 标的信息
    stockCode: '',
    stockInfo: {
      code: '',
      name: '',
      price: 0,
      changePercent: 0,
      open: 0,
      high: 0,
      low: 0,
      preClose: 0,
      volume: 0,
      amount: 0
    },

    // K线类型
    chartType: 'day',

    // 相关期权
    optionQuotes: [],

    // 加载状态
    stockLoading: false,
    quotesLoading: false,

    // 是否收藏
    isFavorite: false
  },

  onLoad: function(options) {
    const code = options.code || '510050';
    this.setData({ stockCode: code });
    this.loadStockInfo();
    this.loadOptionQuotes();
  },

  /**
   * 加载标的信息
   */
  loadStockInfo: function() {
    const self = this;
    const code = this.data.stockCode;

    this.setData({ stockLoading: true });

    api.get('/stock/realtime/' + code, {}, {}, { silent: true })
      .then(function(res) {
        if (res.success && res.data) {
          self.setData({
            stockInfo: res.data,
            stockLoading: false
          });
        } else {
          // 使用模拟数据
          self.setData({
            stockInfo: {
              code: code,
              name: code === '510050' ? '上证50ETF' : '标的资产',
              price: 2.445,
              changePercent: -0.65,
              open: 2.460,
              high: 2.470,
              low: 2.440,
              preClose: 2.461,
              volume: 152000000,
              amount: 371500000
            },
            stockLoading: false
          });
        }
      })
      .catch(function(err) {
        console.error('加载标的信息失败:', err);
        self.setData({
          stockInfo: {
            code: code,
            name: code === '510050' ? '上证50ETF' : '标的资产',
            price: 2.445,
            changePercent: -0.65,
            open: 2.460,
            high: 2.470,
            low: 2.440,
            preClose: 2.461,
            volume: 152000000,
            amount: 371500000
          },
          stockLoading: false
        });
      });
  },

  /**
   * 加载期权报价
   */
  loadOptionQuotes: function() {
    const self = this;
    const code = this.data.stockCode;

    this.setData({ quotesLoading: true });

    // 模拟数据
    setTimeout(function() {
      self.setData({
        optionQuotes: [
          { type: '看涨', term: '1M', strike: '100%', premium: '3.2%', broker: '券商A' },
          { type: '看涨', term: '3M', strike: '105%', premium: '4.5%', broker: '券商B' },
          { type: '看跌', term: '1M', strike: '95%', premium: '2.8%', broker: '券商A' },
          { type: '看跌', term: '3M', strike: '90%', premium: '3.8%', broker: '券商C' }
        ],
        quotesLoading: false
      });
    }, 300);
  },

  /**
   * 切换K线类型
   */
  switchChartType: function(e) {
    const type = e.currentTarget.dataset.type;
    if (type === this.data.chartType) return;
    this.setData({ chartType: type });
  },

  /**
   * 切换收藏
   */
  toggleFavorite: function() {
    const isFavorite = !this.data.isFavorite;
    this.setData({ isFavorite: isFavorite });
    wx.showToast({
      title: isFavorite ? '已收藏' : '已取消收藏',
      icon: 'success'
    });
  },

  /**
   * 跳转询价
   */
  goToInquiry: function() {
    const code = this.data.stockCode;
    wx.navigateTo({
      url: '/pages/quotes/quotes?code=' + code
    });
  },

  /**
   * 格式化金额
   */
  _formatAmount: function(amount) {
    if (!amount) return '--';
    if (amount >= 100000000) {
      return (amount / 100000000).toFixed(2) + '亿';
    } else if (amount >= 10000) {
      return (amount / 10000).toFixed(2) + '万';
    }
    return amount.toLocaleString();
  }
});