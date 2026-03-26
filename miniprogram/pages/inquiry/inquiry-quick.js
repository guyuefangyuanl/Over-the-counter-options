/**
 * 快速询价模块
 * 处理快速询价的搜索、表单验证、提交逻辑
 */

const { DEFAULT_QUICK_FORM } = require('./inquiry-constants');
const { validateInquiryForm } = require('./inquiry-utils');
const { submitInquiry } = require('../../utils/inquiryService');

/**
 * 验证快速询价表单
 * @param {Object} form 表单数据
 * @returns {{ valid: boolean, errors: Object }}
 */
function validateQuickForm(form) {
  const errors = {};
  
  // 验证产品选择
  if (!form.productCode || !form.productName) {
    errors.productName = '请选择产品';
  }
  
  // 验证基础表单
  const baseResult = validateInquiryForm(form);
  Object.assign(errors, baseResult.errors);
  
  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * 搜索产品
 * @param {string} keyword 搜索关键词
 * @param {Array} quoteList 行情列表（用于搜索）
 * @returns {Array} 搜索结果
 */
function searchProducts(keyword, quoteList) {
  if (!keyword || !keyword.trim()) {
    return [];
  }
  
  const kw = keyword.trim().toLowerCase();
  
  return (quoteList || []).filter(item => {
    const name = (item.name || '').toLowerCase();
    const code = (item.code || '').toLowerCase();
    return name.includes(kw) || code.includes(kw);
  }).slice(0, 10); // 最多返回10条
});

/**
 * 选择产品
 * @param {Object} product 产品信息
 * @param {Object} form 当前表单
 * @returns {Object} 更新后的表单
 */
function selectProduct(product, form) {
  return {
    ...form,
    productName: product.name || product.productName,
    productCode: product.code || product.productCode
  };
}

/**
 * 提交快速询价
 * @param {Object} form 表单数据
 * @returns {Promise<{ success: boolean, message: string, data?: Object }>}
 */
async function submitQuickInquiry(form) {
  const submitData = {
    productName: form.productName,
    productCode: form.productCode,
    optionType: form.optionType || 'call',
    structure: form.structure || 'vanilla',
    term: form.term || '1M',
    notionalAmount: form.notionalAmount,
    strikePrice: form.strikePrice || '100',
    selectedDealers: form.selectedDealers || ['CICC'],
    contactName: form.contactName || '',
    contactPhone: form.contactPhone || '',
    contactEmail: form.contactEmail || '',
    notes: form.notes || ''
  };
  
  return await submitInquiry(submitData);
}

/**
 * 获取快速询价初始状态
 * @returns {Object}
 */
function getInitialQuickState() {
  return {
    showQuickForm: false,
    quickForm: { ...DEFAULT_QUICK_FORM },
    quickFormErrors: {},
    isQuickSubmitting: false,
    quickSearchResults: []
  };
}

/**
 * 重置快速询价表单
 * @returns {Object}
 */
function resetQuickForm() {
  return { ...DEFAULT_QUICK_FORM };
}

module.exports = {
  validateQuickForm,
  searchProducts,
  selectProduct,
  submitQuickInquiry,
  getInitialQuickState,
  resetQuickForm
};