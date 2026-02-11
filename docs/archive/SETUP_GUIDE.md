# 期权交易平台 - 环境配置和启动指南

## 当前状态
✅ **Python静态服务器已启动** - 图片资源问题已临时解决
✅ **Node.js后端服务器** - 已提供完整后端API实现

## 问题解决状态

### 1. 图片资源加载500错误 ✅ 已解决
**问题**: 所有 `/images/` 路径的图片返回500错误
**解决方案**: 
- 启动了Python临时静态服务器 (端口3000)
- 服务器会自动查找图片并提供默认SVG图标
- 访问地址: http://localhost:3000/images/

### 2. 微信API调用问题 ✅ 已解决  
**问题**: `getUserProfile:fail can only be invoked by user TAP gesture`
**解决方案**: 
- 修改了 `onLogin` 函数，确保只在用户手势事件中调用
- 添加了事件类型检查
- 暂时注释掉后端API调用，避免网络错误

### 3. 已废弃API警告 ✅ 已解决
**问题**: `wx.getSystemInfo is deprecated`
**解决方案**: 使用新的API组合替代

### 4. 管理后台出现 503 / 502 或接口请求失败 ✅ 已解决
**问题现象**:
- 浏览器打开管理后台或调用接口时出现 `503 Service Temporarily Unavailable`（nginx 页面）或 `502/ECONNREFUSED`（开发代理报错）
- Vite 终端出现类似日志：`http proxy error ... connect ECONNREFUSED 127.0.0.1:5000`

**复现步骤**:
1. 启动管理后台开发服务器：`npm run dev:ui`
2. 未启动或无法启动后端时，访问：`http://localhost:5173/admin/`
3. 触发接口请求（如列表查询/上传确认），观察接口报错

**根因分析**:
- 管理后台开发代理默认将 `/api` 转发到 `http://127.0.0.1:${FLASK_PORT}`（默认 5000）
- 当前仓库同时包含 Node API（`app.js`）与 Flask（`app.py`），但开发时管理后台实际依赖的是 Node API 的 `/api/v1/**` 接口
- 当 5000 端口没有后端监听（或 Windows 上 `python` 指向系统占位程序导致 Flask 无法启动）时，Vite 代理会连接失败；在部署环境中，如果 nginx 上游配置指向未运行的端口，也会返回 503

**解决方案**:
- Node API 默认监听端口改为 5002，避免与 Flask 默认端口 5000 冲突
- 在 `.env.local` 增加 `VITE_API_PROXY_TARGET=http://127.0.0.1:5002`，让管理后台的 `/api/**` 代理始终转发到 Node API

**验证方法**:
- Node API 直连验证：
  - `http://localhost:5002/api/v1/admin/quotes?page=1&pageSize=1` 返回 200
- 管理后台代理验证：
  - `http://localhost:5173/api/v1/admin/quotes?page=1&pageSize=1` 返回 200

**预防措施与注意事项**:
- 保持 Node 与 Flask 使用不同端口，避免 “同一环境变量同时控制两个服务端口” 引起的误配置
- Windows 如果需要启动 Flask，请安装可用的 Python 发行版，并避免 `python` 指向 Microsoft Store 占位程序
- 生产环境出现 nginx 503 时，优先检查反代上游端口、进程是否存活、以及健康检查是否通过

## 当前运行的服务

### Python静态文件服务器 (运行中)
- **地址**: http://localhost:3000
- **功能**: 提供图片和静态资源
- **状态**: ✅ 正常运行
- **日志**: 会显示图片请求和默认图标生成

## Node.js 后端服务器

项目提供了一个完整的 Node.js 后端 API 服务器，用于支持登录等需要后端接口的功能。

### 启动 Node.js 后端服务器

#### 方法1: 使用安装脚本（Windows）
```bash
# 进入 backend 目录
cd backend

# 运行安装脚本
install-nodejs.bat
```

#### 方法2: 手动安装和启动
```bash
# 进入 backend 目录
cd backend

# 安装依赖
npm install

# 启动服务器
npm start
```

#### 方法3: 开发模式启动（支持热重载）
```bash
# 进入 backend 目录
cd backend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 后端服务器信息

- **端口**: 3000
- **基础URL**: http://localhost:3000
- **注意**: Node.js 后端服务器和 Python 静态服务器不能同时使用同一个端口

### 后端接口说明

服务器启动后将在 `http://localhost:3000` 提供以下接口：

1. **微信登录接口**
   - 路径：`POST /api/auth/wechat/login`
   - 参数：`{ code: string, userInfo: object }`
   - 说明：模拟微信登录，返回 token 等信息

2. **获取用户信息接口**
   - 路径：`GET /api/user/info`
   - 请求头：`Authorization: Bearer [token]`
   - 说明：获取当前登录用户的信息

3. **更新用户信息接口**
   - 路径：`POST /api/user/update`
   - 请求头：`Authorization: Bearer [token]`
   - 参数：`{ userInfo: object }`
   - 说明：更新用户信息

