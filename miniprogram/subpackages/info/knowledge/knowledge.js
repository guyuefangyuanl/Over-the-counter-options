// pages/knowledge/knowledge.js
const app = getApp();
const { uiEnhancer } = require('../../../utils/enhancedUtils');
const { getKnowledgeArticles, getArticlesByCategory, getArticleById, openArticleInBrowser } = require('../../../utils/knowledgeConfig.js');

// 每页显示数量
const PAGE_SIZE = 10;

Page({
  data: {
    // 分类列表
    categories: [
      { category: 'option', name: '期权基础' },
      { category: 'strategy', name: '交易策略' },
      { category: 'risk', name: '风险管理' },
      { category: 'analysis', name: '市场分析' }
    ],

    // 分类统计
    categoryCounts: {
      all: 0,
      option: 0,
      strategy: 0,
      risk: 0,
      analysis: 0
    },

    // 当前分类
    currentCategory: 'all',

    // 文章列表
    allArticles: [],
    filteredArticles: [],

    // 搜索关键词
    searchKeyword: '',

    // 加载状态
    loading: true,

    // 分页
    page: 1,
    hasMore: true
  },

  onLoad() {
    this.loadArticles();
  },

  onShow() {
    // 刷新数据
  },

  /**
   * 加载文章列表
   */
  loadArticles() {
    this.setData({ loading: true });

    // 模拟网络延迟
    setTimeout(() => {
      try {
        const articles = getKnowledgeArticles();

        // 计算分类统计
        const counts = { all: articles.length };
        this.data.categories.forEach(cat => {
          counts[cat.category] = articles.filter(a => a.category === cat.category).length;
        });

        this.setData({
          allArticles: articles,
          categoryCounts: counts,
          loading: false
        });

        // 应用筛选
        this.applyFilter();
      } catch (error) {
        console.error('加载文章失败:', error);
        this.setData({ loading: false });
        uiEnhancer.showToast('加载失败，请重试', 'error');
      }
    }, 400);
  },

  /**
   * 应用筛选条件
   */
  applyFilter() {
    const { allArticles, currentCategory, searchKeyword } = this.data;
    let filtered = [...allArticles];

    // 分类筛选
    if (currentCategory !== 'all') {
      filtered = filtered.filter(a => a.category === currentCategory);
    }

    // 关键词搜索
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase().trim();
      filtered = filtered.filter(a =>
        a.title.toLowerCase().includes(keyword) ||
        (a.summary && a.summary.toLowerCase().includes(keyword))
      );
    }

    this.setData({
      filteredArticles: filtered,
      hasMore: filtered.length > PAGE_SIZE
    });
  },

  /**
   * 分类切换
   */
  onCategoryChange(e) {
    const { id } = e.currentTarget.dataset;
    uiEnhancer.hapticFeedback('light');

    if (id === this.data.currentCategory) return;

    this.setData({
      currentCategory: id,
      page: 1
    });
    this.applyFilter();
  },

  /**
   * 搜索输入
   */
  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value });
  },

  /**
   * 执行搜索
   */
  onSearch() {
    this.setData({ page: 1 });
    this.applyFilter();
  },

  /**
   * 清除搜索
   */
  onClearSearch() {
    this.setData({
      searchKeyword: '',
      page: 1
    });
    this.applyFilter();
  },

  /**
   * 加载更多
   */
  onLoadMore() {
    if (!this.data.hasMore) return;

    this.setData({
      page: this.data.page + 1
    });
  },

  /**
   * 文章点击
   */
  onArticleTap(e) {
    const { id } = e.currentTarget.dataset;
    uiEnhancer.hapticFeedback('light');

    const article = getArticleById(id);
    if (!article) {
      uiEnhancer.showToast('文章不存在', 'error');
      return;
    }

    // 跳转到详情页
    wx.navigateTo({
      url: `/subpackages/info/knowledge-detail/knowledge-detail?id=${id}`,
      fail: () => {
        // 降级处理：在浏览器中打开
        openArticleInBrowser(article);
      }
    });
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.loadArticles();
    setTimeout(() => {
      wx.stopPullDownRefresh();
    }, 500);
  },

  /**
   * 分享
   */
  onShareAppMessage() {
    return {
      title: '期权知识库 - 场外期权专业知识',
      path: '/subpackages/info/knowledge/knowledge'
    };
  }
});