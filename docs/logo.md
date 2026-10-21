# Logo KoncetCloud — "Vault K"

## Nama mark

**Vault K**. Kotak rounded yang menjadi wadah/brankas penyimpanan, dengan huruf
**K** sebagai lubang sungguhan — bukan huruf yang digambar dengan warna berbeda,
melainkan ruang kosong yang menembus mark (`fill-rule="evenodd"`), ditambah
**slot brankas** di tepi kanan.

## Makna

- **Kotak rounded** = wadah/brankas penyimpanan tempat berkas disimpan.
- **K** = KoncetCloud, lengan diagonal tepat 45° menjadi ciri hurufnya.
- **Slot** = celah kunci/pegangan brankas; juga pintu keluar berkas.

Karena K dan slot adalah lubang, mark hanya butuh **satu warna** dan otomatis
mengikuti warna latar (terang/gelap) — lubangnya tembus ke latar di belakangnya.

## Geometri (jangan diubah seenaknya)

- Sudut kotak `rx 40` (tegas; bukan `rx 60` yang terlalu ramah).
- Huruf K: batang `x78-106`, semua diagonal tepat **45°**, pusat optis `x127`.
- Slot: lekukan **masuk ke dalam** tepi kanan, `x208-240`, `y108-148`.

## Aturan pakai

- Ukuran minimum **24px** di UI.
- **16px** untuk favicon (varian small-size cut, lihat di bawah).
- Beri ruang kosong minimal **6% dari sisi** mark agar tidak terasa sesak.

## Varian

- **Master ink** — `web/src/assets/logo.svg`, satu warna ink, untuk materi cetak
  dan ekspor.
- **Inline (tema)** — `web/src/components/BrandMark.vue`, dipakai di header,
  sidebar, dan halaman login. `fill="currentColor"` jadi otomatis menyesuaikan
  tema terang/gelap.
- **Favicon (small-size cut)** — `web/public/favicon.svg`: tile tinta tegas +
  K putih knockout. **Slot dihapus** di varian ini (nyaris tak terlihat di
  16px dan potongannya membuat whine).

## Warna

Monokrom. Gunakan `currentColor` atau tinta (hitam/putih). **JANGAN** memberi
warna biru pada mark.

## Larangan

- Jangan meregangkan atau mengubah rasio mark.
- Jangan menambah warna (mark harus tetap monokrom).
- Jangan memutar mark.
- Jangan memindahkan slot ke tepi lain.

## Mark master

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="KoncetCloud">
  <title>KoncetCloud</title>
  <path id="symbol" fill="#000000" fill-rule="evenodd" d="M56 16 H200 A40 40 0 0 1 240 56 V200 A40 40 0 0 1 200 240 H56 A40 40 0 0 1 16 200 V56 A40 40 0 0 1 56 16 Z M78 76 H106 V110 L140 76 H176 L124 128 L176 180 H140 L106 146 V180 H78 Z M240 108 H222 A14 14 0 0 0 208 122 V134 A14 14 0 0 0 222 148 H240 Z"/>
</svg>
```
