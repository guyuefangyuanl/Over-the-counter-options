// 测试核心功能
const api = require('./utils/api');
const loginService = require('./utils/loginService');
const performanceOptimizer = require('./utils/performance-optimizer');
const storageManager = require('./utils/storage-manager');
const OptionPricingSystem = require('./utils/option-pricing');

// 测试API模块
console.log('=== 测试API模块 ===');
console.log('当前基础URL:', api.getBaseUrl());

// 测试修改基础URL
api.setBaseUrl('http://localhost:3000/api');
console.log('修改后基础URL:', api.getBaseUrl());

// 测试存储管理器
console.log('\n=== 测试存储管理器 ===');
const storage = storageManager.getInstance();

// 测试存储和获取数据
storage.setItem('test_key', 'test_value', { ttl: 3600000 })
  .then(() => {
    console.log('存储数据成功');
    return storage.getItem('test_key', 'default_value');
  })
  .then(value => {
    console.log('获取数据成功:', value);
    return storage.removeItem('test_key');
  })
  .then(() => {
    console.log('删除数据成功');
  })
  .catch(error => {
    console.error('存储测试失败:', error);
  });

// 测试性能优化器
console.log('\n=== 测试性能优化器 ===');

// 测试懒加载（直接使用模块导出的函数）
performanceOptimizer.lazyLoad('test-module', () => {
  return { message: '测试模块' };
}).then(module => {
  console.log('懒加载模块成功:', module);
}).catch(error => {
  console.error('懒加载测试失败:', error);
});

// 测试获取性能报告
const perfOptimizer = performanceOptimizer.getInstance();
const report = perfOptimizer.getPerformanceReport();
console.log('获取性能报告成功，缓存大小:', report.overview.cacheSize);

// 测试期权定价系统
console.log('\n=== 测试期权定价系统 ===');
const optionSystem = new OptionPricingSystem();

// 测试获取期权报价
const quotes = optionSystem.getOptionQuotes({ strategy: '香草', direction: '看涨' });
console.log('获取期权报价成功，数量:', quotes.length);

// 测试搜索股票
const stockFound = optionSystem.searchStockQuotes('600519');
console.log('搜索股票成功:', stockFound);

// 测试登录服务
console.log('\n=== 测试登录服务 ===');
// 跳过依赖微信小程序 API 的测试
if (typeof wx !== 'undefined') {
  console.log('是否已登录:', loginService.isLoggedIn());
  console.log('当前用户:', loginService.getCurrentUser());
} else {
  console.log('跳过微信小程序 API 测试，在 Node.js 环境中运行');
}

console.log('\n=== 所有测试完成 ===');
