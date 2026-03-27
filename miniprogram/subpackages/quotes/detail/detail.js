Page({
  data: {
    keyword: '',
    product: null,
    structure: 'vanilla',
    term: '1M',
    terms: ['1M', '2M', '3M', '6M'],
    strikes: ['80C', '85C', '90C', '95C', '100C', '103C', '105C', '108C', '110C'],
    _fullQuoteList: [
      {
        id: 1,
        group: 'group1',
        type: 'stock',
        name: '贵州茅台',
        code: '600519',
        changePercent: 1.23,
        term: '1M',
        structure: 'vanilla',
        dealers: ['CICC', 'CITIC'],
        rates: {
          '80': 13.00,
          '85': 12.10,
          '90': 11.20,
          '95': 10.20,
          '100': 10.50,
          '103': 9.40,
          '105': 8.30,
          '108': 7.30,
          '110': 6.50
        }
      },
      {
        id: 2,
        group: 'group1',
        type: 'stock',
        name: '宁德时代',
        code: '300750',
        changePercent: -2.45,
        term: '1M',
        structure: 'vanilla',
        dealers: ['CICC', 'GJS'],
        rates: {
          '80': 14.20,
          '85': 13.10,
          '90': 12.00,
          '95': 11.00,
          '100': 12.80,
          '103': 11.10,
          '105': 10.20,
          '108': 9.80,
          '110': 8.90
        }
      },
      {
        id: 3,
        group: 'group2',
        type: 'stock',
        name: '比亚迪',
        code: '002594',
        changePercent: 3.10,
        term: '2M',
        structure: 'vanilla',
        dealers: ['CITIC'],
        rates: {
          '80': 16.20,
          '85': 15.10,
          '90': 14.00,
          '95': 13.00,
          '100': 15.25,
          '103': 13.90,
          '105': 12.85,
          '108': 11.80,
          '110': 10.45
        }
      },
      {
        id: 4,
        group: 'holding',
        type: 'stock',
        name: '药明康德',
        code: '603259',
        changePercent: 0.55,
        term: '3M',
        structure: 'snowball',
        dealers: ['CICC', 'CITIC', 'GJS'],
        rates: {
          '80': 19.90,
          '85': 18.60,
          '90': 17.40,
          '95': 16.00,
          '100': 18.00,
          '103': 16.40,
          '105': 15.50,
          '108': 14.30,
          '110': 13.00
        }
      }
    ]
  },

  onLoad(q) {
    const id = q && q.id ? Number(q.id) : NaN;
    if (!Number.isNaN(id)) {
      const p = this.data._fullQuoteList.find(i => i.id === id);
      if (p) {
        this.setData({ product: p, keyword: p.name });
      }
    }
  },

  formatChange(v) {
    if (v === null || v === undefined) return '--';
    const n = Number(v);
    if (Number.isNaN(n)) return '--';
    const s = n > 0 ? '+' : '';
    return s + n.toFixed(2) + '%';
  },

  switchStructure(e) {
    const s = e.currentTarget.dataset.structure;
    this.setData({ structure: s });
  },

  switchTerm(e) {
    const t = e.currentTarget.dataset.term;
    this.setData({ term: t });
  },

  onKeywordInput(e) {
    const d = e && e.detail;
    const val = typeof d === 'string' ? d : (d && d.value) || '';
    this.setData({ keyword: val });
  },

  onKeywordConfirm() {
    const k = String(this.data.keyword).trim().toLowerCase();
    const p = this.data._fullQuoteList.find(i => 
      i.type === 'stock' && 
      (i.name.toLowerCase().includes(k) || i.code.toLowerCase().includes(k))
    );
    if (p) {
      this.setData({ product: p });
    } else {
      wx.showToast({ title: '未找到标的', icon: 'none' });
    }
  },

  getRate(strikeLabel, termIndex) {
    const s = String(strikeLabel).replace('C', '');
    const p = this.data.product;
    if (!p) return '--';
    const base = p.rates[s];
    if (base === undefined) return '--';
    const adj = termIndex === 0 ? 0 : 
                termIndex === 1 ? 0.6 : 
                termIndex === 2 ? 1.2 : 2.0;
    return (base + adj).toFixed(2) + '%';
  },

  goBack() {
    wx.navigateBack();
  },

  goCalculator() {
    wx.navigateTo({ url: '/pages/calculator/index' });
  },

  goWorkspace() {
    wx.navigateTo({ url: '/pages/workspace/index' });
  }
});