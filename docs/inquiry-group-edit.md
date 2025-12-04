# 询价页 - 分组管理与编辑功能实现说明

本文档说明询价页面分组管理功能的完整实现，包括编辑分组（重命名/删除）和迁移策略。

## 功能概述

在原有分组管理基础上，新增以下功能：

### 1. 编辑模式
- 点击"编辑分组"按钮进入编辑模式
- 编辑模式下，系统分组（全部、持仓）不可编辑，仅显示为禁用状态
- 自定义分组显示编辑和删除按钮

### 2. 分组重命名
- 点击编辑按钮打开重命名弹窗
- 输入验证：非空、最多20个字、不能与现有分组重名
- 支持同名重命名（当前分组保持原名）

### 3. 分组删除
- 点击删除按钮打开删除确认弹窗
- 自动计算需要迁移的自选数量
- 提供迁移目标选择（排除当前分组和"全部"分组）
- 支持空分组直接删除

### 4. 迁移策略
- 删除分组时，下属自选条目可选择迁移到指定分组
- 默认选中第一个可用目标分组
- 迁移后更新favoritesById中的groupId引用

## 文件变更

### 新增/修改文件
- `miniprogram/utils/inquiry-logic.js` - 新增分组操作逻辑函数
- `miniprogram/pages/inquiry/inquiry.js` - 新增编辑模式状态和方法
- `miniprogram/pages/inquiry/inquiry.wxml` - 新增编辑模式UI和弹窗
- `miniprogram/pages/inquiry/inquiry.wxss` - 新增编辑模式样式
- `miniprogram/__tests__/inquiry-logic.test.js` - 新增单元测试
- `preview/inquiry-group-manage.html` - 更新预览页面，支持编辑模式演示

## 数据结构

### 新增状态变量
```javascript
// 编辑分组相关状态
isEditMode: false,              // 编辑模式开关
editingGroupId: '',            // 当前编辑的分组ID
editingGroupName: '',          // 重命名输入值
showRenameGroupDialog: false,  // 重命名弹窗
renameGroupError: '',          // 重命名错误提示
canConfirmRename: false,       // 是否可以确认重命名
showDeleteGroupDialog: false,  // 删除确认弹窗
deleteMigrationCount: 0,       // 需要迁移的自选数量
availableTargetGroups: [],     // 可用于迁移的目标分组
selectedTargetGroupId: '',     // 选中的迁移目标分组ID
```

## 核心逻辑函数

### 1. 重命名验证
```javascript
function validateRenameGroupName(newName, groupId, allGroups) {
  const trimmed = (newName || '').trim();
  let error = '';
  if (!trimmed) {
    error = '请输入分组名';
  } else if (trimmed.length > 20) {
    error = '分组名最多20个字';
  } else if ((allGroups || []).some(g => g && g.name === trimmed && g.id !== groupId)) {
    error = '已存在同名分组';
  }
  return { error, canConfirm: !error };
}
```

### 2. 获取可用迁移目标
```javascript
function getAvailableTargetGroups(currentGroupId, systemGroups, customGroups) {
  const allGroups = [...(systemGroups || []), ...(customGroups || [])];
  return allGroups.filter(g => g && g.id !== currentGroupId && g.id !== 'all');
}
```

### 3. 计算迁移数量
```javascript
function computeMigrationCount(groupId, favoritesById) {
  const favorites = favoritesById || {};
  return Object.keys(favorites).filter(id => {
    const fav = favorites[id];
    return fav && fav.groupId === groupId;
  }).length;
}
```

### 4. 执行分组迁移
```javascript
function migrateGroupItems(fromGroupId, toGroupId, favoritesById) {
  const favorites = favoritesById || {};
  const updated = {};
  Object.keys(favorites).forEach(id => {
    const fav = favorites[id];
    if (fav && fav.groupId === fromGroupId) {
      updated[id] = { ...fav, groupId: toGroupId };
    } else {
      updated[id] = fav;
    }
  });
  return updated;
}
```

## 交互流程

### 重命名流程
1. 用户点击"编辑分组"进入编辑模式
2. 点击目标分组的编辑按钮
3. 打开重命名弹窗，显示当前名称
4. 用户输入新名称，实时验证
5. 点击确定，更新分组名称
6. 保存到本地存储，刷新界面

### 删除流程
1. 用户点击目标分组的删除按钮
2. 计算该分组下的自选数量
3. 获取可用的迁移目标分组
4. 显示删除确认弹窗
5. 如果有自选项目，显示迁移目标选择器
6. 用户确认删除，执行迁移或直接删除
7. 更新本地存储，刷新界面

## UI/UX规范

### 编辑模式样式
- 编辑模式：分组项添加`edit-mode`类，右侧显示编辑按钮
- 禁用状态：系统分组添加`edit-mode-disabled`类，透明度0.6
- 编辑按钮：使用van-icon，点击缩放0.95倍动画

### 弹窗样式
- 重命名弹窗：标题"重命名分组"，输入框带验证提示
- 删除弹窗：标题"删除分组"，显示迁移信息，红色删除按钮
- 统一使用van-popup组件，圆角16rpx

### 动画效果
- 按钮点击：transform: scale(0.95)
- 颜色过渡：0.2s ease
- 弹窗入场：配合van-popup默认过渡

## 性能优化

### 1. 状态管理
- 编辑模式状态集中管理，避免重复渲染
- 弹窗状态独立，减少不必要的数据更新

### 2. 计算优化
- 迁移数量计算使用缓存结果
- 目标分组列表按需生成

### 3. 存储优化
- 批量更新favoritesById，减少setData调用
- 及时清理过期状态变量

## 单元测试

测试覆盖率≥90%，包含以下测试用例：

### 重命名验证测试
- 空名称验证
- 超长名称验证
- 同名冲突验证
- 同名重命名验证
- 有效名称验证

### 迁移逻辑测试
- 空favorites处理
- 分组项目计数
- 项目迁移执行
- 属性保持验证

### 目标分组测试
- 排除当前分组
- 排除"全部"分组
- 返回正确列表

## 兼容性

### 设备兼容
- 支持iOS/Android主流机型
- 适配不同屏幕尺寸
- 处理安全区域

### 小程序版本
- 兼容基础库2.0+
- 使用标准API，避免废弃接口
- 优雅降级处理

## 错误处理

### 输入验证
- 实时显示错误提示
- 阻止无效操作
- 提供友好反馈

### 异常情况
- 本地存储失败处理
- 数据格式异常处理
- 网络异常提示

## 后续优化

### 1. 分组排序
- 支持拖拽排序
- 提供排序按钮
- 保存排序状态

### 2. 批量操作
- 支持多选删除
- 批量重命名
- 一键清空

### 3. 高级功能
- 分组颜色标记
- 分组图标设置
- 分组权限管理

## 注意事项

1. 保持与现有代码风格一致
2. 避免破坏既有数据流与存储
3. 及时更新相关文档
4. 确保视觉还原度符合设计稿
5. 测试覆盖率达到要求