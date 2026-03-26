# 云函数部署指南

由于命令行部署存在兼容性问题，请使用以下步骤在微信开发者工具中手动部署云函数：

## 部署步骤

### 1. 打开微信开发者工具
确保已登录并打开本项目

### 2. 部署 login 云函数
1. 在左侧文件树中找到 `cloudfunctions/login`
2. 右键点击 `login` 文件夹
3. 选择 **"上传并部署：云端安装依赖"**
4. 等待部署完成

### 3. 部署 handleInquiry 云函数
1. 在左侧文件树中找到 `cloudfunctions/handleInquiry`
2. 右键点击 `handleInquiry` 文件夹
3. 选择 **"上传并部署：云端安装依赖"**
4. 等待部署完成

### 4. 部署 initDatabase 云函数（可选，用于初始化数据）
1. 在左侧文件树中找到 `cloudfunctions/initDatabase`
2. 右键点击 `initDatabase` 文件夹
3. 选择 **"上传并部署：云端安装依赖"**
4. 部署完成后，在云开发控制台调用该云函数初始化数据

## 验证部署

部署完成后，可以在云开发控制台查看云函数列表：
1. 点击工具栏的"云开发"按钮
2. 选择"云函数"菜单
3. 确认 login 和 handleInquiry 函数状态为"正常"

## 已完成的安全配置

以下安全配置已更新到 `.env` 和 `.env.production` 文件：

- ✅ SECRET_KEY: 已生成新的安全密钥
- ✅ JWT_SECRET: 已生成新的 JWT 密钥
- ✅ ADMIN_JWT_SECRET: 已生成新的管理员 JWT 密钥
- ✅ ADMIN_PASSWORD: 已更新为强密码 `Admin@2026#Secure`

## 初始数据文件

已生成以下数据文件，可通过云开发控制台导入：

- `export-data/quotes.json` - 行情数据 (10条)
- `export-data/options.json` - 期权数据 (4条)
- `export-data/groups.json` - 分组数据 (4条)
- `export-data/settings.json` - 系统设置 (2条)

导入步骤：
1. 打开云开发控制台
2. 选择"数据库"
3. 创建集合：quotes, options, groups, settings
4. 选择对应集合，点击"导入"
5. 选择对应的 JSON 文件导入