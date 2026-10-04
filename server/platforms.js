// Modul "Hubungkan Akun" (KoncetCloud).
// Menyediakan daftar platform, penyambungan akun (mode form & OAuth) dan
// pemutusan remote. Tidak pernah menulis password/token ke log atau stdout:
// password di-obscure lewat `rclone obscure` (dikirim via stdin, bukan argumen)
// dan token OAuth hanya diteruskan ke RC lokal.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const RCLONE = process.env.RCLONE_BIN || 'rclone';

// id = nama remote default. backend = nama backend rclone
// (Google Drive memakai backend "drive", bukan "gdrive").
export const PLATFORMS = [
  { id: 'mega', label: 'MEGA', freeTier: '20 GB', auth: 'form', backend: 'mega' },
  { id: 'pcloud', label: 'pCloud', freeTier: '10 GB', auth: 'oauth', backend: 'pcloud' },
  { id: 'onedrive', label: 'OneDrive', freeTier: '5 GB', auth: 'oauth', backend: 'onedrive' },
  { id: 'gdrive', label: 'Google Drive', freeTier: '15 GB', auth: 'oauth', backend: 'drive' },
];

const OAUTH_TIMEOUT_MS = 10 * 60 * 1000;
const OAUTH_URL_WAIT_MS = 5000;
const REMOTE_NAME_RE = /^[A-Za-z0-9._-]+$/;

// Pesan error yang menandakan kredensial salah (bukan masalah jaringan).
// Sengaja spesifik supaya error jaringan ("connection refused", "timeout")
// tidak ikut terhapus konfigurasinya.
const BAD_CRED_RE =
  /(401|unauthor|forbidden|invalid credential|invalid password|invalid user|wrong password|bad credential|login failed|failed to login|incorrect password|couldn't login|could not login|email atau password)/i;

export function isValidRemoteName(name) {
  return typeof name === 'string' && REMOTE_NAME_RE.test(name.trim());
}

async function listRemotes(rc) {
  try {
    const { remotes } = await rc('config/listremotes');
    return remotes || [];
  } catch {
    return [];
  }
}

// --- Nama akun (email) per platform -------------------------------------
// Dipecahkan sekali lalu di-cache di memory (kontrak UPDATE 2026-10-04):
// request berikutnya tidak mengulang config/get ataupun panggilan HTTP.
// Nilai null yang ter-cache berarti sudah dicoba dan gagal — jangan diulang.
//
// Kunci cache menyertakan sidik jari token: kalau user menyambungkan ulang
// remote ke akun lain, token berubah, kunci berubah, dan nilai lama yang basi
// (mis. email akun sebelumnya) tidak akan terpakai lagi.
const accountCache = new Map(); // `${namaRemote}:${sidikJariToken}` -> string|null

function tokenFingerprint(cfg) {
  try {
    const t = typeof cfg?.token === 'string' ? JSON.parse(cfg.token) : cfg?.token;
    if (!t) return String(cfg?.user || '');
    const rt = String(t.refresh_token || '');
    const at = String(t.access_token || '');
    // Hash sederhana: cukup untuk membedakan token, bukan untuk keamanan.
    let h = 0;
    const s = `${rt}|${at}|${t.expiry || ''}`;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return `${h}:${rt.length}:${at.length}`;
  } catch {
    return 'unknown';
  }
}

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const OAUTH_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo?fields=email';
// Cadangan: token rclone biasanya hanya ber-scope `drive`, sehingga userinfo
// OpenID menolak 401. About API memakai scope drive yang sama dan tetap
// mengembalikan email pemilik (user.emailAddress). Tidak menulis config.
const DRIVE_ABOUT_URL = 'https://www.googleapis.com/drive/v3/about?fields=user';
const ACCOUNT_TIMEOUT_MS = 2000;

function fetchWithTimeout(url, opts) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ACCOUNT_TIMEOUT_MS);
  if (timer.unref) timer.unref();
  return fetch(url, opts).finally(() => clearTimeout(timer));
}

