// omni-buddy backend: thin control plane over the local rclone RC daemon.
// It never stores user files. It only proxies browse/quota calls and
// schedules copy jobs that rclone executes itself.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  ensureAuth,
  issueToken,
  verifyToken,
  clearCookie,
  sessionCookie,
  makeLoginLimiter,
  requireAuth,
  requireAdmin,
  sessionUser,
  verifyUserPassword,
  listUsers,
  createUser,
  deleteUser,
  changePassword,
  findUser,
  isSecureRequest,
  SESSION_COOKIE,
  verifyUserTotp,
  startTotpSetup,
  enableTotp,
  disableTotp,
  TTL_REMEMBER_MS,
} from './auth.js';
import {
  PLATFORMS,
  listPlatforms,
  connectForm,
  startOAuth,
  getOAuthStatus,
  disconnectRemote,
  isValidRemoteName,
  resolveAccount,
} from './platforms.js';
import { mountPhoneUpload } from './phoneupload.js';
import { getTransferState, startLocalSend } from './localsend.js';
import { parseFsName, fsRemoteName, assertSafeRemotePath } from './validate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RC = process.env.RC_ADDR || 'http://127.0.0.1:5572';
const PORT = Number(process.env.PORT || 5599);
const JOBS_FILE = path.join(__dirname, 'jobs.json');

function loadJobs() {
  try {
    return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
  } catch {
    return [];
  }
}
function saveJobs(list) {
  fs.writeFileSync(JOBS_FILE, JSON.stringify(list, null, 2));
}
let jobs = loadJobs();

// Server baru start: job yang ditandai 'running' berasal dari proses sebelumnya,
// jadi statusnya tidak bisa dipercaya lagi.
for (const j of jobs) {
  if (j.lastRun && j.lastRun.status === 'running') {
    j.lastRun.status = 'interrupted';
    j.lastRun.error = j.lastRun.error || 'Server dijalankan ulang saat job ini berjalan.';
  }
}
if (jobs.some((j) => j.lastRun?.status === 'interrupted')) saveJobs(jobs);

async function rc(method, params = {}, timeoutMs = 0) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    body.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const opts = { method: 'POST', body };
  if (timeoutMs > 0 && typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    opts.signal = AbortSignal.timeout(timeoutMs);
  }
  const res = await fetch(`${RC}/${method}`, opts);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error((data && (data.error || data.message)) || `rclone ${method} HTTP ${res.status}`);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}

// `fs` dari klien HARUS remote yang terdaftar di rclone. Tanpa ini, string apa pun
// (path lokal seperti "C:/Windows" atau backend on-the-fly ":memory:") diterima
// rclone dan --rc-serve menyajikannya -> klien login bisa baca/tulis file server.
// Validasi bentuk ada di ./validate.js; di sini ditambah cek ke daftar remote rclone.
async function assertRemoteFs(rawFs) {
  const fsName = parseFsName(rawFs);
  const { remotes } = await rc('config/listremotes');
  if (!(remotes || []).map(String).includes(fsRemoteName(fsName))) {
    throw Object.assign(new Error(`remote "${fsRemoteName(fsName)}" tidak terdaftar`), { httpStatus: 400 });
  }
  return fsName;
}

// `dest` job WAJIB remote yang terdaftar di rclone — bukan path lokal seperti
// "C:/..." (dest lokal bisa menulis ke disk server, melanggar invariant
// control plane). Source boleh path lokal; hanya dest yang dicek.
// Kembalian: 'form' (bentuk salah / diakhiri '/') | 'remote' (remote tak
// terdaftar) | null (valid). Tidak pernah melempar; RC tak terjangkau dianggap
// gagal-closed ('remote') supaya job tak dibuat/dijalankan tanpa kepastian.
async function destProblem(dest) {
  const raw = String(dest || '').trim();
  if (!raw || raw.endsWith('/') || raw.endsWith('\\')) return 'form';
  const i = raw.indexOf(':');
  if (i <= 0) return 'form';
  // Bagian "remote:" harus memenuhi parseFsName (menolak drive-letter "C:").
  // Bagian "remote:" harus memenuhi parseFsName (menolak drive-letter "C:"),
  // dan sisa path-nya harus lolos assertSafeRemotePath (tolak "..", absolut, "\").
  try {
    parseFsName(`${raw.slice(0, i + 1)}`);
    assertSafeRemotePath(raw.slice(i + 1));
  } catch {
    return 'form';
  }
  const remoteName = raw.slice(0, i);
  let remotes = [];
  try {
    const out = await rc('config/listremotes');
    remotes = (out && out.remotes) || [];
  } catch {
    return 'remote'; // rclone tak terjangkau: gagal-closed
  }
  return remotes.map(String).includes(remoteName) ? null : 'remote';
}

// --- Kunci anti-dobel ---------------------------------------------------
// Dua `sync/copy` ke tujuan yang sama secara bersamaan bikin Google Drive
// menyimpan dua file bernama sama (Drive mengizinkan nama duplikat, beda dari
// Windows). Itu pernah kejadian: 7,4 GB terbuang. Kunci ini mencegahnya.
// Node itu single-thread, jadi cek-lalu-set di bawah bersifat atomik selama
// tidak ada `await` di antara keduanya.
const activeRuns = new Map(); // jobId -> { jobid, dest, startedAt }

