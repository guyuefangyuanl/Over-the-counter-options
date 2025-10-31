/**
 * 环境变量和应用配置管理
 */

const path = require('path');
const fs = require('fs');

class AppConfig {
  constructor() {
    this.loadEnvironment();
    this.validateRequiredVariables();
  }

  /**
   * 加载环境变量
   */
  loadEnvironment() {
    // 尝试加载.env文件
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      require('dotenv').config({ path: envPath });
      console.log('✅ 环境变量文件已加载');
    } else {
      console.log('⚠️ 未找到.env文件，使用系统环境变量');
    }
  }

  /**
   * 验证必需的环境变量
   */
  validateRequiredVariables() {
    const required = [
      'NODE_ENV'
    ];

    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      console.warn(`⚠️ 缺少环境变量: ${missing.join(', ')}`);
      console.warn('将使用默认值');
    }
  }

  /**
   * 获取应用基本配置
   * @returns {object} 应用配置
   */
  getAppConfig() {
    return {
      // 应用基本信息
      name: process.env.APP_NAME || 'Option Trading Platform',
      version: process.env.APP_VERSION || '1.0.0',
      description: process.env.APP_DESCRIPTION || '期权交易平台后端服务',
      
      // 运行环境
      env: process.env.NODE_ENV || 'development',
      debug: process.env.DEBUG === 'true',
      
      // 服务器配置
      port: parseInt(process.env.PORT) || 3000,
      host: process.env.HOST || '0.0.0.0',
      
      // API配置
      apiPrefix: process.env.API_PREFIX || '/api',
      apiVersion: process.env.API_VERSION || 'v1',
      
      // 跨域配置
      corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['*'],
      corsCredentials: process.env.CORS_CREDENTIALS === 'true',
      
      // 安全配置
      trustProxy: process.env.TRUST_PROXY === 'true',
      
      // 文件上传配置
      uploadDir: process.env.UPLOAD_DIR || './uploads',
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
      
      // 静态文件配置
      staticDir: process.env.STATIC_DIR || './public',
      staticPath: process.env.STATIC_PATH || '/static'
    };
  }

  /**
   * 获取JWT配置
   * @returns {object} JWT配置
   */
  getJWTConfig() {
    return {
      secret: process.env.JWT_SECRET || 'your-secret-key',
      refreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
      accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || '7d',
      refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || '30d',
      issuer: process.env.JWT_ISSUER || 'option-trading-platform',
      audience: process.env.JWT_AUDIENCE || 'option-trading-users'
    };
  }

  /**
   * 获取微信配置
   * @returns {object} 微信配置
   */
  getWechatConfig() {
    return {
      appId: process.env.WECHAT_APP_ID || '',
      appSecret: process.env.WECHAT_APP_SECRET || '',
      mchId: process.env.WECHAT_MCH_ID || '',
      apiKey: process.env.WECHAT_API_KEY || '',
      notifyUrl: process.env.WECHAT_NOTIFY_URL || '',
      
      // 小程序配置
      miniProgramAppId: process.env.WECHAT_MINI_APP_ID || '',
      miniProgramSecret: process.env.WECHAT_MINI_SECRET || '',
      
      // API地址
      codeToSessionUrl: 'https://api.weixin.qq.com/sns/jscode2session',
      accessTokenUrl: 'https://api.weixin.qq.com/cgi-bin/token'
    };
  }

  /**
   * 获取短信配置
   * @returns {object} 短信配置
   */
  getSMSConfig() {
    return {
      provider: process.env.SMS_PROVIDER || 'aliyun',
      
      // 阿里云短信配置
      aliyun: {
        accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID || '',
        accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET || '',
        endpoint: process.env.ALIYUN_SMS_ENDPOINT || 'https://dysmsapi.aliyuncs.com',
        signName: process.env.ALIYUN_SMS_SIGN_NAME || '',
        templateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE || ''
      },
      
      // 腾讯云短信配置
      tencent: {
        secretId: process.env.TENCENT_SECRET_ID || '',
        secretKey: process.env.TENCENT_SECRET_KEY || '',
        sdkAppId: process.env.TENCENT_SMS_SDK_APP_ID || '',
        signName: process.env.TENCENT_SMS_SIGN_NAME || '',
        templateId: process.env.TENCENT_SMS_TEMPLATE_ID || ''
      }
    };
  }

  /**
   * 获取邮件配置
   * @returns {object} 邮件配置
   */
  getEmailConfig() {
    return {
      service: process.env.EMAIL_SERVICE || 'qq',
      host: process.env.EMAIL_HOST || 'smtp.qq.com',
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === 'true',
      
      auth: {
        user: process.env.EMAIL_USER || '',
        pass: process.env.EMAIL_PASS || ''
      },
      
      from: process.env.EMAIL_FROM || '',
      
      // 邮件模板配置
      templates: {
        verification: process.env.EMAIL_VERIFICATION_TEMPLATE || 'verification',
        passwordReset: process.env.EMAIL_PASSWORD_RESET_TEMPLATE || 'password-reset',
        notification: process.env.EMAIL_NOTIFICATION_TEMPLATE || 'notification'
      }
    };
  }

  /**
   * 获取文件存储配置
   * @returns {object} 文件存储配置
   */
  getStorageConfig() {
    return {
      provider: process.env.STORAGE_PROVIDER || 'local',
      
      // 本地存储配置
      local: {
        uploadDir: process.env.LOCAL_UPLOAD_DIR || './uploads',
        publicUrl: process.env.LOCAL_PUBLIC_URL || '/uploads'
      },
      
      // 阿里云OSS配置
      aliyunOSS: {
        region: process.env.ALIYUN_OSS_REGION || '',
        accessKeyId: process.env.ALIYUN_OSS_ACCESS_KEY_ID || '',
        accessKeySecret: process.env.ALIYUN_OSS_ACCESS_KEY_SECRET || '',
        bucket: process.env.ALIYUN_OSS_BUCKET || '',
        endpoint: process.env.ALIYUN_OSS_ENDPOINT || '',
        customDomain: process.env.ALIYUN_OSS_CUSTOM_DOMAIN || ''
      },
      
      // 腾讯云COS配置
      tencentCOS: {
        secretId: process.env.TENCENT_COS_SECRET_ID || '',
        secretKey: process.env.TENCENT_COS_SECRET_KEY || '',
        region: process.env.TENCENT_COS_REGION || '',
        bucket: process.env.TENCENT_COS_BUCKET || ''
      }
    };
  }

  /**
   * 获取日志配置
   * @returns {object} 日志配置
   */
  getLogConfig() {
    return {
      level: process.env.LOG_LEVEL || 'info',
      format: process.env.LOG_FORMAT || 'json',
      
      // 文件日志配置
      file: {
        enabled: process.env.LOG_FILE_ENABLED !== 'false',
        dir: process.env.LOG_DIR || './logs',
        maxSize: process.env.LOG_MAX_SIZE || '20m',
        maxFiles: parseInt(process.env.LOG_MAX_FILES) || 14,
        datePattern: process.env.LOG_DATE_PATTERN || 'YYYY-MM-DD'
      },
      
      // 控制台日志配置
      console: {
        enabled: process.env.LOG_CONSOLE_ENABLED !== 'false',
        colorize: process.env.LOG_COLORIZE !== 'false'
      },
      
      // 远程日志配置
      remote: {
        enabled: process.env.LOG_REMOTE_ENABLED === 'true',
        url: process.env.LOG_REMOTE_URL || '',
        apiKey: process.env.LOG_REMOTE_API_KEY || ''
      }
    };
  }

  /**
   * 获取缓存配置
   * @returns {object} 缓存配置
   */
  getCacheConfig() {
    return {
      // 全局缓存配置
      defaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL) || 3600,
      maxSize: parseInt(process.env.CACHE_MAX_SIZE) || 1000,
      
      // 特定缓存配置
      marketData: {
        ttl: parseInt(process.env.CACHE_MARKET_DATA_TTL) || 60
      },
      userSession: {
        ttl: parseInt(process.env.CACHE_USER_SESSION_TTL) || 1800
      },
      apiResponse: {
        ttl: parseInt(process.env.CACHE_API_RESPONSE_TTL) || 300
      }
    };
  }

  /**
   * 获取监控配置
   * @returns {object} 监控配置
   */
  getMonitoringConfig() {
    return {
      // 健康检查配置
      healthCheck: {
        enabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
        path: process.env.HEALTH_CHECK_PATH || '/health',
        interval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000
      },
      
      // 性能监控配置
      performance: {
        enabled: process.env.PERFORMANCE_MONITORING_ENABLED === 'true',
        sampleRate: parseFloat(process.env.PERFORMANCE_SAMPLE_RATE) || 0.1
      },
      
      // 错误追踪配置
      errorTracking: {
        enabled: process.env.ERROR_TRACKING_ENABLED === 'true',
        dsn: process.env.ERROR_TRACKING_DSN || '',
        environment: process.env.NODE_ENV || 'development'
      }
    };
  }

  /**
   * 获取安全配置
   * @returns {object} 安全配置
   */
  getSecurityConfig() {
    return {
      // 加密配置
      encryption: {
        algorithm: process.env.ENCRYPTION_ALGORITHM || 'aes-256-gcm',
        key: process.env.ENCRYPTION_KEY || 'your-encryption-key'
      },
      
      // CORS配置
      cors: {
        origins: this.getAppConfig().corsOrigins,
        credentials: this.getAppConfig().corsCredentials,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
      },
      
      // 请求限制配置
      rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15分钟
        max: parseInt(process.env.RATE_LIMIT_MAX) || 1000,
        skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESS === 'true'
      },
      
      // Helmet安全头配置
      helmet: {
        contentSecurityPolicy: process.env.CSP_ENABLED === 'true',
        crossOriginEmbedderPolicy: false,
        crossOriginOpenerPolicy: false,
        crossOriginResourcePolicy: false
      }
    };
  }

  /**
   * 获取所有配置
   * @returns {object} 完整配置对象
   */
  getAllConfig() {
    return {
      app: this.getAppConfig(),
      jwt: this.getJWTConfig(),
      wechat: this.getWechatConfig(),
      sms: this.getSMSConfig(),
      email: this.getEmailConfig(),
      storage: this.getStorageConfig(),
      log: this.getLogConfig(),
      cache: this.getCacheConfig(),
      monitoring: this.getMonitoringConfig(),
      security: this.getSecurityConfig()
    };
  }

  /**
   * 检查配置完整性
   * @returns {object} 检查结果
   */
  validateConfig() {
    const issues = [];
    const warnings = [];
    
    // 检查生产环境必需配置
    if (process.env.NODE_ENV === 'production') {
      const requiredInProduction = [
        'JWT_SECRET',
        'JWT_REFRESH_SECRET',
        'DB_HOST',
        'DB_NAME'
      ];
      
      requiredInProduction.forEach(key => {
        if (!process.env[key]) {
          issues.push(`生产环境缺少必需配置: ${key}`);
        }
      });
      
      // 检查默认密钥
      if (process.env.JWT_SECRET === 'your-secret-key') {
        issues.push('生产环境不应使用默认JWT密钥');
      }
    }
    
    // 检查端口冲突
    const port = this.getAppConfig().port;
    if (port < 1024 && process.getuid && process.getuid() !== 0) {
      warnings.push(`端口 ${port} 可能需要管理员权限`);
    }
    
    return {
      isValid: issues.length === 0,
      issues,
      warnings
    };
  }

  /**
   * 打印配置摘要
   */
  printConfigSummary() {
    const config = this.getAppConfig();
    
    console.log('\n📋 应用配置摘要:');
    console.log('─'.repeat(50));
    console.log(`应用名称: ${config.name}`);
    console.log(`版本: ${config.version}`);
    console.log(`环境: ${config.env}`);
    console.log(`端口: ${config.port}`);
    console.log(`API前缀: ${config.apiPrefix}`);
    console.log(`调试模式: ${config.debug ? '开启' : '关闭'}`);
    console.log('─'.repeat(50));
    
    const validation = this.validateConfig();
    if (!validation.isValid) {
      console.log('\n❌ 配置问题:');
      validation.issues.forEach(issue => console.log(`  • ${issue}`));
    }
    
    if (validation.warnings.length > 0) {
      console.log('\n⚠️ 配置警告:');
      validation.warnings.forEach(warning => console.log(`  • ${warning}`));
    }
    
    console.log('');
  }
}

// 创建单例实例
const appConfig = new AppConfig();

module.exports = appConfig;