// Email Google Drive: token rclone tidak memuat id_token, jadi refresh
// access_token (refresh_token + client_id + client_secret dari config) lalu
// tanya userinfo. Read-only — tidak pernah menulis apa pun ke config.
async function gdriveEmail(cfg) {
  let token;
  try {
    token = typeof cfg.token === 'string' ? JSON.parse(cfg.token) : cfg.token;
  } catch {
    return null;
  }
  if (!token) return null;

  // Coba access_token yang sudah ada lebih dulu. Remote yang dibuat lewat
  // `rclone config` manual sering tidak menyimpan client_id/client_secret,
  // jadi refresh tidak mungkin; selama token belum kedaluwarsa, ini cukup.
  const notExpired = (exp) => {
    if (!exp) return true; // tanpa info expiry: coba saja
    const t = Date.parse(exp);
    return Number.isNaN(t) ? true : Date.now() < t - 60_000;
  };

  let accessToken = null;
  if (typeof token.access_token === 'string' && token.access_token && notExpired(token.expiry)) {
    accessToken = token.access_token;
  } else if (token.refresh_token && cfg.client_id && cfg.client_secret) {
    let tr;
    try {
      const body = new URLSearchParams({
        client_id: cfg.client_id,
        client_secret: cfg.client_secret,
        refresh_token: token.refresh_token,
        grant_type: 'refresh_token',
      });
      tr = await fetchWithTimeout(OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch {
      return null; // timeout / jaringan
    }
    if (!tr.ok) return null;
    let tok;
    try {
      tok = await tr.json();
    } catch {
      return null;
    }
    if (!tok.access_token) return null;
    accessToken = tok.access_token;
  }
  if (!accessToken) return null;
  const tok = { access_token: accessToken };
  // 1) Sesuai kontrak: userinfo OpenID.
  try {
    const ui = await fetchWithTimeout(OAUTH_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    if (ui.ok) {
      const info = await ui.json();
      if (info && typeof info.email === 'string' && info.email) return info.email;
    }
  } catch {
    /* lanjut ke cadangan */
  }
  // 2) Cadangan (scope `drive` saja): About API memberi email pemilik Drive.
  try {
    const ab = await fetchWithTimeout(DRIVE_ABOUT_URL, {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    if (ab.ok) {
      const info = await ab.json();
      const email = info && info.user && info.user.emailAddress;
      if (typeof email === 'string' && email) return email;
    }
  } catch {
    /* resolveAccount akan memakai fallback "Akun Google" */
  }
  return null;
}

// Email pCloud: endpoint /userinfo mengembalikan objek akun, termasuk `email`.
// access_token pCloud berumur panjang (expiry 0001 = tidak kedaluwarsa).
async function pcloudEmail(cfg) {
  let token;
  try {
    token = typeof cfg.token === 'string' ? JSON.parse(cfg.token) : cfg.token;
  } catch {
    return null;
  }
  const at = token && token.access_token;
  if (!at) return null;
  const host = String(cfg.hostname || 'api.pcloud.com');
  try {
    const res = await fetchWithTimeout(
      `https://${host}/userinfo?access_token=${encodeURIComponent(at)}`,
      {},
    );
    if (!res.ok) return null;
    const d = await res.json();
    if (d && d.result === 0 && typeof d.email === 'string' && d.email) return d.email;
  } catch {
    /* jaringan/timeout: akun tetap null */
  }
  return null;
}

// Email OneDrive: token rclone menyertakan id_token (JWT) yang memuat
// `preferred_username`/`email`. Decode payload-nya tanpa verifikasi tanda
// tangan — kita hanya membacanya untuk ditampilkan, bukan untuk keputusan
// keamanan.
function onedriveEmail(cfg) {
  try {
    const token = typeof cfg.token === 'string' ? JSON.parse(cfg.token) : cfg.token;
    const idt = token && token.id_token;
    if (typeof idt !== 'string' || !idt.includes('.')) return null;
    const payload = JSON.parse(Buffer.from(idt.split('.')[1], 'base64').toString('utf8'));
    const email = payload.preferred_username || payload.email || payload.upn;
    return typeof email === 'string' && email ? email : null;
  } catch {
    return null;
  }
}

// resolveAccount: kenali platform dari type config (drive/mega), bukan dari
// nama persis — supaya remote turunan seperti "gdrive2"/"mega2" juga ikut.
// mega = field `user` dari config/get; drive = email Google (fallback
// "Akun Google" bila refresh/userinfo gagal/timeout); lainnya = best-effort
// baca `email` dari token JSON, else null. Cache per nama remote.
export async function resolveAccount(name, cfg) {
  if (!cfg || typeof cfg !== 'object' || !Object.keys(cfg).length) return null;
  const key = `${name}:${tokenFingerprint(cfg)}`;
  if (accountCache.has(key)) return accountCache.get(key);
  let account = null;
  try {
    const type = String(cfg.type || '');
    const id = String(name || '');
    if (type === 'mega' || id.startsWith('mega')) {
      if (typeof cfg.user === 'string' && cfg.user) account = cfg.user;
    } else if (type === 'drive' || id.startsWith('gdrive')) {
      account = (await gdriveEmail(cfg)) || 'Akun Google';
    } else if (type === 'pcloud' || id.startsWith('pcloud')) {
      account = await pcloudEmail(cfg);
    } else if (type === 'onedrive' || id.startsWith('onedrive')) {
      account = onedriveEmail(cfg);
    } else if (typeof cfg.token === 'string') {
      try {
        const t = JSON.parse(cfg.token);
        if (t && typeof t.email === 'string' && t.email) account = t.email;
      } catch {
        /* token bukan JSON tegas; akun tetap null */
      }
    }
  } catch {
    account = null;
  }
  // Buang entri lama remote ini (token lama) supaya tidak menumpuk.
  const prefix = `${name}:`;
  for (const k of accountCache.keys()) {
    if (k.startsWith(prefix) && k !== key) accountCache.delete(k);
  }
  accountCache.set(key, account);
  return account;
}

// --- GET /api/platforms -------------------------------------------------
export async function listPlatforms(rc) {
  const remotes = await listRemotes(rc);
  const out = [];
  for (const p of PLATFORMS) {
    let connected = false;
    let remote = null;
    let error = null;
    let cfg = null;
    if (remotes.includes(p.id)) {
      try {
        cfg = await rc('config/get', { name: p.id });
        if (cfg && Object.keys(cfg).length) {
          connected = true;
          remote = p.id;
        } else {
          error = 'Remote ada tetapi konfigurasinya kosong.';
        }
      } catch (e) {
        error = e.message;
      }
    }
    let account = null;
    if (connected) {
      try {
        account = await resolveAccount(p.id, cfg);
      } catch {
        account = null;
      }
    }
    out.push({
      id: p.id,
      label: p.label,
      freeTier: p.freeTier,
      auth: p.auth,
      connected,
      remote,
      account,
      error,
    });
  }
  return out;
}

// --- Password MEGA: obscure lewat rclone --------------------------------
export function rcloneObscure(plain) {
  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawn(RCLONE, ['obscure', '-'], { windowsHide: true });
    } catch (e) {
      return reject(new Error('rclone tidak dapat dijalankan.'));
    }
    let out = '';
    proc.stdout.on('data', (d) => {
      out += d.toString();
    });
    proc.stderr.on('data', () => {
      /* dibuang: bisa memuat jejak, jangan pernah dicetak */
    });
    proc.on('error', () => reject(new Error('rclone tidak dapat dijalankan.')));
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error('rclone obscure gagal.'));
      const val = out.trim();
      if (!val) return reject(new Error('rclone obscure tidak menghasilkan nilai.'));
      resolve(val);
    });
    // Password dikirim via stdin (bukan argv) supaya tidak muncul di daftar proses.
    proc.stdin.write(String(plain) + '\n');
    proc.stdin.end();
  });
}

