@echo off
chcp 65001 >nul
echo ========================================
echo   RSS 动态服务 - 停止中...
echo ========================================
echo.

:: 查找占用端口 3457 的进程并终止
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3457" ^| findstr "LISTENING"') do (
    echo 找到进程 PID: %%a
    taskkill /F /PID %%a >nul 2>&1
    if not errorlevel 1 (
        echo 已停止进程 %%a
    ) else (
        echo 停止进程 %%a 失败，可能需要管理员权限
    )
)

:: 检查是否还有残留
netstat -aon | findstr ":3457" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
    echo.
    echo 服务已停止
) else (
    echo.
    echo 仍有进程占用端口 3457，请尝试以管理员身份运行
)

echo.
pause
