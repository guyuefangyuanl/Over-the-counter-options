# 后端代码自动部署 Skill

## 触发条件

当用户修改以下目录的代码后，主动询问是否需要提交并推送到码云：
- `cloudfunctions/flask-backend/` - Flask 后端代码
- `backend_utils/` - 后端工具模块
- `services/` - 后端服务层

## 使用方式

用户可以通过以下方式触发：
1. 直接说 "部署后端" 或 "push后端"
2. 修改后端代码后，我会主动询问是否需要部署
3. 说 "/deploy-backend" 触发

## 执行流程

### 步骤 1: 检查变更

```bash
# 检查后端相关文件是否有变更
git status --short cloudfunctions/flask-backend/ backend_utils/ services/
```

### 步骤 2: 暂存变更

```bash
# 添加所有后端相关变更
git add cloudfunctions/flask-backend/ backend_utils/ services/
```

### 步骤 3: 生成提交信息

根据变更内容自动生成语义化的提交信息，格式：
```
type(scope): description

- 具体变更1
- 具体变更2

🤖 Generated with [Qoder](https://qoder.com)
```

提交类型：
- `feat(backend)`: 新功能
- `fix(backend)`: Bug 修复
- `refactor(backend)`: 代码重构
- `docs(backend)`: 文档更新
- `chore(backend)`: 构建/配置变更

### 步骤 4: 提交并推送

```bash
# 提交变更
git commit -m "<commit message>"

# 推送到码云（origin）
git push origin <current-branch>
```

### 步骤 5: 部署提示

推送成功后，提醒用户：
> 代码已推送到码云。如需部署到云托管，请：
> 1. 在云开发控制台手动触发部署
> 2. 或使用 CLI: `tcb fn deploy --name flask-backend`

## 错误处理

1. **没有变更**: 提示 "没有检测到后端代码变更"
2. **推送失败**: 显示错误信息，提供手动命令
3. **分支问题**: 检查当前分支，必要时询问是否创建新分支

## 配置选项

可在 `.qoder/settings.local.json` 中配置：

```json
{
  "deployBackend": {
    "autoPush": false,        // 是否自动推送（默认需确认）
    "targetRemote": "origin", // 目标远程仓库
    "includePaths": [         // 包含的路径
      "cloudfunctions/flask-backend/",
      "backend_utils/",
      "services/"
    ]
  }
}
```

## 示例对话

**用户**: 修复了 API 报错，帮我部署

**助手**: 
检测到以下后端变更：
- `cloudfunctions/flask-backend/backend_utils/response.py` (新增)
- `cloudfunctions/flask-backend/backend_utils/__init__.py` (新增)

是否提交并推送到码云？确认后将执行：
1. git add 暂存变更
2. git commit 提交
3. git push origin main

**用户**: 确认

**助手**:
✅ 已成功推送到码云！

提交: `fix(backend): 添加 backend_utils 模块解决导入错误`

如需部署到云托管，请在云开发控制台触发部署。

---

## 注意事项

1. 推送前会检查是否有冲突
2. 敏感文件（.env、密钥等）会被排除
3. 支持撤销最近一次推送（需在推送后立即执行）