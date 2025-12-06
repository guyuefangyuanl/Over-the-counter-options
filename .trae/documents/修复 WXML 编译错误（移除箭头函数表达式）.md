## 问题原因

* WXML 模板不支持箭头函数、可选链等 JS 表达式；`g => ...` 被解析为非法字符，触发 “unexpected `>` at pos30”。

* 你的错误来自删除分组弹窗里的 `picker` 显示文本：`{{availableTargetGroups.find(g => g.id === selectedTargetGroupId)?.name || '请选择'}}`。

* 当前实际页面文件已使用安全的数据字段，但有两个修复脚本会“覆盖写入”旧内容，重新引入该非法表达式。

## 证据定位

* 页面文件显示为安全实现：`miniprogram/pages/inquiry/inquiry.wxml:136` 为 `{{targetGroupDisplayText}}`，同时 `picker` 使用索引：`miniprogram/pages/inquiry/inquiry.wxml:131` 为 `value="{{selectedTargetGroupIndex}}"`。

* 两个脚本会写回不合法的 WXML：

  * `miniprogram/fix_wxml_complete.js:140` 输出 `{{availableTargetGroups.find(g => g.id === selectedTargetGroupId)?.name || '请选择'}}`

  * `miniprogram/fix_wxml_final.js:140` 输出同样内容

## 修复方案

1. 保持页面采用“数据驱动”的安全写法：用 `targetGroupDisplayText` 渲染显示文本，不在 WXML 里做查找。
2. 将 `picker` 的 `value` 绑定为索引（已实现），在 JS 的 `onTargetGroupChange` 更新：`selectedTargetGroupId`、`selectedTargetGroupIndex`、`targetGroupDisplayText`。
3. 移除或修订两个覆盖写入脚本，避免再次把非法表达式写回页面文件。
4. 清理工具缓存并重新编译，确保使用的是页面中的正确实现。

## 具体改动（若你确认执行）

* 保留页面实现：

  * `miniprogram/pages/inquiry/inquiry.wxml:134-139`

    * `picker` 结构保持：`value="{{selectedTargetGroupIndex}}"`、`range="{{availableTargetGroups}}"`、`range-key="name"`

    * 文本：`<text>{{targetGroupDisplayText}}</text>`（已存在）

* 保留并依赖 JS 更新显示文本：

  * `miniprogram/pages/inquiry/inquiry.js:420-431` 在 `onTargetGroupChange` 中同步 `selectedTargetGroupId` 和 `targetGroupDisplayText`（已存在）

  * `miniprogram/pages/inquiry/inquiry.js:393-405` 打开弹窗时设置默认值（已存在）

* 修订脚本（二选一）：

  * 直接删除 `miniprogram/fix_wxml_complete.js` 和 `miniprogram/fix_wxml_final.js`

  * 或把脚本中的对应行改为输出 `<text>{{targetGroupDisplayText}}</text>`，与页面一致

## 清理与验证

* 关闭并重新打开开发者工具项目，执行“清缓存并重编译”。

* 打开“删除分组”弹窗：

  * 当 `availableTargetGroups` 非空时，默认显示第一个分组名称；切换后显示选中的名称。

  * 当列表为空或未选择时，显示 `请选择`（由 `targetGroupDisplayText` 控制）。

## 兼容性说明

* WXML 支持三元表达式（你当前使用的部分可保留），但不支持函数调用、可选链、箭头函数等复杂 JS；这类逻辑应放在页面 JS 中，通过 `setData` 提供已计算的字段给视图。

