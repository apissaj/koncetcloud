// Receiver LocalSend: HP kirim foto/video LANGSUNG ke server ini (satu langkah),
// lalu file otomatis didorong ke remote cloud lewat rclone.
//
// Protokol: LocalSend v2.2 (github.com/localsend/protocol).
//  - Discovery : UDP multicast 224.0.0.167:53317
//  - Transfer  : HTTP TCP 53317 (prepare-upload -> upload -> cancel)
// Server ini berperan sebagai "receiver"; HP tetap pakai aplikasi LocalSend.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import https from 'node:https';
import dgram from 'node:dgram';
import crypto from 'node:crypto';

export const LS_PORT = Number(process.env.LS_PORT || 53317);
const MC_ADDR = '224.0.0.167';
const MC_PORT = 53317;
const ALIAS = process.env.LS_ALIAS || 'KoncetCloud';
const STAGING = process.env.LS_STAGING || path.join(process.cwd(), 'ls-staging');
const DEST = process.env.LS_DEST || 'gdrive3:Backup HP';

// Fingerprint PERSISTEN: kalau berubah tiap restart, HP menganggap device
// berubah dan sering hilang dari daftar. Simpan ke file supaya identitas sama
// meski server restart.
const FINGERPRINT_FILE = process.env.LS_FINGERPRINT_FILE || path.join(process.cwd(), 'ls-fingerprint.txt');
function loadFingerprint() {
  if (process.env.LS_FINGERPRINT) return process.env.LS_FINGERPRINT;
  try {
    const existing = fs.readFileSync(FINGERPRINT_FILE, 'utf8').trim();
    if (existing) return existing;
  } catch {
    /* file belum ada */
  }
  const fresh = crypto.randomBytes(16).toString('hex');
  try {
    fs.writeFileSync(FINGERPRINT_FILE, fresh, { mode: 0o600 });
  } catch {
    /* non-fatal */
  }
  return fresh;
}
const FINGERPRINT = loadFingerprint();

/** IP LAN pertama (Wi-Fi disukai) untuk multicast — Windows butuh interface
 *  eksplisit, kalau dibiarkan sering salah pilih adapter virtual. */
function lanIp() {
  if (process.env.LS_LAN_IP) return process.env.LS_LAN_IP;
  const nets = os.networkInterfaces();
  const v4 = [];
  for (const list of Object.values(nets)) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) v4.push(ni.address);
    }
  }
  const priv = v4.find((a) => /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(a));
  return priv || v4[0] || '0.0.0.0';
}
// Foto HP sering bernama sama (IMG_0001.HEIC berulang). Simpan per tanggal
// lokal supaya tidak saling menimpa, plus cek nama unik di dalam folder itu.
const DEST_DATED = (process.env.LS_DEST_DATED || '1') !== '0';
const MAX_SESSION_BYTES = 40 * 1024 * 1024 * 1024; // 40 GB per sesi
const SESSION_TTL_MS = 3 * 60 * 60 * 1000;

const sessions = new Map(); // sessionId -> { id, createdAt, files: Map, ip }

/** POST JSON ke perangkat LAN. Khusus HTTPS: sertifikat LocalSend self-signed,
 * jadi verifikasi dilewati HANYA untuk panggilan ini (bukan global proses). */
function postJsonLan(urlStr, obj) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const body = JSON.stringify(obj);
    const opts = {
      method: 'POST',
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 4000,
      rejectUnauthorized: false, // self-signed LocalSend
    };
    const mod = u.protocol === 'https:' ? https : http;
    const r = mod.request(opts, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    r.on('error', reject);
    r.on('timeout', () => r.destroy(new Error('timeout')));
    r.end(body);
  });
}

function deviceInfo(announce = false) {
  return {
    alias: ALIAS,
    version: '2.0',
    deviceModel: 'Windows',
    deviceType: 'server',
    fingerprint: FINGERPRINT,
    port: LS_PORT,
    protocol: 'http',
    download: false,
    announce,
  };
}

export function sanitizeName(name) {
  const base = path.basename(String(name || '').trim()).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_');
  if (!base || base === '.' || base === '..') return null;
  return base.slice(0, 180);
}

