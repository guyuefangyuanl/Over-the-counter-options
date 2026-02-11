// pages/knowledge-detail/knowledge-detail.js
const app = getApp();
const { uiEnhancer } = require('../../utils/enhancedUtils');

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
      wx.navigateBack();
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

  // 加载文章详情
  async loadArticleDetail() {
    this.setData({ loading: true });
    
    try {
      // 模拟从服务器获取数据
      // 实际项目中应该调用 API: const res = await api.get(`/api/knowledge/detail/${this.data.articleId}`);
      const article = await this.fetchArticleData(this.data.articleId);
      
      // 加载相关文章
      const relatedArticles = await this.fetchRelatedArticles(article.category, article.id);
      
      this.setData({
        article: article,
        relatedArticles: relatedArticles,
        loading: false
      });
      
      // 设置页面标题
      wx.setNavigationBarTitle({
        title: article.title
      });
    } catch (error) {
      console.error('加载文章详情失败:', error);
      uiEnhancer.showToast('加载失败，请重试', 'error');
      this.setData({ loading: false });
    }
  },

  // 模拟获取文章数据
  fetchArticleData(id) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const articles = {
          1: {
            id: 1,
            title: '沪深场外个股期权入门指南',
            category: 'option',
            categoryName: '期权基础',
            date: '2024-12-08',
            updateTime: '2025-01-15',
            views: 1256,
            likes: 89,
            cover: '/images/首页/u258.png',
            tags: ['期权', '入门', '投资'],
            content: `
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
            `
          },
          2: {
            id: 2,
            title: '香草期权基础入门',
            category: 'vanilla',
            categoryName: '香草期权',
            date: '2024-12-12',
            updateTime: '2025-01-10',
            views: 982,
            likes: 76,
            cover: '/images/首页/u119.png',
            tags: ['香草期权', '基础', '策略'],
            content: `
              <h2>一、香草期权概述</h2>
              <p>香草期权（Vanilla Options）是最基础的期权类型，包括看涨期权（Call Option）和看跌期权（Put Option）。因其结构简单、易于理解，被称为"香草"（意指普通、标准）。</p>
              
              <h2>二、看涨期权 vs 看跌期权</h2>
              <p><strong>看涨期权（Call）</strong>：赋予买方在约定时间以约定价格买入标的资产的权利。</p>
              <p><strong>看跌期权（Put）</strong>：赋予买方在约定时间以约定价格卖出标的资产的权利。</p>
              
              <h2>三、期权的基本要素</h2>
              <p>• <strong>标的资产</strong>：期权合约对应的基础资产，如股票、指数等</p>
              <p>• <strong>行权价格（Strike Price）</strong>：约定的买入或卖出价格</p>
              <p>• <strong>到期日（Expiration Date）</strong>：期权有效的最后日期</p>
              <p>• <strong>名义本金（Notional Principal）</strong>：合约对应的资金规模</p>
              <p>• <strong>期权费（Premium）</strong>：购买期权支付的费用</p>
              
              <h2>四、期权的价值构成</h2>
              <p>期权价值 = 内在价值 + 时间价值</p>
              <p><strong>内在价值</strong>：立即行权可获得的收益</p>
              <p><strong>时间价值</strong>：因未来价格波动可能带来的额外价值</p>
              
              <h2>五、常见策略简介</h2>
              <p>• <strong>买入看涨</strong>：看好后市，风险有限，收益无限</p>
              <p>• <strong>买入看跌</strong>：看空后市，风险有限，收益较大</p>
              <p>• <strong>保护性看跌</strong>：持有股票同时买入看跌期权，对冲下跌风险</p>
              <p>• <strong>备兑看涨</strong>：持有股票同时卖出看涨期权，增强收益</p>
            `
          },
          3: {
            id: 3,
            title: '持仓管理与风险控制',
            category: 'risk',
            categoryName: '风险管理',
            date: '2024-12-20',
            updateTime: '2025-01-08',
            views: 756,
            likes: 65,
            cover: '/images/首页/u120.png',
            tags: ['风险管理', '持仓', '止损'],
            content: `
              <h2>一、持仓管理的重要性</h2>
              <p>良好的持仓管理是期权投资成功的关键。它不仅关系到单笔交易的盈亏，更影响整体投资组合的风险收益特征。</p>
              
              <h2>二、仓位控制原则</h2>
              <p><strong>1. 分散投资</strong></p>
              <p>不要把所有资金集中在单一标的或单一策略上。建议将资金分散到3-5个不同的标的，降低单一标的风险。</p>
              
              <p><strong>2. 控制单笔仓位</strong></p>
              <p>单笔交易的期权费建议不超过总资金的10-20%，避免单次交易对整体组合造成重大影响。</p>
              
              <p><strong>3. 预留现金</strong></p>
              <p>保持一定比例的现金或现金等价物，以应对突发情况或把握新的投资机会。</p>
              
              <h2>三、止损策略</h2>
              <p><strong>1. 固定比例止损</strong></p>
              <p>设定一个固定的亏损比例（如期权费的50%），达到即平仓止损。</p>
              
              <p><strong>2. 时间止损</strong></p>
              <p>如果期权在约定时间内未达到预期走势，即使未触及价格止损点，也考虑平仓。</p>
              
              <p><strong>3. 技术止损</strong></p>
              <p>根据技术分析设定止损位，如跌破重要支撑位时止损。</p>
              
              <h2>四、止盈策略</h2>
              <p>• <strong>目标收益法</strong>：设定合理的收益目标，达到后分批止盈</p>
              <p>• <strong>移动止盈法</strong>：随着盈利增加，逐步提高止盈位</p>
              <p>• <strong>时间止盈法</strong>：接近到期时，根据剩余价值决定是否提前平仓</p>
              
              <h2>五、风险指标监控</h2>
              <p>• 关注 Greeks 指标变化（Delta、Gamma、Theta、Vega）</p>
              <p>• 监控隐含波动率变化</p>
              <p>• 定期评估组合的整体风险敞口</p>
            `
          }
        };
        
        const article = articles[id];
        if (article) {
          resolve(article);
        } else {
          // 默认返回第一篇文章
          resolve(articles[1]);
        }
      }, 500);
    });
  },

  // 获取相关文章
  fetchRelatedArticles(category, currentId) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const allArticles = [
          { id: 1, title: '沪深场外个股期权入门指南', date: '2024-12-08', cover: '/images/首页/u258.png' },
          { id: 2, title: '香草期权基础入门', date: '2024-12-12', cover: '/images/首页/u119.png' },
          { id: 3, title: '持仓管理与风险控制', date: '2024-12-20', cover: '/images/首页/u120.png' },
          { id: 4, title: '期权定价模型解析', date: '2024-12-25', cover: '' },
          { id: 5, title: '牛市价差策略实战', date: '2025-01-05', cover: '/images/首页/u121.png' },
          { id: 6, title: '2025年期权市场展望', date: '2025-01-10', cover: '' }
        ];
        
        // 过滤掉当前文章，返回最多3篇相关文章
        const related = allArticles
          .filter(item => item.id !== currentId)
          .slice(0, 3);
        
        resolve(related);
      }, 300);
    });
  },

  // 检查用户交互状态
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

  // 增加阅读数
  incrementViews() {
    // 实际项目中应该调用 API 增加阅读数
    // api.post(`/api/knowledge/view/${this.data.articleId}`);
  },

  // 点赞
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
    
    // 实际项目中应该调用 API
    // api.post(`/api/knowledge/like/${articleId}`, { action: newLiked ? 'like' : 'unlike' });
  },

  // 收藏
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
    
    // 实际项目中应该调用 API
    // api.post(`/api/knowledge/collect/${articleId}`, { action: newCollected ? 'collect' : 'uncollect' });
  },

  // 分享
  onShare() {
    uiEnhancer.hapticFeedback('light');
    
    // 显示分享菜单
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
  },

  // 点击相关文章
  onRelatedTap(e) {
    const { id } = e.currentTarget.dataset;
    uiEnhancer.hapticFeedback('light');
    
    // 跳转到另一篇文章
    wx.redirectTo({
      url: `/pages/knowledge-detail/knowledge-detail?id=${id}`
    });
  },

  // 返回上一页
  goBack() {
    wx.navigateBack();
  },

  // 分享
  onShareAppMessage() {
    const { article } = this.data;
    return {
      title: article.title,
      path: `/pages/knowledge-detail/knowledge-detail?id=${article.id}`,
      imageUrl: article.cover || '/images/logo.png'
    };
  },

  onShareTimeline() {
    const { article } = this.data;
    return {
      title: article.title,
      query: `id=${article.id}`,
      imageUrl: article.cover || '/images/logo.png'
    };
  }
});
