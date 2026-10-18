// Validasi parameter "remote filesystem" untuk endpoint browse/mutasi.
//
// Kenapa terpisah: rclone memperlakukan string tanpa prefix `remote:` sebagai
// PATH LOKAL, dan `--rc-serve` menyajikannya. Kalau `fs` dari klien tidak
// divalidasi, klien login bisa membaca/menulis file di mesin server (mis.
// `fs=C:/Windows`) atau memakai backend on-the-fly (`:memory:`). Fungsi murni di
// sini dipisah supaya mudah diuji tanpa menjalankan server (lihat validate.test.js).

/** Pastikan `fs` berbentuk "remote:" (huruf/angka/titik/tanda hubung) dan kembalikan.
 *  Lempar { httpStatus: 400 } bila tidak valid. */
export function parseFsName(rawFs) {
  const fsName = String(rawFs || '').trim();
  // Bentuk "remote:", TAPI bukan drive-letter 1 huruf ("C:") — rclone memberi
  // prioritas drive-letter di atas nama remote, jadi "C:" bisa menunjuk disk
  // lokal meski ada remote bernama "C" yang terdaftar.
  if (!/^[A-Za-z0-9._-]+:$/.test(fsName) || /^[A-Za-z]:$/.test(fsName)) {
    throw Object.assign(new Error('fs tidak valid'), { httpStatus: 400 });
  }
  return fsName;
}

/** Nama remote dari fsName ("gdrive:" -> "gdrive"). */
export function fsRemoteName(fsName) {
  return String(fsName || '').replace(/:$/, '');
}

/** Path DI DALAM remote: relatif, pemisah "/", tanpa traversal/absolut/drive/kontrol.
 *  String kosong (= root remote) diperbolehkan. Lempar { httpStatus: 400 } bila tidak aman. */
export function assertSafeRemotePath(rawPath) {
  const s = String(rawPath ?? '');
  if (s === '') return '';
  if (s.includes('\\') || s.startsWith('/') || /^[A-Za-z]:/.test(s) || /[\x00-\x1f]/.test(s)) {
    throw Object.assign(new Error('path tidak valid'), { httpStatus: 400 });
  }
  if (s.split('/').some((seg) => seg === '..')) {
    throw Object.assign(new Error('path tidak valid'), { httpStatus: 400 });
  }
  return s;
}