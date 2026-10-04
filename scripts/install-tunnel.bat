@echo off
REM KoncetCloud: pasang Cloudflare Tunnel (remote-managed) sebagai Windows service.
REM Token diambil dari scripts\tunnel.token (tempel sendiri, JANGAN bagikan).
setlocal

set "CF=C:\Program Files (x86)\cloudflared\cloudflared.exe"
set "TOKENFILE=%~dp0tunnel.token"

echo.
echo === Pasang Cloudflare Tunnel KoncetCloud ===
echo.

if not exist "%TOKENFILE%" (
  echo [ERROR] File token tidak ditemukan: %TOKENFILE%
  echo.
  echo Cara mendapatkan token:
  echo   1. Buka https://one.dash.cloudflare.com/ - Zero Trust
  echo   2. Networks ^> Tunnels ^> Create a tunnel (pilih Cloudflared)
  echo   3. Beri nama: koncetcloud
  echo   4. Copy token (mulai dengan "eyJ") lalu simpan file ini:
  echo        D:\omni-buddy\scripts\tunnel.token
  echo   5. Di step selanjutnya set Public Hostname:
  echo        kc.koncetcloud.web.id   -^>   http://localhost:5599
  echo.
  pause
  exit /b 1
)

if not exist "%CF%" (
  echo [ERROR] cloudflared tidak ditemukan di "%CF%"
  pause
  exit /b 1
)

REM Baca token (baris pertama, tanpa spasi di awal/akhir)
set /p TUNNEL_TOKEN=<"%TOKENFILE%"
if "%TUNNEL_TOKEN%"=="" (
  echo [ERROR] File token kosong.
  pause
  exit /b 1
)

echo [1/2] Memasang service Windows...
"%CF%" service install %TUNNEL_TOKEN%
if errorlevel 1 (
  echo.
  echo [ERROR] Gagal memasang service. Cek:
  echo   - token valid dan belum kedaluwarsa?
  echo   - Public Hostname sudah diset di dashboard Cloudflare?
  pause
  exit /b 1
)

echo.
echo [2/2] Selesai. Cek status:
"%CF%" service status
echo.
echo Buka: https://kc.koncetcloud.web.id
echo (hostname bisa berbeda kalau kamu memilih nama lain di dashboard)
echo.
pause