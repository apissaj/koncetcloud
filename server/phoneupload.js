// Backup dari HP: terima file dari browser HP secara bertahap (chunk),
// rakit di folder staging lokal, lalu pindahkan ke remote cloud lewat rclone
// (operations/copyfile). Chunk kecil supaya aman lewat Cloudflare Tunnel.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';

export const STAGING_DIR = process.env.PHONE_STAGING || path.join(process.cwd(), 'staging');
export const MAX_CHUNK = 16 * 1024 * 1024; // 16 MB: batas parser body per request
export const CHUNK_ADVERTISE = 8 * 1024 * 1024; // 8 MB: ukuran chunk yang dikirim ke klien
export const MAX_FILE = 4 * 1024 * 1024 * 1024; // 4 GB per file
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;

const sessions = new Map(); // id -> { id, dir, tmp, name, size, dest, received, createdAt, user }

export function sanitizeName(name) {
  const base = path.basename(String(name || '').trim()).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_');
  if (!base || base === '.' || base === '..') return null;
  return base.slice(0, 180);
}

export function sanitizeDestDir(dir) {
  const d = String(dir || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (d.split('/').some((seg) => seg === '..')) return null;
  if (d.length > 300) return null;
  return d;
}

export function cleanupStale(now = Date.now()) {
  for (const s of sessions.values()) {
    if (now - s.createdAt > SESSION_TTL_MS) {
      try { fs.rmSync(s.tmp, { force: true }); } catch { /* ignore */ }
      sessions.delete(s.id);
    }
  }
}

/** Pasang rute upload HP. `rc` = helper RC, `authed`/`adminOnly` = middleware, `audit` = logger. */
export function mountPhoneUpload(app, { rc, adminOnly, audit, isValidRemote }) {
  fs.mkdirSync(STAGING_DIR, { recursive: true });

  // daftar nama remote tujuan (ringan: tanpa operations/about yang lambat)
  app.get('/api/phone/targets', adminOnly, async (_req, res) => {
    try {
      const { remotes } = await rc('config/listremotes');
      res.json({ remotes: (remotes || []).map((name) => ({ name })) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 1) mulai sesi
  app.post('/api/phone/upload/init', adminOnly, (req, res) => {
    cleanupStale();
    const name = sanitizeName(req.body?.name);
    const size = Number(req.body?.size);
    const dest = String(req.body?.dest || '').trim(); // contoh "gdrive:Backup HP"
    const subdir = sanitizeDestDir(req.body?.subdir || '');
    if (!name) return res.status(400).json({ error: 'nama file tidak valid' });
    if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE) {
      return res.status(400).json({ error: 'ukuran file tidak valid (maks 4 GB)' });
    }
    if (subdir === null) return res.status(400).json({ error: 'folder tujuan tidak valid' });
    const m = dest.match(/^([A-Za-z0-9._-]+):$/);
    if (!m || !isValidRemote(m[1])) return res.status(400).json({ error: 'remote tujuan tidak valid' });

    const id = crypto.randomUUID();
    const tmp = path.join(STAGING_DIR, `${id}.part`);
    fs.writeFileSync(tmp, Buffer.alloc(0));
    sessions.set(id, {
      id, tmp, name, size, dest, subdir, received: 0, createdAt: Date.now(), user: req.user?.username || null,
    });
    res.json({ id, chunkSize: CHUNK_ADVERTISE });
  });

  // 2) kirim satu chunk (body mentah). Harus berurutan: offset == byte yang sudah diterima.
  app.put(
    '/api/phone/upload/:id/chunk',
    adminOnly,
    express.raw({ type: 'application/octet-stream', limit: MAX_CHUNK }),
    (req, res) => {
      const s = sessions.get(req.params.id);
      if (!s) return res.status(404).json({ error: 'sesi upload tidak ditemukan' });
      const offset = Number(req.query.offset);
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) return res.status(400).json({ error: 'chunk kosong' });
      if (offset !== s.received) {
        return res.status(409).json({ error: 'offset tidak cocok', expected: s.received });
      }
      if (s.received + body.length > s.size) return res.status(400).json({ error: 'melebihi ukuran yang dideklarasikan' });
      fs.appendFileSync(s.tmp, body);
      s.received += body.length;
      res.json({ received: s.received, size: s.size });
    },
  );

  // 3) selesaikan: verifikasi ukuran, pindah ke remote, bersihkan staging
  app.post('/api/phone/upload/:id/finish', adminOnly, async (req, res) => {
    const s = sessions.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'sesi upload tidak ditemukan' });
    if (s.received !== s.size) {
      return res.status(400).json({ error: 'upload belum lengkap', received: s.received, size: s.size });
    }
    const destPath = s.subdir ? `${s.subdir}/${s.name}` : s.name;
    try {
      await rc('operations/copyfile', {
        srcFs: STAGING_DIR,
        srcRemote: path.basename(s.tmp),
        dstFs: s.dest,
        dstRemote: destPath,
      });
      audit(req, 'phone_upload', `${s.dest}${destPath} (${s.size} byte)`, true);
      res.json({ ok: true, dest: `${s.dest}${destPath}`, size: s.size });
    } catch (e) {
      audit(req, 'phone_upload', `${s.dest}${destPath}`, false);
      res.status(500).json({ error: e.message });
    } finally {
      try { fs.rmSync(s.tmp, { force: true }); } catch { /* ignore */ }
      sessions.delete(s.id);
    }
  });

  // 4) batalkan sesi (dipanggil UI kalau user menutup/menyerah)
  app.delete('/api/phone/upload/:id', adminOnly, (req, res) => {
    const s = sessions.get(req.params.id);
    if (s) {
      try { fs.rmSync(s.tmp, { force: true }); } catch { /* ignore */ }
      sessions.delete(s.id);
    }
    res.json({ ok: true });
  });
}