// --- POST /api/platforms/connect (mode form) ----------------------------
export async function connectForm({ rc, platform, remoteName, user, pass }) {
  if (!user || !pass) {
    return { status: 400, body: { error: 'Email dan password wajib diisi.', code: 'bad_request' } };
  }
  if (!isValidRemoteName(remoteName)) {
    return { status: 400, body: { error: 'Nama remote tidak valid.', code: 'bad_request' } };
  }
  const remotes = await listRemotes(rc);
  if (remotes.includes(remoteName)) {
    return { status: 409, body: { error: `Remote "${remoteName}" sudah terpasang.`, code: 'already_exists' } };
  }

  let obscured;
  try {
    obscured = await rcloneObscure(String(pass));
  } catch {
    return { status: 500, body: { error: 'Gagal mengenkripsi password.' } };
  }
  if (!obscured || obscured === String(pass)) {
    return { status: 500, body: { error: 'Password tidak berhasil di-obscure.' } };
  }

  try {
    await rc('config/create', {
      name: remoteName,
      type: platform.backend,
      parameters: { user: String(user), pass: obscured },
    });
  } catch (e) {
    return { status: 500, body: { error: 'Gagal menyimpan konfigurasi: ' + e.message } };
  }

  // Uji koneksi. Akun salah => hapus config lagi; error lain => simpan + warning.
  try {
    await rc('operations/about', { fs: `${remoteName}:` });
    return { status: 200, body: { ok: true, remote: remoteName, warning: null } };
  } catch (e) {
    const msg = String(e.message || '');
    if (BAD_CRED_RE.test(msg)) {
      try {
        await rc('config/delete', { name: remoteName });
      } catch {
        /* tidak ada yang tersisa untuk dihapus */
      }
      return { status: 400, body: { error: 'Email atau password MEGA salah.', code: 'bad_credentials' } };
    }
    return {
      status: 200,
      body: { ok: true, remote: remoteName, warning: `Konfigurasi tersimpan, tetapi uji koneksi gagal: ${msg}` },
    };
  }
}

