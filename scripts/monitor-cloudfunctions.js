#!/usr/bin/env node

/**
 * 云函数健康检查和监控脚本
 * 定期检查各云函数的运行状态、性能指标和错误统计
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// 项目配置
const CONFIG = {
  // 微信云开发环境ID
  envId: process.env.WECHAT_CLOUD_ENV_ID || 'your-env-id',
  
  // 监控频率 (毫秒)
  checkInterval: 5 * 60 * 1000, // 5分钟
  
  // 告警阈值
  thresholds: {
    errorRate: 0.05, // 错误率超过5%告警
    responseTime: 5000, // 响应时间超过5秒告警
    timeoutRate: 0.1 // 超时率超过10%告警
  },
  
  // 通知配置
  notification: {
    webhook: process.env.ALERT_WEBHOOK_URL,
    email: process.env.ALERT_EMAIL
  }
};

// 云函数监控配置
const FUNCTION_MONITORS = {
  dataImporter: {
    name: '数据导入服务',
    timeout: 30000,
    expectedResponse: { success: true },
    metrics: ['executionTime', 'memoryUsage', 'errorCount']
  },
  updateQuotes: {
    name: '行情更新服务',
    timeout: 60000,
    expectedResponse: { success: true },
    metrics: ['executionTime', 'stocksUpdated', 'errorCount']
  },
  reportError: {
    name: '错误上报服务',
    timeout: 10000,
    expectedResponse: { success: true },
    metrics: ['errorsReceived', 'storageLatency']
  },
  dataCleanup: {
    name: '数据清理服务',
    timeout: 30000,
    expectedResponse: { success: true },
    metrics: ['recordsDeleted', 'executionTime']
  },
  login: {
    name: '用户登录服务',
    timeout: 15000,
    expectedResponse: { success: true },
    metrics: ['loginSuccess', 'responseTime']
  },
  submitInquiry: {
    name: '提交询价服务',
    timeout: 20000,
    expectedResponse: { success: true },
    metrics: ['inquiriesSubmitted', 'validationErrors']
  },
  handleInquiry: {
    name: '处理询价服务',
    timeout: 25000,
    expectedResponse: { success: true },
    metrics: ['inquiriesProcessed', 'averageProcessingTime']
  }
};

/**
 * 发送测试请求到云函数
 */
