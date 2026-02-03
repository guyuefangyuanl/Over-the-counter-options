# 微信云托管一键部署指南

本项目已完全适配微信云托管（WeChat Cloud Run），这是最省心、低成本的部署方式。

## 🚀 为什么选择云托管？
- **免运维**：无需购买和维护服务器。
- **免配置**：无需手动安装 Nginx、Python、SSL 证书。
- **自动扩缩容**：根据流量自动调整实例数量，闲时可缩容至 0（省钱）。
- **天然 HTTPS**：默认提供 HTTPS 域名。

## 📋 部署步骤

### 方式一：通过微信开发者工具（推荐）

1. 打开微信开发者工具，进入项目。
2. 点击工具栏上的 **"云开发"** 按钮。
3. 在云开发控制台，选择 **"云托管"**（如果没有开通请先开通）。
4. 点击 **"服务列表"** -> **"新建服务"**：
   - 服务名称：`flask-api` (或自定义)
   - 允许公网访问：开启
5. 进入服务详情，点击 **"版本管理"** -> **"新建版本"**。
6. 选择 **"代码库拉取"**（推荐）或 **"本地代码上传"**：
   - 如果选择代码库：授权 GitHub/Gitee/GitLab，选择本项目仓库。
   - 勾选 **"使用 Dockerfile 构建"**。
   - Dockerfile 路径：`Dockerfile` (默认即可)。
   - 构建目录：`.` (默认即可)。
7. 点击 **"确定"** 开始构建和部署。
8. 等待部署成功（约 3-5 分钟）。

### 方式二：通过腾讯云控制台

1. 登录 [微信云托管控制台](https://cloud.weixin.qq.com/cloudrun)。
2. 选择你的环境。
3. 新建服务并关联代码仓库。
4. 环境变量配置（在服务设置中）：
   - `NODE_ENV`: `production`
   - `FLASK_ENV`: `production`
   - `WX_APPID`: 你的小程序 AppID
   - `WX_SECRET`: 你的小程序 Secret
   - `WX_CLOUD_ENV`: 你的云环境 ID
   - `SECRET_KEY`: (生成一个随机长字符串)
   - `JWT_SECRET`: (生成一个随机长字符串)

## 🔍 验证部署

部署成功后，在服务详情页可以看到 **"公网访问地址"**（例如 `https://flask-xxx.run.tcloudbase.com`）。

1. **访问管理后台**：
   直接在浏览器访问公网地址：`https://flask-xxx.run.tcloudbase.com`
   你应该能看到登录页面。

2. **访问 API**：
   访问 `https://flask-xxx.run.tcloudbase.com/api/v1/health`
   应返回 `{"status": "healthy", ...}`。

## ⚙️ 小程序端配置

部署完成后，需要告诉小程序使用云托管的地址。

1. 打开 `miniprogram/config/api.config.js`。
2. 修改 `PROD_CONFIG` 中的 `apiBaseUrl` 为你的云托管公网地址。
   ```javascript
   const PROD_CONFIG = {
     apiBaseUrl: 'https://你的云托管域名.run.tcloudbase.com/api/v1'
   };
   ```
3. 重新上传小程序代码。

## ⚠️ 注意事项

1. **数据库**：
   云托管服务默认可以访问同环境下的云数据库（MongoDB）。无需修改连接字符串，代码中已通过 `CloudDbClient` 适配。
   *如果需要使用原生 MongoDB 连接，请确保云数据库开启了外网访问或 VPC 访问。*

2. **冷启动**：
   如果实例缩容到 0，下次访问时会有几秒钟的启动延迟，这是正常现象。可以在服务设置中将"最小实例数"设置为 1 来避免（会增加少量成本）。
