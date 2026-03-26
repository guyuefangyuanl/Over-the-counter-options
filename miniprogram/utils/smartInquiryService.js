/**
 * 智能询价服务模块
 *
 * 提供智能化的询价辅助功能：
 * - 智能执行价推荐
 * - 期限智能建议
 * - 策略类型推荐
 * - 交易商智能匹配
 * - 市场情绪分析
 * - 价格估算
 */

const { getApiUrl } = require('../config/api.config.js');

/**
 * 获取存储的 token
 */
function getToken() {
  try {
    return wx.getStorageSync('token') || '';
  } catch (e) {
    return '';
  }
}

/**
 * 通用请求方法
 */
function request(method, url, data = {}) {
  return new Promise((resolve, reject) => {
    const fullUrl = getApiUrl(url);
    const token = getToken();

    wx.request({
      url: fullUrl,
      method: method,
      data: data,
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        const result = res.data || {};
        if (result.success) {
          resolve(result.data);
        } else {
          reject(new Error(result.message || '请求失败'));
        }
      },
      fail: (err) => {
        reject(new Error('网络异常，请稍后重试'));
      }
    });
  });
}

/**
 * 智能推荐执行价格
 * @param {number} currentPrice - 当前股价
 * @param {string} optionType - 期权类型 (call/put)
 * @param {string} term - 期限
 * @param {number} volatility - 波动率（可选）
 */
function recommendStrikePrice(currentPrice, optionType = 'call', term = '1M', volatility = null) {
  const data = {
    currentPrice,
    optionType,
    term
  };
  if (volatility !== null) {
    data.volatility = volatility;
  }

  return request('POST', '/recommend/strike-price', data);
}

/**
 * 智能推荐期限
 * @param {string} investmentHorizon - 投资期限偏好 (short/medium/long)
 * @param {string} marketView - 市场观点 (bullish/bearish/neutral)
 * @param {string} riskTolerance - 风险承受能力 (low/medium/high)
 */
function recommendTerm(investmentHorizon = 'medium', marketView = 'neutral', riskTolerance = 'medium') {
  return request('POST', '/recommend/term', {
    investmentHorizon,
    marketView,
    riskTolerance
  });
}

/**
 * 智能推荐策略类型
 * @param {string} marketView - 市场观点 (bullish/bearish/neutral/range_bound)
 * @param {string} volatilityExpectation - 波动率预期 (high/medium/low)
 * @param {string} riskProfile - 风险偏好 (conservative/balanced/aggressive)
 */
function recommendStrategy(marketView = 'neutral', volatilityExpectation = 'medium', riskProfile = 'balanced') {
  return request('POST', '/recommend/strategy', {
    marketView,
    volatilityExpectation,
    riskProfile
  });
}

/**
 * 智能匹配交易商
 * @param {string} productType - 产品类型 (equity/index/commodity/futures)
 * @param {number} notionalAmount - 名义本金（万元）
 * @param {string} urgency - 紧急程度 (urgent/normal/relaxed)
 * @param {Array} preferredDealers - 首选交易商列表
 */
function matchDealers(productType = 'equity', notionalAmount = 100, urgency = 'normal', preferredDealers = []) {
  return request('POST', '/recommend/dealers', {
    productType,
    notionalAmount,
    urgency,
    preferredDealers
  });
}

/**
 * 获取市场情绪分析
 * @param {string} productCode - 产品代码
 */
function getMarketSentiment(productCode) {
  return request('GET', `/market/sentiment?productCode=${productCode}`);
}

/**
 * 估算期权价格范围
 * @param {Object} params - 估算参数
 * @param {string} params.productCode - 产品代码
 * @param {string} params.optionType - 期权类型
 * @param {number} params.strikePrice - 执行价
 * @param {string} params.term - 期限
 * @param {number} params.notionalAmount - 名义本金
 * @param {string} params.structure - 结构类型
 */
function estimatePrice(params) {
  return request('POST', '/estimate/price', params);
}

/**
 * 计算希腊字母
 * @param {Object} params - 计算参数
 * @param {number} params.spotPrice - 现价
 * @param {number} params.strikePrice - 执行价
 * @param {string} params.term - 期限
 * @param {string} params.optionType - 期权类型
 * @param {number} params.volatility - 波动率
 */
function calculateGreeks(params) {
  return request('POST', '/greeks', params);
}

/**
 * 获取完整的智能推荐
 * 一次性获取所有推荐信息
 * @param {Object} inquiryData - 询价数据
 */
async function getFullRecommendations(inquiryData) {
  try {
    const {
      currentPrice,
      optionType,
      term,
      productCode,
      notionalAmount,
      productType
    } = inquiryData;

    // 并行请求所有推荐
    const [
      strikePriceRec,
      termRec,
      strategyRec,
      dealersMatch,
      sentiment,
      priceEstimate
    ] = await Promise.allSettled([
      recommendStrikePrice(currentPrice, optionType, term),
      recommendTerm('medium', 'neutral', 'medium'),
      recommendStrategy('neutral', 'medium', 'balanced'),
      matchDealers(productType || 'equity', notionalAmount),
      getMarketSentiment(productCode),
      estimatePrice({
        productCode,
        optionType,
        strikePrice: 100,
        term,
        notionalAmount,
        structure: 'vanilla'
      })
    ]);

    return {
      strikePrice: strikePriceRec.status === 'fulfilled' ? strikePriceRec.value : null,
      term: termRec.status === 'fulfilled' ? termRec.value : null,
      strategy: strategyRec.status === 'fulfilled' ? strategyRec.value : null,
      dealers: dealersMatch.status === 'fulfilled' ? dealersMatch.value : null,
      sentiment: sentiment.status === 'fulfilled' ? sentiment.value : null,
      priceEstimate: priceEstimate.status === 'fulfilled' ? priceEstimate.value : null
    };
  } catch (error) {
    console.error('获取推荐失败:', error);
    return null;
  }
}

