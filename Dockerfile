# --- 阶段 1: 构建 React 管理后台 ---
FROM node:18-slim AS frontend-builder
WORKDIR /app/admin-ui
COPY admin-ui/package*.json ./
RUN npm install
COPY admin-ui/ .
RUN npm run build

# --- 阶段 2: 构建 Python 后端 ---
FROM python:3.9-slim

# 设置工作目录
WORKDIR /app

# 设置环境变量
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
ENV FLASK_APP app.py
ENV FLASK_ENV production

# 安装系统依赖 (slim 镜像需要手动安装必要的编译工具)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libxml2-dev \
    libxslt1-dev \
    zlib1g-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 升级 pip 并配置国内镜像源
RUN pip install --no-cache-dir --upgrade pip -i https://mirrors.aliyun.com/pypi/simple/

# 复制依赖文件并安装
COPY requirements.txt .
RUN pip install --no-cache-dir --default-timeout=1000 -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/

# 从前端构建阶段复制打包好的文件
COPY --from=frontend-builder /app/admin-ui/dist ./admin-ui/dist

# 复制项目文件
COPY . .

# 暴露端口 (微信云托管默认监听 80 端口)
EXPOSE 80

# 启动命令
CMD ["gunicorn", "--bind", "0.0.0.0:80", "--workers", "2", "--threads", "4", "app:app"]
