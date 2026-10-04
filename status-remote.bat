@echo off
REM KoncetCloud: cek status + kapasitas semua remote rclone.
setlocal enabledelayedexpansion
echo.
echo === Remote terdaftar ===
rclone listremotes
echo.
echo === Kapasitas per remote ===
for /f "delims=" %%r in ('rclone listremotes') do (
  echo.
  echo --- %%r ---
  rclone about %%r 2>&1
)
echo.
echo === Selesai. Remote yang error berarti login/perizinan perlu diulang. ===
pause
