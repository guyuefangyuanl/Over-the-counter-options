# 项目协作与版本管理规范

## 代码托管（Gitee/码云）
- 远程仓库：使用 Gitee 作为唯一远程仓库
- 本地关联：建议配置 SSH Key；初次推送后，统一以 `origin` 为默认远程
- 推送约束：禁止直接推送到 `main`，通过分支合并与 PR 控制

## 分支策略（简化 GitFlow）
- `main`：稳定发布分支，仅合入正式版本
- `develop`：日常开发集成分支
- `feature/<name>`：功能分支，来源 `develop`，完成后合并回 `develop`
- `release/<version>`：预发布分支，来源 `develop`，回归后合并回 `main` 与 `develop`
- `hotfix/<issue>`：紧急修复，来源 `main`，合并回 `main` 与 `develop`

## 版本与标签（SemVer）
- 版本号：`vMAJOR.MINOR.PATCH`（如 `v1.0.0`）
- 发布：`release/<version>` 合并入 `main` 后创建 Tag，并在 Gitee Releases 撰写变更说明

## 提交与消息格式
- 约定格式：`type(scope): subject [#TAPD-<ID>]`
- 常用类型：`feat`/`fix`/`refactor`/`docs`/`test`/`chore`
- 示例：`feat(profile): 简约化个人页样式 #TAPD-123456`

## TAPD 测试与缺陷
- 迭代与需求：在 TAPD 建立迭代，关联需求与任务
- 测试管理：维护用例（冒烟/回归/功能/边界），执行记录与缺陷闭环
- 缺陷：统一模板（环境/复现步骤/日志截图/期望/影响/优先级），在提交中附带 `#TAPD-ID`

## 合并与发布流程
- `feature → develop`：优先 Squash 合并，保证主线清晰
- `release → main`：合并并打 Tag，在 Releases 填写变更日志
- `hotfix → main`：合并并打补丁版本，回灌 `develop`

## TortoiseGit 使用建议（Windows）
- 分支：右键 → TortoiseGit → Create Branch… / Switch…
- 拉取/推送：右键 → Git Pull… / Git Push…（发布时勾选 Push tags）
- 冲突：右键 → Git Sync… → Merge，使用 TortoiseGit Merge 工具解决

## 目录与忽略
- 在仓库根维护 `.gitignore`，忽略构建产物、IDE 配置、临时文件与日志
- 变更说明统一在 Releases 与 `CHANGELOG.md` 维护
