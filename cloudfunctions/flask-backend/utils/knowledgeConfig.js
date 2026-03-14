/**
 * 知识文章配置
 * 将小程序知识板块链接到码云仓库的文档
 */

// 码云仓库基础URL
const GITEE_REPO_BASE = 'https://gitee.com/huiyang_1/Over-the-counter-options';
const GITHUB_REPO_BASE = 'https://github.com/guyuefangyuanl/Over-the-counter-options';

// 知识文章配置
const KNOWLEDGE_ARTICLES = [
  {
    id: 1,
    title: '沪深场外个股期权入门指南',
    summary: '了解场外个股期权的基本概念、交易流程和风险控制方法，帮助投资者快速入门。',
    date: '2024-12-08',
    category: 'option',
    categoryName: '期权基础',
    type: 'external', // 外部链接
    giteeUrl: `${GITEE_REPO_BASE}/blob/main/README.md`,
    githubUrl: `${GITHUB_REPO_BASE}/blob/main/README.md`,
    cover: '/images/首页/u258.png',
    views: 1256
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
    cover: '/images/首页/u119.png',
    views: 982
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
    cover: '/images/首页/u120.png',
    views: 756
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
    views: 543
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
    cover: '/images/首页/u121.png',
    views: 892
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
    views: 1123
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
    views: 678
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
    views: 445
  }
];

/**
 * 获取知识文章列表
 * @returns {Array} 文章列表
 */
function getKnowledgeArticles() {
  return KNOWLEDGE_ARTICLES;
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
  }
}

module.exports = {
  GITEE_REPO_BASE,
  GITHUB_REPO_BASE,
  KNOWLEDGE_ARTICLES,
  getKnowledgeArticles,
  getArticleById,
  getArticlesByCategory,
  getArticleUrl,
  openArticleInBrowser
};
