# Flask期权数据服务

这是一个基于Flask的期权数据服务应用，提供期权数据查询和分析功能。

## 项目结构

```
flask_app/
├── app.py              # Flask应用主入口
├── config.py           # 配置管理
├── requirements.txt    # 项目依赖
├── .env               # 环境变量配置文件
└── README.md          # 项目说明文档
```

## 功能特性

1. **Flask应用框架** - 基于Flask的Web应用框架
2. **CORS支持** - 支持跨域资源共享
3. **配置管理** - 使用类和环境变量管理配置
4. **健康检查** - 提供应用健康状态检查端点
5. **错误处理** - 完善的错误处理机制

## 安装依赖

```bash
pip install -r requirements.txt
```

## 环境变量配置

在 `.env` 文件中配置以下环境变量：

```env
# Flask应用配置
FLASK_HOST=127.0.0.1
FLASK_PORT=5000
FLASK_DEBUG=True

# Flask密钥（生产环境必须更改）
SECRET_KEY=dev-secret-key-change-in-production

# MongoDB数据库配置
MONGO_URI=mongodb://localhost:27017/option_data
DEV_MONGO_URI=mongodb://localhost:27017/option_data_dev
PROD_MONGO_URI=mongodb://localhost:27017/option_data_prod
TEST_MONGO_URI=mongodb://localhost:27017/option_data_test

# 数据库名称
DATABASE_NAME=option_trading

# AkShare数据源配置
AKSHARE_DATA_SOURCE=default

# 日志配置
LOG_LEVEL=INFO
LOG_FILE=app.log

# 跨域配置
CORS_ORIGINS=*

# 应用配置
APP_NAME=期权数据服务
```

## 启动应用

```bash
python app.py
```

## API端点

- `GET /` - 健康检查
- `GET /health` - 健康检查
- `GET /api/version` - API版本信息

## 配置类

- `DevelopmentConfig` - 开发环境配置
- `ProductionConfig` - 生产环境配置
- `TestingConfig` - 测试环境配置

## 访问应用

启动应用后，可以通过以下URL访问：

- 应用地址: http://127.0.0.1:5000
- 健康检查: http://127.0.0.1:5000/health
- API版本: http://127.0.0.1:5000/api/version