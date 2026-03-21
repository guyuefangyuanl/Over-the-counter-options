const accountService = require('../../utils/accountService.js');
const avatarUtils = require('../../utils/avatarUtils.js');
const app = getApp();

Page({
  data: {
    // 用户信息
    userInfo: null,
    
    // 头像上传状态
    isAvatarUploading: false,
    showAvatarPreview: false,

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
    isSubmittingPosition: false,

    // 持仓操作相关
    editingPosition: null,           // 当前编辑的持仓
    showEditPositionForm: false,     // 编辑持仓弹窗
    showClosePositionDialog: false,  // 平仓确认弹窗
    closingPosition: null,           // 待平仓的持仓
    closeType: 'accounting',         // 平仓类型：accounting/order
    closePrice: '',                  // 平仓价格
    isClosingPosition: false,        // 平仓提交中
    // 来自首页跳转的高亮持仓 id（2s 后自动清除）
    highlightPositionId: null
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

    // 处理来自首页持仓案例的跳转定向（切换到对应 tab 并高亮目标持仓）
    const focus = getApp().globalData.pendingPositionFocus;
    if (focus) {
      getApp().globalData.pendingPositionFocus = null;
      const targetTab = focus.tab || 'continuing';
      this.setData({ activeTab: targetTab, highlightPositionId: focus.positionId });
      this._filterPositions();
      // 2s 后清除高亮，避免持续样式残留
      setTimeout(() => {
        this.setData({ highlightPositionId: null });
      }, 2000);
    }
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

  /**
   * 检查游客权限
   * @returns {boolean} true 表示是游客，已弹出提示；false 表示不是游客，可以继续操作
   */
  _checkGuestPermission() {
    if (this.data.userInfo?.isGuest) {
      wx.showModal({
        title: '功能受限',
        content: '游客模式仅支持查看功能，请登录后使用持仓管理功能。',
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

  handlePositionAction(e) {
    const id = e.currentTarget.dataset.id;
    const action = e.currentTarget.dataset.action;
    const position = this.data.allPositions.find(p => p.id === id);

    if (!position) {
      wx.showToast({ title: '持仓不存在', icon: 'none' });
      return;
    }

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

  // 打开修改持仓弹窗
  openModifyPositionForm(position) {
    // 游客权限检查
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

  // 关闭修改持仓弹窗
  hideEditPositionForm() {
    if (this.data.isSubmittingPosition) return;
    this.setData({ showEditPositionForm: false, editingPosition: null });
  },

  // 提交修改持仓
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

  // 打开平仓确认弹窗
  openClosePositionDialog(position, closeType) {
    // 游客权限检查
    if (this._checkGuestPermission()) return;

    this.setData({
      showClosePositionDialog: true,
      closingPosition: position,
      closeType: closeType,
      closePrice: String(position.currentPrice !== '--' ? position.currentPrice : position.fillPrice)
    });
  },

  // 关闭平仓确认弹窗
  hideClosePositionDialog() {
    if (this.data.isClosingPosition) return;
    this.setData({ showClosePositionDialog: false, closingPosition: null });
  },

  // 平仓价格输入
  onClosePriceInput(e) {
    this.setData({ closePrice: e.detail.value });
  },

  // 切换平仓类型
  onCloseTypeChange(e) {
    this.setData({ closeType: e.detail.value });
  },

  // 确认平仓
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

  // 确认删除持仓
  confirmDeletePosition(position) {
    // 游客权限检查
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

  // 更新头像 - 增强版（多重容错）
  async onChooseAvatar(e) {
    try {
      const { avatarUrl: tempFilePath } = e.detail;
      
      // 🔧 增强验证：检查文件是否存在且可访问
      if (!tempFilePath || typeof tempFilePath !== 'string') {
        throw new Error('头像文件路径无效');
      }

      // 验证文件
      const validationResult = avatarUtils.validateAvatarFile(tempFilePath);
      if (!validationResult.valid) {
        wx.showToast({
          title: validationResult.message,
          icon: 'none'
        });
        return;
      }

      // 显示上传状态
      this.setData({ 
        isAvatarUploading: true,
        'userInfo.avatar': tempFilePath // 先显示本地预览
      });

      // 🔧 增强压缩：添加更多选项和错误处理
      let compressedPath = tempFilePath; // 默认使用原图
      try {
        compressedPath = await avatarUtils.compressImage(tempFilePath, {
          quality: 80,
          maxWidth: 800,
          maxHeight: 800
        });
      } catch (compressError) {
        console.warn('图片压缩失败，使用原图:', compressError.message);
        // 压缩失败时继续使用原图
      }

      // 🔧 增强上传：添加重试机制
      let uploadedUrl;
      let retryCount = 0;
      const maxRetries = 2;
      
      while (retryCount <= maxRetries) {
        try {
          uploadedUrl = await avatarUtils.uploadAvatar(compressedPath, this.data.userInfo?.openid);
          break; // 上传成功，跳出循环
        } catch (uploadError) {
          retryCount++;
          if (retryCount > maxRetries) {
            throw uploadError; // 超过重试次数，抛出错误
          }
          console.warn(`上传失败，第${retryCount}次重试:`, uploadError.message);
          // 等待一段时间后重试
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }

      // 更新用户信息
      await accountService.updateUserProfile({ 
        avatar: uploadedUrl,
        nickname: this.data.userInfo?.nickname
      });

      // 更新本地数据
      this.setData({
        'userInfo.avatar': uploadedUrl
      });

      wx.showToast({
        title: '头像更新成功',
        icon: 'success'
      });

    } catch (error) {
      console.error('头像上传失败:', error);
      wx.showModal({
        title: '头像更新失败',
        content: error.message || '头像上传过程中出现问题，请稍后重试',
        showCancel: false,
        confirmText: '知道了'
      });
      
      // 🔧 恢复之前的头像或默认头像
      const previousAvatar = this.data.userInfo?.avatar;
      this.setData({
        'userInfo.avatar': previousAvatar && previousAvatar !== avatarUtils.getDefaultAvatar() 
          ? previousAvatar 
          : avatarUtils.getDefaultAvatar()
      });
    } finally {
      this.setData({ isAvatarUploading: false });
    }
  },

  // 头像点击预览
  onAvatarTap() {
    if (this.data.userInfo?.avatar) {
      avatarUtils.previewAvatar(this.data.userInfo.avatar);
    }
  },

  // 头像加载失败处理
  onAvatarError(event) {
    avatarUtils.onAvatarError(event, this, 'userInfo.avatar');
  },

  // 更新昵称
  async onNicknameChange(e) {
    const nickname = (e.detail.value || '').trim();
    if (!nickname) return;

    const oldNickname = this.data.userInfo?.nickname;
    this.setData({ 'userInfo.nickname': nickname });

    try {
      await accountService.updateUserProfile({ nickname });
      wx.showToast({ title: '昵称已更新', icon: 'success', duration: 1500 });
    } catch (err) {
      console.warn('昵称更新失败:', err.message);
      // 恢复旧昵称
      this.setData({ 'userInfo.nickname': oldNickname });
      wx.showToast({ title: '昵称更新失败', icon: 'none' });
    }
  },

  /**
   * 刷新用户资料（防并发重复）
   * 后端返回格式：{ success, code, data: { nickname, avatar, openid, phone, role, ... } }
   */
  async _refreshUserProfile() {
    if (this._isFetchingProfile) return;
    this._isFetchingProfile = true;
    try {
      const res = await accountService.getUserProfile();
      // 兼容后端返回 { data: {...} } 或直接返回对象
      const user = (res && res.data) ? res.data : res;
      if (user && typeof user === 'object') {
        // 检测游客模式：role === 'guest' 表示游客，限制部分功能
        const userRole = user.role || 'user';
        const isGuest = userRole === 'guest';
        
        // 调试日志：输出用户角色信息
        console.log('[account] 用户资料:', {
          nickname: user.nickname || user.username,
          role: userRole,
          isGuest: isGuest,
          openid: user.openid
        });
        
        this.setData({
          userInfo: {
            nickname: user.nickname || user.username || '微信用户',
            avatar: user.avatar || '',
            openid: user.openid || user.username || '',
            phone: user.phone || '',
            role: userRole,
            isGuest: isGuest
          }
        });

        // 游客模式提示（仅在首次加载时显示）
        if (isGuest && !this._hasShownGuestTip) {
          this._hasShownGuestTip = true;
          console.log('[account] 游客模式：持仓创建功能受限');
        }
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
      let costDetails = { total: 0, optionFee: 0, commission: 0 };
      if (overviewResult.status === 'fulfilled') {
        // 后端: flask_success_response(data={ totalMarketValue, totalProfitLoss, completedProfit, optionFee, commission, totalCount })
        // api.js resolve 的是整个 body: { success, code, data: {...} }
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

      this.setData({ overview, costDetails, allPositions: positions });
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
      productCode: p.productCode || '',
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
   * 游客模式下禁止创建持仓，引导用户登录
   */
  openAddPositionForm() {
    // 游客权限检查
    if (this.data.userInfo?.isGuest) {
      wx.showModal({
        title: '功能受限',
        content: '游客模式仅支持查看功能，请登录后使用持仓录入功能。',
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
      return;
    }

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
      
      // 调试日志：输出当前用户角色和请求信息
      console.log('[account] 提交持仓录入:', {
        payload: payload,
        userInfo: this.data.userInfo,
        token: wx.getStorageSync('token') ? '已设置' : '未设置'
      });
      
      await accountService.createPosition(payload);
      this.setData({ showAddPositionForm: false });
      wx.showToast({ title: '录入成功', icon: 'success' });
      this.loadPageData();
    } catch (err) {
      // 详细的错误日志
      console.error('[account] 持仓录入失败:', {
        message: err && err.message,
        details: err && err.details,
        userInfo: this.data.userInfo
      });
      
      // 如果是权限错误，显示更详细的提示
      if (err && err.message && err.message.includes('权限')) {
        wx.showModal({
          title: '权限不足',
          content: `当前角色: ${this.data.userInfo?.role || '未知'}\n\n${err.message}\n\n如果您是游客，请使用微信授权登录后再试。`,
          showCancel: false
        });
      } else {
        wx.showToast({ title: (err && err.message) || '录入失败', icon: 'none' });
      }
    } finally {
      this.setData({ isSubmittingPosition: false });
    }
  }
});