4. **测试接口**
   - 路径：`GET /api/test`
   - 说明：检查服务器运行状态

### 注意事项
- 所有接口均返回模拟数据，无需真实数据库和微信验证
- 服务器仅用于开发测试，请勿用于生产环境
- 启动后端服务器后，前端小程序的登录功能即可正常使用

## 后续安装步骤

### 安装Node.js (推荐)
1. 下载Node.js: https://nodejs.org/zh-cn/
2. 安装完成后运行：
   ```bash
   cd backend
   npm install
   npm start
   ```

### 或者使用包管理器安装 (Windows)
```powershell
# 使用Chocolatey
choco install nodejs

# 使用Winget
winget install OpenJS.NodeJS
```

## 完整启动流程

### 当前（临时解决方案）
1. ✅ Python服务器已启动 (端口3000)
2. 📱 小程序可以正常加载页面和图片
3. ⚠️ 后端业务API暂不可用

### 安装Node.js后（完整解决方案）
1. 停止Python服务器 (Ctrl+C)
2. 启动Node.js后端:
   ```bash
   cd backend
   npm install
   npm start
   ```
3. 取消注释 `pages/profile/profile.js` 中的API调用代码

## 测试链接

- 🌐 主页: http://localhost:3000/
- 📷 图片测试: http://localhost:3000/images/signal1.png
- ❤️ 健康检查: http://localhost:3000/health
- 🧪 后端测试: http://localhost:3000/api/test

## 故障排除

### 如果端口3000被占用
修改 `simple_server.py` 中的端口号：
```python
PORT = 3001  # 改为其他端口
```

### 如果图片仍然加载失败
检查小程序的网络权限配置，确保允许访问localhost。

### 如果 Node.js 服务器启动失败
1. 确保已正确安装 Node.js
2. 检查端口是否被占用
3. 查看终端错误信息

## 注意事项

1. ⚠️ 当前Python服务器仅用于开发测试
2. 🔒 生产环境需要使用Node.js后端的完整安全配置
3. 📱 微信小程序开发工具需要开启"不校验合法域名"选项
4. 🌐 如需外网访问，需要配置HTTPS和域名

## 联系信息

如有问题，请检查：
1. Python服务器是否在运行
2. 端口3000是否被占用
3. 网络连接是否正常
4. Node.js 是否正确安装

## 团队工作流程与权限体系（给组内成员）

### 1) 账号与权限（个人账号 + 最小权限）

**码云/Git 仓库权限（建议）**
- 每位成员必须使用个人码云账号加入仓库，禁止共享账号
- `main`/`develop` 建议设为保护分支：禁止直接 push，只允许 PR 合并
- 合并前至少 1-2 人 Review（按公司安全政策调整），并要求 CI 通过

**管理后台账号权限（/api/v1/auth）**
- 角色分为：`viewer`（只读）、`editor`（可写：上传/同步/删除报价等）、`admin`（账号管理 + 全部权限）
- 登录接口：`POST /api/v1/auth/login`
- 查询自身：`GET /api/v1/auth/me`
- 账号管理（仅 `admin`，需要 MongoDB 已连接）：
  - `GET /api/v1/auth/users`：查看账号列表
  - `POST /api/v1/auth/users`：创建/重置密码/调整角色
  - `DELETE /api/v1/auth/users/<username>`：删除账号

### 2) 文件共享与协作机制
- 代码协作统一走 PR：每个需求/修复一个分支，PR 里写清变更范围与验证方式
- 环境变量与密钥：只提交 `.env.example`，实际值放在 `.env.local`（已忽略）并通过公司合规渠道下发
- 运行产物/临时文件不入库：日志、`temp_uploads/`、Office 临时文件（`~$*`）等已在 `.gitignore` 排除

### 3) 标准操作指南（成员上手清单）
- 拉代码：配置 SSH Key（码云）→ `git clone` → `git checkout -b feature/...`
- 配置环境：复制 `.env.example` 为 `.env.local` 并填入个人/环境参数（不要提交）
- 启动服务：按项目约定启动后端与管理后台，并用健康检查接口确认可用
- 提交合并：按 [CONTRIBUTING.md](file:///c:/Users/Lenovo/Desktop/Over-the-counter-options-junwei/CONTRIBUTING.md) 的分支/提交/PR 规范执行

### 4) 工具与系统访问权限（建议清单）
- 开发工具：Git、Node.js（>=18）、npm（>=9）、VS Code
- 管理后台：进入 `admin-ui/` 执行 `npm install`、`npm run dev`（或按项目脚本）
- Python/Flask（如需）：安装可用 Python 发行版，避免 `python` 指向占位程序
- 数据库与云资源：MongoDB、微信云开发/云数据库的账号与权限由管理员按最小权限分配

### 5) 培训与技术支持方案（建议）
- 新成员入组：1 次 30-60 分钟上手培训（环境、分支策略、权限申请、发布流程）
- 每周/每双周：固定答疑时间窗；统一在群/工单系统收集问题
- 关键变更：发布前安排同步会议并在 PR/发布说明中记录回滚方案
