@echo off
echo ============================================
echo 启动后端服务测试
echo ============================================
echo.

set FLASK_PORT=5002
set NODE_ENV=development

echo 检测Python环境...
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo 尝试使用 py 命令...
    py --version
    if %errorlevel% equ 0 (
        echo.
        echo 正在启动 Flask 后端服务...
        py app.py
    ) else (
        echo ❌ 错误: 无法找到 Python 解释器
        echo 请确保 Python 已正确安装
        pause
        exit /b 1
    )
) else (
    python --version
    echo.
    echo 正在启动 Flask 后端服务...
    python app.py
)

pause
