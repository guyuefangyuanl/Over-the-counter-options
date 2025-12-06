Page({
  data: {
    activePrimaryTab: '自选',
    activeSecondaryTab: '全部',
    filters: { period: '1M', dealer: 'best' },
    quoteList: [],
    showGroupManager: false,
    showOrderIntentPopup: false,
    selectedQuote: null,
    loading: false,
    secondaryGroups: ['全部', '持仓', '沪深', '港股', '美股'],
    periodOptions: ['1M', '2M', '3M', '6M'],
    dealerOptions: [{ key: 'best', name: '最优' }, { key: 'ZXZZ', name: 'ZXZZ' }, { key: 'HTCC', name: 'HTCC' }]
  },

  onLoad() { this.fetchQuoteData(); },

  switchPrimaryTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activePrimaryTab: tab });
    this.fetchQuoteData();
  },

  switchSecondaryTab(e) {
    const group = e.currentTarget.dataset.group;
    this.setData({ activeSecondaryTab: group });
    this.fetchQuoteData();
  },

  onPeriodChange(e) {
    const idx = Number(e.detail.value);
    const period = this.data.periodOptions[idx];
    this.setData({ filters: { ...this.data.filters, period } });
    this.fetchQuoteData();
  },

  onDealerChange(e) {
    const idx = Number(e.detail.value);
    const dealer = this.data.dealerOptions[idx].key;
    this.setData({ filters: { ...this.data.filters, dealer } });
    this.fetchQuoteData();
  },

  onPeriodChipTap(e) {
    const period = e.currentTarget.dataset.period;
    if (!period || period === this.data.filters.period) return;
    this.setData({ filters: { ...this.data.filters, period } });
    this.fetchQuoteData();
  },

  async fetchQuoteData() {
    this.setData({ loading: true });
    const list = await new Promise(resolve => {
      setTimeout(() => {
        resolve([
          { code: '600519', name: '贵州茅台', change: '+1.23%', atm: '11.83%', otm105: '9.45%', otm110: '8.10%', dealer: 'CICC', period: this.data.filters.period },
          { code: '000858', name: '五粮液', change: '-0.85%', atm: '10.12%', otm105: '8.01%', otm110: '6.92%', dealer: 'CITIC', period: this.data.filters.period }
        ]);
      }, 300);
    });
    this.setData({ quoteList: list, loading: false });
  },

  goToDetail(e) {
    const code = e.currentTarget.dataset.code;
    wx.navigateTo({ url: '/pages/quote/detail?code=' + code });
  },

  goToSearch() { wx.navigateTo({ url: '/pages/search/index' }); },

  showOrderIntent(e) {
    const quote = e.currentTarget.dataset.quote;
    this.setData({ selectedQuote: quote, showOrderIntentPopup: true });
  },

  closeOrderIntent() { this.setData({ showOrderIntentPopup: false }); },

  openGroupManager() { this.setData({ showGroupManager: true }); },

  onGroupUpdated() { this.setData({ showGroupManager: false }); },

  showDataInfo() { wx.showModal({ title: '数据说明', content: '报价为演示数据', showCancel: false }); }
});
