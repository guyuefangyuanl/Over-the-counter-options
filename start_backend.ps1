Write-Host "============================================" -ForegroundColor Cyan
Write-Host "启动 Flask 后端服务" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# 设置环境变量
$env:FLASK_PORT = "5002"
$env:NODE_ENV = "development"

# 检测Python
Write-Host "检测Python环境..." -ForegroundColor Yellow

$pythonCmd = $null

# 尝试 python 命令
try {
    $version = python --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ 找到 Python: $version" -ForegroundColor Green
        $pythonCmd = "python"
    }
} catch {
    Write-Host "python 命令不可用" -ForegroundColor Yellow
}

# 如果 python 不可用，尝试 py 命令
if (-not $pythonCmd) {
    try {
        $version = py --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ 找到 Python: $version" -ForegroundColor Green
            $pythonCmd = "py"
        }
    } catch {
        Write-Host "py 命令不可用" -ForegroundColor Yellow
    }
}

# 如果都找不到
if (-not $pythonCmd) {
    Write-Host ""
    Write-Host "❌ 错误: 无法找到 Python 解释器" -ForegroundColor Red
    Write-Host "请确保 Python 已正确安装并添加到 PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "按任意键退出..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Write-Host ""
Write-Host "正在启动 Flask 后端服务 (端口 5002)..." -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# 启动服务
& $pythonCmd app.py

Write-Host ""
Write-Host "服务已停止" -ForegroundColor Yellow
Write-Host "按任意键退出..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
