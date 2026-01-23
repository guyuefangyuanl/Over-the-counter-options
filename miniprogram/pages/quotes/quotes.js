// 报价页面 - 核心功能页面（个股期权报价）
const OptionPricingSystem = require('../../utils/option-pricing.js');
const logic = require('../../utils/inquiry-logic.js');
const api = require('../../utils/api-group.js');

const FAVORITES_STORAGE_KEY = 'INQUIRY_FAVORITES_V1';

Page({
  data: {
    // 新增：匹配图片设计的 UI 状态数据
    statusBarHeight: 20, // 默认值，onLoad 会更新
    navBarHeight: 44,
    currentTab: '自选',
    subFilter: '全部',
    selectedTerm: '1M',
    watchlist: [
      { name: '宁德时代', code: '300750.SZ', changePercent: 2.47, atm: 11.83, otm105: 9.77, otm110: 8.01 },
      { name: '东方财富', code: '300059.SZ', changePercent: 0.50, atm: 16.20, otm105: 14.21, otm110: 12.44 },
      { name: '平安银行', code: '000001.SZ', changePercent: -0.35, atm: 6.53, otm105: 4.46, otm110: 2.94 },
      { name: '药明康德', code: '603259.SH', changePercent: -1.26, atm: 7.92, otm105: 5.83, otm110: 4.21 },
      { name: '上海贝岭', code: '603259.SH', changePercent: -2.26, atm: 12.16, otm105: 10.16, otm110: 8.16 }
    ],
    hotStocks: [], // 热门10支个股
    updateTime: '2024/12/23 15:00更新',
    terms: ['1M', '2M', '3M', '6M'],
    traders: [
      { code: 'BEST', name: '最优报价' },
      { code: 'ZXZZ', name: 'ZXZZ' },
      { code: 'HTCC', name: 'HTCC' },
      { code: 'YHRD', name: 'YHRD' },
      { code: 'YAZB', name: 'YAZB' }
    ],
    selectedTrader: '最优报价',
    selectedTraderCode: 'BEST',
    
    // 指数页面数据
    indexUpdate: '2024/12/23 15:00更新',
    topIndices: [
      { name: '中证500', price: '5818.55', changePercent: -1.67 },
      { name: '中证1000', price: '6096.38', changePercent: -2.80 },
      { name: '沪深300', price: '3933.57', changePercent: 0.15 }
    ],
    indexQuotes: [
      { name: '中证500', code: '000905.SH', changePercent: 2.47, atm: 11.83, otm105: 9.77, otm110: 8.01 },
      { name: '中证1000', code: '000852.SH', changePercent: 0.50, atm: 16.20, otm105: 14.21, otm110: 12.44 },
      { name: '沪深300', code: '000300.SH', changePercent: -0.35, atm: 6.53, otm105: 4.46, otm110: 2.94 },
      { name: '上证50', code: '000016.SH', changePercent: -1.26, atm: 7.92, otm105: 5.83, otm110: 4.21 },
      { name: '创业板', code: '399006.SZ', changePercent: -2.26, atm: 12.16, otm105: 10.16, otm110: 8.16 }
    ],

    // ETF 页面数据
    etfUpdate: '2024/12/23 15:00更新',
    etfQuotes: [
      { name: '芯片ETF', code: '159995.SZ', changePercent: 2.47, atm: 11.83, otm105: 9.77, otm110: 8.01 },
      { name: '5GETF', code: '515050.SH', changePercent: 0.50, atm: 16.20, otm105: 14.21, otm110: 12.44 },
      { name: '新能源车ETF', code: '515030.SH', changePercent: -0.35, atm: 6.53, otm105: 4.46, otm110: 2.94 },
      { name: '消费ETF', code: '159928.SZ', changePercent: -1.26, atm: 7.92, otm105: 5.83, otm110: 4.21 },
      { name: '医药ETF', code: '512010.SH', changePercent: -2.26, atm: 12.16, otm105: 12.16, otm110: 8.16 }
    ],

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
    
    // 收藏状态
    isFavorited: false,
    
    // 当前询价项目
    currentQuote: null,
    
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
    selectedTraderCode: 'ALL',
    
    // 期权报价数据
    optionQuotes: [],
    
    // 页面状态
    loading: false,
    showSearch: false,
    showDatePicker: false,
    showTraderPicker: false,
    searchKeyword: '',
    
    // 编辑自选状态
    isEditing: false,
    selectedForEdit: [],
    showStockDetail: false,
    sortField: 'changePercent',
    sortOrder: 'desc',

    // === 新增：矩阵视图数据 ===
    bizType: 'vanilla',
    matrixColumns: ['2W', '1M', '2M', '3M', '6M', '12M'],
    matrixData: [],
    matrixScrollLeft: 0,
    
    // 筛选条件
    filterOptions: {
      optionType: 'ALL', // ALL, CALL, PUT
      timeToExpiry: 'ALL', // ALL, 1M, 3M, 6M, 1Y
      moneyness: 'ALL' // ALL, ITM, ATM, OTM
    },
    showOrderModal: false,
    showDataModal: false,
    modalAnimationClass: '',
    orderForm: {
      direction: '买入',
      traderCode: '',
      traderName: '',
      underlying: '',
      structure: '',
      premiumPercent: '',
      notional: 100,
      buyPrice: ''
    },
    
    // === 分组功能状态 ===
    systemGroups: [
      { id: 'all', name: '全部' },
      { id: 'holding', name: '我的持仓' }
    ],
    customGroups: [],
    showGroupManagePopup: false,
    showNewGroupDialog: false,
    newGroupName: '',
    newGroupError: '',
    canConfirmNewGroup: false,
    showRenameGroupDialog: false,
    editingGroupId: '',
    editingGroupName: '',
    renameGroupError: '',
    canConfirmRenameGroup: false,
    groupCountsById: {},
    activeGroupId: 'all', // 当前激活的分组ID
    topGroups: [],
    topGroupAnimationClass: '',
    loadingGroups: false,
    pendingGroupSwitchId: '',
    showDeleteGroupDialog: false,
    deleteGroupId: '',
    deleteGroupName: '',
    deleteRemoveFavorites: false
  },

  onLoad: function (options) {
    // 获取系统信息以适配自定义导航栏
    const windowInfo = wx.getWindowInfo();
    this.setData({
      statusBarHeight: windowInfo.statusBarHeight,
      navBarHeight: 44 // iOS标准，Android可能是48，这里简化
    });

    console.log('个股期权报价页面加载', options);
    this.handleNavigationParams(options);
    
    // 检查收藏状态
    this.checkFavoriteStatus();
    
    // 初始化数据
    this.loadWatchlist();
    this.loadHotStocks();
    this.loadIndexData();
    this.loadEtfData();
    this.loadGroups({ silent: true });
    
    // 初始化期权报价系统
    this.initPricingSystem();
  },

  onShow: function() {
    // 适配自定义 tabBar
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 1 // 报价页在 tabBar 中的索引
      })
    }

    // 检查是否有全局跳转参数
    const app = getApp();
    if (app.globalData.pendingQuoteParams) {
      console.log('处理全局跳转参数', app.globalData.pendingQuoteParams);
      this.handleNavigationParams(app.globalData.pendingQuoteParams);
      app.globalData.pendingQuoteParams = null; // 处理完清空
    }

    // 页面显示时刷新数据
    if (this.pricingSystem) {
      this.refreshPricing();
    }
    
    // 加载自选列表
    this.loadWatchlist();
    this.loadGroups({ silent: true });
    
    // 重新检查收藏状态
    this.checkFavoriteStatus();
  },

  handleNavigationParams: function(options) {
    if (!options) return;

    // 如果有传入的股票信息，使用传入的股票
    if (options.stock) {
      try {
        const stockInfo = typeof options.stock === 'string' ? JSON.parse(decodeURIComponent(options.stock)) : options.stock;
        this.setData({
          currentTab: '个股',
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
    } else {
      const sc = (options.stockCode || options.code);
      const sn = (options.stockName || options.name);
      if (sc) {
        const code = this.normalizeParam(sc);
        const name = this.normalizeParam(sn) || '平安银行';
        const price = options.price || Number((Math.random() * 100 + 10).toFixed(2));
        const changePercent = options.changePercent || Number((Math.random() * 4 - 2).toFixed(2));
        const change = Number((price * changePercent / 100).toFixed(2));
        
        this.setData({
          currentTab: '个股',
          currentStock: {
            code,
            name,
            price,
            change,
            changePercent,
            displayText: `${price}  ${changePercent >= 0 ? '+' : ''}${changePercent}%`
          }
        });
        
        // 如果是从搜索跳转，重新加载报价
        this.loadOptionQuotes();
      }
    }
  },

  // 加载 ETF 数据
  loadEtfData: function() {
    this.setData({ loading: true });
    // 模拟从后端获取 ETF 数据
    setTimeout(() => {
      this.setData({
        loading: false,
        etfUpdate: new Date().toLocaleString('zh-CN', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit', 
          hour: '2-digit', 
          minute: '2-digit' 
        }).replace(/\//g, '/') + '更新'
      });
    }, 500);
  },

  // 加载指数数据
  loadIndexData: function() {
    this.setData({ loading: true });
    // 模拟从后端获取指数数据
    setTimeout(() => {
      this.setData({
        loading: false,
        indexUpdate: new Date().toLocaleString('zh-CN', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit', 
          hour: '2-digit', 
          minute: '2-digit' 
        }).replace(/\//g, '/') + '更新'
      });
    }, 500);
  },

  // 加载热门个股
  loadHotStocks: function() {
    this.setData({ loading: true });
    
    // 模拟或调用 API 获取热门个股数据
    // 实际项目中应优先从后端实时获取
    setTimeout(() => {
      const baseStocks = [
        { name: '宁德时代', code: '300750.SZ', changePercent: 2.47, price: 180.50, atm: 11.83, otm105: 9.77, otm110: 8.01 },
        { name: '东方财富', code: '300059.SZ', changePercent: 0.50, price: 13.45, atm: 16.20, otm105: 14.21, otm110: 12.44 },
        { name: '平安银行', code: '000001.SZ', changePercent: -0.35, price: 10.20, atm: 6.53, otm105: 4.46, otm110: 2.94 },
        { name: '药明康德', code: '603259.SH', changePercent: -1.26, price: 45.30, atm: 7.92, otm105: 5.83, otm110: 4.21 },
        { name: '上海贝岭', code: '600171.SH', changePercent: -2.26, price: 28.16, atm: 12.16, otm105: 10.16, otm110: 8.16 },
        { name: '中信证券', code: '600030.SH', changePercent: 1.45, price: 22.34, atm: 10.23, otm105: 8.56, otm110: 7.12 },
        { name: '贵州茅台', code: '600519.SH', changePercent: 0.12, price: 1650.00, atm: 15.32, otm105: 13.12, otm110: 11.45 },
        { name: '五粮液', code: '000858.SZ', changePercent: -0.56, price: 150.20, atm: 14.12, otm105: 12.34, otm110: 10.56 },
        { name: '比亚迪', code: '002594.SZ', changePercent: 3.12, price: 210.50, atm: 18.56, otm105: 16.45, otm110: 14.23 },
        { name: '隆基绿能', code: '601012.SH', changePercent: -1.89, price: 18.45, atm: 22.34, otm105: 20.12, otm110: 18.45 }
      ];
      
      // 应用排序
      const { sortField, sortOrder } = this.data;
      const sortedStocks = baseStocks.sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        
        // 处理数值
        valA = typeof valA === 'string' ? parseFloat(valA) : valA;
        valB = typeof valB === 'string' ? parseFloat(valB) : valB;
        
        if (sortOrder === 'asc') {
          return valA - valB;
        } else {
          return valB - valA;
        }
      });

      const now = new Date();
      const formattedTime = `${now.getFullYear()}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}更新`;

      this.setData({ 
        hotStocks: sortedStocks,
        loading: false,
        updateTime: formattedTime
      });
    }, 600);
  },

  // 排序切换
  onSortChange: function(e) {
    const field = e.currentTarget.dataset.sort;
    let { sortField, sortOrder } = this.data;
    
    if (sortField === field) {
      sortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
    } else {
      sortField = field;
      sortOrder = 'desc';
    }
    
    this.setData({ sortField, sortOrder });
    this.loadHotStocks();
  },

  // 点击查看详情
  onViewDetail: function(e) {
    const item = e.currentTarget.dataset.item;
    console.log('查看股票详情:', item);
    
    const stockCode = item.code;
    const name = encodeURIComponent(item.name);
    const price = item.price;
    const change = item.change || 0;
    const changePercent = item.changePercent;

    wx.navigateTo({
      url: `/pages/stock-detail/stock-detail?code=${stockCode}&name=${name}&price=${price}&change=${change}&changePercent=${changePercent}`
    });
  },

  // 切换期限
  onTermChange: function(e) {
    const term = e.currentTarget.dataset.term;
    this.setData({ selectedTerm: term });
    this.loadHotStocks(); // 实际应重新获取对应期限的数据
  },

  // 切换交易商
  onTraderChange: function(e) {
    const { code, name } = e.currentTarget.dataset;
    this.setData({ 
      selectedTrader: name,
      selectedTraderCode: code,
      showTraderPicker: false
    });
    this.loadHotStocks();
  },

  toggleTraderPicker: function() {
    this.setData({ showTraderPicker: !this.data.showTraderPicker });
  },

  // 切换业务类型 (香草/雪球)
  onBizTypeChange: function(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ bizType: type });
    this.loadOptionQuotes();
  },

  // 将列表数据转换为矩阵格式
  transformToMatrix: function(quotes) {
    const { matrixColumns, selectedTraderCode } = this.data;
    // 固定的执行价/结构行，匹配图片中的样式
    // 尝试从数据中提取所有不重复的类型，或者保留预设
    const rawStrikes = [...new Set(quotes.map(q => q.type))].filter(Boolean);
    const strikes = rawStrikes.length > 0 ? rawStrikes : ['100C', '103C', '105C', '110C', '80C', '90C', '95C'];
    
    const matrix = strikes.map(strike => {
      const row = { strike: strike, values: [] };
      matrixColumns.forEach(term => {
        let value = '--';
        let badge = null;
        
        // 在传入的报价中查找匹配项
        // 匹配规则：类型(strike)匹配，期限(term)匹配
        const match = quotes.find(q => {
          const typeMatch = q.type === strike || (q.type && q.type.includes(strike));
          const termMatch = q.term === term || (q.term && q.term.includes(term));
          // 如果选择了特定交易商，还要匹配交易商
          const traderMatch = selectedTraderCode === 'ALL' || selectedTraderCode === 'BEST' || q.trader === selectedTraderCode;
          return typeMatch && termMatch && traderMatch;
        });

        if (match) {
          // 如果是 float，转换为百分比
          if (typeof match.rate === 'number') {
            value = (match.rate * 100).toFixed(2) + '%';
          } else {
            value = match.rate || '--';
          }
          // 如果是“最优报价”模式，可以添加角标或特殊处理
          if (selectedTraderCode === 'BEST') {
            badge = '1'; 
          }
        } else if (strike === '100C' && term === '1M' && quotes.length < 5) {
          // 兜底逻辑：如果数据太少且匹配不到，保留一个示例
          value = '3.65%';
          badge = '1';
        }

        row.values.push({ term: term, value: value, badge: badge });
      });
      return row;
    });

    this.setData({ matrixData: matrix });
  },

  // 同步滚动 (已由 CSS sticky 实现，此处留作备用或移除)
  onMatrixHeaderScroll: function(e) {},
  onMatrixRowScroll: function(e) {},

  // 显示/隐藏选择器
  showDatePicker: function() {
    wx.showActionSheet({
      itemList: this.data.quoteDates.map(d => d.label),
      success: (res) => {
        const date = this.data.quoteDates[res.tapIndex];
        this.setData({ selectedQuoteDate: date.label });
        this.loadOptionQuotes();
      }
    });
  },

  showTraderPicker: function() {
    wx.showActionSheet({
      itemList: this.data.traders.map(t => t.name),
      success: (res) => {
        const trader = this.data.traders[res.tapIndex];
        this.setData({ 
          selectedTrader: trader.name,
          selectedTraderCode: trader.code
        });
        this.loadOptionQuotes();
      }
    });
  },

  // 点击矩阵单元格
  onCellTap: function(e) {
    const { strike, term } = e.currentTarget.dataset;
    const { currentStock, matrixData, selectedTrader, selectedTraderCode } = this.data;
    
    // 从矩阵数据中查找费率
    const row = matrixData.find(r => r.strike === strike);
    const cell = row ? row.values.find(v => v.term === term) : null;
    const premiumPercent = cell ? cell.value.replace('%', '') : '';

    this.setData({
      showOrderModal: true,
      orderForm: {
        direction: '买入',
        traderCode: selectedTraderCode,
        traderName: selectedTrader,
        underlying: `${currentStock.name} ${currentStock.code}`,
        structure: `${strike} - ${term}`,
        premiumPercent: premiumPercent,
        notional: 100,
        buyPrice: ''
      }
    });
  },

  // 跳转到计算器
  goToCalculator: function() {
    wx.navigateTo({ url: '/pages/calculator/calculator' });
  },

  // 跳转到工作台
  goToWorkspace: function() {
    // 检查 workspace 是否在 tabBar 中，不在的话使用 navigateTo
    wx.navigateTo({ 
      url: '/pages/workspace/workspace',
      fail: (err) => {
        console.log('navigateTo workspace failed, trying switchTab', err);
        wx.switchTab({ url: '/pages/workspace/workspace' });
      }
    });
  },

  normalizeParam: function(v) {
    if (v === undefined || v === null) return '';
    const s = String(v);
    if (s === 'undefined' || s === 'null') return '';
    return s;
  },

  // 更新股票信息（供搜索页回调）
  updateStockInfo: function(stockInfo) {
    console.log('更新股票信息:', stockInfo);
    this.setData({
      currentStock: {
        code: stockInfo.code,
        name: stockInfo.name,
        price: stockInfo.price,
        change: stockInfo.change,
        changePercent: stockInfo.changePercent,
        displayText: `${stockInfo.price}  ${stockInfo.changePercent >= 0 ? '+' : ''}${stockInfo.changePercent}%`
      }
    });
    
    // 重新检查收藏状态
    this.checkFavoriteStatus();
    
    // 重新加载期权报价
    this.loadOptionQuotes();
  },

  // 移除冗余的 onShow 定义
  /*
  onShow: function () {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 1
      })
    }
    // 页面显示时刷新数据
    if (this.pricingSystem) {
      this.refreshPricing();
    }
    
    // 加载自选列表
    this.loadWatchlist();
    this.loadGroups({ silent: true });
    
    // 重新检查收藏状态
    this.checkFavoriteStatus();
  },
  */

  // 加载自选列表数据
  loadWatchlist: function() {
    let favorites = wx.getStorageSync('favorites');
    
    // 如果没有本地存储，使用默认数据并存储
    if (!favorites || favorites.length === 0) {
      const defaultWatchlist = [
        { name: '宁德时代', code: '300750', market: 'SZ', changePercent: 2.47, price: 180.50 },
        { name: '东方财富', code: '300059', market: 'SZ', changePercent: 0.50, price: 13.45 },
        { name: '平安银行', code: '000001', market: 'SZ', changePercent: -0.35, price: 10.20 },
        { name: '药明康德', code: '603259', market: 'SH', changePercent: -1.26, price: 45.30 }
      ];
      wx.setStorageSync('favorites', defaultWatchlist);
      favorites = defaultWatchlist;
    }

    // 转换数据格式以匹配 UI 展示
    const watchlist = favorites.map(item => {
      // 格式化代码，确保有 .SZ/.SH 后缀
      let displayCode = item.code;
      if (!displayCode.includes('.')) {
        const market = item.market || (item.code.startsWith('6') ? 'SH' : 'SZ');
        displayCode = `${item.code}.${market}`;
      }

      // 模拟或获取期权数据 (atm, otm105, otm110)
      // 在实际应用中，这里应该调用 API 获取实时期权数据
      // 这里为了保持 UI 效果，如果已有数据则使用，否则生成模拟数据
      const atm = item.atm || (Math.random() * 10 + 5).toFixed(2);
      const otm105 = item.otm105 || (atm * 0.8).toFixed(2);
      const otm110 = item.otm110 || (atm * 0.6).toFixed(2);

      return {
        ...item,
        code: displayCode, // 更新为带后缀的格式
        atm: Number(atm).toFixed(2),
        otm105: Number(otm105).toFixed(2),
        otm110: Number(otm110).toFixed(2),
        changePercent: Number(item.changePercent).toFixed(2)
      };
    });

    this.setData({ watchlist });
  },

  // ==================== 自选编辑逻辑 ====================

  // 开始编辑自选
  onEditFavorites: function() {
    const { watchlist } = this.data;
    if (!watchlist || watchlist.length === 0) {
      wx.showToast({ title: '暂无自选可编辑', icon: 'none' });
      return;
    }
    this.setData({ 
      isEditing: true, 
      selectedForEdit: [] 
    });
  },

  // 取消编辑
  cancelEditing: function() {
    this.setData({ 
      isEditing: false, 
      selectedForEdit: [] 
    });
  },

  // 切换选中状态
  toggleSelection: function(e) {
    const code = e.currentTarget.dataset.code;
    const { selectedForEdit } = this.data;
    const idx = selectedForEdit.indexOf(code);
    
    let newSelected;
    if (idx > -1) {
      newSelected = [...selectedForEdit];
      newSelected.splice(idx, 1);
    } else {
      newSelected = [...selectedForEdit, code];
    }
    
    this.setData({ selectedForEdit: newSelected });
  },

  // 删除选中的自选
  deleteSelectedFavorites: function() {
    const { selectedForEdit, watchlist } = this.data;
    
    if (selectedForEdit.length === 0) {
      wx.showToast({ title: '请先选择要删除的条目', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '提示',
      content: `确定要删除这 ${selectedForEdit.length} 个自选吗？`,
      success: (res) => {
        if (res.confirm) {
          // 过滤掉被删除的项
          const newWatchlist = watchlist.filter(item => !selectedForEdit.includes(item.code));
          
          // 更新本地存储
          // 注意：这里假设 storage 中存的是原始对象列表，我们需要确保存储格式一致
          // 如果 loadWatchlist 中做了格式化，这里保存时最好保存原始数据
          // 简单起见，我们直接保存当前的 watchlist，但在 loadWatchlist 中可能需要调整读取逻辑
          // 或者更稳妥的做法：读取 Storage -> 过滤 -> 保存
          
          let storedFavorites = wx.getStorageSync('favorites') || [];
          // 处理存储中的代码格式可能不一致的问题 (比如有无后缀)
          const newStoredFavorites = storedFavorites.filter(item => {
             const codeWithSuffix = item.code.includes('.') ? item.code : 
                                   (item.code.startsWith('6') ? `${item.code}.SH` : `${item.code}.SZ`);
             // 如果在选中列表中找到了这个 code (假设 selectedForEdit 里的 code 都是带后缀的)
             // 实际上 watchlist 中的 code 是带后缀的，所以 selectedForEdit 也是带后缀的
             return !selectedForEdit.includes(codeWithSuffix) && !selectedForEdit.includes(item.code);
          });

          wx.setStorageSync('favorites', newStoredFavorites);
          
          // 更新页面数据
          this.setData({
            watchlist: newWatchlist,
            isEditing: false,
            selectedForEdit: []
          });
          
          wx.showToast({ title: '删除成功', icon: 'success' });
          
          // 如果删光了，自动退出编辑模式（上面已经退出了）
        }
      }
    });
  },

  // ==================== 自选编辑逻辑结束 ====================

  // ==================== 数据说明弹窗逻辑 ====================
  showDataInfo: function() {
    this.setData({
      showDataModal: true,
      modalAnimationClass: 'fade-in'
    });
  },

  hideDataInfo: function() {
    this.setData({
      modalAnimationClass: 'fade-out'
    });
    // 动画结束后移除 DOM
    setTimeout(() => {
      this.setData({
        showDataModal: false,
        modalAnimationClass: ''
      });
    }, 300); // 300ms 与 CSS 动画时间一致
  },

  preventTouchMove: function() {
    // 阻止背景滚动
    return;
  },

  stopBubble: function() {
    // 阻止点击弹窗内容时关闭弹窗
    return;
  },
  // ==================== 数据说明弹窗逻辑结束 ====================

  // ==================== 分组功能逻辑 ====================
  onGroupClick: function() {
    console.log('打开分组管理');
    this.setData({ showGroupManagePopup: true });
    this.loadGroups({ silent: false });
  },

  closeGroupManagePopup: function() {
    this.setData({ showGroupManagePopup: false });
  },

  // 加载分组列表
  loadGroups: function(options) {
    const silent = options && options.silent;
    this.setData({ loadingGroups: true });
    if (!silent) {
      wx.showLoading({ title: '加载中...' });
    }
    api.getGroups()
      .then(res => {
        if (!silent) {
          wx.hideLoading();
        }
        const groups = Array.isArray(res && res.data) ? res.data : [];
        const enhancedGroups = groups.map(g => ({ ...g, _protected: logic.isProtectedGroup(g) }));
        const pendingGroupId = this.data.pendingGroupSwitchId;
        this.setData({ customGroups: enhancedGroups, topGroups: enhancedGroups, loadingGroups: false, topGroupAnimationClass: enhancedGroups.length ? 'fade-in' : '' });
        this.updateGroupCounts();
        if (enhancedGroups.length) {
          setTimeout(() => {
            if (this.data.topGroupAnimationClass) {
              this.setData({ topGroupAnimationClass: '' });
            }
          }, 260);
        }
        if (pendingGroupId) {
          const exists = (enhancedGroups || []).some(g => g && g.id === pendingGroupId);
          if (exists) {
            this.setData({ pendingGroupSwitchId: '' });
            this.onSwitchGroup({ currentTarget: { dataset: { id: pendingGroupId } } });
          } else {
            this.setData({ pendingGroupSwitchId: '' });
          }
        }
        if (!silent && res && typeof res.message === 'string' && res.message.indexOf('数据库未连接') > -1) {
          wx.showToast({ title: '数据库未连接', icon: 'none' });
        }
      })
      .catch(err => {
        if (!silent) {
          wx.hideLoading();
          const msg = (err && err.message) ? err.message : '加载分组失败';
          wx.showToast({ title: msg, icon: 'none' });
        }
        this.setData({ customGroups: [], topGroups: [], loadingGroups: false, pendingGroupSwitchId: '' });
        this.updateGroupCounts();
      });
  },

  // 更新各分组数量
  updateGroupCounts: function() {
    const counts = {};
    const { watchlist, customGroups } = this.data;
    
    // 系统分组计数
    counts['all'] = watchlist.length;
    // 假设持仓逻辑
    counts['holding'] = watchlist.filter(item => item.isHolding).length || 0;

    // 自定义分组计数
    (customGroups || []).forEach(group => {
      // 使用后端返回的 members 长度
      if (group.members) {
        counts[group.id] = group.members.length;
      } else {
        counts[group.id] = 0;
      }
    });

    this.setData({ groupCountsById: counts });
  },

  // 切换分组
  onSwitchGroup: function(e) {
    const groupId = e.currentTarget.dataset.id;
    this.setData({ 
      activeGroupId: groupId,
      showGroupManagePopup: false
    });
    
    // 执行筛选逻辑
    this.filterWatchlistByGroup(groupId);
    
    wx.showToast({ title: '已切换分组', icon: 'none' });
  },

  // 根据分组筛选自选列表
  filterWatchlistByGroup: function(groupId) {
    // 重新加载原始列表
    let allItems = wx.getStorageSync('favorites') || [];
    
    let filtered;
    if (groupId === 'all') {
      filtered = allItems;
    } else if (groupId === 'holding') {
      filtered = allItems.filter(item => item.isHolding);
    } else {
      // 从后端分组数据中查找该分组
      const group = this.data.customGroups.find(g => g.id === groupId);
      if (group && group.members) {
        // 获取该分组下的股票代码列表
        const memberCodes = group.members.map(m => m.stock_code);
        // 筛选出在分组中的自选股
        filtered = allItems.filter(item => {
          // 兼容带后缀和不带后缀的比较
          const code = item.code;
          const codeNoSuffix = code.split('.')[0];
          return memberCodes.includes(code) || memberCodes.includes(codeNoSuffix);
        });
      } else {
        filtered = [];
      }
    }
    
    const formatted = this.formatWatchlistItems(filtered);
    this.setData({ watchlist: formatted });
  },
  
  // 提取格式化逻辑
  formatWatchlistItems: function(items) {
    return items.map(item => {
      let displayCode = item.code;
      if (!displayCode.includes('.')) {
        const market = item.market || (item.code.startsWith('6') ? 'SH' : 'SZ');
        displayCode = `${item.code}.${market}`;
      }
      const atm = item.atm || (Math.random() * 10 + 5).toFixed(2);
      const otm105 = item.otm105 || (atm * 0.8).toFixed(2);
      const otm110 = item.otm110 || (atm * 0.6).toFixed(2);
      return {
        ...item,
        code: displayCode,
        atm: Number(atm).toFixed(2),
        otm105: Number(otm105).toFixed(2),
        otm110: Number(otm110).toFixed(2),
        changePercent: Number(item.changePercent).toFixed(2)
      };
    });
  },

  // --- 新建分组 ---
  onShowNewGroupDialog: function() {
    this.setData({ 
      showNewGroupDialog: true,
      newGroupName: '',
      newGroupError: '',
      canConfirmNewGroup: false
    });
  },

  onCloseNewGroupDialog: function() {
    this.setData({ showNewGroupDialog: false });
  },

  onNewGroupNameInput: function(e) {
    const name = e.detail.value;
    const { canConfirm, error } = logic.validateNewGroupName(name, this.data.customGroups);
    this.setData({
      newGroupName: name,
      newGroupError: error || '',
      canConfirmNewGroup: canConfirm
    });
  },

  onConfirmNewGroup: function() {
    if (!this.data.canConfirmNewGroup) return;
    
    const name = this.data.newGroupName;
    
    wx.showLoading({ title: '创建中...' });
    
    api.createGroup(name)
      .then(res => {
        wx.hideLoading();
        wx.showToast({ title: '创建成功', icon: 'success' });
        const groupId = res && res.data && res.data.id ? res.data.id : '';
        if (groupId) {
          this.setData({ showNewGroupDialog: false, pendingGroupSwitchId: groupId, activeGroupId: groupId });
        } else {
          this.setData({ showNewGroupDialog: false });
        }
        this.loadGroups();
      })
      .catch(err => {
        wx.hideLoading();
        this.setData({ newGroupError: err.message || '创建失败' });
      });
  },

  // --- 重命名分组 ---
  onShowRenameGroupDialog: function(e) {
    const { id, name } = e.currentTarget.dataset;
    this.setData({
      showRenameGroupDialog: true,
      editingGroupId: id,
      editingGroupName: name,
      renameGroupError: '',
      canConfirmRenameGroup: false 
    });
  },

  onCloseRenameGroupDialog: function() {
    this.setData({ showRenameGroupDialog: false });
  },

  onRenameGroupNameInput: function(e) {
    const name = e.detail.value;
    const { canConfirm, error } = logic.validateRenameGroupName(name, this.data.editingGroupId, this.data.customGroups);
    
    this.setData({
      editingGroupName: name,
      renameGroupError: error || '',
      canConfirmRenameGroup: canConfirm
    });
  },

  onConfirmRenameGroup: function() {
    if (!this.data.canConfirmRenameGroup) return;
    
    const groupId = this.data.editingGroupId;
    const name = this.data.editingGroupName;
    
    wx.showLoading({ title: '更新中...' });
    
    api.updateGroup(groupId, { name })
      .then(res => {
        wx.hideLoading();
        wx.showToast({ title: '重命名成功', icon: 'success' });
        this.setData({ showRenameGroupDialog: false });
        this.loadGroups();
      })
      .catch(err => {
        wx.hideLoading();
        this.setData({ renameGroupError: err.message || '更新失败' });
      });
  },

  onOpenGroupActions: function(e) {
    const { id, name, protected: protectedRaw } = e.currentTarget.dataset || {};
    if (!id) return;
    const isProtected = protectedRaw === true || protectedRaw === 'true' || protectedRaw === 1 || protectedRaw === '1';
    if (isProtected) {
      wx.showToast({ title: '系统保护分组不可重命名或删除', icon: 'none' });
      return;
    }
    wx.showActionSheet({
      itemList: ['重命名分组', '删除分组'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.onShowRenameGroupDialog({ currentTarget: { dataset: { id, name } } });
          return;
        }
        if (res.tapIndex === 1) {
          this.onDeleteGroup({ currentTarget: { dataset: { id, name } } });
        }
      }
    });
  },

  // --- 删除分组 ---
  onDeleteGroup: function(e) {
    const { id, name } = e.currentTarget.dataset;

    this.setData({
      showDeleteGroupDialog: true,
      deleteGroupId: id,
      deleteGroupName: name || '',
      deleteRemoveFavorites: false
    });
  },

  onToggleDeleteRemoveFavorites: function() {
    this.setData({ deleteRemoveFavorites: !this.data.deleteRemoveFavorites });
  },

  onCancelDeleteGroupDialog: function() {
    this.setData({
      showDeleteGroupDialog: false,
      deleteGroupId: '',
      deleteGroupName: '',
      deleteRemoveFavorites: false
    });
  },

  onConfirmDeleteGroupDialog: function() {
    const groupId = this.data.deleteGroupId;
    if (!groupId) {
      this.onCancelDeleteGroupDialog();
      return;
    }

    const removeFavorites = this.data.deleteRemoveFavorites === true;
    const group = (this.data.customGroups || []).find(g => g && g.id === groupId);
    const memberCodes = logic.extractGroupMemberCodes(group);

    wx.showLoading({ title: '删除中...' });
    api.deleteGroup(groupId, { removeFavorites })
      .then(() => {
        wx.hideLoading();

        if (removeFavorites) {
          const storedFavorites = wx.getStorageSync('favorites') || [];
          const nextFavorites = logic.removeFavoritesByCodes(storedFavorites, memberCodes);
          wx.setStorageSync('favorites', nextFavorites);
        }

        this.setData({
          showDeleteGroupDialog: false,
          deleteGroupId: '',
          deleteGroupName: '',
          deleteRemoveFavorites: false
        });

        if (this.data.activeGroupId === groupId) {
          this.onSwitchGroup({ currentTarget: { dataset: { id: 'all' } } });
        } else {
          this.filterWatchlistByGroup(this.data.activeGroupId);
        }

        this.loadGroups({ silent: true });
        wx.showToast({ title: '已删除', icon: 'success' });
      })
      .catch(err => {
        wx.hideLoading();
        wx.showToast({ title: err.message || '删除失败', icon: 'none' });
      });
  },

  removeGroupFromItems: function(groupId) {
    let allItems = wx.getStorageSync('favorites') || [];
    const newItems = allItems.map(item => {
      if (item.groupIds && item.groupIds.includes(groupId)) {
        return {
          ...item,
          groupIds: item.groupIds.filter(gid => gid !== groupId)
        };
      }
      return item;
    });
    wx.setStorageSync('favorites', newItems);
  },
  // ==================== 分组功能逻辑结束 ====================

  // 初始化期权报价系统
  initPricingSystem: function() {
    this.pricingSystem = new OptionPricingSystem();
    this.pricingSystem.setUpdateCallback(() => {
      const raw = this.pricingSystem.getOptionQuotes({});
      const mapped = this.normalizeSystemQuotes(raw);
      this.setData({ optionQuotes: mapped, loading: false });
      this.applyFilters();
    });
    this.pricingSystem.setQuoteUpdateCallback((inquiry) => {
      this.setData({ loading: false });
    });
  },

  normalizeSystemQuotes: function(list) {
    const price = this.data.currentStock.price || this.data.currentStock.currentPrice || 1;
    const termDays = { '1个月': 30, '3个月': 90, '6个月': 180, '12个月': 365, '1年': 365 };
    return (list || []).map(item => {
      const termLabel = item.term === '12个月' ? '1年' : item.term;
      const days = termDays[termLabel] || termDays[item.term] || 30;
      const optionType = item.direction === '看涨' ? '看涨' : '看跌';
      const trader = item.trader ? { code: item.trader.code, name: item.trader.name } : { code: 'BEST', name: '最优报价' };
      const premiumPercent = ((Number(item.premium) / Number(price)) * 100).toFixed(2);
      return {
        id: item.id,
        optionType,
        expiryTerm: termLabel,
        expiryDays: days,
        strikePrice: Number(item.strikePrice),
        premium: Number(item.premium),
        premiumPercent,
        moneyness: this.getMoneyness((Number(item.strikePrice) / Number(price))),
        trader,
        bidPrice: (Number(item.premium) * 0.98).toFixed(2),
        askPrice: (Number(item.premium) * 1.02).toFixed(2),
        updateTime: new Date().toLocaleTimeString('zh-CN', { hour12: false })
      };
    });
  },

  // 加载期权报价数据
  loadOptionQuotes: function() {
    this.setData({ loading: true });
    
    const { currentStock } = this.data;
    const stockCode = currentStock.code.split('.')[0]; // 去掉后缀进行查询
    
    // 如果是“个股”模式，尝试从云数据库获取
    if (this.data.currentTab === '个股') {
      const db = wx.cloud.database();
      // 查询该股票的所有期权报价
      db.collection('quotes').where({
        stock_code: stockCode
      }).limit(100).get().then(res => {
        console.log('从云数据库获取到报价:', res.data);
        if (res.data && res.data.length > 0) {
           // 使用真实数据
           this.transformToMatrix(res.data);
        } else {
           // 降级使用模拟数据
           const quotes = this.generateRealisticQuotes(currentStock);
           this.transformToMatrix(quotes);
        }
        this.setData({ loading: false });
      }).catch(err => {
        console.error('获取期权报价失败:', err);
        const quotes = this.generateRealisticQuotes(currentStock);
        this.transformToMatrix(quotes);
        this.setData({ loading: false });
      });
    } else {
      const quotes = this.generateRealisticQuotes(currentStock);
      this.setData({
        optionQuotes: quotes,
        loading: false
      });
    }
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
  
  // 切换交易商 (组件回调)
  onTraderChangeFromComponent: function(e) {
    const { value, label } = e.detail;
    
    // 更新选中状态
    const traders = this.data.traders.map(trader => ({
      ...trader,
      isActive: trader.code === value
    }));
    
    this.setData({
      traders: traders,
      selectedTrader: label,
      selectedTraderCode: value
    });
    
    this.filterQuotesByTrader(value);
    
    wx.showToast({
      title: `已筛选${label}`,
      icon: 'success',
      duration: 1500
    });
  },

  // 切换交易商 (旧)
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
    this.goToSearchStock();
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
  
  // 打开下单弹窗
  openOrderModal: function(e) {
    const quote = e.currentTarget.dataset.quote;
    const { currentStock } = this.data;
    const typeCode = quote && quote.optionType === '看涨' ? 'C' : 'P';
    const termCode = this.getTermCode(quote);
    const structure = `${Math.round(quote.strikePrice)}${typeCode} - ${termCode}`;
    this.setData({
      currentQuote: quote,
      showOrderModal: true,
      orderForm: {
        direction: '买入',
        traderCode: quote.trader.code,
        traderName: quote.trader.name,
        underlying: `${currentStock.name} ${currentStock.code}`,
        structure,
        premiumPercent: String(quote.premiumPercent || ''),
        notional: 100,
        buyPrice: ''
      }
    });
  },

  getTermCode: function(quote) {
    const map = { '1个月': '1M', '3个月': '3M', '6个月': '6M', '1年': '1Y', '12个月': '1Y' };
    if (quote && quote.expiryTerm && map[quote.expiryTerm]) return map[quote.expiryTerm];
    const days = quote && quote.expiryDays;
    if (typeof days === 'number') {
      if (days <= 30) return '1M';
      if (days <= 90) return '3M';
      if (days <= 180) return '6M';
      if (days <= 365) return '1Y';
    }
    return quote && quote.expiryTerm ? quote.expiryTerm : '1M';
  },

  closeOrderModal: function() {
    this.setData({ showOrderModal: false });
  },

  updateOrderField: function(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    const form = { ...this.data.orderForm, [field]: value };
    this.setData({ orderForm: form });
  },

  changeDirection: function(e) {
    const dirs = ['买入','卖出'];
    const idx = e.detail.value;
    const form = { ...this.data.orderForm, direction: dirs[idx] };
    this.setData({ orderForm: form });
  },

  confirmForwardText: function() {
    const text = this.generateOrderTextFromForm(this.data.orderForm);
    this.generateForwardTextImage(text);
    this.setData({ showOrderModal: false });
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
    const item = e.currentTarget.dataset.item;
    
    // 如果处于编辑模式，点击行切换选中状态
    if (this.data.isEditing) {
      // 构造一个模拟事件对象传给 toggleSelection，或者直接调用逻辑
      // toggleSelection 需要 dataset.code
      const code = item.code;
      // 复用 toggleSelection 逻辑
      this.toggleSelection({ currentTarget: { dataset: { code } } });
      return;
    }

    if (item) {
       wx.showToast({
         title: '查看 ' + item.name,
         icon: 'none'
       });
       return;
    }
    const quote = e.currentTarget.dataset.quote;
    if (quote) {
       wx.showToast({
         title: '期权详情: ' + quote.id,
         icon: 'none'
       });
    }
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



  applyFilters: function() {
    let filteredQuotes = [...this.data.optionQuotes];
    const { optionType, timeToExpiry, moneyness } = this.data.filterOptions;
    const selectedTrader = this.data.selectedTrader;
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
    if (moneyness !== 'ALL') {
      filteredQuotes = filteredQuotes.filter(quote => quote.moneyness === moneyness);
    }
    if (selectedTrader && selectedTrader !== '全部交易商') {
      filteredQuotes = filteredQuotes.filter(quote => quote.trader && quote.trader.name === selectedTrader);
    }
    this.setData({ optionQuotes: filteredQuotes, loading: false });
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
  // onViewDetail 已合并到上文，移除此重复定义
  // onViewDetail: function(e) {
  //   const index = e.currentTarget.dataset.index;
  //   const item = this.data.pricingData[index];
  //   
  //   wx.navigateTo({
  //     url: '/pages/detail/detail?data=' + encodeURIComponent(JSON.stringify(item))
  //   });
  // },

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

  // 生成下单文本
  generateOrderText: function(quote) {
    const { currentStock } = this.data;
    const currentTime = new Date().toLocaleString('zh-CN');
    
    const orderText = `【场外期权询价】
标的：${currentStock.name} (${currentStock.code})
现价：${currentStock.price}元 (${currentStock.changePercent}%)
期权类型：${quote.optionType}
执行价：${quote.strikePrice}元
期限：${quote.expiryTerm}
期权费：${quote.premium}元 (${quote.premiumPercent}%)
交易商：${quote.trader.name}
询价时间：${currentTime}

注：以上报价仅供参考，具体以交易商确认为准。`;
    
    return orderText;
  },

  // 根据弹窗表单生成转发文本
  generateOrderTextFromForm: function(form) {
    const { currentStock } = this.data;
    const time = new Date().toLocaleString('zh-CN');
    const buyPriceText = form.buyPrice ? `${form.buyPrice}元` : '市价';
    const premiumAmount = (Number(form.notional) * Number(form.premiumPercent) / 100).toFixed(2);
    
    const text = `【场外期权下单】
标的资产：${form.underlying}
当前价格：${currentStock.price}元 (${currentStock.changePercent}%)
方向：${form.direction}
交易商：${form.traderName}
结构期限：${form.structure}
期权费率：${form.premiumPercent}%
预计期权费：${premiumAmount}万元
名义本金：${form.notional}万元
买入价格：${buyPriceText}
询价时间：${time}

注：以上报价仅供参考，具体以交易商确认为准。`;
    return text;
  },

  // 生成转发文本图片
  generateForwardTextImage: function(orderText) {
    const query = wx.createSelectorQuery();
    query.select('#forwardCanvas2d').node().exec((res) => {
      const node = res && res[0] && res[0].node;
      if (node) {
        const canvas = node;
        const w = 600;
        const h = 800;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 2;
        ctx.strokeRect(10, 10, w - 20, h - 20);
        ctx.font = '24px sans-serif';
        ctx.fillStyle = '#333333';
        ctx.textAlign = 'center';
        ctx.fillText('场外期权询价单', w / 2, 50);
        ctx.strokeStyle = '#ff6b35';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(50, 70);
        ctx.lineTo(w - 50, 70);
        ctx.stroke();
        ctx.font = '16px sans-serif';
        ctx.fillStyle = '#666666';
        ctx.textAlign = 'left';
        const lines = orderText.split('\n');
        let y = 100;
        lines.forEach((line) => { const t = String(line || '').trim(); if (t) { ctx.fillText(t, 30, y); y += 30; } });
        ctx.font = '14px sans-serif';
        ctx.fillStyle = '#999999';
        ctx.textAlign = 'center';
        ctx.fillText('长按识别二维码联系客服', w / 2, h - 60);
        ctx.fillText('专业场外期权服务', w / 2, h - 40);
        wx.canvasToTempFilePath({ canvas, success: (r) => { this.setData({ forwardImagePath: r.tempFilePath }); this.showForwardImagePreview(r.tempFilePath); }, fail: () => { wx.showToast({ title: '生成图片失败', icon: 'none' }); } });
      } else {
        const ctx = wx.createCanvasContext('forwardCanvas', this);
        const w = 600;
        const h = 800;
        ctx.setFillStyle('#ffffff');
        ctx.fillRect(0, 0, w, h);
        ctx.setStrokeStyle('#e0e0e0');
        ctx.setLineWidth(2);
        ctx.strokeRect(10, 10, w - 20, h - 20);
        ctx.setFontSize(24);
        ctx.setFillStyle('#333333');
        ctx.setTextAlign('center');
        ctx.fillText('场外期权询价单', w / 2, 50);
        ctx.setStrokeStyle('#ff6b35');
        ctx.setLineWidth(3);
        ctx.beginPath();
        ctx.moveTo(50, 70);
        ctx.lineTo(w - 50, 70);
        ctx.stroke();
        ctx.setFontSize(16);
        ctx.setFillStyle('#666666');
        ctx.setTextAlign('left');
        const lines = orderText.split('\n');
        let y = 100;
        lines.forEach((line) => { if (String(line || '').trim()) { ctx.fillText(String(line).trim(), 30, y); y += 30; } });
        ctx.setFontSize(14);
        ctx.setFillStyle('#999999');
        ctx.fillText('长按识别二维码联系客服', w / 2, h - 60);
        ctx.fillText('专业场外期权服务', w / 2, h - 40);
        ctx.draw(false, () => { wx.canvasToTempFilePath({ canvasId: 'forwardCanvas', success: (r) => { this.setData({ forwardImagePath: r.tempFilePath }); this.showForwardImagePreview(r.tempFilePath); }, fail: () => { wx.showToast({ title: '生成图片失败', icon: 'none' }); } }, this); });
      }
    });
  },

  // 显示转发图片预览
  showForwardImagePreview: function(imagePath) {
    wx.previewImage({
      urls: [imagePath],
      current: imagePath,
      success: () => {
        // 显示操作菜单
        wx.showActionSheet({
          itemList: ['保存图片', '发送给朋友', '复制文本'],
          success: (res) => {
            switch (res.tapIndex) {
              case 0:
                // 保存图片到相册
                this.saveForwardImage(imagePath);
                break;
              case 1:
                // 分享给朋友（通过小程序分享功能）
                this.shareForwardImage(imagePath);
                break;
              case 2:
                // 复制文本
                this.copyOrderText();
                break;
            }
          }
        });
      }
    });
  },

  // 保存转发图片
  saveForwardImage: function(imagePath) {
    wx.saveImageToPhotosAlbum({
      filePath: imagePath,
      success: () => {
        wx.showToast({
          title: '图片已保存到相册',
          icon: 'success'
        });
      },
      fail: () => {
        wx.showToast({
          title: '保存失败，请检查权限',
          icon: 'none'
        });
      }
    });
  },

  // 分享转发图片
  shareForwardImage: function(imagePath) {
    // 这里可以实现小程序的分享功能
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
    
    wx.showToast({
      title: '请点击右上角分享按钮',
      icon: 'none'
    });
  },

  // 复制订单文本
  copyOrderText: function() {
    const orderText = this.generateOrderText(this.data.currentQuote);
    
    wx.setClipboardData({
      data: orderText,
      success: () => {
        wx.showToast({
          title: '文本已复制',
          icon: 'success'
        });
      }
    });
  },

  // 从表单复制订单文本
  copyOrderTextFromForm: function() {
    const orderText = this.generateOrderTextFromForm(this.data.orderForm);
    
    wx.setClipboardData({
      data: orderText,
      success: () => {
        wx.showToast({
          title: '下单文本已复制',
          icon: 'success'
        });
        this.setData({ showOrderModal: false });
      }
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
  },

  // 跳转到搜索股票页面（添加自选）
  goToSearchStock: function() {
    const url = '/pages/search/search?source=quotes';
    wx.navigateTo({
      url,
      fail: () => {
        wx.redirectTo({
          url,
          fail: () => {
            wx.showToast({ title: '打开搜索页失败', icon: 'none' });
          }
        });
      }
    });
  },

  // 检查收藏状态
  checkFavoriteStatus: function() {
    const { currentStock } = this.data;
    if (!currentStock.code) return;
    
    // 获取现有收藏 (统一使用 INQUIRY_FAVORITES_V1)
    const favoritesMap = wx.getStorageSync(FAVORITES_STORAGE_KEY) || {};
    
    // 检查是否已收藏
    const isFavorited = !!favoritesMap[currentStock.code];
    
    this.setData({ isFavorited });
  },

  // 切换收藏状态
  toggleFavorite: function() {
    const { currentStock, isFavorited } = this.data;
    if (!currentStock.code) return;

    const favoritesMap = wx.getStorageSync(FAVORITES_STORAGE_KEY) || {};
    
    if (!isFavorited) {
      // 添加收藏
      favoritesMap[currentStock.code] = { 
        groupId: 'holding', // 默认分到持仓
        name: currentStock.name,
        code: currentStock.code,
        price: currentStock.price,
        changePercent: currentStock.changePercent,
        addedTime: Date.now()
      };
      wx.showToast({ title: '已添加到自选', icon: 'success' });
    } else {
      // 移除收藏
      delete favoritesMap[currentStock.code];
      wx.showToast({ title: '已从自选移除', icon: 'success' });
    }
    
    wx.setStorageSync(FAVORITES_STORAGE_KEY, favoritesMap);
    this.setData({ isFavorited: !isFavorited });
    
    // 同步更新旧的 'favorites' key 以保持兼容
    this.syncToOldFavorites(favoritesMap);
  },

  // 同步到旧的数组格式存储，保持向下兼容
  syncToOldFavorites: function(map) {
    const list = Object.keys(map).map(id => ({
      id,
      ...map[id]
    }));
    wx.setStorageSync('favorites', list);
  },

  // === 新增交互方法 ===
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
    
    // 如果切换出自选Tab，取消编辑模式
    if (tab !== '自选' && this.data.isEditing) {
      this.cancelEditing();
    }

    // 如果切换到个股Tab，加载热门个股数据
    if (tab === '个股') {
      this.loadHotStocks();
    }

    // 如果切换到指数Tab，加载指数数据
    if (tab === '指数') {
      this.loadIndexData();
    }

    // 如果切换到ETFTab，加载ETF数据
    if (tab === 'ETF') {
      this.loadEtfData();
    }
  },
  onSubFilterChange(e) {
    this.setData({ subFilter: e.currentTarget.dataset.filter });
  }
});
