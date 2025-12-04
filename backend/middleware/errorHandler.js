/**
 * 错误处理中间件
 */

const fs = require('fs');
const path = require('path');

/**
 * 404错误处理中间件
 * @param {object} req 请求对象
 * @param {object} res 响应对象
 * @param {function} next 下一个中间件
 */
const notFoundHandler = (req, res, next) => {
  const error = new Error(`路径 ${req.originalUrl} 不存在`);
  error.status = 404;
  error.code = 'ROUTE_NOT_FOUND';
  next(error);
};

/**
 * 全局错误处理中间件
 * @param {Error} error 错误对象
 * @param {object} req 请求对象
 * @param {object} res 响应对象
 * @param {function} next 下一个中间件
 */
const errorHandler = (error, req, res, next) => {
  // 设置默认错误状态码
  let status = error.status || error.statusCode || 500;
  let message = error.message || '服务器内部错误';
  let code = error.code || 'INTERNAL_SERVER_ERROR';
  let details = null;

  // 处理不同类型的错误
  switch (error.name) {
    case 'ValidationError':
      // Mongoose验证错误
      status = 400;
      code = 'VALIDATION_ERROR';
      message = '数据验证失败';
      details = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message,
        value: err.value
      }));
      break;

    case 'CastError':
      // Mongoose类型转换错误
      status = 400;
      code = 'INVALID_ID_FORMAT';
      message = '无效的ID格式';
      details = {
        field: error.path,
        value: error.value,
        expectedType: error.kind
      };
      break;

    case 'MongoError':
    case 'MongoServerError':
      // MongoDB错误
      if (error.code === 11000) {
        status = 409;
        code = 'DUPLICATE_KEY_ERROR';
        message = '数据重复';
        const field = Object.keys(error.keyPattern)[0];
        details = {
          field,
          message: `${field}已存在`
        };
      } else {
        status = 500;
        code = 'DATABASE_ERROR';
        message = '数据库操作失败';
      }
      break;

    case 'JsonWebTokenError':
      status = 401;
      code = 'INVALID_TOKEN';
      message = '无效的访问令牌';
      break;

    case 'TokenExpiredError':
      status = 401;
      code = 'TOKEN_EXPIRED';
      message = '访问令牌已过期';
      break;

    case 'SyntaxError':
      // JSON解析错误
      if (error.message.includes('JSON')) {
        status = 400;
        code = 'INVALID_JSON';
        message = '请求数据格式错误';
      }
      break;

    case 'MulterError':
      // 文件上传错误
      status = 400;
      code = 'FILE_UPLOAD_ERROR';
      if (error.code === 'LIMIT_FILE_SIZE') {
        message = '文件大小超出限制';
      } else if (error.code === 'LIMIT_FILE_COUNT') {
        message = '文件数量超出限制';
      } else {
        message = '文件上传失败';
      }
      break;

    default:
      // 其他错误保持原状
      break;
  }

  // 记录错误日志
  logError(error, req);

  // 在开发环境中返回错误堆栈
  const errorResponse = {
    success: false,
    message,
    code,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method
  };

  if (details) {
    errorResponse.details = details;
  }

  // 在开发环境中包含错误堆栈
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = error.stack;
    errorResponse.originalError = error.message;
  }

  // 添加请求ID（如果存在）
  if (req.requestId) {
    errorResponse.requestId = req.requestId;
  }

  res.status(status).json(errorResponse);
};

/**
 * 异步错误处理包装器
 * @param {function} fn 异步函数
 * @returns {function} 包装后的函数
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 记录错误日志
 * @param {Error} error 错误对象
 * @param {object} req 请求对象
 */
const logError = (error, req) => {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level: 'ERROR',
    message: error.message,
    stack: error.stack,
    request: {
      method: req.method,
      url: req.originalUrl,
      headers: req.headers,
      body: req.method !== 'GET' ? req.body : undefined,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    },
    user: req.user ? {
      userId: req.user.userId,
      openId: req.user.openId
    } : null
  };

  // 输出到控制台
  console.error('错误详情:', JSON.stringify(logEntry, null, 2));

  // 写入错误日志文件
  writeErrorLog(logEntry);
};

/**
 * 写入错误日志文件
 * @param {object} logEntry 日志条目
 */
const writeErrorLog = (logEntry) => {
  try {
    const logsDir = path.join(__dirname, '../logs');
    
    // 确保日志目录存在
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(logsDir, `error-${today}.log`);
    
    const logLine = JSON.stringify(logEntry) + '\n';
    
    fs.appendFileSync(logFile, logLine);
  } catch (writeError) {
    console.error('写入错误日志失败:', writeError);
  }
};

/**
 * 创建自定义错误
 * @param {string} message 错误消息
 * @param {number} status HTTP状态码
 * @param {string} code 错误代码
 * @returns {Error} 自定义错误对象
 */
const createError = (message, status = 500, code = 'CUSTOM_ERROR') => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
};

/**
 * 业务错误类
 */
class BusinessError extends Error {
  constructor(message, code = 'BUSINESS_ERROR', status = 400) {
    super(message);
    this.name = 'BusinessError';
    this.code = code;
    this.status = status;
  }
}

/**
 * 权限错误类
 */
class PermissionError extends Error {
  constructor(message = '权限不足', code = 'PERMISSION_DENIED') {
    super(message);
    this.name = 'PermissionError';
    this.code = code;
    this.status = 403;
  }
}

/**
 * 资源未找到错误类
 */
class NotFoundError extends Error {
  constructor(message = '资源未找到', code = 'RESOURCE_NOT_FOUND') {
    super(message);
    this.name = 'NotFoundError';
    this.code = code;
    this.status = 404;
  }
}

/**
 * 请求过于频繁错误类
 */
class TooManyRequestsError extends Error {
  constructor(message = '请求过于频繁', code = 'TOO_MANY_REQUESTS') {
    super(message);
    this.name = 'TooManyRequestsError';
    this.code = code;
    this.status = 429;
  }
}

/**
 * 未处理的Promise拒绝处理器
 */
const handleUnhandledRejection = () => {
  process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的Promise拒绝:', reason);
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      type: 'UNHANDLED_PROMISE_REJECTION',
      reason: reason.toString(),
      stack: reason.stack,
      promise: promise.toString()
    };
    
    writeErrorLog(logEntry);
    
    // 优雅地关闭服务器
    process.exit(1);
  });
};

/**
 * 未捕获异常处理器
 */
const handleUncaughtException = () => {
  process.on('uncaughtException', (error) => {
    console.error('未捕获的异常:', error);
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      type: 'UNCAUGHT_EXCEPTION',
      message: error.message,
      stack: error.stack
    };
    
    writeErrorLog(logEntry);
    
    // 立即退出
    process.exit(1);
  });
};

module.exports = {
  notFoundHandler,
  errorHandler,
  asyncHandler,
  createError,
  BusinessError,
  PermissionError,
  NotFoundError,
  TooManyRequestsError,
  handleUnhandledRejection,
  handleUncaughtException,
  logError
};