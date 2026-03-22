# 云托管手动部署指南

## 当前状态
✅ 代码已推送到 Git (commit: 9de0ed5)
❌ 云端服务器还在运行旧版本代码

## 快速部署步骤

### 方法 1：通过微信开发者工具（最简单）

1. **打开微信开发者工具**
2. 点击顶部菜单 **"云开发"** → 进入云开发控制台
3. 左侧菜单选择 **"云托管"**
4. 找到 `flask` 服务并点击进入
5. 点击 **"版本管理"** → **"新建版本"**
6. 选择部署方式：
   - **代码库拉取**（推荐）：
     - 选择分支：`junwei`
     - 勾选"使用 Dockerfile 构建"
     - 点击"开始构建"
   - 或 **本地上传**：
     - 选择项目根目录
     - 点击"上传并构建"
7. 等待 3-5 分钟，查看部署状态
8. 部署成功后，刷新小程序重新测试登录

### 方法 2：通过腾讯云控制台

1. 访问：https://console.cloud.tencent.com/tcb/env/index
2. 选择环境：`develop-8gx7kh9g045e6c9a`
3. 左侧菜单：**云托管** → **服务列表**
4. 找到 `flask` 服务 → **版本管理**
5. 点击 **"新建版本"**
6. 选择代码来源：
   - **Git 仓库**
   - 分支：`junwei`
   - 镜像构建方式：Dockerfile
7. 点击"确定"开始部署

## 验证部署

部署完成后，在浏览器测试：

```powershell
# 测试健康检查
Invoke-RestMethod -Uri "https://flask-ym1v-210758-7-1374336462.sh.run.tcloudbase.com/api/v1/health"

# 测试登录接口（应该成功，使用模拟登录）
Invoke-RestMethod -Uri "https://flask-ym1v-210758-7-1374336462.sh.run.tcloudbase.com/api/v1/auth/wechat/login" -Method Post -Body '{"code":"test_mock_login"}' -ContentType "application/json"
```

预期返回：
```json
{
  "success": true,
  "data": {
    "token": "...",
    "openid": "mock_openid_...",
    "nickname": "测试用户"
  }
}
```

## 常见问题

### Q: 部署失败怎么办？
A: 查看构建日志，常见原因：
- Dockerfile 路径错误
- 依赖安装失败
- 端口配置错误（应为 80）

### Q: 部署成功但还是 500 错误？
A: 检查环境变量配置，确保设置了：
- `NODE_ENV=production`
- `SECRET_KEY`（随机密钥）
- `JWT_SECRET`（随机密钥）

### Q: 小程序还是连不上？
A: 
1. 确认小程序合法域名已配置
2. 清除小程序缓存重新编译
3. 检查 `miniprogram/config/api.config.js` 中的地址

## 修复内容说明

本次修复的核心变更：
- `services/auth_service.py`: 微信登录降级逻辑
- `miniprogram/config/api.config.js`: 智能环境适配

修复后，即使云端没有配置微信 Secret，登录也能正常工作（使用模拟用户）。
