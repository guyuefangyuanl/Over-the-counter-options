/**
 * 日志记录中间件
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

/**
 * 请求日志中间件
 * @param {object} req 请求对象
 * @param {object} res 响应对象
 * @param {function} next 下一个中间件
 */
const requestLogger = (req, res, next) => {
  // 生成请求ID
  req.requestId = uuidv4();
  
  // 记录请求开始时间
  req.startTime = Date.now();
  
  // 获取请求信息
  const requestInfo = {
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    referer: req.get('Referer'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    headers: filterSensitiveHeaders(req.headers),
    query: req.query,
    body: filterSensitiveData(req.body, req.method),
    user: req.user ? {
      userId: req.user.userId,
      openId: req.user.openId
    } : null
  };

  // 记录请求日志
  logRequest(requestInfo);

  // 监听响应结束事件
  const originalSend = res.send;
  res.send = function(data) {
    // 记录响应信息
    const responseTime = Date.now() - req.startTime;
    const responseInfo = {
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
      statusCode: res.statusCode,
      responseTime,
      contentLength: Buffer.byteLength(data || ''),
      headers: res.getHeaders()
    };

    logResponse(responseInfo);
    
    // 如果是错误响应，记录更详细的信息
    if (res.statusCode >= 400) {
      logError(req, res, data, responseTime);
    }

    return originalSend.call(this, data);
  };

  next();
};

/**
 * 过滤敏感请求头
 * @param {object} headers 请求头对象
 * @returns {object} 过滤后的请求头
 */
const filterSensitiveHeaders = (headers) => {
  const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
  const filtered = { ...headers };
  
  sensitiveHeaders.forEach(header => {
    if (filtered[header]) {
      filtered[header] = '***';
    }
  });
  
  return filtered;
};

/**
 * 过滤敏感数据
 * @param {object} data 数据对象
 * @param {string} method HTTP方法
 * @returns {object} 过滤后的数据
 */
const filterSensitiveData = (data, method) => {
  if (method === 'GET' || !data) return data;
  
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'code'];
  const filtered = JSON.parse(JSON.stringify(data));
  
  const filterRecursive = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;
    
    for (const key in obj) {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
        obj[key] = '***';
      } else if (typeof obj[key] === 'object') {
        filterRecursive(obj[key]);
      }
    }
    return obj;
  };
  
  return filterRecursive(filtered);
};

/**
 * 记录请求日志
 * @param {object} requestInfo 请求信息
 */
