@echo off
cd /d "%~dp0"
python render.py film-render-manifest.json final-film.mp4
if errorlevel 1 (
  echo.
  echo Render failed. Check that Python and FFmpeg are installed and available in PATH.
  pause
  exit /b 1
)
echo.
echo Done: final-film.mp4
pause
