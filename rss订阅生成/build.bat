@echo off
title Build RSS Engine (Rust + Flutter)

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
cd /d "%ROOT_DIR%"

if exist "F:\TEMP\rust\cargo\bin\cargo.exe" (
    set "RUSTUP_HOME=F:\TEMP\rust\rustup"
    set "CARGO_HOME=F:\TEMP\rust\cargo"
    set "PATH=F:\TEMP\rust\cargo\bin;%PATH%"
)
if exist "F:\TEMP\flutter\bin\flutter.bat" (
    set "PATH=F:\TEMP\flutter\bin;%PATH%"
)

echo ========================================
echo   Building RSS Engine (Rust)
echo ========================================

where cargo >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR] 'cargo' command not found.
    echo Please install Rust from https://rustup.rs and add cargo to PATH.
    pause
    exit /b 1
)

cd /d "%ROOT_DIR%\rust_engine"
echo Compiling Rust engine in release mode...
cargo build --release

if errorlevel 1 (
    echo [ERROR] Rust engine build failed.
    pause
    exit /b 1
)

echo [OK] Rust engine compiled successfully!
cd /d "%ROOT_DIR%"

if not exist "%ROOT_DIR%\dist" mkdir "%ROOT_DIR%\dist"
copy /y "%ROOT_DIR%\rust_engine\target\release\rss_engine.exe" "%ROOT_DIR%\dist\" >nul

echo.
echo ========================================
echo   Building Flutter Desktop GUI
echo ========================================

where flutter >nul 2>&1
if errorlevel 1 (
    echo [INFO] 'flutter' not found in PATH, skipping Flutter build.
    echo You can start the Rust engine now with start-engine.bat!
    pause
    exit /b 0
)

set "FLUTTER_BUILD_ERR=0"
subst R: "%ROOT_DIR%" >nul 2>&1
if exist "R:\flutter_ui" (
    cd /d "R:\flutter_ui"
    call flutter build windows --release
    if errorlevel 1 ( set "FLUTTER_BUILD_ERR=1" ) else ( set "FLUTTER_BUILD_ERR=0" )
    subst R: /D >nul 2>&1
    cd /d "%ROOT_DIR%"
) else (
    cd /d "%ROOT_DIR%\flutter_ui"
    call flutter build windows --release
    if errorlevel 1 ( set "FLUTTER_BUILD_ERR=1" ) else ( set "FLUTTER_BUILD_ERR=0" )
    cd /d "%ROOT_DIR%"
)

if "%FLUTTER_BUILD_ERR%"=="1" (
    echo [ERROR] Flutter build FAILED - dist was NOT updated, build caches kept.
    echo Check the error messages above.
    pause
    exit /b 1
)

echo [OK] Packaging all files into dist\ ...
xcopy /e /y /q "%ROOT_DIR%\flutter_ui\build\windows\x64\runner\Release\*" "%ROOT_DIR%\dist\" >nul
copy /y "%ROOT_DIR%\rust_engine\target\release\rss_engine.exe" "%ROOT_DIR%\dist\" >nul
copy /y "%ROOT_DIR%\dist\rss_manager_ui.exe" "%ROOT_DIR%\dist\RSSManager.exe" >nul
if exist "%ROOT_DIR%\.env" copy /y "%ROOT_DIR%\.env" "%ROOT_DIR%\dist\" >nul
if exist "%ROOT_DIR%\gui_config.json" copy /y "%ROOT_DIR%\gui_config.json" "%ROOT_DIR%\dist\" >nul

echo.
echo ========================================
echo   Cleaning Build Cache (Auto-cleanup)
echo ========================================
echo Cleaning rust_engine\target (saves ~1 GB)...
if exist "%ROOT_DIR%\rust_engine\target" (
    rd /s /q "%ROOT_DIR%\rust_engine\target" >nul 2>&1
)
echo Cleaning flutter_ui\build (saves ~300 MB)...
if exist "%ROOT_DIR%\flutter_ui\build" (
    rd /s /q "%ROOT_DIR%\flutter_ui\build" >nul 2>&1
)
echo [OK] All compilation caches cleaned up! Only dist\ is kept.
echo.
echo [SUCCESS] Complete application built and packaged into dist\ folder!
echo Output directory: %ROOT_DIR%\dist\

pause
