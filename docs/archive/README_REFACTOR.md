# 项目重构说明

本项目已经过全面重构，采用了分层架构 (Controller-Service-Model) 以提高可维护性和扩展性。

## 目录结构

- `routes/`: 路由层 (Controller)，处理 HTTP 请求、参数校验和响应格式化。
  - `auth.py`: 认证相关 (Admin Login, WeChat Login)
  - `group.py`: 板块管理
  - `inquiry.py`: 询价管理
  - `trade.py`: 交易管理 (订单、持仓)
  - `stock.py`: 股票行情
  - `customer.py`: 客户管理
- `services/`: 业务逻辑层 (Service)，处理核心业务规则。
  - `auth_service.py`: 认证服务
  - `quote_service.py`: 行情服务 (含缓存)
  - `trade_service.py`: 交易服务 (询价/订单/持仓)
  - `stock_service.py`: 基础股票数据服务
- `models/`: 数据访问层 (Model)，封装 MongoDB 和 WeChat Cloud DB 的操作。
  - `user.py`: 用户模型 (Admin & WeChat)
  - `group.py`: 板块模型
  - `inquiry.py`: 询价模型
  - `order.py`: 订单模型
  - `position.py`: 持仓模型
  - `stock.py`: 股票缓存模型
  - `customer.py`: CRM 客户模型
- `utils/`: 小程序端工具库。
  - `request.js`: 网络请求封装 (自动处理 Token)
  - `auth.js`: 登录逻辑封装
- `backend_utils/`: 后端工具库。
  - `response.py`: 统一响应格式
- `admin-ui/`: 后台管理前端 (React)。

## API 规范

所有 API 均返回 JSON 格式：

```json
{
  "code": 0,      // 0 表示成功，非 0 表示错误 (如 401, 403, 500)
  "message": "...", // 提示信息
  "data": ...     // 数据载荷
}
```

## 认证机制

- **后台管理**: 使用 JWT (`Authorization: Bearer <token>`)。
- **小程序**: 使用 JWT (`Authorization: Bearer <token>`)。登录接口 `/api/v1/auth/wechat/login` 交换 `code` 获取 Token。

## 部署

1. 安装依赖: `pip install -r requirements.txt`
2. 设置环境变量 (参考 `.env.example`)
3. 启动服务: `python app.py`

## 测试

运行集成测试: `python -m unittest tests/test_refactor.py`
