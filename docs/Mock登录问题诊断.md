# Mock登录问题诊断与修复

## 问题描述
用户报告 **Dev Mock 登录失败**，错误信息为：
```
Error: 服务器内部错误，请稍后重试
at success (api.js:429)
```

## 诊断过程

### 1. 检查后端路由实现
查看了 `routes/auth.py` 中的 `/auth/wechat/login` 路由（第406-436行）：
- 路由逻辑正确，调用 `auth_service.wechat_login(code)`
- 返回格式符合标准：`flask_success_response(data={...}, message="登录成功")`

### 2. 检查Mock登录实现
查看了 `services/auth_service.py` 中的 `wechat_login` 方法（第303-344行）：
- Mock登录逻辑正确：当code以"mock_"开头时返回模拟用户数据
- 不依赖数据库连接，即使数据库失败也能正常工作
- 返回格式：`(True, user_dict, None)`

### 3. 检查Token生成
查看了 `services/auth_service.py` 中的 `issue_token` 方法（第115-169行）：
- 生成双Token机制：access_token（15分钟）+ refresh_token（7天）
- 返回格式：
```python
{
    "token": access_token,
    "access_token": access_token,
    "refresh_token": refresh_token,
    "expires_in": 900
}
```

## 根本原因

**缺少详细日志导致无法定位具体错误**

虽然代码逻辑看起来正确，但缺少详细的调试日志，无法追踪：
1. 请求是否成功到达后端
2. Mock登录逻辑是否被正确触发
3. Token生成是否成功
4. 在哪个环节抛出异常

## 修复方案

### 修复1：增强后端路由日志
在 `routes/auth.py` 的 `/wechat/login` 路由中增加详细日志：

```python
@auth_bp.route("/wechat/login", methods=["POST"])
def wechat_login():
    data = request.get_json() or {}
    code = data.get('code')
    
    logger.info(f"[微信登录] 收到登录请求，code: {code[:20] if code else 'None'}...")
    
    if not code:
        logger.warning("[微信登录] 缺少code参数")
        return flask_error_response("缺少code参数", 400)
    
    try:
        logger.info(f"[微信登录] 开始调用 auth_service.wechat_login")
        ok, user, err = auth_service.wechat_login(code)
        
        logger.info(f"[微信登录] wechat_login 返回: ok={ok}, user={user}, err={err}")
        
        if not ok:
            logger.error(f"[微信登录] 登录失败: {err}")
            return flask_error_response(err or "登录失败", 500)
        
        logger.info(f"[微信登录] 开始生成Token，openid: {user.get('openid')}")
        token_data = auth_service.issue_token(user['openid'], 'user')
        
        logger.info(f"[微信登录] Token生成成功，token_data keys: {list(token_data.keys())}")
        
        # 构建响应数据（支持双Token机制）
        response_data = {
            'token': token_data['token'],
            'access_token': token_data.get('access_token', token_data['token']),
            'refresh_token': token_data.get('refresh_token'),
            'expires_in': token_data.get('expires_in', 900),
            'openid': user['openid'],
            'unionid': user.get('unionid'),
            'nickname': user.get('nickname', '微信用户'),
            'avatar': user.get('avatar', ''),
            'phone': user.get('phone', '')
        }
        
        logger.info(f"[微信登录] 返回成功响应")
        return flask_success_response(data=response_data, message="登录成功")
        
    except Exception as e:
        logger.exception(f"[微信登录] 接口异常: {str(e)}")
        return flask_error_response(f"服务器内部错误: {str(e)}", 500)
```

### 修复2：增强Mock登录日志
在 `services/auth_service.py` 的 `wechat_login` 方法中增加详细日志：

```python
if code.startswith("mock_") or not has_wx_config:
    try:
        logger.info(f"[Mock登录] 开始处理. Code: {code[:20]}..., has_wx_config: {has_wx_config}, has_db: {has_db_connection}")
        
        openid = f"mock_openid_{code[:20]}"
        unionid = f"mock_unionid_{code[:20]}"
        
        logger.info(f"[Mock登录] 生成openid: {openid}, unionid: {unionid}")
        
        user = {
            'openid': openid,
            'unionid': unionid,
            'nickname': '开发用户',
            'avatar': '',
            'phone': '',
            'created_at': datetime.utcnow(),
            'last_login': datetime.utcnow()
        }
        
        logger.info(f"[Mock登录] 用户对象创建成功: {user}")
        
        try:
            logger.info(f"[Mock登录] 尝试同步用户到客户表...")
            self._sync_user_to_customer(user)
            logger.info(f"[Mock登录] 用户同步成功")
        except Exception as sync_err:
            logger.warning(f"[Mock登录] 同步用户到客户表失败（不影响登录）: {sync_err}")
        
        logger.info(f"[Mock登录] 返回成功: openid={openid}")
        return True, user, None
        
    except Exception as e:
        logger.exception(f"[Mock登录] 失败: {e}")
        return False, None, f"模拟登录失败: {str(e)}"
```

### 修复3：返回完整Token数据
在路由响应中添加 `access_token` 和 `refresh_token`，支持双Token机制：

```python
response_data = {
    'token': token_data['token'],
    'access_token': token_data.get('access_token', token_data['token']),
    'refresh_token': token_data.get('refresh_token'),
    'expires_in': token_data.get('expires_in', 900),
    'openid': user['openid'],
    'unionid': user.get('unionid'),
    'nickname': user.get('nickname', '微信用户'),
    'avatar': user.get('avatar', ''),
    'phone': user.get('phone', '')
}
```

## 下一步操作

### 1. 重启后端服务
修改了后端代码，需要重启Flask服务：

```powershell
# 停止当前运行的Flask服务（如果有）
# 然后启动服务
python app.py
```

或者使用启动脚本：
```powershell
.\start_backend.ps1
```

### 2. 测试Mock登录
在小程序开发工具中：
1. 打开开发者工具控制台
2. 点击登录按钮
3. 查看后端日志输出（应该能看到详细的 `[Mock登录]` 日志）

### 3. 检查日志输出
后端日志应该显示类似以下内容：
```
[微信登录] 收到登录请求，code: mock_...
[微信登录] 开始调用 auth_service.wechat_login
[Mock登录] 开始处理. Code: mock_...
[Mock登录] 生成openid: mock_openid_...
[Mock登录] 用户对象创建成功: {...}
[Mock登录] 返回成功: openid=mock_openid_...
[微信登录] wechat_login 返回: ok=True, user={...}, err=None
[微信登录] 开始生成Token，openid: mock_openid_...
[微信登录] Token生成成功，token_data keys: ['token', 'access_token', 'refresh_token', 'expires_in']
[微信登录] 返回成功响应
```

如果出错，日志会显示具体的异常信息和堆栈跟踪。

## 修改文件清单

1. **routes/auth.py** (第406-436行)
   - 增加详细的登录流程日志
   - 优化响应数据结构，支持双Token

2. **services/auth_service.py** (第316-344行)
   - 增加详细的Mock登录日志
   - 使用 `logger.exception` 记录完整异常堆栈

## 预期效果

1. **可追踪性**：每个步骤都有日志记录，方便定位问题
2. **完整信息**：返回双Token和完整用户信息
3. **错误定位**：异常时输出详细堆栈，快速定位原因

---

**修复时间**: 2026-02-25  
**状态**: 等待重启后端服务验证