async function invokeFunction(functionName, data = {}) {
  const startTime = Date.now();
  
  try {
    // 这里应该使用微信云开发的实际调用方式
    // 示例使用模拟调用
    const response = await mockCloudFunctionCall(functionName, data);
    
    const endTime = Date.now();
    const executionTime = endTime - startTime;
    
    return {
      success: true,
      data: response,
      executionTime,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    const endTime = Date.now();
    const executionTime = endTime - startTime;
    
    return {
      success: false,
      error: error.message,
      executionTime,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * 模拟云函数调用（实际项目中替换为真实调用）
 */
async function mockCloudFunctionCall(functionName, data) {
  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
  
  // 模拟成功率
  const successRate = 0.95; // 95%成功率
  if (Math.random() > successRate) {
    throw new Error(`Mock error for ${functionName}`);
  }
  
  // 返回模拟响应
  return {
    success: true,
    functionName,
    ...data,
    mockResult: `Processed by ${functionName}`
  };
}

/**
 * 检查单个云函数健康状态
 */
async function checkFunctionHealth(functionName, config) {
  console.log(`🔍 检查 ${config.name} (${functionName})...`);
  
  const results = [];
  const checkCount = 3; // 每个函数检查3次取平均值
  
  for (let i = 0; i < checkCount; i++) {
    const testData = {
      timestamp: Date.now(),
      checkId: `${functionName}_${i}`,
      data: { test: true }
    };
    
    const result = await invokeFunction(functionName, testData);
    results.push(result);
    
    // 添加随机延迟避免请求过于密集
    if (i < checkCount - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // 计算统计数据
  const successfulCalls = results.filter(r => r.success).length;
  const avgExecutionTime = results.reduce((sum, r) => sum + r.executionTime, 0) / results.length;
  const errorRate = (results.length - successfulCalls) / results.length;
  
  const healthStatus = {
    functionName,
    displayName: config.name,
    timestamp: new Date().toISOString(),
    totalChecks: results.length,
    successfulCalls,
    errorRate,
    avgExecutionTime,
    maxExecutionTime: Math.max(...results.map(r => r.executionTime)),
    minExecutionTime: Math.min(...results.map(r => r.executionTime)),
    details: results
  };
  
  // 判断健康状态
  healthStatus.isHealthy = (
    errorRate <= CONFIG.thresholds.errorRate &&
    avgExecutionTime <= CONFIG.thresholds.responseTime
  );
  
  return healthStatus;
}

/**
 * 获取详细的性能指标
 */
function getPerformanceMetrics(healthStatus) {
  const metrics = {
    errorRate: healthStatus.errorRate,
    avgResponseTime: healthStatus.avgExecutionTime,
    successRate: healthStatus.successfulCalls / healthStatus.totalChecks,
    lastCheckTime: healthStatus.timestamp
  };
  
  // 添加函数特定指标
  switch (healthStatus.functionName) {
    case 'updateQuotes':
      metrics.stocksPerSecond = healthStatus.details
        .filter(d => d.success)
        .reduce((sum, d) => sum + (d.data?.stocksUpdated || 0), 0) / 
        (healthStatus.avgExecutionTime / 1000);
      break;
    case 'dataImporter':
      metrics.importSpeed = healthStatus.details
        .filter(d => d.success)
        .reduce((sum, d) => sum + (d.data?.totalRows || 0), 0) / 
        (healthStatus.avgExecutionTime / 1000);
      break;
  }
  
  return metrics;
}

/**
 * 生成健康报告
 */
function generateHealthReport(allStatus) {
  const report = {
    timestamp: new Date().toISOString(),
    overallHealth: 'healthy',
    summary: {
      totalFunctions: allStatus.length,
      healthyFunctions: allStatus.filter(s => s.isHealthy).length,
      unhealthyFunctions: allStatus.filter(s => !s.isHealthy).length,
      averageResponseTime: 0,
      totalErrorRate: 0
    },
    functions: {},
    alerts: []
  };
  
  // 计算总体指标
  const totalExecutionTime = allStatus.reduce((sum, s) => sum + s.avgExecutionTime, 0);
  const totalErrors = allStatus.reduce((sum, s) => sum + (s.totalChecks - s.successfulCalls), 0);
  const totalChecks = allStatus.reduce((sum, s) => sum + s.totalChecks, 0);
  
  report.summary.averageResponseTime = totalExecutionTime / allStatus.length;
  report.summary.totalErrorRate = totalErrors / totalChecks;
  
  // 设置总体健康状态
  if (report.summary.totalErrorRate > CONFIG.thresholds.errorRate) {
    report.overallHealth = 'degraded';
  }
  if (report.summary.unhealthyFunctions > 0) {
    report.overallHealth = 'unhealthy';
  }
  
  // 详细函数状态
  allStatus.forEach(status => {
    report.functions[status.functionName] = {
      name: status.displayName,
      isHealthy: status.isHealthy,
      errorRate: status.errorRate,
      avgResponseTime: status.avgExecutionTime,
      metrics: getPerformanceMetrics(status)
    };
    
    // 生成告警
    if (!status.isHealthy) {
      report.alerts.push({
        type: 'UNHEALTHY_FUNCTION',
        function: status.functionName,
        message: `${status.displayName} 不健康`,
        details: {
          errorRate: status.errorRate,
          avgResponseTime: status.avgExecutionTime
        }
      });
    }
    
    if (status.errorRate > CONFIG.thresholds.errorRate) {
      report.alerts.push({
        type: 'HIGH_ERROR_RATE',
        function: status.functionName,
        message: `${status.displayName} 错误率过高: ${(status.errorRate * 100).toFixed(2)}%`,
        threshold: CONFIG.thresholds.errorRate
      });
    }
    
    if (status.avgExecutionTime > CONFIG.thresholds.responseTime) {
      report.alerts.push({
        type: 'SLOW_RESPONSE',
        function: status.functionName,
        message: `${status.displayName} 响应时间过慢: ${status.avgExecutionTime.toFixed(0)}ms`,
        threshold: CONFIG.thresholds.responseTime
      });
    }
  });
  
  return report;
}

/**
 * 发送告警通知
 */
async function sendAlert(alert) {
  console.log(`🚨 告警: ${alert.message}`);
  
  // 发送到Webhook
  if (CONFIG.notification.webhook) {
    try {
      await axios.post(CONFIG.notification.webhook, {
        type: 'CLOUD_FUNCTION_ALERT',
        alert,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Webhook通知失败:', error.message);
    }
  }
  
  // 发送邮件（需要邮件服务配置）
  if (CONFIG.notification.email) {
    console.log(`📧 告警邮件将发送至: ${CONFIG.notification.email}`);
    // 这里可以集成邮件发送服务
  }
}

/**
 * 执行一次完整的健康检查
 */
async function performHealthCheck() {
  console.log(`\n🏥 开始云函数健康检查 - ${new Date().toLocaleString()}`);
  console.log('─'.repeat(60));
  
  const allStatus = [];
  
  // 并行检查所有函数
  const checkPromises = Object.entries(FUNCTION_MONITORS).map(
    async ([functionName, config]) => {
      try {
        const status = await checkFunctionHealth(functionName, config);
        allStatus.push(status);
        return status;
      } catch (error) {
        console.error(`❌ ${functionName} 检查失败:`, error.message);
        return null;
      }
    }
  );
  
  await Promise.all(checkPromises);
  
  // 生成报告
  const report = generateHealthReport(allStatus.filter(Boolean));
  
  // 输出报告
  console.log('\n📊 健康检查报告:');
  console.log(`总体状态: ${report.overallHealth.toUpperCase()}`);
  console.log(`健康函数: ${report.summary.healthyFunctions}/${report.summary.totalFunctions}`);
  console.log(`平均响应时间: ${report.summary.averageResponseTime.toFixed(0)}ms`);
  console.log(`总错误率: ${(report.summary.totalErrorRate * 100).toFixed(2)}%`);
  
  if (report.alerts.length > 0) {
    console.log('\n🚨 告警信息:');
    report.alerts.forEach(alert => {
      console.log(`  • [${alert.type}] ${alert.message}`);
    });
    
    // 发送告警
    for (const alert of report.alerts) {
      await sendAlert(alert);
    }
  }
  
  // 保存报告到文件
  const reportPath = path.join(__dirname, '..', 'logs', 'health-report.json');
  try {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n💾 报告已保存到: ${reportPath}`);
  } catch (error) {
    console.error('保存报告失败:', error.message);
  }
  
  return report;
}

/**
 * 启动持续监控
 */
function startMonitoring() {
  console.log(`🚀 启动云函数持续监控 (间隔: ${CONFIG.checkInterval / 1000 / 60}分钟)`);
  
  // 立即执行一次检查
  performHealthCheck();
  
  // 定时执行
  setInterval(() => {
    performHealthCheck().catch(error => {
      console.error('监控执行失败:', error.message);
    });
  }, CONFIG.checkInterval);
}

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log(`
云函数健康监控工具

用法:
  node scripts/monitor-cloudfunctions.js [选项]

选项:
  --once          执行单次检查后退出
  --interval <ms> 设置检查间隔 (毫秒)
  --help          显示帮助信息

示例:
  # 持续监控
  node scripts/monitor-cloudfunctions.js

  # 单次检查
  node scripts/monitor-cloudfunctions.js --once

  # 自定义检查间隔 (10分钟)
  node scripts/monitor-cloudfunctions.js --interval 600000
  `);
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  
  // 解析参数
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--once':
        options.once = true;
        break;
      case '--interval':
        options.interval = parseInt(args[++i]);
        break;
      case '--help':
        showHelp();
        return;
      default:
        console.log(`未知参数: ${arg}`);
        showHelp();
        process.exit(1);
    }
  }
  
  // 应用自定义配置
  if (options.interval) {
    CONFIG.checkInterval = options.interval;
  }
  
  try {
    if (options.once) {
      await performHealthCheck();
    } else {
      startMonitoring();
    }
  } catch (error) {
    console.error('监控工具执行失败:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = {
  performHealthCheck,
  checkFunctionHealth,
  generateHealthReport,
  CONFIG,
  FUNCTION_MONITORS
};