/**
 * 资讯中心页面
 */
Page({
  data: {
    // 分类
    categories: ['全部', '市场动态', '政策法规', '交易技巧', '产品介绍'],
    activeCategory: '全部',

    // 资讯列表
    articles: [],
    loading: false,
    page: 1,
    hasMore: true,

    // 搜索
    searchKeyword: '',
    showSearch: false
  },

  onLoad: function() {
    this.loadArticles();
  },

  onPullDownRefresh: function() {
    this.refreshArticles().finally(function() {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadArticles();
    }
  },

  /**
   * 刷新文章列表
   */
  refreshArticles: function() {
    this.setData({
      page: 1,
      articles: [],
      hasMore: true
    });
    return this.loadArticles();
  },

  /**
   * 加载文章
   */
  loadArticles: function() {
    const self = this;
    const { page, activeCategory, searchKeyword } = this.data;

    if (this.data.loading) return Promise.resolve();

    this.setData({ loading: true });

    // 模拟数据
    return new Promise(function(resolve) {
      setTimeout(function() {
        const categoryArticles = {
          '全部': [
            { id: 1, title: '期权市场新规解读', category: '政策法规', summary: '证监会发布期权交易新规定...', publishTime: '2024-12-30', readCount: 1567, cover: '' },
            { id: 2, title: '本周市场行情分析', category: '市场动态', summary: '本周A股市场整体呈现震荡走势...', publishTime: '2024-12-29', readCount: 2345, cover: '' },
            { id: 3, title: '期权交易入门指南', category: '交易技巧', summary: '期权作为一种衍生品工具...', publishTime: '2024-12-28', readCount: 3890, cover: '' }
          ],
          '市场动态': [
            { id: 4, title: '本周市场行情分析', category: '市场动态', summary: '本周A股市场整体呈现震荡走势...', publishTime: '2024-12-29', readCount: 2345, cover: '' }
          ],
          '政策法规': [
            { id: 5, title: '期权市场新规解读', category: '政策法规', summary: '证监会发布期权交易新规定...', publishTime: '2024-12-30', readCount: 1567, cover: '' }
          ],
          '交易技巧': [
            { id: 6, title: '期权交易入门指南', category: '交易技巧', summary: '期权作为一种衍生品工具...', publishTime: '2024-12-28', readCount: 3890, cover: '' }
          ],
          '产品介绍': [
            { id: 7, title: '场外期权产品介绍', category: '产品介绍', summary: '场外期权是指在场外市场进行交易的期权...', publishTime: '2024-12-27', readCount: 1234, cover: '' }
          ]
        };

        const newArticles = categoryArticles[activeCategory] || categoryArticles['全部'];
        const currentList = page === 1 ? newArticles : self.data.articles.concat(newArticles);

        self.setData({
          articles: currentList,
          page: page + 1,
          hasMore: page < 2,
          loading: false
        });

        resolve();
      }, 300);
    });
  },

  /**
   * 切换分类
   */
  switchCategory: function(e) {
    const category = e.currentTarget.dataset.category;
    if (category === this.data.activeCategory) return;

    this.setData({
      activeCategory: category,
      page: 1,
      articles: [],
      hasMore: true
    });
    this.loadArticles();
  },

  /**
   * 显示搜索
   */
  showSearchInput: function() {
    this.setData({ showSearch: true });
  },

  /**
   * 隐藏搜索
   */
  hideSearchInput: function() {
    this.setData({
      showSearch: false,
      searchKeyword: ''
    });
  },

  /**
   * 搜索输入
   */
  onSearchInput: function(e) {
    this.setData({ searchKeyword: e.detail.value });
  },

  /**
   * 执行搜索
   */
  onSearch: function() {
    if (!this.data.searchKeyword.trim()) return;
    this.refreshArticles();
  },

  /**
   * 查看文章详情
   */
  goToArticleDetail: function(e) {
    const id = e.currentTarget.dataset.id;
    wx.showToast({
      title: '文章详情功能开发中',
      icon: 'none'
    });
  },

  /**
   * 格式化时间
   */
  _formatTime: function(time) {
    if (!time) return '--';
    return time;
  }
});