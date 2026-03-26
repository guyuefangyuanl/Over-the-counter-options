/**
 * 询价页面工具函数
 * 包含表单验证、数据处理等通用功能
 */

const { VALIDATION_RULES } = require('./inquiry-constants');

/**
 * 验证手机号
 * @param {string} phone 手机号
 * @returns {{ valid: boolean, error: string }}
 */
function validatePhone(phone) {
  if (!phone || !phone.trim()) {
    return { valid: false, error: '请输入手机号' };
  }
  if (!VALIDATION_RULES.phone.test(phone)) {
    return { valid: false, error: '手机号格式不正确' };
  }
  return { valid: true, error: '' };
}

/**
 * 验证邮箱
 * @param {string} email 邮箱
 * @returns {{ valid: boolean, error: string }}
 */
function validateEmail(email) {
  if (!email || !email.trim()) {
    return { valid: true, error: '' }; // 邮箱非必填
  }
  if (!VALIDATION_RULES.email.test(email)) {
    return { valid: false, error: '邮箱格式不正确' };
  }
  return { valid: true, error: '' };
}

/**
 * 验证名义本金
 * @param {string|number} amount 名义本金(万元)
 * @returns {{ valid: boolean, error: string }}
 */
function validateNotionalAmount(amount) {
  const num = parseFloat(amount);
  if (!amount || isNaN(num)) {
    return { valid: false, error: '请输入名义本金' };
  }
  if (num < VALIDATION_RULES.notionalMin) {
    return { valid: false, error: `名义本金不能小于${VALIDATION_RULES.notionalMin}万元` };
  }
  if (num > VALIDATION_RULES.notionalMax) {
    return { valid: false, error: `名义本金不能超过${VALIDATION_RULES.notionalMax}万元` };
  }
  return { valid: true, error: '' };
}

/**
 * 验证行权价
 * @param {string|number} strike 行权价(%)
 * @returns {{ valid: boolean, error: string }}
 */
function validateStrikePrice(strike) {
  const num = parseFloat(strike);
  if (!strike || isNaN(num)) {
    return { valid: false, error: '请输入行权价' };
  }
  if (num < VALIDATION_RULES.strikeMin) {
    return { valid: false, error: `行权价不能低于${VALIDATION_RULES.strikeMin}%` };
  }
  if (num > VALIDATION_RULES.strikeMax) {
    return { valid: false, error: `行权价不能高于${VALIDATION_RULES.strikeMax}%` };
  }
  return { valid: true, error: '' };
}

/**
 * 验证分组名称
 * @param {string} name 分组名称
 * @returns {{ valid: boolean, error: string }}
 */
function validateGroupName(name) {
  const trimmed = (name || '').trim();
  if (trimmed.length < VALIDATION_RULES.groupNameMin) {
    return { valid: false, error: '分组名称不能为空' };
  }
  if (trimmed.length > VALIDATION_RULES.groupNameMax) {
    return { valid: false, error: `分组名称不能超过${VALIDATION_RULES.groupNameMax}个字符` };
  }
  return { valid: true, error: '' };
}

/**
 * 验证询价表单
 * @param {Object} form 表单数据
 * @returns {{ valid: boolean, errors: Object }}
 */
function validateInquiryForm(form) {
  const errors = {};
  
  // 联系人姓名
  if (!form.contactName || !form.contactName.trim()) {
    errors.contactName = '请输入联系人姓名';
  }
  
  // 手机号
  const phoneResult = validatePhone(form.contactPhone);
  if (!phoneResult.valid) {
    errors.contactPhone = phoneResult.error;
  }
  
  // 邮箱
  const emailResult = validateEmail(form.contactEmail);
  if (!emailResult.valid) {
    errors.contactEmail = emailResult.error;
  }
  
  // 名义本金
  const notionalResult = validateNotionalAmount(form.notionalAmount);
  if (!notionalResult.valid) {
    errors.notionalAmount = notionalResult.error;
  }
  
  // 行权价
  const strikeResult = validateStrikePrice(form.strikePrice);
  if (!strikeResult.valid) {
    errors.strikePrice = strikeResult.error;
  }
  
  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * 格式化金额
 * @param {number} amount 金额
 * @param {number} decimals 小数位数
 * @returns {string}
 */
function formatAmount(amount, decimals = 2) {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '--';
  }
  return parseFloat(amount).toFixed(decimals);
}

/**
 * 格式化百分比
 * @param {number} value 百分比值
 * @param {number} decimals 小数位数
 * @returns {string}
 */
function formatPercent(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) {
    return '--';
  }
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(decimals)}%`;
}

/**
 * 防抖函数
 * @param {Function} fn 目标函数
 * @param {number} delay 延迟时间(ms)
 * @returns {Function}
 */
function debounce(fn, delay = 300) {
  let timer = null;
  return function(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

/**
 * 节流函数
 * @param {Function} fn 目标函数
 * @param {number} interval 间隔时间(ms)
 * @returns {Function}
 */
function throttle(fn, interval = 300) {
  let lastTime = 0;
  return function(...args) {
    const now = Date.now();
    if (now - lastTime >= interval) {
      lastTime = now;
      fn.apply(this, args);
    }
  };
}

/**
 * 深拷贝
 * @param {Object} obj 目标对象
 * @returns {Object}
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (e) {
    console.error('深拷贝失败:', e);
    return obj;
  }
}

/**
 * 生成唯一ID
 * @param {string} prefix 前缀
 * @returns {string}
 */
function generateId(prefix = '') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 9);
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

/**
 * 检查是否为空对象
 * @param {Object} obj 目标对象
 * @returns {boolean}
 */
function isEmpty(obj) {
  if (!obj) return true;
  if (Array.isArray(obj)) return obj.length === 0;
  if (typeof obj === 'object') return Object.keys(obj).length === 0;
  return false;
}

module.exports = {
  // 验证函数
  validatePhone,
  validateEmail,
  validateNotionalAmount,
  validateStrikePrice,
  validateGroupName,
  validateInquiryForm,
  
  // 格式化函数
  formatAmount,
  formatPercent,
  
  // 工具函数
  debounce,
  throttle,
  deepClone,
  generateId,
  isEmpty
};