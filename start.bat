@echo off
cd /d "%~dp0backend"
chcp 65001 >nul

echo.
echo  ========================================
echo    🌙  声音克隆睡前故事智能体
echo  ========================================
echo.

REM 检查 .env
if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo  请先填写 API Key：
  notepad ".env"
  pause
  exit /b 1
)

echo  🚀 正在启动...
echo.
echo  📱 手机使用步骤：
echo     1. 确保手机和电脑连同一个 WiFi
echo     2. 手机浏览器打开下面地址：
echo.
echo  ═══════════════════════════════════════════
echo    http://192.168.133.2:5000
echo  ═══════════════════════════════════════════
echo.
echo  🖥️  电脑打开：http://localhost:5000
echo  🛑  关闭此窗口即可停止服务
echo.
echo.

"C:\Users\Admin\.workbuddy\binaries\python\envs\storytime\Scripts\python.exe" app.py

pause
