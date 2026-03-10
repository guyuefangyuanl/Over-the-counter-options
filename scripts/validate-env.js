#!/usr/bin/env node
/**
 * 环境变量验证脚本
 * 用于在部署前检查关键环境变量的配置完整性和安全性
 * 
 * 使用方法：
 *   node scripts/validate-env.js
 *   或在部署脚本中自动运行
 */

const fs = require('fs');
const path = require('path');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

const log = {
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  section: (msg) => console.log(`\n${colors.cyan}${'='.repeat(60)}\n${msg}\n${'='.repeat(60)}${colors.reset}\n`),
};

// 加载环境变量
function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) {
    return null;
  }
  
  const content = fs.readFileSync(envPath, 'utf-8');
  const env = {};
  
  content.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        env[match[1].trim()] = match[2].trim();
      }
    }
  });
  
  return env;
}

// 验证规则
const validationRules = {
  // P0 级别：必须配置且不能使用占位符
  critical: [
    {
      key: 'WX_SECRET',
      description: '微信云开发密钥',
      check: (value) => {
        if (!value || value === '') return { valid: false, message: '未配置 WX_SECRET' };
        if (value.includes('YOUR_') || value.includes('PLACEHOLDER')) {
          return { valid: false, message: 'WX_SECRET 仍在使用占位符，请替换为真实密钥' };
        }
        if (value.length < 32) {
          return { valid: false, message: 'WX_SECRET 长度过短，可能不是有效的密钥' };
        }
        return { valid: true };
      }
    },
    {
      key: 'SECRET_KEY',
      description: 'Flask应用密钥',
      check: (value) => {
        if (!value || value === '') return { valid: false, message: '未配置 SECRET_KEY' };
        if (value === 'dev-secret-key-change-in-production') {
          return { valid: false, message: 'SECRET_KEY 仍在使用开发环境默认值' };
        }
        if (value.length < 64) {
          return { valid: false, message: 'SECRET_KEY 长度应至少为 64 个字符（32字节十六进制）' };
        }
        // 检查是否为十六进制
        if (!/^[0-9a-fA-F]+$/.test(value)) {
          return { valid: false, message: 'SECRET_KEY 应为十六进制格式' };
        }
        return { valid: true };
      }
    },
    {
      key: 'JWT_SECRET',
      description: 'JWT令牌密钥',
      check: (value) => {
        if (!value || value === '') return { valid: false, message: '未配置 JWT_SECRET' };
        if (value.length < 64) {
          return { valid: false, message: 'JWT_SECRET 长度应至少为 64 个字符' };
        }
        if (!/^[0-9a-fA-F]+$/.test(value)) {
          return { valid: false, message: 'JWT_SECRET 应为十六进制格式' };
        }
        // 检查是否与 SECRET_KEY 相同（不应相同）
        return { valid: true };
      }
    },
    {
      key: 'WX_CLOUD_ENV',
      description: '微信云环境ID',
      check: (value) => {
        if (!value || value === '') return { valid: false, message: '未配置 WX_CLOUD_ENV' };
        if (value.includes('your-') || value.includes('YOUR')) {
          return { valid: false, message: 'WX_CLOUD_ENV 仍在使用占位符' };
        }
        return { valid: true };
      }
    },
  ],
  
  // P1 级别：建议配置
  recommended: [
    {
      key: 'SSL_VERIFY',
      description: 'SSL证书验证',
      check: (value) => {
        if (value === 'false') {
          return { valid: false, message: '生产环境应启用 SSL 验证（SSL_VERIFY=true）以防止中间人攻击' };
        }
        return { valid: true };
      }
    },
    {
      key: 'ADMIN_PASSWORD',
      description: '管理员密码',
      check: (value) => {
        if (!value || value === '') return { valid: true };  // 可选配置
        if (value === 'admin123' || value === 'admin' || value === '123456') {
          return { valid: false, message: '管理员密码过于简单，建议使用强密码' };
        }
        if (value.length < 8) {
          return { valid: false, message: '管理员密码长度应至少为 8 位' };
        }
        return { valid: true };
      }
    },
    {
      key: 'ALLOWED_ORIGINS',
      description: 'CORS跨域配置',
      check: (value) => {
        if (!value || value === '') {
          return { valid: false, message: '未配置 ALLOWED_ORIGINS，将使用默认值' };
        }
        if (value === '*') {
          return { valid: false, message: 'ALLOWED_ORIGINS 不应使用通配符 *，请配置实际域名' };
        }
        return { valid: true };
      }
    },
  ],
  
  // 一致性检查
  consistency: [
    {
      description: 'SECRET_KEY 和 JWT_SECRET 不应相同',
      check: (env) => {
        if (env.SECRET_KEY && env.JWT_SECRET && env.SECRET_KEY === env.JWT_SECRET) {
          return { valid: false, message: 'SECRET_KEY 和 JWT_SECRET 不应设置为相同的值' };
        }
        return { valid: true };
      }
    },
    {
      description: '环境变量 NODE_ENV 应设置为 production',
      check: (env) => {
        if (env.NODE_ENV !== 'production') {
          return { valid: false, message: `NODE_ENV 当前为 "${env.NODE_ENV}"，生产环境应设置为 "production"` };
        }
        return { valid: true };
      }
    },
  ]
};

