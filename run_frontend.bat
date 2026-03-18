@echo off
echo Starting ShortsForge Frontend...
cd /d "%~dp0\frontend"
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
)
npm run dev
pause
