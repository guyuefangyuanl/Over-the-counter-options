/**
 * 知识文章配置
 * 将小程序知识板块链接到码云仓库的文档
 * @version 2.0
 */

// 码云仓库基础URL
const GITEE_REPO_BASE = 'https://gitee.com/huiyang_1/Over-the-counter-options';
const GITHUB_REPO_BASE = 'https://github.com/guyuefangyuanl/Over-the-counter-options';

// 分类配置
const CATEGORY_CONFIG = {
  option: {
    name: '期权基础',
    icon: 'book',
    color: '#409EFF',
    description: '了解场外期权的基本概念和入门知识'
  },
  strategy: {
    name: '交易策略',
    icon: 'chart',
    color: '#67C23A',
    description: '学习各种期权交易策略和技巧'
  },
  risk: {
    name: '风险管理',
    icon: 'shield',
    color: '#E6A23C',
    description: '掌握期权交易的风险控制方法'
  },
  analysis: {
    name: '市场分析',
    icon: 'analysis',
    color: '#F56C6C',
    description: '深入理解市场动态和价格分析'
  }
};

// 知识文章配置
const KNOWLEDGE_ARTICLES = [
  {
    id: 1,
    title: '沪深场外个股期权入门指南',
    summary: '了解场外个股期权的基本概念、交易流程和风险控制方法，帮助投资者快速入门。',
    date: '2024-12-08',
    category: 'option',
    categoryName: '期权基础',
    type: 'external',
    giteeUrl: `${GITEE_REPO_BASE}/blob/main/README.md`,
    githubUrl: `${GITHUB_REPO_BASE}/blob/main/README.md`,
    cover: '/images/inquiry.png',
    views: 1256,
    likes: 89,
    tags: ['期权', '入门', '投资'],
    featured: true,
    readTime: 8
  },
  {
    id: 2,
    title: '询价分组管理功能说明',
    summary: '详细介绍询价页面的分组管理、新建分组、编辑分组等功能的实现逻辑和使用方法。',
    date: '2024-12-12',
    category: 'strategy',
    categoryName: '交易策略',
    type: 'external',
    giteeUrl: `${GITEE_REPO_BASE}/blob/main/docs/inquiry-group-manage.md`,
    githubUrl: `${GITHUB_REPO_BASE}/blob/main/docs/inquiry-group-manage.md`,
    cover: '/images/quote.png',
    views: 982,
    likes: 76,
    tags: ['询价', '分组', '功能说明'],
    featured: false,
    readTime: 6
  },
  {
    id: 3,
    title: '询价分组编辑功能详解',
    summary: '学习如何编辑询价分组、管理自选标的，掌握分组管理的高级技巧。',
    date: '2024-12-20',
    category: 'strategy',
    categoryName: '交易策略',
    type: 'external',
    giteeUrl: `${GITEE_REPO_BASE}/blob/main/docs/inquiry-group-edit.md`,
    githubUrl: `${GITHUB_REPO_BASE}/blob/main/docs/inquiry-group-edit.md`,
    cover: '/images/calculator.png',
    views: 756,
    likes: 65,
    tags: ['询价', '分组', '编辑'],
    featured: false,
    readTime: 5
  },
  {
    id: 4,
    title: '项目部署指南',
    summary: '完整的项目部署流程，包括环境配置、依赖安装、服务启动等详细步骤。',
    date: '2024-12-25',
    category: 'option',
    categoryName: '期权基础',
    type: 'external',
    giteeUrl: `${GITEE_REPO_BASE}/blob/main/docs/archive/DEPLOYMENT_GUIDE.md`,
    githubUrl: `${GITHUB_REPO_BASE}/blob/main/docs/archive/DEPLOYMENT_GUIDE.md`,
    cover: '',
    views: 543,
    likes: 45,
    tags: ['部署', '配置', '指南'],
    featured: false,
    readTime: 10
  },
  {
    id: 5,
    title: '账户模块功能报告',
    summary: '详细介绍账户模块的功能特性、实现方案和使用说明。',
    date: '2025-01-05',
    category: 'risk',
    categoryName: '风险管理',
    type: 'external',
    giteeUrl: `${GITEE_REPO_BASE}/blob/main/docs/archive/ACCOUNT_MODULE_REPORT.md`,
    githubUrl: `${GITHUB_REPO_BASE}/blob/main/docs/archive/ACCOUNT_MODULE_REPORT.md`,
    cover: '/images/position.png',
    views: 892,
    likes: 72,
    tags: ['账户', '功能', '报告'],
    featured: true,
    readTime: 7
  },
  {
    id: 6,
    title: 'UI重构报告',
    summary: '全面的UI重构说明，包括设计规范、组件库使用、样式优化等内容。',
    date: '2025-01-10',
    category: 'option',
    categoryName: '期权基础',
    type: 'external',
    giteeUrl: `${GITEE_REPO_BASE}/blob/main/docs/archive/UI_REFACTOR_REPORT.md`,
    githubUrl: `${GITHUB_REPO_BASE}/blob/main/docs/archive/UI_REFACTOR_REPORT.md`,
    cover: '',
    views: 1123,
    likes: 95,
    tags: ['UI', '重构', '设计'],
    featured: false,
    readTime: 12
  },
  {
    id: 7,
    title: '项目设置指南',
    summary: '详细的项目初始化和配置指南，帮助开发者快速搭建开发环境。',
    date: '2025-01-15',
    category: 'option',
    categoryName: '期权基础',
    type: 'external',
    giteeUrl: `${GITEE_REPO_BASE}/blob/main/docs/archive/SETUP_GUIDE.md`,
    githubUrl: `${GITHUB_REPO_BASE}/blob/main/docs/archive/SETUP_GUIDE.md`,
    cover: '/images/calculator.png',
    views: 678,
    likes: 58,
    tags: ['设置', '配置', '初始化'],
    featured: false,
    readTime: 8
  },
  {
    id: 8,
    title: '上线准备清单',
    summary: '完整的上线前检查清单，确保应用平稳上线，避免常见问题。',
    date: '2025-01-20',
    category: 'risk',
    categoryName: '风险管理',
    type: 'external',
    giteeUrl: `${GITEE_REPO_BASE}/blob/main/docs/archive/LAUNCH_CHECKLIST.md`,
    githubUrl: `${GITHUB_REPO_BASE}/blob/main/docs/archive/LAUNCH_CHECKLIST.md`,
    cover: '',
    views: 445,
    likes: 38,
    tags: ['上线', '检查', '清单'],
    featured: false,
    readTime: 6
  },
  {
    id: 9,
    title: '香草期权基础入门',
    summary: '香草期权是最基础的期权类型，了解其特点和交易策略是期权投资的起点。',
    date: '2025-02-01',
    category: 'option',
    categoryName: '期权基础',
    type: 'internal',
    cover: '/images/quote.png',
    views: 1567,
    likes: 128,
    tags: ['香草期权', '基础', '入门'],
    featured: true,
    readTime: 10,
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
    `
  },
  {
    id: 10,
    title: '持仓管理与风险控制',
    summary: '良好的持仓管理是期权投资成功的关键，掌握仓位控制、止损止盈等核心技巧。',
    date: '2025-02-10',
    category: 'risk',
    categoryName: '风险管理',
    type: 'internal',
    cover: '/images/calculator.png',
    views: 1123,
    likes: 98,
    tags: ['持仓', '风险', '管理'],
    featured: false,
    readTime: 12,
    content: `
      <h2>一、持仓管理的重要性</h2>
      <p>良好的持仓管理是期权投资成功的关键。它不仅关系到单笔交易的盈亏，更影响整体投资组合的风险收益特征。</p>

      <h2>二、仓位控制原则</h2>
      <p><strong>1. 分散投资</strong></p>
      <p>不要把所有资金集中在单一标的或单一策略上。建议将资金分散到3-5个不同的标的，降低单一标的风险。</p>

      <p><strong>2. 控制单笔仓位</strong></p>
      <p>单笔交易的期权费建议不超过总资金的10-20%，避免单次交易对整体组合造成重大影响。</p>

      <h2>三、止损策略</h2>
      <p>• <strong>固定比例止损</strong>：设定一个固定的亏损比例</p>
      <p>• <strong>时间止损</strong>：在约定时间内未达预期则平仓</p>
      <p>• <strong>技术止损</strong>：根据技术分析设定止损位</p>
    `
  }
];

/**
 * 获取知识文章列表
 * @param {Object} options - 筛选选项
 * @param {string} options.category - 分类筛选
 * @param {string} options.keyword - 关键词搜索
 * @param {boolean} options.featuredOnly - 仅获取推荐文章
 * @returns {Array} 文章列表
 */
function getKnowledgeArticles(options = {}) {
  let articles = [...KNOWLEDGE_ARTICLES];

  // 分类筛选
  if (options.category && options.category !== 'all') {
    articles = articles.filter(a => a.category === options.category);
  }

  // 关键词搜索
  if (options.keyword) {
    const keyword = options.keyword.toLowerCase();
    articles = articles.filter(a =>
      a.title.toLowerCase().includes(keyword) ||
      a.summary.toLowerCase().includes(keyword) ||
      (a.tags && a.tags.some(t => t.toLowerCase().includes(keyword)))
    );
  }

  // 仅推荐文章
  if (options.featuredOnly) {
    articles = articles.filter(a => a.featured);
  }

  // 按日期排序（最新的在前）
  articles.sort((a, b) => new Date(b.date) - new Date(a.date));

  return articles;
}

/**
 * 根据ID获取文章详情
 * @param {number} id 文章ID
 * @returns {Object|null} 文章对象
 */
function getArticleById(id) {
  return KNOWLEDGE_ARTICLES.find(article => article.id === parseInt(id)) || null;
}

/**
 * 根据分类获取文章列表
 * @param {string} category 分类ID
 * @returns {Array} 文章列表
 */
function getArticlesByCategory(category) {
  if (category === 'all') {
    return KNOWLEDGE_ARTICLES;
  }
  return KNOWLEDGE_ARTICLES.filter(article => article.category === category);
}

/**
 * 获取推荐文章
 * @param {number} limit - 返回数量限制
 * @returns {Array} 推荐文章列表
 */
function getFeaturedArticles(limit = 3) {
  return getKnowledgeArticles({ featuredOnly: true }).slice(0, limit);
}

/**
 * 获取分类配置
 * @returns {Object} 分类配置对象
 */
function getCategoryConfig() {
  return CATEGORY_CONFIG;
}

/**
 * 获取文章的访问链接（优先码云）
 * @param {Object} article 文章对象
 * @returns {string} 链接地址
 */
function getArticleUrl(article) {
  return article.giteeUrl || article.githubUrl || '';
}

/**
 * 在浏览器中打开文章
 * @param {Object} article 文章对象
 */
function openArticleInBrowser(article) {
  const url = getArticleUrl(article);
  if (url) {
    wx.showModal({
      title: '提示',
      content: '是否在浏览器中打开文章？',
      confirmText: '打开',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          // 复制链接到剪贴板
          wx.setClipboardData({
            data: url,
            success: () => {
              wx.showToast({
                title: '链接已复制，请在浏览器中粘贴访问',
                icon: 'none',
                duration: 3000
              });
            }
          });
        }
      }
    });
  } else {
    wx.showToast({
      title: '暂无外部链接',
      icon: 'none'
    });
  }
}

/**
 * 搜索文章
 * @param {string} keyword - 搜索关键词
 * @returns {Array} 匹配的文章列表
 */
function searchArticles(keyword) {
  return getKnowledgeArticles({ keyword });
}

module.exports = {
  GITEE_REPO_BASE,
  GITHUB_REPO_BASE,
  KNOWLEDGE_ARTICLES,
  CATEGORY_CONFIG,
  getKnowledgeArticles,
  getArticleById,
  getArticlesByCategory,
  getFeaturedArticles,
  getCategoryConfig,
  getArticleUrl,
  openArticleInBrowser,
  searchArticles
};