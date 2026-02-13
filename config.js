// 小程序配置文件
module.exports = {
  // API地址配置（由utils/request.js动态判断环境）
  // 开发环境: http://localhost:5002/api/v1
  // 体验版: https://test-api.your-domain.com/api/v1
  // 生产环境: https://api.your-domain.com/api/v1
  
  // 应用信息
  appName: '场外期权交易平台',
  version: '1.0.0',
  
  // 功能开关
  features: {
    guestMode: true,        // 游客模式
    wechatLogin: true,      // 微信登录
    phoneLogin: true,       // 手机号登录
    emailLogin: false,      // 邮箱登录（暂未实现）
    qqLogin: false          // QQ登录（暂不支持）
  },
  
  // 业务配置
  business: {
    sessionTimeout: 86400000,     // 会话超时时间（24小时，毫秒）
    tokenRefreshThreshold: 300000, // Token刷新阈值（5分钟，毫秒）
    maxRetryTimes: 3               // 最大重试次数
  }
};
