# 🛡️ 账户功能技术审查与安全评估报告

**评估对象**: 场外期权交易系统账户模块 (后端 Auth/Customer API + 小程序登录)  
**评估日期**: 2026-02-02  
**评估标准**: OWASP Top 10 (2021), GDPR 数据保护原则

---

## 1. 🚨 核心风险摘要 (Executive Summary)

本次审查发现 **1 个极高危漏洞 (Critical)** 和 **3 个高风险隐患 (High)**，需立即修复。
最严重的问题是 **客户管理接口完全未鉴权**，任何互联网用户均可读取、修改客户数据。

| 风险等级 | 问题描述 | 影响范围 | 状态 |
| :--- | :--- | :--- | :--- |
| 🔴 **Critical** | `routes/customer.py` 全接口未鉴权 | 客户数据泄露、被恶意篡改 | 待修复 |
| 🟠 **High** | 生产环境密钥配置存在默认回退值 | 身份伪造、会话劫持 | 待修复 |
| 🟠 **High** | 小程序端存在 Mock 逻辑回退 | 生产环境可能误入测试模式 | 待修复 |
| 🟡 **Medium** | 敏感 PII 信息 (手机号) 明文传输与存储 | 不符合 GDPR/个人信息保护法 | 建议优化 |

---

## 2. 🔍 详细漏洞分析 (Vulnerability Analysis)

### 2.1 越权访问 (Broken Access Control)
*   **漏洞点**: `routes/customer.py` 中的所有路由 (`GET /customers`, `POST /customers`, `PUT /customers/<id>`) 均未使用 `@require_auth` 或 `@require_roles` 装饰器。
*   **后果**: 攻击者无需登录即可拉取所有客户名单、创建垃圾数据或修改现有客户信息。
*   **修复方案**: 立即为 `customer_bp` 下的所有路由添加鉴权装饰器。

### 2.2 敏感信息泄露 (Cryptographic Failures)
*   **配置**: `config.py` 中 `SECRET_KEY` 和 `JWT_SECRET` 有硬编码的默认值 (`dev-secret-key...`)。如果生产环境环境变量注入失败，系统将回退到已知弱密钥。
*   **后果**: 攻击者可伪造 JWT Token，接管任意账户（包括管理员）。
*   **修复方案**: 生产环境配置 (`ProductionConfig`) 中应移除默认值，若环境变量缺失则强制启动失败。

### 2.3 逻辑缺陷 (Business Logic Errors)
*   **Mock 回退**: `miniprogram/utils/loginService.js` 在云函数或 API 调用失败时，会静默回退到 Mock 数据（生成假的 `userId`）。
*   **后果**: 用户可能在不知情的情况下进入“假登录”状态，操作数据无法同步，且难以排查问题。
*   **修复方案**: 生产环境 (`envVersion === 'release'`) 严禁回退到 Mock 数据，必须报错提示用户。

### 2.4 数据保护不足 (Privacy Design)
*   **PII 暴露**: 客户列表接口直接返回完整的 `phone` 和 `email`。
*   **修复方案**: 列表接口应对敏感字段进行脱敏处理 (e.g., `138****8888`)，仅在详情页经确权后返回明文。

---

## 3. 🏗️ 代码质量与架构审查

### 3.1 优点
*   **密码学**: 使用了 `PBKDF2-HMAC-SHA256` 算法，迭代次数 200,000，加盐策略正确。
*   **JWT**: Token 结构标准，包含了 `iat` 和 `exp`，且有角色 (`role`) 字段。
*   **模块化**: 认证逻辑 (`auth.py`) 与业务逻辑分离，结构清晰。

### 3.2 待改进
*   **输入验证**: 缺乏统一的 Request Body 校验层（目前是手动 `if field not in data`），容易遗漏。建议引入 `pydantic` 或 `marshmallow`。
*   **错误处理**: 部分 `try-except` 块过于宽泛，可能掩盖底层数据库连接错误。
*   **日志审计**: 关键操作（如登录、创建用户）虽然有 Log，但缺乏结构化审计日志（Who, When, What, Result）。

---

## 4. 🛠️ 改进建议与实施路线图

### 🛑 阶段一：紧急修复 (P0 - 立即执行)

1.  **修复客户接口鉴权**:
    ```python
    # routes/customer.py
    from routes.auth import require_auth, require_roles

    @customer_bp.route('/customers', methods=['GET'])
    @require_auth  # 必须添加
    @require_roles('admin', 'editor') # 建议添加角色限制
    def get_customers(): ...
    ```

2.  **移除生产环境弱密钥**:
    ```python
    # config.py - ProductionConfig
    SECRET_KEY = os.environ.get('SECRET_KEY')
    if not SECRET_KEY:
        raise ValueError("No SECRET_KEY set for production configuration")
    ```

3.  **清理前端 Mock 逻辑**:
    修改 `loginService.js`，在非开发环境 (`develop`) 下移除所有 `resolve(mockResult)` 分支。

### 🛡️ 阶段二：安全加固 (P1 - 上线前完成)

4.  **增加 API 限流 (Rate Limiting)**:
    引入 `Flask-Limiter`，对 `/auth/login` 和 `/auth/wechat/login` 接口限制每分钟请求次数 (e.g., 5/min)，防止暴力破解。

5.  **数据脱敏**:
    修改 `get_customers` 列表接口，对手机号中间四位进行 `*` 号遮挡。

### 🚀 阶段三：架构优化 (P2 - 长期迭代)

6.  **引入 Pydantic 做参数校验**:
    ```python
    class CreateCustomerSchema(BaseModel):
        name: str = Field(..., min_length=2)
        phone: str = Field(..., pattern=r'^1[3-9]\d{9}$')
    ```

7.  **完善审计日志**:
    建立专门的 `audit_logs` 集合，记录所有写操作（Create/Update/Delete）的操作人 ID、IP 和变更内容快照。

---

## 5. ✅ 测试用例建议

在修复后，请务必执行以下安全测试用例：

1.  **越权测试**: 使用未登录或普通用户 Token 尝试访问 `POST /api/v1/customers`，预期返回 401/403。
2.  **暴力破解测试**: 连续 10 次错误密码登录，验证是否触发限流或锁定。
3.  **密钥测试**: 尝试在不设置 `SECRET_KEY` 环境变量的情况下启动生产模式应用，预期启动失败。
4.  **Mock 穿透测试**: 断开后端网络，在小程序端尝试登录，预期提示“网络错误”而非进入假登录状态。
