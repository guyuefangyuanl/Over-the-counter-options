# 上线检查清单与操作手册

## 1. 灰度发布策略 (Gray Release)

- [ ] **白名单配置**: 确认 `routes/auth.py` 中仅允许特定 UserID 或 IP 访问交易接口。
- [ ] **流量切分**: 在 Nginx 配置 `split_clients`，将 5% 流量导入新版本（如使用多套环境）。
- [ ] **数据备份**: 上线前执行 MongoDB 全量备份: `mongodump --out /backup/pre_launch`.

## 2. 回滚方案 (Rollback)

- [ ] **代码回滚**: `git revert HEAD` 或部署上一版本 Docker 镜像。
- [ ] **数据库回滚**: 如涉及 Schema 变更不可逆，使用备份恢复。
- [ ] **开关控制**: 启用 `.env` 中的 `MAINTENANCE_MODE=true` 暂停服务。

## 3. 监控告警配置 (Monitoring)

- [ ] **接口监控**: 配置 UptimeRobot 或 Prometheus Blackbox Exporter 探测 `/api/v1/health`。
- [ ] **错误日志**: 确保 Sentry 或 ELK 收集 `ERROR` 级别日志。
- [ ] **性能指标**: 关注 API 响应时间 P95 线，若超过 500ms 触发告警。

## 4. 用户操作手册 (User Manual)

### 4.1 交易员操作
1.  **询价**: 进入“询价”页面，选择标的，填写期限和方向。
2.  **下单**: 收到报价后，点击“确认下单”，系统冻结资金。
3.  **行权**: 到期日系统自动结算，资金T+1到账。

### 4.2 管理员操作
1.  **每日结算**: 每日 15:30 后，访问 `/api/v1/trade/settlement/daily` 触发结算（或等待自动任务）。
2.  **风控监控**: 访问后台“风控大盘”，查看当前 Delta 敞口。
3.  **用户管理**: 审核新用户实名认证信息。

## 5. 常见问题 (FAQ)

*   **Q: 充值未到账？**
    *   A: 请检查“资金流水”页面，如无记录请联系客服提供支付凭证。
*   **Q: 期权价格计算依据？**
    *   A: 采用 Black-Scholes 模型，波动率参考历史 30 日波动率。
