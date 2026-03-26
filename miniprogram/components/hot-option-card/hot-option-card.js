/**
 * 热门产品卡片组件
 * 用于首页热门产品展示
 */
Component({
  properties: {
    // 产品列表
    options: {
      type: Array,
      value: []
    }
  },

  methods: {
    /**
     * 产品卡片点击
     */
    onOptionTap(e) {
      const { code, name, market, structure } = e.currentTarget.dataset;
      this.triggerEvent('optiontap', { code, name, market, structure });
    },

    /**
     * 查看更多
     */
    onViewMoreTap() {
      this.triggerEvent('viewmore');
    }
  }
});