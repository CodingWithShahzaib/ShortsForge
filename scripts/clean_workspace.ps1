$ErrorActionPreference = "SilentlyContinue"

$paths = @(
  ".pytest_cache",
  ".venv",
  "frontend\\.next",
  "frontend\\node_modules",
  "backend\\__pycache__",
  "backend\\api\\__pycache__",
  "backend\\core\\__pycache__",
  "backend\\services\\__pycache__"
)

foreach ($p in $paths) {
  if (Test-Path $p) {
    Remove-Item $p -Recurse -Force
  }
}

Get-ChildItem -Path "backend" -Recurse -Force -Include "*.pyc","*.pyo" | Remove-Item -Force
