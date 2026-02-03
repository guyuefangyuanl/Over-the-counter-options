const accountService = require('../../utils/accountService.js');
const app = getApp();

Page({
  data: {
    userInfo: null, // 用户信息
    accounts: [
      { id: 'W0008888', name: '场外期权账户' },
      { id: 'M0008888', name: '模拟账户' }
    ],
    selectedAccount: { id: 'W0008888', name: '场外期权账户' },
    showAccountSelector: false,
    overview: { totalScale: 0, totalProfit: 0, completedProfit: 0 },
    costDetails: { total: 0, optionFee: 0, commission: 0 },
    isCostExpanded: false,
    activeTab: 'continuing',
    allPositions: [],
    filteredPositions: []
  },

  onLoad() {
    this.loadPageData()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 2
      })
    }
    // 每次显示时刷新用户资料
    this.fetchUserProfile();
  },

  onPullDownRefresh() {
    this.loadPageData().finally(() => wx.stopPullDownRefresh())
  },

  toggleAccountSelector() {
    this.setData({ showAccountSelector: !this.data.showAccountSelector })
  },

  switchAccount(e) {
    const id = e.currentTarget.dataset.id
    const next = this.data.accounts.find(a => a.id === id) || this.data.selectedAccount
    this.setData({ selectedAccount: next, showAccountSelector: false })
    this.loadPageData()
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
    this.filterPositions()
  },

  toggleCostDetails() {
    this.setData({ isCostExpanded: !this.data.isCostExpanded })
  },

  handleAddPosition() {
    // 如果是开发环境且没有持仓，尝试生成测试数据
    if (this.data.allPositions.length === 0) {
        wx.showModal({
            title: '测试数据',
            content: '当前无持仓，是否生成测试数据？',
            success: async (res) => {
                if (res.confirm) {
                    try {
                        await accountService.seedPositions();
                        this.loadPageData();
                    } catch (e) {
                        wx.showToast({ title: '生成失败', icon: 'none' });
                    }
                }
            }
        })
    } else {
        wx.showToast({ title: '录入持仓开发中', icon: 'none' })
    }
  },

  handlePositionAction(e) {
    const id = e.currentTarget.dataset.id
    const action = e.currentTarget.dataset.action
    console.log('position action', id, action)
  },

  // 获取用户资料
  async fetchUserProfile() {
      try {
          const user = await accountService.getUserProfile();
          this.setData({ userInfo: user });
      } catch (e) {
          console.error('获取用户资料失败', e);
      }
  },

  // 更新头像
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail 
    this.setData({ 'userInfo.avatar': avatarUrl })
    // 上传到服务器需要先上传文件，这里简化直接更新URL（如果是微信临时URL，需要持久化）
    // 实际生产中应先 wx.uploadFile 换取永久链接
    // 这里演示更新接口调用
    accountService.updateUserProfile({ avatar: avatarUrl });
  },

  // 更新昵称
  onNicknameChange(e) {
      const nickname = e.detail.value;
      this.setData({ 'userInfo.nickname': nickname });
      accountService.updateUserProfile({ nickname });
  },

  async loadPageData() {
    wx.showLoading({ title: '加载中' })
    
    try {
      // 1. 获取资产概览
      const overviewData = await accountService.getAssetOverview();
      
      // 2. 获取持仓列表
      const positionsData = await accountService.getPositions(1, 100); // 获取前100条
      
      // 数据映射
      const overview = {
          totalScale: overviewData.totalMarketValue || 0,
          totalProfit: overviewData.totalProfitLoss || 0,
          completedProfit: 0 // 后端暂未返回已结平仓盈亏
      };

      const positions = (positionsData.items || []).map(p => {
          const quantity = p.quantity || 0;
          const price = p.price || 0; // 成本价
          const marketValue = p.marketValue || 0;
          const currentPrice = quantity ? (marketValue / quantity).toFixed(3) : 0;
          const pnl = p.profitLoss || 0;
          // 计算收益率
          const costBasis = quantity * price;
          const pnlRate = costBasis ? ((pnl / costBasis) * 100).toFixed(2) : 0;
          
          return {
              id: p._id,
              productName: p.productName || '未知产品',
              dealer: '自营', // 后端未返回
              notional: marketValue, // 暂用市值代替名义本金展示
              fillPrice: price,
              currentPrice: currentPrice,
              pnlRate: pnlRate,
              pnl: pnl,
              daysLeft: 30, // 后端未返回到期日，暂硬编码
              status: p.status === 'active' ? 'CONTINUING' : 'CLOSED',
              statusText: p.status === 'active' ? '存续中' : '已完结'
          };
      });

      this.setData({ overview, allPositions: positions });
      this.filterPositions();
      
    } catch (e) {
        console.error('加载账户数据失败', e);
        wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading()
    }
  },

  filterPositions() {
    const tab = this.data.activeTab
    const list = this.data.allPositions || []
    let filtered = []
    if (tab === 'continuing') filtered = list.filter(i => i.status === 'CONTINUING')
    else if (tab === 'expiring') filtered = list.filter(i => i.status === 'CONTINUING' && Number(i.daysLeft) <= 7)
    else if (tab === 'closed') filtered = list.filter(i => i.status === 'CLOSED')
    this.setData({ filteredPositions: filtered })
  }
})