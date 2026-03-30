---
trigger: always_on
---
# 原型HTML文件规范

> 本规则适用于项目中所有原型HTML文件的设计与开发，确保原型的一致性、可维护性和向正式代码的平滑过渡。

---

## 1. 文件命名与存放位置

### 1.1 命名规范

```
prototype/
├── [页面名称].html          # 页面原型
├── [页面名称]-[状态].html   # 页面状态变体（如 login-error.html）
└── components/
    └── [组件名称].html      # 可复用组件原型
```

**命名规则：**
- 使用小写字母和连字符（kebab-case）
- 文件名应清晰表达页面/组件功能
- 状态变体使用后缀标识，如 `-loading`、`-error`、`-empty`

### 1.2 存放位置

| 类型 | 路径 |
|------|------|
| 页面原型 | `prototype/pages/[模块名]/` |
| 组件原型 | `prototype/components/` |
| 公共样式 | `prototype/styles/` |
| 资源文件 | `prototype/assets/` |

---

## 2. HTML结构规范

### 2.1 文件头部模板

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>[页面名称] - 原型</title>
  
  <!-- 原型标识 -->
  <meta name="prototype" content="true">
  <meta name="page-name" content="[页面名称]">
  <meta name="last-update" content="[日期]">
  
  <!-- 样式引入 -->
  <link rel="stylesheet" href="../styles/reset.css">
  <link rel="stylesheet" href="../styles/common.css">
  <link rel="stylesheet" href="../styles/[页面名称].css">
</head>
<body>
  <!-- 页面内容 -->
</body>
</html>
```

### 2.2 语义化标签要求

| 场景 | 推荐标签 |
|------|---------|
| 页面头部 | `<header>` |
| 导航区域 | `<nav>` |
| 主内容区 | `<main>` |
| 侧边栏 | `<aside>` |
| 独立内容块 | `<article>` |
| 内容分组 | `<section>` |
| 页面底部 | `<footer>` |
| 操作按钮组 | `<div class="btn-group">` |

### 2.3 注释规范

```html
<!-- ========== 模块开始：[模块名称] ========== -->
<section class="module-name">
  <!-- 标题区域 -->
  <header class="module-header">...</header>
  
  <!-- 内容区域 -->
  <div class="module-content">...</div>
</section>
<!-- ========== 模块结束：[模块名称] ========== -->
```

---

## 3. 样式规范

### 3.1 样式组织结构

```css
/* ========== 1. 变量定义 ========== */
:root {
  /* 颜色 */
  --color-primary: #409EFF;
  --color-success: #67C23A;
  --color-warning: #E6A23C;
  --color-danger: #F56C6C;
  --color-text-primary: #303133;
  --color-text-regular: #606266;
  --color-text-secondary: #909399;
  
  /* 字体 */
  --font-size-base: 14px;
  --font-size-small: 12px;
  --font-size-large: 16px;
  
  /* 间距 */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  
  /* 圆角 */
  --border-radius-sm: 4px;
  --border-radius-md: 8px;
  --border-radius-lg: 12px;
}

/* ========== 2. 重置样式 ========== */

/* ========== 3. 公共组件 ========== */

/* ========== 4. 页面特定样式 ========== */
```

### 3.2 类名命名规范

```
/* 命名格式：[模块]-[元素]-[状态] */

/* 推荐 */
.card {}
.card-header {}
.card-title {}
.card-body {}
.card-footer {}
.card--active {}
.card--disabled {}

/* 不推荐 */
.cardHeader {}
.card_title {}
.cardbody {}
```

### 3.3 状态类命名

| 状态 | 类名后缀 | 示例 |
|------|---------|------|
| 激活 | `--active` | `.tab--active` |
| 禁用 | `--disabled` | `.btn--disabled` |
| 加载中 | `--loading` | `.btn--loading` |
| 错误 | `--error` | `.input--error` |
| 成功 | `--success` | `.form--success` |
| 隐藏 | `--hidden` | `.modal--hidden` |

---

## 4. 组件规范

### 4.1 组件文件结构

```html
<!-- 
  组件名称：[组件名]
  功能描述：[简要描述]
  依赖：[依赖的其他组件或样式]
  使用示例：
    <div class="component-name">...</div>
-->
<div class="component-name">
  <!-- 组件内容 -->
</div>
```

### 4.2 常用组件模板

#### 按钮（Button）

```html
<!-- 主要按钮 -->
<button class="btn btn--primary">主要按钮</button>

