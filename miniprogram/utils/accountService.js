const api = require('./api.js');

const accountService = {
  // 获取个人资料
  getUserProfile: () => {
    // 这里的 /me 是 auth.py 中的路由，需确认 api.js 的 BASE_URL 是否包含 /auth
    // 假设 api.js 自动处理前缀，或者我们需要手动添加 /auth 前缀
    // 根据 api.js 的逻辑，它直接拼接 BASE_URL。
    // Flask 的 auth_bp 通常挂载在 /auth 下。
    // 需确认 app.py 中的注册路径。
    // 如果 BASE_URL 指向 /api/v1，那么这里可能是 /auth/me
    // 暂时假设是 /auth/me，稍后验证
    return api.get('/auth/me');
  },

  // 更新个人资料
  updateUserProfile: (data) => {
    return api.put('/auth/me', data);
  },

  // 获取持仓列表
  getPositions: (page = 1, pageSize = 10) => {
    // trade_bp 通常挂载在 /trade 下？
    // 需验证 app.py
    return api.get('/trade/positions', { page, pageSize });
  },

  // 获取资产概览 (持仓统计)
  getAssetOverview: () => {
    return api.get('/trade/positions/statistics');
  },
  
  // 生成测试数据
  seedPositions: () => {
      return api.post('/trade/positions/seed');
  }
};

module.exports = accountService;
