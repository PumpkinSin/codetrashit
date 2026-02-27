@echo off
chcp 65001 >nul
title RSS 动态服务

echo ========================================
echo   RSS 动态服务 - 启动中...
echo ========================================

cd /d "%~dp0server"

:: 检查 node_modules
if not exist node_modules (
    echo.
    echo 首次运行，正在安装依赖...
    call npm install
    echo.
)

:: 检查 .env
if not exist .env (
    echo.
    echo ⚠ 未找到 .env 文件！
    echo   已复制 .env.example 为 .env
    echo   请编辑 .env 填写你的 R2 配置后重新启动
    copy .env.example .env >nul
    echo.
    pause
    exit /b
)

echo.
echo 启动 Node.js 服务...
echo 按 Ctrl+C 停止
echo.

node server.js

pause
