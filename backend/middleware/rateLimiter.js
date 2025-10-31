/**
 * 请求限制中间件
 * 防止API滥用和DDoS攻击
 */

const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');

/**
 * 通用API限制器
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 1000, // 每个IP每15分钟最多1000个请求
  message: {
    success: false,
    message: '请求过于频繁，请稍后再试',
    code: 'TOO_MANY_REQUESTS',
    retryAfter: '15分钟'
  },
  standardHeaders: true, // 返回标准的限制头部
  legacyHeaders: false, // 禁用X-RateLimit-*头部
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: '请求过于频繁，请稍后再试',
      code: 'TOO_MANY_REQUESTS',
      retryAfter: Math.round(req.rateLimit.resetTime / 1000)
    });
  }
});

/**
 * 严格的API限制器（用于敏感操作）
 */
const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1小时
  max: 10, // 每个IP每小时最多10个请求
  message: {
    success: false,
    message: '敏感操作请求过于频繁，请稍后再试',
    code: 'STRICT_RATE_LIMIT_EXCEEDED',
    retryAfter: '1小时'
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: '敏感操作请求过于频繁，请稍后再试',
      code: 'STRICT_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.round(req.rateLimit.resetTime / 1000)
    });
  }
});

/**
 * 登录限制器
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 5, // 每个IP每15分钟最多5次登录尝试
  skipSuccessfulRequests: true, // 成功的请求不计入限制
  message: {
    success: false,
    message: '登录尝试过于频繁，请稍后再试',
    code: 'LOGIN_RATE_LIMIT_EXCEEDED',
    retryAfter: '15分钟'
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: '登录尝试过于频繁，请稍后再试',
      code: 'LOGIN_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.round(req.rateLimit.resetTime / 1000)
    });
  }
});

/**
 * 询价限制器
 */
const inquiryLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 30, // 每个IP每分钟最多30次询价
  message: {
    success: false,
    message: '询价请求过于频繁，请稍后再试',
    code: 'INQUIRY_RATE_LIMIT_EXCEEDED',
    retryAfter: '1分钟'
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: '询价请求过于频繁，请稍后再试',
      code: 'INQUIRY_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.round(req.rateLimit.resetTime / 1000)
    });
  }
});

/**
 * 市场数据限制器
 */
const marketDataLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 200, // 每个IP每分钟最多200次市场数据请求
  message: {
    success: false,
    message: '市场数据请求过于频繁，请稍后再试',
    code: 'MARKET_DATA_RATE_LIMIT_EXCEEDED',
    retryAfter: '1分钟'
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: '市场数据请求过于频繁，请稍后再试',
      code: 'MARKET_DATA_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.round(req.rateLimit.resetTime / 1000)
    });
  }
});

/**
 * 文件上传限制器
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1小时
  max: 50, // 每个IP每小时最多50次文件上传
  message: {
    success: false,
    message: '文件上传过于频繁，请稍后再试',
    code: 'UPLOAD_RATE_LIMIT_EXCEEDED',
    retryAfter: '1小时'
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: '文件上传过于频繁，请稍后再试',
      code: 'UPLOAD_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.round(req.rateLimit.resetTime / 1000)
    });
  }
});

/**
 * 验证码限制器
 */
const smsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 1, // 每个IP每分钟最多1次验证码请求
  message: {
    success: false,
    message: '验证码请求过于频繁，请稍后再试',
    code: 'SMS_RATE_LIMIT_EXCEEDED',
    retryAfter: '1分钟'
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: '验证码请求过于频繁，请稍后再试',
      code: 'SMS_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.round(req.rateLimit.resetTime / 1000)
    });
  }
});

/**
 * 请求速度减缓器
 * 当请求频率过高时增加延迟
 */
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15分钟
  delayAfter: 100, // 超过100个请求后开始延迟
  delayMs: 500, // 每个请求延迟500ms
  maxDelayMs: 5000, // 最大延迟5秒
  skipFailedRequests: false,
  skipSuccessfulRequests: false,
  onLimitReached: (req, res, options) => {
    console.warn(`请求速度过快 IP: ${req.ip}, URL: ${req.originalUrl}`);
  }
});

/**
 * 基于用户的限制器
 * @param {object} options 配置选项
 * @returns {function} 中间件函数
 */
const createUserBasedLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000,
    max = 100,
    message = '用户请求过于频繁'
  } = options;

  const limiter = rateLimit({
    windowMs,
    max,
    keyGenerator: (req) => {
      // 如果用户已登录，使用用户ID；否则使用IP
      return req.user ? `user_${req.user.userId}` : req.ip;
    },
    message: {
      success: false,
      message,
      code: 'USER_RATE_LIMIT_EXCEEDED'
    },
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        message,
        code: 'USER_RATE_LIMIT_EXCEEDED',
        retryAfter: Math.round(req.rateLimit.resetTime / 1000)
      });
    }
  });

  return limiter;
};

/**
 * API密钥限制器
 */
const apiKeyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 1000, // 每个API密钥每分钟最多1000个请求
  keyGenerator: (req) => {
    return req.headers['x-api-key'] || req.ip;
  },
  message: {
    success: false,
    message: 'API请求频率超限',
    code: 'API_RATE_LIMIT_EXCEEDED'
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'API请求频率超限',
      code: 'API_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.round(req.rateLimit.resetTime / 1000)
    });
  }
});

/**
 * 自定义限制器工厂函数
 * @param {object} config 配置对象
 * @returns {function} 限制器中间件
 */
const createCustomLimiter = (config) => {
  const defaultConfig = {
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: '请求过于频繁',
    code: 'RATE_LIMIT_EXCEEDED',
    skipSuccessfulRequests: false,
    skipFailedRequests: false
  };

  const finalConfig = { ...defaultConfig, ...config };

  return rateLimit({
    windowMs: finalConfig.windowMs,
    max: finalConfig.max,
    skipSuccessfulRequests: finalConfig.skipSuccessfulRequests,
    skipFailedRequests: finalConfig.skipFailedRequests,
    keyGenerator: finalConfig.keyGenerator,
    message: {
      success: false,
      message: finalConfig.message,
      code: finalConfig.code
    },
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        message: finalConfig.message,
        code: finalConfig.code,
        retryAfter: Math.round(req.rateLimit.resetTime / 1000)
      });
    }
  });
};

/**
 * 获取限制状态信息
 * @param {object} req 请求对象
 * @returns {object} 限制状态
 */
const getRateLimitStatus = (req) => {
  if (!req.rateLimit) return null;

  return {
    limit: req.rateLimit.limit,
    current: req.rateLimit.current,
    remaining: req.rateLimit.remaining,
    resetTime: req.rateLimit.resetTime
  };
};

module.exports = {
  generalLimiter,
  strictLimiter,
  loginLimiter,
  inquiryLimiter,
  marketDataLimiter,
  uploadLimiter,
  smsLimiter,
  speedLimiter,
  apiKeyLimiter,
  createUserBasedLimiter,
  createCustomLimiter,
  getRateLimitStatus
};