<!-- 次要按钮 -->
<button class="btn btn--default">次要按钮</button>

<!-- 危险按钮 -->
<button class="btn btn--danger">危险按钮</button>

<!-- 禁用状态 -->
<button class="btn btn--primary btn--disabled" disabled>禁用按钮</button>

<!-- 加载状态 -->
<button class="btn btn--primary btn--loading">
  <span class="btn__loading-icon"></span>
  加载中
</button>
```

#### 表单输入框（Input）

```html
<div class="form-item">
  <label class="form-item__label">标签名称</label>
  <div class="form-item__content">
    <input type="text" class="input" placeholder="请输入">
    <span class="form-item__error">错误提示</span>
  </div>
</div>
```

#### 卡片（Card）

```html
<div class="card">
  <header class="card__header">
    <h3 class="card__title">卡片标题</h3>
    <span class="card__extra">更多</span>
  </header>
  <div class="card__body">
    卡片内容
  </div>
  <footer class="card__footer">
    卡片底部操作
  </footer>
</div>
```

#### 列表项（List Item）

```html
<div class="list-item">
  <div class="list-item__prefix">
    <img class="list-item__avatar" src="" alt="">
  </div>
  <div class="list-item__content">
    <div class="list-item__title">标题</div>
    <div class="list-item__desc">描述文字</div>
  </div>
  <div class="list-item__suffix">
    <span class="list-item__value">值</span>
  </div>
</div>
```

---

## 5. 数据模拟规范

### 5.1 模拟数据格式

```html
<script>
  // 模拟数据定义
  const MOCK_DATA = {
    // 用户信息
    user: {
      id: 'U001',
      name: '测试用户',
      avatar: '../assets/avatar.png'
    },
    
    // 列表数据
    list: [
      { id: 1, name: '项目一', status: 'active' },
      { id: 2, name: '项目二', status: 'pending' },
      { id: 3, name: '项目三', status: 'completed' }
    ],
    
    // 分页数据
    pagination: {
      current: 1,
      pageSize: 10,
      total: 50
    }
  };
</script>
```

### 5.2 数据渲染模板

```html
<!-- 列表渲染 -->
<div class="list" id="list-container">
  <!-- 使用 template 定义渲染模板 -->
  <template id="list-item-template">
    <div class="list-item" data-id="{{id}}">
      <span class="list-item__name">{{name}}</span>
      <span class="list-item__status">{{status}}</span>
    </div>
  </template>
</div>

<script>
  // 简单模板渲染
  function renderList(data) {
    const container = document.getElementById('list-container');
    const template = document.getElementById('list-item-template').innerHTML;
    
    container.innerHTML = data.map(item => 
      template
        .replace(/\{\{id\}\}/g, item.id)
        .replace(/\{\{name\}\}/g, item.name)
        .replace(/\{\{status\}\}/g, item.status)
    ).join('');
  }
  
  // 调用渲染
  renderList(MOCK_DATA.list);
</script>
```

---

## 6. 交互规范

### 6.1 交互状态

原型应展示以下交互状态：

| 状态 | 说明 | 展示方式 |
|------|------|---------|
| 默认 | 正常展示状态 | 主页面 |
| 悬停 | 鼠标悬停效果 | CSS `:hover` |
| 聚焦 | 表单元素聚焦 | CSS `:focus` |
| 激活 | 按钮点击/选中 | CSS `:active` 或 `.--active` |
| 禁用 | 不可操作状态 | `.--disabled` |
| 加载 | 数据加载中 | `.--loading` + 加载动画 |
| 空 | 无数据状态 | 空状态组件 |
| 错误 | 错误提示 | 错误提示组件 |

### 6.2 事件绑定

```html
<div class="interactive-component">
  <!-- 使用 data-* 属性存储行为标识 -->
  <button class="btn btn--primary" data-action="submit">提交</button>
  <button class="btn btn--default" data-action="cancel">取消</button>
</div>

<script>
  // 事件委托绑定
  document.querySelector('.interactive-component').addEventListener('click', function(e) {
    const action = e.target.dataset.action;
    
    switch(action) {
      case 'submit':
        handleSubmit();
        break;
      case 'cancel':
        handleCancel();
        break;
    }
  });
</script>
```

---

## 7. 响应式设计规范

### 7.1 断点定义

```css
/* 移动端优先 */
/* 默认：移动端 (< 768px) */

