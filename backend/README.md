# 微信小程序后端 API

这是一个为微信小程序开发的后端 API 服务，使用 Node.js + Express + SQLite 技术栈构建。

## 功能特性

- ✅ 基于 Express.js 框架
- ✅ 使用 SQLite 数据库 (better-sqlite3)
- ✅ 支持 CORS 跨域
- ✅ JSON 请求体解析
- ✅ 详细的请求日志记录
- ✅ 完整的错误处理机制
- ✅ Token 验证机制
- ✅ 用户信息管理

## 数据库设计

### users 表结构

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INTEGER | 主键，自增 |
| openid | TEXT | 用户唯一标识，唯一索引 |
| token | TEXT | 登录令牌 |
| nickname | TEXT | 昵称 |
| avatar | TEXT | 头像 URL |
| gender | INTEGER | 性别 (0:未知, 1:男, 2:女) |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

## 接口文档

### 1. 微信登录接口
```
POST /api/auth/wechat/login
```

**请求参数:**
```json
{
  "code": "微信登录凭证",
  "userInfo": {
    "nickName": "用户昵称",
    "avatarUrl": "头像URL",
    "gender": 1
  }
}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "token": "用户令牌",
    "userId": 1,
    "openid": "用户唯一标识",
    "userInfo": {
      "nickName": "用户昵称",
      "avatarUrl": "头像URL",
      "gender": 1
    }
  }
}
```

### 2. 获取用户信息接口
```
GET /api/user/info
```

**请求头:**
```
Authorization: Bearer {token}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "userId": 1,
    "openid": "用户唯一标识",
    "userInfo": {
      "nickName": "用户昵称",
      "avatarUrl": "头像URL",
      "gender": 1
    },
    "createdAt": "2023-01-01T00:00:00.000Z",
    "updatedAt": "2023-01-01T00:00:00.000Z"
  }
}
```

### 3. 更新用户信息接口
```
POST /api/user/update
```

**请求头:**
```
Authorization: Bearer {token}
```

**请求参数:**
```json
{
  "userInfo": {
    "nickName": "新昵称",
    "avatarUrl": "新头像URL",
    "gender": 2
  }
}
```

**响应:**
```json
{
  "success": true,
  "message": "更新成功"
}
```

### 4. 查看所有用户接口（调试用）
```
GET /api/users
```

**响应:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "openid": "openid_xxx",
      "token": "token_xxx",
      "nickname": "用户昵称",
      "avatar": "头像URL",
      "gender": 1,
      "created_at": "2023-01-01T00:00:00.000Z",
      "updated_at": "2023-01-01T00:00:00.000Z"
    }
  ]
}
```

### 5. 清空数据库接口（调试用）
```
DELETE /api/users/clear
```

**响应:**
```json
{
  "success": true,
  "message": "清空成功，共删除 N 条记录"
}
```

### 6. 测试接口
```
GET /api/test
```

**响应:**
```json
{
  "success": true,
  "message": "API运行正常",
  "database": "已连接",
  "userCount": 0
}
```

## 安装步骤

### 1. 环境要求
- Node.js v12.0 或更高版本
- npm v6.0 或更高版本

### 2. 安装依赖
```bash
# 进入 backend 目录
cd backend

# 安装项目依赖
npm install
```

## 启动命令

### 开发模式启动（推荐）
```bash
npm run dev
```
此模式下服务器会在代码更改时自动重启。

### 生产模式启动
```bash
npm start
```

## 测试命令示例

### 1. 测试接口
```bash
curl http://localhost:3001/api/test
```

### 2. 微信登录
```bash
curl -X POST http://localhost:3001/api/auth/wechat/login \
  -H "Content-Type: application/json" \
  -d '{
    "code": "test_code",
    "userInfo": {
      "nickName": "测试用户",
      "avatarUrl": "https://example.com/avatar.jpg",
      "gender": 1
    }
  }'
```

### 3. 获取用户信息
```bash
curl -H "Authorization: Bearer your_token_here" \
  http://localhost:3001/api/user/info
```

### 4. 更新用户信息
```bash
curl -X POST http://localhost:3001/api/user/update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_token_here" \
  -d '{
    "userInfo": {
      "nickName": "新昵称",
      "avatarUrl": "https://example.com/new-avatar.jpg"
    }
  }'
```

### 5. 查看所有用户
```bash
curl http://localhost:3001/api/users
```

### 6. 清空数据库
```bash
curl -X DELETE http://localhost:3001/api/users/clear
```

## 启动成功输出示例

```
✅ 数据库初始化成功
======================================
🚀 服务器启动成功！
======================================
📡 服务地址: http://localhost:3001
💾 数据库文件: /path/to/wechat.db
🧪 测试接口: http://localhost:3001/api/test

📚 可用接口:
  POST   /api/auth/wechat/login  - 微信登录
  GET    /api/user/info          - 获取用户信息
  POST   /api/user/update        - 更新用户信息
  GET    /api/users              - 查看所有用户
  DELETE /api/users/clear        - 清空数据库
  GET    /api/test               - 测试接口
======================================
```

## 注意事项

1. 所有接口均使用 SQLite 数据库存储数据
2. 服务器仅用于开发测试，请勿用于生产环境
3. 数据库存储在项目根目录的 `wechat.db` 文件中
4. 启动后端服务器后，前端小程序的登录功能即可正常使用