function readJson(req, limit = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('body terlalu besar'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('JSON tidak valid'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function sendEmpty(res, code) {
  res.writeHead(code);
  res.end();
}

function cleanupStale(now = Date.now()) {
  for (const s of sessions.values()) {
    if (now - s.createdAt > SESSION_TTL_MS) {
      removeSession(s.id);
    }
  }
}

function removeSession(id) {
  const s = sessions.get(id);
  if (!s) return;
  try {
    fs.rmSync(path.join(STAGING, id), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  sessions.delete(id);
}

/** Sesi yang masih aktif = punya file belum selesai dan belum basi.
 *  Sesi macet (sender hilang tanpa cancel) dibersihkan supaya tidak
 *  memblokir transfer baru selamanya. */
const SESSION_ACTIVE_MS = 30 * 60 * 1000;

function activeSession() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    const unfinished = [...s.files.values()].some((f) => !f.done);
    if (unfinished) {
      if (now - s.createdAt > SESSION_ACTIVE_MS) {
        removeSession(id); // basi: bersihkan, izinkan sesi baru
      } else {
        return s;
      }
    }
  }
  return null;
}

/** Copy satu file ke remote lewat RC dengan pola job async.
 *  Panggilan sinkron untuk file besar (ratusan MB) rawan putus ("fetch failed"),
 *  jadi kita jalankan sebagai job lalu poll `job/status` sampai selesai. */
async function copyFileToRemote(rc, srcFs, srcRemote, dstFs, dstRemote) {
  let jobid;
  try {
    const r = await rc('operations/copyfile', {
      srcFs,
      srcRemote,
      dstFs,
      dstRemote,
      _async: 'true',
    });
    jobid = r?.jobid;
  } catch (e) {
    throw new Error(`mulai copy gagal: ${e.message}`);
  }
  if (jobid == null) return; // server balas sinkron (jarang) = sudah selesai

  const deadline = Date.now() + 30 * 60 * 1000; // maks 30 menit per file
  for (;;) {
    await new Promise((r) => setTimeout(r, 1000));
    let st;
    try {
      st = await rc('job/status', { jobid });
    } catch (e) {
      throw new Error(`cek status gagal: ${e.message}`);
    }
    if (st?.finished) {
      if (st.success) return;
      throw new Error(st.error || 'copy gagal');
    }
    if (Date.now() > deadline) throw new Error('timeout menyalin file');
  }
}

/** Nama unik di remote: kalau sudah ada, tambahkan " (2)", " (3)", ... */
async function uniqueRemoteName(rc, fsRoot, name) {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 1; i <= 50; i++) {
    const candidate = i === 1 ? name : `${stem} (${i})${ext}`;
    // operations/stat balas {"item": null} dengan HTTP 200 kalau file TIDAK ada
    // (bukan error) — jadi cek isi item-nya, bukan rely pada exception.
    const r = await rc('operations/stat', { fs: fsRoot, remote: candidate }).catch(() => ({ item: null }));
    if (!r?.item) return candidate;
  }
  return `${stem}-${Date.now()}${ext}`;
}

/** Tanggal lokal YYYY-MM-DD (bukan UTC) supaya folder ikut hari di HP. */
function localDateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Semua file sesi selesai diterima: dorong ke remote, lalu bersihkan staging.
 *  HANYA file yang berhasil di-copy yang dihapus dari staging. File gagal
 *  DIPERTAHANKAN supaya bisa di-retry tanpa minta HP kirim ulang. */
async function pushSession(s, rc, audit) {
  const dir = path.join(STAGING, s.id);
  const fsRoot = DEST_DATED ? `${DEST}/${localDateKey()}` : DEST;
  const success = [];
  const failed = [];
  for (const f of s.files.values()) {
    const srcPath = path.join(dir, f.name);
    let lastErr = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const dst = await uniqueRemoteName(rc, fsRoot, f.name);
        await copyFileToRemote(rc, dir, f.name, fsRoot, dst);
        audit('localsend_upload', `${fsRoot}/${dst} (${f.size} byte)`, true, s.ip);
        success.push(srcPath);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 3000));
      }
    }
    if (lastErr) {
      audit('localsend_upload', `${f.name}: ${lastErr.message}`, false, s.ip);
      failed.push(f.name);
    }
  }
  if (!failed.length) {
    removeSession(s.id); // semua sukses: hapus staging sesi
  } else {
    // Simpan yang gagal di folder khusus agar tidak ikut terhapus sesi berikutnya.
    const keepDir = path.join(STAGING, 'failed');
    fs.mkdirSync(keepDir, { recursive: true });
    for (const name of failed) {
      const src = path.join(dir, name);
      const dst = path.join(keepDir, `${s.id}-${name}`);
      try {
        fs.renameSync(src, dst);
      } catch {
        fs.copyFileSync(src, dst);
      }
    }
    removeSession(s.id); // hapus sisa staging sesi (file sukses + folder kosong)
    audit('localsend_upload', `gagal, disimpan di staging/failed: ${failed.join(', ')}`, false, s.ip);
  }
}

