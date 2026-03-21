// services/holdings.js
// 持仓数据服务 —— 优先从 accountService 获取真实数据，降级到本地 Mock

const accountService = require('../utils/accountService.js');

// ===================== Mock 降级数据 =====================
const MOCK_HOLDINGS = [
  {
    id: 1,
    productName: '平安银行',
    productCode: '000001',
    dealer: '自营',
    notional: 1000000,
    fillPrice: 10.2,
    currentPrice: '9.8',
    pnlRate: -98.28,
    pnl: -49100,
    daysLeft: 20,
    status: 'CONTINUING',
    statusText: '存续中'
  },
  {
    id: 2,
    productName: '上证50ETF',
    productCode: '510050',
    dealer: '自营',
    notional: 2000000,
    fillPrice: 2.86,
    currentPrice: '3.09',
    pnlRate: 8.2,
    pnl: 126000,
    daysLeft: 45,
    status: 'CONTINUING',
    statusText: '存续中'
  },
  {
    id: 3,
    productName: '贵州茅台',
    productCode: '600519',
    dealer: '自营',
    notional: 500000,
    fillPrice: 1700,
    currentPrice: '1916',
    pnlRate: 12.7,
    pnl: 342000,
    daysLeft: 90,
    status: 'CONTINUING',
    statusText: '存续中'
  },
  {
    id: 4,
    productName: '招商银行',
    productCode: '600036',
    dealer: '自营',
    notional: 800000,
    fillPrice: 38.5,
    currentPrice: '37.8',
    pnlRate: -1.8,
    pnl: -23000,
    daysLeft: 5,
    status: 'CONTINUING',
    statusText: '存续中'
  },
  {
    id: 5,
    productName: '中国平安',
    productCode: '601318',
    dealer: '自营',
    notional: 1000000,
    fillPrice: 45.6,
    currentPrice: '46.01',
    pnlRate: 0.9,
    pnl: 12000,
    daysLeft: 6,
    status: 'CONTINUING',
    statusText: '存续中'
  },
  {
    id: 6,
    productName: '宁德时代',
    productCode: '300750',
    dealer: '自营',
    notional: 600000,
    fillPrice: 220,
    currentPrice: '231.6',
    pnlRate: 5.3,
    pnl: 68000,
    daysLeft: 0,
    status: 'CLOSED',
    statusText: '已完结'
  },
  {
    id: 7,
    productName: '隆基绿能',
    productCode: '601012',
    dealer: '自营',
    notional: 1200000,
    fillPrice: 60,
    currentPrice: '58.56',
    pnlRate: -2.4,
    pnl: -36000,
    daysLeft: 0,
    status: 'CLOSED',
    statusText: '已完结'
  }
];

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

// ===================== 数据格式转换 =====================

/**
 * 将后端 / accountService 持仓数据映射为首页持仓案例展示格式
 * 保持与 account.js 的 _mapPosition 兼容
 * @param {object} p 持仓数据（已经过 accountService._mapPosition 处理）
 * @returns {object} 首页展示格式
 */
function mapPositionForIndex(p) {
  const pnlValue = Number(p.pnl) || 0;
  const pnlRateValue = Number(p.pnlRate) || 0;
  const notionalWan = (Number(p.notional) || 0) / 10000;

  // 将 CONTINUING/CLOSED 映射到首页 tab 状态
  // continuing  → active
  // expiring (daysLeft <= 7 且 CONTINUING) → expiring
  // closed      → finished
  let indexStatus = 'active';
  if (p.status === 'CLOSED') {
    indexStatus = 'finished';
  } else if (p.status === 'CONTINUING' && Number(p.daysLeft) <= 7) {
    indexStatus = 'expiring';
  } else {
    indexStatus = 'active';
  }

  return {
    id: p.id,
    productName: p.productName || '未知产品',
    productCode: p.productCode || '',
    dealer: p.dealer || '自营',
    notional: p.notional,
    notionalWan: notionalWan.toFixed(2),
    fillPrice: p.fillPrice,
    currentPrice: p.currentPrice,
    pnl: pnlValue,
    pnlRate: pnlRateValue,
    daysLeft: p.daysLeft,
    status: p.status,         // account 页格式：CONTINUING / CLOSED
    indexStatus: indexStatus  // 首页 tab 格式：active / expiring / finished
  };
}

