// pages/knowledge/knowledge.js
const app = getApp();
const { uiEnhancer } = require('../../utils/enhancedUtils');
const knowledgeConfig = require('../../utils/knowledgeConfig');

Page({
  data: {
    // 搜索关键词
    searchKeyword: '',
    
    // 分类数据
    categories: [
      { id: 'all', name: '全部' },
      { id: 'option', name: '期权基础' },
      { id: 'vanilla', name: '香草期权' },
      { id: 'strategy', name: '交易策略' },
      { id: 'risk', name: '风险管理' },
      { id: 'market', name: '市场分析' }
    ],
    activeCategory: 'all',
    
    // 知识列表
    knowledgeList: [],
    filteredKnowledgeList: [],
    
    // 加载状态
    loading: true,
    loadingMore: false,
    hasMore: true,
    
    // 分页
    page: 1,
    pageSize: 10
  },

  onLoad(options) {
    // 设置导航栏标题
    wx.setNavigationBarTitle({
      title: '知识中心'
    });
    
    // 如果有传入分类参数，切换到对应分类
    if (options.category) {
      this.setData({ activeCategory: options.category });
    }
    
    // 加载知识列表
    this.loadKnowledgeList();
  },

  onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true });
    this.loadKnowledgeList().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.loadMore();
    }
  },

  // 加载知识列表
  async loadKnowledgeList() {
    this.setData({ loading: true });
    
    try {
      // 从配置文件获取数据
      const knowledgeList = knowledgeConfig.getKnowledgeArticles();
      
      this.setData({
        knowledgeList: knowledgeList,
        loading: false
      });
      
      // 应用当前筛选条件
      this.filterKnowledgeList();
    } catch (error) {
      console.error('加载知识列表失败:', error);
      uiEnhancer.showToast('加载失败，请重试', 'error');
      this.setData({ loading: false });
    }
  },

  // 筛选知识列表
  filterKnowledgeList() {
    const { knowledgeList, activeCategory, searchKeyword } = this.data;
    
    let filtered = knowledgeList;
    
    // 按分类筛选
    if (activeCategory !== 'all') {
      filtered = filtered.filter(item => item.category === activeCategory);
    }
    
    // 按关键词搜索
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      filtered = filtered.filter(item => 
        item.title.toLowerCase().includes(keyword) ||
        item.summary.toLowerCase().includes(keyword) ||
        item.categoryName.toLowerCase().includes(keyword)
      );
    }
    
    this.setData({ filteredKnowledgeList: filtered });
  },

  // 分类切换
  onCategoryChange(e) {
    const categoryId = e.currentTarget.dataset.id;
    if (categoryId === this.data.activeCategory) return;
    
    uiEnhancer.hapticFeedback('light');
    this.setData({ activeCategory: categoryId }, () => {
      this.filterKnowledgeList();
    });
  },

  // 搜索输入
  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value });
  },

  // 执行搜索
  onSearch() {
    uiEnhancer.hapticFeedback('light');
    this.filterKnowledgeList();
  },

  // 加载更多
  async loadMore() {
    if (this.data.loadingMore || !this.data.hasMore) return;
    
    this.setData({ loadingMore: true });
    
    try {
      // 模拟加载更多数据
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 实际项目中应该调用 API 加载更多
      // const res = await api.get('/api/knowledge/list', { page: this.data.page + 1, pageSize: this.data.pageSize });
      
      // 模拟没有更多数据
      this.setData({ 
        hasMore: false,
        loadingMore: false
      });
    } catch (error) {
      console.error('加载更多失败:', error);
      this.setData({ loadingMore: false });
    }
  },

  // 点击知识文章
  onKnowledgeTap(e) {
    const { id } = e.currentTarget.dataset;
    uiEnhancer.hapticFeedback('light');
    
    // 获取文章信息
    const article = knowledgeConfig.getArticleById(id);
    
    if (article && article.type === 'external') {
      // 外部链接，显示提示并复制链接
      knowledgeConfig.openArticleInBrowser(article);
    } else {
      // 内部页面，跳转到详情页
      wx.navigateTo({
        url: `/pages/knowledge-detail/knowledge-detail?id=${id}`,
        fail: () => {
          // 如果新页面不存在，跳转到现有的 data-explanation 页面
          wx.navigateTo({
            url: `/pages/data-explanation/data-explanation?from=knowledge&id=${id}`,
            fail: () => {
              uiEnhancer.showToast('页面开发中', 'none');
            }
          });
        }
      });
    }
  },

  // 返回上一页
  goBack() {
    wx.navigateBack();
  },

  // 分享
  onShareAppMessage() {
    return {
      title: '期权知识中心 - 学习期权投资',
      path: '/pages/knowledge/knowledge'
    };
  }
});