/** Perangkat lain mengumumkan dirinya: balas supaya dia mencatat kita. */
async function replyToAnnounce(info, addr, sock) {
  const port = info.port || 53317;
  // 1. Balasan utama: HTTP register ke perangkat pengirim (sesuai protokol).
  const scheme = info.protocol === 'https' ? 'https' : 'http';
  try {
    await postJsonLan(`${scheme}://${addr}:${port}/api/localsend/v2/register`, deviceInfo(false));
  } catch {
    /* kalau HTTPS/self-signed gagal, masih ada balasan multicast di bawah */
  }
  // 2. Fallback: balasan multicast (tanpa announce) supaya tetap terdeteksi.
  try {
    const msg = Buffer.from(JSON.stringify(deviceInfo(false)));
    sock.send(msg, 0, msg.length, MC_PORT, MC_ADDR);
  } catch {
    /* ignore */
  }
}

// --- HTTP: endpoint penerima ------------------------------------------
function handleRequest(req, res, ctx) {
  const { rc, audit } = ctx;
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  cleanupStale();

  if (p === '/api/localsend/v2/info' && req.method === 'GET') {
    return sendJson(res, 200, deviceInfo(false));
  }

  if (p === '/api/localsend/v2/register' && req.method === 'POST') {
    // Perangkat lain memperkenalkan diri; balas dengan info kita.
    readJson(req).catch(() => ({}));
    return sendJson(res, 200, deviceInfo(false));
  }

  if (p === '/api/localsend/v2/prepare-upload' && req.method === 'POST') {
    return readJson(req)
      .then(async (body) => {
        const files = body?.files;
        if (!files || typeof files !== 'object' || !Object.keys(files).length) {
          return sendJson(res, 400, { error: 'invalid body' });
        }
        const running = activeSession();
        if (running) return sendJson(res, 409, { error: 'blocked by another session' });

        let total = 0;
        for (const f of Object.values(files)) total += Number(f?.size || 0);
        if (total <= 0 || total > MAX_SESSION_BYTES) return sendJson(res, 403, { error: 'rejected' });

        const ip = req.socket.remoteAddress || 'lan';
        const id = crypto.randomUUID();
        const map = new Map();
        const tokens = {};
        for (const [fileId, meta] of Object.entries(files)) {
          const name = sanitizeName(meta?.fileName);
          if (!name) continue;
          const token = crypto.randomBytes(16).toString('hex');
          tokens[fileId] = token;
          map.set(fileId, {
            id: fileId,
            name,
            size: Number(meta?.size || 0),
            sha256: meta?.sha256 || null,
            token,
            received: 0,
            done: false,
          });
        }
        if (!map.size) return sendJson(res, 400, { error: 'invalid body' });

        fs.mkdirSync(path.join(STAGING, id), { recursive: true });
        sessions.set(id, { id, createdAt: Date.now(), files: map, ip });
        audit('localsend_prepare', `${map.size} file dari ${body?.info?.alias || 'perangkat'} (${total} byte)`, true, ip);
        return sendJson(res, 200, { sessionId: id, files: tokens });
      })
      .catch(() => sendJson(res, 400, { error: 'invalid body' }));
  }

  if (p === '/api/localsend/v2/upload' && req.method === 'POST') {
    const sid = url.searchParams.get('sessionId');
    const fid = url.searchParams.get('fileId');
    const token = url.searchParams.get('token');
    const s = sessions.get(sid);
    const f = s?.files.get(fid);
    if (!s || !f) return sendEmpty(res, 400);
    if (f.token !== token) return sendEmpty(res, 403);
    if (f.done) return sendEmpty(res, 403);
    if (f.received > 0) return sendEmpty(res, 409);

    const filePath = path.join(STAGING, sid, f.name);
    const out = fs.createWriteStream(filePath);
    const hash = f.sha256 && !f.sha256.startsWith('*') ? crypto.createHash('sha256') : null;
    let received = 0;
    let aborted = false;

    req.on('data', (c) => {
      received += c.length;
      if (hash) hash.update(c);
      if (received > f.size) {
        aborted = true;
        out.destroy();
        req.destroy();
      }
    });
    req.pipe(out);

    return out.on('finish', () => {
      if (aborted) {
        sendEmpty(res, 400);
        return;
      }
      f.received = received;
      if (received !== f.size) {
        audit('localsend_upload', `${f.name}: ukuran tidak cocok (${received}/${f.size})`, false, s.ip);
        sendEmpty(res, 400);
        return;
      }
      if (hash && hash.digest('hex').toLowerCase() !== String(f.sha256).toLowerCase()) {
        try { fs.rmSync(filePath, { force: true }); } catch { /* ignore */ }
        audit('localsend_upload', `${f.name}: sha256 tidak cocok`, false, s.ip);
        sendEmpty(res, 422);
        return;
      }
      f.done = true;
      sendEmpty(res, 200);
      // Sesi lengkap? dorong ke remote.
      if ([...s.files.values()].every((x) => x.done)) {
        pushSession(s, rc, audit).catch(() => removeSession(s.id));
      }
    }).on('error', () => {
      sendEmpty(res, 500);
    });
  }

  if (p === '/api/localsend/v2/cancel' && req.method === 'POST') {
    const sid = url.searchParams.get('sessionId');
    if (sid) {
      audit('localsend_cancel', `sesi ${sid}`, true, sessions.get(sid)?.ip || null);
      removeSession(sid);
    }
    return sendEmpty(res, 200);
  }

  return sendEmpty(res, 404);
}

