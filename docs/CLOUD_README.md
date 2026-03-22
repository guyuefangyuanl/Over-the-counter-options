# 云开发使用指南

本文档介绍如何使用微信云开发替换/辅助现有的Python后端，实现"数据集中处理 + 云数据库"的架构。

## 1. 架构说明

*   **数据源**: 使用本地 Python 脚本 (`export_data_to_cloud.py`) 通过 AkShare 获取实时行情。
*   **数据库**: 微信云数据库 (Cloud Database)，集合名为 `quotes`。
*   **前端**: 小程序直接读取云数据库，或调用云函数。
*   **优势**: 
    *   省去了维护 Flask 服务器的成本。
    *   利用腾讯云的免费额度。
    *   符合"集中处理数据后导入"的讨论方案。

## 2. 初始化步骤

### 第一步：开通云开发
1. 打开微信开发者工具，点击工具栏上的 **"云开发"** 按钮。
2. 如果未开通，点击"开通"，创建一个环境（推荐按量付费，有免费额度）。
3. 记下环境 ID。

### 第二步：配置环境
项目代码已配置好：
*   `project.config.json` 已添加 `cloudfunctionRoot`。
*   `app.js` 已添加 `wx.cloud.init()`。
*   `cloudfunctions` 目录已创建。

**注意**: 请在 `app.js` 的 `wx.cloud.init({ env: '这里填你的环境ID' })` 中填入你的环境ID，否则默认使用第一个环境。

### 第三步：部署云函数
1. 在文件列表中右键点击 `cloudfunctions/login` 文件夹。
2. 选择 **"上传并部署：云端安装依赖"**。

### 第四步：创建数据库集合
1. 打开云开发控制台 -> **数据库**。
2. 点击 **"+"** 创建集合，名称填：
   - `quotes` (行情数据)
   - `inquiries` (询价记录)
   - `groups` (自选分组管理)
3. 将集合权限设置为 **"所有用户可读，仅创建者可读写"**。
   - *注：分组管理功能已移除“分组描述”字段，仅保留分组名称。*

## 3. 数据导入流程 (Leslie方案)

为了规避云函数调用外网 API 的限制或超时问题，我们采用本地跑脚本获取数据，然后导入云数据库。

1. **生成数据文件**:
   在项目根目录运行 Python 脚本：
   ```bash
   python export_data_to_cloud.py
   ```
   这会在目录下生成一个 `quotes_data.json` 文件。

2. **导入到云数据库**:
   *   打开云开发控制台 -> 数据库 -> 选择 `quotes` 集合。
   *   点击 **"导入"**。
   *   选择 `quotes_data.json`。
   *   文件类型选择 **"JSON"** (因为我们生成的是 JSON Lines 格式)。
   *   冲突处理模式选择 **"Upsert (覆盖)"** 或 **"Insert (插入)"**。

## 4. 前端调用 (代码示例)

### 获取行情 (替代 api.get('/quotes'))
```javascript
const db = wx.cloud.database()
db.collection('quotes').get().then(res => {
  this.setData({ _fullQuoteList: res.data })
})
```

### 提交询价 (替代 api.post('/inquiry'))
```javascript
const db = wx.cloud.database()
db.collection('inquiries').add({
  data: {
    ...this.data.inquiryForm,
    createTime: db.serverDate()
  }
}).then(res => {
  wx.showToast({ title: '提交成功' })
})
```

## 5. 进阶：自动化上传 (HTTP API)
如果不想每次手动点导入，可以使用云开发的 [HTTP API](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/reference-http-api/) 在 Python 脚本中直接上传数据。
这需要获取 `access_token` 并调用 `databaseMigrateImport` 接口。
