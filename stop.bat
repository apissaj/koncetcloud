@echo off
REM KoncetCloud: stop both services by killing whatever listens on their ports
echo Stopping KoncetCloud ...

for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5599" ^| findstr "LISTENING"') do (
  echo   killing server pid %%p
  taskkill /PID %%p /F >nul 2>&1
)

for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5572" ^| findstr "LISTENING"') do (
  echo   killing rclone pid %%p
  taskkill /PID %%p /F >nul 2>&1
)

echo Done.
