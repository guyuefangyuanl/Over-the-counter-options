# API 接口文档

## 概述

场外期权交易平台 API 基于 RESTful 风格设计，提供完整的交易、行情、用户管理等功能。

**基础URL**: `/api/v1`

**认证方式**: JWT Bearer Token

---

## 统一响应格式

### 成功响应
```json
{
  "success": true,
  "message": "操作成功",
  "code": 200,
  "data": { ... }
}
```

### 分页响应
```json
{
  "success": true,
  "message": "获取成功",
  "code": 200,
  "data": {
    "items": [ ... ],
    "pagination": {
      "page": 1,
      "per_page": 20,
      "total": 100,
      "pages": 5
    }
  }
}
```

### 错误响应
```json
{
  "success": false,
  "message": "错误描述",
  "code": 400,
  "error_code": 1002,
  "data": null
}
```

---

## 认证接口

### 管理员登录
```
POST /auth/login
```

**请求体**:
```json
{
  "username": "admin",
  "password": "Admin@2026#Secure"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "expires_in": 86400
  }
}
```

### 微信登录
```
POST /auth/wx-login
```

**请求体**:
```json
{
  "code": "wx_login_code"
}
```

---

## 询价接口

### 创建询价
```
POST /inquiry
```

**请求头**:
- `Authorization`: Bearer {token} (可选)

**请求体**:
```json
{
  "productCode": "600519",
  "productName": "贵州茅台",
  "optionType": "call",
  "structure": "vanilla",
  "term": "1M",
  "notionalAmount": 1000,
  "strikePrice": 100,
  "selectedDealers": ["CICC"],
  "contactName": "张三",
  "contactPhone": "13800138000",
  "contactEmail": "test@example.com",
  "notes": "备注信息"
}
```

**响应**:
```json
{
  "success": true,
  "message": "询价提交成功",
  "data": {
    "id": "inquiry_123"
  }
}
```

### 获取询价列表
```
GET /inquiries?page=1&pageSize=20&status=pending
```

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | int | 否 | 页码，默认1 |
| pageSize | int | 否 | 每页条数，默认20 |
| status | string | 否 | 状态过滤 |

### 获取询价详情
```
GET /inquiries/{id}
```

### 更新询价状态
```
PUT /inquiries/{id}/status
```

**请求体**:
```json
{
  "status": "processing",
  "remark": "正在处理"
}
```

---

## 行情接口

### 获取行情列表
```
GET /quotes?type=stock
```

**查询参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| type | string | 类型: index, stock, etf, option |
| codes | string | 股票代码，逗号分隔 |

### 获取期权行情
```
GET /options?underlying=510050
```

---

## 持仓接口

### 获取持仓列表
```
GET /positions?customerId={id}
```

### 创建持仓
```
POST /positions
```

**请求体**:
```json
{
  "customerId": "user_123",
  "productCode": "600519",
  "productName": "贵州茅台",
  "quantity": 1000,
  "price": 1702.35
}
```

### 平仓
```
POST /positions/{id}/close
```

**请求体**:
```json
{
  "closePrice": 1750.00,
  "closeType": "accounting"
}
```

---

## 用户接口

### 获取用户信息
```
GET /users/me
```

### 更新用户信息
```
PUT /users/me
```

### 获取账户余额
```
GET /users/balance
```

### 充值
```
POST /users/deposit
```

**请求体**:
```json
{
  "amount": 10000,
  "remark": "充值"
}
```

---

## 管理接口

### 获取询价统计
```
GET /admin/inquiries/statistics
```

**响应**:
```json
{
  "success": true,
  "data": {
    "pending": 10,
    "processing": 5,
    "quoted": 8,
    "completed": 20,
    "rejected": 3
  }
}
```

### 获取所有用户
```
GET /admin/users
```

### 更新用户状态
```
PUT /admin/users/{id}/status
```

---

## 消息接口

### 获取消息列表
```
GET /messages?page=1&pageSize=20
```

### 标记消息已读
```
PUT /messages/{id}/read
```

### 获取未读数量
```
GET /messages/unread-count
```

---

## 错误码

### 通用错误 (1000-1999)
| 错误码 | 说明 |
|--------|------|
| 1000 | 未知错误 |
| 1001 | 无效的请求 |
| 1002 | 数据验证失败 |
| 1003 | 资源不存在 |
| 1004 | 资源已存在 |

### 认证错误 (2000-2999)
| 错误码 | 说明 |
|--------|------|
| 2000 | 未授权 |
| 2001 | Token已过期 |
| 2002 | Token无效 |
| 2003 | 权限不足 |
| 2004 | 请先登录 |

### 用户错误 (3000-3999)
| 错误码 | 说明 |
|--------|------|
| 3000 | 用户不存在 |
| 3001 | 用户已禁用 |
| 3002 | 密码错误 |
| 3003 | 手机号已存在 |

### 交易错误 (4000-4999)
| 错误码 | 说明 |
|--------|------|
| 4000 | 余额不足 |
| 4001 | 持仓不存在 |
| 4002 | 持仓已平仓 |
| 4003 | 订单不存在 |
| 4004 | 订单已成交 |
| 4005 | 超过交易限额 |
| 4006 | 风控检查未通过 |

---

## 限流说明

API 请求有限流保护，默认限制：
- 普通接口：60次/分钟
- 登录接口：5次/分钟
- 短信接口：3次/分钟

超限时返回 429 状态码，响应头包含：
- `X-RateLimit-Limit`: 最大请求数
- `X-RateLimit-Remaining`: 剩余请求数
- `X-RateLimit-Reset`: 重置时间（秒）

---

## 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0.0 | 2025-12-01 | 初始版本 |
| v1.1.0 | 2026-03-22 | 添加Redis限流、类型定义 |