// Kebijakan pembersihan folder `ls-staging/failed` (file yang gagal didorong ke
// cloud). Dipisah dari localsend.js supaya bisa di-unit-test tanpa menjalankan
// server atau menyentuh filesystem nyata.
//
// Nama file di folder itu: `<sessionId>-<namaAsli>`. Sesi ganda tidak mungkin
// (satu sesi aktif per waktu), jadi prefix UUID cukup andal untuk menandai sesi.
import fs from 'node:fs';
import path from 'node:path';

export const FAILED_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari

/** File yang lebih tua dari TTL dianggap basi (mtime). */
export function isExpired(mtimeMs, now = Date.now(), ttlMs = FAILED_TTL_MS) {
  return now - Number(mtimeMs) > ttlMs;
}

/**
 * Sapu folder `failed`: hapus file yang lebih tua dari TTL.
 * `onAudit(names, freedBytes)` opsional. Kembalikan { removed, freedBytes }.
 * Tidak pernah melempar; kegagalan hapus per file dilewati.
 */
export function sweepFailedDir(dir, { now = Date.now(), ttlMs = FAILED_TTL_MS, onAudit } = {}) {
  const out = { removed: 0, freedBytes: 0 };
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // folder belum ada
  }
  const removedNames = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const p = path.join(dir, e.name);
    try {
      const st = fs.statSync(p);
      if (!isExpired(st.mtimeMs, now, ttlMs)) continue;
      fs.rmSync(p, { force: true });
      out.removed += 1;
      out.freedBytes += st.size || 0;
      removedNames.push(e.name);
    } catch {
      /* berkas terkunci/dihapus proses lain: lewati */
    }
  }
  if (removedNames.length && typeof onAudit === 'function') {
    try { onAudit(removedNames, out.freedBytes); } catch { /* audit tidak boleh menjatuhkan sweep */ }
  }
  return out;
}