@echo off
title TensorRender - Neural Rendering Studio
echo =======================================================
echo   TensorRender - Neural Super-Resolution Studio
echo =======================================================
echo.
echo Starting Web Server on http://localhost:8000 ...
echo.

start "" "http://localhost:8000"
python -m backend.app

pause
