/**
 * 响应式适配工具
 * 提供小程序屏幕尺寸检测和响应式布局支持
 */

// 屏幕断点定义
const BREAKPOINTS = {
  XS: 320,   // 超小屏
  SM: 375,   // 小屏（iPhone SE等）
  MD: 414,   // 中屏（iPhone Plus等）
  LG: 768,   // 大屏（iPad Mini等）
  XL: 1024   // 超大屏（iPad Pro等）
};

// 设备类型枚举
const DeviceType = {
  XS: 'xs',      // 宽度 < 375
  SM: 'sm',      // 375 <= 宽度 < 414
  MD: 'md',      // 414 <= 宽度 < 768
  LG: 'lg',      // 768 <= 宽度 < 1024
  XL: 'xl'       // 宽度 >= 1024
};

// 方向枚举
const Orientation = {
  PORTRAIT: 'portrait',
  LANDSCAPE: 'landscape'
};

class ResponsiveAdapter {
  constructor() {
    this.systemInfo = null;
    this.currentBreakpoint = null;
    this.deviceType = null;
    this.orientation = null;
    this.isInitialized = false;
    this.listeners = [];
  }

  /**
   * 初始化适配器
   */
  init() {
    if (this.isInitialized) return;

    this._updateSystemInfo();

    // 监听屏幕旋转
    if (typeof wx !== 'undefined' && wx.onWindowResize) {
      wx.onWindowResize((res) => {
        this._updateSystemInfo();
        this._notifyListeners();
      });
    }

    this.isInitialized = true;
  }

  /**
   * 更新系统信息
   */
  _updateSystemInfo() {
    try {
      this.systemInfo = wx.getSystemInfoSync();
      const { windowWidth, windowHeight, screenHeight, screenWidth } = this.systemInfo;

      // 计算设备类型
      this.deviceType = this._getDeviceType(windowWidth);

      // 计算方向
      this.orientation = windowWidth > windowHeight
        ? Orientation.LANDSCAPE
        : Orientation.PORTRAIT;

      // 计算断点
      this.currentBreakpoint = this._getBreakpoint(windowWidth);

      // 计算 rpx 转 px 比例
      this.rpxRatio = windowWidth / 750;

    } catch (e) {
      console.error('[响应式适配] 获取系统信息失败:', e);
    }
  }

  /**
   * 根据宽度获取设备类型
   */
  _getDeviceType(width) {
    if (width < BREAKPOINTS.SM) return DeviceType.XS;
    if (width < BREAKPOINTS.MD) return DeviceType.SM;
    if (width < BREAKPOINTS.LG) return DeviceType.MD;
    if (width < BREAKPOINTS.XL) return DeviceType.LG;
    return DeviceType.XL;
  }

  /**
   * 获取当前断点
   */
  _getBreakpoint(width) {
    for (const [name, value] of Object.entries(BREAKPOINTS)) {
      if (width < value) return name.toLowerCase();
    }
    return 'xl';
  }

  /**
   * 添加尺寸变化监听器
   */
  addListener(callback) {
    this.listeners.push(callback);
  }

