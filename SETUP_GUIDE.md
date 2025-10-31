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