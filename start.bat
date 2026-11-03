@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if not errorlevel 1 (
  py -3 server.py
  goto :done
)

where python >nul 2>nul
if not errorlevel 1 (
  python server.py
  goto :done
)

echo.
echo MyoMap needs Python 3 to serve the local 3D files.
echo Install Python from https://www.python.org/downloads/ and run this file again.
echo.
pause

:done
endlocal
