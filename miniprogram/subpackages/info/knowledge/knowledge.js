// pages/knowledge/knowledge.js
const app = getApp();
const { uiEnhancer } = require('../../utils/enhancedUtils');

Page({
  data: {
    categories: [
      { id: 1, name: '期权基础', icon: 'book' },
      { id: 2, name: '交易策略', icon: 'chart' },
      { id: 3, name: '风险管理', icon: 'shield' },
      { id: 4, name: '市场分析', icon: 'analysis' }
    ],
    articles: [],
    currentCategory: 0,
    loading: true,
    searchKeyword: ''
  },

  onLoad() {
    this.loadArticles();
  },

  onShow() {
    // 刷新数据
  },

  async loadArticles() {
    this.setData({ loading: true });

    try {
      const res = await wx.request({
        url: `${app.globalData.apiBaseUrl}/api/knowledge/articles`,
        method: 'GET',
        data: {
          category: this.data.currentCategory || undefined,
          keyword: this.data.searchKeyword || undefined
        }
      });

      if (res.data.success) {
        this.setData({
          articles: res.data.data || [],
          loading: false
        });
      } else {
        // 使用模拟数据
        this.loadMockArticles();
      }
    } catch (error) {
      console.error('加载文章失败:', error);
      this.loadMockArticles();
    }
  },

  loadMockArticles() {
    const mockArticles = [
      {
        id: 1,
        title: '什么是场外期权？',
        summary: '场外期权是指在非交易所交易的期权合约，具有灵活性高、可定制的特点...',
        category: '期权基础',
        views: 1234,
        likes: 89,
        createTime: '2024-01-15'
      },
      {
        id: 2,
        title: '香草期权交易策略入门',
        summary: '香草期权是最基础的期权类型，包括看涨期权和看跌期权...',
        category: '交易策略',
        views: 856,
        likes: 67,
        createTime: '2024-01-12'
      },
      {
        id: 3,
        title: '如何管理期权交易风险',
        summary: '期权交易具有高杠杆特性，合理的风险管理是成功交易的关键...',
        category: '风险管理',
        views: 654,
        likes: 45,
        createTime: '2024-01-10'
      },
      {
        id: 4,
        title: '期权定价模型详解',
        summary: 'Black-Scholes模型是最常用的期权定价模型，了解其原理有助于...',
        category: '期权基础',
        views: 523,
        likes: 34,
        createTime: '2024-01-08'
      }
    ];

    this.setData({
      articles: mockArticles,
      loading: false
    });
  },

  onCategoryChange(e) {
    const { id } = e.currentTarget.dataset;
    this.setData({ currentCategory: id });
    this.loadArticles();
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value });
  },

  onSearch() {
    this.loadArticles();
  },

  onArticleTap(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/knowledge-detail/knowledge-detail?id=${id}`
    });
  },

  onPullDownRefresh() {
    this.loadArticles().then(() => {
      wx.stopPullDownRefresh();
    });
  }
});