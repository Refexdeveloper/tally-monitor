@echo off
rem Runs the agent in this console (Ctrl+C to stop). Use scripts\install-service.ps1 for a permanent install.
cd /d "%~dp0"
node src\index.js
