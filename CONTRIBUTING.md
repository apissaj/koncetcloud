# Contributing to KoncetCloud

Terima kasih sudah meluangkan waktu untuk berkontribusi. Proyek ini sederhana
dengan sengaja: server tanpa dependensi runtime selain Express, dan frontend
Vue + Tailwind. Prinsip di bawah membantu menjaga kode tetap dapat dipahami.

## Aturan dasar

- **Server: minim dependensi.** `server/` hanya memakai Express dan modul
  bawaan Node (crypto, fs, path). Kalau kamu menambah dependensi, jelaskan
  di PR kenapa tidak bisa dihindari.
- **Bahasa:** komentar dan pesan antarmuka memakai Bahasa Indonesia.
- **Gaya:** 2 spasi, tanpa titik koma bila tidak perlu, string petik tunggal.
- **Keamanan kredensial:** jangan pernah menulis password, token, atau
  client secret ke log, stdout, audit, atau commit. Password pengguna
  disimpan sebagai scrypt; kredensial remote tinggal di konfigurasi rclone.

## Menyiapkan lingkungan

```bash
cd server && npm install
cd ../web && npm install
```

Jalankan test dan build:

```bash
cd server && node --check index.js && node --check auth.js && node --check platforms.js
cd ../web && npm run build
```

Tidak ada test suite otomatis yang menyentuh penyimpanan nyata. Kalau kamu
menambah logika murni (mis. perhitungan streak/kuota), pertimbangkan fungsi
ekspor + `node --test` ringan tanpa jaringan.

## Commit

- Pakai [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`.
- Satu commit satu tujuan.
- Jangan commit `server/auth.json`, `server/.password.txt`, `server/jobs.json`
  (data lokal), `web/dist/`, atau `node_modules/`.

## Melaporkan keamanan

Jangan buka issue publik untuk kerentanan atau kredensial yang bocor. Kirim
pesan privat ke pemelihara (lihat profil GitHub). Server ini dirancang untuk
dipakai sendiri di belakang HTTPS; jangan mengekspos port RC rclone ke publik.

## Checklist PR

- [ ] `node --check` lolos untuk file server yang diubah
- [ ] `npm run build` di `web/` lolos
- [ ] Tidak ada kredensial baru di kode atau log
- [ ] Perilaku viewer/admin tidak berubah tanpa disengaja