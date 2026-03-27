/**
 * 市场分析页面
 */
const api = require('../../utils/api.js');

Page({
  data: {
    // 市场指数
    marketIndexes: [],
    indexesLoading: false,

    // 热门标的
    hotStocks: [],
    hotStocksLoading: false,

    // 市场情绪
    marketSentiment: {
      fearGreedIndex: 50,
      sentiment: '中性',
      trend: '震荡'
    },

    // 分析文章
    articles: [],
    articlesLoading: false,
    page: 1,
    hasMore: true,

    // 下拉刷新
    refresherTriggered: false
  },

  onLoad: function() {
    this.loadData();
  },

  onPullDownRefresh: function() {
    this.loadData().finally(function() {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function() {
    if (this.data.hasMore && !this.data.articlesLoading) {
      this.loadArticles();
    }
  },

  /**
   * 加载数据
   */
  loadData: function() {
    this.loadMarketIndexes();
    this.loadHotStocks();
    return this.loadArticles();
  },

  /**
   * 加载市场指数
   */
  loadMarketIndexes: function() {
    const self = this;
    this.setData({ indexesLoading: true });

    api.get('/stock/market-indexes', {}, {}, { silent: true })
      .then(function(res) {
        if (res.success && res.data) {
          self.setData({
            marketIndexes: res.data.list || res.data || [],
            indexesLoading: false
          });
        } else {
          // 使用模拟数据
          self.setData({
            marketIndexes: [
              { name: '上证指数', code: '000001', price: 3420.35, changePercent: 0.37 },
              { name: '深证成指', code: '399001', price: 10856.24, changePercent: -0.42 },
              { name: '创业板指', code: '399006', price: 2198.76, changePercent: 0.41 },
              { name: '沪深300', code: '000300', price: 4120.15, changePercent: 0.25 },
              { name: '中证500', code: '000905', price: 6420.35, changePercent: -0.44 },
              { name: '上证50', code: '000016', price: 2845.60, changePercent: 0.18 }
            ],
            indexesLoading: false
          });
        }
      })
      .catch(function(err) {
        console.error('加载市场指数失败:', err);
        self.setData({
          marketIndexes: [
            { name: '上证指数', code: '000001', price: 3420.35, changePercent: 0.37 },
            { name: '深证成指', code: '399001', price: 10856.24, changePercent: -0.42 },
            { name: '创业板指', code: '399006', price: 2198.76, changePercent: 0.41 }
          ],
          indexesLoading: false
        });
      });
  },

  /**
   * 加载热门标的
   */
  loadHotStocks: function() {
    const self = this;
    this.setData({ hotStocksLoading: true });

    // 使用模拟数据
    setTimeout(function() {
      self.setData({
        hotStocks: [
          { code: '510050', name: '上证50ETF', price: 2.445, changePercent: -0.65 },
          { code: '510300', name: '沪深300ETF', price: 4.125, changePercent: 0.32 },
          { code: '159915', name: '创业板ETF', price: 2.156, changePercent: 0.58 },
          { code: '000651', name: '格力电器', price: 35.68, changePercent: 1.25 },
          { code: '600519', name: '贵州茅台', price: 1856.00, changePercent: -0.35 }
        ],
        hotStocksLoading: false
      });
    }, 300);
  },

  /**
   * 加载分析文章
   */
  loadArticles: function() {
    const self = this;
    const { page } = this.data;

    this.setData({ articlesLoading: true });

    // 使用模拟数据
    return new Promise(function(resolve) {
      setTimeout(function() {
        const mockArticles = [
          {
            id: 1,
            title: '期权市场周报：波动率上升，关注避险策略',
            summary: '本周市场波动加大，期权隐含波动率明显上升...',
            publishTime: '2024-12-30',
            readCount: 1256
          },
          {
            id: 2,
            title: '如何利用期权进行风险管理',
            summary: '期权作为重要的风险管理工具，可以有效对冲持仓风险...',
            publishTime: '2024-12-28',
            readCount: 2345
          },
          {
            id: 3,
            title: '场外期权交易策略解析',
            summary: '场外期权相比场内期权具有更高的灵活性...',
            publishTime: '2024-12-25',
            readCount: 1890
          }
        ];

        const newArticles = page === 1 ? mockArticles : self.data.articles.concat(mockArticles);

        self.setData({
          articles: newArticles,
          page: page + 1,
          hasMore: page < 3,
          articlesLoading: false
        });

        resolve();
      }, 300);
    });
  },

  /**
   * 跳转到标的详情
   */
  goToStockDetail: function(e) {
    const code = e.currentTarget.dataset.code;
    if (!code) return;

    wx.navigateTo({
      url: '/pages/stock-detail/stock-detail?code=' + code
    });
  },

  /**
   * 查看文章详情
   */
  goToArticleDetail: function(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;

    wx.showToast({
      title: '文章详情功能开发中',
      icon: 'none'
    });
  },

  /**
   * 格式化涨跌幅
   */
  _formatChange: function(value) {
    if (value === null || value === undefined) return '--';
    return (value >= 0 ? '+' : '') + value.toFixed(2) + '%';
  }
});