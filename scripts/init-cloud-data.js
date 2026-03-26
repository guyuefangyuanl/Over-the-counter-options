/**
 * 云数据库初始化脚本
 * 用于导入初始数据到微信云数据库
 * 
 * 使用方法：
 * 1. 在微信开发者工具中，右键点击 cloudfunctions 目录
 * 2. 选择"新建Node.js云函数"，命名为 initDatabase
 * 3. 将此脚本内容复制到云函数的 index.js 中
 * 4. 上传并部署云函数
 * 5. 在云开发控制台中调用该云函数
 */

// 初始行情数据（quotes 集合）
const initialQuotes = [
  {
    _id: 'idx_000001',
    code: '000001',
    name: '上证指数',
    price: 3420.35,
    change: 12.48,
    changePercent: 0.37,
    type: 'index',
    updateTime: new Date().toISOString()
  },
  {
    _id: 'idx_399001',
    code: '399001',
    name: '深证成指',
    price: 10856.24,
    change: -45.67,
    changePercent: -0.42,
    type: 'index',
    updateTime: new Date().toISOString()
  },
  {
    _id: 'idx_399006',
    code: '399006',
    name: '创业板指',
    price: 2198.76,
    change: 8.93,
    changePercent: 0.41,
    type: 'index',
    updateTime: new Date().toISOString()
  },
  {
    _id: 'idx_000300',
    code: '000300',
    name: '沪深300',
    price: 3521.12,
    change: 5.12,
    changePercent: 0.15,
    type: 'index',
    updateTime: new Date().toISOString()
  },
  {
    _id: 'idx_510050',
    code: '510050',
    name: '上证50ETF',
    price: 2.445,
    change: -0.016,
    changePercent: -0.65,
    type: 'etf',
    updateTime: new Date().toISOString()
  },
  {
    _id: 'stk_600519',
    code: '600519',
    name: '贵州茅台',
    price: 1702.35,
    change: -35.42,
    changePercent: -2.04,
    type: 'stock',
    updateTime: new Date().toISOString()
  },
  {
    _id: 'stk_300750',
    code: '300750',
    name: '宁德时代',
    price: 186.85,
    change: 3.16,
    changePercent: 1.72,
    type: 'stock',
    updateTime: new Date().toISOString()
  },
  {
    _id: 'stk_002594',
    code: '002594',
    name: '比亚迪',
    price: 236.25,
    change: 6.62,
    changePercent: 2.88,
    type: 'stock',
    updateTime: new Date().toISOString()
  },
  {
    _id: 'stk_601318',
    code: '601318',
    name: '中国平安',
    price: 47.4,
    change: 0.47,
    changePercent: 1.0,
    type: 'stock',
    updateTime: new Date().toISOString()
  },
  {
    _id: 'stk_600036',
    code: '600036',
    name: '招商银行',
    price: 31.56,
    change: 0.46,
    changePercent: 1.49,
    type: 'stock',
    updateTime: new Date().toISOString()
  }
];

// 期权示例数据（options 集合）
const initialOptions = [
  {
    _id: 'opt_510050_202606_C_250',
    underlying: '510050',
    underlyingName: '上证50ETF',
    name: '上证50ETF 2026-06 看涨 2.50',
    type: 'call',
    strike: 2.5,
    expiry: '2026-06-28',
    iv: 0.25,
    lastPrice: 0.032,
    change: 0.003,
    volume: 12500,
    updateTime: new Date().toISOString()
  },
  {
    _id: 'opt_510050_202606_P_230',
    underlying: '510050',
    underlyingName: '上证50ETF',
    name: '上证50ETF 2026-06 看跌 2.30',
    type: 'put',
    strike: 2.3,
    expiry: '2026-06-28',
    iv: 0.27,
    lastPrice: 0.021,
    change: -0.001,
    volume: 8200,
    updateTime: new Date().toISOString()
  },
  {
    _id: 'opt_000300_202607_C_3500',
    underlying: '000300',
    underlyingName: '沪深300',
    name: '沪深300 2026-07 看涨 3500',
    type: 'call',
    strike: 3500,
    expiry: '2026-07-30',
    iv: 0.22,
    lastPrice: 58.3,
    change: 1.8,
    volume: 3500,
    updateTime: new Date().toISOString()
  },
  {
    _id: 'opt_600519_202606_C_1800',
    underlying: '600519',
    underlyingName: '贵州茅台',
    name: '贵州茅台 2026-06 看涨 1800',
    type: 'call',
    strike: 1800,
    expiry: '2026-06-28',
    iv: 0.28,
    lastPrice: 45.6,
    change: 2.1,
    volume: 1200,
    updateTime: new Date().toISOString()
  }
];

