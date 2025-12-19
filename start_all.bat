@echo off
echo ========================================
echo 场外期权交易小程序 - 开发环境启动脚本
echo ========================================
echo.

echo 正在启动 Python 静态文件服务器 (端口 3000)...
start "Python Static Server" python simple_server.py

echo.
echo 正在检查 Node.js 环境...
node --version >nul 2>&1
if %errorlevel% == 0 (
    echo Node.js 环境正常
    echo.
    
    echo 检查后端依赖...
    if exist "backend\node_modules" (
        echo 后端依赖已安装
    ) else (
        echo 正在安装后端依赖...
        cd backend
        npm install
        cd ..
        echo 后端依赖安装完成
    )
    
    echo.
    echo 正在启动 Node.js 后端服务器 (端口 3001)...
    cd backend
    REM 修改端口为 3001 以避免冲突
    powershell -Command "(Get-Content server.js) -replace 'const PORT = 3000', 'const PORT = 3001' | Set-Content server.js"
    start "Node.js Backend Server" npm start
    cd ..
    
    echo.
    echo ========================================
    echo 服务器启动信息:
    echo - Python 静态服务器: http://localhost:3000
    echo - Node.js 后端服务器: http://localhost:3001
    echo ========================================
    echo.
    echo 前端小程序配置:
    echo 请确保 utils/api.js 中的 BASE_URL 设置为:
    echo const BASE_URL = 'http://localhost:3001/api';
    echo.
) else (
    echo.
    echo 未检测到 Node.js 环境，仅启动 Python 静态服务器
    echo.
    echo 如需启动 Node.js 后端服务器，请:
    echo 1. 访问 https://nodejs.org/zh-cn/ 安装 Node.js
    echo 2. 重新运行此脚本
    echo.
)

echo 按任意键关闭此窗口...
pause >nul