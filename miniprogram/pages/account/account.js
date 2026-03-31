const accountService = require('../../utils/accountService.js');
const avatarUtils = require('../../utils/avatarUtils.js');
const app = getApp();

Page({
  data: {
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

    // 持仓数据
    activeTab: 'continuing',
    allPositions: [],
    filteredPositions: [],

    // 持仓数量统计
    continuingCount: 0,
    expiringCount: 0,
    expiredCount: 0,
    closedCount: 0,

    // 加载与错误状态
    isPageLoading: false,
    refresherTriggered: false,
    overviewError: false,
    positionsError: false,

    // 数据说明弹窗
    showDataInfoPopup: false,

    // 操作菜单
    showActionMenu: false,
    currentActionPosition: null,

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
    isSubmittingPosition: false,

    // 持仓操作相关
    editingPosition: null,
    showEditPositionForm: false,
    showClosePositionDialog: false,
    closingPosition: null,
    closeType: 'accounting',
    closePrice: '',
    isClosingPosition: false,

    // 来自首页跳转的高亮持仓 id
    highlightPositionId: null
  },

  // 防并发标记
  _isFetchingProfile: false,
  _isFetchingPage: false,

  onLoad() {
    this.loadPageData();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }

    // 处理来自首页持仓案例的跳转定向
    const focus = getApp().globalData.pendingPositionFocus;
    if (focus) {
      getApp().globalData.pendingPositionFocus = null;
      const targetTab = focus.tab || 'continuing';
      this.setData({ activeTab: targetTab, highlightPositionId: focus.positionId });
      this._filterPositions();
      setTimeout(() => {
        this.setData({ highlightPositionId: null });
      }, 2000);
    }
  },

  onPullDownRefresh() {
    this.setData({ refresherTriggered: true });
    this.loadPageData().finally(() => {
      this.setData({ refresherTriggered: false });
      wx.stopPullDownRefresh();
    });
  },

  // ========== 账户选择 ==========
  toggleAccountSelector() {
    this.setData({ showAccountSelector: !this.data.showAccountSelector });
  },

  switchAccount(e) {
    const id = e.currentTarget.dataset.id;
    const next = this.data.accounts.find(a => a.id === id) || this.data.selectedAccount;
    this.setData({ selectedAccount: next, showAccountSelector: false });
    this.loadPageData();
  },

  // ========== Tab切换 ==========
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    this._filterPositions();
  },

  // ========== 数据说明弹窗 ==========
  showDataInfo() {
    this.setData({ showDataInfoPopup: true });
  },

  hideDataInfo() {
    this.setData({ showDataInfoPopup: false });
  },

  // ========== 录持仓 ==========
  handleAddPosition() {
    this.openAddPositionForm();
  },

  /**
   * 检查游客/只读用户权限
   */
  _checkGuestPermission() {
    const role = this.data.userInfo?.role;
    const isGuestOrViewer = role === 'guest' || role === 'viewer';

    if (isGuestOrViewer) {
      const roleName = role === 'guest' ? '游客' : '只读用户';
      wx.showModal({
        title: '功能受限',
        content: `${roleName}模式仅支持查看功能，请登录后使用持仓管理功能。`,
        confirmText: '去登录',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/login/login?type=wechat'
            });
          }
        }
      });
      return true;
    }
    return false;
  },

  // ========== 持仓操作 ==========
  handlePositionAction(e) {
    const id = e.currentTarget.dataset.id;
    const action = e.currentTarget.dataset.action;
    const position = this.data.allPositions.find(p => p.id === id);

    if (!position) {
      wx.showToast({ title: '持仓不存在', icon: 'none' });
      return;
    }

    // 如果是"更多"操作，显示操作菜单
    if (action === 'more') {
      this.setData({ showActionMenu: true, currentActionPosition: position });
      return;
    }

    this._executePositionAction(action, position);
  },

  // 执行持仓操作
  _executePositionAction(action, position) {
    switch (action) {
      case 'modify':
        this.openModifyPositionForm(position);
        break;
      case 'close':
        this.openClosePositionDialog(position, 'accounting');
        break;
      case 'close-live':
        this.openClosePositionDialog(position, 'order');
        break;
      case 'delete':
        this.confirmDeletePosition(position);
        break;
      default:
        wx.showToast({ title: '未知操作', icon: 'none' });
    }
  },

  // 操作菜单选择
  onActionMenuSelect(e) {
    const action = e.currentTarget.dataset.action;
    const position = this.data.currentActionPosition;

    this.setData({ showActionMenu: false, currentActionPosition: null });

    if (position && action) {
      this._executePositionAction(action, position);
    }
  },

  hideActionMenu() {
    this.setData({ showActionMenu: false, currentActionPosition: null });
  },

  // ========== 成本详情展开 ==========
  toggleCostDetail(e) {
    const id = e.currentTarget.dataset.id;
    const positions = this.data.filteredPositions.map(p => {
      if (p.id === id) {
        return { ...p, showCostDetail: !p.showCostDetail };
      }
      return p;
    });
    this.setData({ filteredPositions: positions });
  },

  // ========== 修改持仓 ==========
  openModifyPositionForm(position) {
    if (this._checkGuestPermission()) return;

    this.setData({
      showEditPositionForm: true,
      editingPosition: position,
      positionForm: {
        productCode: position.productCode || '',
        productName: position.productName || '',
        quantity: String(position.notional || ''),
        price: String(position.fillPrice || ''),
        dealer: position.dealer || '自营',
        daysLeft: String(position.daysLeft || '30')
      },
      positionFormErrors: {}
    });
  },

  hideEditPositionForm() {
    if (this.data.isSubmittingPosition) return;
    this.setData({ showEditPositionForm: false, editingPosition: null });
  },

  async submitEditPositionForm() {
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
        daysLeft: form.daysLeft ? Number(form.daysLeft) : 30
      };
      await accountService.updatePosition(this.data.editingPosition.id, payload);
      this.setData({ showEditPositionForm: false, editingPosition: null });
      wx.showToast({ title: '修改成功', icon: 'success' });
      this.loadPageData();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '修改失败', icon: 'none' });
    } finally {
      this.setData({ isSubmittingPosition: false });
    }
  },

  // ========== 平仓操作 ==========
  openClosePositionDialog(position, closeType) {
    if (this._checkGuestPermission()) return;

    this.setData({
      showClosePositionDialog: true,
      closingPosition: position,
      closeType: closeType,
      closePrice: String(position.currentPrice !== '--' ? position.currentPrice : position.fillPrice)
    });
  },

  hideClosePositionDialog() {
    if (this.data.isClosingPosition) return;
    this.setData({ showClosePositionDialog: false, closingPosition: null });
  },

  onClosePriceInput(e) {
    this.setData({ closePrice: e.detail.value });
  },

  onCloseTypeChange(e) {
    this.setData({ closeType: e.detail.value });
  },

  async confirmClosePosition() {
    if (this.data.isClosingPosition) return;

    const { closingPosition, closePrice, closeType } = this.data;
    const price = Number(closePrice);

    if (!closePrice || isNaN(price) || price <= 0) {
      wx.showToast({ title: '请输入有效的平仓价格', icon: 'none' });
      return;
    }

    this.setData({ isClosingPosition: true });
    try {
      const result = await accountService.closePosition(closingPosition.id, {
        closePrice: price,
        closeType: closeType
      });
      this.setData({ showClosePositionDialog: false, closingPosition: null });

      const profitLoss = result?.data?.profitLoss || 0;
      const profitText = profitLoss >= 0 ? `盈利 ${profitLoss.toFixed(2)}` : `亏损 ${Math.abs(profitLoss).toFixed(2)}`;
      wx.showModal({
        title: closeType === 'accounting' ? '平仓记账成功' : '平仓下单成功',
        content: `该笔持仓已${profitText}`,
        showCancel: false,
        confirmText: '知道了'
      });
      this.loadPageData();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '平仓失败', icon: 'none' });
    } finally {
      this.setData({ isClosingPosition: false });
    }
  },

  // ========== 删除持仓 ==========
  confirmDeletePosition(position) {
    if (this._checkGuestPermission()) return;

    wx.showModal({
      title: '确认删除',
      content: `确定要删除持仓「${position.productName}」吗？此操作不可恢复。`,
      confirmText: '删除',
      confirmColor: '#F54F52',
      success: async (res) => {
        if (res.confirm) {
          try {
            await accountService.deletePosition(position.id);
            wx.showToast({ title: '删除成功', icon: 'success' });
            this.loadPageData();
          } catch (err) {
            wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  // ========== 持仓录入表单 ==========
  openAddPositionForm() {
    if (this._checkGuestPermission()) return;

    this.setData({
      showAddPositionForm: true,
      positionForm: { productCode: '', productName: '', quantity: '', price: '', dealer: '', daysLeft: '' },
      positionFormErrors: {}
    });
  },

  hideAddPositionForm() {
    if (this.data.isSubmittingPosition) return;
    this.setData({ showAddPositionForm: false });
  },

  onPositionFormInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = typeof e.detail === 'string' ? e.detail : (e.detail && e.detail.value !== undefined ? e.detail.value : '');
    const newForm = Object.assign({}, this.data.positionForm);
    newForm[field] = value;
    const update = { positionForm: newForm };
    if (this.data.positionFormErrors[field]) {
      const errors = Object.assign({}, this.data.positionFormErrors);
      delete errors[field];
      update.positionFormErrors = errors;
    }
    this.setData(update);
  },

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
      const errorMsg = (err && err.message) || '';
      wx.showToast({ title: errorMsg || '录入失败', icon: 'none' });
    } finally {
      this.setData({ isSubmittingPosition: false });
    }
  },

  // ========== 数据加载 ==========
  async loadPageData() {
    if (this._isFetchingPage) return;
    this._isFetchingPage = true;
    this.setData({ isPageLoading: true, overviewError: false, positionsError: false });
    wx.showLoading({ title: '加载中', mask: false });

    try {
      const [overviewResult, positionsResult] = await Promise.allSettled([
        accountService.getAssetOverview(),
        accountService.getPositions(1, 100)
      ]);

      // 处理资产概览
      let overview = { totalScale: 0, totalProfit: 0, completedProfit: 0 };
      let costDetails = { total: 0, optionFee: 0, commission: 0 };
      if (overviewResult.status === 'fulfilled') {
        const stats = (overviewResult.value && overviewResult.value.data)
          ? overviewResult.value.data
          : (overviewResult.value || {});
        overview = {
          totalScale: stats.totalMarketValue != null ? stats.totalMarketValue : 0,
          totalProfit: stats.totalProfitLoss != null ? stats.totalProfitLoss : 0,
          completedProfit: stats.completedProfit != null ? stats.completedProfit : 0
        };
        costDetails = {
          optionFee: stats.optionFee != null ? stats.optionFee : 0,
          commission: stats.commission != null ? stats.commission : 0,
          total: (stats.optionFee || 0) + (stats.commission || 0)
        };
      } else {
        console.warn('[account] 资产概览加载失败:', overviewResult.reason && overviewResult.reason.message);
        this.setData({ overviewError: true });
      }

      // 处理持仓列表
      let positions = [];
      if (positionsResult.status === 'fulfilled') {
        const body = (positionsResult.value && positionsResult.value.data)
          ? positionsResult.value.data
          : (positionsResult.value || {});
        const rawItems = body.items || body.list || (Array.isArray(body) ? body : []);
        positions = rawItems.map(p => this._mapPosition(p));
      } else {
        console.warn('[account] 持仓列表加载失败:', positionsResult.reason && positionsResult.reason.message);
        this.setData({ positionsError: true });
      }

      this.setData({ overview, costDetails, allPositions: positions });
      this._updatePositionCounts();
      this._filterPositions();
    } catch (e) {
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
   * 场外期权标准计算逻辑：
   * - 投入成本 = 期权费（optionFee）或 名义本金 × 期权费率（premiumRate）
   * - 盈亏率 = 净盈利 / 投入成本
   */
  _mapPosition(p) {
    // 基础字段
    const notional = Number(p.notional) || Number(p.marketValue) || 0;  // 名义本金
    const entryPrice = Number(p.price) || Number(p.entryPrice) || 0;    // 进场价
    const strikePrice = Number(p.strikePrice) || 0;                     // 执行价
    const optionFee = Number(p.optionFee) || 0;                         // 期权费（权利金）
    const premiumRate = Number(p.premiumRate) || 0;                     // 期权费率（%）
    const currentPrice = Number(p.currentPrice) || 0;                   // 当前价

    // 投入成本 = 期权费（优先）或 名义本金 × 期权费率
    // 若 optionFee 存在，直接使用；否则通过 premiumRate 计算
    const investedCost = optionFee > 0
      ? optionFee
      : (premiumRate > 0 ? notional * (premiumRate / 100) : 0);

    // 净盈利（使用后端计算值）
    const pnl = Number(p.profitLoss) || 0;

    // 盈亏率 = 净盈利 / 投入成本
    const pnlRate = investedCost > 0
      ? ((pnl / investedCost) * 100).toFixed(2)
      : '0.00';

    // 距执行价百分比（看涨期权：当前价相对于执行价的距离）
    const distanceToStrike = currentPrice > 0 && strikePrice > 0
      ? ((currentPrice - strikePrice) / strikePrice * 100).toFixed(2)
      : '--';

    // 持仓状态判断
    const isActive = p.status === 'active';
    const daysLeft = p.daysLeft != null ? p.daysLeft : 30;
    const isExpired = daysLeft <= 0;

    return {
      id: p._id || p.id || '',
      productCode: p.productCode || '',
      productName: p.productName || '未知产品',
      dealer: p.dealer || '自营',
      notionalWan: (notional / 10000).toFixed(2),  // 名义本金（万）
      fillPrice: entryPrice,                       // 进场价
      strikePrice,                                  // 执行价
      optionFee,                                    // 期权费
      premiumRate,                                  // 期权费率
      investedCost,                                 // 投入成本（修正后）
      currentPrice: currentPrice || '--',
      distanceToStrike,                             // 距执行价百分比
      pnl,
      pnlRate: Number(pnlRate),
      daysLeft,
      status: isActive ? (isExpired ? 'EXPIRED' : 'CONTINUING') : 'CLOSED',
      statusText: isActive ? (isExpired ? '已到期' : '存续中') : '已完结',
      showCostDetail: false
    };
  },

  /**
   * 更新各状态持仓数量统计
   */
  _updatePositionCounts() {
    const { allPositions = [] } = this.data;

    const continuingCount = allPositions.filter(p => p.status === 'CONTINUING' && p.daysLeft > 7).length;
    const expiringCount = allPositions.filter(p => p.status === 'CONTINUING' && p.daysLeft > 0 && p.daysLeft <= 7).length;
    const expiredCount = allPositions.filter(p => p.status === 'EXPIRED' || (p.status === 'CONTINUING' && p.daysLeft <= 0)).length;
    const closedCount = allPositions.filter(p => p.status === 'CLOSED').length;

    this.setData({
      continuingCount,
      expiringCount,
      expiredCount,
      closedCount
    });
  },

  /**
   * 根据当前 tab 过滤持仓列表
   */
  _filterPositions() {
    const { activeTab, allPositions = [] } = this.data;
    let filtered = [];

    if (activeTab === 'continuing') {
      // 存续持仓：存续中且剩余天数 > 7
      filtered = allPositions.filter(i => i.status === 'CONTINUING' && i.daysLeft > 7);
    } else if (activeTab === 'expiring') {
      // 近期到期：存续中且剩余天数 1-7 天
      filtered = allPositions.filter(i => (i.status === 'CONTINUING' && i.daysLeft > 0 && i.daysLeft <= 7));
    } else if (activeTab === 'expired') {
      // 已到期：存续中但剩余天数 <= 0
      filtered = allPositions.filter(i => i.status === 'EXPIRED' || (i.status === 'CONTINUING' && i.daysLeft <= 0));
    } else if (activeTab === 'closed') {
      // 已完结：已平仓
      filtered = allPositions.filter(i => i.status === 'CLOSED');
    }

    this.setData({ filteredPositions: filtered });
  },

  // 兼容外部调用的旧命名
  filterPositions() {
    this._filterPositions();
  }
});