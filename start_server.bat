@echo off
chcp 65001 > nul
title 期权交易平台 - 服务启动器

echo.
echo ================================================================
echo           期权交易平台 - 服务启动器
echo ================================================================
echo.

:: 检查当前目录
echo 📁 当前目录: %cd%
echo.

:: 检查Python
echo 🔍 检查Python环境...
python --version > nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Python未安装或未添加到PATH
    echo 请安装Python: https://www.python.org/downloads/
    pause
    exit /b 1
)
echo ✅ Python已安装

:: 检查Node.js
echo 🔍 检查Node.js环境...
node --version > nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️ Node.js未安装，将使用Python临时服务器
    goto :start_python
) else (
    echo ✅ Node.js已安装
    goto :choose_server
)

:choose_server
echo.
echo 选择要启动的服务器：
echo [1] Node.js后端服务器 (推荐)
echo [2] Python临时静态服务器
echo [0] 退出
echo.
set /p choice="请输入选择 (1/2/0): "

if "%choice%"=="1" goto :start_nodejs
if "%choice%"=="2" goto :start_python
if "%choice%"=="0" exit /b 0
echo 无效选择，请重新输入
goto :choose_server

:start_nodejs
echo.
echo 🚀 启动Node.js后端服务器...
echo ================================================================
cd backend
if not exist node_modules (
    echo 📦 首次运行，安装依赖包...
    npm install
    if %errorlevel% neq 0 (
        echo ❌ 依赖包安装失败
        pause
        exit /b 1
    )
)
echo ✅ 依赖包已就绪
echo 🌐 启动服务器...
npm start
goto :end

:start_python
echo.
echo 🐍 启动Python临时静态服务器...
echo ================================================================
echo 📷 图片资源地址: http://localhost:3000/images/
echo ❤️ 健康检查: http://localhost:3000/health
echo 🛑 按 Ctrl+C 停止服务器
echo.
python simple_server.py
goto :end

:end
echo.
echo 服务器已停止
pause