const OptionPricingSystem = require('../../utils/option-pricing.js');
const api = require('../../utils/api.js');

const FAVORITES_STORAGE_KEY = 'INQUIRY_FAVORITES_V1';
const CUSTOM_GROUPS_STORAGE_KEY = 'INQUIRY_CUSTOM_GROUPS_V1';

Page({
  data: {
    stock: {
      name: '平安银行',
      code: '000001.SZ',
      price: '11.36',
      change: 0.07,
      changePercent: '0.61'
    },
    isFavorite: false,
    showFavTooltip: false,
    searchKeyword: '',
    dateRange: ['请选择', '2024-12-19', '2024-12-18'],
    selectedDateIndex: 0,
    selectedDate: '请选择',
    traderRange: ['请选择', '最优报价', '中信证券', '华泰财富', '银河瑞德', '亚洲证券'],
    selectedTraderIndex: 0,
    selectedTrader: '请选择',
    activeTab: 'vanilla',
    terms: ['2W', '1M', '2M', '3M', '6M', '12M'],
    matrixData: [],
    statusBarHeight: 20,
    navBarHeight: 44,
    showOrderModal: false,
    showGreeks: true,
    orderForm: {
      direction: '买入',
      trader: 'ZJGJ',
      strike: '',
      term: '',
      rate: '',
      notional: 100,
      price: ''
    },
    showPreviewModal: false,
    previewImage: ''
  },

  onLoad(options) {
    const windowInfo = wx.getWindowInfo();
    this.setData({
      statusBarHeight: windowInfo.statusBarHeight,
      navBarHeight: 44
    });

    if (options.code) {
      const code = options.code;
      const name = options.name ? decodeURIComponent(options.name) : '平安银行';
      const price = options.price || '11.36';
      const change = parseFloat(options.change || 0.61);
      const changePercent = options.changePercent || '5.68';

      this.setData({
        stock: {
          code,
          name,
          price,
          change,
          changePercent
        }
      });
    }

    this.checkFavoriteStatus();
    this.fetchQuotesFromCloud();
  },

  checkFavoriteStatus() {
    const favoritesMap = wx.getStorageSync(FAVORITES_STORAGE_KEY) || {};
    const isFavorite = !!favoritesMap[this.data.stock.code];
    this.setData({ isFavorite });
  },

  toggleFavorite() {
    const { stock, isFavorite } = this.data;
    const favoritesMap = wx.getStorageSync(FAVORITES_STORAGE_KEY) || {};
    
    if (isFavorite) {
      // 移除收藏
      delete favoritesMap[stock.code];
      wx.setStorageSync(FAVORITES_STORAGE_KEY, favoritesMap);
      this.syncToOldFavorites(favoritesMap);
      this.setData({ isFavorite: false });
      wx.showToast({ 
        title: '已从自选移除', 
        icon: 'none', 
        duration: 3000 
      });
    } else {
      // 添加收藏逻辑
      // 1. 自动归类逻辑
      let defaultGroupId = 'all';
      const code = stock.code;
      if (code.startsWith('60') || code.startsWith('00') || code.startsWith('30')) {
        defaultGroupId = 'hs'; // 归类到沪深
      }

      // 2. 加载可用分组
      const customGroups = wx.getStorageSync(CUSTOM_GROUPS_STORAGE_KEY) || [];
      const groups = [
        { id: 'all', name: '全部' },
        { id: 'hs', name: '沪深' },
        { id: 'holding', name: '我的持仓' },
        ...customGroups
      ];

      // 弹出分组选择（模拟编辑分组弹窗）
      const itemList = groups.map(g => `移动到: ${g.name}`);
      
      const executeAdd = (selectedGroupId) => {
        favoritesMap[stock.code] = {
          groupId: selectedGroupId,
          name: stock.name,
          code: stock.code,
          price: stock.price,
          changePercent: stock.changePercent,
          addedTime: Date.now()
        };
        wx.setStorageSync(FAVORITES_STORAGE_KEY, favoritesMap);
        this.syncToOldFavorites(favoritesMap);
        this.setData({ isFavorite: true });
        wx.showToast({ title: '已添加到自选', icon: 'success' });
      };

      wx.showActionSheet({
        itemList: itemList,
        success: (res) => {
          executeAdd(groups[res.tapIndex].id);
        },
        fail: () => {
          // 用户取消 ActionSheet 时，使用默认的自动归类分组
          executeAdd(defaultGroupId);
        }
      });
    }
  },

  // 同步到旧的数组格式存储，保持向下兼容
  syncToOldFavorites(map) {
    const list = Object.keys(map).map(id => ({
      ...map[id],
      id: id
    }));
    wx.setStorageSync('favorites', list);
  },

  fetchQuotesFromCloud() {
    wx.showLoading({ title: '加载中...' });
    const db = wx.cloud.database();
    const { stock, selectedDate, selectedTrader } = this.data;

    db.collection('quotes').where({
      code: stock.code
    }).get().then(res => {
      wx.hideLoading();
      if (res.data && res.data.length > 0) {
        this.processQuotes(res.data);
      } else {
        // 没数据则生成模拟数据
        this.generateMockMatrix();
      }
    }).catch(err => {
      console.error('云函数调用失败', err);
      wx.hideLoading();
      this.generateMockMatrix();
    });
  },

  processQuotes(data) {
    // 这里根据云端返回的数据结构转换为矩阵
    // 假设数据是一个数组，每个元素包含 strike, term, premiumPercent, delta 等
    this.generateMockMatrix(); // 暂时用模拟逻辑，等确定结构再改
  },

  generateMockMatrix() {
    const strikes = ['100C', '103C', '105C', '110C', '80C', '90C', '95C', '8080', '9090', '9070'];
    const terms = this.data.terms;
    
    // 模拟设计图中的真实数据
    const mockData = {
      '100C': { '1M': '3.65%', '2M': '5.16%', '3M': '6.16%', '6M': '8.97%' },
      '103C': { '1M': '3.43%', '2M': '5.43%', '3M': '6.56%', '6M': '9.07%' },
      '105C': { '1M': '2.22%', '2M': '3.75%', '3M': '4.78%', '6M': '7.76%' },
      '110C': { '1M': '2.04%', '2M': '3.49%', '3M': '4.58%', '6M': '7.06%' },
      '80C': { '1M': '20.45%', '2M': '21.14%', '3M': '21.68%', '6M': '23.34%' },
      '90C': { '1M': '11.28%', '2M': '12.74%', '3M': '13.65%', '6M': '15.89%' },
      '95C': {},
      '8080': { '1M': '19.63%', '2M': '20.04%', '3M': '20.40%', '6M': '21.66%' },
      '9090': { '1M': '10.89%', '2M': '12.19%', '3M': '13.01%', '6M': '15.05%' },
      '9070': { '1M': '10.11%', '2M': '11.09%', '3M': '11.73%', '6M': '13.37%' }
    };

    const matrixData = strikes.map(strike => {
      return {
        strike,
        values: terms.map(term => {
          let value = '--';
          if (mockData[strike] && mockData[strike][term]) {
            value = mockData[strike][term];
          }
          return { term, value };
        })
      };
    });
    this.setData({ matrixData });
  },

  onBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/index/index' });
      }
    });
  },

  goToSearch() {
    wx.navigateTo({ url: '/pages/search-stock/search-stock' });
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
    this.fetchQuotesFromCloud();
  },

  onTraderChange(e) {
    const idx = e.detail.value;
    this.setData({
      selectedTraderIndex: idx,
      selectedTrader: this.data.traderRange[idx]
    });
    this.fetchQuotesFromCloud();
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    this.fetchQuotesFromCloud();
  },

  onCellTap(e) {
    const { strike, term } = e.currentTarget.dataset;
    const row = this.data.matrixData.find(r => r.strike === strike);
    const cell = row.values.find(v => v.term === term);
    
    if (cell.value === '--') return;

    this.setData({
      showOrderModal: true,
      orderForm: {
        direction: '买入',
        trader: this.data.selectedTrader || 'ZJGJ',
        strike,
        term,
        rate: cell.value.replace('%', ''),
        notional: 100,
        price: ''
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

  async copyOrderText() {
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

    // 1. 复制文本到剪贴板
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: '已复制下单文本', icon: 'success' });
        // 2. 生成图片并预览
        this.generateOrderImage();
      }
    });
  },

  async generateOrderImage() {
    wx.showLoading({ title: '生成图片中...' });
    const ctx = wx.createCanvasContext('orderCanvas');
    const { stock, orderForm } = this.data;
    const dateStr = new Date().toLocaleDateString();

    // 背景
    ctx.setFillStyle('#ffffff');
    ctx.fillRect(0, 0, 375, 500);

    // 标题栏 (买入蓝/卖出红)
    const headerColor = orderForm.direction === '买入' ? '#6fb2f9' : '#ff3b30';
    ctx.setFillStyle(headerColor);
    ctx.fillRect(0, 0, 375, 50);

    ctx.setFillStyle('#ffffff');
    ctx.setFontSize(18);
    ctx.fillText(orderForm.direction, 20, 32);
    ctx.fillText(dateStr, 250, 32);

    // 表格内容
    const drawRow = (y, label, value) => {
      ctx.setStrokeStyle('#eeeeee');
      ctx.setLineWidth(1);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(375, y);
      ctx.stroke();

      ctx.setFillStyle('#333333');
      ctx.setFontSize(16);
      ctx.fillText(label, 20, y + 30);
      
      ctx.setFillStyle('#666666');
      ctx.fillText(value, 120, y + 30);
      
      ctx.beginPath();
      ctx.moveTo(110, y);
      ctx.lineTo(110, y + 50);
      ctx.stroke();
    };

    let currentY = 50;
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

    // 底部颜色块
    ctx.setFillStyle(headerColor);
    ctx.fillRect(0, currentY, 375, 50);

    // 绘制二维码占位符 (如果有真实二维码路径可替换)
    // ctx.drawImage('/images/common/qr-code.png', 280, currentY - 80, 70, 70);

    ctx.draw(false, () => {
      wx.canvasToTempFilePath({
        canvasId: 'orderCanvas',
        success: (res) => {
          wx.hideLoading();
          this.setData({
            previewImage: res.tempFilePath,
            showPreviewModal: true,
            showOrderModal: false
          });
        },
        fail: (err) => {
          console.error(err);
          wx.hideLoading();
          wx.showToast({ title: '图片生成失败', icon: 'none' });
        }
      });
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
      path: `/pages/stock-detail/stock-detail?code=${this.data.stock.code}`,
      imageUrl: this.data.previewImage
    };
  },

  saveImage() {
    wx.saveImageToPhotosAlbum({
      filePath: this.data.previewImage,
      success: () => {
        wx.showToast({ title: '已保存到相册' });
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

  stopBubble() {}
});
