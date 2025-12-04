# 微信小程序后端 API 服务器设置总结

## 创建的文件列表

### 后端服务器文件 (backend 目录)
1. **[package.json](file:///c:/Users/Lenovo/xwechat_files/wxid_thityk59esta12_ffd7/msg/file/2025-09/%E5%9C%BA%E5%A4%96%E6%9C%9F%E6%9D%83HTmL/backend/package.json)** - 项目依赖和脚本配置
2. **[server.js](file:///c:/Users/Lenovo/xwechat_files/wxid_thityk59esta12_ffd7/msg/file/2025-09/%E5%9C%BA%E5%A4%96%E6%9C%9F%E6%9D%83HTmL/backend/server.js)** - 主服务器文件
3. **[README.md](file:///c:/Users/Lenovo/xwechat_files/wxid_thityk59esta12_ffd7/msg/file/2025-09/%E5%9C%BA%E5%A4%96%E6%9C%9F%E6%9D%83HTmL/README.md)** - 后端服务器使用说明
4. **[start.bat](file:///c:/Users/Lenovo/xwechat_files/wxid_thityk59esta12_ffd7/msg/file/2025-09/%E5%9C%BA%E5%A4%96%E6%9C%9F%E6%9D%83HTmL/start.bat)** - Windows 启动脚本
5. **[install-nodejs.bat](file:///c:/Users/Lenovo/xwechat_files/wxid_thityk59esta12_ffd7/msg/file/2025-09/%E5%9C%BA%E5%A4%96%E6%9C%9F%E6%9D%83HTmL/install-nodejs.bat)** - Node.js 安装检查脚本

### 项目根目录文件
1. **[start_all.bat](file:///c:/Users/Lenovo/xwechat_files/wxid_thityk59esta12_ffd7/msg/file/2025-09/%E5%9C%BA%E5%A4%96%E6%9C%9F%E6%9D%83HTmL/start_all.bat)** - 同时启动前后端服务器的脚本
2. **[SETUP_GUIDE.md](file:///c:/Users/Lenovo/xwechat_files/wxid_thityk59esta12_ffd7/msg/file/2025-09/%E5%9C%BA%E5%A4%96%E6%9C%9F%E6%9D%83HTmL/SETUP_GUIDE.md)** - 更新的设置指南
3. **[README.md](file:///c:/Users/Lenovo/xwechat_files/wxid_thityk59esta12_ffd7/msg/file/2025-09/%E5%9C%BA%E5%A4%96%E6%9C%9F%E6%9D%83HTmL/README.md)** - 更新的项目说明文档

### 更新的文件
1. **[utils/api.js](file:///c:/Users/Lenovo/xwechat_files/wxid_thityk59esta12_ffd7/msg/file/2025-09/%E5%9C%BA%E5%A4%96%E6%9C%9F%E6%9D%83HTmL/utils/api.js)** - 更新基础 URL 为 http://localhost:3001/api
2. **[backend/server.js](file:///c:/Users/Lenovo/xwechat_files/wxid_thityk59esta12_ffd7/msg/file/2025-09/%E5%9C%BA%E5%A4%96%E6%9C%9F%E6%9D%83HTmL/backend/server.js)** - 更新端口为 3001

## 功能说明

### 后端 API 接口
1. **POST /api/auth/wechat/login** - 微信登录接口
2. **GET /api/user/info** - 获取用户信息接口
3. **POST /api/user/update** - 更新用户信息接口
4. **GET /api/test** - 服务器测试接口

### 特性
- 使用 Express.js 框架
- 启用 CORS 跨域支持
- 所有接口返回模拟数据（无需真实数据库）
- 完整的错误处理机制
- Token 验证机制
- 启动时打印所有可用接口列表

## 安装和启动步骤

### 1. 安装 Node.js
访问 https://nodejs.org/zh-cn/ 下载并安装最新 LTS 版本。

### 2. 安装项目依赖
```bash
cd backend
npm install
```

### 3. 启动服务器
```bash
# 开发模式（支持热重载）
npm run dev

# 或生产模式
npm start
```

### 4. 使用启动脚本
```bash
# 同时启动前后端服务器
start_all.bat
```

## 配置说明

### 端口配置
- **Python 静态服务器**: 端口 3000
- **Node.js 后端服务器**: 端口 3001

### 前端配置
在 [utils/api.js](file:///c:/Users/Lenovo/xwechat_files/wxid_thityk59esta12_ffd7/msg/file/2025-09/%E5%9C%BA%E5%A4%96%E6%9C%9F%E6%9D%83HTmL/utils/api.js) 中配置的基础 URL:
```javascript
const BASE_URL = 'http://localhost:3001/api';
```

## 测试接口

启动服务器后，可以使用以下 URL 测试:

1. **服务器测试**: http://localhost:3001/api/test
2. **微信登录测试**: 
   ```bash
   curl -X POST http://localhost:3001/api/auth/wechat/login \
        -H "Content-Type: application/json" \
        -d '{"code":"test-code","userInfo":{"nickName":"测试用户"}}'
   ```

## 注意事项

1. 所有接口均返回模拟数据，无需真实数据库和微信验证
2. 服务器仅用于开发测试，请勿用于生产环境
3. Token 和用户信息存储在内存中，服务器重启后会丢失
4. 启动后端服务器后，前端小程序的登录功能即可正常使用