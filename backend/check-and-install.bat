@echo off
title 微信小程序后端服务器环境检查

echo ========================================
echo 微信小程序后端服务器环境检查
echo ========================================
echo.

echo 正在检查 Node.js 环境...
node --version >nul 2>&1
if %errorlevel% == 0 (
    echo ✅ Node.js 已安装
    for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
    echo    版本: %NODE_VERSION%
) else (
    echo ❌ 未检测到 Node.js 环境
    echo.
    echo 请按以下步骤操作：
    echo 1. 访问 https://nodejs.org/zh-cn/ 下载并安装 Node.js LTS 版本
    echo 2. 安装完成后重新运行此脚本
    echo.
    echo 按任意键打开 Node.js 官网...
    pause >nul
    start https://nodejs.org/zh-cn/
    exit /b
)

echo.
echo 正在检查 npm 环境...
npm --version >nul 2>&1
if %errorlevel% == 0 (
    echo ✅ npm 已安装
    for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
    echo    版本: %NPM_VERSION%
) else (
    echo ❌ 未检测到 npm 环境
    echo.
    echo 请重新安装 Node.js，确保同时安装 npm
    echo.
    echo 按任意键打开 Node.js 官网...
    pause >nul
    start https://nodejs.org/zh-cn/
    exit /b
)

echo.
echo 正在检查项目依赖...
if exist "node_modules" (
    echo ✅ 项目依赖已安装
) else (
    echo ⚠️  项目依赖未安装，正在安装...
    echo.
    npm install
    if %errorlevel% == 0 (
        echo.
        echo ✅ 依赖安装成功！
    ) else (
        echo.
        echo ❌ 依赖安装失败，请检查网络连接后重试
        echo 可能的解决方案：
        echo 1. 检查网络连接
        echo 2. 配置 npm 镜像源：
        echo    npm config set registry https://registry.npmmirror.com
        echo 3. 重新运行此脚本
        pause
        exit /b
    )
)

echo.
echo ========================================
echo 环境检查完成！
echo ========================================
echo.
echo 启动服务器：
echo 方法1 - 开发模式（推荐）: npm run dev
echo 方法2 - 生产模式: npm start
echo.
echo 按任意键退出...
pause >nul