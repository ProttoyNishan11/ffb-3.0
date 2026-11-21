@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 22 or newer is required. Install Node.js, then run this file again.
  pause
  exit /b 1
)

if not exist .env (
  if not exist .env.example (
    echo .env.example is missing.
    pause
    exit /b 1
  )
  copy .env.example .env >nul
  echo A new .env file has been created.
  echo Update ADMIN_PASSWORD and SESSION_SECRET before starting the game.
  start "" notepad.exe "%~dp0.env"
  echo Save the file, then double-click start-windows.bat again.
  pause
  exit /b 0
)

if not exist node_modules (
  echo Installing project dependencies...
  call npm install
  if errorlevel 1 goto :failed
)

call npm start
if errorlevel 1 goto :failed
goto :end

:failed
echo.
echo FFB could not start. Check the error above and try again.
pause

:end
endlocal
