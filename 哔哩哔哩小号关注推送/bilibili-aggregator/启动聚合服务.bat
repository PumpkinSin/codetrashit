@echo off
chcp 65001 >nul
title Bilibili 小号聚合服务
echo ================================
echo   Bilibili 小号视频聚合服务
echo   监听 http://127.0.0.1:8080
echo ================================
echo.
node "%~dp0server.js"
pause
