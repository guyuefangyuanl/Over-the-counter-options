# 生产环境部署检查清单

## 1. 环境变量配置 (.env)

请确保在服务器创建 `.env` 文件，并设置以下关键变量：

- **安全密钥 (必须修改)**:
  - `JWT_SECRET`: 用于签发 Token，必须是长随机字符串。可以使用 `openssl rand -hex 32` 生成。
  - `ADMIN_PASSWORD`: 如果使用默认 Admin 账号，请修改密码。

- **微信配置**:
  - `WX_APPID`: 小程序 AppID
  - `WX_SECRET`: 小程序 Secret
  - `WX_CLOUD_ENV`: 云开发环境 ID

- **数据库**:
  - 确保 MongoDB 服务已启动，或配置了正确的云开发环境。

## 2. 依赖安装

```bash
pip install -r requirements.txt
pip install gunicorn
```

## 3. 启动服务 (Gunicorn)

建议使用 Gunicorn 作为生产服务器：

```bash
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

## 4. 前端构建

### Admin UI
1. 进入 `admin-ui` 目录。
2. 创建 `.env.production`:
   ```
   VITE_API_BASE_URL=https://your-api-domain.com/api/v1
   ```
3. 构建: `npm run build`
4. 将 `dist` 目录部署到 Nginx。

### 小程序
1. 在微信开发者工具中，修改 `utils/request.js` 中的 `BASE_URL` 为生产服务器地址。
2. 上传审核。

## 5. Nginx 配置示例

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        root /path/to/admin-ui/dist;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```
