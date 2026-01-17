/**
 * 统一响应处理工具
 */

/**
 * 成功响应
 * @param {object} res Express response object
 * @param {any} data 返回数据
 * @param {string} message 成功消息
 * @param {number} code 状态码
 */
const success = (res, data = {}, message = 'success', code = 200) => {
  return res.status(code).json({
    success: true,
    code,
    data: data || {},
    message,
    timestamp: new Date().toISOString()
  });
};

/**
 * 错误响应
 * @param {object} res Express response object
 * @param {string} message 错误消息
 * @param {number} code 状态码
 * @param {any} data 错误详情数据
 */
const error = (res, message = 'error', code = 500, data = {}) => {
  return res.status(code).json({
    success: false,
    code,
    data: data || {},
    message,
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  success,
  error
};
