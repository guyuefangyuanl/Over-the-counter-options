// miniprogram/pages/inquiry/detail/detail.js

Page({
  data: {
    keyword: '',
    product: null,
    structure: 'vanilla',
    term: '1M',
    terms: ['1M', '2M', '3M', '6M'],
    strikes: ['80', '85', '90', '95', '100', '103', '105', '108', '110'],
    rateMatrix: [],   // 预计算的费率矩阵 [rowIndex][colIndex]
    isLoading: false,
    isEmpty: false
  },

  onLoad(q) {
    if (q && q.id) {
      this.loadProductById(q.id);
    } else if (q && q.code) {
      this.searchByCode(q.code);
    }
  },

  /**
   * 根据ID从云数据库加载产品报价
   */
  loadProductById(id) {
    this.setData({ isLoading: true, isEmpty: false });
    const db = wx.cloud.database();
    db.collection('quotes').doc(id).get().then(res => {
      if (res.data) {
        const product = this._normalizeProduct(res.data);
        this.setData({ product, keyword: product.name, isLoading: false });
        this._buildRateMatrix();
      } else {
        this.setData({ isLoading: false, isEmpty: true });
      }
    }).catch(err => {
      console.error('加载报价数据失败:', err);
      this.setData({ isLoading: false, isEmpty: true });
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  /**
   * 根据代码搜索产品
   */
  searchByCode(code) {
    this.setData({ isLoading: true, isEmpty: false });
    const db = wx.cloud.database();
    db.collection('quotes').where({
      code: db.RegExp({ regexp: code, options: 'i' })
    }).limit(1).get().then(res => {
      if (res.data && res.data.length > 0) {
        const product = this._normalizeProduct(res.data[0]);
        this.setData({ product, keyword: product.name, isLoading: false });
        this._buildRateMatrix();
      } else {
        this.setData({ isLoading: false, isEmpty: true });
        wx.showToast({ title: '未找到标的', icon: 'none' });
      }
    }).catch(err => {
      console.error('搜索标的失败:', err);
      this.setData({ isLoading: false, isEmpty: true });
    });
  },

  /**
   * 标准化产品数据，兼容不同字段格式
   */
  _normalizeProduct(item) {
    return {
      ...item,
      id: item._id || item.id,
      name: item.name || '',
      code: item.code || '',
      type: item.type || 'stock',
      changePercent: item.changePercent || 0,
      rates: item.rates || {}
    };
  },

  /**
   * 预计算费率矩阵
   * rateMatrix[行索引][列索引] = "13.00%"
   */
  _buildRateMatrix() {
    const { product, strikes, terms } = this.data;
    if (!product || !product.rates) {
      this.setData({ rateMatrix: [] });
      return;
    }

    const matrix = [];
    for (var i = 0; i < strikes.length; i++) {
      var row = [];
      var strikeKey = strikes[i];
      var baseRate = product.rates[strikeKey];

      for (var j = 0; j < terms.length; j++) {
        if (baseRate === undefined || baseRate === null) {
          row.push('--');
        } else {
          // 期限调整系数：1M=0, 2M=+0.6, 3M=+1.2, 6M=+2.0
          var adj = j === 0 ? 0 : j === 1 ? 0.6 : j === 2 ? 1.2 : 2.0;
          row.push((baseRate + adj).toFixed(2) + '%');
        }
      }
      matrix.push(row);
    }

    this.setData({ rateMatrix: matrix });
  },

  switchStructure(e) {
    var s = e.currentTarget.dataset.structure;
    this.setData({ structure: s });
    this._buildRateMatrix();
  },

  switchTerm(e) {
    var t = e.currentTarget.dataset.term;
    this.setData({ term: t });
  },

  onKeywordInput(e) {
    var d = e && e.detail;
    var val = typeof d === 'string' ? d : (d && d.value) || '';
    this.setData({ keyword: val });
  },

  onKeywordConfirm() {
    var k = String(this.data.keyword).trim();
    if (!k) return;

    this.setData({ isLoading: true, isEmpty: false });
    var db = wx.cloud.database();
    var regex = db.RegExp({ regexp: k, options: 'i' });

    db.collection('quotes').where(
      db.command.or([
        { name: regex },
        { code: regex }
      ])
    ).limit(1).get().then(res => {
      if (res.data && res.data.length > 0) {
        var product = this._normalizeProduct(res.data[0]);
        this.setData({ product: product, keyword: product.name, isLoading: false });
        this._buildRateMatrix();
      } else {
        this.setData({ isLoading: false, isEmpty: true });
        wx.showToast({ title: '未找到标的', icon: 'none' });
      }
    }).catch(err => {
      console.error('搜索失败:', err);
      this.setData({ isLoading: false });
      wx.showToast({ title: '搜索失败', icon: 'none' });
    });
  },

  goBack() {
    wx.navigateBack();
  },

  goCalculator() {
    wx.navigateTo({ url: '/pages/calculator/calculator' });
  },

  goWorkspace() {
    wx.navigateTo({ url: '/pages/workspace/workspace' });
  }
});
