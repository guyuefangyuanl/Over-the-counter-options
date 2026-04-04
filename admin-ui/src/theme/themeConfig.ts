import type { ThemeConfig } from 'antd';

/**
 * Ant Design 主题配置
 * 基于 Element UI 设计规范，匹配原型 HTML 样式
 */
export const themeConfig: ThemeConfig = {
  token: {
    // 主色调 (Element UI 蓝)
    colorPrimary: '#409EFF',
    colorSuccess: '#67C23A',
    colorWarning: '#E6A23C',
    colorError: '#F56C6C',
    colorInfo: '#909399',

    // 文字颜色
    colorText: '#303133',
    colorTextSecondary: '#606266',
    colorTextTertiary: '#909399',
    colorTextQuaternary: '#C0C4CC',

    // 边框颜色
    colorBorder: '#DCDFE6',
    colorBorderSecondary: '#E4E7ED',

    // 背景色
    colorBgContainer: '#FFFFFF',
    colorBgElevated: '#FFFFFF',
    colorBgLayout: '#F5F7FA',
    colorBgSpotlight: '#F5F7FA',
    colorBgMask: 'rgba(0, 0, 0, 0.45)',

    // 圆角 (Element UI 使用 4px)
    borderRadius: 4,
    borderRadiusLG: 4,
    borderRadiusSM: 4,
    borderRadiusXS: 2,

    // 字体
    fontFamily: "'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif",
    fontSize: 14,
    fontSizeLG: 16,
    fontSizeSM: 12,
    fontSizeXL: 20,

    // 行高
    lineHeight: 1.5,
    lineHeightLG: 1.5,
    lineHeightSM: 1.5,

    // 间距
    padding: 16,
    paddingLG: 24,
    paddingSM: 12,
    paddingXS: 8,
    paddingXXS: 4,

    margin: 16,
    marginLG: 24,
    marginSM: 12,
    marginXS: 8,
    marginXXS: 4,

    // 控件尺寸
    controlHeight: 32,
    controlHeightLG: 40,
    controlHeightSM: 24,

    // 链接
    colorLink: '#409EFF',
    colorLinkHover: '#66B1FF',
    colorLinkActive: '#409EFF',

    // 阴影
    boxShadow: '0 2px 12px 0 rgba(0, 0, 0, 0.1)',
    boxShadowSecondary: '0 2px 8px 0 rgba(0, 0, 0, 0.08)',
  },
  components: {
    // 表格组件
    Table: {
      headerBg: '#F5F7FA',
      headerColor: '#606266',
      headerSortActiveBg: '#EBEEF5',
      headerSortHoverBg: '#EBEEF5',
      rowHoverBg: '#F5F7FA',
      headerBorderRadius: 0,
      cellPaddingBlock: 12,
      cellPaddingInline: 16,
      cellFontSize: 14,
      footerBg: '#FAFAFA',
    },

    // 按钮组件
    Button: {
      borderRadius: 4,
      borderRadiusLG: 4,
      borderRadiusSM: 4,
      primaryShadow: 'none',
      defaultShadow: 'none',
      dangerShadow: 'none',
      defaultBorderColor: '#DCDFE6',
      defaultColor: '#606266',
      defaultBg: '#FFFFFF',
      defaultHoverBg: '#FFFFFF',
      defaultHoverColor: '#409EFF',
      defaultHoverBorderColor: '#C0C4CC',
      defaultActiveBg: '#FFFFFF',
      defaultActiveColor: '#409EFF',
      defaultActiveBorderColor: '#C0C4CC',
      paddingContentHorizontal: 15,
    },

    // 选择器组件
    Select: {
      optionSelectedBg: '#F5F7FA',
      optionActiveBg: '#F5F7FA',
      optionSelectedColor: '#409EFF',
      selectorBg: '#FFFFFF',
      multipleItemBg: '#F4F4F5',
      multipleItemBorderColor: '#E9E9EB',
    },

    // 输入框组件
    Input: {
      hoverBorderColor: '#C0C4CC',
      activeBorderColor: '#409EFF',
      activeShadow: '0 0 0 2px rgba(64, 158, 255, 0.2)',
      colorTextPlaceholder: '#C0C4CC',
      paddingBlock: 4,
      paddingInline: 15,
    },

    // 数字输入框
    InputNumber: {
      hoverBorderColor: '#C0C4CC',
      activeBorderColor: '#409EFF',
      activeShadow: '0 0 0 2px rgba(64, 158, 255, 0.2)',
    },

    // 分页组件
    Pagination: {
      itemSize: 28,
      itemSizeSM: 24,
      itemActiveBg: '#409EFF',
    },

    // 模态框
    Modal: {
      borderRadiusLG: 4,
      paddingContentHorizontalLG: 24,
    },

    // 抽屉
    Drawer: {
      paddingLG: 24,
    },

    // 卡片
    Card: {
      borderRadiusLG: 4,
      paddingLG: 20,
    },

    // 表单
    Form: {
      labelColor: '#606266',
      labelFontSize: 14,
      labelRequiredMarkColor: '#F56C6C',
      itemMarginBottom: 18,
    },

    // 菜单
    Menu: {
      darkItemBg: 'transparent',
      darkItemColor: '#FFFFFF',
      darkItemHoverBg: 'rgba(255, 255, 255, 0.1)',
      darkItemHoverColor: '#FFFFFF',
      darkItemSelectedBg: 'rgba(255, 255, 255, 0.15)',
      darkItemSelectedColor: '#FFFFFF',
      darkSubMenuItemBg: 'transparent',
      itemBg: '#FFFFFF',
      itemColor: '#606266',
      itemHoverBg: '#F5F7FA',
      itemHoverColor: '#409EFF',
      itemSelectedBg: '#ECF5FF',
      itemSelectedColor: '#409EFF',
      itemBorderRadius: 0,
      itemMarginBlock: 0,
      itemMarginInline: 0,
      itemPaddingInline: 16,
      subMenuItemBg: '#FFFFFF',
      groupTitleColor: '#909399',
    },

    // 标签页
    Tabs: {
      itemColor: '#606266',
      itemHoverColor: '#409EFF',
      itemSelectedColor: '#409EFF',
      inkBarColor: '#409EFF',
      horizontalItemPadding: '12px 16px',
    },

    // 标签
    Tag: {
      borderRadiusSM: 2,
    },

    // 消息提示
    Message: {
      contentBg: '#FFFFFF',
      contentPadding: '10px 16px',
    },

    // 通知
    Notification: {
      width: 336,
      padding: 16,
    },

    // 日期选择器
    DatePicker: {
      cellActiveWithRangeBg: '#ECF5FF',
      cellHoverBg: '#F5F7FA',
      cellRangeBorderColor: '#409EFF',
    },

    // 空状态
    Empty: {
      colorText: '#909399',
      colorTextDisabled: '#C0C4CC',
    },

    // 面包屑
    Breadcrumb: {
      itemColor: '#606266',
      lastItemColor: '#303133',
      linkColor: '#606266',
      linkHoverColor: '#409EFF',
      separatorColor: '#AAAAAA',
    },

    // 下拉菜单
    Dropdown: {
      paddingBlock: 4,
      controlItemBgHover: '#F5F7FA',
      controlItemBgActive: '#ECF5FF',
    },

    // 工具提示
    Tooltip: {
      borderRadius: 4,
    },

    // 开关
    Switch: {
      colorPrimary: '#409EFF',
      colorPrimaryHover: '#66B1FF',
    },

    // 复选框
    Checkbox: {
      colorPrimary: '#409EFF',
      colorPrimaryHover: '#66B1FF',
    },

    // 单选框
    Radio: {
      colorPrimary: '#409EFF',
      colorPrimaryHover: '#66B1FF',
    },

    // 步骤条
    Steps: {
      navArrowColor: '#C0C4CC',
      colorPrimary: '#409EFF',
    },

    // 进度条
    Progress: {
      defaultColor: '#409EFF',
      remainingColor: '#EBEEF5',
    },

    // 徽标
    Badge: {
      colorError: '#F56C6C',
    },

    // 加载中
    Spin: {
      colorPrimary: '#409EFF',
    },

    // 分割线
    Divider: {
      colorSplit: '#DCDFE6',
    },

    // 头像
    Avatar: {
      colorTextPlaceholder: '#909399',
    },

    // 时间轴
    Timeline: {
      dotBg: '#FFFFFF',
      tailColor: '#E4E7ED',
    },
  },
};

export default themeConfig;