// 分组数据（groups 集合）
const initialGroups = [
  {
    _id: 'group_index',
    name: '指数',
    code: 'index',
    sort: 1,
    description: '主要市场指数',
    createdAt: new Date().toISOString()
  },
  {
    _id: 'group_etf',
    name: 'ETF基金',
    code: 'etf',
    sort: 2,
    description: '交易型开放式指数基金',
    createdAt: new Date().toISOString()
  },
  {
    _id: 'group_stock',
    name: '股票',
    code: 'stock',
    sort: 3,
    description: 'A股主要股票',
    createdAt: new Date().toISOString()
  },
  {
    _id: 'group_option',
    name: '期权',
    code: 'option',
    sort: 4,
    description: '场外期权品种',
    createdAt: new Date().toISOString()
  }
];

// 系统配置（settings 集合）
const initialSettings = [
  {
    _id: 'system_config',
    appName: '场外期权交易平台',
    version: '1.0.0',
    lastUpdateTime: new Date().toISOString(),
    features: {
      inquiryEnabled: true,
      quoteEnabled: true,
      notificationEnabled: true
    },
    contact: {
      servicePhone: '400-XXX-XXXX',
      serviceEmail: 'service@example.com'
    }
  },
  {
    _id: 'trading_hours',
    morningStart: '09:30',
    morningEnd: '11:30',
    afternoonStart: '13:00',
    afternoonEnd: '15:00',
    timezone: 'Asia/Shanghai'
  }
];

/**
 * 批量插入数据到集合
 * @param {Database} db 数据库实例
 * @param {string} collectionName 集合名称
 * @param {Array} data 数据数组
 */
async function batchInsert(db, collectionName, data) {
  const collection = db.collection(collectionName);
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };

  for (const item of data) {
    try {
      // 使用 _id 作为文档ID，避免重复
      await collection.doc(item._id).set({
        data: item
      });
      results.success++;
      console.log(`[OK] ${collectionName}.${item._id}`);
    } catch (err) {
      results.failed++;
      results.errors.push({
        id: item._id,
        error: err.message
      });
      console.error(`[FAIL] ${collectionName}.${item._id}: ${err.message}`);
    }
  }

  return results;
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
  const db = cloud.database();

  const results = {
    timestamp: new Date().toISOString(),
    collections: {}
  };

  console.log('=== 开始初始化云数据库 ===');

  // 初始化 quotes 集合
  console.log('\n--- 初始化 quotes 集合 ---');
  results.collections.quotes = await batchInsert(db, 'quotes', initialQuotes);

  // 初始化 options 集合
  console.log('\n--- 初始化 options 集合 ---');
  results.collections.options = await batchInsert(db, 'options', initialOptions);

  // 初始化 groups 集合
  console.log('\n--- 初始化 groups 集合 ---');
  results.collections.groups = await batchInsert(db, 'groups', initialGroups);

  // 初始化 settings 集合
  console.log('\n--- 初始化 settings 集合 ---');
  results.collections.settings = await batchInsert(db, 'settings', initialSettings);

  console.log('\n=== 初始化完成 ===');

  return {
    success: true,
    message: '数据初始化完成',
    results
  };
};