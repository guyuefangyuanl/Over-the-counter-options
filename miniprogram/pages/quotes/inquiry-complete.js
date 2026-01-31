// 小程序核心功能模块 - 基于HTML设计稿实现
const FAVORITES_STORAGE_KEY = 'INQUIRY_FAVORITES_V1';
const INQUIRY_RECORDS_KEY = 'INQUIRY_RECORDS_V1';
const API_BASE_URL = 'https://api.example.com'; // 实际API地址

// 网络请求封装
const http = {
  // GET请求
  get: (url, params = {}) => {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${API_BASE_URL}${url}`,
        method: 'GET',
        data: params,
        header: {
          'Content-Type': 'application/json',
          'Authorization': wx.getStorageSync('token') || ''
        },
        success: (res) => {
          if (res.statusCode === 200) {
            resolve(res.data);
          } else {
            reject(new Error(`请求失败: ${res.statusCode}`));
          }
        },
        fail: (err) => {
          reject(err);
        }
      });
    });
  },

  // POST请求
  post: (url, data = {}) => {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${API_BASE_URL}${url}`,
        method: 'POST',
        data: data,
        header: {
          'Content-Type': 'application/json',
          'Authorization': wx.getStorageSync('token') || ''
        },
        success: (res) => {
          if (res.statusCode === 200) {
            resolve(res.data);
          } else {
            reject(new Error(`请求失败: ${res.statusCode}`));
          }
        },
        fail: (err) => {
          reject(err);
        }
      });
    });
  }
};

// 业务逻辑模块
const logic = require('../../utils/inquiry-logic.js');

