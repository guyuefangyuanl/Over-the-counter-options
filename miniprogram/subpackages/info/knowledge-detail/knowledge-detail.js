// pages/knowledge-detail/knowledge-detail.js
const app = getApp();
const { uiEnhancer } = require('../../../utils/enhancedUtils');
const { getArticleById, getKnowledgeArticles, getArticleUrl, openArticleInBrowser } = require('../../../utils/knowledgeConfig.js');

Page({
  data: {
    // 文章ID
    articleId: null,

    // 文章数据
    article: {},

    // 相关文章
    relatedArticles: [],

    // 加载状态
    loading: true,

    // 用户交互状态
    isLiked: false,
    isCollected: false
  },

  onLoad(options) {
    const { id } = options;

    if (!id) {
      uiEnhancer.showToast('文章ID不存在', 'error');
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    this.setData({ articleId: parseInt(id) });

    // 加载文章详情
    this.loadArticleDetail();

    // 检查用户是否已点赞/收藏
    this.checkUserInteraction();
  },

  onShow() {
    // 增加阅读数
    if (this.data.articleId && !this.data.loading) {
      this.incrementViews();
    }
  },

  /**
   * 加载文章详情
   */
  async loadArticleDetail() {
    this.setData({ loading: true });

    try {
      // 从配置文件获取文章
      const article = getArticleById(this.data.articleId);

      if (!article) {
        uiEnhancer.showToast('文章不存在', 'error');
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }

      // 生成文章内容（如果是从外部链接的文章）
      const articleWithContent = this.generateArticleContent(article);

      // 加载相关文章
      const relatedArticles = this.getRelatedArticles(article.category, article.id);

      this.setData({
        article: articleWithContent,
        relatedArticles: relatedArticles,
        loading: false
      });

      // 设置页面标题
      wx.setNavigationBarTitle({
        title: article.title || '文章详情'
      });
    } catch (error) {
      console.error('加载文章详情失败:', error);
      uiEnhancer.showToast('加载失败，请重试', 'error');
      this.setData({ loading: false });
    }
  },

  /**
   * 生成文章内容
   */
  generateArticleContent(article) {
    // 如果已有内容，直接返回
    if (article.content) {
      return article;
    }

    // 根据文章ID生成对应内容
    const contents = {
      1: `
        <h2>一、什么是场外个股期权</h2>
        <p>场外个股期权（OTC Stock Options）是指在非集中性的交易场所（即场外市场）进行的个股期权交易。与交易所内交易的标准化期权不同，场外个股期权具有更高的灵活性，可以根据投资者的需求定制合约条款。</p>

        <h2>二、场外个股期权的特点</h2>
        <p><strong>1. 定制化程度高</strong></p>
        <p>投资者可以根据自己的投资策略和风险偏好，与交易对手协商确定期权的行权价格、到期日、名义本金等关键条款。</p>

        <p><strong>2. 交易对手风险</strong></p>
        <p>场外交易没有清算所作为中央对手方，投资者需要承担交易对手的信用风险。</p>

        <p><strong>3. 流动性相对较低</strong></p>
        <p>由于合约条款的定制化，场外期权通常不如交易所期权流动性好。</p>

        <h2>三、基本交易流程</h2>
        <p>1. <strong>询价</strong>：投资者向交易商提交询价请求，说明标的股票、期权类型、期限、名义本金等信息。</p>
        <p>2. <strong>报价</strong>：交易商根据市场情况给出期权费报价。</p>
        <p>3. <strong>确认交易</strong>：双方就交易条款达成一致后，签署交易确认书。</p>
        <p>4. <strong>支付期权费</strong>：买方支付期权费，交易生效。</p>
        <p>5. <strong>行权或到期</strong>：到期时根据合约条款进行结算。</p>

        <h2>四、风险控制要点</h2>
        <p>• 充分了解产品特性和风险</p>
        <p>• 选择信誉良好的交易对手</p>
        <p>• 合理控制仓位，避免过度集中</p>
        <p>• 设置止损止盈点</p>
        <p>• 持续关注标的股票和市场变化</p>
      `,
      2: `
        <h2>一、询价分组管理功能概述</h2>
        <p>询价分组管理是场外期权交易中的重要功能，帮助投资者更好地组织和管理不同标的的询价信息。</p>

        <h2>二、分组管理的优势</h2>
        <p><strong>1. 提高效率</strong></p>
        <p>通过分组管理，可以快速对相关标的进行批量操作，提高询价效率。</p>

        <p><strong>2. 便于管理</strong></p>
        <p>将不同策略、不同行业的标的分别管理，便于后续分析和决策。</p>

        <h2>三、新建分组步骤</h2>
        <p>1. 进入询价页面，点击分组管理</p>
        <p>2. 点击"新建分组"按钮</p>
        <p>3. 输入分组名称和描述</p>
        <p>4. 选择要添加的标的</p>
        <p>5. 保存分组</p>
      `,
      3: `
        <h2>一、持仓管理的重要性</h2>
        <p>良好的持仓管理是期权投资成功的关键。它不仅关系到单笔交易的盈亏，更影响整体投资组合的风险收益特征。</p>

        <h2>二、仓位控制原则</h2>
        <p><strong>1. 分散投资</strong></p>
        <p>不要把所有资金集中在单一标的或单一策略上。建议将资金分散到3-5个不同的标的，降低单一标的风险。</p>

        <p><strong>2. 控制单笔仓位</strong></p>
        <p>单笔交易的期权费建议不超过总资金的10-20%，避免单次交易对整体组合造成重大影响。</p>

        <h2>三、止损策略</h2>
        <p>• 固定比例止损</p>
        <p>• 时间止损</p>
        <p>• 技术止损</p>
      `
    };

    return {
      ...article,
      content: contents[article.id] || this.generateDefaultContent(article),
      updateTime: article.date,
      tags: article.tags || ['期权', '投资']
    };
  },

  /**
   * 生成默认内容
   */
  generateDefaultContent(article) {
    return `
      <h2>文章简介</h2>
      <p>${article.summary || '本文为您详细介绍场外期权相关知识，帮助您更好地理解和运用期权工具进行投资。'}</p>

      <h2>主要内容</h2>
      <p>点击"在浏览器中查看完整内容"可以访问完整的文章。</p>
    `;
  },

  /**
   * 获取相关文章
   */
  getRelatedArticles(category, currentId) {
    const allArticles = getKnowledgeArticles();
    return allArticles
      .filter(a => a.id !== currentId)
      .slice(0, 3);
  },

  /**
   * 检查用户交互状态
   */
  checkUserInteraction() {
    try {
      const likedArticles = wx.getStorageSync('likedArticles') || [];
      const collectedArticles = wx.getStorageSync('collectedArticles') || [];

      this.setData({
        isLiked: likedArticles.includes(this.data.articleId),
        isCollected: collectedArticles.includes(this.data.articleId)
      });
    } catch (error) {
      console.error('检查用户交互状态失败:', error);
    }
  },

  /**
   * 增加阅读数
   */
  incrementViews() {
    // 实际项目中应该调用 API 增加阅读数
  },

  /**
   * 点赞
   */
  onLike() {
    uiEnhancer.hapticFeedback('light');

    const { isLiked, articleId, article } = this.data;
    const newLiked = !isLiked;

    // 更新本地存储
    try {
      let likedArticles = wx.getStorageSync('likedArticles') || [];
      if (newLiked) {
        likedArticles.push(articleId);
      } else {
        likedArticles = likedArticles.filter(id => id !== articleId);
      }
      wx.setStorageSync('likedArticles', likedArticles);
    } catch (error) {
      console.error('更新点赞状态失败:', error);
    }

    // 更新界面
    this.setData({
      isLiked: newLiked,
      'article.likes': newLiked ? (article.likes || 0) + 1 : Math.max(0, (article.likes || 0) - 1)
    });

    uiEnhancer.showToast(newLiked ? '点赞成功' : '取消点赞', 'success');
  },

  /**
   * 收藏
   */
  onCollect() {
    uiEnhancer.hapticFeedback('light');

    const { isCollected, articleId } = this.data;
    const newCollected = !isCollected;

    // 更新本地存储
    try {
      let collectedArticles = wx.getStorageSync('collectedArticles') || [];
      if (newCollected) {
        collectedArticles.push(articleId);
      } else {
        collectedArticles = collectedArticles.filter(id => id !== articleId);
      }
      wx.setStorageSync('collectedArticles', collectedArticles);
    } catch (error) {
      console.error('更新收藏状态失败:', error);
    }

    // 更新界面
    this.setData({ isCollected: newCollected });

    uiEnhancer.showToast(newCollected ? '收藏成功' : '取消收藏', 'success');
  },

  /**
   * 分享
   */
  onShare() {
    uiEnhancer.hapticFeedback('light');

    // 显示分享菜单
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
  },

  /**
   * 打开外部链接
   */
  onOpenExternal() {
    const { article } = this.data;
    if (article) {
      openArticleInBrowser(article);
    }
  },

  /**
   * 点击相关文章
   */
  onRelatedTap(e) {
    const { id } = e.currentTarget.dataset;
    uiEnhancer.hapticFeedback('light');

    // 跳转到另一篇文章
    wx.redirectTo({
      url: `/subpackages/info/knowledge-detail/knowledge-detail?id=${id}`
    });
  },

  /**
   * 返回上一页
   */
  goBack() {
    wx.navigateBack();
  },

  /**
   * 分享给好友
   */
  onShareAppMessage() {
    const { article } = this.data;
    return {
      title: article.title || '期权知识文章',
      path: `/subpackages/info/knowledge-detail/knowledge-detail?id=${article.id}`,
      imageUrl: article.cover || '/images/logo.png'
    };
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    const { article } = this.data;
    return {
      title: article.title || '期权知识文章',
      query: `id=${article.id}`,
      imageUrl: article.cover || '/images/logo.png'
    };
  }
});