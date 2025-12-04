const morgan = require('morgan');

/**
 * 请求日志中间件
 */
const requestLogger = morgan(':method :url :status :response-time ms - :res[content-length]');

/**
 * 自定义日志中间件
 */
function customLogger(req, res, next) {
  console.log(`📥 ${req.method} ${req.path} - IP: ${req.ip} - User-Agent: ${req.get('User-Agent')}`);
  
  // 如果有请求体，记录请求体
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`📦 请求体:`, req.body);
  }
  
  // 如果有查询参数，记录查询参数
  if (req.query && Object.keys(req.query).length > 0) {
    console.log(`🔍 查询参数:`, req.query);
  }
  
  next();
}

module.exports = {
  requestLogger,
  customLogger
};