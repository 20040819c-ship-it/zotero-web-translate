@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "WT_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "WT_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
"%WT_NODE%" server.mjs
pause