function normDest(dest) {
  return String(dest || '').trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function activeRunFor(jobId) {
  return activeRuns.get(jobId) || null;
}

function activeRunOnDest(dest) {
  const key = normDest(dest);
  for (const [jobId, run] of activeRuns) {
    if (normDest(run.dest) === key) return { jobId, ...run };
  }
  return null;
}

function releaseRun(jobId) {
  activeRuns.delete(jobId);
}

// Kunci bisa nyangkut kalau UI tidak polling lagi atau job mati tanpa terpantau.
// Selaraskan dengan kenyataan di rclone sebelum menolak permintaan run.
async function reconcile(job) {
  const last = job.lastRun;
  if (!last || last.jobid == null) return;
  // Hanya status yang bisa berarti job masih hidup yang perlu diverifikasi ke rclone.
  if (last.status !== 'running' && last.status !== 'interrupted') return;
  const lock = activeRunFor(job.id);
  const jobid = lock?.jobid ?? last.jobid;
  let st;
  try {
    st = await rc('job/status', { jobid });
  } catch (e) {
    // "job not found" = definitif: rclone tidak lagi mengenal jobid ini.
    if (/job not found/i.test(e.message)) {
      releaseRun(job.id);
      last.status = 'interrupted';
      last.error = last.error || 'Job berhenti tanpa terpantau (rclone tidak mengenali jobid).';
      saveJobs(jobs);
    }
    // Error lain (jaringan/timeout RC): JANGAN lepas kunci atau ubah status.
    // Melepas di sini bisa membuka celah duplikat saat job sebenarnya masih hidup.
    return;
  }
  // executeId BEDA = jobid ini dimiliki proses rclone lain (jobid reset dari 1
  // tiap restart rclone). Job kita berasal dari proses lama yang sudah tidak ada,
  // jadi kunci aman dilepas — ini kondisi NORMAL pasca-restart rclone, bukan error.
  if (last.executeId && st.executeId && last.executeId !== st.executeId) {
    releaseRun(job.id);
    last.status = 'interrupted';
    last.error = 'rclone dijalankan ulang setelah job ini mulai; job lama tidak dilanjutkan.';
    saveJobs(jobs);
    return;
  }
  // Job LAMA (mulai sebelum executeId disimpan) tak punya executeId, jadi kita
  // tak bisa membuktikan jobid itu milik job kita. Tapi membrick-nya (lepas
  // kunci + 'interrupted' setiap baca) justru mematikan kunci anti-dobel.
  // Fail-closed yang SEIMBANG: kalau rclone mengonfirmasi job ini masih hidup,
  // perlakukan seperti jalur normal (kunci di-rehidrasi, status 'running');
  // kalau tidak, baru tandai 'interrupted'.
  if (!last.executeId) {
    if (st.finished) {
      releaseRun(job.id);
      last.status = st.success ? 'done' : 'failed';
      last.error = st.success ? null : (st.error || last.error);
      last.finishedAt = new Date().toISOString();
      saveJobs(jobs);
      return;
    }
    if (!lock) activeRuns.set(job.id, { jobid, dest: job.dest, startedAt: last.startedAt });
    if (last.status !== 'running') {
      last.status = 'running';
      last.error = null;
      saveJobs(jobs);
    }
    return;
  }
  if (st.finished) {
    releaseRun(job.id);
    last.status = st.success ? 'done' : 'failed';
    last.error = st.success ? null : (st.error || last.error);
    last.finishedAt = new Date().toISOString();
    saveJobs(jobs);
    return;
  }
  // Masih hidup: rehidrasi kunci anti-dobel supaya run baru (job ini atau ke dest
  // sama) ditolak 409, walau status di disk sempat 'interrupted' karena restart.
  if (!lock) activeRuns.set(job.id, { jobid, dest: job.dest, startedAt: last.startedAt });
  if (last.status !== 'running') {
    last.status = 'running';
    last.error = null;
    saveJobs(jobs);
  }
}

// --- Keamanan: autentikasi multi-pengguna & pembatasan percobaan login ---
const auth = ensureAuth();
const loginLimiter = makeLoginLimiter({ windowMs: 15 * 60 * 1000, max: 10 });

// --- Audit log: satu JSON per baris, append-only ---
const AUDIT_DIR = path.join(__dirname, 'logs');
const AUDIT_FILE = path.join(AUDIT_DIR, 'audit.jsonl');

function clientIp(req) {
  // `req.ip` sudah menghormati `trust proxy` (loopback): Express membuang hop
  // XFF yang tidak dipercaya. Di belakang Cloudflare Tunnel peer adalah loopback,
  // jadi req.ip = IP klien asli dari header tepercaya. Pakai req.ip — JANGAN
  // parsing XFF mentah (bisa dipalsukan; dan `req.trustProxy` tak ada di Express 4).
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/** Catat aksi ke audit. detail maksimum ~200 karakter; jangan pernah password. */
function audit(req, action, detail = null, ok = true, userOverride = null) {
  try {
    fs.mkdirSync(AUDIT_DIR, { recursive: true });
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      user: userOverride || req?.user?.username || null,
      action,
      // Buang karakter kontrol (newline/ANSI) dari input klien sebelum ditulis
      // ke audit.jsonl supaya tidak bisa menyisipkan baris palsu.
      detail: detail ? String(detail).replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 200) : null,
      ip: clientIp(req),
      ok: !!ok,
    });
    fs.appendFileSync(AUDIT_FILE, line + '\n');
  } catch {
    /* kegagalan menulis audit tidak boleh menjatuhkan permintaan */
  }
}

const app = express();
// Tidak ada CORS terbuka: UI disajikan same-origin oleh server ini sendiri.
app.use(express.json({ limit: '256kb' }));

// Hanya loopback yang dipercaya (server bind 127.0.0.1; tunnel cloudflared lokal).
// Jangan pakai `true`: itu mempercayai X-Forwarded-Proto dari klien mana pun,
// sehingga flag Secure pada cookie sesi bisa dikendalikan penyerang.
app.set('trust proxy', 'loopback');

// CSP per-request: nonce acak untuk satu-satunya script inline di index.html
// (tema pra-paint). Nonce disimpan di res.locals agar penyaji index.html
// bisa menyuntikkannya ke atribut <script nonce="...">.
const CSP_NONCE_PLACEHOLDER = '__CSP_NONCE__';
// Origin rclone RC (untuk preview lewat --rc-serve). Diturunkan dari env RC_ADDR.
let RC_ORIGIN = 'http://127.0.0.1:5572';
try { RC_ORIGIN = new URL(RC).origin; } catch { /* pakai default */ }
function setSecurityHeaders(res) {
  const nonce = res.locals.cspNonce || crypto.randomBytes(16).toString('base64');
  res.locals.cspNonce = nonce;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  // style-src 'unsafe-inline': Tailwind/Vue menulis style inline; jangan
  // dihapus tanpa menguji UI. fonts.googleapis.com diizinkan karena
  // web/src/style.css meng-@import Google Fonts (stylesheet eksternal);
  // gstatic.com menyajikan file font-nya. Blob dipakai untuk unduhan lokal.
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Preview gambar/video diambil lewat /api/download yang me-redirect ke
      // origin rclone (--rc-serve). Origin itu harus diizinkan, kalau tidak
      // preview rusak (data tetap tak lewat proses ini: hanya redirect).
      `img-src 'self' data: blob: ${RC_ORIGIN}`,
      `media-src 'self' blob: ${RC_ORIGIN}`,
      `connect-src 'self' ${RC_ORIGIN}`,
      "font-src 'self' data: https://fonts.gstatic.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  );
}

// Header keamanan dasar untuk semua respons.
app.use((_req, res, next) => {
  setSecurityHeaders(res);
  next();
});

