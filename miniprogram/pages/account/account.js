Page({
  data: {
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
    wx.showToast({ title: '录入持仓开发中', icon: 'none' })
  },

  handlePositionAction(e) {
    const id = e.currentTarget.dataset.id
    const action = e.currentTarget.dataset.action
    console.log('position action', id, action)
  },

  async loadPageData() {
    wx.showLoading({ title: '加载中' })
    const fetchOverview = () => new Promise(resolve => setTimeout(() => resolve({ totalScale: 1250000, totalProfit: 125050, completedProfit: 30500 }), 200))
    const fetchCosts = () => new Promise(resolve => setTimeout(() => resolve({ total: 52000, optionFee: 38000, commission: 14000 }), 200))
    const fetchPositions = () => new Promise(resolve => setTimeout(() => resolve([
      { id: 1, productName: '平安银行 香草 100C-1M', notional: 1000000, fillPrice: 2.8, currentPrice: 3.1, pnlRate: 10.7, pnl: 30000, dealer: 'CICC', daysLeft: 25, status: 'CONTINUING', statusText: '存续中' },
      { id: 2, productName: '中证1000 雪球 90P-3M', notional: 500000, fillPrice: 15.2, currentPrice: 14.9, pnlRate: -1.97, pnl: -1500, dealer: 'CITIC', daysLeft: 5, status: 'CONTINUING', statusText: '临近到期' },
      { id: 3, productName: '招商银行 香草 95C-1M', notional: 300000, fillPrice: 3.6, currentPrice: 3.9, pnlRate: 8.3, pnl: 2500, dealer: 'GJS', daysLeft: 0, status: 'CLOSED', statusText: '已完结' }
    ]), 200))
    try {
      const [overview, costs, positions] = await Promise.all([fetchOverview(), fetchCosts(), fetchPositions()])
      this.setData({ overview, costDetails: costs, allPositions: positions })
      this.filterPositions()
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