const logRequest = (requestInfo) => {
  const logEntry = {
    level: 'INFO',
    type: 'REQUEST',
    ...requestInfo
  };

  // 输出到控制台（开发环境）
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔵 [${requestInfo.method}] ${requestInfo.url} - ${requestInfo.ip}`);
  }

  // 写入日志文件
  writeLog(logEntry, 'access');
};

/**
 * 记录响应日志
 * @param {object} responseInfo 响应信息
 */
const logResponse = (responseInfo) => {
  const logEntry = {
    level: getLogLevel(responseInfo.statusCode),
    type: 'RESPONSE',
    ...responseInfo
  };

  // 输出到控制台（开发环境）
  if (process.env.NODE_ENV === 'development') {
    const statusEmoji = getStatusEmoji(responseInfo.statusCode);
    console.log(`${statusEmoji} ${responseInfo.statusCode} - ${responseInfo.responseTime}ms`);
  }

  // 写入日志文件
  writeLog(logEntry, 'access');
};

/**
 * 记录错误响应日志
 * @param {object} req 请求对象
 * @param {object} res 响应对象
 * @param {string} data 响应数据
 * @param {number} responseTime 响应时间
 */
const logError = (req, res, data, responseTime) => {
  const errorInfo = {
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
    level: 'ERROR',
    type: 'ERROR_RESPONSE',
    method: req.method,
    url: req.originalUrl,
    statusCode: res.statusCode,
    responseTime,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    user: req.user ? {
      userId: req.user.userId,
      openId: req.user.openId
    } : null,
    errorResponse: safeParseJSON(data)
  };

  // 输出到控制台
  console.error(`❌ [${errorInfo.method}] ${errorInfo.url} - ${errorInfo.statusCode} - ${errorInfo.responseTime}ms`);

  // 写入错误日志文件
  writeLog(errorInfo, 'error');
};

/**
 * 业务操作日志记录器
 * @param {string} operation 操作类型
 * @param {object} details 操作详情
 * @param {object} user 用户信息
 */
const logBusinessOperation = (operation, details, user = null) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: 'INFO',
    type: 'BUSINESS_OPERATION',
    operation,
    details,
    user: user ? {
      userId: user.userId,
      openId: user.openId
    } : null
  };

  console.log(`📊 业务操作: ${operation}`);
  writeLog(logEntry, 'business');
};

/**
 * 安全事件日志记录器
 * @param {string} event 安全事件类型
 * @param {object} details 事件详情
 * @param {object} req 请求对象
 */
const logSecurityEvent = (event, details, req = null) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: 'WARN',
    type: 'SECURITY_EVENT',
    event,
    details,
    request: req ? {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.originalUrl,
      method: req.method
    } : null
  };

  console.warn(`🚨 安全事件: ${event}`);
  writeLog(logEntry, 'security');
};

/**
 * 性能日志记录器
 * @param {string} operation 操作名称
 * @param {number} duration 执行时间
 * @param {object} metadata 元数据
 */
const logPerformance = (operation, duration, metadata = {}) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: duration > 1000 ? 'WARN' : 'INFO',
    type: 'PERFORMANCE',
    operation,
    duration,
    metadata
  };

  if (duration > 1000) {
    console.warn(`⚠️  慢查询: ${operation} - ${duration}ms`);
  }

  writeLog(logEntry, 'performance');
};

/**
 * 写入日志文件
 * @param {object} logEntry 日志条目
 * @param {string} logType 日志类型
 */
const writeLog = (logEntry, logType = 'general') => {
  try {
    const logsDir = path.join(__dirname, '../logs');
    
    // 确保日志目录存在
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(logsDir, `${logType}-${today}.log`);
    
    const logLine = JSON.stringify(logEntry) + '\n';
    
    fs.appendFileSync(logFile, logLine);
  } catch (error) {
    console.error('写入日志文件失败:', error);
  }
};

/**
 * 获取日志级别
 * @param {number} statusCode HTTP状态码
 * @returns {string} 日志级别
 */
const getLogLevel = (statusCode) => {
  if (statusCode >= 500) return 'ERROR';
  if (statusCode >= 400) return 'WARN';
  if (statusCode >= 300) return 'INFO';
  return 'INFO';
};

/**
 * 获取状态码对应的表情符号
 * @param {number} statusCode HTTP状态码
 * @returns {string} 表情符号
 */
const getStatusEmoji = (statusCode) => {
  if (statusCode >= 500) return '❌';
  if (statusCode >= 400) return '⚠️';
  if (statusCode >= 300) return '🔄';
  return '✅';
};

/**
 * 安全解析JSON
 * @param {string} data JSON字符串
 * @returns {object} 解析后的对象或原始字符串
 */
const safeParseJSON = (data) => {
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
};

/**
 * 日志清理器 - 删除旧日志文件
 * @param {number} retentionDays 保留天数
 */
const cleanupLogs = (retentionDays = 30) => {
  try {
    const logsDir = path.join(__dirname, '../logs');
    
    if (!fs.existsSync(logsDir)) return;

    const files = fs.readdirSync(logsDir);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    files.forEach(file => {
      const filePath = path.join(logsDir, file);
      const stats = fs.statSync(filePath);
      
      if (stats.mtime < cutoffDate) {
        fs.unlinkSync(filePath);
        console.log(`删除旧日志文件: ${file}`);
      }
    });
  } catch (error) {
    console.error('清理日志文件失败:', error);
  }
};

/**
 * 启动定期日志清理
 * @param {number} intervalHours 清理间隔（小时）
 * @param {number} retentionDays 保留天数
 */
const startLogCleanup = (intervalHours = 24, retentionDays = 30) => {
  setInterval(() => {
    cleanupLogs(retentionDays);
  }, intervalHours * 60 * 60 * 1000);

  console.log(`日志清理已启动，每${intervalHours}小时清理一次，保留${retentionDays}天`);
};

module.exports = {
  requestLogger,
  logBusinessOperation,
  logSecurityEvent,
  logPerformance,
  cleanupLogs,
  startLogCleanup
};