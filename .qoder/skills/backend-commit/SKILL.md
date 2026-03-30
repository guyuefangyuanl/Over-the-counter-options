---
name: backend-commit
description: 自动提交后端代码到码云（Gitee）仓库的 main 分支。当创建或修改后端相关代码（API接口、云函数、数据库操作、服务端逻辑等）完成后，自动执行 git 提交并推送到码云 origin 远程仓库的 main 分支。使用此技能确保后端代码变更及时同步到远程仓库。
---

# 后端代码自动提交

## 触发条件

此技能适用于以下后端代码相关操作：

- **云函数代码**：`cloudfunctions/` 目录下的函数代码
- **API 接口**：后端 API 路由、控制器、服务层代码
- **数据库操作**：数据库模型、迁移脚本、查询逻辑
- **服务端逻辑**：中间件、认证、业务逻辑处理
- **配置文件**：后端相关的配置文件（如 `cloudbaserc.json`）

## 执行流程

完成后端代码修改后，按以下步骤自动提交：

### 1. 检查变更状态

```bash
git status
git diff --stat
```

确认修改的文件范围，仅提交后端相关文件。

### 2. 添加变更文件

仅添加后端相关文件，避免提交不相关的前端文件：

```bash
# 示例：添加云函数目录
git add cloudfunctions/

# 或添加特定后端文件
git add path/to/backend/file
```

### 3. 创建提交

使用规范的提交信息格式：

```
<type>(<scope>): <description>

<body>

🤖 Generated with [Qoder](https://qoder.com)
```

**提交类型**：
- `feat`: 新功能
- `fix`: Bug 修复
- `refactor`: 重构
- `docs`: 文档更新
- `chore`: 配置/构建相关

**提交示例**：
```
feat(api): add user authentication endpoint

Implement JWT-based authentication with token validation

🤖 Generated with [Qoder](https://qoder.com)
```

### 4. 推送到码云 main 分支

推送到 `origin`（码云）远程仓库的 `main` 分支：

```bash
# 确保在 main 分支上
git checkout main

# 拉取最新代码（可选，避免冲突）
git pull origin main

# 推送到码云 main 分支
git push origin main
```

**重要**：始终推送到 main 分支，确保后端代码及时同步到码云仓库。

## 注意事项

1. **仅提交后端文件**：不要混入前端代码或原型文件
2. **检查提交内容**：确认不包含敏感信息（密钥、密码等）
3. **冲突处理**：如有推送冲突，通知用户手动解决
4. **分支确认**：推送前确认当前分支是否正确

## 代码检查

提交前执行以下检查（如配置了相关命令）：

```bash
# TypeScript 类型检查（如有）
npm run typecheck

# 代码风格检查（如有）
npm run lint
```

## 完整流程示例

```bash
# 1. 查看状态
git status

# 2. 添加后端文件
git add cloudfunctions/auth/index.js

# 3. 提交变更
git commit -m "feat(auth): implement login validation logic"

# 4. 切换到 main 分支并推送
git checkout main
git push origin main
```

## 排除范围

以下情况**不触发**此技能：

- 纯前端代码修改（小程序页面、组件）
- 原型 HTML 文件修改
- 文档和 README 文件
- 用户明确要求不提交的情况