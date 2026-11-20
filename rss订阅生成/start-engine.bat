@echo off
title RSS Engine (Rust)

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
cd /d "%ROOT_DIR%"

if exist "dist\rss_engine.exe" (
    echo Starting dist\rss_engine.exe...
    cd /d "%ROOT_DIR%\dist"
    rss_engine.exe
    pause
    exit /b 0
)

if exist "rss_engine.exe" (
    echo Starting rss_engine.exe...
    rss_engine.exe
    pause
    exit /b 0
)

if exist "rust_engine\target\release\rss_engine.exe" (
    echo Starting rust_engine\target\release\rss_engine.exe...
    rust_engine\target\release\rss_engine.exe
    pause
    exit /b 0
)

where cargo >nul 2>&1
if errorlevel 1 (
    echo.
    echo ============================================================
    echo [ERROR] 'cargo' command not found in PATH and no prebuilt rss_engine.exe.
    echo ============================================================
    echo Please install Rust or run build.bat to compile.
    echo ============================================================
    echo.
    pause
    exit /b 1
)

cd /d "%ROOT_DIR%\rust_engine"
echo Running Rust engine via cargo run --release...
cargo run --release
pause
