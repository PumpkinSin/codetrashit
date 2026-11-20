@echo off
chcp 65001 >nul
title RSS Manager

cd /d "%~dp0"

where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Please install Python 3 first.
    echo https://www.python.org
    pause
    exit /b 1
)

python -c "import cryptography" >nul 2>&1
if errorlevel 1 (
    echo Installing dependencies...
    pip install cryptography pystray pillow -q
)

python gui.py
