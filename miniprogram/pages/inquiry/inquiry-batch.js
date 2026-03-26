/**
 * 批量询价模块
 * 处理批量询价的表单验证、提交逻辑
 */

const { BATCH_CONFIG, DEFAULT_BATCH_FORM } = require('./inquiry-constants');
const { validateInquiryForm } = require('./inquiry-utils');
const { submitInquiry } = require('../../utils/inquiryService');

/**
 * 验证批量询价表单
 * @param {Object} form 表单数据
 * @param {Array} products 产品列表
 * @returns {{ valid: boolean, errors: Object }}
 */
function validateBatchForm(form, products) {
  const errors = {};
  
  // 验证基础表单
  const baseResult = validateInquiryForm(form);
  Object.assign(errors, baseResult.errors);
  
  // 验证产品列表
  if (!products || products.length === 0) {
    errors.products = '请选择至少一个产品';
  } else if (products.length > BATCH_CONFIG.MAX_BATCH_SIZE) {
    errors.products = `最多支持${BATCH_CONFIG.MAX_BATCH_SIZE}个产品`;
  }
  
  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * 执行批量询价
 * @param {Object} form 表单数据
 * @param {Array} products 产品列表
 * @param {Function} onProgress 进度回调 (current, total, success, fail)
 * @param {Function} onComplete 完成回调 (result)
 * @returns {Promise<Object>}
 */
async function executeBatchInquiry(form, products, onProgress, onComplete) {
  const result = {
    total: products.length,
    success: 0,
    failed: 0,
    details: []
  };
  
  const totalBatches = Math.ceil(products.length / BATCH_CONFIG.BATCH_SIZE);
  
  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const start = batchIndex * BATCH_CONFIG.BATCH_SIZE;
    const end = Math.min(start + BATCH_CONFIG.BATCH_SIZE, products.length);
    const batchProducts = products.slice(start, end);
    
    // 并发执行当前批次
    const batchPromises = batchProducts.map(async (product, idx) => {
      const submitData = {
        selectedProduct: product,
        productName: product.name,
        productCode: product.code,
        optionType: form.optionType,
        structure: form.structure,
        term: form.term,
        notionalAmount: form.notionalAmount,
        strikePrice: form.strikePrice,
        selectedDealers: form.selectedDealers,
        contactName: form.contactName,
        contactPhone: form.contactPhone,
        contactEmail: form.contactEmail,
        notes: form.notes
      };
      
      try {
        const res = await submitInquiry(submitData);
        return {
          product,
          success: res.success,
          message: res.message,
          data: res.data
        };
      } catch (err) {
        return {
          product,
          success: false,
          message: err.message || '提交失败'
        };
      }
    });
    
    // 等待当前批次完成
    const batchResults = await Promise.all(batchPromises);
    
    // 统计结果
    for (const res of batchResults) {
      if (res.success) {
        result.success++;
      } else {
        result.failed++;
      }
      result.details.push(res);
      
      // 进度回调
      if (onProgress) {
        onProgress(
          start + result.details.length,
          result.total,
          result.success,
          result.failed
        );
      }
    }
    
    // 批次间延迟（避免并发过高）
    if (batchIndex < totalBatches - 1) {
      await new Promise(resolve => setTimeout(resolve, BATCH_CONFIG.BATCH_DELAY));
    }
  }
  
  // 完成回调
  if (onComplete) {
    onComplete(result);
  }
  
  return result;
}

/**
 * 构建批量询价提交数据
 * @param {Object} form 表单数据
 * @param {Object} product 产品信息
 * @returns {Object}
 */
function buildBatchSubmitData(form, product) {
  return {
    selectedProduct: product,
    productName: product.name || product.productName,
    productCode: product.code || product.productCode,
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
}

/**
 * 获取批量询价初始状态
 * @returns {Object}
 */
function getInitialBatchState() {
  return {
    showBatchForm: false,
    batchForm: { ...DEFAULT_BATCH_FORM },
    batchFormErrors: {},
    batchProducts: [],
    isBatchSubmitting: false,
    batchProgress: 0,
    batchTotal: 0,
    batchSuccessCount: 0,
    batchFailCount: 0,
    showBatchResult: false
  };
}

module.exports = {
  validateBatchForm,
  executeBatchInquiry,
  buildBatchSubmitData,
  getInitialBatchState,
  BATCH_CONFIG
};