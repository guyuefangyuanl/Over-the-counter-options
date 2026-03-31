# 使用 Python 3.9 slim 镜像
FROM python:3.9-slim

# 设置工作目录
WORKDIR /app

# 设置环境变量
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV FLASK_APP=app.py
ENV FLASK_ENV=production
ENV NODE_ENV=production
ENV VITE_PROXY_MODE=cloud

# 安装 Node.js 18 (用于前端构建)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 安装系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libxml2-dev \
    libxslt1-dev \
    zlib1g-dev \
    ca-certificates \
    && update-ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ===== 前端构建 =====
# 复制 admin-ui 源码 (利用构建缓存)
COPY admin-ui/package*.json ./admin-ui/
WORKDIR /app/admin-ui
RUN npm ci

# 复制 admin-ui 源码并构建
COPY admin-ui/ ./
RUN npm run build

# 返回主工作目录
WORKDIR /app

# ===== 后端部署 =====
# 复制依赖文件并安装
COPY option-trade-api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制后端代码
COPY option-trade-api/ .

# 删除开发环境配置文件
RUN rm -f .env .env.local

# 暴露端口
EXPOSE 80

# 启动命令
CMD ["gunicorn", "--bind", "0.0.0.0:80", "--workers", "1", "--threads", "4", "--timeout", "60", "app:app"]