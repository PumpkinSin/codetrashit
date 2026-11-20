@echo off
copy /Y "F:\code\ScanBookStudio\rust_core\target\release\rust_core.dll" "F:\code\ScanBookStudio\build\windows\x64\runner\Release\rust_core.dll" >nul 2>&1
cd /d F:\code\ScanBookStudio\build\windows\x64\runner\Release
start "" "scanbook_studio.exe"
