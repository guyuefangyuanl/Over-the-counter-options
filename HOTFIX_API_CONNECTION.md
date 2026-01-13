# API 连接问题修复指南

## 问题诊断

**错误信息**: `GET http://localhost:5000/api/v1/groups net::ERR_CONNECTION_REFUSED`

**根本原因**: 小程序缓存了旧的配置，仍在请求已关闭的 5000 端口

## 已完成的修复

### 1. ✅ 创建了集中配置管理
- 文件: `miniprogram/config/api.config.js`
- 功能: 统一管理所有 API 地址，支持开发/生产环境自动切换
- 当前配置: `http://localhost:5002/api/v1`

### 2. ✅ 修改了所有 API 调用文件
- `miniprogram/utils/api-group.js` - 已改用配置中心
- `miniprogram/utils/api.js` - 已改用配置中心  
- `miniprogram/pages/profile/profile.js` - 已修复
- `miniprogram/pages/test/test.js` - 已修复

### 3. ✅ 建立了预防机制
- 脚本: `scripts/check-hardcoded-urls.js`
- 命令: `npm run check:urls`
- 功能: 自动检测硬编码的 API 地址

## 立即执行的修复步骤

### 步骤 1: 确认服务运行状态

```powershell
# 检查端口占用
netstat -ano | findstr "5002 5000"

# 应该只看到 5002 端口在运行
```

### 步骤 2: 清理小程序缓存并重新编译

**在微信开发者工具中执行**:

1. **点击菜单**: `工具` → `清除缓存` → `清除所有缓存`
2. **重新编译**: 点击 `编译` 按钮（或使用快捷键 Ctrl+B）
3. **查看控制台**: 确认没有错误信息

### 步骤 3: 验证 API 配置

在小程序开发者工具的控制台执行:

```javascript
// 检查配置是否正确
const { getBaseUrl } = require('./config/api.config.js');
console.log('当前 API 地址:', getBaseUrl());
// 应该输出: http://localhost:5002/api/v1
```

### 步骤 4: 测试 API 调用

在小程序任意页面（如询价页面）刷新，观察控制台输出:

- ✅ 正确: `GET http://localhost:5002/api/v1/groups`
- ❌ 错误: `GET http://localhost:5000/api/v1/groups`

## 如果问题仍然存在

### 方案 A: 强制重启微信开发者工具

1. 完全关闭微信开发者工具
2. 删除小程序编译缓存目录:
   ```powershell
   # 在项目根目录执行
   Remove-Item -Recurse -Force miniprogram\.cache -ErrorAction SilentlyContinue
   Remove-Item -Recurse -Force miniprogram\miniprogram_npm -ErrorAction SilentlyContinue
   ```
3. 重新打开项目并编译

### 方案 B: 检查是否有其他文件使用了硬编码

```powershell
# 在项目根目录执行
npm run check:urls
```

如果发现新的硬编码问题，报告具体的文件路径。

### 方案 C: 临时启动 5000 端口服务

如果紧急需要使用，可以临时将 Flask 服务切换到 5000 端口:

```powershell
# 修改 .env 文件
# 将 FLASK_PORT 从 5002 改为 5000

# 重启服务
npm run dev:flask
```

**但强烈建议使用方案 A 或 B，而非此临时方案。**

## 预防机制

### 1. 提交前检查

在提交代码前运行:
```powershell
npm run check:urls
```

### 2. CI/CD 集成（建议）

在 `.github/workflows/ci.yml` 或其他 CI 配置中添加:
```yaml
- name: Check for hardcoded URLs
  run: npm run check:urls
```

### 3. Git Pre-commit Hook（建议）

创建 `.husky/pre-commit`:
```bash
#!/bin/sh
npm run check:urls
```

## 配置文件说明

### API 配置中心: `miniprogram/config/api.config.js`

**开发环境配置**:
```javascript
apiBaseUrl: 'http://localhost:5002/api/v1'
```

**生产环境配置**:
```javascript
apiBaseUrl: 'https://your-production-api.com/api/v1'
```

**环境检测逻辑**:
- 使用 `wx.getAccountInfoSync()` 检测小程序版本
- `release` 版本 → 生产配置
- 其他版本 → 开发配置

## 常见问题

### Q1: 为什么 `utils/api.js` 使用了环境变量？
A: 该文件用于 Node.js 后端，不是小程序代码，使用环境变量是正确的。

### Q2: 如何修改 API 地址？
A: 修改 `miniprogram/config/api.config.js` 中的 `DEV_CONFIG.apiBaseUrl`

### Q3: 部署到生产环境时需要做什么？
A: 修改 `PROD_CONFIG.apiBaseUrl` 为实际的生产 API 地址。

## 总结

✅ **已修复**: 所有小程序 API 调用已改用配置中心  
✅ **已建立**: 自动化检查机制防止复发  
⏳ **待执行**: 清理小程序缓存并重新编译  

**核心问题**: 小程序缓存了旧配置，需要清理缓存并重新编译。
