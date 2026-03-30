// subpackages/inquiry/inquiry/inquiry.js
/**
 * 询价表单页面 - 现代化重构版
 * 提供完整的询价提交功能：标的资产选择、期权参数配置、交易商选择、联系信息填写
 */

const { submitInquiry, checkSubmitPermission, getUserStatus } = require('../../../utils/inquiryService.js');
import Toast from '@vant/weapp/toast/toast';
import Dialog from '@vant/weapp/dialog/dialog';

Page({
  data: {
    // === 导航栏相关 ===
    statusBarHeight: 20,

    // === 标的资产信息 ===
    selectedProduct: null,

    // === 期权参数配置 ===
    optionType: 'call',
    structure: 'vanilla',
    term: '1M',
    notionalAmount: '100',
    strikePrice: '100',

    // === 交易商选择 ===
    dealers: [
      { code: 'zx', name: '中信证券' },
      { code: 'ht', name: '华泰财富' },
      { code: 'yh', name: '银河瑞德' },
      { code: 'gd', name: '光大证券' },
      { code: 'zg', name: '中金公司' },
      { code: 'gz', name: '国泰君安' }
    ],
    selectedDealers: [],

    // === 联系信息 ===
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    notes: '',

    // === UI状态 ===
    submitting: false,
    formErrors: {},
    userStatus: null,

    // === 预设选项 ===
    optionTypes: [
      { value: 'call', label: '看涨' },
      { value: 'put', label: '看跌' }
    ],
    structures: [
      { value: 'vanilla', label: '香草' },
      { value: 'snowball', label: '雪球' },
      { value: 'phoenix', label: '凤凰' }
    ],
    terms: [
      { value: '1M', label: '1个月' },
      { value: '2M', label: '2个月' },
      { value: '3M', label: '3个月' },
      { value: '6M', label: '6个月' },
      { value: '12M', label: '12个月' }
    ]
  },

  // ==================== 生命周期 ====================

  onLoad(options) {
    const windowInfo = wx.getWindowInfo();
    this.setData({ statusBarHeight: windowInfo.statusBarHeight });

    const permission = checkSubmitPermission();
    const userStatus = getUserStatus();
    this.setData({ userStatus });

    this.parseRouteParams(options);

    if (userStatus.userInfo) {
      this.setData({
        contactName: userStatus.userInfo.nickname || userStatus.userInfo.nickName || '',
        contactPhone: userStatus.userInfo.phone || ''
      });
    }

    if (permission.reason === 'guest_mode' || permission.reason === 'anonymous') {
      Toast({
        message: permission.suggestion,
        duration: 3000
      });
    }
  },

  onShow() {
    const userStatus = getUserStatus();
    if (userStatus.userInfo && !this.data.contactName) {
      this.setData({
        contactName: userStatus.userInfo.nickname || userStatus.userInfo.nickName || '',
        contactPhone: userStatus.userInfo.phone || ''
      });
    }
  },

  // ==================== 参数解析 ====================

  parseRouteParams(options) {
    if (options.product) {
      try {
        const product = JSON.parse(decodeURIComponent(options.product));
        if (product && product.code) {
          this.setData({ selectedProduct: product });
        }
      } catch (e) {
        console.warn('解析 product 参数失败:', e);
      }
    }

    if (options.params) {
      try {
        const params = JSON.parse(decodeURIComponent(options.params));
        if (params.product) {
          this.setData({ selectedProduct: params.product });
        }
        if (params.optionType) {
          this.setData({ optionType: params.optionType });
        }
        if (params.strikePrice) {
          this.setData({ strikePrice: params.strikePrice });
        }
        if (params.term) {
          this.setData({ term: params.term });
        }
      } catch (e) {
        console.warn('解析 params 参数失败:', e);
      }
    }

    if (options.code || options.stockCode) {
      const product = {
        name: options.name || options.stockName || '',
        code: options.code || options.stockCode || '',
        type: options.type || 'stock',
        price: options.price || ''
      };
      this.setData({ selectedProduct: product });
    }
  },

  // ==================== 标的资产选择 ====================

  onProductSelect() {
    wx.navigateTo({
      url: '/subpackages/quotes/search/search?source=inquiry',
      fail: () => {
        Toast('页面跳转失败');
      }
    });
  },

  onClearProduct() {
    this.setData({
      selectedProduct: null,
      formErrors: { ...this.data.formErrors, selectedProduct: null }
    });
    Toast('已清除标的');
  },

  // ==================== 期权参数变更 ====================

  onOptionTypeChange(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({
      optionType: value,
      formErrors: { ...this.data.formErrors, optionType: null }
    });
  },

  onStructureChange(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({
      structure: value,
      formErrors: { ...this.data.formErrors, structure: null }
    });
  },

  onTermChange(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({
      term: value,
      formErrors: { ...this.data.formErrors, term: null }
    });
  },

  onNotionalAmountInput(e) {
    const value = e.detail.value;
    this.setData({
      notionalAmount: value,
      formErrors: { ...this.data.formErrors, notionalAmount: null }
    });
  },

  onStrikePriceInput(e) {
    const value = e.detail.value;
    this.setData({
      strikePrice: value,
      formErrors: { ...this.data.formErrors, strikePrice: null }
    });
  },

  // ==================== 交易商选择 ====================

  onDealerToggle(e) {
    const code = e.currentTarget.dataset.code;
    let selectedDealers = [...this.data.selectedDealers];

    const index = selectedDealers.indexOf(code);
    if (index > -1) {
      selectedDealers.splice(index, 1);
    } else {
      selectedDealers.push(code);
    }

    this.setData({ selectedDealers });
  },

  onSelectAllDealers() {
    const allCodes = this.data.dealers.map(d => d.code);
    this.setData({ selectedDealers: allCodes });
    Toast('已全选');
  },

  onClearDealers() {
    this.setData({ selectedDealers: [] });
    Toast('已清空');
  },

  // ==================== 联系信息输入 ====================

  onContactNameInput(e) {
    this.setData({
      contactName: e.detail.value,
      formErrors: { ...this.data.formErrors, contactName: null }
    });
  },

  onContactPhoneInput(e) {
    this.setData({
      contactPhone: e.detail.value,
      formErrors: { ...this.data.formErrors, contactPhone: null }
    });
  },

  onContactEmailInput(e) {
    this.setData({
      contactEmail: e.detail.value,
      formErrors: { ...this.data.formErrors, contactEmail: null }
    });
  },

  onNotesInput(e) {
    this.setData({ notes: e.detail.value });
  },

  // ==================== 表单验证 ====================

  validateForm() {
    const errors = {};
    const { selectedProduct, notionalAmount, strikePrice, contactName, contactPhone, contactEmail } = this.data;

    if (!selectedProduct || !selectedProduct.code) {
      errors.selectedProduct = '请选择标的资产';
    }

    const amount = parseFloat(notionalAmount);
    if (!notionalAmount || isNaN(amount) || amount <= 0) {
      errors.notionalAmount = '请输入有效的名义本金';
    } else if (amount < 10) {
      errors.notionalAmount = '名义本金最低10万元';
    } else if (amount > 100000) {
      errors.notionalAmount = '名义本金不能超过10亿元';
    }

    const strike = parseFloat(strikePrice);
    if (!strikePrice || isNaN(strike)) {
      errors.strikePrice = '请输入行权价';
    } else if (strike < 50 || strike > 200) {
      errors.strikePrice = '行权价须在50%~200%之间';
    }

    if (!contactName || !contactName.trim()) {
      errors.contactName = '请输入联系人姓名';
    } else if (contactName.trim().length < 2) {
      errors.contactName = '姓名至少2个字符';
    }

    const phonePattern = /^1[3-9]\d{9}$/;
    if (!contactPhone || !phonePattern.test(contactPhone)) {
      errors.contactPhone = '请输入正确的手机号';
    }

    if (contactEmail && contactEmail.trim()) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(contactEmail)) {
        errors.contactEmail = '邮箱格式不正确';
      }
    }

    this.setData({ formErrors: errors });
    return Object.keys(errors).length === 0;
  },

  // ==================== 提交询价 ====================

  async onSubmitInquiry() {
    if (!this.validateForm()) {
      Toast('请完善表单信息');
      return;
    }

    if (this.data.submitting) {
      return;
    }

    const { selectedProduct, optionType, structure, term, notionalAmount, strikePrice, selectedDealers, contactName, contactPhone, contactEmail, notes } = this.data;

    const submitData = {
      selectedProduct: selectedProduct,
      productName: selectedProduct.name,
      productCode: selectedProduct.code,
      optionType: optionType,
      structure: structure,
      term: term,
      notionalAmount: parseFloat(notionalAmount),
      strikePrice: strikePrice,
      selectedDealers: selectedDealers,
      contactName: contactName.trim(),
      contactPhone: contactPhone.trim(),
      contactEmail: contactEmail.trim(),
      notes: notes.trim(),
      source: 'miniprogram_inquiry_page'
    };

    this.setData({ submitting: true });

    try {
      const result = await submitInquiry(submitData);

      this.setData({ submitting: false });

      if (result.success) {
        Toast({
          type: 'success',
          message: '询价已提交',
          duration: 2000
        });

        setTimeout(() => {
          const product = this.data.selectedProduct;
          const url = `/subpackages/quotes/stock-detail/stock-detail?code=${encodeURIComponent(product?.code || '')}&name=${encodeURIComponent(product?.name || '')}&price=${product?.price || '--'}&changePercent=0.00`;
          wx.redirectTo({
            url: url,
            fail: () => {
              wx.navigateBack({ delta: 1 });
            }
          });
        }, 1500);
      }
    } catch (err) {
      this.setData({ submitting: false });
      Toast({
        message: err.message || '提交失败，请重试',
        duration: 3000
      });
    }
  },

  // ==================== 取消/返回 ====================

  onCancel() {
    Dialog.confirm({
      title: '确认取消',
      message: '取消后当前填写的内容将不会保存',
      confirmButtonText: '确认取消',
      cancelButtonText: '继续填写'
    }).then(() => {
      wx.navigateBack({ delta: 1 });
    }).catch(() => {
      // 用户点击取消，继续填写
    });
  },

  // ==================== 分享 ====================

  onShareAppMessage() {
    return {
      title: '期权询价',
      path: '/subpackages/inquiry/inquiry/inquiry'
    };
  }
});