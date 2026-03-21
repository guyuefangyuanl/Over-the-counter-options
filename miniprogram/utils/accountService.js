const api = require('./api.js');

/**
 * 账户相关 API 服务
 * - timeout: 30000 — 30秒超时，适配云托管冷启动
 * - retries: 1 — 失败后重试1次
 * - enableCache: false — 金融实时数据，不应缓存
 * - silent: true — 内部不显示全局 loading toast，由页面自行管理
 */

// 账户页公共选项（增加超时和重试，适配云托管冷启动）
const REALTIME_OPTIONS = {
  timeout: 30000,      // 30秒超时，适配云托管冷启动
  retries: 1,          // 失败后重试1次
  silent: true,
  enableCache: false
};

const accountService = {
  // 获取个人资料
  getUserProfile: () => {
    return api.get('/auth/me', {}, {}, REALTIME_OPTIONS);
  },

  // 更新个人资料
  updateUserProfile: (data) => {
    return api.put('/auth/me', data);
  },

  // 获取持仓列表（不缓存、不重试）
  // fromIndex: true 时使用 retries:0 + suppressRetryLog:true，避免首页未登录时产生重试噪音
  getPositions: (page = 1, pageSize = 10, fromIndex = false) => {
    const opts = fromIndex
      ? { ...REALTIME_OPTIONS, retries: 0, suppressRetryLog: true, suppressErrorLog: true }
      : REALTIME_OPTIONS;
    return api.get('/trade/positions', { page, pageSize }, {}, opts);
  },

  // 获取资产概览（持仓统计，不缓存、不重试）
  getAssetOverview: () => {
    return api.get('/trade/positions/statistics', {}, {}, REALTIME_OPTIONS);
  },

  // 生成测试持仓数据
  seedPositions: () => {
    return api.post('/trade/positions/seed');
  },

  // 录入持仓（用户自助）
  // data: { productCode, productName, quantity, price, dealer, daysLeft }
  createPosition: (data) => {
    return api.post('/trade/positions', data, REALTIME_OPTIONS);
  },

  // 获取持仓详情
  getPositionDetail: (positionId) => {
    return api.get(`/trade/positions/${positionId}`, {}, {}, REALTIME_OPTIONS);
  },

  // 更新持仓
  updatePosition: (positionId, data) => {
    return api.put(`/trade/positions/${positionId}`, data, REALTIME_OPTIONS);
  },

  // 删除持仓
  deletePosition: (positionId) => {
    return api.delete(`/trade/positions/${positionId}`, REALTIME_OPTIONS);
  },

  // 平仓操作
  // data: { closePrice, closeType: 'accounting' | 'order' }
  closePosition: (positionId, data) => {
    return api.post(`/trade/positions/${positionId}/close`, data, REALTIME_OPTIONS);
  }
};

module.exports = accountService;