// 执行验证
function validateEnvironment(envPath) {
  log.section(`正在验证环境配置文件: ${envPath}`);
  
  const env = loadEnvFile(envPath);
  if (!env) {
    log.error(`无法读取环境配置文件: ${envPath}`);
    return false;
  }
  
  let hasErrors = false;
  let hasWarnings = false;
  
  // 验证关键配置
  log.info('检查关键配置（P0级别）...');
  validationRules.critical.forEach(rule => {
    const value = env[rule.key];
    const result = rule.check(value);
    
    if (!result.valid) {
      log.error(`${rule.description} (${rule.key}): ${result.message}`);
      hasErrors = true;
    } else {
      log.success(`${rule.description} (${rule.key}): 配置正确`);
    }
  });
  
  // 验证推荐配置
  console.log('');
  log.info('检查推荐配置（P1级别）...');
  validationRules.recommended.forEach(rule => {
    const value = env[rule.key];
    const result = rule.check(value);
    
    if (!result.valid) {
      log.warn(`${rule.description} (${rule.key}): ${result.message}`);
      hasWarnings = true;
    } else {
      log.success(`${rule.description} (${rule.key}): 配置正确`);
    }
  });
  
  // 一致性检查
  console.log('');
  log.info('执行一致性检查...');
  validationRules.consistency.forEach(rule => {
    const result = rule.check(env);
    
    if (!result.valid) {
      log.error(`${rule.description}: ${result.message}`);
      hasErrors = true;
    } else {
      log.success(`${rule.description}: 通过`);
    }
  });
  
  // 总结
  console.log('');
  log.section('验证结果');
  
  if (hasErrors) {
    log.error('发现严重配置问题！必须修复后才能部署到生产环境。');
    log.info('\n修复建议：');
    log.info('1. 运行以下命令生成新的密钥：');
    log.info('   python -c "import secrets; print(secrets.token_hex(32))"');
    log.info('2. 从微信公众平台获取真实的 WX_SECRET');
    log.info('3. 确保所有占位符都已替换为真实值');
    log.info('4. 使用密钥管理服务（AWS KMS、Azure Key Vault等）存储敏感信息');
    return false;
  } else if (hasWarnings) {
    log.warn('配置基本正确，但存在一些建议改进的地方。');
    log.info('建议在部署前处理警告项以提升系统安全性。');
    return true;
  } else {
    log.success('所有配置检查通过！可以安全部署。');
    return true;
  }
}

// 主函数
function main() {
  console.log(`${colors.magenta}
╔═══════════════════════════════════════════════════════════╗
║      场外期权交易系统 - 环境变量验证工具 v1.0            ║
║      Environment Variables Validation Tool                ║
╚═══════════════════════════════════════════════════════════╝
${colors.reset}`);
  
  const projectRoot = path.join(__dirname, '..');
  const envProductionPath = path.join(projectRoot, '.env.production');
  
  // 验证生产环境配置
  const isValid = validateEnvironment(envProductionPath);
  
  if (!isValid) {
    process.exit(1);  // 验证失败，返回非零退出码
  } else {
    process.exit(0);  // 验证成功
  }
}

// 执行
if (require.main === module) {
  main();
}

module.exports = { validateEnvironment, validationRules };
