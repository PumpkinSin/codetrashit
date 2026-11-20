@echo off
title RSS Manager Desktop (Flutter UI)

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
cd /d "%ROOT_DIR%"

if exist "dist\RSSManager.exe" (
    start "" /D "%ROOT_DIR%\dist" "%ROOT_DIR%\dist\RSSManager.exe"
    exit /b 0
)

if exist "dist\rss_manager_ui.exe" (
    start "" /D "%ROOT_DIR%\dist" "%ROOT_DIR%\dist\rss_manager_ui.exe"
    exit /b 0
)

if exist "flutter_ui\build\windows\x64\runner\Release\rss_manager_ui.exe" (
    start "" /D "%ROOT_DIR%\flutter_ui\build\windows\x64\runner\Release" "%ROOT_DIR%\flutter_ui\build\windows\x64\runner\Release\rss_manager_ui.exe"
    exit /b 0
)

where flutter >nul 2>&1
if errorlevel 1 (
    echo.
    echo ============================================================
    echo [ERROR] No built application found in dist\ and 'flutter' command not found in PATH.
    echo ============================================================
    echo Please run build.bat first to compile the application.
    echo ============================================================
    echo.
    pause
    exit /b 1
)

cd /d "%ROOT_DIR%\flutter_ui"
echo Starting Flutter desktop in debug/run mode...
flutter run -d windows
pause