// ===================== 核心接口 =====================

/**
 * 获取首页持仓案例数据
 * - 未登录（无 token）时跳过 API，直接返回 Mock
 * - 已登录时从 accountService 获取真实数据
 * - API 失败（含 500 认证错误）时静默降级到 Mock，不重试
 * @returns {Promise<{positions: Array, knowledge: Array, isReal: boolean}>}
 */
async function getIndexHoldingsData() {
  // 1. 无 token → 直接用 Mock，不发网络请求
  const token = wx.getStorageSync('token');
  if (!token) {
    console.log('[holdings] 未登录，使用 Mock 持仓数据');
    return { positions: _buildMockPositions(), knowledge: MOCK_KNOWLEDGE, isReal: false };
  }

  try {
    // silent:true 阻止 api.js 弹 loading，suppressRetryLog:true 不打重试日志
    // retries:0 遇到服务端错误（含 500 认证失效）不重试，立即降级
    const result = await accountService.getPositions(1, 50, true /* fromIndex — retries:0 */);
    const body = (result && result.data) ? result.data : (result || {});
    const rawItems = body.items || body.list || (Array.isArray(body) ? body : []);

    if (!rawItems || rawItems.length === 0) {
      return { positions: _buildMockPositions(), knowledge: MOCK_KNOWLEDGE, isReal: false };
    }

    // 将后端原始字段映射为首页展示格式
    const positions = rawItems.map(p => {
      const quantity = Number(p.quantity) || 0;
      const price = Number(p.price) || 0;
      const marketValue = Number(p.marketValue) || 0;
      const currentPrice = quantity > 0 ? (marketValue / quantity).toFixed(3) : '--';
      const pnl = Number(p.profitLoss) || 0;
      const costBasis = quantity * price;
      const pnlRate = costBasis > 0 ? ((pnl / costBasis) * 100).toFixed(2) : '0.00';
      const isActive = p.status === 'active';

      const mapped = {
        id: p._id || p.id || '',
        productCode: p.productCode || '',
        productName: p.productName || '未知产品',
        dealer: p.dealer || '自营',
        notional: marketValue,
        fillPrice: price,
        currentPrice,
        pnlRate: Number(pnlRate),
        pnl,
        daysLeft: p.daysLeft != null ? p.daysLeft : 30,
        status: isActive ? 'CONTINUING' : 'CLOSED',
        statusText: isActive ? '存续中' : '已完结'
      };

      return mapPositionForIndex(mapped);
    });

    return { positions, knowledge: MOCK_KNOWLEDGE, isReal: true };
  } catch (e) {
    // 静默降级：认证失效（500/401）、网络异常等均不向上抛，不影响首页渲染
    const msg = (e && e.message) || '';
    const isAuthErr = msg.includes('登录') || msg.includes('credential') ||
                      msg.includes('token') || msg.includes('500') ||
                      msg.includes('服务器');
    if (isAuthErr) {
      console.log('[holdings] 认证失效，使用 Mock 持仓数据（无需登录即可浏览）');
    } else {
      console.warn('[holdings] 持仓数据加载失败，使用 Mock 数据:', msg);
    }
    return { positions: _buildMockPositions(), knowledge: MOCK_KNOWLEDGE, isReal: false };
  }
}

/**
 * 构造 Mock 持仓（用于降级）
 */
function _buildMockPositions() {
  return MOCK_HOLDINGS.map(p => mapPositionForIndex(p));
}

/**
 * 获取知识推荐列表
 * @returns {Array}
 */
function getKnowledgeList() {
  return MOCK_KNOWLEDGE;
}

module.exports = {
  getIndexHoldingsData,
  getKnowledgeList,
  mapPositionForIndex
};
