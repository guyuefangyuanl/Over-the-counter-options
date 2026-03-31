# 云托管部署验证脚本
# 用法: .\scripts\verify-cloud-deployment.ps1 -ServiceUrl "https://flask-xxx.sh.run.tcloudbase.com"

param(
    [Parameter(Mandatory=$true)]
    [string]$ServiceUrl
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "云托管部署验证脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 移除尾部斜杠
$ServiceUrl = $ServiceUrl.TrimEnd('/')

# 验证检查列表
$checks = @(
    @{
        Name = "API健康检查"
        Url = "$ServiceUrl/api/v1/health"
        Expected = "healthy"
    },
    @{
        Name = "前端首页"
        Url = "$ServiceUrl/"
        Expected = "index.html"
    },
    @{
        Name = "登录页面"
        Url = "$ServiceUrl/login"
        Expected = "login"
    },
    @{
        Name = "静态资源"
        Url = "$ServiceUrl/assets/index.js"
        Expected = "JavaScript"
    }
)

$results = @()
$allPassed = $true

foreach ($check in $checks) {
    Write-Host "检查: $($check.Name)" -ForegroundColor Yellow
    Write-Host "  URL: $($check.Url)"
    
    try {
        $response = Invoke-WebRequest -Uri $check.Url -Method GET -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
        
        $status = "PASS"
        $statusCode = $response.StatusCode
        $contentPreview = $response.Content.Substring(0, [Math]::Min(200, $response.Content.Length))
        
        Write-Host "  状态码: $statusCode" -ForegroundColor Green
        Write-Host "  内容预览: $contentPreview..." -ForegroundColor Gray
        Write-Host "  结果: PASS" -ForegroundColor Green
    }
    catch {
        $status = "FAIL"
        $statusCode = $_.Exception.Response.StatusCode.value__
        $errorDetail = $_.Exception.Message
        
        Write-Host "  状态码: $statusCode" -ForegroundColor Red
        Write-Host "  错误: $errorDetail" -ForegroundColor Red
        Write-Host "  结果: FAIL" -ForegroundColor Red
        
        $allPassed = $false
    }
    
    $results += @{
        Check = $check.Name
        Url = $check.Url
        Status = $status
        StatusCode = $statusCode
    }
    
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "验证结果汇总" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

foreach ($r in $results) {
    $color = if ($r.Status -eq "PASS") { "Green" } else { "Red" }
    Write-Host "[$($r.Status)] $($r.Check) - HTTP $($r.StatusCode)" -ForegroundColor $color
}

Write-Host ""

if ($allPassed) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "所有检查通过！部署验证成功。" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "下一步操作:" -ForegroundColor Cyan
    Write-Host "1. 访问管理后台: $ServiceUrl/login" -ForegroundColor White
    Write-Host "2. 使用管理员账号登录: admin / Admin@2026#Secure" -ForegroundColor White
    Write-Host "3. 小程序API已配置为同一域名" -ForegroundColor White
}
else {
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "部分检查失败，请检查服务配置。" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "常见问题排查:" -ForegroundColor Yellow
    Write-Host "1. 检查服务是否正常启动" -ForegroundColor White
    Write-Host "2. 检查端口配置是否为80" -ForegroundColor White
    Write-Host "3. 检查Dockerfile构建是否成功" -ForegroundColor White
    Write-Host "4. 检查admin-ui/dist是否包含在部署中" -ForegroundColor White
}

Write-Host ""