// --- Sesi ---
app.post('/api/login', (req, res) => {
  const { username, password, code, remember } = req.body || {};
  const uname = String(username || '').trim();
  const pass = String(password || '');

  const check = loginLimiter.check(uname);
  if (check.blocked) {
    res.setHeader('Retry-After', String(check.retryAfter));
    audit(req, 'login_blocked', `username=${uname}`, false, uname || null);
    return res.status(429).json({ error: 'Terlalu banyak percobaan. Tunggu beberapa menit.', code: 'rate_limited' });
  }

  const user = verifyUserPassword(auth.record, uname, pass);
  if (!user) {
    loginLimiter.fail(uname);
    audit(req, 'login_failed', `username=${uname}`, false, uname || null);
    // Pesan identik untuk username salah maupun password salah.
    return res.status(401).json({ error: 'Username atau password salah.', code: 'bad_credentials' });
  }
  if (user.disabled) {
    audit(req, 'login_failed', `username=${uname} (nonaktif)`, false, uname || null);
    return res.status(403).json({ error: 'Akun ini dinonaktifkan.', code: 'disabled' });
  }

  // Langkah kedua: kalau 2FA aktif, kode TOTP wajib. Tanpa kode yang benar,
  // sesi penuh TIDAK diberikan (hanya token sementara berumur 5 menit).
  if (user.totpEnabled) {
    if (!code) {
      audit(req, 'login_2fa_required', `username=${uname}`, true, uname);
      return res.status(401).json({ error: 'Kode autentikator diperlukan.', code: 'totp_required' });
    }
    if (!verifyUserTotp(auth.record, uname, code)) {
      loginLimiter.fail(uname);
      audit(req, 'login_2fa_failed', `username=${uname}`, false, uname);
      return res.status(401).json({ error: 'Kode autentikator salah.', code: 'bad_totp' });
    }
  }

  loginLimiter.reset(uname);
  const ttl = remember ? TTL_REMEMBER_MS : undefined;
  const token = ttl ? issueToken(auth.record.secret, user, ttl) : issueToken(auth.record.secret, user);
  const secure = isSecureRequest(req);
  const maxAge = ttl ? ttl / 1000 : undefined;
  res.setHeader('Set-Cookie', maxAge ? sessionCookie(token, { secure, maxAge }) : sessionCookie(token, { secure }));
  audit(req, 'login', `username=${uname}${user.totpEnabled ? ' (2FA)' : ''}${remember ? ' (tetap masuk)' : ''}`, true, user.username);
  res.json({ ok: true, user: { username: user.username, role: user.role } });
});

app.post('/api/logout', (req, res) => {
  audit(req, 'logout');
  res.setHeader('Set-Cookie', clearCookie());
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
  const user = sessionUser(req, auth.record);
  res.json({ authenticated: !!user, user });
});

app.get('/api/me', requireAuth(auth.record), (req, res) => {
  res.json({
    username: req.user.username,
    role: req.user.role,
    totpEnabled: !!req.user.totpEnabled,
  });
});

// --- 2FA (autentikator TOTP) --------------------------------------------
// Mulai penyiapan: server membuat secret dan mengembalikan otpauth URI.
// Secret hanya ditampilkan di langkah ini; tidak pernah masuk audit atau log.
app.post('/api/2fa/start', requireAuth(auth.record), (req, res) => {
  const out = startTotpSetup(auth.record, req.user.username);
  if (out.error) return res.status(400).json({ error: out.error, code: out.code });
  audit(req, '2fa_setup_start', `username=${req.user.username}`, true);
  res.json({ secret: out.secret, uri: out.uri });
});

// Aktifkan: pengguna membuktikan kode dari aplikasi autentikator.
app.post('/api/2fa/enable', requireAuth(auth.record), (req, res) => {
  const { code } = req.body || {};
  const out = enableTotp(auth.record, req.user.username, code);
  if (out.error) {
    audit(req, '2fa_enable_failed', `username=${req.user.username}`, false);
    return res.status(out.code === 'bad_credentials' ? 401 : 400).json({ error: out.error, code: out.code });
  }
  audit(req, '2fa_enabled', `username=${req.user.username}`, true);
  res.json({ ok: true });
});

// Matikan: butuh kode TOTP yang valid (kalau 2FA aktif) — mencegah sesi curian
// mematikan 2FA tanpa tahu apa pun.
app.post('/api/2fa/disable', requireAuth(auth.record), (req, res) => {
  const { code } = req.body || {};
  const out = disableTotp(auth.record, req.user.username, code);
  if (out.error) {
    audit(req, '2fa_disable_failed', `username=${req.user.username}`, false);
    return res.status(out.code === 'bad_credentials' ? 401 : 400).json({ error: out.error, code: out.code });
  }
  audit(req, '2fa_disabled', `username=${req.user.username}`, true);
  res.json({ ok: true });
});

// Ganti password.
// - Pemilik akun: wajib sertakan `current`, dan secret dirotasi (sesi lama mati).
// - Admin ganti password user lain: tanpa `current`, secret TIDAK dirotasi.
app.post('/api/password', requireAuth(auth.record), (req, res) => {
  const { current, next, username } = req.body || {};
  const target = (username && String(username).trim()) || req.user.username;
  const isSelf = String(target).toLowerCase() === String(req.user.username).toLowerCase();

  if (req.user.role !== 'admin' && !isSelf) {
    return res.status(403).json({ error: 'Hanya admin yang dapat mengubah password pengguna lain.', code: 'forbidden' });
  }
  if (isSelf) {
    if (!current || !verifyUserPassword(auth.record, target, String(current))) {
      return res.status(401).json({ error: 'Password lama salah.', code: 'bad_credentials' });
    }
  }
  if (!next || String(next).length < 8) {
    return res.status(400).json({ error: 'Password baru minimal 8 karakter.' });
  }
  const out = changePassword(auth.record, target, String(next), { rotateSecret: isSelf });
  if (out.error) return res.status(out.code === 'not_found' ? 404 : 400).json({ error: out.error, code: out.code || 'bad_request' });

  audit(req, 'password_change', `oleh=${req.user.username} untuk=${target}`, true);
  if (isSelf) {
    const me = findUser(auth.record, target);
    const token = issueToken(auth.record.secret, me);
    const secure = isSecureRequest(req);
    res.setHeader('Set-Cookie', sessionCookie(token, { secure }));
  }
  res.json({ ok: true });
});

