Component({
  data: {
    selected: 0,
    color: "#999999",
    selectedColor: "#409EFF",
    list: [{
      pagePath: "/pages/index/index",
      text: "首页"
    }, {
      pagePath: "/pages/quotes/quotes",
      text: "询价"
    }, {
      pagePath: "/pages/account/account",
      text: "账户"
    }, {
      pagePath: "/pages/profile/profile",
      text: "我的"
    }]
  },
  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset
      const url = data.path
      wx.switchTab({url})
    }
  }
})