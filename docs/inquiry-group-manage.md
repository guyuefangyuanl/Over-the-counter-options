# 询价页 - 分组管理与新建分组模块实现说明

本文档说明新增的分组管理底部弹层与新建分组弹窗的实现逻辑、接口规范、测试与视觉还原流程。

## 功能概述
- 在自选页右侧“编辑”入口弹出底部分组管理弹层，包含：
  - 显示分组列表（系统分组：`全部`、`持仓`；自定义分组：用户创建的分组）。
  - 当前待选择分组高亮与勾选。
  - 新建分组、编辑分组、取消、确定动作区。
- 新建分组弹窗：输入分组名，并实时校验：
  - 非空校验、最大长度 20 字、重名校验。
  - 通过后可点击“确定”创建分组并回填到显示分组。

## 页面/文件
- `miniprogram/pages/inquiry/inquiry.wxml`：新增底部弹层与弹窗 DOM 结构。
- `miniprogram/pages/inquiry/inquiry.wxss`：新增样式（弹层布局、列表、按钮、弹窗等）。
- `miniprogram/pages/inquiry/inquiry.js`：新增数据字段与交互方法，并与过滤、自选逻辑集成。
- `miniprogram/utils/inquiry-logic.js`：抽离纯逻辑函数，便于单元测试。
- `preview/inquiry-group-manage.html`：独立预览页面，用于像素级视觉校验（内置设计稿叠层开关）。
- `docs/inquiry-group-manage.md`：当前文档。

## 数据结构
新增（或使用）以下关键字段：
- `showGroupManagePopup: boolean`：分组管理弹层显示状态。
- `pendingDisplayGroupId: string`：待设置的显示分组 ID。
- `groupCountsById: Record<string, number>`：各分组的自选数量统计。
- `showNewGroupDialog: boolean`：新建分组弹窗显示状态。
- `newGroupName: string`：新建分组名输入值。
- `newGroupError: string`：新建分组错误提示。
- `canConfirmNewGroup: boolean`：是否允许点击“确定”。
- `systemGroups: Array<{id,name}>`、`customGroups: Array<{id,name}>`：分组列表。
- `favoritesById: Record<quoteId, { groupId?: string }>`：自选条目与所属分组。

## 交互方法概述
- `showGroupManage()`：打开分组管理弹层，并计算各分组数量。
- `onGroupManageClose()` / `onGroupManageCancel()`：关闭弹层，不变更显示分组。
- `onGroupManageConfirm()`：确认分组；设置 `activeSubTab = pendingDisplayGroupId` 并刷新列表。
- `selectPendingGroup(e)`：点击分组项后设定 `pendingDisplayGroupId`。
- `openNewGroupDialog()` / `closeNewGroupDialog()`：打开/关闭新建分组弹窗。
- `onNewGroupInput(e)`：输入事件，调用逻辑模块进行校验，更新 `newGroupError/canConfirmNewGroup`。
- `confirmNewGroup()`：通过校验后创建 `customGroup`，并将 `pendingDisplayGroupId` 回填为新分组。
- `computeGroupCounts()`：统计 `favoritesById` 中各分组的数量（调用逻辑模块）。

## 逻辑模块（可测试）
文件：`miniprogram/utils/inquiry-logic.js`
- `validateNewGroupName(name, allGroups)`：返回 `{ error, canConfirm }`。
- `computeGroupCountsFromFavorites(favoritesById)`：返回 `{ all, holding, [groupId]: count }`。
  - 注意：`all` 为所有条目总数，避免重复累加。

## 接口规范
本模块不新增后端接口，完全在前端侧实现：
- 读写自选分组来源：页面现有的 `favoritesById` 与本地存储读写（复用现有 `saveFavorites` / `initFavorites`）。
- 新建分组 ID 生成规则：`cg_${Date.now()}`（可替换为更严格的生成器）。

## 动画与过渡
- 弹层使用 `van-popup` 的默认过渡；底部弹层设置 `custom-style="height: 60%;"`，并通过阴影与圆角强化层级与视觉。
- 列表项高亮通过 `.group-item.active` 背景色过渡，按钮使用 Vant 组件默认动效。
如需进一步自定义动画，可在 `.group-manage-sheet` 上添加 `transition` 与 `transform` 过渡。

## 单元测试
- 配置：`jest.config.js`（根目录），`miniprogram/package.json` 中添加 `devDependencies.jest` 与 `scripts.test`。
- 测试文件：`miniprogram/__tests__/inquiry-logic.test.js`，覆盖：
  - 新建分组名校验的四种分支（空、超长、重名、有效）。
  - 分组数量计算（空集合、混合分组）。
- 运行：在 `miniprogram` 目录执行 `npm test`。
- 覆盖率：对被测文件达到 ≥ 90%，整体阈值按 `jest.config.js` 为 80% 起。

## 视觉还原测试
- 启动本地服务器：`python simple_server.py`（端口 `3001`）。
- 打开预览页：`http://localhost:3001/preview/inquiry-group-manage.html`。
- 打开“显示设计稿叠层”开关，对照 `../询价.html` 进行像素级对比；必要时调整间距、字号、颜色与圆角。

## 注意事项
- 保持与现有代码风格一致，避免破坏既有数据流与存储。
- 编辑分组暂未开放（UI 按钮已预留，交互以 `wx.showToast` 提示）。
- 若需扩展到服务端持久化，请定义 `POST /api/groups` 与 `GET /api/groups` 等接口，并同步前端逻辑。

