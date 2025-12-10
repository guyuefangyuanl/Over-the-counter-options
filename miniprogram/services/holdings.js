// services/holdings.js
// 持仓数据服务（模拟后端数据）

const dataFormatter = require('../utils/enhancedUtils').dataFormatter;

// 模拟持仓数据
const MOCK_HOLDINGS = [
  {
    id: 1,
    name: '平安银行',
    code: '000001',
    market: 'SZ',
    structure: '100C1m',
    feeRate: '5.28%',
    scale: '100万',
    profit: -4.91,
    profitRate: -98.28,
    status: 'active'
  },
  {
    id: 2,
    name: '上证50ETF',
    code: '510050',
    market: 'SH',
    structure: '50P3m',
    feeRate: '2.15%',
    scale: '200万',
    profit: 12.6,
    profitRate: 8.2,
    status: 'active'
  },
  {
    id: 3,
    name: '贵州茅台',
    code: '600519',
    market: 'SH',
    structure: '100C6m',
    feeRate: '4.85%',
    scale: '50万',
    profit: 34.2,
    profitRate: 12.7,
    status: 'active'
  },
  {
    id: 4,
    name: '招商银行',
    code: '600036',
    market: 'SH',
    structure: '100C1m',
    feeRate: '3.10%',
    scale: '80万',
    profit: -2.3,
    profitRate: -1.8,
    status: 'expiring'
  },
  {
    id: 5,
    name: '中国平安',
    code: '601318',
    market: 'SH',
    structure: '100P1m',
    feeRate: '2.90%',
    scale: '100万',
    profit: 1.2,
    profitRate: 0.9,
    status: 'expiring'
  },
  {
    id: 6,
    name: '宁德时代',
    code: '300750',
    market: 'SZ',
    structure: '50C3m',
    feeRate: '3.40%',
    scale: '60万',
    profit: 6.8,
    profitRate: 5.3,
    status: 'expired'
  },
  {
    id: 7,
    name: '隆基绿能',
    code: '601012',
    market: 'SH',
    structure: '50P6m',
    feeRate: '2.75%',
    scale: '120万',
    profit: -3.6,
    profitRate: -2.4,
    status: 'expired'
  }
];

// 模拟知识文章数据
const MOCK_KNOWLEDGE = [
  {
    id: 1,
    title: '沪深场外个股期权',
    date: '24-12-08 14:58',
    type: 'option',
    link: '/pages/data-explanation/data-explanation?id=1'
  },
  {
    id: 2,
    title: '香草期权基础入门',
    date: '24-12-12 09:30',
    type: 'vanilla',
    link: '/pages/data-explanation/data-explanation?id=2'
  },
  {
    id: 3,
    title: '持仓管理与风险控制',
    date: '24-12-20 16:20',
    type: 'knowledge',
    link: '/pages/data-explanation/data-explanation?id=3'
  }
];

/**
 * 获取持仓列表
 * @param {string} status - 持仓状态 'active' | 'expiring' | 'expired'
 * @returns {Promise<Array>}
 */
function getHoldings(status) {
  return new Promise((resolve) => {
    setTimeout(() => {
      let result = MOCK_HOLDINGS;
      if (status) {
        result = result.filter(item => item.status === status);
      }
      resolve(result);
    }, 300); // 模拟网络延迟
  });
}

/**
 * 获取所有持仓数据（用于首页展示）
 * @returns {Promise<Object>}
 */
function getAllHoldingsData() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        activeTab: 'active',
        holdings: MOCK_HOLDINGS,
        knowledge: MOCK_KNOWLEDGE
      });
    }, 300);
  });
}

/**
 * 获取知识推荐
 * @returns {Promise<Array>}
 */
function getKnowledgeList() {
  return Promise.resolve(MOCK_KNOWLEDGE);
}

module.exports = {
  getHoldings,
  getAllHoldingsData,
  getKnowledgeList
};
