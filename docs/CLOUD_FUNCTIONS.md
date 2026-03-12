# 云函数管理指南

## 📋 概述

本文档介绍了项目中所有云函数的功能、配置、部署方法和监控策略。

## 🚀 云函数列表

### 1. dataImporter (数据导入服务)
- **功能**: 处理Excel文件导入，解析股票期权数据
- **触发方式**: 
  - 手动调用
  - 定时触发 (`0 */5 * * * *`) - 每5分钟检查待处理任务
- **主要特性**:
  - 支持复杂矩阵格式解析
  - 自动去重和冲突处理
  - 并发写入优化
  - 文件大小限制(5MB)
- **关键配置**:
  ```javascript
  {
    "writeConcurrency": 10,
    "staticFieldsOnly": true,
    "allowedStaticFields": ["code", "name", "type", "term", "trader", "rates"]
  }
  ```

### 2. updateQuotes (行情更新服务)
- **功能**: 定时获取并更新股票实时行情
- **触发方式**: 
  - 交易时间更新 (`0 0/30 9-15 * * 1-5 *`) - 工作日每30分钟
  - 收盘更新 (`0 0 16 * * * *`) - 每天16:00
- **主要特性**:
  - 流式处理避免内存溢出
  - 指数退避重试机制
  - 性能指标收集
  - 分页批量处理
- **性能优化**:
  - 页面大小: 200条/页
  - 写并发: 50
  - 请求超时: 8秒

### 3. reportError (错误上报服务)
- **功能**: 收集客户端JavaScript错误并存储
- **触发方式**: 客户端主动调用
- **主要特性**:
  - 批量上报支持
  - 用户身份关联
  - 系统信息收集
  - 性能数据记录
- **安全措施**:
  - 数据脱敏处理
  - 频率限制
  - 输入验证

### 4. dataCleanup (数据清理服务)
- **功能**: 定期清理过期的历史数据
- **触发方式**: 
  - 每日清理 (`0 0 3 * * * *`) - 每天凌晨3点
- **清理策略**:
  - error_logs: 保留30天
  - import_jobs: 保留90天
- **执行方式**: 分批删除，每次20条

### 5. login (用户登录服务)
- **功能**: 处理用户微信登录认证
- **触发方式**: 客户端调用
- **集成**: 微信开放接口 `auth.getAccessToken`

### 6. submitInquiry (提交询价服务)
- **功能**: 处理客户询价请求
- **触发方式**: 客户端调用

### 7. handleInquiry (处理询价服务)
- **功能**: 商户端处理询价请求
- **触发方式**: 商户端调用

## 🛠️ 部署管理

### 自动化部署脚本

```bash
# 部署所有云函数
node scripts/deploy-cloudfunctions.js

# 部署指定函数
node scripts/deploy-cloudfunctions.js --functions dataImporter,updateQuotes

# 试运行模式
node scripts/deploy-cloudfunctions.js --dry-run

# 跳过依赖安装
node scripts/deploy-cloudfunctions.js --skip-install
```

### 部署前检查清单

- [ ] 代码审查完成
- [ ] 单元测试通过
- [ ] 依赖包版本锁定
- [ ] 环境变量配置正确
- [ ] 触发器配置验证
- [ ] 权限配置检查

## 🔍 监控告警

### 健康检查脚本

```bash
# 持续监控
node scripts/monitor-cloudfunctions.js

# 单次检查
node scripts/monitor-cloudfunctions.js --once

# 自定义检查间隔
node scripts/monitor-cloudfunctions.js --interval 300000
```

### 告警阈值

```javascript
const THRESHOLDS = {
  errorRate: 0.05,      // 错误率超过5%告警
  responseTime: 5000,   // 响应时间超过5秒告警
  timeoutRate: 0.1      // 超时率超过10%告警
};
```

### 监控指标

每个函数监控以下核心指标：
- 执行成功率
- 平均响应时间
- 内存使用率
- 错误率
- 调用频次

## 📊 管理面板

### 访问地址
`admin-web/cloud-functions-dashboard.html`

### 功能特性
- ✅ 实时状态监控
- ✅ 一键批量部署
- ✅ 性能指标展示
- ✅ 运行日志查看
- ✅ 手动测试功能
- ✅ 告警通知

## 🔧 故障排除

### 常见问题

#### 1. 部署失败
```bash
# 检查依赖安装
cd cloudfunctions/functionName
npm install

# 检查配置文件
cat config.json
```

#### 2. 内存不足
- 优化数据处理逻辑
- 增加分页处理
- 调整并发数配置

#### 3. 超时错误
- 增加超时时间配置
- 优化数据库查询
- 添加重试机制

#### 4. 权限问题
```bash
# 检查云开发权限配置
# 确保环境ID正确
# 验证API权限开通
```

### 调试技巧

1. **本地调试**
```javascript
// 在云函数中添加详细日志
console.log('Debug info:', { data, context });

// 使用try-catch包装关键代码
try {
  // 业务逻辑
} catch (error) {
  console.error('Detailed error:', error.stack);
  throw error;
}
```

2. **性能分析**
```javascript
const startTime = Date.now();
// 执行代码
const duration = Date.now() - startTime;
console.log(`Execution time: ${duration}ms`);
```

## 📈 最佳实践

### 代码规范
- 使用TypeScript类型检查
- 添加详细的JSDoc注释
- 遵循单一职责原则
- 实现错误处理和重试机制

### 性能优化
- 避免在循环中进行数据库操作
- 使用批量操作减少网络请求
- 合理设置超时和重试策略
- 监控内存使用情况

### 安全措施
- 验证所有输入参数
- 使用环境变量存储敏感信息
- 实施适当的访问控制
- 定期审查权限配置

## 🔄 版本管理

### 发布流程
1. 功能开发 → 2. 代码审查 → 3. 测试验证 → 4. 预发布 → 5. 正式上线

### 回滚策略
- 保留最近3个版本的部署记录
- 建立快速回滚机制
- 准备应急预案

## 📞 技术支持

遇到问题时，请提供以下信息：
- 云函数名称和版本
- 错误时间和详细信息
- 相关日志内容
- 操作步骤重现

---
*最后更新: 2026-03-12*