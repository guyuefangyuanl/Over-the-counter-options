// 报价页面 - 核心功能页面（个股期权报价）
const OptionPricingSystem = require('../../utils/option-pricing.js');

Page({
  data: {
    // 当前股票信息
    currentStock: {
      code: '000001',
      name: '平安银行',
      market: 'SZ',
      price: 11.36,
      change: 0.61,
      changePercent: 5.68,
      displayText: '11.36  +0.61%'
    },
    
    // 报价日期选择
    quoteDates: [
      { id: 'latest', label: '最新2024/12/19', value: '2024-12-19', isActive: true },
      { id: 'yesterday', label: '昨日2024/12/18', value: '2024-12-18', isActive: false }
    ],
    selectedQuoteDate: '最新2024/12/19',
    
    // 交易商选择
    traders: [
      { code: 'ALL', name: '全部交易商', isActive: true },
      { code: 'ZXZQ', name: '中信证券', isActive: false },
      { code: 'HTCF', name: '华泰财富', isActive: false },
      { code: 'YHRD', name: '银河瑞德', isActive: false },
      { code: 'HTZQ', name: '海通证券', isActive: false },
      { code: 'GJZQ', name: '国金证券', isActive: false }
    ],
    selectedTrader: '全部交易商',
    
    // 期权报价数据
    optionQuotes: [],
    
    // 页面状态
    loading: false,
    showSearch: false,
    showDatePicker: false,
    showTraderPicker: false,
    searchKeyword: '',
    
    // 筛选条件
    filterOptions: {
      optionType: 'ALL', // ALL, CALL, PUT
      timeToExpiry: 'ALL', // ALL, 1M, 3M, 6M, 1Y
      moneyness: 'ALL' // ALL, ITM, ATM, OTM
    }
  },

  onLoad: function (options) {
    console.log('个股期权报价页面加载', options);
    
    // 如果有传入的股票信息，使用传入的股票
    if (options && options.stock) {
      try {
        const stockInfo = JSON.parse(decodeURIComponent(options.stock));
        this.setData({
          currentStock: {
            code: stockInfo.code || '000001',
            name: stockInfo.name || '平安银行',
            price: stockInfo.price || 11.36,
            change: stockInfo.change || 0.61,
            changePercent: stockInfo.changePercent || 5.68,
            displayText: `${stockInfo.price || 11.36}  +${stockInfo.changePercent || 5.68}%`
          }
        });
      } catch (e) {
        console.error('解析股票信息失败:', e);
      }
    }
    
    this.initPricingSystem();
    this.loadOptionQuotes();
  },

  onShow: function () {
    // 页面显示时刷新数据
    if (this.pricingSystem) {
      this.refreshPricing();
    }
  },

  // 初始化期权报价系统
  initPricingSystem: function() {
    this.pricingSystem = new OptionPricingSystem();
  },

  // 加载期权报价数据
  loadOptionQuotes: function() {
    this.setData({ loading: true });
    
    const { currentStock, selectedQuoteDate, selectedTrader } = this.data;
    
    // 生成真实的期权报价数据
    const quotes = this.generateRealisticQuotes(currentStock);
    
    this.setData({
      optionQuotes: quotes,
      loading: false
    });
  },
  
  // 生成真实的期权报价数据
  generateRealisticQuotes: function(stock) {
    const quotes = [];
    const basePrice = stock.price;
    
    // 期权类型和期限
    const optionTypes = ['看涨', '看跌'];
    const expiryTerms = [
      { label: '1个月', days: 30, code: '1M' },
      { label: '3个月', days: 90, code: '3M' },
      { label: '6个月', days: 180, code: '6M' },
      { label: '1年', days: 365, code: '1Y' }
    ];
    
    // 执行价水平（相对于现价）
    const strikeRatios = [0.90, 0.95, 1.00, 1.05, 1.10];
    
    optionTypes.forEach(optionType => {
      expiryTerms.forEach(term => {
        strikeRatios.forEach((ratio, index) => {
          const strikePrice = (basePrice * ratio).toFixed(2);
          const isCall = optionType === '看涨';
          const moneyness = this.getMoneyness(ratio);
          
          // 计算期权费
          const premium = this.calculateOptionPremium(basePrice, strikePrice, term.days, isCall);
          
          // 随机选择交易商
          const randomTrader = this.getRandomTrader();
          
          quotes.push({
            id: `${optionType}_${term.code}_${ratio}`,
            optionType: optionType,
            expiryTerm: term.label,
            expiryDays: term.days,
            strikePrice: parseFloat(strikePrice),
            premium: premium,
            premiumPercent: ((premium / basePrice) * 100).toFixed(2),
            moneyness: moneyness,
            trader: randomTrader,
            bidPrice: (premium * 0.98).toFixed(2),
            askPrice: (premium * 1.02).toFixed(2),
            volume: Math.floor(Math.random() * 1000 + 100),
            openInterest: Math.floor(Math.random() * 5000 + 500),
            impliedVol: (15 + Math.random() * 30).toFixed(1),
            delta: this.calculateDelta(isCall, ratio),
            gamma: (Math.random() * 0.05).toFixed(4),
            theta: (-(Math.random() * 0.1 + 0.01)).toFixed(4),
            vega: (Math.random() * 0.3 + 0.1).toFixed(3),
            updateTime: new Date().toLocaleTimeString('zh-CN', { hour12: false })
          });
        });
      });
    });
    
    return quotes.sort((a, b) => a.premium - b.premium);
  },

  // 获取期权价值状态
  getMoneyness: function(ratio) {
    if (ratio < 0.98) return 'ITM'; // 实值
    if (ratio > 1.02) return 'OTM'; // 虚值  
    return 'ATM'; // 平值
  },
  
  // 计算期权费
  calculateOptionPremium: function(spot, strike, days, isCall) {
    const S = parseFloat(spot);
    const K = parseFloat(strike);
    const T = days / 365;
    const r = 0.03; // 无风险利率
    const sigma = 0.25 + Math.random() * 0.15; // 波动率
    
    // 简化的Black-Scholes公式
    const d1 = (Math.log(S/K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    
    let premium;
    if (isCall) {
      premium = S * this.normalCDF(d1) - K * Math.exp(-r * T) * this.normalCDF(d2);
    } else {
      premium = K * Math.exp(-r * T) * this.normalCDF(-d2) - S * this.normalCDF(-d1);
    }
    
    return Math.max(0.01, premium).toFixed(2);
  },
  
  // 正态分布累积函数（简化版）
  normalCDF: function(x) {
    return 0.5 * (1 + this.erf(x / Math.sqrt(2)));
  },
  
  // 误差函数近似
  erf: function(x) {
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;
    
    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);
    
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    
    return sign * y;
  },
  
  // 计算Delta
  calculateDelta: function(isCall, strikeRatio) {
    let delta;
    if (isCall) {
      delta = strikeRatio < 1 ? 0.6 + Math.random() * 0.3 : 0.2 + Math.random() * 0.4;
    } else {
      delta = -(strikeRatio < 1 ? 0.2 + Math.random() * 0.4 : 0.6 + Math.random() * 0.3);
    }
    return delta.toFixed(3);
  },
  
  // 获取随机交易商
  getRandomTrader: function() {
    const traders = this.data.traders.filter(t => t.code !== 'ALL');
    return traders[Math.floor(Math.random() * traders.length)];
  },
  // 切换报价日期
  onQuoteDateChange: function(e) {
    const selectedDate = e.currentTarget.dataset.date;
    const quoteDates = this.data.quoteDates.map(date => ({
      ...date,
      isActive: date.label === selectedDate.label
    }));
    
    this.setData({
      quoteDates: quoteDates,
      selectedQuoteDate: selectedDate.label,
      showDatePicker: false
    });
    
    this.loadOptionQuotes();
    
    wx.showToast({
      title: `已切换到${selectedDate.label}`,
      icon: 'success',
      duration: 1500
    });
  },
  
  // 切换交易商
  onTraderChange: function(e) {
    const selectedTrader = e.currentTarget.dataset.trader;
    const traders = this.data.traders.map(trader => ({
      ...trader,
      isActive: trader.name === selectedTrader.name
    }));
    
    this.setData({
      traders: traders,
      selectedTrader: selectedTrader.name,
      showTraderPicker: false
    });
    
    this.filterQuotesByTrader(selectedTrader.code);
    
    wx.showToast({
      title: `已筛选${selectedTrader.name}`,
      icon: 'success',
      duration: 1500
    });
  },
  
  // 按交易商筛选报价
  filterQuotesByTrader: function(traderCode) {
    if (traderCode === 'ALL') {
      this.loadOptionQuotes(); // 重新加载所有报价
      return;
    }
    
    const filteredQuotes = this.data.optionQuotes.filter(quote => 
      quote.trader.code === traderCode
    );
    
    this.setData({
      optionQuotes: filteredQuotes
    });
  },
  
  // 显示/隐藏日期选择器
  toggleDatePicker: function() {
    this.setData({
      showDatePicker: !this.data.showDatePicker,
      showTraderPicker: false
    });
  },
  
  // 显示/隐藏交易商选择器
  toggleTraderPicker: function() {
    this.setData({
      showTraderPicker: !this.data.showTraderPicker,
      showDatePicker: false
    });
  },
  
  // 搜索股票
  onSearchStock: function() {
    this.setData({
      showSearch: true
    });
  },
  
  // 搜索输入
  onSearchInput: function(e) {
    this.setData({
      searchKeyword: e.detail.value
    });
  },
  
  // 执行搜索
  performSearch: function() {
    const keyword = this.data.searchKeyword.trim();
    if (!keyword) {
      wx.showToast({
        title: '请输入股票代码或名称',
        icon: 'none'
      });
      return;
    }
    
    this.setData({ loading: true });
    
    // 模拟搜索结果
    setTimeout(() => {
      const stockDatabase = {
        '000001': { name: '平安银行', price: 11.36 },
        '000002': { name: '万科A', price: 8.92 },
        '600036': { name: '招商银行', price: 35.67 },
        '600519': { name: '贵州茅台', price: 1678.90 },
        '000858': { name: '五粮液', price: 128.45 }
      };
      
      const stock = stockDatabase[keyword] || stockDatabase['000001'];
      const newStock = {
        code: keyword,
        name: stock.name,
        price: stock.price,
        change: (Math.random() * 2 - 1).toFixed(2),
        changePercent: (Math.random() * 4 - 2).toFixed(2)
      };
      
      newStock.displayText = `${newStock.price}  ${newStock.changePercent}%`;
      
      this.setData({
        currentStock: newStock,
        showSearch: false,
        searchKeyword: ''
      });
      
      this.loadOptionQuotes();
    }, 1000);
  },
  
  // 取消搜索
  cancelSearch: function() {
    this.setData({
      showSearch: false,
      searchKeyword: ''
    });
  },
  
  // 询价操作
  onInquiry: function(e) {
    const quote = e.currentTarget.dataset.quote;
    
    wx.showModal({
      title: '询价确认',
      content: `确定要对 ${quote.optionType}期权（执行价${quote.strikePrice}）进行询价吗？`,
      success: (res) => {
        if (res.confirm) {
          this.submitInquiry(quote);
        }
      }
    });
  },
  
  // 提交询价
  submitInquiry: function(quote) {
    wx.showLoading({
      title: '提交询价中...'
    });
    
    setTimeout(() => {
      wx.hideLoading();
      wx.showToast({
        title: '询价已提交',
        icon: 'success'
      });
      
      // 跳转到询价中心
      wx.switchTab({
        url: '/pages/inquiry/inquiry'
      });
    }, 1500);
  },
  
  // 查看详情
  onViewDetail: function(e) {
    const quote = e.currentTarget.dataset.quote;
    
    wx.navigateTo({
      url: `/pages/option-detail/option-detail?data=${encodeURIComponent(JSON.stringify(quote))}`
    });
  },
  
  // 刷新报价
  refreshQuotes: function() {
    this.setData({ loading: true });
    
    setTimeout(() => {
      this.loadOptionQuotes();
      wx.showToast({
        title: '报价已更新',
        icon: 'success'
      });
    }, 1000);
  },
  
  // 下拉刷新
  onPullDownRefresh: function() {
    this.refreshQuotes();
    setTimeout(() => {
      wx.stopPullDownRefresh();
    }, 1500);
  },
  
  // 联系客服
  contactService: function() {
    wx.showModal({
      title: '专属客服',
      content: '添加您的专属客服。\n\n客服微信：optionservice\n客服电话：400-888-8888',
      confirmText: '复制微信',
      success: (res) => {
        if (res.confirm) {
          wx.setClipboardData({
            data: 'optionservice',
            success: () => {
              wx.showToast({
                title: '微信号已复制',
                icon: 'success'
              });
            }
          });
        }
      }
    });
  },

  // 加载初始数据
  loadInitialData: function() {
    this.setData({ loading: true });
    
    // 模拟选择默认股票
    setTimeout(() => {
      this.pricingSystem.selectStock({
        code: '000001',
        name: '平安银行',
        price: 12.45,
        change: 0.23,
        changePercent: 1.88
      });
    }, 500);
  },

  // 股票搜索
  onSearchInput: function(e) {
    this.setData({
      searchKeyword: e.detail.value
    });
  },

  // 执行搜索
  performSearch: function() {
    const keyword = this.data.searchKeyword.trim();
    if (!keyword) {
      wx.showToast({
        title: '请输入股票代码或名称',
        icon: 'none'
      });
      return;
    }

    this.setData({ loading: true });
    
    // 模拟搜索结果
    setTimeout(() => {
      const mockStock = {
        code: keyword.toUpperCase(),
        name: '模拟股票',
        price: (Math.random() * 100 + 10).toFixed(2),
        change: (Math.random() * 2 - 1).toFixed(2),
        changePercent: (Math.random() * 4 - 2).toFixed(2)
      };
      
      this.pricingSystem.selectStock(mockStock);
      this.setData({ showSearch: false });
    }, 1000);
  },

  // 切换搜索显示
  toggleSearch: function() {
    this.setData({
      showSearch: !this.data.showSearch
    });
  },

  // 筛选器变化
  onFilterChange: function(e) {
    this.setData({
      filterType: e.detail.value
    });
    this.applyFilters();
  },

  // 交易商筛选
  onTraderChange: function(e) {
    this.setData({
      selectedTrader: e.detail.value
    });
    this.applyFilters();
  },

  // 应用筛选
  applyFilters: function() {
    if (this.pricingSystem) {
      this.pricingSystem.applyFilter(this.data.filterType, this.data.selectedTrader);
    }
  },

  // 刷新报价
  refreshPricing: function() {
    if (this.pricingSystem) {
      this.setData({ loading: true });
      this.pricingSystem.refreshPricing();
    }
  },

  // 询价
  onInquiry: function(e) {
    if (!this.data.userInfo.isLoggedIn) {
      wx.showModal({
        title: '提示',
        content: '请先登录后再进行询价操作',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({
              url: '/pages/profile/profile'
            });
          }
        }
      });
      return;
    }

    const index = e.currentTarget.dataset.index;
    const item = this.data.pricingData[index];
    
    if (!item) return;

    wx.showModal({
      title: '询价确认',
      content: `确定要对 ${item.optionType} 进行询价吗？`,
      success: (res) => {
        if (res.confirm) {
          this.submitInquiry(item);
        }
      }
    });
  },

  // 提交询价
  submitInquiry: function(item) {
    wx.showLoading({
      title: '提交询价中...'
    });

    // 模拟询价提交
    setTimeout(() => {
      wx.hideLoading();
      wx.showToast({
        title: '询价已提交',
        icon: 'success'
      });
      
      // 可以跳转到询价详情页面
      wx.navigateTo({
        url: '/pages/inquiry/inquiry?type=detail&id=' + Date.now()
      });
    }, 1500);
  },

  // 查看详情
  onViewDetail: function(e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.pricingData[index];
    
    wx.navigateTo({
      url: '/pages/detail/detail?data=' + encodeURIComponent(JSON.stringify(item))
    });
  },

  // 显示高级筛选
  showAdvancedFilter: function() {
    this.setData({
      showAdvancedFilter: true
    });
  },

  // 隐藏高级筛选
  hideAdvancedFilter: function() {
    this.setData({
      showAdvancedFilter: false
    });
  },

  // 排序功能
  onSortChange: function(e) {
    const sortBy = e.currentTarget.dataset.sort;
    let sortOrder = 'asc';
    
    if (this.data.sortBy === sortBy) {
      sortOrder = this.data.sortOrder === 'asc' ? 'desc' : 'asc';
    }
    
    this.setData({
      sortBy: sortBy,
      sortOrder: sortOrder
    });
    
    this.applySorting();
  },

  // 应用排序
  applySorting: function() {
    const { sortBy, sortOrder } = this.data;
    let sortedData = [...this.data.pricingData];
    
    sortedData.sort((a, b) => {
      let valueA, valueB;
      
      switch (sortBy) {
        case 'premium':
          valueA = parseFloat(a.bidPrice || 0);
          valueB = parseFloat(b.bidPrice || 0);
          break;
        case 'volume':
          valueA = Math.random() * 1000; // 模拟交易量
          valueB = Math.random() * 1000;
          break;
        case 'time':
          valueA = new Date(a.updateTime).getTime();
          valueB = new Date(b.updateTime).getTime();
          break;
        case 'greeks':
          valueA = parseFloat(a.greeks?.delta || 0);
          valueB = parseFloat(b.greeks?.delta || 0);
          break;
        default:
          return 0;
      }
      
      if (sortOrder === 'asc') {
        return valueA - valueB;
      } else {
        return valueB - valueA;
      }
    });
    
    this.setData({
      pricingData: sortedData
    });
  },

  // 高级筛选应用
  applyAdvancedFilters: function() {
    // 这里可以添加复杂的筛选逻辑
    wx.showToast({
      title: '筛选已应用',
      icon: 'success'
    });
    
    this.hideAdvancedFilter();
  },

  // 查看价格趋势图
  viewPriceChart: function(e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.pricingData[index];
    
    wx.navigateTo({
      url: `/pages/chart/chart?data=${encodeURIComponent(JSON.stringify(item))}`
    });
  },

  // 下拉刷新
  onPullDownRefresh: function() {
    this.refreshPricing();
    setTimeout(() => {
      wx.stopPullDownRefresh();
    }, 1000);
  },

  // 选择期权类型
  selectOptionType: function(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      'filterOptions.optionType': type
    });
    this.applyFilters();
  },

  // 应用筛选条件
  applyFilters: function() {
    let filteredQuotes = [...this.data.optionQuotes];
    const { optionType, timeToExpiry, moneyness } = this.data.filterOptions;
    
    // 按期权类型筛选
    if (optionType !== 'ALL') {
      filteredQuotes = filteredQuotes.filter(quote => {
        if (optionType === 'VANILLA') {
          return quote.optionType.includes('看涨') || quote.optionType.includes('看跌');
        } else if (optionType === 'SNOWBALL') {
          return quote.optionType.includes('雪球');
        }
        return true;
      });
    }
    
    // 按到期时间筛选
    if (timeToExpiry !== 'ALL') {
      filteredQuotes = filteredQuotes.filter(quote => {
        const days = quote.expiryDays;
        switch (timeToExpiry) {
          case '1M': return days <= 30;
          case '3M': return days <= 90;
          case '6M': return days <= 180;
          case '1Y': return days <= 365;
          default: return true;
        }
      });
    }
    
    // 按价值状态筛选
    if (moneyness !== 'ALL') {
      filteredQuotes = filteredQuotes.filter(quote => quote.moneyness === moneyness);
    }
    
    this.setData({
      optionQuotes: filteredQuotes
    });
  },

  // 返回上一页
  goBack: function() {
    wx.navigateBack();
  },

  // 打开计算器
  openCalculator: function() {
    wx.navigateTo({
      url: '/pages/calculator/calculator'
    });
  },

  // 打开工作台
  openWorkspace: function() {
    wx.navigateTo({
      url: '/pages/workspace/workspace'
    });
  }
});