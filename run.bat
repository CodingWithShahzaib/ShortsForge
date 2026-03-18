@echo off
echo ============================================
echo   ShortsForge - From script to reel in minutes.
echo ============================================
echo.
echo Starting Backend (port 8000)...
start "ShortsForge Backend" cmd /c "run_backend.bat"
timeout /t 5 /nocheck >nul
echo Starting Frontend (port 3000)...
start "ShortsForge Frontend" cmd /c "run_frontend.bat"
echo.
echo Backend: http://localhost:8000
echo Frontend: http://localhost:3000
echo API Docs: http://localhost:8000/docs
echo.
echo Press any key to exit...
pause >nul