// --- OAuth: proses rclone authorize yang berjalan -----------------------
const oauthProcesses = new Map(); // processId -> record

let _localPortSupported = null;
async function authLocalPortSupported() {
  if (_localPortSupported !== null) return _localPortSupported;
  _localPortSupported = await new Promise((resolve) => {
    try {
      const p = spawn(RCLONE, ['authorize', '--help'], { windowsHide: true });
      let out = '';
      const onData = (d) => {
        out += d.toString();
      };
      p.stdout.on('data', onData);
      p.stderr.on('data', onData);
      p.on('error', () => resolve(false));
      p.on('close', () => resolve(/auth-local-port/.test(out)));
    } catch {
      resolve(false);
    }
  });
  return _localPortSupported;
}

function spawnAuthorize(backend, useLocalPort, donor) {
  const args = ['authorize', backend, '--auth-no-open-browser'];
  if (useLocalPort) args.push('--auth-local-port', '53700');
  // Pakai client_id milik user supaya token tidak tergantung pada client
  // bawaan rclone yang shared (dan dijadwalkan pensiun pada 2026).
  if (donor && donor.client_id) {
    args.push(`--${backend}-client-id`, donor.client_id);
    if (donor.client_secret) args.push(`--${backend}-client-secret`, donor.client_secret);
  }
  return spawn(RCLONE, args, { windowsHide: true });
}

