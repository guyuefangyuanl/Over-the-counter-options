/**
 * 询价页面常量定义
 * 包含交易商、结构选项、期限选项等配置
 */

// 存储键
const FAVORITES_STORAGE_KEY = 'INQUIRY_FAVORITES_V1';
const CUSTOM_GROUPS_STORAGE_KEY = 'INQUIRY_CUSTOM_GROUPS_V1';

// 结构选项
const STRUCTURE_OPTIONS = [
  { text: '香草 (Vanilla)', value: 'vanilla' },
  { text: '雪球 (Snowball)', value: 'snowball' },
  { text: '凤凰 (Phoenix)', value: 'phoenix' },
];

// 期限选项
const TERM_OPTIONS = [
  { text: '1个月 (1M)', value: '1M' },
  { text: '3个月 (3M)', value: '3M' },
  { text: '6个月 (6M)', value: '6M' },
  { text: '1年 (1Y)', value: '1Y' },
  { text: '自定义', value: 'custom' },
];

// 交易商列表
const ALL_DEALERS = [
  { id: 'CICC', name: '中金' },
  { id: 'CITIC', name: '中信' },
  { id: 'GJS', name: '国君' },
];

// 默认选中的交易商
const DEFAULT_DEALERS = ['CICC', 'CITIC'];

// 系统分组
const SYSTEM_GROUPS = [
  { id: 'all', name: '全部' },
  { id: 'holding', name: '我的持仓' },
];

// 市场指数默认数据
const DEFAULT_MARKET_INDEXES = [
  { name: '上证指数', value: '-', changePercent: 0 },
  { name: '深证成指', value: '-', changePercent: 0 },
  { name: '创业板指', value: '-', changePercent: 0 },
  { name: '沪深300', value: '-', changePercent: 0 },
  { name: '中证500', value: '-', changePercent: 0 },
];

// 默认询价表单
const DEFAULT_INQUIRY_FORM = {
  selectedProduct: null,
  optionType: 'call',
  structure: 'vanilla',
  term: '1M',
  notionalAmount: '',
  strikePrice: '100',
  selectedDealers: ['CICC'],
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  notes: ''
};

// 默认批量询价表单
const DEFAULT_BATCH_FORM = {
  optionType: 'call',
  structure: 'vanilla',
  term: '1M',
  notionalAmount: '',
  strikePrice: '100',
  selectedDealers: ['CICC'],
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  notes: ''
};

// 默认快速询价表单
const DEFAULT_QUICK_FORM = {
  productName: '',
  productCode: '',
  optionType: 'call',
  structure: 'vanilla',
  term: '1M',
  notionalAmount: '',
  strikePrice: '100',
  selectedDealers: ['CICC'],
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  notes: ''
};

// 批量询价配置
const BATCH_CONFIG = {
  BATCH_SIZE: 3,        // 每批并发数
  BATCH_DELAY: 100,     // 批次间隔(ms)
  MAX_BATCH_SIZE: 50    // 最大批量数
};

// 验证规则
const VALIDATION_RULES = {
  phone: /^1[3-9]\d{9}$/,
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  notionalMin: 100,     // 最小名义本金(万元)
  notionalMax: 100000,  // 最大名义本金(万元)
  strikeMin: 50,        // 最小行权价(%)
  strikeMax: 150,       // 最大行权价(%)
  groupNameMin: 1,      // 分组名最小长度
  groupNameMax: 20      // 分组名最大长度
};

module.exports = {
  // 存储键
  FAVORITES_STORAGE_KEY,
  CUSTOM_GROUPS_STORAGE_KEY,
  
  // 选项配置
  STRUCTURE_OPTIONS,
  TERM_OPTIONS,
  ALL_DEALERS,
  DEFAULT_DEALERS,
  SYSTEM_GROUPS,
  DEFAULT_MARKET_INDEXES,
  
  // 表单默认值
  DEFAULT_INQUIRY_FORM,
  DEFAULT_BATCH_FORM,
  DEFAULT_QUICK_FORM,
  
  // 配置
  BATCH_CONFIG,
  VALIDATION_RULES
};