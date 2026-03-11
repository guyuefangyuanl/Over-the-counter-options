const accountService = require('../../utils/accountService.js');
const app = getApp();

Page({
  data: {
    // 用户信息
    userInfo: null,

    // 账户选择
    accounts: [
      { id: 'W0008888', name: '场外期权账户' },
      { id: 'M0008888', name: '模拟账户' }
    ],
    selectedAccount: { id: 'W0008888', name: '场外期权账户' },
    showAccountSelector: false,

    // 资产概览
    overview: { totalScale: 0, totalProfit: 0, completedProfit: 0 },
    costDetails: { total: 0, optionFee: 0, commission: 0 },
    isCostExpanded: false,

    // 持仓数据
    activeTab: 'continuing',
    allPositions: [],
    filteredPositions: [],

    // 加载与错误状态
    isPageLoading: false,
    refresherTriggered: false,
    overviewError: false,
    positionsError: false,

    // 持仓录入表单
    showAddPositionForm: false,
    positionForm: {
      productCode: '',
      productName: '',
      quantity: '',
      price: '',
      dealer: '',
      daysLeft: ''
    },
    positionFormErrors: {},
    isSubmittingPosition: false
  },

  // 防并发标记（不放入 data，避免触发 setData 开销）
  _isFetchingProfile: false,
  _isFetchingPage: false,

  onLoad() {
    this.loadPageData();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    // 每次显示时刷新用户资料（防重复并发）
    this._refreshUserProfile();
  },

  onPullDownRefresh() {
    // 同时兼容 scroll-view refresher 和系统下拉刷新
    this.setData({ refresherTriggered: true });
    this.loadPageData().finally(() => {
      this.setData({ refresherTriggered: false });
      wx.stopPullDownRefresh(); // 停止系统下拉刷新（enablePullDownRefresh: true 时生效）
    });
  },

  toggleAccountSelector() {
    this.setData({ showAccountSelector: !this.data.showAccountSelector });
  },

  switchAccount(e) {
    const id = e.currentTarget.dataset.id;
    const next = this.data.accounts.find(a => a.id === id) || this.data.selectedAccount;
    this.setData({ selectedAccount: next, showAccountSelector: false });
    this.loadPageData();
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    this._filterPositions();
  },

  toggleCostDetails() {
    this.setData({ isCostExpanded: !this.data.isCostExpanded });
  },

  handleAddPosition() {
    this.openAddPositionForm();
  },

  handlePositionAction(e) {
    const id = e.currentTarget.dataset.id;
    const action = e.currentTarget.dataset.action;
    console.log('position action', id, action);
    wx.showToast({ title: '功能开发中', icon: 'none' });
  },

  // 更新头像
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    this.setData({ 'userInfo.avatar': avatarUrl });
    accountService.updateUserProfile({ avatar: avatarUrl }).catch(err => {
      console.warn('头像更新失败:', err.message);
    });
  },

  // 更新昵称
  onNicknameChange(e) {
    const nickname = (e.detail.value || '').trim();
    if (!nickname) return;
    this.setData({ 'userInfo.nickname': nickname });
    accountService.updateUserProfile({ nickname }).catch(err => {
      console.warn('昵称更新失败:', err.message);
    });
  },

  /**
   * 刷新用户资料（防并发重复）
   * 后端返回格式：{ success, code, data: { nickname, avatar, openid, phone, ... } }
   */
  async _refreshUserProfile() {
    if (this._isFetchingProfile) return;
    this._isFetchingProfile = true;
    try {
      const res = await accountService.getUserProfile();
      // 兼容后端返回 { data: {...} } 或直接返回对象
      const user = (res && res.data) ? res.data : res;
      if (user && typeof user === 'object') {
        this.setData({
          userInfo: {
            nickname: user.nickname || user.username || '微信用户',
            avatar: user.avatar || '',
            openid: user.openid || user.username || '',
            phone: user.phone || ''
          }
        });
      }
    } catch (e) {
      // api.js 已处理 401 跳转，这里只打日志，不弹错误 toast
      console.warn('[account] 获取用户资料失败:', e.message);
    } finally {
      this._isFetchingProfile = false;
    }
  },

  /**
   * 加载页面主要数据（资产概览 + 持仓列表并发，错误隔离）
   * 单个接口失败不影响其他模块展示
   */
  async loadPageData() {
    if (this._isFetchingPage) return;
    this._isFetchingPage = true;
    this.setData({ isPageLoading: true, overviewError: false, positionsError: false });
    wx.showLoading({ title: '加载中', mask: false });

    try {
      // 并发请求，使用 allSettled 保证单个失败不阻断整体
      const [overviewResult, positionsResult] = await Promise.allSettled([
        accountService.getAssetOverview(),
        accountService.getPositions(1, 100)
      ]);

      // --- 处理资产概览 ---
      let overview = { totalScale: 0, totalProfit: 0, completedProfit: 0 };
      if (overviewResult.status === 'fulfilled') {
        // 后端: flask_success_response(data={ totalMarketValue, totalProfitLoss, totalCount })
        // api.js resolve 的是整个 body: { success, code, data: {...} }
        const stats = (overviewResult.value && overviewResult.value.data)
          ? overviewResult.value.data
          : (overviewResult.value || {});
        overview = {
          totalScale: stats.totalMarketValue != null ? stats.totalMarketValue : 0,
          totalProfit: stats.totalProfitLoss != null ? stats.totalProfitLoss : 0,
          completedProfit: 0 // 后端暂未返回已结平仓盈亏
        };
      } else {
        console.warn('[account] 资产概览加载失败:', overviewResult.reason && overviewResult.reason.message);
        this.setData({ overviewError: true });
      }

      // --- 处理持仓列表 ---
      let positions = [];
      if (positionsResult.status === 'fulfilled') {
        // 后端: flask_paginated_response → { success, code, data: { items: [...], pagination: {...} } }
        const body = (positionsResult.value && positionsResult.value.data)
          ? positionsResult.value.data
          : (positionsResult.value || {});
        const rawItems = body.items || body.list || (Array.isArray(body) ? body : []);
        positions = rawItems.map(p => this._mapPosition(p));
      } else {
        console.warn('[account] 持仓列表加载失败:', positionsResult.reason && positionsResult.reason.message);
        this.setData({ positionsError: true });
      }

      this.setData({ overview, allPositions: positions });
      this._filterPositions();
    } catch (e) {
      // 捕获意外异常，防止整个 loadPageData 崩溃
      console.error('[account] loadPageData 意外异常:', e.message);
      wx.showToast({ title: '数据加载失败', icon: 'none' });
    } finally {
      this.setData({ isPageLoading: false });
      wx.hideLoading();
      this._isFetchingPage = false;
    }
  },

  /**
   * 将后端持仓记录映射为前端展示格式
   * @param {object} p 原始持仓数据
   */
  _mapPosition(p) {
    const quantity = Number(p.quantity) || 0;
    const price = Number(p.price) || 0; // 成本价
    const marketValue = Number(p.marketValue) || 0;
    // 避免除零：当 quantity 为 0 时显示 '--'
    const currentPrice = quantity > 0 ? (marketValue / quantity).toFixed(3) : '--';
    const pnl = Number(p.profitLoss) || 0;
    const costBasis = quantity * price;
    const pnlRate = costBasis > 0 ? ((pnl / costBasis) * 100).toFixed(2) : '0.00';
    const isActive = p.status === 'active';

    return {
      id: p._id || p.id || '',
      productName: p.productName || '未知产品',
      dealer: p.dealer || '自营',
      notional: marketValue,
      fillPrice: price,
      currentPrice,
      pnlRate: Number(pnlRate),
      pnl,
      daysLeft: p.daysLeft != null ? p.daysLeft : 30,
      status: isActive ? 'CONTINUING' : 'CLOSED',
      statusText: isActive ? '存续中' : '已完结'
    };
  },

  /**
   * 根据当前 tab 过滤持仓列表
   */
  _filterPositions() {
    const { activeTab, allPositions = [] } = this.data;
    let filtered = [];
    if (activeTab === 'continuing') {
      filtered = allPositions.filter(i => i.status === 'CONTINUING');
    } else if (activeTab === 'expiring') {
      // 临近到期：存续中且剩余天数 <= 7
      filtered = allPositions.filter(i => i.status === 'CONTINUING' && Number(i.daysLeft) <= 7);
    } else if (activeTab === 'closed') {
      filtered = allPositions.filter(i => i.status === 'CLOSED');
    }
    this.setData({ filteredPositions: filtered });
  },

  // 兼容外部调用的旧命名
  filterPositions() {
    this._filterPositions();
  },

  // ========== 持仓录入表单 ==========

  /**
   * 打开持仓录入弹窗
   */
  openAddPositionForm() {
    this.setData({
      showAddPositionForm: true,
      positionForm: { productCode: '', productName: '', quantity: '', price: '', dealer: '', daysLeft: '' },
      positionFormErrors: {}
    });
  },

  /**
   * 关闭持仓录入弹窗
   */
  hideAddPositionForm() {
    if (this.data.isSubmittingPosition) return;
    this.setData({ showAddPositionForm: false });
  },

  /**
   * 持仓表单字段失焦时收集值（非受控模式，避免输入期间重渲染导致光标跳位）
   */
  onPositionFormInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = (e.detail && e.detail.value !== undefined) ? e.detail.value : '';
    // 仅更新内部存储的表单值，不触发 setData 对输入框的重渲染
    const newForm = Object.assign({}, this.data.positionForm);
    newForm[field] = value;
    // 只有该字段有错误时才更新 errors，减少无效渲染
    const update = { positionForm: newForm };
    if (this.data.positionFormErrors[field]) {
      const errors = Object.assign({}, this.data.positionFormErrors);
      delete errors[field];
      update.positionFormErrors = errors;
    }
    this.setData(update);
  },

  /**
   * 提交持仓录入表单
   */
  async submitPositionForm() {
    if (this.data.isSubmittingPosition) return;

    const form = this.data.positionForm;
    const errors = {};

    if (!(form.productCode || '').trim()) errors.productCode = '请输入标的代码';
    if (!(form.productName || '').trim()) errors.productName = '请输入标的名称';
    if (!form.quantity || isNaN(Number(form.quantity)) || Number(form.quantity) <= 0) {
      errors.quantity = '请输入有效的名义本金';
    }
    if (!form.price || isNaN(Number(form.price)) || Number(form.price) <= 0) {
      errors.price = '请输入有效的成本价';
    }

    if (Object.keys(errors).length > 0) {
      this.setData({ positionFormErrors: errors });
      return;
    }

    this.setData({ isSubmittingPosition: true });
    try {
      const payload = {
        productCode: (form.productCode || '').trim(),
        productName: (form.productName || '').trim(),
        quantity: Number(form.quantity),
        price: Number(form.price),
        dealer: (form.dealer || '').trim() || '自营',
        daysLeft: form.daysLeft ? Number(form.daysLeft) : 30,
        status: 'active'
      };
      await accountService.createPosition(payload);
      this.setData({ showAddPositionForm: false });
      wx.showToast({ title: '录入成功', icon: 'success' });
      this.loadPageData();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '录入失败', icon: 'none' });
    } finally {
      this.setData({ isSubmittingPosition: false });
    }
  }
});
