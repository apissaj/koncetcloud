@echo off
REM KoncetCloud: buka wizard rclone config untuk menambah remote baru.
REM Jalankan dari terminal. Wizard berjalan interaktif: password/kode 2FA
REM diketik langsung oleh pemilik akun, tidak pernah lewat chat.
setlocal
echo.
echo === Tambah remote KoncetCloud ===
echo.
echo Panduan singkat per layanan:
echo.
echo   MEGA (20 GB gratis)
echo     - Ketik: n  (new remote)
echo     - name   : mega
echo     - Storage: ketik "mega" lalu Enter
echo     - user   : alamat email akun MEGA Anda
echo     - pass   : "y" untuk mengetik password Anda sendiri (tidak ditampilkan)
echo     - 2FA    : kosongkan kalau akun tidak pakai 2FA
echo     - Lalu "n" (tidak perlu advanced config), "y" (simpan)
echo.
echo   pCloud (10 GB gratis)
echo     - name   : pcloud
echo     - Storage: ketik "pcloud" lalu Enter
echo     - Akan membuka browser untuk login. Kalau gagal, ketik "n" pada
echo       pertanyaan "Use auto config?" lalu ikuti tautan manual.
echo.
echo   OneDrive (5 GB gratis)
echo     - name   : onedrive
echo     - Storage: ketik "onedrive" lalu Enter
echo     - Pilih jenis akun: "onedrive" (personal)
echo     - Akan membuka browser untuk login.
echo.
echo Setelah selesai, jalankan status-remote.bat untuk memverifikasi.
echo.
pause
rclone config
echo.
echo === Remote yang terdaftar sekarang ===
rclone listremotes
echo.
echo Jalankan status-remote.bat untuk cek kapasitas tiap remote.
pause
