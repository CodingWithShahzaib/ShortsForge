@echo off
echo Starting ShortsForge Backend...
cd /d "%~dp0"
if not exist ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
)
call .venv\Scripts\activate
pip install -r backend\requirements.txt -q
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
pause
