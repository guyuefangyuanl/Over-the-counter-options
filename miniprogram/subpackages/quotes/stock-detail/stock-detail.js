/**
 * 股票标的详情页面 - 优化版
 * 
 * 改进点：
 * 1. 使用数据管理器统一管理数据加载
 * 2. 智能缓存与请求去重
 * 3. 下拉刷新支持
 * 4. 改进的Canvas 2D API图片生成
 * 5. 更好的加载状态和错误处理
 * 6. 收藏功能优化
 */

const OptionPricingSystem = require('../../../utils/option-pricing.js');
const api = require('../../../utils/api.js');
const { submitInquiry } = require('../../../utils/inquiryService.js');
const { FAVORITES_STORAGE_KEY, CUSTOM_GROUPS_STORAGE_KEY } = require('../../../utils/storage-keys.js');
const favoritesService = require('../../../utils/favoritesService.js');
const { quotesDataManager, QUOTES_TTL } = require('../../../utils/quotes-data-manager.js');

Page({
  data: {
    // 股票基本信息
    stock: {
      name: '平安银行',
      code: '000001.SZ',
      price: '11.36',
      change: 0.07,
      changePercent: '0.61'
    },
    
    // 收藏状态
    isFavorite: false,
    showFavTooltip: false,
    
    // 搜索
    searchKeyword: '',

    // 筛选器（日期动态生成）
    dateRange: ['请选择', (() => {
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `${now.getFullYear()}-${month}-${day}`;
    })(), (() => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const month = String(yesterday.getMonth() + 1).padStart(2, '0');
      const day = String(yesterday.getDate()).padStart(2, '0');
      return `${yesterday.getFullYear()}-${month}-${day}`;
    })()],
    selectedDateIndex: 0,
    selectedDate: '请选择',
    // 交易商使用缩写
    traderRange: ['请选择', '最优报价', 'ZXZZ', 'HTCC', 'YHRD', 'YAZB'],
    selectedTraderIndex: 0,
    selectedTrader: '请选择',
    
    // Tab切换
    activeTab: 'vanilla',
    terms: ['2W', '1M', '2M', '3M', '6M', '12M'],
    matrixData: [],
    
    // 导航栏
    statusBarHeight: 20,
    navBarHeight: 44,
    
    // 弹窗状态
    showOrderModal: false,
    showGreeks: true,
    showPreviewModal: false,
    previewImage: '',
    
    // 下单表单
    orderForm: {
      direction: '买入',
      trader: 'ZXZZ', // 使用交易商缩写
      strike: '',
      term: '',
      rate: '',
      notional: 100,
      price: '',
      contactPhone: '' // 联系电话（必填）
    },
    
    // === 新增：加载和刷新状态 ===
    loading: false,
    isPullRefreshing: false,
    loadError: null,
    lastUpdateTime: '',
    
    // === 新增：动画状态 ===
    favAnimClass: '',
    cellHighlightMap: {},  // 点击高亮效果
    
    // === 新增：询价增强功能 ===
    showInquiryFromSearch: false,  // 是否从搜索页询价入口进入
    // 行权价类型预设（与报价矩阵对应）
    strikePriceTypes: [
      { value: 'atm', label: '平值(100%)', strike: 100 },
      { value: 'otm105', label: '虚值105%', strike: 105 },
      { value: 'otm110', label: '虚值110%', strike: 110 },
      { value: 'itm95', label: '实值95%', strike: 95 },
      { value: 'itm90', label: '实值90%', strike: 90 }
    ]
  },

  onLoad(options) {
    // 获取系统信息
    const windowInfo = wx.getWindowInfo();
    this.setData({
      statusBarHeight: windowInfo.statusBarHeight,
      navBarHeight: 44
    });

    console.log('[股票详情] 接收参数:', options);

    // 解析跳转参数
    if (options.code) {
      const code = decodeURIComponent(options.code || '');
      const name = options.name ? decodeURIComponent(options.name) : '未知股票';
      const price = options.price || '--';
      const change = parseFloat(options.change || 0);
      const changePercent = options.changePercent || '0.00';

      console.log('[股票详情] 解码后参数:', { code, name, price, changePercent });

      this.setData({
        stock: { code, name, price, change, changePercent }
      });
    }

    // 检查收藏状态
    this.checkFavoriteStatus();
    
    // 检查是否从询价入口进入（搜索页询价来源）
    if (options.showInquiry === '1') {
      console.log('[股票详情] 从询价入口进入，将自动弹出询价弹窗');
      this.setData({ showInquiryFromSearch: true });
    }
    
    // 加载期权矩阵数据
    this.loadOptionMatrix();
    
    // 启动矩阵自动刷新（60秒间隔）
    this._startMatrixAutoRefresh();
  },
  
  onShow() {
    // 页面显示时重新检查收藏状态
    this.checkFavoriteStatus();
    
    // 如果矩阵刷新已停止，重新启动
    if (!quotesDataManager.isMatrixAutoRefreshing()) {
      this._startMatrixAutoRefresh();
    }
  },
  
  onHide() {
    // 页面隐藏时停止自动刷新以节省资源
    this._stopMatrixAutoRefresh();
  },
  
  onUnload() {
    // 清理资源
    this._clearHighlightTimers();
    
    // 停止矩阵自动刷新
    this._stopMatrixAutoRefresh();
  },
  
  // 启动矩阵自动刷新
  _startMatrixAutoRefresh() {
    const { stock } = this.data;
    quotesDataManager.startMatrixAutoRefresh(
      stock,
      (result) => {
        if (result && result.data) {
          this.setData({
            matrixData: result.data,
            lastUpdateTime: quotesDataManager.formatUpdateTime(Date.now())
          });
        }
      },
      60000 // 60秒刷新间隔
    );
  },
  
  // 停止矩阵自动刷新
  _stopMatrixAutoRefresh() {
    quotesDataManager.stopMatrixAutoRefresh();
  },
  
  // 清理高亮定时器
  _clearHighlightTimers() {
    if (this._highlightTimers) {
      this._highlightTimers.forEach(timer => clearTimeout(timer));
      this._highlightTimers = null;
    }
  },

  // ==================== 收藏功能 ====================

  checkFavoriteStatus() {
    const isFavorite = favoritesService.isFavorite(this.data.stock.code);
    this.setData({ isFavorite });
  },

  /**
   * 切换收藏状态（优化版）
   * 添加动画效果和更好的交互体验
   */
  toggleFavorite() {
    const { stock, isFavorite } = this.data;

    if (isFavorite) {
      // 移除收藏
      wx.showModal({
        title: '移除确认',
        content: `确定要将 ${stock.name} 从自选移除吗？\n移除后可在回收站恢复（7天内）`,
        confirmText: '移除',
        confirmColor: '#ff4d4f',
        success: (res) => {
          if (res.confirm) {
            const result = favoritesService.removeFavorite(stock.code, { useRecycleBin: true });
            if (result.success) {
              // 添加移除动画
              this.setData({ 
                isFavorite: false, 
                favAnimClass: 'fav-remove-anim' 
              });
              
              setTimeout(() => {
                this.setData({ favAnimClass: '' });
              }, 300);
              
              wx.showToast({
                title: result.message,
                icon: 'success',
                duration: 2000
              });
            } else {
              wx.showToast({
                title: result.message || '移除失败',
                icon: 'none'
              });
            }
          }
        }
      });
    } else {
      // 添加收藏
      this._showAddFavoriteSheet(stock);
    }
  },
  
  /**
   * 显示添加收藏的选择面板
   * @private
   */
  _showAddFavoriteSheet(stock) {
    // 自动归类逻辑
    let defaultGroupId = 'all';
    const code = stock.code;
    if (code.startsWith('60') || code.startsWith('00') || code.startsWith('30')) {
      defaultGroupId = 'hs';
    }

    // 加载可用分组
    const customGroups = wx.getStorageSync(CUSTOM_GROUPS_STORAGE_KEY) || [];
    const groups = [
      { id: 'all', name: '全部' },
      { id: 'hs', name: '沪深' },
      { id: 'holding', name: '我的持仓' },
      ...customGroups
    ];

    const itemList = groups.map(g => `移动到: ${g.name}`);

    const executeAdd = (selectedGroupId) => {
      const success = favoritesService.addFavorite({
        code: stock.code,
        name: stock.name,
        price: stock.price,
        changePercent: stock.changePercent,
        groupId: selectedGroupId
      });
      
      if (success) {
        // 添加成功动画
        this.setData({ 
          isFavorite: true, 
          favAnimClass: 'fav-add-anim' 
        });
        
        setTimeout(() => {
          this.setData({ favAnimClass: '' });
        }, 300);
        
        wx.showToast({ title: '已添加到自选', icon: 'success' });
      } else {
        wx.showToast({ title: '添加失败或已存在', icon: 'none' });
      }
    };

    wx.showActionSheet({
      itemList: itemList,
      success: (res) => {
        executeAdd(groups[res.tapIndex].id);
      },
      fail: () => {
        // 用户取消时使用默认分组
        executeAdd(defaultGroupId);
      }
    });
  },

  // ==================== 数据加载 ====================

  /**
   * 加载期权矩阵数据（优化版）
   * 使用数据管理器进行缓存和请求管理
   */
  async loadOptionMatrix(forceRefresh = false) {
    const { stock, selectedTrader } = this.data;
    
    if (!stock || !stock.code) {
      this.setData({ loadError: '股票信息不完整' });
      return;
    }
    
    this.setData({ loading: true, loadError: null });
    
    try {
      // 使用数据管理器加载矩阵数据
      const result = await quotesDataManager.loadStockDetailMatrix(stock, {
        forceRefresh,
        trader: selectedTrader === '请选择' ? 'ALL' : selectedTrader
      });
      
      if (result && result.data) {
        this.setData({
          matrixData: result.data,
          lastUpdateTime: quotesDataManager.formatUpdateTime(Date.now()),
          loading: false
        });
        
        // 检查是否需要自动弹出询价弹窗
        this._checkAndShowInquiryPopup();
        
        // 如果是降级数据，显示提示
        if (result.fallback) {
          wx.showToast({
            title: '使用参考数据',
            icon: 'none',
            duration: 2000
          });
        }
      } else {
        throw new Error('数据加载失败');
      }
    } catch (error) {
      console.error('[股票详情] 加载矩阵失败:', error);
      
      // 生成模拟数据作为降级方案
      const mockMatrix = this._generateMockMatrix(stock);
      this.setData({
        matrixData: mockMatrix,
        loading: false,
        loadError: '加载失败，显示参考数据'
      });
      
      wx.showToast({
        title: '加载失败，显示参考数据',
        icon: 'none',
        duration: 2000
      });
    }
  },
  
  /**
   * 生成模拟期权矩阵（降级方案）
   * @private
   */
  _generateMockMatrix(stock) {
    const strikes = ['100C', '103C', '105C', '110C', '90C', '95C'];
    const terms = this.data.terms;
    
    // 基于股票价格生成相对合理的期权费率
    const basePrice = parseFloat(stock.price) || 50;
    const volatility = 0.25 + Math.random() * 0.15;
    
    return strikes.map(strike => {
      const strikeMultiplier = parseFloat(strike.replace(/[CP]/, '')) / 100;
      const row = { strike, values: [] };
      
      terms.forEach(term => {
        const termDays = this._getTermDays(term);
        const T = termDays / 365;
        
        // 简化的期权费率计算
        let baseRate = volatility * Math.sqrt(T) * 0.4;
        if (strikeMultiplier > 1) {
          baseRate *= (1 - (strikeMultiplier - 1) * 0.3);
        } else if (strikeMultiplier < 1) {
          baseRate *= (1 + (1 - strikeMultiplier) * 0.5);
        }
        
        const value = `${(baseRate * 100).toFixed(2)}%`;
        row.values.push({ term, value });
      });
      
      return row;
    });
  },
  
  /**
   * 获取期限对应天数
   * @private
   */
  _getTermDays(term) {
    const map = {
      '2W': 14, '1M': 30, '2M': 60,
      '3M': 90, '6M': 180, '12M': 365
    };
    return map[term] || 30;
  },

  // ==================== 下拉刷新 ====================

  /**
   * 下拉刷新
   */
  async onPullDownRefresh() {
    this.setData({ isPullRefreshing: true });
    
    try {
      await this.loadOptionMatrix(true);
      wx.showToast({ title: '数据已更新', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: '刷新失败', icon: 'none' });
    } finally {
      this.setData({ isPullRefreshing: false });
      wx.stopPullDownRefresh();
    }
  },

  // ==================== 交互事件 ====================

  /**
   * 返回按钮点击事件
   * 优先返回上一页面，若无历史则跳转到报价页
   */
  onBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      // 有上一级页面，直接返回
      wx.navigateBack();
    } else {
      // 无上一级页面，跳转到报价页（Tab页面）
      wx.switchTab({ url: '/pages/quotes/quotes' });
    }
  },

  goToSearch() {
    wx.navigateTo({ url: '/subpackages/quotes/search/search' });
  },

  onClearSearch() {
    this.setData({ searchKeyword: '' });
  },

  onDateChange(e) {
    const idx = e.detail.value;
    this.setData({
      selectedDateIndex: idx,
      selectedDate: this.data.dateRange[idx]
    });
    this.loadOptionMatrix(true);
  },

  onTraderChange(e) {
    const idx = e.detail.value;
    this.setData({
      selectedTraderIndex: idx,
      selectedTrader: this.data.traderRange[idx]
    });
    this.loadOptionMatrix(true);
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    this.loadOptionMatrix();
  },

  /**
   * 点击矩阵单元格
   * 添加点击高亮效果
   */
  onCellTap(e) {
    const { strike, term } = e.currentTarget.dataset;
    const row = this.data.matrixData.find(r => r.strike === strike);
    const cell = row ? row.values.find(v => v.term === term) : null;
    
    if (!cell || cell.value === '--') return;

    // 添加点击高亮效果
    const cellKey = `${strike}_${term}`;
    this.setData({
      [`cellHighlightMap.${cellKey}`]: true
    });
    
    // 延迟移除高亮
    this._highlightTimers = this._highlightTimers || [];
    this._highlightTimers.push(setTimeout(() => {
      this.setData({
        [`cellHighlightMap.${cellKey}`]: false
      });
    }, 200));

    // 尝试从存储中获取用户手机号作为默认值
    const storedUserInfo = wx.getStorageSync('userInfo') || {};
    const loginService = require('../../../utils/loginService.js');
    const currentUser = loginService.getCurrentUser() || {};
    const defaultPhone = storedUserInfo.phone || currentUser.phone || '';

    this.setData({
      showOrderModal: true,
      orderForm: {
        direction: '买入',
        trader: this.data.selectedTrader || 'ZJGJ',
        strike,
        term,
        rate: cell.value.replace('%', ''),
        notional: 100,
        price: '',
        contactPhone: defaultPhone
      }
    });
  },

  closeOrderModal() {
    this.setData({ showOrderModal: false });
  },

  onDirectionChange(e) {
    const directions = ['买入', '卖出'];
    this.setData({ 'orderForm.direction': directions[e.detail.value] });
  },

  onRateInput(e) {
    this.setData({ 'orderForm.rate': e.detail.value });
  },

  onNotionalInput(e) {
    this.setData({ 'orderForm.notional': e.detail.value });
  },

  onPriceInput(e) {
    this.setData({ 'orderForm.price': e.detail.value });
  },

  onContactPhoneInput(e) {
    this.setData({ 'orderForm.contactPhone': e.detail.value });
  },

  // ==================== 图片生成（Canvas 2D API）====================

  // ==================== 表单校验 ====================

  /**
   * 校验下单表单
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  _validateOrderForm() {
    const { orderForm, stock } = this.data;
    const errors = [];

    // 1. 方向校验
    if (!orderForm.direction || !['买入', '卖出'].includes(orderForm.direction)) {
      errors.push('请选择买卖方向');
    }

    // 2. 交易商校验
    if (!orderForm.trader || orderForm.trader === '请选择') {
      errors.push('请选择交易商');
    }

    // 3. 标的资产校验
    if (!stock || !stock.code) {
      errors.push('标的资产信息不完整');
    }

    // 4. 结构期限校验
    if (!orderForm.strike) {
      errors.push('请选择期权结构');
    }
    if (!orderForm.term) {
      errors.push('请选择期限');
    }

    // 5. 期权费率校验
    const rate = parseFloat(orderForm.rate);
    if (isNaN(rate)) {
      errors.push('期权费率格式错误');
    } else if (rate <= 0) {
      errors.push('期权费率必须大于0');
    } else if (rate > 100) {
      errors.push('期权费率不能超过100%');
    }

    // 6. 名义本金校验（必填）
    const notional = parseFloat(orderForm.notional);
    if (!orderForm.notional || orderForm.notional.toString().trim() === '') {
      errors.push('名义本金为必填项');
    } else if (isNaN(notional)) {
      errors.push('名义本金格式错误');
    } else if (notional < 1) {
      errors.push('名义本金不能小于1万元');
    } else if (notional > 100000) {
      errors.push('名义本金不能超过10亿元');
    }

    // 7. 买入价格校验（可选，但如果填写需校验格式）
    if (orderForm.price && orderForm.price.toString().trim() !== '') {
      const price = parseFloat(orderForm.price);
      if (isNaN(price)) {
        errors.push('买入价格格式错误');
      } else if (price <= 0) {
        errors.push('买入价格必须大于0');
      } else if (price > 100000) {
        errors.push('买入价格超出合理范围');
      }
    }

    // 8. 联系电话校验（必填）
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!orderForm.contactPhone || orderForm.contactPhone.trim() === '') {
      errors.push('联系电话为必填项');
    } else if (!phoneRegex.test(orderForm.contactPhone.trim())) {
      errors.push('联系电话格式不正确（需为11位手机号）');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  },

  /**
   * 显示校验错误
   * @param {string[]} errors 错误列表
   */
  _showValidationErrors(errors) {
    wx.showModal({
      title: '信息填写不完整',
      content: errors.join('\n'),
      showCancel: false,
      confirmText: '去修改'
    });
  },

  /**
   * 提交询价并生成分享图片（带校验）
   */
  async copyOrderText() {
    // 表单校验
    const validation = this._validateOrderForm();
    if (!validation.valid) {
      this._showValidationErrors(validation.errors);
      return;
    }

    const { stock, orderForm } = this.data;
    const priceText = orderForm.price ? `${orderForm.price}元` : '市价';
    const text = `【期权询价申请】
方向: ${orderForm.direction}
交易商: ${orderForm.trader}
标的资产: ${stock.name} ${stock.code}
结构期限: ${orderForm.strike} - ${orderForm.term}
期权费率: ${orderForm.rate}%
名义本金: ${orderForm.notional}万元
买入价格: ${priceText}
申请时间: ${new Date().toLocaleString()}`;

    wx.setClipboardData({
      data: text,
      success: () => {
        // 先提交询价数据
        this.submitInquiryToDatabase();
        // 生成分享图片
        this.generateOrderImageWithCanvas2D();
      }
    });
  },

  /**
   * 使用 Canvas 2D API 生成订单图片（新版API）
   * 解决旧版Canvas API在某些机型上的兼容性问题
   */
  async generateOrderImageWithCanvas2D() {
    wx.showLoading({ title: '生成图片中...' });
    
    try {
      const { stock, orderForm } = this.data;
      const dateStr = new Date().toLocaleDateString();
      
      // 获取 Canvas 2D 上下文
      const query = wx.createSelectorQuery();
      const res = await new Promise((resolve, reject) => {
        query.select('#orderCanvas2d')
          .fields({ node: true, size: true })
          .exec((res) => {
            if (res && res[0] && res[0].node) {
              resolve(res[0]);
            } else {
              reject(new Error('Canvas节点获取失败'));
            }
          });
      });
      
      const canvas = res.node;
      const ctx = canvas.getContext('2d');
      
      // 设置画布尺寸
      const dpr = wx.getWindowInfo().pixelRatio;
      canvas.width = 375 * dpr;
      canvas.height = 500 * dpr;
      ctx.scale(dpr, dpr);
      
      // 绘制背景
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 375, 500);
      
      // 绘制标题栏
      const headerColor = orderForm.direction === '买入' ? '#6fb2f9' : '#ff3b30';
      ctx.fillStyle = headerColor;
      ctx.fillRect(0, 0, 375, 50);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = '18px sans-serif';
      ctx.fillText(orderForm.direction, 20, 32);
      ctx.fillText(dateStr, 250, 32);
      
      // 绘制表格内容
      let currentY = 50;
      const drawRow = (y, label, value) => {
        ctx.strokeStyle = '#eeeeee';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(375, y);
        ctx.stroke();
        
        ctx.fillStyle = '#333333';
        ctx.font = '16px sans-serif';
        ctx.fillText(label, 20, y + 30);
        
        ctx.fillStyle = '#666666';
        ctx.fillText(value, 120, y + 30);
        
        ctx.beginPath();
        ctx.moveTo(110, y);
        ctx.lineTo(110, y + 50);
        ctx.stroke();
      };
      
      drawRow(currentY, '交易商', orderForm.trader);
      currentY += 50;
      drawRow(currentY, '标的资产', `${stock.name} ${stock.code}`);
      currentY += 50;
      drawRow(currentY, '结构期限', `${orderForm.strike} - ${orderForm.term}`);
      currentY += 50;
      drawRow(currentY, '期权费率', `${orderForm.rate} %`);
      currentY += 50;
      drawRow(currentY, '名义本金', `${orderForm.notional} 万`);
      currentY += 50;
      drawRow(currentY, '买入价格', orderForm.price ? `${orderForm.price}元` : '市价');
      currentY += 50;
      
      // 绘制底部色块
      ctx.fillStyle = headerColor;
      ctx.fillRect(0, currentY, 375, 50);
      
      // 生成图片
      wx.canvasToTempFilePath({
        canvas: canvas,
        success: (res) => {
          wx.hideLoading();
          this.setData({
            previewImage: res.tempFilePath,
            showPreviewModal: true,
            showOrderModal: false
          });
        },
        fail: (err) => {
          console.error('Canvas转图片失败:', err);
          wx.hideLoading();
          wx.showToast({ title: '图片生成失败', icon: 'none' });
        }
      });
    } catch (error) {
      console.error('生成图片失败:', error);
      wx.hideLoading();
      wx.showToast({ title: '图片生成失败', icon: 'none' });
    }
  },

  /**
   * 提交询价数据到云数据库
   */
  submitInquiryToDatabase() {
    const { stock, orderForm } = this.data;

    const storedUserInfo = wx.getStorageSync('userInfo') || {};
    const loginService = require('../../../utils/loginService.js');
    const currentUser = loginService.getCurrentUser() || {};

    // 解析 strike 字符串，提取期权类型和行权价
    const strikeStr = orderForm.strike || '';
    let optionType = 'call';
    let strikePrice = '100';
    if (strikeStr.includes('C')) {
      optionType = 'call';
      strikePrice = strikeStr.replace('C', '');
    } else if (strikeStr.includes('P')) {
      optionType = 'put';
      strikePrice = strikeStr.replace('P', '');
    }

    // 构造符合后端 API 期望的数据结构
    const submitData = {
      // 产品信息
      selectedProduct: { name: stock.name, code: stock.code, type: 'stock' },
      productName: stock.name,
      productCode: stock.code,

      // 询价参数
      optionType,
      structure: 'vanilla',
      term: orderForm.term || '1M',
      notionalAmount: parseFloat(orderForm.notional) || 100,
      strikePrice,
      selectedDealers: [orderForm.trader || 'ZJGJ'],

      // 联系信息（优先使用表单输入，其次使用存储的用户信息）
      contactName: storedUserInfo.nickName || currentUser.nickName || '转发用户',
      contactPhone: orderForm.contactPhone || storedUserInfo.phone || currentUser.phone || '',
      contactEmail: storedUserInfo.email || currentUser.email || '',
      notes: `通过转发下单图片提交 - ${orderForm.direction}`,

      // 来源标记
      source: 'miniprogram_stock_detail'
    };

    console.log('提交询价数据:', submitData);

    submitInquiry(submitData).then(result => {
      console.log('询价数据提交成功，ID:', result.data?.id || result.data?.inquiryId);
      wx.showToast({ title: '询价已提交', icon: 'success' });
    }).catch(err => {
      console.error('询价数据提交失败:', err);
      wx.showToast({ title: err.message || '提交失败', icon: 'none' });
    });
  },

  copyOrderTextOnly() {
    const { stock, orderForm } = this.data;
    const priceText = orderForm.price ? `${orderForm.price}元` : '市价';
    const text = `【下单申请】
方向: ${orderForm.direction}
交易商: ${orderForm.trader}
标的资产: ${stock.name} ${stock.code}
结构期限: ${orderForm.strike} - ${orderForm.term}
期权费率: ${orderForm.rate}%
名义本金: ${orderForm.notional}万元
买入价格: ${priceText}
申请时间: ${new Date().toLocaleString()}`;

    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: '文本已复制', icon: 'success' });
      }
    });
  },

  onShareAppMessage() {
    return {
      title: `${this.data.orderForm.direction}申请: ${this.data.stock.name}`,
      path: `/subpackages/quotes/stock-detail/stock-detail?code=${this.data.stock.code}`,
      imageUrl: this.data.previewImage
    };
  },

  saveImage() {
    wx.saveImageToPhotosAlbum({
      filePath: this.data.previewImage,
      success: () => {
        wx.showToast({ title: '已保存到相册', icon: 'success' });
      },
      fail: (err) => {
        console.error('保存图片失败:', err);
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    });
  },

  closePreviewModal() {
    this.setData({ showPreviewModal: false });
  },

  goCalculator() {
    wx.navigateTo({ url: '/pages/calculator/calculator' });
  },

  goWorkspace() {
    wx.switchTab({ url: '/pages/workspace/workspace' });
  },

  onContactService() {
    wx.showActionSheet({
      itemList: ['在线客服', '拨打电话'],
      success: (res) => {
        if (res.tapIndex === 1) {
          wx.makePhoneCall({ phoneNumber: '400-123-4567' });
        }
      }
    });
  },

  // ==================== 询价增强功能 ====================

  /**
   * 自动弹出询价弹窗（从搜索页询价入口进入时调用）
   * 在矩阵数据加载完成后检查并触发
   */
  _checkAndShowInquiryPopup() {
    if (this.data.showInquiryFromSearch && this.data.matrixData.length > 0) {
      setTimeout(() => {
        this.setData({ showInquiryFromSearch: false });
        // 自动弹出询价弹窗，默认选中第一个结构
        const firstStrike = this.data.matrixData[0]?.strike || '100C';
        const firstTerm = this.data.terms[0] || '1M';
        const firstValue = this.data.matrixData[0]?.values[0]?.value?.replace('%', '') || '';

        // 尝试获取用户手机号作为默认值
        const storedUserInfo = wx.getStorageSync('userInfo') || {};
        const loginService = require('../../../utils/loginService.js');
        const currentUser = loginService.getCurrentUser() || {};
        const defaultPhone = storedUserInfo.phone || currentUser.phone || '';

        this.setData({
          showOrderModal: true,
          orderForm: {
            direction: '买入',
            trader: this.data.selectedTrader || '最优报价',
            strike: firstStrike,
            term: firstTerm,
            rate: firstValue,
            notional: 100,
            price: '',
            contactPhone: defaultPhone
          }
        });
      }, 500);
    }
  },

  /**
   * 跳转到完整询价表单页
   * 携带当前选中的标的和报价参数
   */
  goToFullInquiry() {
    const { stock, orderForm } = this.data;
    
    const product = {
      code: stock.code,
      name: stock.name,
      price: stock.price,
      type: 'stock'
    };
    
    const params = {
      optionType: orderForm.strike?.includes('P') ? 'put' : 'call',
      term: orderForm.term,
      strikePrice: orderForm.strike?.replace(/[CP]/, '') || '100',
      structure: this.data.activeTab || 'vanilla',
      rate: orderForm.rate
    };
    
    // 设置全局询价上下文
    const app = getApp();
    app.globalData.inquiryContext = {
      selectedProduct: product,
      presetParams: params,
      fromSearchInquiry: true
    };
    
    wx.navigateTo({
      url: `/subpackages/inquiry/inquiry/inquiry?product=${encodeURIComponent(JSON.stringify(product))}`
    });
  },

  /**
   * 查看询价历史
   */
  goToInquiryHistory() {
    wx.navigateTo({
      url: '/subpackages/user/inquiry-history/inquiry-history'
    });
  },

  stopBubble() {}
});