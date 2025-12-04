@echo off
echo 正在启动微信小程序后端 API 服务器...
echo.

REM 检查是否已安装依赖
if not exist "node_modules" (
    echo 正在安装依赖包...
    npm install
    echo.
)

echo 正在启动服务器...
echo 访问地址: http://localhost:3000
echo.
node server.js

pause