  /**
   * 移除监听器
   */
  removeListener(callback) {
    const index = this.listeners.indexOf(callback);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * 通知所有监听器
   */
  _notifyListeners() {
    const info = this.getResponsiveInfo();
    this.listeners.forEach(cb => {
      try {
        cb(info);
      } catch (e) {
        console.error('[响应式适配] 监听器执行失败:', e);
      }
    });
  }

  /**
   * 获取响应式信息
   */
  getResponsiveInfo() {
    if (!this.isInitialized) this.init();

    return {
      deviceType: this.deviceType,
      breakpoint: this.currentBreakpoint,
      orientation: this.orientation,
      windowWidth: this.systemInfo?.windowWidth || 375,
      windowHeight: this.systemInfo?.windowHeight || 667,
      screenWidth: this.systemInfo?.screenWidth || 375,
      screenHeight: this.systemInfo?.screenHeight || 667,
      pixelRatio: this.systemInfo?.pixelRatio || 2,
      rpxRatio: this.rpxRatio || 0.5,
      isSmallScreen: this.deviceType === DeviceType.XS || this.deviceType === DeviceType.SM,
      isLargeScreen: this.deviceType === DeviceType.LG || this.deviceType === DeviceType.XL,
      isLandscape: this.orientation === Orientation.LANDSCAPE
    };
  }

  /**
   * rpx 转 px
   */
  rpxToPx(rpx) {
    if (!this.rpxRatio) this._updateSystemInfo();
    return rpx * this.rpxRatio;
  }

  /**
   * px 转 rpx
   */
  pxToRpx(px) {
    if (!this.rpxRatio) this._updateSystemInfo();
    return px / this.rpxRatio;
  }

  /**
   * 根据屏幕尺寸返回不同的值
   * @param {object} config - 各屏幕尺寸对应的值
   * @example
   * adapter.getResponsiveValue({
   *   xs: 'small',
   *   sm: 'small',
   *   md: 'medium',
   *   lg: 'large',
   *   xl: 'large'
   * })
   */
  getResponsiveValue(config) {
    if (!this.isInitialized) this.init();

    const type = this.deviceType;

    // 优先精确匹配
    if (config[type] !== undefined) {
      return config[type];
    }

    // 回退到更小的尺寸
    const fallbackOrder = [DeviceType.XS, DeviceType.SM, DeviceType.MD, DeviceType.LG, DeviceType.XL];
    const currentIndex = fallbackOrder.indexOf(type);

    for (let i = currentIndex - 1; i >= 0; i--) {
      if (config[fallbackOrder[i]] !== undefined) {
        return config[fallbackOrder[i]];
      }
    }

    // 返回默认值
    return config.default || null;
  }

  /**
   * 获取适配后的字体大小
   */
  getAdaptiveFontSize(baseFontSize) {
    if (!this.isInitialized) this.init();

    const scaleMap = {
      [DeviceType.XS]: 0.85,
      [DeviceType.SM]: 0.92,
      [DeviceType.MD]: 1.0,
      [DeviceType.LG]: 1.08,
      [DeviceType.XL]: 1.15
    };

    const scale = scaleMap[this.deviceType] || 1.0;
    return Math.round(baseFontSize * scale);
  }

  /**
   * 获取适配后的间距
   */
  getAdaptiveSpacing(baseSpacing) {
    if (!this.isInitialized) this.init();

    const scaleMap = {
      [DeviceType.XS]: 0.8,
      [DeviceType.SM]: 0.9,
      [DeviceType.MD]: 1.0,
      [DeviceType.LG]: 1.2,
      [DeviceType.XL]: 1.4
    };

    const scale = scaleMap[this.deviceType] || 1.0;
    return Math.round(baseSpacing * scale);
  }

  /**
   * 获取适配后的列数
   */
  getAdaptiveColumns(config = {}) {
    const defaultConfig = {
      xs: 1,
      sm: 2,
      md: 2,
      lg: 3,
      xl: 4
    };

    const mergedConfig = { ...defaultConfig, ...config };
    return this.getResponsiveValue(mergedConfig);
  }

  /**
   * 判断是否应该隐藏次要信息
   */
  shouldHideSecondaryInfo() {
    if (!this.isInitialized) this.init();
    return this.deviceType === DeviceType.XS || this.deviceType === DeviceType.SM;
  }

  /**
   * 判断是否应该使用简化布局
   */
  shouldUseSimplifiedLayout() {
    if (!this.isInitialized) this.init();
    return this.deviceType === DeviceType.XS;
  }
}

// 创建单例
const responsiveAdapter = new ResponsiveAdapter();

// 页面混入
const ResponsiveBehavior = Behavior({
  data: {
    __responsiveInfo: null
  },

  lifetimes: {
    attached() {
      responsiveAdapter.init();
      this.setData({
        __responsiveInfo: responsiveAdapter.getResponsiveInfo()
      });
    }
  },

  methods: {
    // 获取响应式信息
    getResponsiveInfo() {
      return this.data.__responsiveInfo || responsiveAdapter.getResponsiveInfo();
    },

    // 获取适配值
    getResponsiveValue(config) {
      return responsiveAdapter.getResponsiveValue(config);
    },

    // 判断是否小屏
    isSmallScreen() {
      const info = this.getResponsiveInfo();
      return info?.isSmallScreen || false;
    },

    // 判断是否大屏
    isLargeScreen() {
      const info = this.getResponsiveInfo();
      return info?.isLargeScreen || false;
    }
  }
});

module.exports = {
  ResponsiveAdapter,
  responsiveAdapter,
  ResponsiveBehavior,
  BREAKPOINTS,
  DeviceType,
  Orientation
};