Page({
  data: {
    // 系统状态
    currentTime: '', // 当前时间
    isLoading: false, // 全局加载状态
    networkStatus: true, // 网络状态
    
    // 用户信息和权限
    userInfo: null,
    userPermissions: {
      canInquiry: true,
      canViewRecords: true,
      canExport: false
    },
    
    // 询价表单数据
    inquiryForm: {
      selectedProduct: null,
      quantity: '',
      contactName: '',
      contactPhone: '',
      contactEmail: '',
      notes: '',
      inquiryType: 'single' // single, batch, quick
    },
    
    // 表单验证错误
    formErrors: {},
    
    // 界面状态
    showInquiryForm: false,
    isSubmitting: false,
    showLoading: false,
    showError: false,
    errorMessage: '',
    
    // 市场指数数据
    marketIndexes: [
      { name: '上证指数', value: '3002.64', changePercent: -0.42, code: 'SH000001' },
      { name: '深证成指', value: '9064.84', changePercent: -1.07, code: 'SZ399001' },
      { name: '创业板指', value: '1755.88', changePercent: -1.26, code: 'SZ399006' },
      { name: '沪深300', value: '3508.71', changePercent: -0.55, code: 'SH000300' },
      { name: '中证500', value: '5198.01', changePercent: -0.89, code: 'SH000905' }
    ],
    
    // 产品数据
    products: [],
    filteredProducts: [],
    
    // 筛选条件
    filters: {
      primaryTab: 'self', // self, stock, index, etf
      subTab: 'all',
      term: '1M', // 1M, 2M, 3M, 6M
      structure: 'vanilla', // vanilla, snowball
      keyword: '',
      dealers: ['CICC', 'CITIC']
    },
    
    // 分组管理
    groups: {
      system: [
        { id: 'all', name: '全部', count: 0 },
        { id: 'holding', name: '我的持仓', count: 0 }
      ],
      custom: [
        { id: 'group1', name: '核心资产', count: 0 },
        { id: 'group2', name: '科技龙头', count: 0 }
      ]
    },
    
    // 自选管理
    favorites: {},
    selectedFavorites: [],
    isEditingFavorites: false,
    
    // 弹窗状态
    showGroupManage: false,
    showGroupEdit: false,
    showDataInfo: false,
    showInquiryHistory: false,
    
    // 分页和加载
    pagination: {
      page: 1,
      pageSize: 20,
      hasMore: true,
      isLoadingMore: false
    }
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    console.log('询价页面加载，参数：', options);
    
    // 初始化页面数据
    this.initializePage();
    
    // 检查网络状态
    this.checkNetworkStatus();
    
    // 设置当前时间
    this.setCurrentTime();
    
    // 启动时间定时器
    this.startTimeTimer();
    
    // 获取用户信息和权限
    this.getUserInfo();
    
    // 加载初始数据
    this.loadInitialData();
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady: function () {
    console.log('询价页面渲染完成');
    
    // 设置页面标题
    wx.setNavigationBarTitle({
      title: '期权询价'
    });
    
    // 获取页面元素信息（用于后续优化）
    this.getPageElementsInfo();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    console.log('询价页面显示');
    
    // 刷新数据
    this.refreshData();
    
    // 检查登录状态
    this.checkLoginStatus();
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide: function () {
    console.log('询价页面隐藏');
    
    // 保存当前状态到本地存储
    this.savePageState();
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload: function () {
    console.log('询价页面卸载');
    
    // 清理定时器
    this.clearTimers();
    
    // 保存数据
    this.saveData();
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {
    console.log('用户下拉刷新');
    
    // 刷新数据
    this.refreshData(true).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {
    console.log('页面上拉触底');
    
    // 加载更多数据
    if (this.data.pagination.hasMore && !this.data.pagination.isLoadingMore) {
      this.loadMoreData();
    }
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    return {
      title: '专业期权询价平台',
      path: '/pages/quotes/quotes',
      imageUrl: '/images/share-inquiry.png'
    };
  },

  // ==================== 初始化相关方法 ====================

  /**
   * 初始化页面
   */
  initializePage: function () {
    // 从本地存储恢复页面状态
    this.restorePageState();
    
    // 初始化自选数据
    this.initFavorites();
    
    // 初始化筛选条件
    this.initFilters();
  },

  /**
   * 检查网络状态
   */
  checkNetworkStatus: function () {
    wx.getNetworkType({
      success: (res) => {
        const isConnected = res.networkType !== 'none';
        this.setData({
          networkStatus: isConnected
        });
        
        if (!isConnected) {
          this.showError('网络连接不可用，请检查网络设置');
        }
      }
    });
  },

  /**
   * 设置当前时间
   */
  setCurrentTime: function () {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    this.setData({
      currentTime: timeStr
    });
  },

  /**
   * 启动时间定时器
   */
  startTimeTimer: function () {
    this.timer = setInterval(() => {
      this.setCurrentTime();
    }, 1000);
  },

  /**
   * 获取用户信息
   */
  getUserInfo: function () {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({
        userInfo: userInfo
      });
      
      // 获取用户权限
      this.getUserPermissions();
    }
  },

  /**
   * 获取用户权限
   */
  getUserPermissions: function () {
    // 模拟权限获取，实际应从后端获取
    const permissions = {
      canInquiry: true,
      canViewRecords: true,
      canExport: this.data.userInfo?.userType === 'vip'
    };
    
    this.setData({
      userPermissions: permissions
    });
  },

  /**
   * 加载初始数据
   */
  loadInitialData: function () {
    this.setData({ isLoading: true });
    
    Promise.all([
      this.loadMarketIndexes(),
      this.loadProducts(),
      this.loadDealers()
    ]).then(() => {
      this.setData({ isLoading: false });
      this.applyFilters();
    }).catch((error) => {
      this.setData({ isLoading: false });
      this.showError('数据加载失败：' + error.message);
    });
  },

  /**
   * 加载市场指数
   */
  loadMarketIndexes: function () {
    return new Promise((resolve, reject) => {
      // 模拟API调用
      setTimeout(() => {
        const mockData = [
          { name: '上证指数', value: '3021.45', changePercent: 0.62, code: 'SH000001' },
          { name: '深证成指', value: '9123.67', changePercent: 0.85, code: 'SZ399001' },
          { name: '创业板指', value: '1768.23', changePercent: 1.23, code: 'SZ399006' },
          { name: '沪深300', value: '3521.89', changePercent: 0.45, code: 'SH000300' },
          { name: '中证500', value: '5212.34', changePercent: 0.78, code: 'SH000905' }
        ];
        
        this.setData({
          marketIndexes: mockData
        });
        
        resolve(mockData);
      }, 500);
    });
  },

  /**
   * 加载产品数据
   */
  loadProducts: function () {
    return new Promise((resolve, reject) => {
      // 模拟API调用
      setTimeout(() => {
        const mockProducts = [
          {
            id: 1,
            name: '贵州茅台',
            code: '600519',
            type: 'stock',
            group: 'group1',
            changePercent: 1.23,
            term: '1M',
            structure: 'vanilla',
            dealers: ['CICC', 'CITIC'],
            rates: { '100': 10.50, '105': 8.30, '110': 6.50 },
            isFavorite: true
          },
          {
            id: 2,
            name: '宁德时代',
            code: '300750',
            type: 'stock',
            group: 'group1',
            changePercent: -2.45,
            term: '1M',
            structure: 'vanilla',
            dealers: ['CICC', 'GJS'],
            rates: { '100': 12.80, '105': 10.20, '110': 8.90 },
            isFavorite: true
          },
          {
            id: 3,
            name: '比亚迪',
            code: '002594',
            type: 'stock',
            group: 'group2',
            changePercent: 3.10,
            term: '2M',
            structure: 'vanilla',
            dealers: ['CITIC'],
            rates: { '100': 15.25, '105': 12.85, '110': 10.45 },
            isFavorite: false
          },
          {
            id: 4,
            name: '沪深300指数',
            code: '000300',
            type: 'index',
            group: 'all',
            changePercent: -0.55,
            term: '1M',
            structure: 'vanilla',
            dealers: ['GJS'],
            rates: { '100': 5.50, '105': 4.30, '110': 3.50 },
            isFavorite: false
          }
        ];
        
        this.setData({
          products: mockProducts
        });
        
        resolve(mockProducts);
      }, 800);
    });
  },

  /**
   * 加载交易商数据
   */
  loadDealers: function () {
    return new Promise((resolve, reject) => {
      // 模拟API调用
      setTimeout(() => {
        const mockDealers = [
          { id: 'CICC', name: '中金公司', isActive: true },
          { id: 'CITIC', name: '中信证券', isActive: true },
          { id: 'GJS', name: '国泰君安', isActive: true },
          { id: 'HTSC', name: '华泰证券', isActive: false },
          { id: 'CSC', name: '中信建投', isActive: false }
        ];
        
        resolve(mockDealers);
      }, 300);
    });
  },

  // ==================== 页面状态管理 ====================

  /**
   * 保存页面状态
   */
  savePageState: function () {
    const pageState = {
      filters: this.data.filters,
      favorites: this.data.favorites,
      pagination: this.data.pagination,
      timestamp: Date.now()
    };
    
    wx.setStorageSync('inquiryPageState', pageState);
  },

  /**
   * 恢复页面状态
   */
  restorePageState: function () {
    const pageState = wx.getStorageSync('inquiryPageState');
    if (pageState && pageState.timestamp > Date.now() - 300000) { // 5分钟内有效
      this.setData({
        filters: pageState.filters,
        favorites: pageState.favorites,
        pagination: pageState.pagination
      });
    }
  },

  /**
   * 保存数据到本地存储
   */
  saveData: function () {
    try {
      const dataToSave = {
        favorites: this.data.favorites,
        filters: this.data.filters,
        timestamp: Date.now()
      };
      
      wx.setStorageSync('inquiryData', dataToSave);
    } catch (error) {
      console.error('保存数据失败:', error);
    }
  },

  /**
   * 清理定时器
   */
  clearTimers: function () {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  // ==================== 错误处理和提示 ====================

  /**
   * 显示错误信息
   */
  showError: function (message) {
    this.setData({
      showError: true,
      errorMessage: message
    });
    
    // 3秒后自动隐藏
    setTimeout(() => {
      this.setData({
        showError: false,
        errorMessage: ''
      });
    }, 3000);
  },

  /**
   * 显示成功提示
   */
  showSuccess: function (message) {
    wx.showToast({
      title: message,
      icon: 'success',
      duration: 2000
    });
  },

  /**
   * 显示加载状态
   */
  showLoading: function (message = '加载中...') {
    this.setData({
      showLoading: true
    });
    
    wx.showLoading({
      title: message,
      mask: true
    });
  },

  /**
   * 隐藏加载状态
   */
  hideLoading: function () {
    this.setData({
      showLoading: false
    });
    
    wx.hideLoading();
  },

  // ==================== 路由跳转相关方法 ====================

  /**
   * 跳转到产品详情页
   */
  goToProductDetail: function (e) {
    const productId = e.currentTarget.dataset.id;
    const product = this.data.products.find(p => p.id === productId);
    
    if (!product) {
      this.showError('产品信息不存在');
      return;
    }
    
    wx.navigateTo({
      url: `/pages/product/detail?id=${productId}`,
      success: () => {
        // 传递产品数据
        wx.setStorageSync('currentProduct', product);
      },
      fail: () => {
        this.showError('页面跳转失败');
      }
    });
  },

  /**
   * 跳转到询价记录页
   */
  goToInquiryRecords: function () {
    if (!this.data.userPermissions.canViewRecords) {
      this.showError('您暂无权限查看询价记录');
      return;
    }
    
    wx.navigateTo({
      url: '/pages/quotes/records',
      fail: () => {
        this.showError('页面跳转失败');
      }
    });
  },

  /**
   * 跳转到个人中心
   */
  goToProfile: function () {
    wx.switchTab({
      url: '/pages/profile/index',
      fail: () => {
        this.showError('页面跳转失败');
      }
    });
  },

  /**
   * 跳转到设置页面
   */
  goToSettings: function () {
    wx.navigateTo({
      url: '/pages/settings/index',
      fail: () => {
        this.showError('页面跳转失败');
      }
    });
  },

  // ==================== 询价表单相关方法 ====================

  /**
   * 显示询价表单
   */
  showInquiryForm: function (e) {
    const productId = e.currentTarget.dataset.id;
    const product = this.data.products.find(p => p.id === productId);
    
    if (!product) {
      this.showError('产品信息不存在');
      return;
    }
    
    // 检查用户权限
    if (!this.data.userPermissions.canInquiry) {
      this.showError('您暂无询价权限');
      return;
    }
    
    this.setData({
      showInquiryForm: true,
      'inquiryForm.selectedProduct': product,
      'inquiryForm.inquiryType': 'single'
    });
  },

  /**
   * 隐藏询价表单
   */
  hideInquiryForm: function () {
    this.setData({
      showInquiryForm: false,
      inquiryForm: {
        selectedProduct: null,
        quantity: '',
        contactName: '',
        contactPhone: '',
        contactEmail: '',
        notes: '',
        inquiryType: 'single'
      },
      formErrors: {}
    });
  },

  /**
   * 表单输入处理
   */
  onFormInput: function (e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    
    this.setData({
      [`inquiryForm.${field}`]: value
    });
    
    // 实时清除对应字段的错误信息
    if (this.data.formErrors[field]) {
      this.setData({
        [`formErrors.${field}`]: ''
      });
    }
    
    // 实时验证（可选）
    if (field === 'contactPhone') {
      this.validatePhone(value);
    }
  },

  /**
   * 验证手机号
   */
  validatePhone: function (phone) {
    const isValid = /^1[3-9]\d{9}$/.test(phone);
    if (phone && !isValid) {
      this.setData({
        'formErrors.contactPhone': '请输入有效的手机号码'
      });
    } else {
      this.setData({
        'formErrors.contactPhone': ''
      });
    }
    
    return isValid;
  },

  /**
   * 验证表单
   */
  validateForm: function () {
    const form = this.data.inquiryForm;
    const errors = {};
    
    // 验证数量
    if (!form.quantity) {
      errors.quantity = '请输入数量';
    } else if (!/^\d+$/.test(form.quantity) || parseInt(form.quantity) <= 0) {
      errors.quantity = '请输入有效的数量（正整数）';
    } else if (parseInt(form.quantity) > 1000000) {
      errors.quantity = '数量不能超过100万';
    }
    
    // 验证联系人姓名
    if (!form.contactName) {
      errors.contactName = '请输入联系人姓名';
    } else if (form.contactName.length < 2 || form.contactName.length > 20) {
      errors.contactName = '联系人姓名长度应在2-20个字符之间';
    }
    
    // 验证联系电话
    if (!form.contactPhone) {
      errors.contactPhone = '请输入联系电话';
    } else if (!this.validatePhone(form.contactPhone)) {
      errors.contactPhone = '请输入有效的手机号码';
    }
    
    // 验证邮箱（可选）
    if (form.contactEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(form.contactEmail)) {
        errors.contactEmail = '请输入有效的邮箱地址';
      }
    }
    
    // 验证备注长度（可选）
    if (form.notes && form.notes.length > 500) {
      errors.notes = '备注信息不能超过500字';
    }
    
    this.setData({ formErrors: errors });
    return Object.keys(errors).length === 0;
  },

  /**
   * 提交询价表单
   */
  submitInquiryForm: function () {
    if (!this.validateForm()) {
      return;
    }
    
    // 检查网络状态
    if (!this.data.networkStatus) {
      this.showError('网络连接不可用，请检查网络设置');
      return;
    }
    
    this.setData({ isSubmitting: true });
    
    // 构建提交数据
    const submitData = {
      productId: this.data.inquiryForm.selectedProduct.id,
      productName: this.data.inquiryForm.selectedProduct.name,
      productCode: this.data.inquiryForm.selectedProduct.code,
      quantity: parseInt(this.data.inquiryForm.quantity),
      contactInfo: {
        name: this.data.inquiryForm.contactName,
        phone: this.data.inquiryForm.contactPhone,
        email: this.data.inquiryForm.contactEmail,
        notes: this.data.inquiryForm.notes
      },
      inquiryType: this.data.inquiryForm.inquiryType,
      structure: this.data.inquiryForm.selectedProduct.structure,
      term: this.data.inquiryForm.selectedProduct.term,
      dealers: this.data.inquiryForm.selectedProduct.dealers,
      submitTime: new Date().toISOString(),
      userId: this.data.userInfo?.id || '',
      status: 'pending' // pending, processing, completed, failed
    };
    
    console.log('提交询价数据:', submitData);
    
    // 模拟API提交
    this.mockSubmitInquiry(submitData).then((result) => {
      // 保存询价记录
      this.saveInquiryRecord(result);
      
      // 显示成功提示
      this.showSuccess('询价提交成功！');
      
      // 隐藏表单并重置
      this.hideInquiryForm();
      
      // 更新统计数据
      this.updateInquiryStats();
      
    }).catch((error) => {
      console.error('询价提交失败:', error);
      this.showError('询价提交失败，请稍后重试');
    }).finally(() => {
      this.setData({ isSubmitting: false });
    });
  },

  /**
   * 提交询价到云数据库（真实实现）
   */
  mockSubmitInquiry: function (data) {
    return new Promise((resolve, reject) => {
      console.log('[询价提交] 开始提交到云数据库', data);
      
      // 获取云数据库实例
      const db = wx.cloud.database();
      
      // 构造云数据库记录
      const inquiryRecord = {
        // 产品信息
        productId: data.productId,
        productName: data.productName,
        productCode: data.productCode,
        
        // 期权参数
        optionType: data.optionType || 'call', // call, put
        structure: data.structure || 'vanilla',
        term: data.term || '1M',
        notionalAmount: data.quantity || 100, // 名义本金（万元）
        strikePrice: data.strikePrice || '100', // 行权价（%）
        selectedDealers: data.dealers || [],
        
        // 联系人信息
        contactName: data.contactInfo.name,
        phone: data.contactInfo.phone,
        contactEmail: data.contactInfo.email || '',
        notes: data.contactInfo.notes || '',
        
        // 状态和时间
        status: 'pending', // pending, processing, completed, rejected
        createdAt: db.serverDate(), // 使用服务器时间
        updateTime: db.serverDate(),
        
        // 用户信息
        userId: data.userId || '',
        source: 'miniprogram' // 标记来源为小程序
      };
      
      // 写入云数据库
      db.collection('inquiries').add({
        data: inquiryRecord
      }).then(res => {
        console.log('[询价提交] 云数据库写入成功', res);
        
        // 构造返回结果
        const result = {
          ...data,
          inquiryId: res._id, // 使用云数据库返回的ID
          inquiryNo: `XQ${Date.now().toString().slice(-8)}`,
          status: 'pending',
          createTime: new Date().toISOString(),
          estimatedResponseTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          _id: res._id // 保存云数据库ID
        };
        
        resolve(result);
      }).catch(err => {
        console.error('[询价提交] 云数据库写入失败', err);
        reject(new Error('询价提交失败: ' + (err.errMsg || err.message || '未知错误')));
      });
    });
  },

  /**
   * 保存询价记录
   */
  saveInquiryRecord: function (inquiryData) {
    try {
      let records = wx.getStorageSync(INQUIRY_RECORDS_KEY) || [];
      
      // 添加到记录开头
      records.unshift({
        ...inquiryData,
        id: Date.now().toString(),
        createTime: new Date().toISOString()
      });
      
      // 最多保存100条记录
      if (records.length > 100) {
        records = records.slice(0, 100);
      }
      
      wx.setStorageSync(INQUIRY_RECORDS_KEY, records);
      
      console.log('询价记录已保存，当前记录数:', records.length);
      
    } catch (error) {
      console.error('保存询价记录失败:', error);
    }
  },

  /**
   * 更新询价统计
   */
  updateInquiryStats: function () {
    // 这里可以添加统计逻辑，如更新用户询价次数等
    console.log('更新询价统计');
  },

  // ==================== 筛选和搜索相关方法 ====================

  /**
   * 切换主Tab
   */
  switchPrimaryTab: function (e) {
    const tab = e.currentTarget.dataset.tab;
    
    if (tab === this.data.filters.primaryTab) {
      return;
    }
    
    this.setData({
      'filters.primaryTab': tab,
      'filters.subTab': 'all' // 重置子Tab
    });
    
    // 重新应用筛选
    this.applyFilters();
    
    // 记录用户行为
    this.recordUserAction('switch_primary_tab', { tab });
  },

  /**
   * 切换子Tab
   */
  switchSubTab: function (e) {
    const tab = e.currentTarget.dataset.tab;
    
    if (tab === this.data.filters.subTab) {
      return;
    }
    
    this.setData({
      'filters.subTab': tab
    });
    
    // 重新应用筛选
    this.applyFilters();
    
    // 记录用户行为
    this.recordUserAction('switch_sub_tab', { tab });
  },

  /**
   * 切换期限
   */
  switchTerm: function (e) {
    const term = e.currentTarget.dataset.term;
    
    if (term === this.data.filters.term) {
      return;
    }
    
    this.setData({
      'filters.term': term
    });
    
    // 重新应用筛选
    this.applyFilters();
    
    // 记录用户行为
    this.recordUserAction('switch_term', { term });
  },

  /**
   * 切换结构
   */
  switchStructure: function (e) {
    const structure = e.currentTarget.dataset.structure;
    
    if (structure === this.data.filters.structure) {
      return;
    }
    
    this.setData({
      'filters.structure': structure
    });
    
    // 重新应用筛选
    this.applyFilters();
    
    // 记录用户行为
    this.recordUserAction('switch_structure', { structure });
  },

  /**
   * 搜索输入处理
   */
  onSearchInput: function (e) {
    const keyword = e.detail.value;
    
    this.setData({
      'filters.keyword': keyword
    });
    
    // 防抖处理
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    
    this.searchTimer = setTimeout(() => {
      this.applyFilters();
      this.recordUserAction('search', { keyword });
    }, 300);
  },

  /**
   * 搜索确认
   */
  onSearchConfirm: function (e) {
    const keyword = e.detail.value;
    
    this.applyFilters();
    this.recordUserAction('search_confirm', { keyword });
  },

  /**
   * 清除搜索
   */
  clearSearch: function () {
    this.setData({
      'filters.keyword': ''
    });
    
    this.applyFilters();
    this.recordUserAction('clear_search');
  },

  /**
   * 应用筛选条件
   */
  applyFilters: function () {
    const { products, filters } = this.data;
    
    let filteredProducts = [...products];
    
    // 按主Tab筛选
    if (filters.primaryTab !== 'self') {
      const typeMap = {
        'stock': 'stock',
        'index': 'index',
        'etf': 'etf'
      };
      filteredProducts = filteredProducts.filter(item => item.type === typeMap[filters.primaryTab]);
    } else {
      // 自选Tab：只显示收藏的产品
      filteredProducts = filteredProducts.filter(item => this.data.favorites[item.id]);
      
      // 按子Tab筛选
      if (filters.subTab !== 'all') {
        filteredProducts = filteredProducts.filter(item => {
          const fav = this.data.favorites[item.id];
          return fav && (fav.groupId || 'all') === filters.subTab;
        });
      }
    }
    
    // 按期限筛选
    if (filters.term) {
      filteredProducts = filteredProducts.filter(item => item.term === filters.term);
    }
    
    // 按结构筛选
    if (filters.structure) {
      filteredProducts = filteredProducts.filter(item => item.structure === filters.structure);
    }
    
    // 按关键词搜索
    if (filters.keyword) {
      const keyword = filters.keyword.toLowerCase();
      filteredProducts = filteredProducts.filter(item => 
        item.name.toLowerCase().includes(keyword) || 
        item.code.toLowerCase().includes(keyword)
      );
    }
    
    // 更新分页信息
    const pagination = {
      ...this.data.pagination,
      page: 1,
      hasMore: filteredProducts.length > this.data.pagination.pageSize
    };
    
    this.setData({
      filteredProducts: filteredProducts.slice(0, pagination.pageSize),
      pagination
    });
    
    console.log('筛选完成，结果数量:', filteredProducts.length);
  },

  /**
   * 清除所有筛选条件
   */
  clearAllFilters: function () {
    this.setData({
      filters: {
        primaryTab: 'self',
        subTab: 'all',
        term: '1M',
        structure: 'vanilla',
        keyword: '',
        dealers: ['CICC', 'CITIC']
      }
    });
    
    this.applyFilters();
    this.showSuccess('筛选条件已清除');
  },

  /**
   * 检查是否有活跃的筛选条件
   */
  hasActiveFilters: function () {
    const { filters } = this.data;
    return filters.keyword !== '' || 
           filters.term !== '1M' || 
           filters.structure !== 'vanilla' ||
           filters.primaryTab !== 'self';
  },

  /**
   * 获取空状态文本
   */
  getEmptyStateText: function () {
    const { filters } = this.data;
    
    if (filters.keyword) {
      return `未找到包含"${filters.keyword}"的产品`;
    }
    
    if (filters.primaryTab === 'self') {
      return '暂无自选产品，快去添加吧';
    }
    
    return '暂无符合条件的产品';
  },

  // ==================== 自选管理相关方法 ====================

  /**
   * 初始化自选数据
   */
  initFavorites: function () {
    try {
      const favorites = wx.getStorageSync(FAVORITES_STORAGE_KEY) || {};
      this.setData({ favorites });
      console.log('自选数据已初始化:', Object.keys(favorites).length);
    } catch (error) {
      console.error('初始化自选数据失败:', error);
      this.setData({ favorites: {} });
    }
  },

  /**
   * 切换收藏状态
   */
  toggleFavorite: function (e) {
    const productId = e.currentTarget.dataset.id;
    const product = this.data.products.find(p => p.id === productId);
    
    if (!product) {
      return;
    }
    
    const favorites = { ...this.data.favorites };
    
    if (favorites[productId]) {
      // 取消收藏
      delete favorites[productId];
      this.showSuccess('已取消自选');
    } else {
      // 添加收藏
      favorites[productId] = {
        productId: productId,
        groupId: this.data.filters.subTab,
        addTime: new Date().toISOString()
      };
      this.showSuccess('已添加自选');
    }
    
    this.setData({ favorites });
    
    // 保存到本地存储
    try {
      wx.setStorageSync(FAVORITES_STORAGE_KEY, favorites);
    } catch (error) {
      console.error('保存自选数据失败:', error);
    }
    
    // 重新应用筛选
    this.applyFilters();
    
    // 记录用户行为
    this.recordUserAction('toggle_favorite', { productId });
  },

  /**
   * 开始编辑自选
   */
  startEditFavorites: function () {
    this.setData({
      isEditingFavorites: true,
      selectedFavorites: []
    });
    
    this.showSuccess('请选择要删除的自选');
  },

  /**
   * 取消编辑自选
   */
  cancelEditFavorites: function () {
    this.setData({
      isEditingFavorites: false,
      selectedFavorites: []
    });
  },

  /**
   * 切换自选选择状态
   */
  toggleFavoriteSelection: function (e) {
    const productId = e.currentTarget.dataset.id;
    const selectedFavorites = [...this.data.selectedFavorites];
    
    const index = selectedFavorites.indexOf(productId);
    if (index > -1) {
      selectedFavorites.splice(index, 1);
    } else {
      selectedFavorites.push(productId);
    }
    
    this.setData({ selectedFavorites });
  },

  /**
   * 删除选中的自选
   */
  removeSelectedFavorites: function () {
    const { selectedFavorites, favorites } = this.data;
    
    if (selectedFavorites.length === 0) {
      this.showError('请先选择要删除的自选');
      return;
    }
    
    const newFavorites = { ...favorites };
    selectedFavorites.forEach(id => {
      delete newFavorites[id];
    });
    
    this.setData({
      favorites: newFavorites,
      isEditingFavorites: false,
      selectedFavorites: []
    });
    
    // 保存到本地存储
    try {
      wx.setStorageSync(FAVORITES_STORAGE_KEY, newFavorites);
    } catch (error) {
      console.error('保存自选数据失败:', error);
    }
    
    // 重新应用筛选
    this.applyFilters();
    
    this.showSuccess(`已删除 ${selectedFavorites.length} 个自选`);
    
    // 记录用户行为
    this.recordUserAction('remove_favorites', { count: selectedFavorites.length });
  },

  // ==================== 分组管理相关方法 ====================

  /**
   * 显示分组管理
   */
  showGroupManage: function () {
    this.setData({
      showGroupManage: true
    });
  },

  /**
   * 隐藏分组管理
   */
  hideGroupManage: function () {
    this.setData({
      showGroupManage: false
    });
  },

  /**
   * 选择分组
   */
  selectGroup: function (e) {
    const groupId = e.currentTarget.dataset.id;
    
    this.setData({
      'filters.subTab': groupId
    });
    
    this.hideGroupManage();
    this.applyFilters();
    
    // 记录用户行为
    this.recordUserAction('select_group', { groupId });
  },

  /**
   * 创建新分组
   */
  createNewGroup: function () {
    wx.showModal({
      title: '新建分组',
      editable: true,
      placeholderText: '请输入分组名称',
      success: (res) => {
        if (res.confirm && res.content) {
          const groupName = res.content.trim();
          
          if (groupName.length < 1 || groupName.length > 20) {
            this.showError('分组名称长度应在1-20个字符之间');
            return;
          }
          
          // 检查是否已存在
          const allGroups = [...this.data.groups.system, ...this.data.groups.custom];
          if (allGroups.some(group => group.name === groupName)) {
            this.showError('分组名称已存在');
            return;
          }
          
          const newGroup = {
            id: `custom_${Date.now()}`,
            name: groupName,
            count: 0
          };
          
          const groups = {
            ...this.data.groups,
            custom: [...this.data.groups.custom, newGroup]
          };
          
          this.setData({ groups });
          
          this.showSuccess('分组创建成功');
          
          // 记录用户行为
          this.recordUserAction('create_group', { groupName });
        }
      }
    });
  },

  // ==================== 数据说明相关方法 ====================

  /**
   * 显示数据说明
   */
  showDataInfo: function () {
    this.setData({
      showDataInfo: true
    });
  },

  /**
   * 隐藏数据说明
   */
  hideDataInfo: function () {
    this.setData({
      showDataInfo: false
    });
  },

  // ==================== 快捷功能相关方法 ====================

  /**
   * 跳转到计算器
   */
  goToCalculator: function () {
    wx.navigateTo({
      url: '/pages/calculator/index',
      success: () => {
        this.recordUserAction('go_to_calculator');
      },
      fail: () => {
        this.showError('页面跳转失败');
      }
    });
  },

  /**
   * 跳转到询价记录
   */
  goToInquiryRecords: function () {
    if (!this.data.userPermissions.canViewRecords) {
      this.showError('您暂无权限查看询价记录');
      return;
    }
    
    wx.navigateTo({
      url: '/pages/quotes/records',
      success: () => {
        this.recordUserAction('go_to_records');
      },
      fail: () => {
        this.showError('页面跳转失败');
      }
    });
  },

  /**
   * 跳转到个人中心
   */
  goToProfile: function () {
    wx.switchTab({
      url: '/pages/profile/index',
      success: () => {
        this.recordUserAction('go_to_profile');
      },
      fail: () => {
        this.showError('页面跳转失败');
      }
    });
  },

  // ==================== 批量询价相关方法 ====================

  /**
   * 批量询价
   */
  batchInquiry: function () {
    const favoriteProducts = this.data.products.filter(p => this.data.favorites[p.id]);
    
    if (favoriteProducts.length === 0) {
      this.showError('暂无自选产品');
      return;
    }
    
    if (!this.data.userPermissions.canInquiry) {
      this.showError('您暂无询价权限');
      return;
    }
    
    // 显示批量询价表单
    this.setData({
      showInquiryForm: true,
      'inquiryForm.selectedProduct': favoriteProducts[0], // 默认选择第一个
      'inquiryForm.inquiryType': 'batch'
    });
    
    this.recordUserAction('batch_inquiry');
  },

  /**
   * 快速询价
   */
  quickInquiry: function () {
    const favoriteProducts = this.data.products.filter(p => this.data.favorites[p.id]);
    
    if (favoriteProducts.length === 0) {
      this.showError('暂无自选产品');
      return;
    }
    
    if (!this.data.userPermissions.canInquiry) {
      this.showError('您暂无询价权限');
      return;
    }
    
    // 显示快速询价表单
    this.setData({
      showInquiryForm: true,
      'inquiryForm.selectedProduct': favoriteProducts[0],
      'inquiryForm.inquiryType': 'quick'
    });
    
    this.recordUserAction('quick_inquiry');
  },

  // ==================== 用户行为记录相关方法 ====================

  /**
   * 记录用户行为
   */
  recordUserAction: function (action, data = {}) {
    try {
      const actionLog = {
        action,
        data,
        timestamp: new Date().toISOString(),
        userId: this.data.userInfo?.id || '',
        page: 'inquiry'
      };
      
      // 这里可以将用户行为发送到分析服务器
      console.log('用户行为记录:', actionLog);
      
      // 保存到本地存储（可选）
      let logs = wx.getStorageSync('userActionLogs') || [];
      logs.push(actionLog);
      
      // 最多保存100条记录
      if (logs.length > 100) {
        logs = logs.slice(-100);
      }
      
      wx.setStorageSync('userActionLogs', logs);
      
    } catch (error) {
      console.error('记录用户行为失败:', error);
    }
  },

  // ==================== 页面状态管理相关方法 ====================

  /**
   * 刷新数据
   */
  refreshData: function (isPullDown = false) {
    if (isPullDown) {
      this.setData({ isRefreshing: true });
    }
    
    return Promise.all([
      this.loadMarketIndexes(),
      this.loadProducts()
    ]).then(() => {
      this.applyFilters();
      
      if (isPullDown) {
        this.setData({ isRefreshing: false });
        this.showSuccess('数据已刷新');
      }
    }).catch((error) => {
      if (isPullDown) {
        this.setData({ isRefreshing: false });
      }
      this.showError('数据刷新失败：' + error.message);
    });
  },

  /**
   * 加载更多数据
   */
  loadMoreData: function () {
    const { pagination, filteredProducts } = this.data;
    
    if (!pagination.hasMore || pagination.isLoadingMore) {
      return;
    }
    
    this.setData({
      'pagination.isLoadingMore': true
    });
    
    // 模拟加载更多数据
    setTimeout(() => {
      const newPage = pagination.page + 1;
      const startIndex = (newPage - 1) * pagination.pageSize;
      const endIndex = startIndex + pagination.pageSize;
      
      const moreProducts = this.data.products.slice(startIndex, endIndex);
      const newFilteredProducts = [...filteredProducts, ...moreProducts];
      
      this.setData({
        filteredProducts: newFilteredProducts,
        pagination: {
          ...pagination,
          page: newPage,
          hasMore: endIndex < this.data.products.length,
          isLoadingMore: false
        }
      });
      
    }, 500);
  },

  /**
   * 获取页面元素信息
   */
  getPageElementsInfo: function () {
    // 这里可以获取页面元素的信息，用于后续优化
    console.log('获取页面元素信息');
  },

  /**
   * 检查登录状态
   */
  checkLoginStatus: function () {
    // 检查用户是否已登录
    const token = wx.getStorageSync('token');
    if (!token) {
      // 可以引导用户登录
      console.log('用户未登录');
    }
  },

  /**
   * 保存页面状态
   */
  savePageState: function () {
    const pageState = {
      filters: this.data.filters,
      favorites: this.data.favorites,
      pagination: this.data.pagination,
      timestamp: Date.now()
    };
    
    try {
      wx.setStorageSync('inquiryPageState', pageState);
    } catch (error) {
      console.error('保存页面状态失败:', error);
    }
  },

  /**
   * 恢复页面状态
   */
  restorePageState: function () {
    try {
      const pageState = wx.getStorageSync('inquiryPageState');
      
      if (pageState && pageState.timestamp > Date.now() - 300000) { // 5分钟内有效
        this.setData({
          filters: pageState.filters,
          favorites: pageState.favorites,
          pagination: pageState.pagination
        });
        
        console.log('页面状态已恢复');
      }
    } catch (error) {
      console.error('恢复页面状态失败:', error);
    }
  }
});