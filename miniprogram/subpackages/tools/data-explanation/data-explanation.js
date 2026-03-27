// pages/data-explanation/data-explanation.js
Page({
  data: {
    sections: [
      {
        id: 'position-status',
        title: '一、持仓状态',
        content: [
          {
            term: '开仓',
            definition: '开仓存续中的持仓。'
          },
          {
            term: '部分完结',
            definition: '部分规模已平仓，部分规模还是存续中的持仓。'
          },
          {
            term: '完结',
            definition: '已全部完结的持仓。'
          }
        ]
      },
      {
        id: 'position-categories',
        title: '二、持仓分类菜单',
        content: [
          {
            term: '存续持仓',
            definition: '所有存续且未到期的持仓。'
          },
          {
            term: '近期到期',
            definition: '到期日距当前交易日小于等于5个交易日的未完结持仓（香草）。'
          },
          {
            term: '已到期',
            definition: '已到或已过到期，但未处理完结的持仓。'
          },
          {
            term: '已完结',
            definition: '已完结的持仓。'
          }
        ]
      },
      {
        id: 'position-scale',
        title: '三、持仓规模',
        content: [
          {
            term: '存续规模',
            definition: '当前未完结的名义本金，以万为单位。'
          },
          {
            term: '开仓规模',
            definition: '创建持仓的的初始名义本金，以万为单位。'
          }
        ]
      },
      {
        id: 'price-distance',
        title: '四、价格、距离相关点位百分比',
        content: [
          {
            term: '现价',
            definition: '标的的实时行情价格，小程序支持下拉刷新获取最新行情数据。'
          },
          {
            term: '执行价',
            definition: '香草结构中的基本要素，合约约定的可行权价格。',
            formula: '看涨香草执行价 = 期初进场价格 × 结构中的百分比执行价',
            example: '如：标的现价11.5元入场的虚值110的期权结构执行价为11.5×110%=12.65；11.5元入场的8090的期权结构执行价为11.5×80%=9.2。'
          },
          {
            term: '距执行价',
            definition: '（现价-执行价）/现价×100%，若现价>执行价，显示红色，表示现价已超过执行价X%；若现价<执行价，显示绿色，表示现价还需涨X%可达执行价。'
          },
          {
            term: '盈亏平衡点',
            definition: '香草结构中超过盈亏平衡点之后开始实际盈利，盈亏平衡点已将期权费率等成本均包含在内。',
            formulas: [
              {
                type: '买入香草看涨',
                formula: '盈亏平衡点价格 = （期权费率+百分比执行价-1）×期初价格+期初价格',
                example: '实值90，期权费率13.17%，盈亏平衡点=（13.17%+90%-1）×11.5+11.5'
              },
              {
                type: '买入8080、9090等折价香草看涨',
                formula: '盈亏平衡点价格 = （期权费率+百分比执行价-1）×期初价格/(1-卖出百分比参与率)+期初价格',
                example: '实值9090，期权费率13.17%，盈亏平衡点=（13.17%+90%-1）×11.5/(1-10%)+11.5'
              }
            ]
          },
          {
            term: '距盈亏平衡点',
            definition: '（现价-盈亏平衡点）/现价×100%，若现价>盈亏平衡点，显示红色，表示现价已超过盈亏平衡点x%；若现价<盈亏平衡点，显示绿色，表示现价还需涨x%可达盈亏平衡点。'
          }
        ]
      },
      {
        id: 'profit-cost',
        title: '五、盈利、投入成本',
        content: [
          {
            term: '净盈利',
            definition: '剔除成本费用之后的实际到手利润，具体以结算结果为准。',
            formulas: [
              {
                type: '香草看涨存续净盈利',
                formula: 'max(现价-行权价)×参与率×存续规模/期初价格-（期权费率+前端绝对费率）×存续规模'
              },
              {
                type: '到期未处理持仓',
                description: '以到期日收盘价为基准，判定持仓的状态，从而计算得出净盈利。'
              },
              {
                type: '完结持仓',
                description: '根据持仓生命周期事件的实际现金流计算得出净盈利。'
              }
            ]
          },
          {
            term: '投入成本',
            definition: '香草期权费等成本费用，雪球初始&追加保证金，气囊初始&追加保证金、期权费、前端绝对成本等费用。'
          },
          {
            term: '净利率',
            definition: '净利率=实际净盈利/投入成本。'
          }
        ]
      }
    ],
    expandedSections: {}, // 展开的章节
    lastUpdateTime: '2024/12/30 11:00:58'
  },

  onLoad: function (options) {
    wx.setNavigationBarTitle({
      title: '持仓数据说明'
    });
    
    // 默认展开第一个章节
    this.setData({
      ['expandedSections.position-status']: true
    });
  },

  // 切换章节展开状态
  toggleSection: function (e) {
    const sectionId = e.currentTarget.dataset.sectionId;
    const currentState = this.data.expandedSections[sectionId] || false;
    
    this.setData({
      [`expandedSections.${sectionId}`]: !currentState
    });
  },

  // 展开所有章节
  expandAll: function () {
    const expandedSections = {};
    this.data.sections.forEach(section => {
      expandedSections[section.id] = true;
    });
    
    this.setData({
      expandedSections: expandedSections
    });
  },

  // 折叠所有章节
  collapseAll: function () {
    this.setData({
      expandedSections: {}
    });
  },

  // 复制文本内容
  copyText: function (e) {
    const text = e.currentTarget.dataset.text;
    wx.setClipboardData({
      data: text,
      success: function () {
        wx.showToast({
          title: '已复制到剪贴板',
          icon: 'success'
        });
      }
    });
  },

  // 分享页面
  onShareAppMessage: function () {
    return {
      title: '期权持仓数据说明',
      path: '/pages/data-explanation/data-explanation'
    };
  },

  // 返回上一页
  goBack: function () {
    wx.navigateBack();
  },

  // 搜索功能
  searchContent: function (e) {
    const keyword = e.detail.value.toLowerCase();
    if (!keyword) {
      // 重置显示状态
      this.setData({
        searchKeyword: '',
        searchResults: []
      });
      return;
    }

    const results = [];
    this.data.sections.forEach((section, sectionIndex) => {
      section.content.forEach((item, itemIndex) => {
        if (item.term.toLowerCase().includes(keyword) || 
            item.definition.toLowerCase().includes(keyword)) {
          results.push({
            sectionIndex,
            itemIndex,
            sectionTitle: section.title,
            term: item.term,
            definition: item.definition
          });
        }
      });
    });

    this.setData({
      searchKeyword: keyword,
      searchResults: results
    });
  },

  // 跳转到搜索结果
  jumpToResult: function (e) {
    const result = e.currentTarget.dataset.result;
    const sectionId = this.data.sections[result.sectionIndex].id;
    
    // 展开对应章节
    this.setData({
      [`expandedSections.${sectionId}`]: true
    });

    // 滚动到对应位置
    wx.pageScrollTo({
      selector: `#section-${sectionId}`,
      duration: 500
    });
  }
});