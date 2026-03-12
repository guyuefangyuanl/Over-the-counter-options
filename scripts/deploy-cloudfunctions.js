#!/usr/bin/env node

/**
 * 云函数一键部署脚本
 * 支持批量部署、增量部署、环境配置等功能
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 项目根目录
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CLOUD_FUNCTIONS_DIR = path.join(PROJECT_ROOT, 'cloudfunctions');

// 云函数列表及其配置
const FUNCTIONS_CONFIG = {
  dataImporter: {
    name: 'dataImporter',
    desc: '数据导入服务',
    triggers: ['importJobsPolling']
  },
  updateQuotes: {
    name: 'updateQuotes',
    desc: '行情更新服务',
    triggers: ['marketHoursUpdate', 'dailyClosingUpdate']
  },
  reportError: {
    name: 'reportError',
    desc: '错误上报服务',
    triggers: []
  },
  dataCleanup: {
    name: 'dataCleanup',
    desc: '数据清理服务',
    triggers: ['dailyCleanup']
  },
  login: {
    name: 'login',
    desc: '用户登录服务',
    triggers: []
  },
  submitInquiry: {
    name: 'submitInquiry',
    desc: '提交询价服务',
    triggers: []
  },
  handleInquiry: {
    name: 'handleInquiry',
    desc: '处理询价服务',
    triggers: []
  }
};

/**
 * 检查云函数目录是否存在
 */
function checkFunctionExists(functionName) {
  const funcPath = path.join(CLOUD_FUNCTIONS_DIR, functionName);
  return fs.existsSync(funcPath);
}

/**
 * 安装云函数依赖
 */
function installDependencies(functionName) {
  const funcPath = path.join(CLOUD_FUNCTIONS_DIR, functionName);
  const packagePath = path.join(funcPath, 'package.json');
  
  if (!fs.existsSync(packagePath)) {
    console.log(`⚠️  ${functionName}: 未找到 package.json`);
    return;
  }

  try {
    console.log(`📦 正在安装 ${functionName} 的依赖...`);
    execSync('npm install', { cwd: funcPath, stdio: 'inherit' });
    console.log(`✅ ${functionName} 依赖安装完成`);
  } catch (error) {
    console.error(`❌ ${functionName} 依赖安装失败:`, error.message);
    throw error;
  }
}

/**
 * 部署单个云函数
 */
function deployFunction(functionName, env = 'production') {
  const funcPath = path.join(CLOUD_FUNCTIONS_DIR, functionName);
  
  if (!checkFunctionExists(functionName)) {
    throw new Error(`云函数 ${functionName} 不存在`);
  }

  try {
    console.log(`🚀 正在部署 ${functionName} (${env})...`);
    
    // 使用微信开发者工具命令行部署
    // 注意：需要先安装微信开发者工具并配置命令行工具
    const cmd = `cli -u ${funcPath} --upload-desc "Auto deploy ${functionName}"`;
    execSync(cmd, { cwd: PROJECT_ROOT, stdio: 'inherit' });
    
    console.log(`✅ ${functionName} 部署成功`);
  } catch (error) {
    console.error(`❌ ${functionName} 部署失败:`, error.message);
    throw error;
  }
}

/**
 * 批量部署所有云函数
 */
async function deployAllFunctions(options = {}) {
  const { 
    env = 'production', 
    functions = Object.keys(FUNCTIONS_CONFIG),
    skipInstall = false,
    dryRun = false 
  } = options;

  console.log(`🚀 开始部署云函数到环境: ${env}`);
  console.log(`📋 目标函数: ${functions.join(', ')}`);
  console.log(`🔧 配置: ${skipInstall ? '跳过依赖安装' : '安装依赖'}, ${dryRun ? '试运行模式' : '实际部署'}`);
  console.log('─'.repeat(50));

  const results = {
    success: [],
    failed: [],
    skipped: []
  };

  for (const funcName of functions) {
    if (!FUNCTIONS_CONFIG[funcName]) {
      console.log(`⚠️  跳过未知函数: ${funcName}`);
      results.skipped.push(funcName);
      continue;
    }

    try {
      if (!skipInstall && !dryRun) {
        installDependencies(funcName);
      }

      if (!dryRun) {
        await deployFunction(funcName, env);
      }

      results.success.push(funcName);
      console.log(`✅ ${funcName} 处理完成\n`);

    } catch (error) {
      results.failed.push({ name: funcName, error: error.message });
      console.log(`❌ ${funcName} 处理失败\n`);
    }
  }

  // 输出汇总报告
  console.log('📊 部署结果汇总:');
  console.log(`✅ 成功: ${results.success.length} 个`);
  console.log(`❌ 失败: ${results.failed.length} 个`);
  console.log(`⏭️  跳过: ${results.skipped.length} 个`);

  if (results.failed.length > 0) {
    console.log('\n🔧 失败详情:');
    results.failed.forEach(({ name, error }) => {
      console.log(`  - ${name}: ${error}`);
    });
  }

  return results;
}

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log(`
云函数部署工具

用法:
  node scripts/deploy-cloudfunctions.js [选项]

选项:
  --env <environment>     部署环境 (默认: production)
  --functions <list>      指定要部署的函数 (逗号分隔)
  --skip-install          跳过依赖安装
  --dry-run               试运行模式 (不实际部署)
  --help                  显示帮助信息

示例:
  # 部署所有函数
  node scripts/deploy-cloudfunctions.js

  # 部署指定函数
  node scripts/deploy-cloudfunctions.js --functions dataImporter,updateQuotes

  # 试运行模式
  node scripts/deploy-cloudfunctions.js --dry-run

  # 跳过依赖安装
  node scripts/deploy-cloudfunctions.js --skip-install
  `);
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  
  // 解析命令行参数
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--env':
        options.env = args[++i];
        break;
      case '--functions':
        options.functions = args[++i].split(',').map(f => f.trim());
        break;
      case '--skip-install':
        options.skipInstall = true;
        break;
      case '--dry-run':
        options.dryRun = true;
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

  try {
    const results = await deployAllFunctions(options);
    
    // 如果有失败的函数，退出码为1
    if (results.failed.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('部署过程发生错误:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = {
  deployAllFunctions,
  deployFunction,
  installDependencies,
  FUNCTIONS_CONFIG
};