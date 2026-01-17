#!/usr/bin/env node

/**
 * API 地址硬编码检查脚本
 * 
 * 用途：扫描代码库中所有可能存在硬编码 API 地址的文件
 * 使用：node scripts/check-hardcoded-urls.js
 */

const fs = require('fs');
const path = require('path');

// 需要扫描的文件类型
const FILE_EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx'];

// 需要扫描的目录
const SCAN_DIRS = [
  'miniprogram/utils',
  'miniprogram/pages',
  'miniprogram/components',
  'admin-ui/src',
  'utils',
  'services'
];

// 排除的目录
const EXCLUDE_DIRS = ['node_modules', 'dist', 'build', '.git', 'miniprogram_npm'];

// 硬编码模式（正则表达式）
const HARDCODED_PATTERNS = [
  /['"]http:\/\/localhost:\d+/g,
  /['"]https?:\/\/127\.0\.0\.1:\d+/g,
  /['"]https?:\/\/192\.168\.\d+\.\d+:\d+/g,
  /const\s+BASE_URL\s*=\s*['"]http/g,
  /let\s+BASE_URL\s*=\s*['"]http/g,
  /var\s+BASE_URL\s*=\s*['"]http/g
];

// 允许的例外（配置文件和后端工具）
const ALLOWED_FILES = [
  'api.config.js',
  'config.js',
  'check-hardcoded-urls.js', // 本脚本自身
  'api.js' // utils/api.js 后端工具，使用环境变量作为默认值是合理的
];

const issues = [];

/**
 * 检查单个文件
 */
function checkFile(filePath) {
  // 检查是否在允许列表中
  const fileName = path.basename(filePath);
  if (ALLOWED_FILES.includes(fileName)) {
    return;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      HARDCODED_PATTERNS.forEach((pattern) => {
        const matches = line.match(pattern);
        if (matches) {
          issues.push({
            file: filePath,
            line: index + 1,
            content: line.trim(),
            pattern: pattern.toString()
          });
        }
      });
    });
  } catch (err) {
    console.error(`读取文件失败: ${filePath}`, err.message);
  }
}

/**
 * 递归扫描目录
 */
function scanDirectory(dirPath) {
  try {
    const items = fs.readdirSync(dirPath);

    items.forEach((item) => {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // 跳过排除的目录
        if (EXCLUDE_DIRS.includes(item)) {
          return;
        }
        scanDirectory(fullPath);
      } else if (stat.isFile()) {
        // 检查文件扩展名
        const ext = path.extname(fullPath);
        if (FILE_EXTENSIONS.includes(ext)) {
          checkFile(fullPath);
        }
      }
    });
  } catch (err) {
    // 目录不存在时跳过
    if (err.code !== 'ENOENT') {
      console.error(`扫描目录失败: ${dirPath}`, err.message);
    }
  }
}

/**
 * 主函数
 */
function main() {
  console.log('🔍 开始扫描硬编码 API 地址...\n');

  const startTime = Date.now();

  // 扫描所有目标目录
  SCAN_DIRS.forEach((dir) => {
    const fullPath = path.resolve(process.cwd(), dir);
    console.log(`扫描目录: ${dir}`);
    scanDirectory(fullPath);
  });

  const duration = Date.now() - startTime;

  // 输出结果
  console.log(`\n✅ 扫描完成 (耗时 ${duration}ms)\n`);

  if (issues.length === 0) {
    console.log('✨ 未发现硬编码的 API 地址！\n');
    process.exit(0);
  } else {
    console.log(`⚠️  发现 ${issues.length} 个问题:\n`);
    
    issues.forEach((issue, index) => {
      console.log(`${index + 1}. ${issue.file}:${issue.line}`);
      console.log(`   代码: ${issue.content}`);
      console.log(`   匹配模式: ${issue.pattern}`);
      console.log('');
    });

    console.log('❌ 请修复以上硬编码问题！');
    console.log('💡 提示：使用配置文件统一管理 API 地址\n');
    
    // 返回非零退出码（用于 CI/CD）
    process.exit(1);
  }
}

// 执行检查
if (require.main === module) {
  main();
}

module.exports = { checkFile, scanDirectory };
