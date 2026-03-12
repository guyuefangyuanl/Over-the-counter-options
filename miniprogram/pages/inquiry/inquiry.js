// miniprogram/pages/inquiry/inquiry.js
const FAVORITES_STORAGE_KEY = 'INQUIRY_FAVORITES_V1';
const CUSTOM_GROUPS_STORAGE_KEY = 'INQUIRY_CUSTOM_GROUPS_V1';
const api = require('../../utils/api.js');
const { submitInquiry } = require('../../utils/inquiryService.js');

const logic = require('../../utils/inquiry-logic.js');

Page({
  data: {
    currentTime: '', // 当前时间
    
    // 询价表单数据
    inquiryForm: {
      selectedProduct: null,
      optionType: 'call',       // call, put
      structure: 'vanilla',    // vanilla, snowball, etc.
      term: '1M',              // 1M, 3M, 6M, etc.
      notionalAmount: '',      // 名义本金 (万元)
      strikePrice: '100',      // 行权价 (%)
      selectedDealers: ['CICC'], // 选中的交易商
      contactName: '',
      contactPhone: '',
      contactEmail: '',
      notes: ''
    },

    // 选项列表
    structureOptions: [
      { text: '香草 (Vanilla)', value: 'vanilla' },
      { text: '雪球 (Snowball)', value: 'snowball' },
      { text: '凤凰 (Phoenix)', value: 'phoenix' },
    ],
    termOptions: [
      { text: '1个月 (1M)', value: '1M' },
      { text: '3个月 (3M)', value: '3M' },
      { text: '6个月 (6M)', value: '6M' },
      { text: '1年 (1Y)', value: '1Y' },
      { text: '自定义', value: 'custom' },
    ],
    
    // 表单验证错误
    formErrors: {},
    
    // 是否显示询价表单
    showInquiryForm: false,
    
    // 是否正在提交
    isSubmitting: false,
    
    // 市场指数（初始占位，由 fetchMarketIndexes() 在 onLoad 中动态更新）
    marketIndexes: [
      { name: '上证指数', value: '-', changePercent: 0 },
      { name: '深证成指', value: '-', changePercent: 0 },
      { name: '创业板指', value: '-', changePercent: 0 },
      { name: '沪深300',   value: '-', changePercent: 0 },
      { name: '中证500',   value: '-', changePercent: 0 },
    ],

    // Tab 状态
    activePrimaryTab: 'self', // 'self', 'stock', 'index', 'etf'
    activeSubTab: 'all',      // 'all', 'holding', 或自定义分组id
    activeTerm: '1M',         // '1M', '2M', '3M', '6M'
    activeStructure: 'vanilla', // 'vanilla', 'snowball'

    // 搜索关键字
    searchKeyword: '',

    // 分组数据
    systemGroups: [
      { id: 'all', name: '全部' },
      { id: 'holding', name: '我的持仓' },
    ],
    customGroups: [], // 从云数据库加载

    // 交易商数据
    selectedDealers: ['CICC', 'CITIC'], // 默认选中的交易商
    allDealers: [
      { id: 'CICC', name: '中金' },
      { id: 'CITIC', name: '中信' },
      { id: 'GJS', name: '国君' },
    ],

    // 完整的报价列表 (初始为空)
    _fullQuoteList: [],

    // 过滤后的报价列表
    quoteList: [],

    // 自选相关状态
    favoritesById: {},
    isEditing: false,
    isAddingMode: false,
    selectedForEdit: [],
    selectedForEditSet: {},

    // 自定义弹窗状态
    showDataInfo: false,

    // 分组管理弹层与新建分组弹窗
    showGroupManagePopup: false,
    pendingDisplayGroupId: 'all',
    groupCountsById: {},
    showNewGroupDialog: false,
    newGroupName: '',
    newGroupError: '',
    canConfirmNewGroup: false,
    newGroupLoading: false,
    showSuccessAnim: false,
    
    // 自选按钮与星标扩展状态
    canEditFavorites: false,
    animatingFavoriteId: null,
    disableFavoriteActions: false,
    
    // 编辑分组相关状态
    isEditMode: false,              // 编辑模式开关
    editingGroupId: '',            // 当前编辑的分组ID
    editingGroupName: '',          // 重命名输入值
    showRenameGroupDialog: false,  // 重命名弹窗
    renameGroupError: '',          // 重命名错误提示
    canConfirmRename: false,       // 是否可以确认重命名
    showDeleteGroupDialog: false,  // 删除确认弹窗
    deleteMigrationCount: 0,       // 需要迁移的自选数量
    availableTargetGroups: [],     // 可用于迁移的目标分组
    deleteRemoveFavorites: false,  // 删除分组时是否同步移出自选
    
    // 添加自选弹窗相关状态
    showAddFavoritesPopup: false,  // 是否显示添加自选弹窗
    addFavoritesSearch: '',        // 添加自选搜索关键词
    addFavoritesCategory: 'all',   // 当前选中的分类
    addFavoritesStockList: [],     // 添加自选股票列表
  },

  onLoad() {
    this.loadFavorites();
    this.fetchQuoteList(); // 从后端获取数据
    this.loadCustomGroups(); // 从本地存储加载自定义分组
    this.updateCurrentTime();
    this.computeGroupCounts();
    this.setData({ canEditFavorites: (this.data.groupCountsById.all || 0) > 0 });
    this.fetchMarketIndexes(); // 动态获取市场指数
      
    // 每分钟更新时间
    this.timer = setInterval(() => {
      this.updateCurrentTime();
    }, 60000);
  },

  onUnload() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  },

  // 获取报价列表
  fetchQuoteList() {
    const db = wx.cloud.database();
    // 从云数据库 'quotes' 集合获取数据
    db.collection('quotes').orderBy('updateTime', 'desc').limit(50).get().then(res => {
      // 数据处理：添加一些前端需要的辅助字段
      const list = res.data.map((item, index) => ({
        ...item,
        id: item._id || index, // 确保有id字段
        type: item.type || 'stock', 
        group: item.group || 'all',
        term: item.term || '1M',
        structure: item.structure || 'vanilla',
        rates: item.rates || { '100': item.price || 0 }
      }));
      
      this.setData({ _fullQuoteList: list });
      this.filterQuoteList();
      console.log('云数据库获取行情成功', list);
    }).catch(err => {
      console.error('云数据库获取行情失败', err);
      wx.showToast({ title: '行情加载失败', icon: 'none' });
    });
  },

  // 加载收藏数据（优先从云端拉取，降级用本地）
  loadFavorites() {
    // 先用本地录快速显示
    try {
      const local = wx.getStorageSync(FAVORITES_STORAGE_KEY);
      if (local) this.setData({ favoritesById: local });
    } catch (e) { /* ignore */ }

    // 异步拉取云端最新数据
    api.request('/groups/favorites', 'GET').then(res => {
      if (res && res.data && typeof res.data === 'object') {
        this.setData({ favoritesById: res.data });
        // 回写本地保持同步
        try {
          wx.setStorageSync(FAVORITES_STORAGE_KEY, res.data);
        } catch (e) { /* ignore */ }
      }
    }).catch(err => {
      console.warn('云端自选获取失败，使用本地数据', err);
    });
  },

  // 保存收藏数据（本地+云端同步）
  saveFavorites() {
    const favoritesById = this.data.favoritesById;
    // 本地先保
    try {
      wx.setStorageSync(FAVORITES_STORAGE_KEY, favoritesById);
    } catch (e) {
      console.error('本地保存收藏失败', e);
    }
    // 异步同步云端（防抖策略：500ms）
    if (this._saveFavTimer) clearTimeout(this._saveFavTimer);
    this._saveFavTimer = setTimeout(() => {
      api.request('/groups/favorites', 'PUT', { favoritesById }).catch(err => {
        console.warn('云端自选同步失败', err);
      });
    }, 500);
  },

  // 加载自定义分组
  loadCustomGroups() {
    const db = wx.cloud.database();
    db.collection('groups').get().then(res => {
      this.setData({ customGroups: res.data });
      this.computeGroupCounts();
    }).catch(err => {
      console.error('从云数据库加载自定义分组失败', err);
      // 备选方案：尝试从本地存储加载
      const groups = wx.getStorageSync(CUSTOM_GROUPS_STORAGE_KEY);
      if (groups) {
        this.setData({ customGroups: groups });
      }
    });
  },

  // 保存自定义分组
  saveCustomGroups() {
    try {
      wx.setStorageSync(CUSTOM_GROUPS_STORAGE_KEY, this.data.customGroups);
    } catch (e) {
      console.error('保存自定义分组失败', e);
    }
  },

  // 动态获取市场指数
  fetchMarketIndexes() {
    api.request('/stock/market-indexes', 'GET').then(res => {
      if (res && res.data && Array.isArray(res.data)) {
        this.setData({ marketIndexes: res.data });
      }
    }).catch(err => {
      // 接口失败不影响主流程，保留默认占位数据
      console.warn('市场指数获取失败，使用默认数据', err);
    });
  },

  // 更新时间
  updateCurrentTime() {
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2, '0') + ':' + 
                   now.getMinutes().toString().padStart(2, '0');
    this.setData({ currentTime: timeStr });
  },

  // 切换主Tab
  switchPrimaryTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ 
      activePrimaryTab: tab,
      activeSubTab: 'all',
      searchKeyword: ''
    });
    this.filterQuoteList();
  },
  switchPrimaryTabFromComponent(e) {
    const tab = e.detail.tab;
    this.setData({ activePrimaryTab: tab, activeSubTab: 'all', searchKeyword: '' });
    this.filterQuoteList();
  },
  onSearchInputFromComponent(e) {
    this.setData({ searchKeyword: e.detail.value });
    this.filterQuoteList();
  },
  switchTermFromComponent(e) {
    this.setData({ activeTerm: e.detail.term });
    this.filterQuoteList();
  },
  switchStructureFromComponent(e) {
    this.setData({ activeStructure: e.detail.structure });
    this.filterQuoteList();
  },

  // 切换子Tab
  switchSubTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeSubTab: tab });
    this.filterQuoteList();
  },

  // 切换期限
  switchTerm(e) {
    const term = e.currentTarget.dataset.term;
    this.setData({ activeTerm: term });
    this.filterQuoteList();
  },

  // 切换结构
  switchStructure(e) {
    const structure = e.currentTarget.dataset.structure;
    this.setData({ activeStructure: structure });
    this.filterQuoteList();
  },

  // 搜索输入
  onSearchInput(e) {
    const keyword = e.detail.value;
    this.setData({ searchKeyword: keyword });
    this.filterQuoteList();
  },

  openSearchPage() {
    const q = encodeURIComponent(String(this.data.searchKeyword || '').trim());
    wx.navigateTo({ url: `/pages/search/search?source=inquiry&q=${q}` });
  },

  // 清空搜索
  onSearchClear() {
    this.setData({ searchKeyword: '' });
    this.filterQuoteList();
  },

  // 过滤报价列表
  filterQuoteList() {
    const { 
      _fullQuoteList, 
      activePrimaryTab, 
      activeSubTab, 
      activeTerm, 
      activeStructure, 
      searchKeyword, 
      favoritesById 
    } = this.data;

    let list = _fullQuoteList;

    // 根据主Tab过滤
    if (activePrimaryTab === 'self') {
      // 自选Tab：只显示已收藏的条目
      list = list.filter(item => favoritesById[item.id]);
      // 根据子Tab过滤
      if (activeSubTab !== 'all') {
        list = list.filter(item => {
          const fav = favoritesById[item.id];
          return fav && (fav.groupId || 'all') === activeSubTab;
        });
      }
    } else {
      // 其他Tab：根据类型过滤
      const typeMap = {
        'stock': 'stock',
        'index': 'index', 
        'etf': 'etf'
      };
      list = list.filter(item => item.type === typeMap[activePrimaryTab]);
    }

    // 非自选页才应用 期限/结构 过滤，避免用户已添加的自选被隐藏
    if (activePrimaryTab !== 'self') {
      if (activeTerm) {
        list = list.filter(item => item.term === activeTerm);
      }
      if (activeStructure) {
        list = list.filter(item => item.structure === activeStructure);
      }
    }

    // 根据搜索关键字过滤
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      list = list.filter(item => 
        item.name.toLowerCase().includes(keyword) || 
        item.code.toLowerCase().includes(keyword)
      );
    }

    this.setData({ quoteList: list });
  },

  // 切换收藏状态
  toggleFavorite(e) {
    const id = (e && e.detail && e.detail.id) !== undefined ? e.detail.id : (e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.id : undefined);
    const favoritesById = { ...this.data.favoritesById };
    if (this.data.disableFavoriteActions) return;
    
    if (favoritesById[id]) {
      delete favoritesById[id];
      wx.showToast({ title: '已取消自选', icon: 'none' });
    } else {
      let groupId = this.data.activeSubTab;
      if (groupId === 'all') {
        const holding = this.data.systemGroups.find(g => g.id === 'holding');
        if (holding) {
          groupId = 'holding';
        } else if (this.data.customGroups && this.data.customGroups.length > 0) {
          groupId = this.data.customGroups[0].id;
        } else {
          groupId = 'holding';
        }
      }
      favoritesById[id] = { groupId };
      wx.showToast({ title: '已添加自选', icon: 'none' });
      this.setData({ animatingFavoriteId: id, showSuccessAnim: true });
      setTimeout(() => { this.setData({ animatingFavoriteId: null }); }, 220);
      setTimeout(() => { this.setData({ showSuccessAnim: false }); }, 1200);
    }
    
    this.setData({ favoritesById });
    this.saveFavorites();
    this.filterQuoteList();
    this.computeGroupCounts();
    this.onFavoriteChanged({
      id,
      isFavorite: !!favoritesById[id],
      groupId: favoritesById[id] ? favoritesById[id].groupId : null
    });
  },

  // 显示数据说明
  showDataExplanation() {
    this.setData({ showDataInfo: true });
  },

  // 关闭数据说明
  onDataInfoClose() {
    this.setData({ showDataInfo: false });
  },

  // 显示询价表单
  showInquiryForm(e) {
    const id = (e && e.detail && e.detail.id) !== undefined ? e.detail.id : (e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.id : undefined);
    const item = this.data.quoteList.find(item => item.id === id);
    this.setData({ 
      showInquiryForm: true,
      'inquiryForm.selectedProduct': item
    });
  },

  // 关闭询价表单
  hideInquiryForm() {
    this.setData({ 
      showInquiryForm: false,
      inquiryForm: {
        selectedProduct: null,
        optionType: 'call',
        structure: 'vanilla',
        term: '1M',
        notionalAmount: '',
        strikePrice: '100',
        selectedDealers: ['CICC'],
        contactName: '',
        contactPhone: '',
        contactEmail: '',
        notes: ''
      },
      formErrors: {}
    });
  },

  // 表单输入（兼容 van-field change 事件）
  onFormInput(e) {
    const field = e.currentTarget.dataset.field;
    const d = e && e.detail;
    const val = typeof d === 'string' ? d : (d && d.value) || '';
    if (!field) return;
    const form = { ...this.data.inquiryForm };
    form[field] = val;
    const errors = { ...this.data.formErrors };
    if (errors[field]) delete errors[field];
    this.setData({ inquiryForm: form, formErrors: errors });
  },

  // 表单提交按钮（与 wxml 绑定）
  submitInquiryForm() {
    this.submitInquiry();
  },

  // 询价单参数变更回调
  onOptionTypeChange(e) {
    this.setData({ 'inquiryForm.optionType': e.detail });
  },
  onStructureChange(e) {
    this.setData({ 'inquiryForm.structure': e.detail });
  },
  onTermChange(e) {
    this.setData({ 'inquiryForm.term': e.detail });
  },
  onDealersChange(e) {
    this.setData({ 'inquiryForm.selectedDealers': e.detail });
  },

  // 提交询价
  submitInquiry() {
    // 表单验证
    const errors = {};
    const { inquiryForm } = this.data;
    
    if (!inquiryForm.selectedProduct) {
      errors.selectedProduct = '请选择标的';
    }
    if (!inquiryForm.notionalAmount) {
      errors.notionalAmount = '请输入名义本金';
    }
    if (!inquiryForm.strikePrice) {
      errors.strikePrice = '请输入行权价';
    }
    if (!inquiryForm.contactName) {
      errors.contactName = '请输入联系人';
    }
    if (!inquiryForm.contactPhone) {
      errors.contactPhone = '请输入联系电话';
    }
    
    if (Object.keys(errors).length > 0) {
      this.setData({ formErrors: errors });
      wx.showToast({ title: '请完善信息', icon: 'none' });
      return;
    }
    
    this.setData({ isSubmitting: true });
    
    // 获取用户信息，支持未登录用户提交询价
    const storedUserInfo = wx.getStorageSync('userInfo') || {};
    
    // 从登录服务获取当前用户信息
    const loginService = require('../../utils/loginService.js');
    const currentUser = loginService.getCurrentUser() || {};
    
    // 组合用户信息：优先使用当前登录用户，其次是存储的用户信息
    const userInfo = {
      ...storedUserInfo,
      ...currentUser,
      userId: currentUser.userId || storedUserInfo.userId || 'anonymous_' + Date.now(),
      openid: currentUser.openid || storedUserInfo.openid || 'anonymous',
      nickname: currentUser.nickName || storedUserInfo.nickName || storedUserInfo.userInfo?.nickName || inquiryForm.contactName || '匿名用户'
    };
    
    // 构造提交数据（与后台格式保持一致）
    const submitData = {
      // 产品信息
      selectedProduct: {
        name: inquiryForm.selectedProduct.name,
        code: inquiryForm.selectedProduct.code,
        type: inquiryForm.selectedProduct.type || 'stock'
      },
      productName: inquiryForm.selectedProduct.name,
      productCode: inquiryForm.selectedProduct.code,
      
      // 询价参数
      optionType: inquiryForm.optionType,
      structure: inquiryForm.structure,
      term: inquiryForm.term,
      notionalAmount: inquiryForm.notionalAmount,
      strikePrice: inquiryForm.strikePrice,
      selectedDealers: inquiryForm.selectedDealers || [],
      
      // 联系信息
      contactName: inquiryForm.contactName,
      phone: inquiryForm.contactPhone,  // 注意：后台使用 phone 字段
      contactPhone: inquiryForm.contactPhone,
      contactEmail: inquiryForm.contactEmail || '',
      notes: inquiryForm.notes || '',
      
      // 状态与时间
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      
      // 用户信息
      userId: userInfo.userId || userInfo.openid || 'anonymous_' + Date.now(),
      userName: userInfo.nickname || inquiryForm.contactName || '匿名用户',
      openid: userInfo.openid || 'anonymous',
      
      // 额外字段（便于后台管理）
      source: 'miniprogram',
      history: [],
      
      // 确保联系信息也被保存
      contactInfo: {
        name: inquiryForm.contactName,
        phone: inquiryForm.contactPhone,
        email: inquiryForm.contactEmail
      }
    };
    
    console.log('提交询价数据:', submitData);
    
    // 通过云函数提交询价（带服务端校验）
    submitInquiry(submitData).then(result => {
      console.log('询价提交成功，ID:', result.data.inquiryId);
      wx.showToast({ 
        title: '询价提交成功', 
        icon: 'success',
        duration: 2000
      });
      
      // 重置表单
      this.setData({
        inquiryForm: {
          selectedProduct: null,
          optionType: 'call',
          structure: 'vanilla',
          term: '1M',
          notionalAmount: '',
          strikePrice: '100',
          selectedDealers: ['CICC'],
          contactName: '',
          contactPhone: '',
          contactEmail: '',
          notes: ''
        }
      });
      
      this.hideInquiryForm();
    }).catch(err => {
      console.error('提交询价失败:', err);
      wx.showToast({ 
        title: '提交失败：' + (err.message || '请重试'), 
        icon: 'none',
        duration: 3000
      });
    }).finally(() => {
      this.setData({ isSubmitting: false });
    });
  },

  // 批量询价
  batchInquiry() {
    const { favoritesById, quoteList } = this.data;
    const favoriteList = quoteList.filter(item => favoritesById[item.id]);
    
    if (favoriteList.length === 0) {
      wx.showToast({ title: '请先添加自选标的', icon: 'none' });
      return;
    }
    
    wx.showToast({ title: '批量询价功能开发中', icon: 'none' });
  },

  // 快速询价
  quickInquiry() {
    wx.showToast({ title: '快速询价功能开发中', icon: 'none' });
  },

  /**
   * 自选状态变更回调
   * 用于与其他组件联动，例如更新分组计数、触发埋点等
   */
  onFavoriteChanged(payload) {
    // 默认行为：更新分组计数已在toggleFavorite中调用
    // 预留扩展：可在此处上报埋点或调用外部回调
  },

  // 显示分组管理弹层
  showGroupManage() {
    this.setData({ 
      showGroupManagePopup: true,
      pendingDisplayGroupId: this.data.activeSubTab,
      isEditMode: false
    });
  },

  // 关闭分组管理弹层
  onGroupManageClose() {
    this.setData({ showGroupManagePopup: false });
  },

  // 选择待显示分组
  selectPendingGroup(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ pendingDisplayGroupId: id });
  },

  // 确认分组管理
  onGroupManageConfirm() {
    this.setData({ 
      activePrimaryTab: 'self',
      activeSubTab: this.data.pendingDisplayGroupId,
      showGroupManagePopup: false
    });
    this.filterQuoteList();
  },

  // 取消分组管理
  onGroupManageCancel() {
    this.setData({ showGroupManagePopup: false });
  },

  // 打开新建分组弹窗
  openNewGroupDialog() {
    this.setData({ 
      showNewGroupDialog: true,
      newGroupName: '',
      newGroupError: '',
      canConfirmNewGroup: false,
      newGroupLoading: false
    });
  },

  // 关闭新建分组弹窗
  closeNewGroupDialog() {
    this.setData({ showNewGroupDialog: false });
  },

  // 新建分组输入
  onNewGroupInput(e) {
    const name = e.detail;
    let error = '';
    let canConfirm = false;
    
    if (!name.trim()) {
      error = '分组名称不能为空';
    } else if (name.length > 20) {
      error = '分组名称不能超过20个字';
    } else if (this.data.customGroups.some(g => g.name === name.trim())) {
      error = '分组名称已存在';
    } else {
      canConfirm = true;
    }
    
    this.setData({
      newGroupName: name,
      newGroupError: error,
      canConfirmNewGroup: canConfirm
    });
  },

  // 确认新建分组
  confirmNewGroup() {
    if (!this.data.canConfirmNewGroup || this.data.newGroupLoading) return;
    
    this.setData({ newGroupLoading: true });
    
    const db = wx.cloud.database();
    const newGroupName = this.data.newGroupName.trim();
    
    db.collection('groups').add({
      data: {
        name: newGroupName,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    }).then(res => {
      const newGroup = {
        id: res._id,
        name: newGroupName
      };
      
      const customGroups = [...this.data.customGroups, newGroup];
      this.setData({ 
        customGroups,
        showNewGroupDialog: false,
        newGroupLoading: false
      });
      
      wx.showToast({ title: '新建分组成功', icon: 'none' });
      this.computeGroupCounts();
    }).catch(err => {
      console.error('新建分组失败', err);
      wx.showToast({ title: '创建失败', icon: 'none' });
      this.setData({ newGroupLoading: false });
    });
  },

  // 切换编辑模式
  toggleEditMode() {
    this.setData({ isEditMode: !this.data.isEditMode });
  },

  // 打开重命名分组弹窗
  openRenameGroupDialog(e) {
    const id = e.currentTarget.dataset.id;
    const group = this.data.customGroups.find(g => g.id === id);
    
    this.setData({
      showRenameGroupDialog: true,
      editingGroupId: id,
      editingGroupName: group.name,
      renameGroupError: '',
      canConfirmRename: false
    });
  },

  // 关闭重命名分组弹窗
  closeRenameGroupDialog() {
    this.setData({ showRenameGroupDialog: false });
  },

  // 重命名分组输入
  onRenameGroupInput(e) {
    const name = e.detail;
    let error = '';
    let canConfirm = false;
    
    if (!name.trim()) {
      error = '分组名称不能为空';
    } else if (name.length > 20) {
      error = '分组名称不能超过20个字';
    } else if (this.data.customGroups.some(g => g.name === name.trim() && g.id !== this.data.editingGroupId)) {
      error = '分组名称已存在';
    } else {
      canConfirm = true;
    }
    
    this.setData({
      editingGroupName: name,
      renameGroupError: error,
      canConfirmRename: canConfirm
    });
  },

  // 确认重命名分组
  confirmRenameGroup() {
    if (!this.data.canConfirmRename) return;
    
    const db = wx.cloud.database();
    const groupId = this.data.editingGroupId;
    const newName = this.data.editingGroupName.trim();
    
    db.collection('groups').doc(groupId).update({
      data: {
        name: newName,
        updateTime: db.serverDate()
      }
    }).then(() => {
      const customGroups = this.data.customGroups.map(g => 
        g.id === groupId || g._id === groupId 
          ? { ...g, name: newName }
          : g
      );
      
      this.setData({ 
        customGroups,
        showRenameGroupDialog: false
      });
      
      wx.showToast({ title: '重命名成功', icon: 'none' });
    }).catch(err => {
      console.error('重命名分组失败', err);
      wx.showToast({ title: '重命名失败', icon: 'none' });
    });
  },

  // 打开删除分组弹窗
  openDeleteGroupDialog(e) {
    const id = e.currentTarget.dataset.id;
    const group = this.data.customGroups.find(g => g.id === id);
    
    // 计算需要迁移的自选数量
    const { favoritesById } = this.data;
    const migrationCount = Object.values(favoritesById)
      .filter(fav => (fav.groupId || 'all') === id).length;
    
    // 获取可用于迁移的目标分组
    const availableTargetGroups = this.data.customGroups
      .filter(g => g.id !== id)
      .map(g => ({ id: g.id, name: g.name }));
    
    this.setData({
      showDeleteGroupDialog: true,
      editingGroupId: id,
      deleteRemoveFavorites: false,
      deleteMigrationCount: migrationCount,
      availableTargetGroups,
      selectedTargetGroupId: availableTargetGroups.length > 0 ? availableTargetGroups[0].id : null
    });
  },

  // 关闭删除分组弹窗
  closeDeleteGroupDialog() {
    this.setData({ showDeleteGroupDialog: false, deleteRemoveFavorites: false });
  },

  toggleDeleteRemoveFavorites() {
    this.setData({ deleteRemoveFavorites: !this.data.deleteRemoveFavorites });
  },

  // 选择迁移目标分组
  onTargetGroupChange(e) {
    const { value } = e.detail;
    this.setData({
      selectedTargetGroupId: value
    });
  },

  // 确认删除分组
  confirmDeleteGroup() {
    const { editingGroupId, favoritesById } = this.data;
    const removeFavorites = this.data.deleteRemoveFavorites === true;
    const db = wx.cloud.database();

    db.collection('groups').doc(editingGroupId).remove().then(() => {
      let updatedFavorites = { ...favoritesById };

      Object.keys(updatedFavorites).forEach(id => {
        const fav = updatedFavorites[id];
        if ((fav && (fav.groupId || 'all')) !== editingGroupId) return;

        if (removeFavorites) {
          delete updatedFavorites[id];
          return;
        }

        const next = { ...fav };
        if ('groupId' in next) {
          delete next.groupId;
        }
        updatedFavorites[id] = next;
      });
      
      // 删除分组
      const customGroups = this.data.customGroups.filter(g => (g.id || g._id) !== editingGroupId);
      const nextActiveSubTab = this.data.activeSubTab === editingGroupId ? 'all' : this.data.activeSubTab;
      
      this.setData({ 
        customGroups,
        favoritesById: updatedFavorites,
        showDeleteGroupDialog: false,
        deleteRemoveFavorites: false,
        activeSubTab: nextActiveSubTab
      }, () => {
        this.saveFavorites();
        this.filterQuoteList();
        this.computeGroupCounts();
        wx.showToast({ title: '删除成功', icon: 'none' });
      });
    }).catch(err => {
      console.error('删除分组失败', err);
      wx.showToast({ title: '删除失败', icon: 'none' });
    });
  },

  openEditGroups() {
    // 打开分组管理弹窗并直接进入编辑模式
    this.setData({ 
      showGroupManagePopup: true,
      pendingDisplayGroupId: this.data.activeSubTab,
      isEditMode: true
    });
  },

  computeGroupCounts() {
    const { favoritesById } = this.data;
    const counts = logic.computeGroupCountsFromFavorites(favoritesById);
    this.setData({ groupCountsById: counts, canEditFavorites: (counts.all || 0) > 0 });
  },

  addToSelection() {
    this.setData({ isEditing: true, isAddingMode: true, selectedForEdit: [], selectedForEditSet: {} });
    wx.showToast({ title: '请选择要添加的条目', icon: 'none' });
  },

  editSelection() {
    this.setData({ isEditing: true, isAddingMode: false, selectedForEdit: [], selectedForEditSet: {} });
    wx.showToast({ title: '请选择要删除的自选', icon: 'none' });
  },

  cancelEditing() {
    this.setData({ isEditing: false, isAddingMode: false, selectedForEdit: [], selectedForEditSet: {} });
  },

  onRowTap(e) {
    if (this.data.isEditing) {
      this.toggleEditSelection(e);
    } else {
      this.goToDetail(e);
    }
  },

  toggleEditSelection(e) {
    const id = (e && e.detail && e.detail.id) !== undefined ? e.detail.id : (e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.id : undefined);
    if (id === undefined || id === null || id === '') return;
    
    // 移除之前的 Number 转换逻辑
    const selected = [...this.data.selectedForEdit];
    const idx = selected.indexOf(id);
    if (idx > -1) {
      selected.splice(idx, 1);
      const set = { ...this.data.selectedForEditSet };
      delete set[id];
      this.setData({ selectedForEdit: selected, selectedForEditSet: set });
    } else {
      selected.push(id);
      const set = { ...this.data.selectedForEditSet, [id]: true };
      this.setData({ selectedForEdit: selected, selectedForEditSet: set });
    }
  },

  confirmAddToSelection() {
    const { selectedForEdit, systemGroups, customGroups, favoritesById } = this.data;
    if (!selectedForEdit.length) {
      wx.showToast({ title: '请先选择条目', icon: 'none' });
      return;
    }
    const groups = systemGroups.filter(g => g.id !== 'all').concat(customGroups);
    const names = groups.map(g => g.name);
    wx.showActionSheet({
      itemList: names,
      success: (res) => {
        const groupId = groups[res.tapIndex].id;
        const updated = { ...favoritesById };
        selectedForEdit.forEach(id => {
          updated[id] = { groupId };
        });
        this.setData({ favoritesById: updated, isEditing: false, isAddingMode: false, selectedForEdit: [], selectedForEditSet: {} });
        this.saveFavorites();
        this.filterQuoteList();
        wx.showToast({ title: '已添加至分组', icon: 'none' });
      }
    });
  },

  confirmRemoveFromSelection() {
    const { selectedForEdit, favoritesById } = this.data;
    if (!selectedForEdit.length) {
      wx.showToast({ title: '请先选择条目', icon: 'none' });
      return;
    }
    const updated = { ...favoritesById };
    selectedForEdit.forEach(id => {
      delete updated[id];
    });
    this.setData({ favoritesById: updated, isEditing: false, isAddingMode: false, selectedForEdit: [], selectedForEditSet: {} });
    this.saveFavorites();
    this.filterQuoteList();
    wx.showToast({ title: '已从自选移除', icon: 'none' });
  },

  onBottomConfirm() {
    if (this.data.isAddingMode) {
      this.confirmAddToSelection();
    } else {
      this.confirmRemoveFromSelection();
    }
  },

  // 跳转到详情页
  goToDetail(e) {
    const id = (e && e.detail && e.detail.id) !== undefined ? e.detail.id : (e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.id : undefined);
    wx.navigateTo({
      url: `/pages/inquiry/detail/detail?id=${id}`
    });
  },

  // 跳转到计算器
  goToCalculator() {
    wx.navigateTo({
      url: '/pages/calculator/calculator'
    });
  },

  // 跳转到工作台
  goToWorkspace() {
    wx.navigateTo({
      url: '/pages/workspace/workspace'
    });
  },

  // 添加自选按钮点击事件
  addFavorites() {
    // 显示添加自选弹窗
    this.setData({ 
      showAddFavoritesPopup: true,
      addFavoritesSearch: '',
      addFavoritesCategory: 'all'
    });
    this.loadAddFavoritesStockList();
  },

  // 隐藏添加自选弹窗
  hideAddFavoritesPopup() {
    this.setData({ showAddFavoritesPopup: false });
  },

  // 加载添加自选股票列表
  loadAddFavoritesStockList() {
    const { _fullQuoteList, addFavoritesCategory, addFavoritesSearch, favoritesById } = this.data;
    // 仅从现有报价数据生成候选股票，确保添加后能在自选页显示
    let allStocks = _fullQuoteList
      .filter(item => item.type === 'stock')
      .map(item => ({
        id: item.id,
        name: item.name,
        code: item.code,
        price: `${item.rates ? item.rates['100'] : 0}%`, // 兼容 rates 可能为空的情况
        changePercent: item.changePercent,
        category: item.group || '全部'
      }));

    // 分类筛选
    if (addFavoritesCategory !== 'all') {
      allStocks = allStocks.filter(stock => {
        switch (addFavoritesCategory) {
          case 'industry':
            return stock.code.startsWith('60') || stock.code.startsWith('00') || stock.code.startsWith('300');
          case 'sector':
            return true;
          case 'market':
            return stock.code.startsWith('60') || stock.code.startsWith('00') || stock.code.startsWith('300');
          default:
            return true;
        }
      });
    }

    // 搜索筛选
    if (addFavoritesSearch) {
      const keyword = String(addFavoritesSearch).trim().toLowerCase();
      allStocks = allStocks.filter(stock =>
        stock.name.toLowerCase().includes(keyword) ||
        stock.code.toLowerCase().includes(keyword)
      );
    }

    // 标记已添加状态
    const favoritedIds = new Set(Object.keys(favoritesById));
    const enriched = allStocks.map(s => ({ ...s, favorited: favoritedIds.has(String(s.id)) }));

    this.setData({ addFavoritesStockList: enriched });
  },

  // 添加自选搜索输入
  onAddFavoritesSearch(e) {
    const d = e && e.detail;
    const val = typeof d === 'string' ? d : (d && d.value) || '';
    this.setData({ addFavoritesSearch: val });
    this.loadAddFavoritesStockList();
  },

  onAddFavoritesSearchConfirm() {
    const keyword = String(this.data.addFavoritesSearch).trim().toLowerCase();
    const match = this.data.addFavoritesStockList.find(s => 
      s.name.toLowerCase().includes(keyword) || s.code.toLowerCase().includes(keyword)
    );
    if (match) {
      wx.navigateTo({ url: `/pages/inquiry/detail/detail?id=${match.id}` });
    } else {
      wx.showToast({ title: '未找到标的', icon: 'none' });
    }
  },

  // 切换添加自选分类
  switchAddFavoritesCategory(e) {
    const category = e.currentTarget.dataset.category;
    this.setData({ addFavoritesCategory: category });
    this.loadAddFavoritesStockList();
  },

  // 快速添加股票
  quickAddStock(e) {
    const stockId = e.currentTarget.dataset.id; // 直接使用原始ID，不转Number
    const stock = this.data.addFavoritesStockList.find(s => s.id == stockId); // 使用双等号兼容类型

    if (!stock || this.data.favoritesById[stockId]) {
      return;
    }

    const favoritesById = { ...this.data.favoritesById };
    let groupId = this.data.activeSubTab;
    if (groupId === 'all') {
      const holding = this.data.systemGroups.find(g => g.id === 'holding');
      if (holding) {
        groupId = 'holding';
      } else if (this.data.customGroups && this.data.customGroups.length > 0) {
        groupId = this.data.customGroups[0].id;
      } else {
        groupId = 'holding';
      }
    }
    favoritesById[stockId] = { groupId };

    this.setData({ 
      favoritesById,
      animatingFavoriteId: stockId,
      showSuccessAnim: true
    });

    this.saveFavorites();
    this.filterQuoteList();
    this.computeGroupCounts();

    setTimeout(() => { this.setData({ showSuccessAnim: false }); }, 1600);

    if (this.onFavoriteChanged) {
      this.onFavoriteChanged({ id: stockId, isFavorite: true, groupId: this.data.activeSubTab });
    }

    this.loadAddFavoritesStockList();
  },

  openOptionQuote(e) {
    const id = e.currentTarget.dataset.id;
    if (id !== undefined && id !== null && id !== '') {
      wx.navigateTo({ url: `/pages/inquiry/detail/detail?id=${id}` });
    }
  },

  // 编辑自选按钮点击事件
  editFavorites() {
    if (!this.data.canEditFavorites) {
      wx.showToast({ title: '暂无自选可编辑', icon: 'none' });
      return;
    }
    // 进入编辑模式
    this.setData({ 
      isEditing: true, 
      isAddingMode: false, 
      selectedForEdit: [] 
    });
    wx.showToast({ 
      title: '请选择要编辑的自选标的', 
      icon: 'none' 
    });
  },

  onQuickActionItemTap(e) {
    const type = e.currentTarget.dataset.type;
    if (type === 'calculator') {
      this.goToCalculator();
    } else if (type === 'workspace') {
      this.goToWorkspace();
    }
  }
});

