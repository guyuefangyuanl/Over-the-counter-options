@echo off
echo 正在检查 Node.js 环境...

node --version >nul 2>&1
if %errorlevel% == 0 (
    echo Node.js 已安装
    node --version
    npm --version
    echo.
    echo 正在安装项目依赖...
    npm install
    if %errorlevel% == 0 (
        echo.
        echo 依赖安装成功！
        echo.
        echo 请运行以下命令启动服务器：
        echo npm start
        echo.
        pause
    ) else (
        echo.
        echo 依赖安装失败，请检查网络连接后重试。
        pause
    )
) else (
    echo.
    echo 未检测到 Node.js 环境
    echo.
    echo 请按以下步骤操作：
    echo 1. 访问 https://nodejs.org/zh-cn/ 下载并安装 Node.js LTS 版本
    echo 2. 安装完成后重新运行此脚本
    echo.
    echo 按任意键打开 Node.js 官网...
    pause >nul
    start https://nodejs.org/zh-cn/
)