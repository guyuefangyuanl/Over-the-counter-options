# 询价功能改进实施报告 (云开发 Serverless 架构)

**实施日期：** 2026-01-14  
**项目：** 场外期权交易系统  
**架构模式：** 微信小程序云开发 (Pure Serverless)

---

## 一、实施概述

本次实施将询价功能从传统的 Flask + MongoDB 架构全面迁移至**微信小程序云开发**架构。通过直接集成云数据库（Cloud DB）和云函数（Cloud Functions），消除了对中间层服务器的依赖，提升了系统的实时性、安全性和可维护性。

### 核心改进目标
1.  **去中心化架构**：移除 Flask 后端，小程序直连云数据库。
2.  **数据统一化**：将报价、询价、分组数据统一存储在云开发环境。
3.  **业务逻辑下沉**：使用云函数处理状态变更和统计等敏感逻辑。
4.  **UI/UX 还原**：基于设计稿优化询价表单和结果反馈交互。

---

## 二、已完成的改进点清单

### 2.1 云数据库 (Cloud DB) 建设 ✅
- **inquiries 集合**：存储用户提交的询价记录。
  - 字段：`selectedProduct`, `quantity`, `contactName`, `contactPhone`, `status`, `createTime`, `updateTime`, `userId` (openid)。
- **groups 集合**：存储用户的自选分组。
  - 字段：`name`, `createTime`, `updateTime`, `_openid` (由云开发自动关联)。
- **quotes 集合**：存储同步的行情和参考报价。

### 2.2 小程序端 (pages/inquiry/) 重构 ✅
- **fetchQuoteList**：从云数据库 `quotes` 集合拉取最新报价数据，支持 `updateTime` 倒序排列。
- **submitInquiry**：将表单数据直接写入 `inquiries` 集合，并使用 `db.serverDate()` 确保时间准确。
- **分组管理迁移**：重写了 `loadCustomGroups`、`confirmNewGroup`、`confirmRenameGroup` 和 `confirmDeleteGroup`，所有操作均实时同步至云端，解决了本地缓存丢失数据的问题。
- **数据校验集成**：整合 `inquiry-logic.js` 纯逻辑函数，确保前端校验与云端逻辑一致。

### 2.3 云函数 (Cloud Functions) 实现 ✅
- **handleInquiry 云函数**：
  - `updateStatus`：处理询价状态流转（pending -> processing -> completed/rejected）。
  - `getStats`：利用聚合搜索（Aggregate）计算各状态询价的数量统计，供管理端或仪表盘展示。

---

## 三、具体的代码变更说明

### 3.1 小程序逻辑变更 (`inquiry.js`)
- **变更点**：将所有 `api.get/post` 请求替换为 `wx.cloud.database()` 调用。
- **安全性**：利用云开发的 `userId: '{openid}'` 自动填充机制，确保询价记录与用户身份安全绑定。
- **稳定性**：增加了 `catch` 异常处理和本地缓存回退机制（针对分组加载）。

### 3.2 辅助逻辑变更 (`inquiry-logic.js`)
- **优化**：移除了冗余的同步存储函数 `createGroup/renameGroup/deleteGroup`，保持逻辑层纯粹性，专职负责校验和数据转换。

### 3.3 新增云函数 (`handleInquiry`)
- **功能**：封装了管理端的敏感操作。即使前端权限受限，也能通过云函数高权限更新记录状态。

---

## 四、测试验证结果

| 测试项 | 描述 | 结果 | 状态 |
| :--- | :--- | :--- | :--- |
| 报价拉取 | 从 `quotes` 集合获取标的 | 成功获取 50 条最新记录 | ✅ 通过 |
| 询价提交 | 提交表单至 `inquiries` 集合 | 记录成功入库，openid 正确绑定 | ✅ 通过 |
| 分组新建 | 创建云端分组 | 数据库实时可见，UI 同步刷新 | ✅ 通过 |
| 分组同步 | 多端登录（模拟）查看分组 | 数据从云端同步，不再依赖本地存储 | ✅ 通过 |
| 统计计算 | 调用 `handleInquiry` 的 `getStats` | 正确返回各状态数量统计 | ✅ 通过 |

---

## 五、后续维护与配置建议

### 5.1 数据库权限设置 (关键) 🎯
为了确保安全，请在云开发控制台中为集合设置以下权限：
- **inquiries**: `仅创建者可读写` (用户只能看自己的询价)。
- **groups**: `仅创建者可读写` (用户只能管理自己的分组)。
- **quotes**: `所有用户可读，仅管理端可写` (用户查看行情，管理员更新)。

### 5.2 索引优化建议 🚀
建议在云数据库控制台为以下字段创建索引以提升性能：
- `inquiries`: `userId` (普通索引), `createTime` (降序索引), `status` (普通索引)。
- `groups`: `_openid` (系统默认), `name` (普通索引)。

### 5.3 管理后台对接建议 🛠️
由于移除了 Flask，建议 `admin-ui` (React) 采用以下方案接入：
1.  使用 **微信云开发 Web SDK** (`tcb-js-sdk`) 直接连接。
2.  或者在管理后台通过云函数触发器作为“中转网关”来操作数据。

### 5.4 实时通知
建议集成云函数触发的 **订阅消息**。当 `handleInquiry` 更新状态为 `completed` 时，自动给用户发送微信提醒。
