# Kredit dan lisensi

## Bahasa desain

Tata letak, gaya, dan sebagian komponen antarmuka KoncetCloud mengikuti
[OmniCloud](https://github.com/dimartarmizi/OmniCloud) oleh Dimar Tarmizi,
yang dirilis di bawah lisensi MIT.

Yang diadaptasi dari proyek tersebut:

- `web/src/components/TruncateMarquee.vue` (disalin, dengan penyesuaian kecil)
- Gaya visual: palet warna, bentuk pill, kartu membulat, dan pola grid daftar berkas
- Ikon penyedia cloud di `web/src/assets/*.svg` (Google Drive, OneDrive, Dropbox,
  MEGA, pCloud, S3, Yandex Disk, Cloudflare) dan logo aplikasi `logo.webp`
- Kelas utilitas scrollbar dan animasi spinner di `web/src/style.css`

## Lisensi MIT OmniCloud

```
MIT License

Copyright (c) 2026 Dimar Tarmizi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Perbedaan dari OmniCloud

KoncetCloud bukan turunan OmniCloud. Backend dan kontrak API-nya berbeda total:
OmniCloud adalah file manager multi-cloud dengan database dan akun pengguna,
sedangkan KoncetCloud adalah control plane tipis di atas rclone lokal tanpa
database dan tanpa menyimpan berkas.
