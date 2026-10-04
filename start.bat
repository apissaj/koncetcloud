@echo off
REM KoncetCloud: start rclone rcd + web server (visible console for debugging)
cd /d D:\omni-buddy

echo [1/2] Starting rclone rcd on 127.0.0.1:5572 ...
start "KoncetCloud rclone" cmd /c rclone rcd --rc-addr 127.0.0.1:5572 --rc-no-auth --rc-serve --log-file D:\omni-buddy\logs\rcd.log --log-level INFO

timeout /t 4 /nobreak >nul

echo [2/2] Starting KoncetCloud server on 127.0.0.1:5599 ...
cd /d D:\omni-buddy\server
start "KoncetCloud server" cmd /c node index.js

timeout /t 3 /nobreak >nul
echo.
echo Open: http://127.0.0.1:5599
start "" http://127.0.0.1:5599
