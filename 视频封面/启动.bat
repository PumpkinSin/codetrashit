@echo off
chcp 65001 >nul
title 视频封面制作工具

cd /d "%~dp0"

echo.
echo   ========================================
echo     视频封面制作工具 - 一键启动
echo   ========================================
echo.
echo   正在启动服务...
echo   启动后请访问: http://localhost:8000
echo   关闭此窗口即可停止服务
echo.

python main.py

pause
