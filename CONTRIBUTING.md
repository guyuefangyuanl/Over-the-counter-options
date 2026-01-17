# 贡献指南（Commit/Branch/PR）

## 提交流程
- 工作流：`feature → develop → release → main`
- 提交频次：保持原子性与可读性，每次提交聚焦一个改动
- 提交信息：使用统一格式并关联 TAPD 条目

## 分支命名
- 功能：`feature/<简短英文或拼音>`
- 修复：`fix/<问题简述>`
- 预发布：`release/<版本号>`（如 `release/1.0.0`）
- 热修：`hotfix/<问题简述>`

## 提交信息规范
- 格式：`type(scope): subject [#TAPD-<ID>]`
- 类型：`feat`/`fix`/`refactor`/`docs`/`test`/`chore`
- 示例：`fix(login): 离线回退避免刷屏日志 #TAPD-102938`
- 建议在 PR 描述中列出变更摘要、影响范围与验证步骤

## 代码规范
- 避免在业务代码中写死环境差异（端口、域名、密钥），统一走环境变量
- 对外部输入（query/body/path）做格式校验并限制边界（分页上限、必填字段）
- 统一错误响应结构：`success`/`message`/`code`/`data`，不要在前端依赖未约定字段
- 日志不打印敏感信息（token、密码、完整连接串），仅输出必要上下文（方法、路径、状态码）
- 变更要保持向后兼容：新增配置提供默认值，旧配置仍可用

## Code Review 清单
- 接口不可用时是否有明确可行动的错误提示（例如后端未启动、端口错误）
- 后端 4xx/5xx 是否区分清晰，避免把参数错误变成 500
- 是否补充了单元测试并覆盖关键分支（成功、参数非法、后端不可达）
- 是否更新了相关配置默认值并确保本地启动路径可复现

## 自动化测试建议
- 前端：`admin-ui` 运行 `npm run lint`、`npm test`、`npm run build`
- 后端：运行 `python -m unittest`（包含 `tests/test_*.py`）

## 合并策略
- `feature → develop`：Squash 合并；由模块负责人 Review
- `release → main`：Merge 并创建 Tag；更新 `CHANGELOG.md` 与 Gitee Releases
- `hotfix → main`：Merge 并打补丁版本；回灌 `develop`

## 仓库权限与分支保护（建议）
- 成员必须使用个人码云账号加入仓库，禁止共享同一账号
- `main`/`develop` 设置为保护分支：禁止直接 push，只允许通过 PR 合并
- `main`/`develop` 合并前要求至少 1-2 人 Review（按公司制度调整）
- 启用“禁止强制推送/禁止删除分支”
- 启用 CI（如 `.github/workflows/ci.yml`）作为合并前置条件：lint/build 通过才允许合并
- 统一使用 SSH Key 或个人 Access Token（最小权限），禁止在仓库中提交任何密钥

## 账号与密钥管理（约束）
- 本地环境变量放在 `.env.local`（已被 `.gitignore` 忽略），只提交 `.env.example`
- 禁止提交：`.env*`、私钥、日志、数据库文件、`temp_uploads/`、以及 Office 临时文件（`~$*`）
- 账号密码禁止明文写入代码与文档；生产环境使用公司统一的密钥管理/凭证下发流程

## 发布与版本
- 版本号规则：`vMAJOR.MINOR.PATCH`（语义化版本）
- 标签：`v1.0.0`、`v1.0.1`
- 发布说明：在 Releases 记录新增/修复/破坏性改动与 TAPD 链接

## TAPD 协作
- 任务/缺陷：在 TAPD 建立迭代并分派任务；测试用例执行后关联缺陷
- 在提交与 PR 中附带 `#TAPD-<ID>`，便于自动关联与追踪
