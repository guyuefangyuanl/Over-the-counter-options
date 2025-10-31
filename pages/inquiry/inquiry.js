// 询价页面 - 优化版
const OptionPricingSystem = require('../../utils/option-pricing.js');

Page({
  data: {
    inquiryList: [],
    filterStatus: 'all', // all, pending, confirmed, expired, cancelled
    loading: false,
    showCreateForm: false,
    showSearchModal: false,
    searchKeyword: '',
    searchResults: [],
    
    // 新询价表单数据
    newInquiry: {
      optionType: 'call',
      underlying: '',
      underlyingName: '',
      strikePrice: '',
      expiryDate: '',
      quantity: '',
      strategyType: 'vanilla', // vanilla, snowball, barrier
      urgency: 'normal', // urgent, normal, relax
      notes: '',
      targetPrice: '', // 目标价格
      maxPrice: '', // 最高价格
      validUntil: '' // 询价有效期
    },
    
    // 筛选统计
    statusCounts: {
      all: 0,
      pending: 0,
      confirmed: 0,
      expired: 0,
      cancelled: 0
    },
    
    // 智能推荐的期权参数
    recommendedParams: {
      strikes: [],
      expiries: [],
      strategies: []
    },
    
    // 实时报价更新
    realTimeQuotes: {},
    updateTimer: null,
    
    // 常用股票列表
    popularStocks: [
      { code: '000001', name: '平安银行', market: 'SZ' },
      { code: '000002', name: '万科A', market: 'SZ' },
      { code: '600036', name: '招商银行', market: 'SH' },
      { code: '600519', name: '贵州茅台', market: 'SH' },
      { code: '000858', name: '五粮液', market: 'SZ' }
    ]
  },

  onLoad: function (options) {
    console.log('询价页面加载');
    
    // 初始化期权定价系统
    this.pricingSystem = new OptionPricingSystem();
    
    // 加载数据
    this.loadInquiryList();
    this.loadRecommendedParams();
    
    // 启动实时报价更新
    this.startRealTimeUpdates();
    
    // 处理从报价页面跳转过来的预填数据
    if (options && options.prefill) {
      try {
        const prefillData = JSON.parse(decodeURIComponent(options.prefill));
        this.prefillInquiryForm(prefillData);
      } catch (e) {
        console.error('解析预填数据失败:', e);
      }
    }
  },

  onShow: function () {
    // 页面显示时刷新数据
    this.refreshData();
    this.updateStatusCounts();
  },

  onHide: function () {
    // 页面隐藏时停止实时更新
    this.stopRealTimeUpdates();
  },

  onUnload: function () {
    // 页面卸载时清理定时器
    this.stopRealTimeUpdates();
  },

  // 加载询价列表
  loadInquiryList: function() {
    this.setData({ loading: true });

    // 模拟增强的询价数据
    setTimeout(() => {
      const inquiryList = [
        {
          id: 1,
          inquiryId: 'INQ202501150001',
          optionType: '看涨期权',
          underlying: '平安银行(000001)',
          underlyingCode: '000001',
          strikePrice: '13.00',
          expiryDate: '2025-03-15',
          quantity: '1000',
          strategyType: 'vanilla',
          urgency: 'normal',
          status: 'pending',
          statusText: '待报价',
          createTime: '2025-01-15 09:30:00',
          notes: '期望在今日收盘前获得报价',
          targetPrice: '0.45',
          maxPrice: '0.50',
          validUntil: '2025-01-16 15:00:00',
          quotes: [],
          quoteCount: 0,
          estimatedPremium: '0.42-0.48',
          marketSentiment: 'bullish'
        },
        {
          id: 2,
          inquiryId: 'INQ202501140002',
          optionType: '看跌期权',
          underlying: '万科A(000002)',
          underlyingCode: '000002',
          strikePrice: '9.50',
          expiryDate: '2025-02-28',
          quantity: '2000',
          strategyType: 'vanilla',
          urgency: 'urgent',
          status: 'confirmed',
          statusText: '已确认',
          createTime: '2025-01-14 14:20:00',
          confirmedTime: '2025-01-14 16:45:00',
          notes: '保险策略对冲',
          targetPrice: '0.30',
          maxPrice: '0.35',
          validUntil: '2025-01-15 15:00:00',
          quotes: [
            { 
              id: 1,
              trader: '中信证券', 
              price: '0.35', 
              time: '2025-01-14 15:30:00',
              validity: '30分钟',
              confidence: 'high',
              premium: '0.35',
              delta: '0.45',
              gamma: '0.025',
              theta: '-0.008',
              vega: '0.12'
            },
            { 
              id: 2,
              trader: '招商证券', 
              price: '0.32', 
              time: '2025-01-14 16:15:00',
              validity: '30分钟',
              confidence: 'high',
              premium: '0.32',
              delta: '0.42',
              gamma: '0.028',
              theta: '-0.009',
              vega: '0.11'
            },
            { 
              id: 3,
              trader: '华泰证券', 
              price: '0.38', 
              time: '2025-01-14 16:30:00',
              validity: '30分钟',
              confidence: 'medium',
              premium: '0.38',
              delta: '0.48',
              gamma: '0.023',
              theta: '-0.007',
              vega: '0.13'
            }
          ],
          quoteCount: 3,
          selectedQuote: { trader: '招商证券', price: '0.32', premium: '0.32' },
          estimatedPremium: '0.32-0.38',
          marketSentiment: 'bearish'
        },
        {
          id: 3,
          inquiryId: 'INQ202501130003',
          optionType: '看涨期权',
          underlying: '五粮液(000858)',
          underlyingCode: '000858',
          strikePrice: '130.00',
          expiryDate: '2025-01-31',
          quantity: '500',
          strategyType: 'snowball',
          urgency: 'relax',
          status: 'expired',
          statusText: '已过期',
          createTime: '2025-01-13 11:00:00',
          expiredTime: '2025-01-15 15:00:00',
          notes: '短期交易机会',
          targetPrice: '2.80',
          maxPrice: '3.00',
          validUntil: '2025-01-15 15:00:00',
          quotes: [
            { 
              id: 1,
              trader: '中信证券', 
              price: '2.85', 
              time: '2025-01-13 14:30:00',
              validity: '已过期',
              confidence: 'low',
              premium: '2.85'
            }
          ],
          quoteCount: 1,
          estimatedPremium: '2.80-3.20',
          marketSentiment: 'neutral'
        },
        {
          id: 4,
          inquiryId: 'INQ202501120004',
          optionType: '看跌期权',
          underlying: '招商银行(600036)',
          underlyingCode: '600036',
          strikePrice: '35.00',
          expiryDate: '2025-04-18',
          quantity: '800',
          strategyType: 'barrier',
          urgency: 'normal',
          status: 'cancelled',
          statusText: '已取消',
          createTime: '2025-01-12 10:45:00',
          cancelledTime: '2025-01-12 14:30:00',
          notes: '市场情况变化，取消询价',
          targetPrice: '1.20',
          maxPrice: '1.35',
          validUntil: '2025-01-13 15:00:00',
          quotes: [],
          quoteCount: 0,
          estimatedPremium: '1.15-1.40',
          marketSentiment: 'neutral'
        }
      ];

      this.setData({
        inquiryList: inquiryList,
        loading: false
      });
      
      this.updateStatusCounts();
      this.startRealTimeQuoteUpdates();
    }, 1000);
  },

  // 刷新数据
  refreshData: function() {
    this.loadInquiryList();
    this.updateRealTimeQuotes();
  },

  // 更新状态统计
  updateStatusCounts: function() {
    const inquiryList = this.data.inquiryList;
    const counts = {
      all: inquiryList.length,
      pending: inquiryList.filter(item => item.status === 'pending').length,
      confirmed: inquiryList.filter(item => item.status === 'confirmed').length,
      expired: inquiryList.filter(item => item.status === 'expired').length,
      cancelled: inquiryList.filter(item => item.status === 'cancelled').length
    };
    
    this.setData({ statusCounts: counts });
  },

  // 加载智能推荐参数
  loadRecommendedParams: function() {
    const currentStock = this.pricingSystem?.currentStock;
    if (!currentStock) return;
    
    const basePrice = currentStock.currentPrice || 11.36;
    const recommendedParams = {
      strikes: [
        (basePrice * 0.95).toFixed(2),
        basePrice.toFixed(2),
        (basePrice * 1.05).toFixed(2),
        (basePrice * 1.10).toFixed(2)
      ],
      expiries: [
        this.getDateAfterDays(30),
        this.getDateAfterDays(60),
        this.getDateAfterDays(90),
        this.getDateAfterDays(180)
      ],
      strategies: [
        { type: 'vanilla', name: '香草期权', desc: '简单易懂，适合新手' },
        { type: 'snowball', name: '雪球期权', desc: '收益增强，风险可控' },
        { type: 'barrier', name: '障碍期权', desc: '成本较低，适合对冲' }
      ]
    };
    
    this.setData({ recommendedParams });
  },

  // 获取指定天数后的日期
  getDateAfterDays: function(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  },

  // 启动实时更新
  startRealTimeUpdates: function() {
    if (this.data.updateTimer) {
      clearInterval(this.data.updateTimer);
    }
    
    const timer = setInterval(() => {
      this.updateRealTimeQuotes();
    }, 30000); // 有30秒更新一次
    
    this.setData({ updateTimer: timer });
  },

  // 停止实时更新
  stopRealTimeUpdates: function() {
    if (this.data.updateTimer) {
      clearInterval(this.data.updateTimer);
      this.setData({ updateTimer: null });
    }
  },

  // 更新实时报价
  updateRealTimeQuotes: function() {
    const inquiryList = this.data.inquiryList.map(inquiry => {
      if (inquiry.status === 'pending' && Math.random() > 0.7) {
        // 30%的概率模拟新报价
        const newQuote = this.generateRandomQuote(inquiry);
        inquiry.quotes.push(newQuote);
        inquiry.quoteCount = inquiry.quotes.length;
      }
      return inquiry;
    });
    
    this.setData({ inquiryList });
  },

  // 生成随机报价
  generateRandomQuote: function(inquiry) {
    const traders = ['中信证券', '华泰证券', '招商证券', '国金证券', '海通证券'];
    const basePrice = parseFloat(inquiry.targetPrice || '1.00');
    const randomPrice = (basePrice + (Math.random() - 0.5) * 0.2).toFixed(2);
    
    return {
      id: Date.now(),
      trader: traders[Math.floor(Math.random() * traders.length)],
      price: randomPrice,
      time: new Date().toLocaleString(),
      validity: '30分钟',
      confidence: ['high', 'medium', 'low'][Math.floor(Math.random() * 3)],
      premium: randomPrice
    };
  },

  // 启动实时报价更新
  startRealTimeQuoteUpdates: function() {
    // 模拟实时报价推送
    setTimeout(() => {
      if (Math.random() > 0.5) {
        this.simulateNewQuote();
      }
    }, 5000 + Math.random() * 10000);
  },

  // 模拟新报价推送
  simulateNewQuote: function() {
    const pendingInquiries = this.data.inquiryList.filter(item => item.status === 'pending');
    if (pendingInquiries.length === 0) return;
    
    const randomInquiry = pendingInquiries[Math.floor(Math.random() * pendingInquiries.length)];
    const newQuote = this.generateRandomQuote(randomInquiry);
    
    // 显示新报价通知
    wx.showToast({
      title: `收到新报价: ${newQuote.price}`,
      icon: 'none',
      duration: 2000
    });
    
    // 更新数据
    this.updateRealTimeQuotes();
  },

  // 筛选状态变化
  onFilterChange: function(e) {
    this.setData({
      filterStatus: e.detail.value
    });
  },

  // 获取筛选后的列表
  getFilteredList: function() {
    const { inquiryList, filterStatus } = this.data;
    if (filterStatus === 'all') {
      return inquiryList;
    }
    return inquiryList.filter(item => item.status === filterStatus);
  },

  // 显示创建询价表单
  showCreateInquiry: function() {
    this.setData({ 
      showCreateForm: true,
      newInquiry: {
        optionType: 'call',
        underlying: '',
        underlyingName: '',
        strikePrice: '',
        expiryDate: '',
        quantity: '',
        strategyType: 'vanilla',
        urgency: 'normal',
        notes: '',
        targetPrice: '',
        maxPrice: '',
        validUntil: this.getDateAfterDays(1) // 默认明天过期
      }
    });
  },

  // 隐藏创建询价表单
  hideCreateInquiry: function() {
    this.setData({ 
      showCreateForm: false,
      showSearchModal: false,
      searchKeyword: '',
      searchResults: []
    });
  },

  // 预填询价表单（从报价页面跳转）
  prefillInquiryForm: function(data) {
    const prefillData = {
      optionType: data.optionType || 'call',
      underlying: data.underlying || '',
      underlyingName: data.underlyingName || '',
      strikePrice: data.strikePrice || '',
      expiryDate: data.expiryDate || '',
      quantity: data.quantity || '1000',
      strategyType: data.strategyType || 'vanilla',
      urgency: 'normal',
      notes: data.notes || '',
      targetPrice: data.targetPrice || '',
      maxPrice: data.maxPrice || '',
      validUntil: this.getDateAfterDays(1)
    };
    
    this.setData({ 
      newInquiry: prefillData,
      showCreateForm: true 
    });
  },

  // 显示股票搜索模态框
  showStockSearch: function() {
    this.setData({ 
      showSearchModal: true,
      searchResults: this.data.popularStocks // 默认显示热门股票
    });
  },

  // 股票搜索输入
  onStockSearchInput: function(e) {
    const keyword = e.detail.value;
    this.setData({ searchKeyword: keyword });
    
    if (!keyword.trim()) {
      this.setData({ searchResults: this.data.popularStocks });
      return;
    }
    
    // 模拟搜索结果
    const mockResults = [
      { code: '000001', name: '平安银行', market: 'SZ', price: '11.36', change: '+0.61%' },
      { code: '000002', name: '万科A', market: 'SZ', price: '8.92', change: '-0.15%' },
      { code: '600036', name: '招商银行', market: 'SH', price: '35.67', change: '+1.23%' },
      { code: '600519', name: '贵州茅台', market: 'SH', price: '1678.90', change: '-12.34%' },
      { code: '000858', name: '五粮液', market: 'SZ', price: '128.45', change: '+2.67%' }
    ];
    
    const filteredResults = mockResults.filter(stock => 
      stock.code.includes(keyword) || stock.name.includes(keyword)
    );
    
    this.setData({ searchResults: filteredResults });
  },

  // 选择股票
  selectStock: function(e) {
    const stock = e.currentTarget.dataset.stock;
    const underlying = `${stock.name}(${stock.code})`;
    
    this.setData({
      'newInquiry.underlying': underlying,
      'newInquiry.underlyingName': stock.name,
      showSearchModal: false,
      searchKeyword: '',
      searchResults: []
    });
    
    // 智能推荐执行价
    if (stock.price) {
      const currentPrice = parseFloat(stock.price);
      const recommendedStrike = currentPrice.toFixed(2);
      this.setData({
        'newInquiry.strikePrice': recommendedStrike,
        'newInquiry.targetPrice': (currentPrice * 0.02).toFixed(2), // 推荐目标价格为2%
        'newInquiry.maxPrice': (currentPrice * 0.025).toFixed(2) // 最高价格为2.5%
      });
    }
  },

  // 表单输入处理
  onFormInput: function(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    
    this.setData({
      [`newInquiry.${field}`]: value
    });
    
    // 智能联想功能
    this.performSmartSuggestions(field, value);
  },

  // 智能联想功能
  performSmartSuggestions: function(field, value) {
    const newInquiry = this.data.newInquiry;
    
    switch (field) {
      case 'strikePrice':
        if (value && newInquiry.underlying) {
          // 根据执行价智能推荐目标价格
          const strike = parseFloat(value);
          if (!isNaN(strike)) {
            const targetPrice = (strike * 0.02).toFixed(2);
            const maxPrice = (strike * 0.03).toFixed(2);
            this.setData({
              'newInquiry.targetPrice': targetPrice,
              'newInquiry.maxPrice': maxPrice
            });
          }
        }
        break;
        
      case 'quantity':
        if (value) {
          const qty = parseInt(value);
          if (qty >= 10000) {
            // 大量询价提示
            wx.showToast({
              title: '大量询价建议联系专属客服',
              icon: 'none',
              duration: 2000
            });
          }
        }
        break;
        
      case 'expiryDate':
        if (value) {
          const today = new Date();
          const expiry = new Date(value);
          const daysDiff = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
          
          if (daysDiff <= 7) {
            wx.showToast({
              title: '短期期权波动较大',
              icon: 'none',
              duration: 2000
            });
          }
        }
        break;
    }
  },

  // 期权类型选择
  onOptionTypeChange: function(e) {
    this.setData({
      'newInquiry.optionType': e.detail.value
    });
  },

  // 策略类型选择
  onStrategyTypeChange: function(e) {
    this.setData({
      'newInquiry.strategyType': e.detail.value
    });
  },

  // 紧急程度选择
  onUrgencyChange: function(e) {
    this.setData({
      'newInquiry.urgency': e.detail.value
    });
    
    // 根据紧急程度调整有效期
    const urgency = e.detail.value;
    let validHours = 24; // 默认1天
    
    switch (urgency) {
      case 'urgent':
        validHours = 2; // 紧急询价2小时
        break;
      case 'normal':
        validHours = 24; // 正常1天
        break;
      case 'relax':
        validHours = 72; // 宽松3天
        break;
    }
    
    const validUntil = new Date();
    validUntil.setHours(validUntil.getHours() + validHours);
    
    this.setData({
      'newInquiry.validUntil': validUntil.toISOString().slice(0, 16)
    });
  },

  // 日期选择
  onDateChange: function(e) {
    this.setData({
      'newInquiry.expiryDate': e.detail.value
    });
  },

  // 有效期选择
  onValidUntilChange: function(e) {
    this.setData({
      'newInquiry.validUntil': e.detail.value
    });
  },

  // 提交新询价
  submitInquiry: function() {
    const inquiry = this.data.newInquiry;
    
    // 增强的表单验证
    if (!this.validateEnhancedForm(inquiry)) {
      return;
    }

    wx.showLoading({
      title: '提交中...'
    });

    // 模拟提交
    setTimeout(() => {
      wx.hideLoading();
      
      const newItem = {
        id: Date.now(),
        inquiryId: 'INQ' + new Date().toISOString().slice(0,10).replace(/-/g,'') + String(Date.now()).slice(-4),
        optionType: inquiry.optionType === 'call' ? '看涨期权' : '看跌期权',
        underlying: inquiry.underlying,
        underlyingCode: this.extractStockCode(inquiry.underlying),
        underlyingName: inquiry.underlyingName,
        strikePrice: inquiry.strikePrice,
        expiryDate: inquiry.expiryDate,
        quantity: inquiry.quantity,
        strategyType: inquiry.strategyType,
        urgency: inquiry.urgency,
        status: 'pending',
        statusText: '待报价',
        createTime: new Date().toLocaleString(),
        notes: inquiry.notes,
        targetPrice: inquiry.targetPrice,
        maxPrice: inquiry.maxPrice,
        validUntil: inquiry.validUntil,
        quotes: [],
        quoteCount: 0,
        estimatedPremium: `${(parseFloat(inquiry.targetPrice || '0') * 0.9).toFixed(2)}-${(parseFloat(inquiry.maxPrice || '0') * 1.1).toFixed(2)}`,
        marketSentiment: this.getMarketSentiment()
      };

      const inquiryList = this.data.inquiryList;
      inquiryList.unshift(newItem);
      
      this.setData({ inquiryList });
      this.updateStatusCounts();
      this.hideCreateInquiry();
      
      // 显示成功消息和后续操作
      wx.showModal({
        title: '询价提交成功',
        content: `询价编号: ${newItem.inquiryId}\n预计${this.getEstimatedQuoteTime(inquiry.urgency)}内收到报价`,
        confirmText: '查看详情',
        cancelText: '确定',
        success: (res) => {
          if (res.confirm) {
            this.onInquiryTap({ currentTarget: { dataset: { inquiry: newItem } } });
          }
        }
      });
      
      // 启动智能匹配
      this.startSmartMatching(newItem);
    }, 1500);
  },

  // 提取股票代码
  extractStockCode: function(underlying) {
    const match = underlying.match(/\((\d{6})\)/);
    return match ? match[1] : '';
  },

  // 获取市场情绪
  getMarketSentiment: function() {
    const sentiments = ['bullish', 'bearish', 'neutral'];
    return sentiments[Math.floor(Math.random() * sentiments.length)];
  },

  // 获取预计报价时间
  getEstimatedQuoteTime: function(urgency) {
    switch (urgency) {
      case 'urgent': return '30分钟';
      case 'normal': return '2小时';
      case 'relax': return '1天';
      default: return '2小时';
    }
  },

  // 启动智能匹配
  startSmartMatching: function(inquiry) {
    // 模拟智能匹配系统，为询价找到最适合的交易商
    setTimeout(() => {
      const matchedTraders = this.findMatchedTraders(inquiry);
      if (matchedTraders.length > 0) {
        wx.showToast({
          title: `找到${matchedTraders.length}家匹配交易商`,
          icon: 'none',
          duration: 2000
        });
      }
    }, 3000);
  },

  // 找到匹配的交易商
  findMatchedTraders: function(inquiry) {
    // 模拟匹配算法
    const allTraders = ['中信证券', '华泰证券', '招商证券', '国金证券', '海通证券'];
    const matchCount = Math.floor(Math.random() * 3) + 1;
    return allTraders.slice(0, matchCount);
  },

  // 增强的表单验证
  validateEnhancedForm: function(inquiry) {
    const required = ['underlying', 'strikePrice', 'expiryDate', 'quantity'];
    
    // 基本必填项验证
    for (let field of required) {
      if (!inquiry[field] || inquiry[field].trim() === '') {
        wx.showToast({
          title: '请填写所有必填项',
          icon: 'none'
        });
        return false;
      }
    }

    // 执行价验证
    const strikePrice = parseFloat(inquiry.strikePrice);
    if (isNaN(strikePrice) || strikePrice <= 0) {
      wx.showToast({
        title: '请输入有效的执行价',
        icon: 'none'
      });
      return false;
    }

    // 数量验证
    const quantity = parseInt(inquiry.quantity);
    if (isNaN(quantity) || quantity <= 0) {
      wx.showToast({
        title: '请输入有效的数量',
        icon: 'none'
      });
      return false;
    }

    // 到期日验证
    const expiryDate = new Date(inquiry.expiryDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (expiryDate <= today) {
      wx.showToast({
        title: '到期日必须晚于今天',
        icon: 'none'
      });
      return false;
    }

    // 目标价格验证
    if (inquiry.targetPrice) {
      const targetPrice = parseFloat(inquiry.targetPrice);
      if (isNaN(targetPrice) || targetPrice <= 0) {
        wx.showToast({
          title: '请输入有效的目标价格',
          icon: 'none'
        });
        return false;
      }
    }

    // 最高价格验证
    if (inquiry.maxPrice && inquiry.targetPrice) {
      const maxPrice = parseFloat(inquiry.maxPrice);
      const targetPrice = parseFloat(inquiry.targetPrice);
      
      if (maxPrice <= targetPrice) {
        wx.showToast({
          title: '最高价格必须大于目标价格',
          icon: 'none'
        });
        return false;
      }
    }

    // 有效期验证
    if (inquiry.validUntil) {
      const validUntil = new Date(inquiry.validUntil);
      const now = new Date();
      
      if (validUntil <= now) {
        wx.showToast({
          title: '有效期必须在当前时间之后',
          icon: 'none'
        });
        return false;
      }
    }

    return true;
  },

  // 旧的表单验证（保持兼容）
  validateForm: function(inquiry) {
    return this.validateEnhancedForm(inquiry);
  },

  // 查看询价详情
  onInquiryTap: function(e) {
    const inquiry = e.currentTarget.dataset.inquiry;
    
    wx.navigateTo({
      url: `/pages/inquiry-detail/inquiry-detail?id=${inquiry.id}&data=${encodeURIComponent(JSON.stringify(inquiry))}`
    });
  },

  // 快速操作菜单
  showQuickActions: function(e) {
    const inquiry = e.currentTarget.dataset.inquiry;
    const actions = [];
    
    if (inquiry.status === 'pending') {
      actions.push('修改询价', '取消询价', '提高优先级');
    } else if (inquiry.status === 'confirmed') {
      actions.push('查看合约', '复制询价');
    } else {
      actions.push('复制询价', '删除询价');
    }
    
    actions.push('分享询价');
    
    wx.showActionSheet({
      itemList: actions,
      success: (res) => {
        this.handleQuickAction(inquiry, actions[res.tapIndex]);
      }
    });
  },

  // 处理快速操作
  handleQuickAction: function(inquiry, action) {
    switch (action) {
      case '修改询价':
        this.editInquiry(inquiry);
        break;
      case '取消询价':
        this.cancelInquiry(null, inquiry);
        break;
      case '提高优先级':
        this.boostPriority(inquiry);
        break;
      case '查看合约':
        this.viewContract(inquiry);
        break;
      case '复制询价':
        this.duplicateInquiry(inquiry);
        break;
      case '删除询价':
        this.deleteInquiry(inquiry);
        break;
      case '分享询价':
        this.shareInquiry(inquiry);
        break;
    }
  },

  // 编辑询价
  editInquiry: function(inquiry) {
    const editData = {
      optionType: inquiry.optionType === '看涨期权' ? 'call' : 'put',
      underlying: inquiry.underlying,
      underlyingName: inquiry.underlyingName || '',
      strikePrice: inquiry.strikePrice,
      expiryDate: inquiry.expiryDate,
      quantity: inquiry.quantity,
      strategyType: inquiry.strategyType || 'vanilla',
      urgency: inquiry.urgency || 'normal',
      notes: inquiry.notes || '',
      targetPrice: inquiry.targetPrice || '',
      maxPrice: inquiry.maxPrice || '',
      validUntil: inquiry.validUntil || this.getDateAfterDays(1)
    };
    
    this.setData({
      newInquiry: editData,
      showCreateForm: true,
      editingInquiry: inquiry
    });
  },

  // 提高优先级
  boostPriority: function(inquiry) {
    wx.showModal({
      title: '提高优先级',
      content: '是否将此询价设为紧急处理？这将加快获得报价速度。',
      success: (res) => {
        if (res.confirm) {
          const inquiryList = this.data.inquiryList.map(item => {
            if (item.id === inquiry.id) {
              item.urgency = 'urgent';
            }
            return item;
          });
          
          this.setData({ inquiryList });
          
          wx.showToast({
            title: '已提高优先级',
            icon: 'success'
          });
        }
      }
    });
  },

  // 查看合约
  viewContract: function(inquiry) {
    wx.navigateTo({
      url: `/pages/contract/contract?inquiryId=${inquiry.id}`
    });
  },

  // 复制询价
  duplicateInquiry: function(inquiry) {
    const duplicateData = {
      optionType: inquiry.optionType === '看涨期权' ? 'call' : 'put',
      underlying: inquiry.underlying,
      underlyingName: inquiry.underlyingName || '',
      strikePrice: inquiry.strikePrice,
      expiryDate: inquiry.expiryDate,
      quantity: inquiry.quantity,
      strategyType: inquiry.strategyType || 'vanilla',
      urgency: 'normal',
      notes: `复制自 ${inquiry.inquiryId}`,
      targetPrice: inquiry.targetPrice || '',
      maxPrice: inquiry.maxPrice || '',
      validUntil: this.getDateAfterDays(1)
    };
    
    this.setData({
      newInquiry: duplicateData,
      showCreateForm: true
    });
  },

  // 删除询价
  deleteInquiry: function(inquiry) {
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除这个询价吗？',
      confirmColor: '#ff0000',
      success: (res) => {
        if (res.confirm) {
          const inquiryList = this.data.inquiryList.filter(item => item.id !== inquiry.id);
          this.setData({ inquiryList });
          this.updateStatusCounts();
          
          wx.showToast({
            title: '已删除',
            icon: 'success'
          });
        }
      }
    });
  },

  // 分享询价
  shareInquiry: function(inquiry) {
    const shareContent = `询价编号: ${inquiry.inquiryId}
期权类型: ${inquiry.optionType}
标的资产: ${inquiry.underlying}
执行价: ${inquiry.strikePrice}
到期日: ${inquiry.expiryDate}`;
    
    wx.setClipboardData({
      data: shareContent,
      success: () => {
        wx.showToast({
          title: '询价信息已复制',
          icon: 'success'
        });
      }
    });
  },

  // 取消询价
  cancelInquiry: function(e, inquiry = null) {
    const targetInquiry = inquiry || e.currentTarget.dataset.inquiry;
    
    if (targetInquiry.status !== 'pending') {
      wx.showToast({
        title: '只能取消待报价的询价',
        icon: 'none'
      });
      return;
    }

    wx.showModal({
      title: '确认取消',
      content: '确定要取消这个询价吗？取消后将无法收到新的报价。',
      confirmColor: '#ff9500',
      success: (res) => {
        if (res.confirm) {
          const inquiryList = this.data.inquiryList.map(item => {
            if (item.id === targetInquiry.id) {
              item.status = 'cancelled';
              item.statusText = '已取消';
              item.cancelledTime = new Date().toLocaleString();
            }
            return item;
          });
          
          this.setData({ inquiryList });
          this.updateStatusCounts();
          
          wx.showToast({
            title: '询价已取消',
            icon: 'success'
          });
        }
      }
    });
  },

  // 选择推荐的执行价
  selectRecommendedStrike: function(e) {
    const strike = e.currentTarget.dataset.strike;
    this.setData({
      'newInquiry.strikePrice': strike
    });
    
    // 触发智能联想功能
    this.performSmartSuggestions('strikePrice', strike);
  },

  // 选择推荐的到期日
  selectRecommendedExpiry: function(e) {
    const expiry = e.currentTarget.dataset.expiry;
    this.setData({
      'newInquiry.expiryDate': expiry
    });
  },

  // 选择推荐的策略
  useRecommendedStrategy: function(e) {
    const strategy = e.currentTarget.dataset.strategy;
    this.setData({
      'newInquiry.strategyType': strategy.type
    });
    
    wx.showToast({
      title: `已选择${strategy.name}`,
      icon: 'success'
    });
  },

  // 下拉刷新
  onPullDownRefresh: function() {
    this.refreshData();
    setTimeout(() => {
      wx.stopPullDownRefresh();
    }, 1000);
  },

  // 页面分享
  onShareAppMessage: function() {
    return {
      title: '期权询价中心 - 智能匹配，快速报价',
      path: '/pages/inquiry/inquiry',
      imageUrl: '/images/share-inquiry.png'
    };
  },

  // 页面分享到朋友圈
  onShareTimeline: function() {
    return {
      title: '期权询价中心 - 专业期权交易平台'
    };
  }
});