/**
 * 格式化希腊字母显示
 * @param {Object} greeks - 希腊字母对象
 */
function formatGreeks(greeks) {
  if (!greeks) return {};

  return {
    delta: {
      value: greeks.delta,
      label: 'Delta',
      description: '标的资产价格变动1元，期权价格变动',
      format: greeks.delta.toFixed(4)
    },
    gamma: {
      value: greeks.gamma,
      label: 'Gamma',
      description: '标的资产价格变动1元，Delta变动',
      format: greeks.gamma.toFixed(4)
    },
    theta: {
      value: greeks.theta,
      label: 'Theta',
      description: '每过一天，期权价格变动',
      format: greeks.theta.toFixed(2)
    },
    vega: {
      value: greeks.vega,
      label: 'Vega',
      description: '波动率变动1%，期权价格变动',
      format: greeks.vega.toFixed(2)
    },
    rho: {
      value: greeks.rho,
      label: 'Rho',
      description: '利率变动1%，期权价格变动',
      format: greeks.rho.toFixed(2)
    }
  };
}

/**
 * 获取策略类型说明
 */
function getStrategyTypes() {
  return [
    {
      value: 'vanilla',
      label: '香草期权',
      description: '传统看涨看跌期权，结构简单，流动性好',
      riskLevel: '低',
      suitableFor: ['看涨', '看跌', '对冲']
    },
    {
      value: 'snowball',
      label: '雪球期权',
      description: '收益增强型结构化产品，震荡市表现优异',
      riskLevel: '中',
      suitableFor: ['震荡市', '收益增强']
    },
    {
      value: 'barrier',
      label: '障碍期权',
      description: '成本优化的对冲工具，设置障碍条件降低成本',
      riskLevel: '中',
      suitableFor: ['成本优化', '对冲']
    },
    {
      value: 'phoenix',
      label: '凤凰期权',
      description: '多观察期的收益增强产品，多次获利机会',
      riskLevel: '中',
      suitableFor: ['收益增强', '多次观察']
    }
  ];
}

/**
 * 获取期限选项
 */
function getTermOptions() {
  return [
    { value: '1M', label: '1个月', days: 30 },
    { value: '2M', label: '2个月', days: 60 },
    { value: '3M', label: '3个月', days: 90 },
    { value: '6M', label: '6个月', days: 180 },
    { value: '9M', label: '9个月', days: 270 },
    { value: '1Y', label: '1年', days: 365 }
  ];
}

/**
 * 获取紧急程度选项
 */
function getUrgencyOptions() {
  return [
    { value: 'urgent', label: '紧急', description: '2小时内响应', icon: '🔥' },
    { value: 'normal', label: '正常', description: '1天内响应', icon: '⏰' },
    { value: 'relaxed', label: '宽松', description: '3天内响应', icon: '📅' }
  ];
}

/**
 * 表单验证规则
 */
const validationRules = {
  // 产品验证
  product: {
    required: true,
    message: '请选择标的'
  },
  // 期权类型验证
  optionType: {
    required: true,
    validator: (value) => ['call', 'put'].includes(value),
    message: '请选择期权类型'
  },
  // 结构验证
  structure: {
    required: true,
    validator: (value) => ['vanilla', 'snowball', 'barrier', 'phoenix'].includes(value),
    message: '请选择结构类型'
  },
  // 名义本金验证
  notionalAmount: {
    required: true,
    validator: (value) => {
      const num = parseFloat(value);
      return !isNaN(num) && num > 0 && num <= 100000;
    },
    message: '名义本金需为正数且不超过10亿元'
  },
  // 执行价验证
  strikePrice: {
    required: false,
    validator: (value) => {
      if (!value) return true;
      const num = parseFloat(value);
      return !isNaN(num) && num >= 50 && num <= 200;
    },
    message: '执行价需在50%-200%之间'
  },
  // 联系人验证
  contactName: {
    required: true,
    validator: (value) => value && value.trim().length >= 2,
    message: '请输入有效的联系人姓名'
  },
  // 手机号验证
  contactPhone: {
    required: true,
    validator: (value) => /^1[3-9]\d{9}$/.test(value),
    message: '请输入有效的手机号'
  }
};

/**
 * 验证表单数据
 * @param {Object} formData - 表单数据
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateForm(formData) {
  const errors = [];

  // 验证各字段
  for (const [field, rule] of Object.entries(validationRules)) {
    const value = formData[field];

    if (rule.required && !value) {
      errors.push(rule.message);
      continue;
    }

    if (value && rule.validator && !rule.validator(value)) {
      errors.push(rule.message);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  // 推荐功能
  recommendStrikePrice,
  recommendTerm,
  recommendStrategy,
  matchDealers,
  getMarketSentiment,
  estimatePrice,
  calculateGreeks,
  getFullRecommendations,

  // 格式化
  formatGreeks,

  // 配置数据
  getStrategyTypes,
  getTermOptions,
  getUrgencyOptions,

  // 验证
  validationRules,
  validateForm
};