// --- Manajemen pengguna (admin) -----------------------------------------
app.get('/api/users', requireAdmin(auth.record), (_req, res) => {
  res.json({ users: listUsers(auth.record) });
});

app.post('/api/users', requireAdmin(auth.record), (req, res) => {
  const { username, password, role } = req.body || {};
  const out = createUser(auth.record, username, password, role);
  if (out.error) {
    const status = out.code === 'already_exists' ? 409 : 400;
    return res.status(status).json({ error: out.error, code: out.code || 'bad_request' });
  }
  audit(req, 'user_create', `username=${out.user.username} role=${out.user.role}`, true);
  res.status(201).json({ user: out.user });
});

app.delete('/api/users/:username', requireAdmin(auth.record), (req, res) => {
  const target = req.params.username;
  // Proteksi "admin terakhir" ada di deleteUser (berbasis role, bukan nama).
  if (String(target).toLowerCase() === String(req.user.username).toLowerCase()) {
    return res.status(403).json({ error: 'Anda tidak dapat menghapus akun sendiri.', code: 'protected' });
  }
  const out = deleteUser(auth.record, target);
  if (out.error) return res.status(out.code === 'not_found' ? 404 : 400).json({ error: out.error, code: out.code || 'bad_request' });
  audit(req, 'user_delete', `username=${target}`, true);
  res.json({ ok: true });
});

// --- Riwayat aksi (admin) ------------------------------------------------
app.get('/api/audit', requireAdmin(auth.record), (req, res) => {
  // limit dijepit ke 1..500 (default 100) dan selalu bilangan bulat.
  const limit = Math.min(500, Math.max(1, Math.floor(Number(req.query.limit) || 100)));
  // Paginasi: offset minimum 0, selalu bilangan bulat.
  const offset = Math.max(0, Math.floor(Number(req.query.offset) || 0));
  let entries = [];
  try {
    const lines = fs.readFileSync(AUDIT_FILE, 'utf8').split('\n').filter(Boolean);
    for (const l of lines) {
      try { entries.push(JSON.parse(l)); } catch { /* baris rusak dilewati */ }
    }
  } catch {
    /* file belum ada */
  }
  entries.reverse(); // terbaru dulu
  const total = entries.length;
  entries = entries.slice(offset, offset + limit);
  res.json({ entries, total });
});

// Health check publik (tanpa data sensitif), dipakai reverse proxy / uptime check.
app.get('/api/health', (_req, res) => {
  // build = nama file JS yang sedang disajikan. Dipakai UI untuk mendeteksi
  // tab yang masih memuat bundle lama setelah aplikasi di-rebuild.
  let build = null;
  try {
    const html = fs.readFileSync(path.join(__dirname, '..', 'web', 'dist', 'index.html'), 'utf8');
    build = (html.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/) || [])[1] || null;
  } catch {
    build = null;
  }
  res.json({ ok: true, build });
});

// Semua endpoint API setelah ini butuh sesi login yang valid.
const authed = requireAuth(auth.record);
// Aksi yang mengubah data (hapus/ubah/buat/jalankan) hanya untuk admin.
const adminOnly = requireAdmin(auth.record);

app.get('/api/status', authed, async (_req, res) => {
  try {
    const v = await rc('core/version');
    res.json({ connected: true, version: v.version, os: v.os, arch: v.arch, rc: RC });
  } catch (e) {
    res.status(503).json({ connected: false, error: e.message, rc: RC });
  }
});

// --- Cache data remote (dipakai /api/remotes) ---------------------------
// `operations/about` itu lambat (1,5-6 detik per remote) sementara rute ini
// dipanggil saat mount aplikasi, saat panel Akun dibuka, dan SETIAP kali
// lonceng notifikasi dibuka. Jadi hasilnya di-cache per remote; refresh
// berjalan di LATAR BELAKANG supaya respons selalu memakai nilai cache lama
// dan request tidak pernah memblokir.
const REMOTES_CACHE_TTL_MS = 60 * 1000;
// Hasil GAGAL disimpan dengan TTL pendek: error tidak boleh "nyangkut"
// 60 detik penuh (memang boleh, tapi tidak enak saat rclone pulih).
const REMOTES_ERROR_TTL_MS = 15 * 1000;
const remoteAboutCache = new Map();  // name -> { ts, value, refreshing }
const remoteConfigCache = new Map(); // name -> { ts, value, refreshing }

// Buang cache remote yang dihapus/di-reconnect supaya /api/remotes tidak
// menyajikan data (akun/kapasitas) LAMA sampai TTL habis.
function invalidateRemoteCache(name) {
  const key = String(name || '').trim();
  if (!key) return;
  remoteAboutCache.delete(key);
  remoteConfigCache.delete(key);
}

// Config remote (murah, tapi tetap dipanggil tiap buka panel): cache juga.
function cachedRemoteConfig(name) {
  const now = Date.now();
  const hit = remoteConfigCache.get(name);
  if (hit && now - hit.ts < REMOTES_CACHE_TTL_MS) return hit.value; // bisa null (gagal)
  if (!hit || !hit.refreshing) {
    remoteConfigCache.set(name, { ...(hit || {}), refreshing: true });
    rc('config/get', { name })
      .then((cfg) => remoteConfigCache.set(name, { ts: Date.now(), value: cfg, refreshing: false }))
      .catch(() => remoteConfigCache.set(name, { ts: Date.now(), value: null, refreshing: false }));
  }
  return hit ? hit.value : null;
}

// Kapasitas remote: value = { ok:true, total, used, free, trashed, other }
// atau { ok:false, error }.
function cachedRemoteAbout(name) {
  const now = Date.now();
  const hit = remoteAboutCache.get(name);
  const hasValue = hit && hit.value;
  const ttl = hasValue && hit.value.ok === false ? REMOTES_ERROR_TTL_MS : REMOTES_CACHE_TTL_MS;
  if (hasValue && now - hit.ts < ttl) return hit.value;
  if (!hit || !hit.refreshing) {
    remoteAboutCache.set(name, { ts: hit ? hit.ts : 0, value: hasValue ? hit.value : null, refreshing: true });
    rc('operations/about', { fs: `${name}:` }, 15000)
      .then((a) => remoteAboutCache.set(name, {
        ts: Date.now(),
        value: { ok: true, total: a.total, used: a.used, free: a.free, trashed: a.trashed, other: a.other },
        refreshing: false,
      }))
      .catch((e) => remoteAboutCache.set(name, {
        ts: Date.now(),
        value: { ok: false, error: e.message },
        refreshing: false,
      }));
  }
  // Pakai nilai lama bila ada; kalau belum ada sama sekali, JANGAN kembalikan
  // undefined (itu bikin pemanggil melempar). Kembalikan objek status yang jujur.
  return hasValue ? hit.value : { ok: false, error: 'Data remote belum tersedia; coba lagi sebentar.' };
}

