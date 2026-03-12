# 云函数管理工具使用说明

## 📋 工具列表

### 1. 部署脚本 (`scripts/deploy-cloudfunctions.js`)
自动化部署云函数到微信云开发平台

**使用方法:**
```bash
# 部署所有函数
npm run deploy:functions

# 部署指定函数
npm run deploy:functions -- --functions dataImporter,updateQuotes

# 试运行模式（不实际部署）
npm run deploy:functions -- --dry-run
```

### 2. 监控脚本 (`scripts/monitor-cloudfunctions.js`)
实时监控云函数运行状态和性能指标

**使用方法:**
```bash
# 持续监控
npm run monitor:functions

# 单次检查
npm run monitor:functions -- --once

# 自定义检查间隔（毫秒）
npm run monitor:functions -- --interval 300000
```

### 3. 管理面板 (`admin-web/cloud-functions-dashboard.html`)
可视化管理界面，提供图形化操作

**使用方法:**
```bash
# 打开管理面板
npm run dashboard
```

## 🚀 快速开始

1. **安装依赖**
```bash
npm install
```

2. **配置环境变量**
```bash
# 在 .env 文件中设置
WECHAT_CLOUD_ENV_ID=your-env-id
ALERT_WEBHOOK_URL=your-webhook-url
ALERT_EMAIL=your-email@example.com
```

3. **首次部署**
```bash
npm run deploy:functions -- --skip-install
```

4. **启动监控**
```bash
npm run monitor:functions
```

## 📊 监控指标

- **健康状态**: 健康/警告/异常
- **响应时间**: 平均执行耗时
- **错误率**: 失败请求占比
- **内存使用**: 资源消耗情况
- **调用频次**: 请求量统计

## 🔧 常用操作

### 部署新函数
1. 在 `cloudfunctions/` 目录下创建新函数文件夹
2. 编写 `index.js` 和 `config.json`
3. 运行部署脚本

### 更新现有函数
```bash
# 重新部署指定函数
npm run deploy:functions -- --functions functionName
```

### 查看运行状态
```bash
# 单次检查
npm run monitor:functions -- --once

# 或使用管理面板
npm run dashboard
```

## ⚠️ 注意事项

- 确保微信开发者工具已安装并登录
- 部署前请先在测试环境验证
- 监控脚本建议设置为系统服务自动运行
- 定期检查日志和告警信息

## 🆘 故障排除

### 部署失败
- 检查网络连接
- 验证微信开发者工具权限
- 确认环境ID配置正确

### 监控异常
- 检查环境变量设置
- 验证云函数调用权限
- 查看详细错误日志

更多详细信息请参考 [CLOUD_FUNCTIONS.md](./docs/CLOUD_FUNCTIONS.md)