function extractAuthUrl(text) {
  const m = text.match(/https?:\/\/[^\s"'<>]*\/auth\b[^\s"'<>]*/);
  if (m) return m[0];
  const m2 = text.match(/following link:\s*(https?:\/\/[^\s"'<>]+)/i);
  return m2 ? m2[1] : null;
}

export function extractTokenBlob(text) {
  const m = text.match(/--->\s*\r?\n([\s\S]*?)\r?\n<---End paste/);
  if (m) return m[1].trim();
  const lines = text.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].trim();
    if (l.startsWith('{') && l.includes('access_token')) {
      try {
        JSON.parse(l);
        return l;
      } catch {
        /* bukan JSON utuh, lanjut */
      }
    }
  }
  return null;
}

// Remote OAuth baru hanya menerima token dari `rclone authorize`. Agar token
// bisa di-refresh di kemudian hari, salin client_id/client_secret dari remote
// sejenis yang sudah tersimpan (kredensial OAuth milik user sendiri).
async function findDonorCredentials(rc, backend, skipName) {
  try {
    const { remotes } = await rc('config/listremotes');
    for (const name of remotes || []) {
      if (name === skipName) continue;
      try {
        const cfg = await rc('config/get', { name });
        if (cfg && cfg.type === backend && cfg.client_id && cfg.client_secret) {
          return { client_id: cfg.client_id, client_secret: cfg.client_secret };
        }
      } catch {
        /* lanjut ke remote berikutnya */
      }
    }
  } catch {
    /* daftar remote tak terbaca */
  }
  return {};
}

function finishOAuth(id, { status, error }) {
  const rec = oauthProcesses.get(id);
  if (!rec) return;
  rec.status = status;
  rec.error = error || null;
  if (rec.timer) {
    clearTimeout(rec.timer);
    rec.timer = null;
  }
  if (status === 'failed' && rec.proc && !rec.proc.killed) {
    try {
      rec.proc.kill();
    } catch {
      /* proses sudah mati */
    }
  }
  rec.proc = null;
  // Simpan sebentar supaya frontend masih bisa polling status akhir.
  const janitor = setTimeout(() => oauthProcesses.delete(id), 15 * 60 * 1000);
  if (janitor.unref) janitor.unref();
}

async function onOAuthClose(rec, rc, code) {
  if (rec.status !== 'waiting') return;
  if (code !== 0) {
    // Versi rclone lama/tak mendukung --auth-local-port: coba ulang tanpa flag.
    if (/unknown flag/i.test(rec.buffer) && !rec.retried) {
      rec.retried = true;
      rec.buffer = '';
      rec.authUrl = null;
      rec.proc = spawnAuthorize(rec.backend, false, rec.donor);
      attachOAuthHandlers(rec, rc);
      return;
    }
    return finishOAuth(rec.id, { status: 'failed', error: 'Proses otorisasi berhenti sebelum selesai.' });
  }
  const blob = extractTokenBlob(rec.buffer);
  if (!blob) {
    return finishOAuth(rec.id, { status: 'failed', error: 'Token tidak diterima dari rclone.' });
  }
  try {
    // Klien yang dipakai saat authorize HARUS sama dengan yang disimpan di
    // config, kalau tidak refresh token ditolak Google (client_id mismatch).
    // donor diambil di startOAuth dan dibawa lewat rec.
    const parameters = { token: blob };
    const donor = rec.donor || {};
    if (donor.client_id) parameters.client_id = donor.client_id;
    if (donor.client_secret) parameters.client_secret = donor.client_secret;
    await rc('config/create', { name: rec.remote, type: rec.backend, parameters });
    finishOAuth(rec.id, { status: 'done' });
  } catch (e) {
    try {
      await rc('config/delete', { name: rec.remote });
    } catch {
      /* tidak ada config setengah jadi yang perlu dihapus */
    }
    finishOAuth(rec.id, { status: 'failed', error: 'Gagal menyimpan konfigurasi: ' + e.message });
  }
}

function attachOAuthHandlers(rec, rc) {
  const onData = (d) => {
    rec.buffer += d.toString();
    if (rec.buffer.length > 200000) rec.buffer = rec.buffer.slice(-200000);
    if (!rec.authUrl) {
      const u = extractAuthUrl(rec.buffer);
      if (u) rec.authUrl = u;
    }
  };
  rec.proc.stdout.on('data', onData);
  rec.proc.stderr.on('data', onData);
  rec.proc.on('error', () => finishOAuth(rec.id, { status: 'failed', error: 'rclone authorize tidak dapat dijalankan.' }));
  rec.proc.on('close', (code) => {
    onOAuthClose(rec, rc, code);
  });
}

function waitForAuthUrl(rec, ms) {
  return new Promise((resolve) => {
    const deadline = Date.now() + ms;
    const tick = () => {
      if (rec.authUrl) return resolve(rec.authUrl);
      if (rec.status !== 'waiting') return resolve(null);
      if (Date.now() >= deadline) return resolve(null);
      const t = setTimeout(tick, 100);
      if (t.unref) t.unref();
    };
    tick();
  });
}

// --- POST /api/platforms/connect (mode oauth) ---------------------------
export async function startOAuth({ rc, platform, remoteName }) {
  if (!isValidRemoteName(remoteName)) {
    return { status: 400, body: { error: 'Nama remote tidak valid.', code: 'bad_request' } };
  }
  const remotes = await listRemotes(rc);
  if (remotes.includes(remoteName)) {
    return { status: 409, body: { error: `Remote "${remoteName}" sudah terpasang.`, code: 'already_exists' } };
  }

  const processId = crypto.randomUUID();
  const useLocalPort = await authLocalPortSupported();
  const rec = {
    id: processId,
    remote: remoteName,
    platform: platform.id,
    backend: platform.backend,
    status: 'waiting',
    authUrl: null,
    error: null,
    buffer: '',
    proc: null,
    timer: null,
    retried: false,
  };
  oauthProcesses.set(processId, rec);

  rec.timer = setTimeout(
    () => finishOAuth(processId, { status: 'failed', error: 'Waktu habis. Login tidak diselesaikan dalam 10 menit.' }),
    OAUTH_TIMEOUT_MS,
  );
  if (rec.timer.unref) rec.timer.unref();

  // Kredensial donor (client_id milik user) diambil sekali, lalu dipakai
  // untuk authorize DAN disimpan ke config — keduanya harus sama.
  rec.donor = await findDonorCredentials(rc, platform.backend, remoteName);

  rec.proc = spawnAuthorize(platform.backend, useLocalPort, rec.donor);
  attachOAuthHandlers(rec, rc);

  const authUrl = await waitForAuthUrl(rec, OAUTH_URL_WAIT_MS);
  if (rec.status === 'failed') {
    return { status: 200, body: { ok: false, authUrl: null, process: processId, error: rec.error } };
  }
  // authUrl boleh null: frontend polling GET /api/platforms/oauth/:processId.
  return { status: 200, body: { ok: true, authUrl, process: processId } };
}

// --- GET /api/platforms/oauth/:processId --------------------------------
export function getOAuthStatus(id) {
  const rec = oauthProcesses.get(id);
  if (!rec) {
    return { status: 404, body: { error: 'Proses otorisasi tidak ditemukan.', code: 'not_found' } };
  }
  if (rec.status === 'waiting') return { status: 200, body: { status: 'waiting', authUrl: rec.authUrl } };
  if (rec.status === 'done') return { status: 200, body: { status: 'done', remote: rec.remote } };
  return { status: 200, body: { status: 'failed', error: rec.error || 'Otorisasi gagal.' } };
}

// --- POST /api/platforms/disconnect -------------------------------------
export async function disconnectRemote(rc, remote) {
  const name = String(remote || '').trim();
  if (!name) return { status: 400, body: { error: 'remote wajib diisi.', code: 'bad_request' } };
  if (name === 'gdrive') {
    return { status: 403, body: { error: 'Remote Google Drive dilindungi dan tidak dapat diputus.', code: 'protected' } };
  }
  if (!isValidRemoteName(name)) return { status: 400, body: { error: 'Nama remote tidak valid.', code: 'bad_request' } };
  const remotes = await listRemotes(rc);
  if (!remotes.includes(name)) {
    return { status: 404, body: { error: `Remote "${name}" tidak terpasang.`, code: 'not_found' } };
  }
  try {
    await rc('config/delete', { name });
  } catch (e) {
    return { status: 500, body: { error: e.message } };
  }
  return { status: 200, body: { ok: true } };
}