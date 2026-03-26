/**
 * 持仓行为模块
 * 提取首页持仓案例相关逻辑，支持复用
 */
const app = getApp();
const holdingsService = require('../services/holdings.js');
const { cacheGet, cacheSet, throttle } = require('../utils/performance-optimizer.js');
const { uiEnhancer } = require('../utils/enhancedUtils.js');

// 首页持仓案例 tab 与账户页 tab 的映射关系
const INDEX_TAB_MAP = {
  active: 'continuing',
  expiring: 'expiring',
  finished: 'closed'
};

// 缓存配置
const CACHE_CONFIG = {
  HOLDINGS_TTL: 60 * 1000, // 1分钟缓存
  REFRESH_INTERVAL: 30 * 1000 // 30秒刷新间隔
};

module.exports = Behavior({
  properties: {},

  data: {
    // 持仓相关状态
    holdingsAnimate: false,
    holdingsData: {
      activeTab: 'active',
      allPositions: [],
      filteredPositions: [],
      knowledge: holdingsService.getKnowledgeList()
    },
    holdingsError: false,
    holdingsIsMock: false,
    _lastHoldingsLoadTime: 0 // 用于节流
  },

  methods: {
    // ==================== 数据加载 ====================

    /**
     * 加载持仓案例数据（带缓存和节流）
     */
    async loadHoldingsData(forceRefresh = false) {
      const now = Date.now();
      const lastLoadTime = this.data._lastHoldingsLoadTime || 0;

      // 节流检查：非强制刷新时，30秒内不重复请求
      if (!forceRefresh && now - lastLoadTime < CACHE_CONFIG.REFRESH_INTERVAL) {
        console.log('[持仓] 节流拦截，使用缓存数据');
        return;
      }

      try {
        this.setData({ holdingsError: false });

        // 尝试从缓存获取
        const cacheKey = 'holdings:index';
        if (!forceRefresh) {
          const cached = cacheGet(cacheKey);
          if (cached) {
            console.log('[持仓] 使用缓存数据');
            this._setHoldingsData(cached);
            return;
          }
        }

        const { positions, knowledge, isReal } = await holdingsService.getIndexHoldingsData();
        const data = { positions, knowledge, isReal };

        // 缓存结果
        cacheSet(cacheKey, data, CACHE_CONFIG.HOLDINGS_TTL);

        this._setHoldingsData(data);
        this.setData({ _lastHoldingsLoadTime: now });
      } catch (e) {
        console.error('[持仓] 加载失败:', e);
        this.setData({
          holdingsError: false,
          holdingsIsMock: true,
          _lastHoldingsLoadTime: now
        });
        this._filterIndexPositions();
      }
    },

    /**
     * 设置持仓数据
     */
    _setHoldingsData({ positions, knowledge, isReal }) {
      this.setData({
        'holdingsData.allPositions': positions,
        'holdingsData.knowledge': knowledge,
        holdingsIsMock: !isReal
      });
      this._filterIndexPositions();
    },

    // ==================== Tab 切换 ====================

    /**
     * Tab 切换事件
     */
    onHoldingTabChange(e) {
      try {
        const tab = e.currentTarget.dataset.tab;
        if (!tab) return;

        uiEnhancer.hapticFeedback('light');

        this.setData({
          'holdingsData.activeTab': tab,
          holdingsAnimate: true
        });

        this._filterIndexPositions();

        setTimeout(() => {
          this.setData({ holdingsAnimate: false });
        }, 300);
      } catch (err) {
        console.error('切换Tab失败:', err);
      }
    },

    /**
     * 根据首页 activeTab 过滤持仓列表
     */
    _filterIndexPositions() {
      const { activeTab, allPositions = [] } = this.data.holdingsData;
      let filtered = [];

      if (activeTab === 'active') {
        // 存续中
        filtered = allPositions.filter(p => p.indexStatus === 'active');
      } else if (activeTab === 'expiring') {
        // 临近到期
        filtered = allPositions.filter(p => p.indexStatus === 'expiring');
      } else if (activeTab === 'finished') {
        // 已完结
        filtered = allPositions.filter(p => p.indexStatus === 'finished');
      }

      this.setData({ 'holdingsData.filteredPositions': filtered });
    },

    // ==================== 交互事件 ====================

    /**
     * 持仓项点击 - 跳转到账户页
     */
    onHoldingItemTap(e) {
      try {
        const { id, indexstatus } = e.currentTarget.dataset;
        uiEnhancer.hapticFeedback('light');

        // 首页 indexStatus → 账户页 tab 映射
        const accountTab = INDEX_TAB_MAP[indexstatus] || 'continuing';

        // 将目标持仓 id 和 tab 存入全局
        app.globalData.pendingPositionFocus = { positionId: id, tab: accountTab };

        wx.switchTab({
          url: '/pages/account/account',
          fail: () => {
            uiEnhancer.showToast('跳转失败', 'error');
          }
        });
      } catch (err) {
        console.error('打开持仓失败:', err);
        uiEnhancer.showToast('跳转失败', 'error');
      }
    },

    /**
     * 知识文章点击
     */
    onKnowledgeItemTap(e) {
      try {
        const { id } = e.currentTarget.dataset;
        console.log('[知识] 点击文章ID:', id);
        uiEnhancer.hapticFeedback('light');

        wx.navigateTo({
          url: `/pages/knowledge-detail/knowledge-detail?id=${id}`,
          fail: () => {
            uiEnhancer.showToast('页面开发中', 'none');
          }
        });
      } catch (err) {
        console.error('打开文章失败:', err);
        uiEnhancer.showToast('页面开发中', 'none');
      }
    },

    /**
     * 强制刷新持仓数据
     */
    refreshHoldingsData() {
      return this.loadHoldingsData(true);
    }
  }
});