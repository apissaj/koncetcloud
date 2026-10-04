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

async function rc(method, params = {}) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    body.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const res = await fetch(`${RC}/${method}`, { method: 'POST', body });
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
  if (!job.lastRun || job.lastRun.status !== 'running') return;
  const lock = activeRunFor(job.id);
  const jobid = lock?.jobid ?? job.lastRun.jobid;
  if (jobid == null) {
    if (lock) releaseRun(job.id);
    job.lastRun.status = 'interrupted';
    saveJobs(jobs);
    return;
  }
  try {
    const st = await rc('job/status', { jobid });
    if (st.finished) {
      releaseRun(job.id);
      job.lastRun.status = st.success ? 'done' : 'failed';
      job.lastRun.error = st.error || job.lastRun.error;
      job.lastRun.finishedAt = new Date().toISOString();
      saveJobs(jobs);
    }
  } catch {
    // rclone sudah tidak mengenal jobid ini (proses sebelumnya mati)
    releaseRun(job.id);
    job.lastRun.status = 'interrupted';
    job.lastRun.error = job.lastRun.error || 'Job berhenti tanpa terpantau (rclone tidak mengenali jobid).';
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
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.ip || req.socket?.remoteAddress || 'unknown';
}

/** Catat aksi ke audit. detail maksimum ~200 karakter; jangan pernah password. */
function audit(req, action, detail = null, ok = true, userOverride = null) {
  try {
    fs.mkdirSync(AUDIT_DIR, { recursive: true });
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      user: userOverride || req?.user?.username || null,
      action,
      detail: detail ? String(detail).slice(0, 200) : null,
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

// Di belakang Cloudflare Tunnel: IP asli klien datang lewat header.
app.set('trust proxy', true);

// Header keamanan dasar untuk semua respons.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

// --- Sesi ---
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
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

  loginLimiter.reset(uname);
  const token = issueToken(auth.record.secret, user);
  const secure = isSecureRequest(req);
  res.setHeader('Set-Cookie', sessionCookie(token, { secure }));
  audit(req, 'login', `username=${uname}`, true, user.username);
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
  res.json({ username: req.user.username, role: req.user.role });
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
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
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
  entries = entries.slice(0, limit);
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

app.get('/api/remotes', authed, async (_req, res) => {
  try {
    const { remotes } = await rc('config/listremotes');
    const out = await Promise.all(
      (remotes || []).map(async (name) => {
        // Nama akun (email/user) ikut dikirim supaya setiap kartu remote
        // di UI selalu bisa menampilkan pemiliknya, bukan cuma remote utama.
        let account = null;
        try {
          const cfg = await rc('config/get', { name });
          if (cfg && Object.keys(cfg).length) account = await resolveAccount(name, cfg);
        } catch {
          /* config tak terbaca: account tetap null */
        }
        try {
          const a = await rc('operations/about', { fs: `${name}:` });
          return { name, ok: true, total: a.total, used: a.used, free: a.free, trashed: a.trashed, other: a.other, account };
        } catch (e) {
          return { name, ok: false, error: e.message, account };
        }
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
      audit(req, 'connect', `platform=${id} remote=${remoteName}`, out.status < 400);
      return res.status(out.status).json(out.body);
    }
    const out = await startOAuth({ rc, platform, remoteName });
    audit(req, 'connect', `platform=${id} remote=${remoteName} (oauth)`, out.status < 400);
    return res.status(out.status).json(out.body);
  } catch (e) {
    audit(req, 'connect', `platform=${id}`, false);
    res.status(500).json({ error: e.message });
  }
});

// Pantau status proses OAuth yang sedang berjalan.
app.get('/api/platforms/oauth/:processId', authed, (req, res) => {
  const out = getOAuthStatus(req.params.processId);
  res.status(out.status).json(out.body);
});

// Putuskan remote dari rclone (gdrive dikecualikan).
app.post('/api/platforms/disconnect', adminOnly, async (req, res) => {
  const { remote } = req.body || {};
  try {
    const out = await disconnectRemote(rc, remote);
    audit(req, 'disconnect', `remote=${remote}`, out.status < 400);
    res.status(out.status).json(out.body);
  } catch (e) {
    audit(req, 'disconnect', `remote=${remote}`, false);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/files', authed, async (req, res) => {
  const fsName = String(req.query.fs || '');
  const p = String(req.query.path || '');
  const search = String(req.query.search || '').trim().toLowerCase();
  if (!fsName) return res.status(400).json({ error: 'fs wajib diisi' });
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
  const { fs: fsName, path: p } = req.body || {};
  if (!fsName || !p) return res.status(400).json({ error: 'fs dan path wajib' });
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
  const { fs: fsName, from, to } = req.body || {};
  if (!fsName || !from || !to) return res.status(400).json({ error: 'fs, from, to wajib' });
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
  const { fs: fsName, path: p, dir } = req.body || {};
  if (!fsName || !p) return res.status(400).json({ error: 'fs dan path wajib' });
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
app.get('/api/download', authed, (req, res) => {
  const fsName = String(req.query.fs || '');
  const p = String(req.query.path || '');
  if (!fsName || !p) return res.status(400).json({ error: 'fs dan path wajib' });
  audit(req, 'download', `${fsName}${p}`, true);
  const name = path.basename(p).replace(/"/g, '');
  if (req.query.raw !== '1') {
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  }
  const encoded = p.split('/').map(encodeURIComponent).join('/');
  res.redirect(302, `${RC}/[${fsName}]/${encoded}`);
});

app.get('/api/jobs', authed, async (_req, res) => {
  await Promise.all(jobs.map((job) => reconcile(job)));
  res.json({ jobs });
});

app.post('/api/jobs', adminOnly, (req, res) => {
  const { name, source, dest } = req.body || {};
  if (!source || !dest) return res.status(400).json({ error: 'source dan dest wajib diisi' });
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
app.post('/api/jobs/mirror', adminOnly, (req, res) => {
  const remote = String((req.body || {}).remote || '').trim();
  if (!remote) return res.status(400).json({ error: 'remote wajib diisi.', code: 'bad_request' });
  if (!isValidRemoteName(remote)) {
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
  const token = { jobid: null, dest: job.dest, startedAt: new Date().toISOString() };
  activeRuns.set(job.id, token);

  try {
    const r = await rc('sync/copy', { srcFs: job.source, dstFs: job.dest, _async: 'true' });
    token.jobid = r.jobid;
    job.lastRun = { startedAt: token.startedAt, jobid: r.jobid, status: 'running', error: null };
    saveJobs(jobs);
    audit(req, 'job_run', `nama=${job.name} tujuan=${job.dest}`, true);
    res.json({ job, jobid: r.jobid });
  } catch (e) {
    releaseRun(job.id); // gagal start: jangan tahan kunci
    job.lastRun = { startedAt: token.startedAt, jobid: null, status: 'failed', error: e.message };
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
    // Job bisa sudah selesai sendiri; tetap lepaskan kunci.
  }
  releaseRun(job.id);
  job.lastRun = { ...(job.lastRun || {}), status: 'stopped', finishedAt: new Date().toISOString() };
  saveJobs(jobs);
  audit(req, 'job_stop', `nama=${job.name}`, true);
  res.json({ ok: true, job });
});

app.get('/api/jobs/:id/progress', authed, async (req, res) => {
  const job = jobs.find((j) => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'job tidak ditemukan' });
  if (!job.lastRun || job.lastRun.jobid == null) return res.json({ job, progress: null });
  // Kunci hilang karena restart server? Pulihkan dari status job rclone yang
  // ternyata masih hidup, supaya job ini tetap kebal dari dobel.
  if (!activeRunFor(job.id)) {
    try {
      const check = await rc('job/status', { jobid: job.lastRun.jobid });
      if (!check.finished) activeRuns.set(job.id, { jobid: job.lastRun.jobid, dest: job.dest, startedAt: job.lastRun.startedAt });
    } catch {
      /* job sudah tidak ada di rclone */
    }
  }
  try {
    const st = await rc('job/status', { jobid: job.lastRun.jobid });
    let stats = null;
    try {
      stats = await rc('core/stats');
    } catch {
      stats = null;
    }
    if (st.finished) {
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

const dist = path.join(__dirname, '..', 'web', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`omni-buddy server on http://127.0.0.1:${PORT} (rclone rc: ${RC})`);
});
