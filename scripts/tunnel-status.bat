@echo off
REM Cek status Cloudflare Tunnel KoncetCloud.
setlocal
set "CF=C:\Program Files (x86)\cloudflared\cloudflared.exe"

echo.
echo === Status tunnel KoncetCloud ===
"%CF%" service status
echo.
echo === Koneksi aktif ke cloudflared ===
netstat -ano | findstr ESTABLISHED | findstr /I cloudflared >nul
if errorlevel 1 (
  echo   (tidak ada koneksi aktif - service mungkin belum jalan)
) else
  echo   (ada koneksi ke Cloudflare)
)
echo.
pause