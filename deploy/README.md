# 部署指南

本目录包含了项目上线部署所需的配置文件。

## 1. 准备服务器
推荐使用腾讯云或阿里云的云服务器（Ubuntu 20.04 LTS 或更高版本）。

## 2. 准备域名与 HTTPS
1. 购买域名并备案。
2. 将域名解析到服务器 IP。
3. 申请 SSL 证书（推荐使用 Certbot）。

## 3. 使用 Docker Compose 部署 (推荐)
1. 确保服务器安装了 Docker 和 Docker Compose。
2. 将项目上传到服务器。
3. 修改 `.env.production` 中的密钥和配置。
4. 运行：
   ```bash
   cd deploy
   docker-compose up -d
   ```

## 4. 手动部署 Nginx
1. 安装 Nginx: `sudo apt install nginx`
2. 复制配置文件:
   ```bash
   sudo cp deploy/nginx.conf /etc/nginx/sites-available/option-app
   sudo ln -s /etc/nginx/sites-available/option-app /etc/nginx/sites-enabled/
   ```
3. 测试并重启:
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

## 5. 构建前端
在部署前，请确保构建了 Admin UI：
```bash
cd admin-ui
npm install
npm run build
```
构建产物位于 `admin-ui/dist`。
