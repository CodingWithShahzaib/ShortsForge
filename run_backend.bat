@echo off
echo Starting ShortsForge Backend...
cd /d "%~dp0"
set "ROOT=%~dp0"
rem Uvicorn --reload uses spawn on Windows; child cwd may not be the repo root.
set "PYTHONPATH=%ROOT%"

set "VENV_PY=%ROOT%.venv\Scripts\python.exe"

if not exist "%VENV_PY%" (
    echo Creating virtual environment...
    python -m venv .venv
    if errorlevel 1 (
        echo Failed to create .venv. Is Python on PATH?
        pause
        exit /b 1
    )
)

rem Use "python -m pip" so a stale pip.exe launcher (wrong embedded path) is not used.
"%VENV_PY%" -m pip install -r backend\requirements.txt -q
if errorlevel 1 (
    echo pip install failed. If this venv was copied from another folder or PC, delete the .venv folder and run this script again.
    pause
    exit /b 1
)

"%VENV_PY%" -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
pause
