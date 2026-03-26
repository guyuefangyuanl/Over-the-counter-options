/**
 * 持仓卡片组件
 * 用于首页持仓案例展示，支持三种状态：存续中/临近到期/已完结
 */
Component({
  properties: {
    // 持仓列表
    positions: {
      type: Array,
      value: []
    },
    // 当前激活的Tab
    activeTab: {
      type: String,
      value: 'active'
    },
    // 是否为示例数据
    isMock: {
      type: Boolean,
      value: false
    },
    // 是否显示加载错误
    hasError: {
      type: Boolean,
      value: false
    },
    // 是否显示动画
    animate: {
      type: Boolean,
      value: false
    }
  },

  data: {
    tabs: [
      { key: 'active', label: '存续中' },
      { key: 'expiring', label: '临近到期' },
      { key: 'finished', label: '已完结' }
    ]
  },

  methods: {
    /**
     * Tab 切换
     */
    onTabChange(e) {
      const { tab } = e.currentTarget.dataset;
      this.triggerEvent('tabchange', { tab });
    },

    /**
     * 持仓项点击
     */
    onItemTap(e) {
      const { id, indexstatus } = e.currentTarget.dataset;
      this.triggerEvent('itemtap', { id, indexStatus: indexstatus });
    },

    /**
     * 查看全部点击
     */
    onViewAllTap() {
      this.triggerEvent('viewall');
    },

    /**
     * 空状态操作点击
     */
    onEmptyActionTap() {
      this.triggerEvent('viewall');
    }
  }
});