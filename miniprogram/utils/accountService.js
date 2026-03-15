const api = require('./api.js');

/**
 * 账户相关 API 服务
 * - retries: 0  — 不重试，避免云DB故障（invalid appsecret rid）时每次请求等待 ~7秒
 * - enableCache: false — 金融实时数据，不应缓存
 * - silent: true — 内部不显示全局 loading toast，由页面自行管理
 */

// 账户页公共选项（实时金融接口不重试、不缓存）
const REALTIME_OPTIONS = { retries: 0, silent: true, enableCache: false };

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
  getPositions: (page = 1, pageSize = 10) => {
    return api.get('/trade/positions', { page, pageSize }, {}, REALTIME_OPTIONS);
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
