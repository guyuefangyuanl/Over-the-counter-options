// miniprogram/pages/inquiry/inquiry.js
const FAVORITES_STORAGE_KEY = 'INQUIRY_FAVORITES_V1';

const logic = require('../../utils/inquiry-logic.js');

Page({
  data: {
    currentTime: '', // 当前时间
    
    // 询价表单数据
    inquiryForm: {
      selectedProduct: null,
      quantity: '',
      contactName: '',
      contactPhone: '',
      contactEmail: '',
      notes: ''
    },
    
    // 表单验证错误
    formErrors: {},
    
    // 是否显示询价表单
    showInquiryForm: false,
    
    // 是否正在提交
    isSubmitting: false,
    
    // 市场指数
    marketIndexes: [
      { name: '上证指数', value: '3002.64', changePercent: -0.42 },
      { name: '深证成指', value: '9064.84', changePercent: -1.07 },
      { name: '创业板指', value: '1755.88', changePercent: -1.26 },
      { name: '沪深300', value: '3508.71', changePercent: -0.55 },
      { name: '中证500', value: '5198.01', changePercent: -0.89 },
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
    customGroups: [
      { id: 'group1', name: '核心资产' },
      { id: 'group2', name: '科技龙头' },
    ],

    // 交易商数据
    selectedDealers: ['CICC', 'CITIC'], // 默认选中的交易商
    allDealers: [
      { id: 'CICC', name: '中金' },
      { id: 'CITIC', name: '中信' },
      { id: 'GJS', name: '国君' },
    ],

    // 完整的报价列表 (模拟数据)
    _fullQuoteList: [
      { id: 1, group: 'group1', type: 'stock', name: '贵州茅台', code: '600519', changePercent: 1.23, term: '1M', structure: 'vanilla', dealers: ['CICC', 'CITIC'], rates: { '100': 10.50, '105': 8.30, '110': 6.50 } },
      { id: 2, group: 'group1', type: 'stock', name: '宁德时代', code: '300750', changePercent: -2.45, term: '1M', structure: 'vanilla', dealers: ['CICC', 'GJS'], rates: { '100': 12.80, '105': 10.20, '110': 8.90 } },
      { id: 3, group: 'group2', type: 'stock', name: '比亚迪', code: '002594', changePercent: 3.10, term: '2M', structure: 'vanilla', dealers: ['CITIC'], rates: { '100': 15.25, '105': 12.85, '110': 10.45 } },
      { id: 4, group: 'holding', type: 'stock', name: '药明康德', code: '603259', changePercent: 0.55, term: '3M', structure: 'snowball', dealers: ['CICC', 'CITIC', 'GJS'], rates: { '100': 18.00, '105': 15.50, '110': 13.00 } },
      { id: 5, group: 'all', type: 'index', name: '沪深300指数', code: '000300', changePercent: -0.55, term: '1M', structure: 'vanilla', dealers: ['GJS'], rates: { '100': 5.50, '105': 4.30, '110': 3.50 } },
    ],

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
    
    // 添加自选弹窗相关状态
    showAddFavoritesPopup: false,  // 是否显示添加自选弹窗
    addFavoritesSearch: '',        // 添加自选搜索关键词
    addFavoritesCategory: 'all',   // 当前选中的分类
    
    // 快捷按钮拖动相关状态
    quickActionsPosition: { x: 0, y: 0 },  // 当前位置
    quickActionsStartPos: { x: 0, y: 0 },  // 拖动起始位置
    isDraggingQuickActions: false,         // 是否正在拖动
    quickActionsAnimation: {},              // 动画对象
    dragStartPosition: { x: 0, y: 0 },     // 记录拖动开始时的位置，用于判断是否为有效拖动
    longPressTimer: null,                  // 长按定时器
    canDragAfterLongPress: false,          // 长按后是否可以拖动
    addFavoritesStockList: [],     // 添加自选股票列表
  },

  onLoad() {
    this.loadFavorites();
    this.filterQuoteList();
    this.updateCurrentTime();
    this.computeGroupCounts();
    this.setData({ canEditFavorites: (this.data.groupCountsById.all || 0) > 0 });
    
    // 初始化快捷按钮位置（右下角）
    const systemInfo = wx.getWindowInfo();
    const initialX = systemInfo.windowWidth - 110; // 距离右边 110px
    const initialY = systemInfo.windowHeight - 400; // 距离底部 400px
    this.setData({
      'quickActionsPosition.x': initialX,
      'quickActionsPosition.y': initialY
    });
    
    // 首次使用时显示拖动提示
    const hasShownDragTip = wx.getStorageSync('hasShownQuickActionsDragTip');
    if (!hasShownDragTip) {
      setTimeout(() => {
        wx.showToast({
          title: '长按可拖动按钮位置',
          icon: 'none',
          duration: 3000
        });
        wx.setStorageSync('hasShownQuickActionsDragTip', true);
      }, 1000);
    }
    
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

  // 加载收藏数据
  loadFavorites() {
    try {
      const fav = wx.getStorageSync(FAVORITES_STORAGE_KEY);
      if (fav) {
        this.setData({ favoritesById: fav });
      }
    } catch (e) {
      console.error('加载收藏失败', e);
    }
  },

  // 保存收藏数据
  saveFavorites() {
    try {
      wx.setStorageSync(FAVORITES_STORAGE_KEY, this.data.favoritesById);
    } catch (e) {
      console.error('保存收藏失败', e);
    }
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
        quantity: '',
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

  // 提交询价
  submitInquiry() {
    // 表单验证
    const errors = {};
    const { inquiryForm } = this.data;
    
    if (!inquiryForm.selectedProduct) {
      errors.selectedProduct = '请选择产品';
    }
    if (!inquiryForm.quantity) {
      errors.quantity = '请输入数量';
    }
    if (!inquiryForm.contactName) {
      errors.contactName = '请输入联系人';
    }
    if (!inquiryForm.contactPhone) {
      errors.contactPhone = '请输入联系电话';
    }
    
    if (Object.keys(errors).length > 0) {
      this.setData({ formErrors: errors });
      return;
    }
    
    this.setData({ isSubmitting: true });
    
    // 模拟提交
    setTimeout(() => {
      wx.showToast({ title: '询价提交成功', icon: 'success' });
      this.hideInquiryForm();
      this.setData({ isSubmitting: false });
    }, 1500);
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
    
    // 模拟新建分组
    setTimeout(() => {
      const newGroup = {
        id: 'group' + Date.now(),
        name: this.data.newGroupName.trim()
      };
      
      const customGroups = [...this.data.customGroups, newGroup];
      this.setData({ 
        customGroups,
        showNewGroupDialog: false,
        newGroupLoading: false
      });
      
      wx.showToast({ title: '新建分组成功', icon: 'none' });
    }, 500);
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
    
    const customGroups = this.data.customGroups.map(g => 
      g.id === this.data.editingGroupId 
        ? { ...g, name: this.data.editingGroupName.trim() }
        : g
    );
    
    this.setData({ 
      customGroups,
      showRenameGroupDialog: false
    });
    
    wx.showToast({ title: '重命名成功', icon: 'none' });
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
      deleteMigrationCount: migrationCount,
      availableTargetGroups,
      selectedTargetGroupIndex: availableTargetGroups.length > 0 ? 0 : -1,
      targetGroupDisplayText: availableTargetGroups.length > 0 ? availableTargetGroups[0].name : ''
    });
  },

  // 关闭删除分组弹窗
  closeDeleteGroupDialog() {
    this.setData({ showDeleteGroupDialog: false });
  },

  // 选择迁移目标分组
  onTargetGroupChange(e) {
    const index = e.detail.value;
    const targetGroup = this.data.availableTargetGroups[index];
    this.setData({
      selectedTargetGroupIndex: index,
      targetGroupDisplayText: targetGroup.name
    });
  },

  // 确认删除分组
  confirmDeleteGroup() {
    const { editingGroupId, deleteMigrationCount, availableTargetGroups, selectedTargetGroupIndex, favoritesById } = this.data;
    
    let updatedFavorites = { ...favoritesById };
    
    // 如果需要迁移
    if (deleteMigrationCount > 0 && availableTargetGroups.length > 0) {
      const targetGroupId = availableTargetGroups[selectedTargetGroupIndex].id;
      Object.keys(updatedFavorites).forEach(id => {
        if ((updatedFavorites[id].groupId || 'all') === editingGroupId) {
          updatedFavorites[id].groupId = targetGroupId;
        }
      });
    } else {
      // 直接删除该分组的自选
      Object.keys(updatedFavorites).forEach(id => {
        if ((updatedFavorites[id].groupId || 'all') === editingGroupId) {
          delete updatedFavorites[id];
        }
      });
    }
    
    // 删除分组
    const customGroups = this.data.customGroups.filter(g => g.id !== editingGroupId);
    
    this.setData({ 
      customGroups,
      favoritesById: updatedFavorites,
      showDeleteGroupDialog: false
    });
    
    this.saveFavorites();
    this.filterQuoteList();
    this.computeGroupCounts();
    wx.showToast({ title: '删除成功', icon: 'none' });
  },

  openEditGroups() {
    // 打开编辑模式，而不是提示暂不开放
    this.toggleEditMode();
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
    const rawId = (e && e.detail && e.detail.id) !== undefined ? e.detail.id : (e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.id : undefined);
    if (rawId === undefined || rawId === null || rawId === '') return;
    let id = Number(rawId);
    if (Number.isNaN(id)) {
      id = parseInt(rawId, 10);
      if (Number.isNaN(id)) return;
    }
    const selected = this.data.selectedForEdit.map(Number);
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
      url: '/pages/calculator/index'
    });
  },

  // 跳转到工作台
  goToWorkspace() {
    wx.navigateTo({
      url: '/pages/workspace/index'
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
        price: `${item.rates['100']}%`,
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
    const rawId = e.currentTarget.dataset.id;
    const stockId = Number(rawId);
    const stock = this.data.addFavoritesStockList.find(s => Number(s.id) === stockId);

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

  // 快捷按钮拖动相关方法
  onQuickActionsTouchStart(e) {
    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    
    this.setData({ 
      isDraggingQuickActions: false,
      quickActionsStartPos: {
        x: touchX - this.data.quickActionsPosition.x,
        y: touchY - this.data.quickActionsPosition.y
      },
      dragStartPosition: {
        x: touchX,
        y: touchY
      }
    });
    
    // 设置长按定时器（500ms后进入拖动模式）
    const longPressTimer = setTimeout(() => {
      this.setData({ 
        isDraggingQuickActions: true 
      });
      // 震动反馈（如果支持）
      if (wx.vibrateShort) {
        wx.vibrateShort();
      }
    }, 500);
    
    this.setData({ longPressTimer });
  },

  onQuickActionsTouchMove(e) {
    // 如果没有进入拖动模式，直接返回
    if (!this.data.isDraggingQuickActions) return;
    
    const systemInfo = wx.getWindowInfo();
    const windowWidth = systemInfo.windowWidth;
    const windowHeight = systemInfo.windowHeight;
    
    // 将rpx转换为px（1rpx = windowWidth / 750 px）
    const rpxToPx = windowWidth / 750;
    const buttonWidth = 86 * rpxToPx; // 按钮宽度
    const buttonHeight = 180 * rpxToPx; // 两个按钮的总高度
    
    let newX = e.touches[0].clientX - this.data.quickActionsStartPos.x;
    let newY = e.touches[0].clientY - this.data.quickActionsStartPos.y;
    
    // 边界检测，确保按钮不会超出屏幕
    newX = Math.max(0, Math.min(newX, windowWidth - buttonWidth));
    newY = Math.max(0, Math.min(newY, windowHeight - buttonHeight));
    
    this.setData({
      'quickActionsPosition.x': newX,
      'quickActionsPosition.y': newY
    });
  },

  onQuickActionsTouchEnd(e) {
    // 清除长按定时器
    if (this.data.longPressTimer) {
      clearTimeout(this.data.longPressTimer);
      this.setData({ longPressTimer: null });
    }
    
    const wasDragging = this.data.isDraggingQuickActions;
    
    this.setData({ 
      isDraggingQuickActions: false 
    });
    
    // 如果在拖动状态，添加吸附到边缘的逻辑
    if (wasDragging) {
      const systemInfo = wx.getWindowInfo();
      const windowWidth = systemInfo.windowWidth;
      const rpxToPx = windowWidth / 750;
      const buttonWidth = 86 * rpxToPx;
      const currentX = this.data.quickActionsPosition.x;
      
      // 如果靠近边缘（50px内），吸附到边缘
      if (currentX < 50) {
        this.setData({
          'quickActionsPosition.x': 10
        });
      } else if (currentX > windowWidth - buttonWidth - 50) {
        this.setData({
          'quickActionsPosition.x': windowWidth - buttonWidth - 10
        });
      }
    }
  },

  onQuickActionsTap(e) {
    if (this.data.isDraggingQuickActions) {
      return;
    }
  },

  onQuickActionItemTap(e) {
    if (this.data.isDraggingQuickActions) {
      return;
    }
    const type = e.currentTarget.dataset.type;
    if (type === 'calculator') {
      this.goToCalculator();
    } else if (type === 'workspace') {
      this.goToWorkspace();
    }
  },

  // 原有的跳转方法
  goToCalculator() {
    wx.navigateTo({ url: '/pages/calculator/calculator' });
  },

  goToWorkspace() {
    wx.navigateTo({ url: '/pages/workbench/workbench' });
  }
});