app.get('/api/remotes', authed, async (_req, res) => {
  try {
    const { remotes } = await rc('config/listremotes');
    const out = await Promise.all(
      (remotes || []).map(async (name) => {
        // Nama akun (email/user) ikut dikirim supaya setiap kartu remote
        // di UI selalu bisa menampilkan pemiliknya, bukan cuma remote utama.
        let account = null;
        try {
          const cfg = cachedRemoteConfig(name);
          if (cfg && Object.keys(cfg).length) account = await resolveAccount(name, cfg);
        } catch {
          /* config tak terbaca: account tetap null */
        }
        const a = cachedRemoteAbout(name);
        if (a.ok) {
          return { name, ok: true, total: a.total, used: a.used, free: a.free, trashed: a.trashed, other: a.other, account };
        }
        return { name, ok: false, error: a.error, account };
      }),
    );
    res.json({ remotes: out });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Hubungkan Akun: platform & koneksi remote -------------------------
// Daftar platform + status koneksinya (remote default sudah terpasang & valid).
app.get('/api/platforms', authed, async (_req, res) => {
  try {
    res.json({ platforms: await listPlatforms(rc) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Sambungkan akun: mode form (MEGA, pakai kredensial) atau mode OAuth.
app.post('/api/platforms/connect', adminOnly, async (req, res) => {
  const { id, name, user, pass } = req.body || {};
  const platform = PLATFORMS.find((p) => p.id === id);
  if (!platform) return res.status(400).json({ error: 'Platform tidak dikenal.', code: 'bad_request' });
  const remoteName = name ? String(name).trim() : platform.id;
  try {
    if (platform.auth === 'form') {
      const out = await connectForm({ rc, platform, remoteName, user, pass });
      // Selalu buang cache remote: connectForm bisa membuat config lalu
      // menghapusnya (kredensial salah) — cache lama harus hilang.
      invalidateRemoteCache(remoteName);
      audit(req, 'connect', `platform=${id} remote=${remoteName}`, out.status < 400);
      return res.status(out.status).json(out.body);
    }
    const out = await startOAuth({
      rc,
      platform,
      remoteName,
      // Dipanggil saat config remote benar-benar tersimpan (atau dihapus) —
      // itu titik saat cache kapasitas/akun jadi basi.
      onRemoteSaved: (name) => invalidateRemoteCache(name),
    });
    invalidateRemoteCache(remoteName);
    // OAuth belum selesai di sini; cache tetap dibuang agar saat token jadi
    // data lama tidak tampil. aman: nama remote sama.
    if (out.status < 400) invalidateRemoteCache(remoteName);
    audit(req, 'connect', `platform=${id} remote=${remoteName} (oauth)`, out.status < 400);
    return res.status(out.status).json(out.body);
  } catch (e) {
    audit(req, 'connect', `platform=${id}`, false);
    res.status(500).json({ error: e.message });
  }
});

// Pantau status proses OAuth yang sedang berjalan (hanya admin: berisi authUrl admin).
app.get('/api/platforms/oauth/:processId', adminOnly, (req, res) => {
  const out = getOAuthStatus(req.params.processId);
  res.status(out.status).json(out.body);
});

// Putuskan remote dari rclone (gdrive dikecualikan).
app.post('/api/platforms/disconnect', adminOnly, async (req, res) => {
  const { remote } = req.body || {};
  try {
    const out = await disconnectRemote(rc, remote);
    if (out.status < 400) invalidateRemoteCache(remote);
    audit(req, 'disconnect', `remote=${remote}`, out.status < 400);
    res.status(out.status).json(out.body);
  } catch (e) {
    audit(req, 'disconnect', `remote=${remote}`, false);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/files', authed, async (req, res) => {
  let fsName;
  let p;
  try {
    fsName = await assertRemoteFs(req.query.fs);
    p = assertSafeRemotePath(req.query.path);
  } catch (e) {
    return res.status(e.httpStatus || 500).json({ error: e.message });
  }
  const search = String(req.query.search || '').trim().toLowerCase();
  try {
    const data = await rc('operations/list', { fs: fsName, remote: p });
    // Pemilik ditampilkan di kolom "Pemilik". Diambil sekali per request
    // (bukan per berkas), lalu ditempelkan ke setiap item.
    let owner = null;
    try {
      const cfg = await rc('config/get', { name: fsName.replace(/:$/, '') });
      if (cfg && Object.keys(cfg).length) owner = await resolveAccount(fsName.replace(/:$/, ''), cfg);
    } catch {
      /* remote tanpa config terbaca: pemilik tetap null */
    }
    let items = (data.list || []).map((it) => ({
      name: it.Name,
      path: p ? `${p}/${it.Name}` : it.Name,
      dir: !!it.IsDir,
      size: it.Size || 0,
      modTime: it.ModTime,
      mime: it.MimeType || null,
      fs: fsName,
      email: owner,
    }));
    if (search) items = items.filter((it) => it.name.toLowerCase().includes(search));
    items.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
    res.json({ fs: fsName, path: p, items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/mkdir', adminOnly, async (req, res) => {
  const { fs: rawFs, path: rawPath } = req.body || {};
  let fsName;
  let p;
  try {
    fsName = await assertRemoteFs(rawFs);
    p = assertSafeRemotePath(rawPath);
    if (!p) throw Object.assign(new Error('fs dan path wajib'), { httpStatus: 400 });
  } catch (e) {
    return res.status(e.httpStatus || 500).json({ error: e.message });
  }
  try {
    await rc('operations/mkdir', { fs: fsName, remote: p });
    audit(req, 'mkdir', `${fsName}${p}`, true);
    res.json({ ok: true });
  } catch (e) {
    audit(req, 'mkdir', `${fsName}${p}`, false);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/rename', adminOnly, async (req, res) => {
  const { fs: rawFs, from: rawFrom, to: rawTo } = req.body || {};
  let fsName;
  let from;
  let to;
  try {
    fsName = await assertRemoteFs(rawFs);
    from = assertSafeRemotePath(rawFrom);
    to = assertSafeRemotePath(rawTo);
    if (!from || !to) throw Object.assign(new Error('fs, from, to wajib'), { httpStatus: 400 });
  } catch (e) {
    return res.status(e.httpStatus || 500).json({ error: e.message });
  }
  try {
    await rc('operations/movefile', { srcFs: fsName, srcRemote: from, dstFs: fsName, dstRemote: to });
    audit(req, 'rename', `${fsName}${from} -> ${to}`, true);
    res.json({ ok: true });
  } catch (e) {
    audit(req, 'rename', `${fsName}${from}`, false);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/delete', adminOnly, async (req, res) => {
  const { fs: rawFs, path: rawPath, dir } = req.body || {};
  let fsName;
  let p;
  try {
    fsName = await assertRemoteFs(rawFs);
    p = assertSafeRemotePath(rawPath);
    if (!p) throw Object.assign(new Error('fs dan path wajib'), { httpStatus: 400 });
  } catch (e) {
    return res.status(e.httpStatus || 500).json({ error: e.message });
  }
  try {
    if (dir) await rc('operations/purge', { fs: fsName, remote: p });
    else await rc('operations/deletefile', { fs: fsName, remote: p });
    audit(req, 'delete', `${fsName}${p}${dir ? ' (folder)' : ''}`, true);
    res.json({ ok: true });
  } catch (e) {
    audit(req, 'delete', `${fsName}${p}`, false);
    res.status(500).json({ error: e.message });
  }
});

// Streams the file straight from rclone's built-in web server (--rc-serve),
// so previews and downloads never pass through this process or touch disk.
app.get('/api/download', authed, async (req, res) => {
  let fsName;
  let p;
  try {
    fsName = await assertRemoteFs(req.query.fs);
    p = assertSafeRemotePath(req.query.path);
    if (!p) throw Object.assign(new Error('fs dan path wajib'), { httpStatus: 400 });
  } catch (e) {
    return res.status(e.httpStatus || 500).json({ error: e.message });
  }
  audit(req, 'download', `${fsName}${p}`, true);
  const name = path.basename(p).replace(/"/g, '');
  if (req.query.raw !== '1') {
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  }
  const encoded = p.split('/').map(encodeURIComponent).join('/');
  res.redirect(302, `${RC}/[${fsName}]/${encoded}`);
});

app.get('/api/jobs', authed, async (req, res) => {
  // Reconcile memutasi state (activeRuns/jobs.json) — hanya jalankan untuk admin;
  // viewer cukup membaca apa adanya (tidak boleh memicu tulis dari request baca).
  if (req.user?.role === 'admin') {
    await Promise.all(jobs.map((job) => reconcile(job)));
  }
  res.json({ jobs });
});

app.post('/api/jobs', adminOnly, async (req, res) => {
  const { name, source, dest } = req.body || {};
  if (!source || !dest) return res.status(400).json({ error: 'source dan dest wajib diisi', code: 'bad_request' });
  try {
    const problem = await destProblem(dest);
    if (problem) {
      return res.status(400).json({
        error: problem === 'form'
          ? 'Dest harus berbentuk remote, contoh: gdrive:Backup.'
          : 'Dest harus remote rclone terdaftar (contoh: gdrive:Backup).',
        code: 'bad_dest',
      });
    }
  } catch {
    return res.status(400).json({ error: 'Dest harus berbentuk remote, contoh: gdrive:Backup.', code: 'bad_dest' });
  }
  const job = {
    id: crypto.randomUUID(),
    name: name || path.basename(String(source).replace(/[\\/]+$/, '')) || 'Backup job',
    source: String(source),
    dest: String(dest),
    createdAt: new Date().toISOString(),
    lastRun: null,
  };
  jobs.push(job);
  saveJobs(jobs);
  audit(req, 'job_create', `nama=${job.name} tujuan=${job.dest}`, true);
  res.status(201).json({ job });
});

app.delete('/api/jobs/:id', adminOnly, (req, res) => {
  const before = jobs.length;
  const target = jobs.find((j) => j.id === req.params.id);
  jobs = jobs.filter((j) => j.id !== req.params.id);
  saveJobs(jobs);
  if (target) audit(req, 'job_delete', `nama=${target.name}`, true);
  res.json({ removed: before - jobs.length });
});

// Buat job mirror dari template gdrive ke remote baru. HANYA membuat job,
// tidak menjalankan. Dest yang sudah terdaftar dilewati.
app.post('/api/jobs/mirror', adminOnly, async (req, res) => {
  const remote = String((req.body || {}).remote || '').trim();
  if (!remote) {
    audit(req, 'job_mirror', 'gagal: remote kosong', false);
    return res.status(400).json({ error: 'remote wajib diisi.', code: 'bad_request' });
  }
  if (!isValidRemoteName(remote)) {
    audit(req, 'job_mirror', `gagal: nama remote tidak valid (${remote.slice(0, 80)})`, false);
    return res.status(400).json({ error: 'Nama remote tidak valid.', code: 'bad_request' });
  }
  const prefix = 'gdrive:';
  const templates = jobs.filter((j) => String(j.dest || '').toLowerCase().startsWith(prefix));
  const created = [];
  const skipped = [];
  const seen = new Set(jobs.map((j) => normDest(j.dest)));
  for (const t of templates) {
    const suffix = String(t.dest).slice(prefix.length);
    if (!suffix) continue;
    const dest = `${remote}:${suffix}`;
    const key = normDest(dest);
    if (seen.has(key)) {
      skipped.push(dest);
      continue;
    }
    // Hanya buat job kalau dest benar-benar remote terdaftar; selain itu skip.
    try {
      if (await destProblem(dest)) {
        skipped.push(dest);
        continue;
      }
    } catch {
      skipped.push(dest);
      continue;
    }
    const sep = String(t.name || '').indexOf(' - ');
    const branch = sep >= 0 ? String(t.name).slice(sep + 3) : String(t.name || suffix);
    const job = {
      id: crypto.randomUUID(),
      name: `Mirror ${remote} - ${branch}`,
      source: t.source,
      dest,
      createdAt: new Date().toISOString(),
      lastRun: null,
    };
    jobs.push(job);
    seen.add(key);
    created.push({ name: job.name, dest: job.dest });
  }
  if (created.length) saveJobs(jobs);
  // Aksi pembuatan massal harus terekam; detail ringkas (audit memotong 200 char).
  audit(req, 'job_mirror', `tujuan=${remote} dibuat=${created.length} dilewati=${skipped.length}`, true);
  res.json({ created, skipped });
});

app.post('/api/jobs/:id/run', adminOnly, async (req, res) => {
  const job = jobs.find((j) => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'job tidak ditemukan' });

  // Bersihkan status basi dulu, supaya job yang sudah mati tidak dikunci selamanya.
  await reconcile(job);

  // Kunci 1: job ini sendiri sedang jalan?
  const mine = activeRunFor(job.id);
  if (mine) {
    return res.status(409).json({
      error: 'Job ini sedang berjalan. Tunggu sampai selesai.',
      code: 'already_running',
      jobid: mine.jobid,
      startedAt: mine.startedAt,
    });
  }

  // Validasi ulang dest (jobs.json bisa diedit di disk): dest harus remote
  // terdaftar, bukan path lokal yang menulis ke disk server.
  try {
    if (await destProblem(job.dest)) {
      return res.status(400).json({ error: 'Dest job tidak valid / remote tidak terdaftar.', code: 'bad_dest' });
    }
  } catch {
    return res.status(400).json({ error: 'Dest job tidak valid / remote tidak terdaftar.', code: 'bad_dest' });
  }

  // Kunci 2: job LAIN yang menulis ke tujuan sama sedang jalan?
  // Ini penyebab duplikat 7,4 GB: dua sync paralel ke tujuan yang sama.
  const clash = activeRunOnDest(job.dest);
  if (clash) {
    const other = jobs.find((j) => j.id === clash.jobId);
    return res.status(409).json({
      error: `Tujuan "${job.dest}" sedang dipakai job "${other?.name || clash.jobId}". Tunggu sampai selesai.`,
      code: 'dest_busy',
      conflictJobId: clash.jobId,
      conflictJobName: other?.name || null,
      jobid: clash.jobid,
    });
  }

  // Ambil kunci SEBELUM await, supaya dua permintaan beruntun tidak lolos bersamaan.
  // executeId ikut disimpan sedini mungkin: itu identitas proses rclone yang
  // dipakai reconcile untuk mendeteksi jobid yang dipakai ulang proses lain.
  const token = { jobid: null, executeId: null, dest: job.dest, startedAt: new Date().toISOString() };
  activeRuns.set(job.id, token);

  try {
    const r = await rc('sync/copy', { srcFs: job.source, dstFs: job.dest, _async: 'true' });
    token.jobid = r.jobid;
    token.executeId = r.executeId || null;
    // executeId = UUID proses rclone; dipakai reconcile untuk mendeteksi jobid
    // yang dipakai ulang job lain (jobid rclone reset dari 1 tiap restart).
    job.lastRun = { startedAt: token.startedAt, jobid: r.jobid, executeId: r.executeId || null, status: 'running', error: null };
    saveJobs(jobs);
    audit(req, 'job_run', `nama=${job.name} tujuan=${job.dest}`, true);
    res.json({ job, jobid: r.jobid });
  } catch (e) {
    releaseRun(job.id); // gagal start: jangan tahan kunci
    // lastRun gagal start juga memuat executeId (kalau rclone sempat menjawab),
    // supaya reconcile tidak salah menganggap jobid milik job lain.
    job.lastRun = { startedAt: token.startedAt, jobid: null, executeId: token.executeId, status: 'failed', error: e.message };
    saveJobs(jobs);
    res.status(500).json({ error: e.message, job });
  }
});

// Hentikan job yang sedang jalan. Tanpa ini, satu-satunya cara stop adalah
// memanggil rclone RC langsung.
app.post('/api/jobs/:id/stop', adminOnly, async (req, res) => {
  const job = jobs.find((j) => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'job tidak ditemukan' });
  const run = activeRunFor(job.id);
  const jobid = run?.jobid ?? job.lastRun?.jobid;
  if (jobid == null) return res.status(400).json({ error: 'Job ini tidak sedang berjalan.' });
  try {
    await rc('job/stop', { jobid });
  } catch (e) {
    // Gagal menghentikan: cek dulu apakah job benar-benar sudah berhenti sendiri.
    // Kalau masih hidup (atau status tak bisa dipastikan), JANGAN lepas kunci —
    // melepasnya bisa membuka dua job menulis ke dest yang sama (risiko duplikat).
    let stillAlive = true;
    try {
      const st = await rc('job/status', { jobid });
      stillAlive = !st.finished;
    } catch {
      stillAlive = true; // ragu = anggap masih hidup (fail-closed)
    }
    if (stillAlive) {
      audit(req, 'job_stop', `nama=${job.name} (gagal dihentikan)`, false);
      return res.status(502).json({ error: 'Gagal menghentikan job di rclone; kunci dipertahankan. Coba lagi.' });
    }
  }
  releaseRun(job.id);
  job.lastRun = { ...(job.lastRun || {}), status: 'stopped', finishedAt: new Date().toISOString() };
  saveJobs(jobs);
  audit(req, 'job_stop', `nama=${job.name}`, true);
  res.json({ ok: true, job });
});

app.get('/api/jobs/:id/progress', authed, async (req, res) => {
  const isAdmin = req.user?.role === 'admin';
  let job = jobs.find((j) => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'job tidak ditemukan' });
  if (!job.lastRun || job.lastRun.jobid == null) return res.json({ job, progress: null });
  // Sama seperti GET /api/jobs: reconcile memutasi state, jadi hanya admin yang
  // menjalankannya. Viewer cukup membaca apa adanya.
  if (isAdmin) {
    // Selaraskan kunci/status dulu (rehidrasi kunci hilang, lepas kunci palsu yang
    // jobid-nya sudah dipakai ulang job lain), lalu ambil job versi segar.
    await reconcile(job);
    job = jobs.find((j) => j.id === req.params.id) || job;
    if (!job.lastRun || job.lastRun.jobid == null) return res.json({ job, progress: null });
  } else if (job.lastRun.executeId == null) {
    // Tanpa executeId, jobid tak bisa dibuktikan milik job ini (lihat reconcile).
    return res.json({ job, progress: null });
  }
  // Jobid sudah dipakai ulang job lain (kunci palsu dilepas reconcile): jangan
  // baca status jobid itu — akan melaporkan progres job yang tak terkait.
  if (job.lastRun.status === 'interrupted') return res.json({ job, progress: null });
  try {
    const st = await rc('job/status', { jobid: job.lastRun.jobid });
    // core/stats lewat cache latar belakang: request baca tak menunggu RC.
    const stats = cachedRcStats();
    if (st.finished && isAdmin) {
      job.lastRun.status = st.success ? 'done' : 'failed';
      job.lastRun.error = st.error || null;
      job.lastRun.finishedAt = new Date().toISOString();
      releaseRun(job.id); // lepaskan kunci anti-dobel
      saveJobs(jobs);
    }
    res.json({ job, progress: { ...st, stats } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Progres transfer LocalSend live (view #transfer) --------------------
// Ruang kosong tujuan di-cache: `operations/about` lambat (1,5-6 detik per
// remote), jadi TIDAK boleh dipanggil tiap polling (UI poll tiap 2 detik).
// Refresh berjalan di latar belakang; respons selalu memakai cache lama/null
// supaya endpoint tak pernah memblokir.
const DEST_FREE_TTL_MS = 60 * 1000;
let destFreeCache = { dest: null, ts: 0, value: null, refreshing: false };

function cachedDestFree(dest) {
  if (!dest) return null;
  const now = Date.now();
  if (destFreeCache.dest === dest && now - destFreeCache.ts < DEST_FREE_TTL_MS) {
    return destFreeCache.value;
  }
  if (!destFreeCache.refreshing) {
    destFreeCache.refreshing = true;
    rc('operations/about', { fs: dest }, 10000)
      .then((a) => {
        destFreeCache = { dest, ts: Date.now(), value: a?.free ?? null, refreshing: false };
      })
      .catch(() => {
        destFreeCache.refreshing = false;
      });
  }
  return destFreeCache.dest === dest ? destFreeCache.value : null;
}

// Ringkasan kecepatan rclone (`core/stats`) juga di-cache di latar belakang.
// Panggilan ini murni in-memory dan cepat, tapi tetap TIDAK di-await di jalur
// request supaya endpoint dijamin cepat walau daemon rclone sedang tersendat
// (permintaan yang menggantung tidak boleh menumpuk tiap 2 detik).
let rcStatsCache = { ts: 0, value: null, refreshing: false };
function cachedRcStats() {
  const now = Date.now();
  if (rcStatsCache.value && now - rcStatsCache.ts < 1500) return rcStatsCache.value;
  if (!rcStatsCache.refreshing) {
    rcStatsCache.refreshing = true;
    rc('core/stats', {}, 5000)
      .then((s) => {
        rcStatsCache = { ts: Date.now(), value: s, refreshing: false };
      })
      .catch(() => {
        rcStatsCache.refreshing = false;
      });
  }
  return rcStatsCache.value;
}

app.get('/api/phone/status', adminOnly, async (_req, res) => {
  try {
    const st = getTransferState();
    const live = {
      phase: st.phase,
      dest: st.dest,
      totalFiles: st.totalFiles,
      totalBytes: st.totalBytes,
      receivedFiles: st.receivedFiles,
      receivedBytes: st.receivedBytes,
      pushedFiles: st.pushedFiles,
      failedFiles: st.failedFiles,
      currentFile: st.currentFile,
      startedAt: st.startedAt,
      finishedAt: st.finishedAt,
      sender: st.sender,
      rclone: null,
    };
    // Hanya saat fase mendorong ke cloud kita baca core/stats (via cache latar
    // belakang supaya request tak pernah menunggu RC).
    if (st.phase === 'pushing') {
      const stats = cachedRcStats();
      if (stats && typeof stats === 'object') {
        const xfer = Array.isArray(stats.transferring) ? stats.transferring : [];
        live.rclone = {
          // Fase 'pushing' = sesi sedang menulis ke cloud. `transferring[]` rclone
          // sering KOSONG di jeda antar-file (stat + poll job), jadi jangan dipakai
          // sebagai penanda aktif tunggal.
          active: true,
          transferring: xfer.length,
          speed: stats.speed || 0,
          eta: Number.isFinite(stats.eta) ? Math.round(stats.eta) : null,
          errors: stats.errors || 0,
        };
      }
    }
    res.json({ live, history: st.history, destFree: cachedDestFree(st.dest) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Backup dari HP: upload chunked dari browser -> staging lokal -> remote cloud.
mountPhoneUpload(app, {
  rc,
  adminOnly,
  audit,
  isValidRemote: (name) => /^[A-Za-z0-9._-]+$/.test(name),
});

// Receiver LocalSend: HP kirim foto/video langsung ke server ini (1 hop),
// lalu file otomatis didorong ke remote lewat rclone.
startLocalSend({
  rc,
  audit: (action, detail, ok, ip) => audit(
    { headers: {}, socket: { remoteAddress: ip }, ip },
    action,
    detail,
    ok,
    'localsend',
  ),
});

const dist = path.join(__dirname, '..', 'web', 'dist');
if (fs.existsSync(dist)) {
  // index.html mentah di-cache; invalidasi saat mtime berubah (rebuild Vite).
  let indexHtmlCache = { mtimeMs: -1, html: null };
  function loadIndexHtml() {
    const p = path.join(dist, 'index.html');
    const { mtimeMs } = fs.statSync(p);
    if (indexHtmlCache.html === null || indexHtmlCache.mtimeMs !== mtimeMs) {
      // ganti penanda nonce dengan nilai per-request nanti; simpan bertanda dulu.
      indexHtmlCache = { mtimeMs, html: fs.readFileSync(p, 'utf8') };
    }
    return indexHtmlCache.html;
  }

  // index: false -> '/' TIDAK dilayani static; jatuh ke handler di bawah
  // supaya nonce CSP ikut disuntik ke script inline.
  // '/index.html' juga harus lewat handler itu: kalau dilayani static, file
  // mentah berisi placeholder __CSP_NONCE__ bocor ke klien. Kita tendang
  // langsung (bukan mengubah req.url) karena membandingkan path setelah static
  // tidak andal untuk request yang eksplisit menuju file.
  app.get('/index.html', (_req, res) => res.redirect(308, '/'));
  app.use(express.static(dist, { index: false }));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    // Aset yang hilang harus 404, bukan HTML SPA (bikin error MIME di browser).
    if (req.path.startsWith('/assets/')) return next();
    // Suntikkan nonce CSP ke script inline (placeholder dari web/index.html)
    // sebelum dikirim. Script eksternal (type="module" src=...) tak perlu nonce.
    try {
      const html = loadIndexHtml().replaceAll(CSP_NONCE_PLACEHOLDER, res.locals.cspNonce || '');
      res.type('html').send(html);
    } catch (e) {
      next(e);
    }
  });
  // Fallback terakhir: path yang tak-serving (mis. aset hilang) -> 404, bukan
  // menggantung tanpa respons.
  app.use((_req, res) => res.status(404).end());
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`omni-buddy server on http://127.0.0.1:${PORT} (rclone rc: ${RC})`);
});
