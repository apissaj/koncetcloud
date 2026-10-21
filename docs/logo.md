# Logo KoncetCloud — "Vault K"

## Nama mark

**Vault K**. Sebuah kotak rounded yang menjadi wadah/brankas penyimpanan, dengan
huruf **K** sebagai lubang sungguhan — bukan huruf yang digambar dengan warna
berbeda, melainkan ruang kosong yang menembus mark (`fill-rule="evenodd"`).

## Makna

- **Kotak rounded** = wadah/brankas penyimpanan tempat berkas disimpan.
- **K** = KoncetCloud, dengan lengan diagonal yang menjadi ciri hurufnya.

Karena K adalah lubang, mark hanya butuh **satu warna** dan otomatis mengikuti
warna latar (terang/gelap) — lubangnya tembus ke latar di belakangnya.

## Aturan pakai

- Ukuran minimum **24px** di UI.
- **16px** untuk favicon (varian reversed, lihat di bawah).
- Beri ruang kosong minimal **6% dari sisi** mark agar tidak terasa sesak.

## Varian

- **Master ink** — satu warna ink, untuk UI dan materi cetak. Mark ikut
  `currentColor`, jadi otomatis menyesuaikan tema terang/gelap.
- **Favicon reversed** — K di-knockout putih di atas tile tinta, dipakai di
  konteks yang butuh kontras tinggi (favicon, ikon kecil).

## Warna

Monokrom. Gunakan `currentColor` atau tinta (hitam/putih). **JANGAN** memberi
warna biru pada mark.

## Larangan

- Jangan meregangkan atau mengubah rasio mark.
- Jangan menambah warna (mark harus tetap monokrom).
- Jangan memutar mark.

## Mark master

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="KoncetCloud">
  <title>KoncetCloud</title>
  <path id="symbol" fill="#000000" fill-rule="evenodd" d="M76 16 H180 A60 60 0 0 1 240 76 V180 A60 60 0 0 1 180 240 H76 A60 60 0 0 1 16 180 V76 A60 60 0 0 1 76 16 Z M78 76 H106 V110 L140 76 H176 L124 128 L176 180 H140 L106 146 V180 H78 Z"/>
</svg>
```
