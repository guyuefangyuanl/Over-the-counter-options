# 云托管统一服务器配置指南

> 本文档指导如何将云托管配置为小程序和后台管理系统的统一服务器

## 📋 目录

- [配置概览](#配置概览)
- [第一步：云托管环境变量配置](#第一步云托管环境变量配置)
- [第二步：创建云数据库集合](#第二步创建云数据库集合)
- [第三步：初始化管理员账号](#第三步初始化管理员账号)
- [第四步：配置小程序](#第四步配置小程序)
- [第五步：配置后台管理系统](#第五步配置后台管理系统)
- [第六步：测试验证](#第六步测试验证)
- [故障排查](#故障排查)

---

## 配置概览

### 架构图

```
┌─────────────────┐
│  小程序 (移动端)  │
└────────┬────────┘
         │
         │ HTTPS API
         ▼
┌─────────────────────────────────┐
│   云托管服务 (Flask后端)         │
│                                 │
│  URL: https://flask-ym1v-210758-7-1374336462.sh.run.tcloudbase.com │
│                                 │
│  ├─ /api/v1/auth/*    认证接口  │
│  ├─ /api/v1/groups/*  分组管理  │
│  ├─ /api/v1/inquiries/* 询价管理 │
│  └─ /api/v1/*         其他接口  │
└────────┬────────────────────────┘
         │
         │ 云数据库
         ▼
┌─────────────────────────────────┐
│   微信云数据库                   │
│                                 │
│  ├─ admin_users     管理员账号  │
│  ├─ users           用户信息    │
│  ├─ inquiries       询价记录    │
│  └─ ...             其他集合    │
└─────────────────────────────────┘

┌─────────────────┐
│  Admin-UI (Web) │
│  管理后台        │
└────────┬────────┘
         │
         │ Vite代理 (开发) / 直接访问 (生产)
         ▼
    云托管服务
```

### 服务地址

| 服务 | 地址 | 说明 |
|------|------|------|
| 云托管API | `https://flask-ym1v-210758-7-1374336462.sh.run.tcloudbase.com` | 主API服务 |
| Admin-UI (开发) | `http://localhost:5176` | 本地开发环境 |
| Admin-UI (生产) | 需部署到静态托管 | 待配置 |

---

## 第一步：云托管环境变量配置

### 1.1 登录腾讯云控制台

访问：https://console.cloud.tencent.com/tcb

### 1.2 进入云托管服务

找到服务：`flask-ym1v-210758-7-1374336462`

### 1.3 配置环境变量

**路径**: 配置 → 环境变量 → 新增变量

添加以下环境变量：

| 变量名 | 变量值 | 说明 |
|--------|--------|------|
| `ADMIN_USERNAME` | `admin` | 管理员用户名 |
| `ADMIN_PASSWORD` | `Admin@2026#Secure` | 管理员密码 |
| `ADMIN_ROLE` | `admin` | 管理员角色 |
| `JWT_SECRET` | `0e148213dcb347465baa25f3477b4ed8f9a340d6cedb24d90bc5c8bc43978a9e` | JWT密钥 |
| `JWT_EXPIRES_SECONDS` | `86400` | Token有效期（24小时） |
| `WX_APPID` | `wx83166cb97bfc0d4c` | 小程序AppID |
| `WX_SECRET` | `c3c07d84d767389457ec69eb2828dac7` | 小程序Secret |
| `WX_CLOUD_ENV` | `develop-8gx7kh9g045e6c9a` | 云环境ID |
| `WX_VERIFY_SSL` | `false` | SSL验证（云托管内网通信） |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176` | CORS允许的源 |

**重要**: 保存后**必须重启服务**才能生效。

---

## 第二步：创建云数据库集合

### 2.1 登录微信云开发控制台

访问：https://cloud.weixin.qq.com

### 2.2 进入数据库

选择环境：`develop-8gx7kh9g045e6c9a`

点击：数据库 → 集合列表

### 2.3 创建必需的集合

创建以下集合（如果不存在）：

#### 核心集合

| 集合名 | 说明 | 权限设置 |
|--------|------|---------|
| `admin_users` | 管理员账号 | 仅创建者及管理员可读写 |
| `users` | 小程序用户 | 仅创建者及管理员可读写 |
| `inquiries` | 询价记录 | 仅创建者及管理员可读写 |
| `groups` | 分组信息 | 仅创建者及管理员可读写 |
| `login_history` | 登录历史 | 仅创建者及管理员可读写 |
| `sessions` | 用户会话 | 仅创建者及管理员可读写 |

#### 业务集合

| 集合名 | 说明 | 权限设置 |
|--------|------|---------|
| `orders` | 订单记录 | 仅创建者及管理员可读写 |
| `positions` | 持仓记录 | 仅创建者及管理员可读写 |
| `quotes_cache` | 行情缓存 | 所有用户可读，仅管理员可写 |
| `system_config` | 系统配置 | 仅管理员可读写 |

### 2.4 创建索引（可选，提升性能）

在 `users` 集合上创建索引：

```json
{
  "keys": {
    "openid": 1
  },
  "unique": true
}
```

在 `inquiries` 集合上创建索引：

```json
{
  "keys": {
    "user_id": 1,
    "created_at": -1
  }
}
```

---

## 第三步：初始化管理员账号

### 方法A：使用环境变量（推荐）

已在第一步中配置，服务重启后自动生效。

测试登录：

```bash
curl -X POST https://flask-ym1v-210758-7-1374336462.sh.run.tcloudbase.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@2026#Secure"}'
```

预期响应：

```json
{
  "success": true,
  "code": 200,
  "message": "登录成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenType": "Bearer",
    "expiresIn": 86400,
    "role": "admin"
  }
}
```

### 方法B：使用脚本初始化

如果需要创建额外的管理员账号：

```bash
# 运行初始化脚本
node scripts/init-cloud-admin.js
```

### 方法C：直接在数据库中插入

如果环境变量方式无效，可以手动插入管理员记录：

1. 进入云数据库 → `admin_users` 集合
2. 点击"添加记录"
3. 输入以下JSON：

```json
{
  "username": "admin",
  "role": "admin",
  "password_hash": "pbkdf2:sha256:260000$VxkYQmZL$c8b7d9e...",
  "created_at": "2026-03-30T00:00:00.000Z",
  "updated_at": "2026-03-30T00:00:00.000Z",
  "require_password_change": false
}
```

**注意**: `password_hash` 需要使用Python生成：

```python
from werkzeug.security import generate_password_hash
hash = generate_password_hash('Admin@2026#Secure')
print(hash)
```

---

## 第四步：配置小程序

小程序已配置为自动使用云托管API，无需额外修改。

### 4.1 验证配置文件

检查 `miniprogram/config/api.config.js`:

```javascript
// 云端API地址（已配置）
const CLOUD_API_URL = 'https://flask-ym1v-210758-7-1374336462.sh.run.tcloudbase.com/api/v1';

// 默认使用云端API
const CONFIG = {
  development: {
    apiBaseUrl: CLOUD_API_URL,  // 开发环境也使用云端
    useCloud: true
  },
  production: {
    apiBaseUrl: CLOUD_API_URL,
    useCloud: true
  }
};
```

### 4.2 测试小程序API调用

在微信开发者工具中测试：

```javascript
// 在控制台执行
const { getApiUrl } = require('./config/api.config.js');
console.log(getApiUrl('/auth/login')); 
// 应输出: https://flask-ym1v-210758-7-1374336462.sh.run.tcloudbase.com/api/v1/auth/login
```

---

## 第五步：配置后台管理系统

### 5.1 本地开发环境

已配置完成，查看 `.env.local`:

```bash
# 云托管模式
VITE_PROXY_MODE=cloud
```

### 5.2 启动开发服务器

```bash
cd admin-ui
npm run dev
```

访问：http://localhost:5176

### 5.3 生产环境部署

#### 方案A：部署到微信云托管静态网站

1. 构建生产版本：

```bash
cd admin-ui
npm run build
```

2. 部署到云托管：

```bash
# 使用 cloudbase CLI
tcb hosting deploy ./dist -e develop-8gx7kh9g045e6c9a
```

#### 方案B：部署到其他静态托管

如 Vercel、Netlify 等：

```bash
# Vercel
vercel --prod

# Netlify
netlify deploy --prod
```

**注意**: 需要在部署平台配置环境变量：

```
VITE_API_BASE_URL=https://flask-ym1v-210758-7-1374336462.sh.run.tcloudbase.com/api/v1
```

并修改 `admin-ui/src/utils/api.ts`:

```typescript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 
  'https://flask-ym1v-210758-7-1374336462.sh.run.tcloudbase.com/api/v1';
```

---

## 第六步：测试验证

### 6.1 测试云托管API

#### 游客登录测试

```bash
curl -X POST https://flask-ym1v-210758-7-1374336462.sh.run.tcloudbase.com/api/v1/auth/guest/login \
  -H "Content-Type: application/json"
```

预期响应：

```json
{
  "success": true,
  "code": 200,
  "message": "进入游客模式",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "role": "guest",
    "isGuest": true
  }
}
```

#### 管理员登录测试

```bash
curl -X POST https://flask-ym1v-210758-7-1374336462.sh.run.tcloudbase.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@2026#Secure"}'
```

#### 微信登录测试（小程序）

在微信开发者工具中：

```javascript
wx.login({
  success: (res) => {
    wx.request({
      url: 'https://flask-ym1v-210758-7-1374336462.sh.run.tcloudbase.com/api/v1/auth/wechat/login',
      method: 'POST',
      data: { code: res.code },
      success: (res) => {
        console.log('登录成功', res.data);
      }
    });
  }
});
```

### 6.2 测试Admin-UI

1. 打开浏览器访问：http://localhost:5176
2. 使用管理员账号登录：
   - 用户名：`admin`
   - 密码：`Admin@2026#Secure`
3. 验证功能：
   - ✅ 仪表盘数据加载
   - ✅ 用户管理列表
   - ✅ 询价记录查看
   - ✅ 系统配置修改

### 6.3 测试小程序

1. 在微信开发者工具中打开小程序项目
2. 点击"编译"运行小程序
3. 测试功能：
   - ✅ 微信登录
   - ✅ 查看分组
   - ✅ 提交询价
   - ✅ 查看持仓

---

## 故障排查

### 问题1：管理员登录失败

**症状**: 返回 401 错误，提示"用户名或密码错误"

**解决方案**:

1. 检查云托管环境变量是否配置正确
2. 确认服务已重启
3. 尝试重置密码：

```bash
# 使用脚本重置
node scripts/init-cloud-admin.js
```

### 问题2：数据库集合不存在

**症状**: 返回 500 错误，提示"Db or Table not exist"

**解决方案**:

1. 登录微信云开发控制台
2. 手动创建缺失的集合（见第二步）
3. 设置集合权限

### 问题3：CORS跨域错误

**症状**: 浏览器控制台显示 CORS 错误

**解决方案**:

1. 检查云托管环境变量 `ALLOWED_ORIGINS`
2. 添加前端地址：

```
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176
```

3. 重启云托管服务

### 问题4：小程序请求失败

**症状**: 小程序控制台显示网络请求失败

**解决方案**:

1. 检查小程序配置：

```javascript
// miniprogram/config/api.config.js
console.log('API地址:', getApiUrl('/auth/login'));
```

2. 在微信开发者工具中勾选"不校验合法域名"（开发环境）
3. 在小程序后台配置服务器域名：
   - 登录：https://mp.weixin.qq.com
   - 开发 → 开发管理 → 服务器域名
   - 添加：`https://flask-ym1v-210758-7-1374336462.sh.run.tcloudbase.com`

### 问题5：Token验证失败

**症状**: API返回 401，提示"登录已过期"

**解决方案**:

1. 检查JWT_SECRET配置是否一致
2. 清除浏览器localStorage中的token
3. 重新登录

---

## 附录：常用命令

### 云托管服务管理

```bash
# 查看服务状态
tcb run describe --service flask-ym1v-210758-7-1374336462

# 查看日志
tcb run logs --service flask-ym1v-210758-7-1374336462

# 重启服务
tcb run restart --service flask-ym1v-210758-7-1374336462
```

### 本地开发

```bash
# 启动前端开发服务器
cd admin-ui && npm run dev

# 启动本地后端（如需要）
python app.py

# 运行测试
npm test
```

### 数据库操作

```bash
# 导出数据
tcb db export -e develop-8gx7kh9g045e6c9a -c users

# 导入数据
tcb db import -e develop-8gx7kh9g045e6c9a -c users --file users.json
```

---

## 配置检查清单

使用此清单验证配置是否完整：

- [ ] 云托管环境变量已配置
- [ ] 云托管服务已重启
- [ ] 云数据库集合已创建
- [ ] 管理员账号可以登录
- [ ] 小程序可以访问API
- [ ] Admin-UI可以访问API
- [ ] CORS配置正确
- [ ] JWT密钥配置一致
- [ ] 微信小程序后台域名已配置

---

## 技术支持

如遇到问题，请检查：

1. 云托管服务日志：腾讯云控制台 → 云托管 → 日志
2. 小程序控制台：微信开发者工具 → 控制台
3. 浏览器控制台：F12 → Console

联系方式：
- 项目文档：`/docs`
- 问题反馈：提交 Issue
- 配置文件：`.env.local`, `miniprogram/config/api.config.js`

---

**最后更新**: 2026-03-30
**维护者**: 开发团队