/* 平板 */
@media screen and (min-width: 768px) {}

/* 桌面 */
@media screen and (min-width: 1024px) {}

/* 大屏 */
@media screen and (min-width: 1440px) {}
```

### 7.2 移动端适配

```html
<head>
  <!-- 视口设置 -->
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  
  <!-- 小程序/移动端原型使用 rpx 换算 -->
  <!-- 设计稿基准：750px 宽度 -->
  <!-- 换算公式：rpx = px * 2 -->
</head>
```

---

## 8. 原型与正式代码对照

### 8.1 对照表模板

```markdown
| 原型文件 | 正式文件 | 组件映射 | 状态 |
|---------|---------|---------|------|
| prototype/pages/home.html | miniprogram/pages/index/index.wxml | home → index | 已转换 |
| prototype/components/card.html | miniprogram/components/card/card.wxml | 一对一 | 待转换 |
```

### 8.2 转换检查清单

- [ ] 语义化标签转换为小程序标签（`div` → `view`，`span` → `text`）
- [ ] CSS 类名保持一致
- [ ] 模拟数据转换为 API 接口调用
- [ ] 事件绑定转换为小程序事件（`onclick` → `bindtap`）
- [ ] 条件渲染转换（`class="--hidden"` → `wx:if`）
- [ ] 列表渲染转换（模板循环 → `wx:for`）

---

## 9. 文档与注释

### 9.1 原型说明文档

每个原型页面应在文件顶部包含说明注释：

```html
<!--
  页面名称：首页
  文件路径：prototype/pages/home.html
  设计稿：Figma - 首页 v1.2
  最后更新：2026-03-30
  维护人员：[姓名]
  
  功能说明：
  1. 市场指数展示
  2. 持仓案例列表
  3. 热门产品推荐
  4. 知识文章入口
  
  交互说明：
  - 点击持仓项跳转账户页
  - 下拉刷新更新数据
  - 搜索支持股票代码/名称
-->
```

### 9.2 组件使用说明

```html
<!--
  组件：StockCard
  用途：展示股票/期权信息卡片
  
  Props（预期）：
  - code: string - 股票代码
  - name: string - 股票名称
  - price: number - 当前价格
  - change: number - 涨跌额
  - changePercent: number - 涨跌幅
  
  Events（预期）：
  - onTap: 点击卡片
  - onFavorite: 收藏/取消收藏
  
  使用示例：
  <stock-card 
    code="600519" 
    name="贵州茅台" 
    price="1678.90" 
    changePercent="-0.73">
  </stock-card>
-->
```

---

## 10. 检查清单

### 10.1 创建原型前

- [ ] 确认设计稿版本和需求文档
- [ ] 了解目标平台（小程序/H5/APP）
- [ ] 检查是否有可复用的组件原型
- [ ] 确定需要展示的交互状态

### 10.2 开发过程中

- [ ] 使用语义化HTML标签
- [ ] 遵循命名规范
- [ ] 添加必要的注释
- [ ] 模拟真实数据
- [ ] 实现关键交互状态

### 10.3 完成后

- [ ] 多设备/多分辨率测试
- [ ] 交互状态完整性检查
- [ ] 与设计稿对比验收
- [ ] 更新对照文档
- [ ] 标记转换状态

---

## 附录：常用工具函数

```javascript
// 格式化金额
function formatMoney(value, decimals = 2) {
  return Number(value).toFixed(decimals);
}

// 格式化百分比
function formatPercent(value, decimals = 2) {
  const sign = value >= 0 ? '+' : '';
  return sign + Number(value).toFixed(decimals) + '%';
}

// 格式化日期
function formatDate(date, format = 'YYYY-MM-DD') {
  const d = new Date(date);
  const map = {
    'YYYY': d.getFullYear(),
    'MM': String(d.getMonth() + 1).padStart(2, '0'),
    'DD': String(d.getDate()).padStart(2, '0'),
    'HH': String(d.getHours()).padStart(2, '0'),
    'mm': String(d.getMinutes()).padStart(2, '0'),
    'ss': String(d.getSeconds()).padStart(2, '0')
  };
  return format.replace(/YYYY|MM|DD|HH|mm|ss/g, match => map[match]);
}

// 生成随机ID
function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
```

---

> 本规则应与项目其他规范（如 `First.md`）配合使用。如有冲突，以 `First.md` 为准。