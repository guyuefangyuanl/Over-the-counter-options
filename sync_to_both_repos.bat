@echo off
echo 正在同步代码到GitHub和码云...

REM 首先推送到码云（通常国内访问更快）
echo 正在推送到码云...
git push origin junwei
if %errorlevel% neq 0 (
    echo 推送至码云失败！
    pause
    exit /b %errorlevel%
)
echo 推送至码云成功！

REM 然后推送到GitHub
echo 正在推送到GitHub...
git push github junwei
if %errorlevel% neq 0 (
    echo 推送至GitHub失败！
    echo 可能是网络问题，请稍后重试或使用VPN
    echo 您也可以单独运行: git push github junwei
    pause
    exit /b %errorlevel%
)
echo 推送至GitHub成功！

echo 代码已同步到两个平台！
pause