/** Jalankan receiver + discovery. `rc` dan `audit` disuntik dari index.js. */
export function startLocalSend({ rc, audit }) {
  fs.mkdirSync(STAGING, { recursive: true });

  const server = http.createServer((req, res) => handleRequest(req, res, { rc, audit }));
  server.on('clientError', (_e, socket) => socket.destroy());
  server.listen(LS_PORT, '0.0.0.0', () => {
    console.log(`LocalSend receiver siap: http://<ip-lan>:${LS_PORT} (alias: ${ALIAS} -> ${DEST})`);
  });
  server.on('error', (e) => console.error('LocalSend receiver error:', e.message));

  // --- Discovery UDP multicast ---
  const ip = lanIp();
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('error', (e) => console.error('LocalSend discovery error:', e.message));
  sock.on('message', (msg, rinfo) => {
    let info;
    try {
      info = JSON.parse(msg.toString('utf8'));
    } catch {
      return;
    }
    if (!info || info.fingerprint === FINGERPRINT) return;
    if (info.announce) replyToAnnounce(info, rinfo.address, sock);
  });

  /** Kirim announce ke grup multicast dari interface LAN yang benar. */
  function announce() {
    try {
      const hello = Buffer.from(JSON.stringify(deviceInfo(true)));
      sock.send(hello, 0, hello.length, MC_PORT, MC_ADDR, () => {});
    } catch (e) {
      console.error('gagal announce:', e.message);
    }
  }

  try {
    sock.bind({ port: MC_PORT, address: '0.0.0.0', exclusive: false }, () => {
      try {
        sock.addMembership(MC_ADDR, ip); // terima multicast di interface LAN
      } catch (e) {
        console.error('gagal join multicast:', e.message);
      }
      try {
        sock.setMulticastInterface(ip); // kirim multicast lewat interface LAN
        sock.setMulticastTTL(2);
      } catch (e) {
        console.error('gagal set interface multicast:', e.message);
      }
      announce();
      // Ulangi berkala: HP yang baru buka app / habis pindah jaringan tetap
      // menemukan kita tanpa perlu restart server.
      const beat = setInterval(announce, 10 * 1000);
      if (beat.unref) beat.unref();
      console.log(`LocalSend discovery di ${ip}:${MC_PORT} (grup ${MC_ADDR})`);
    });
  } catch (e) {
    console.error('gagal bind discovery:', e.message);
  }

  audit('localsend_start', `receiver di port ${LS_PORT} (${ip}) -> ${DEST}`, true, null);

  // Sapu sesi basi secara berkala (sender hilang tanpa cancel).
  const sweep = setInterval(() => cleanupStale(), 5 * 60 * 1000);
  if (sweep.unref) sweep.unref();

  return { server, sock };
}

export { DEST as LS_DEST, STAGING as LS_STAGING };