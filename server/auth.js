// Autentikasi KoncetCloud: banyak pengguna (admin/viewer), sesi ber-tanda-tangan HMAC.
// Tanpa dependensi luar: hanya node:crypto. Password/hash/token tidak pernah
// ditulis ke stdout atau log.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, 'auth.json');
const PASSWORD_FILE = path.join(__dirname, '.password.txt');

export const SESSION_COOKIE = 'kc_session';
const TTL_MS = 1000 * 60 * 60 * 12;           // default: 12 jam
export const TTL_REMEMBER_MS = 1000 * 60 * 60 * 24 * 14;  // "tetap masuk": 14 hari
export 
const ROLES = ['admin', 'viewer'];

function scrypt(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

function makeRecord(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: scrypt(password, salt) };
}

export function verifyPassword(password, rec) {
  if (!rec?.salt || !rec?.hash) return false;
  const got = crypto.scryptSync(String(password), rec.salt, 64);
  const want = Buffer.from(rec.hash, 'hex');
  if (got.length !== want.length) return false;
  return crypto.timingSafeEqual(got, want);
}

// --- TOTP RFC 6238 (HMAC-SHA1, 6 digit, periode 30 detik) -------------------
const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) continue; // karakter tidak sah di-skip
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secretBuf, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretBuf).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return code % 10 ** 6;
}

/** Kode TOTP untuk waktu tertentu (default: sekarang). */
export function totpAt(secretBase32, timeMs = Date.now()) {
  const counter = Math.floor(timeMs / 1000 / 30);
  return String(hotp(base32Decode(secretBase32), counter)).padStart(6, '0');
}

/** Verifikasi kode dengan jendela ±1 periode (toleransi jam miring). */
export function verifyTotp(secretBase32, code) {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length !== 6) return false;
  const now = Date.now();
  for (const delta of [-1, 0, 1]) {
    if (totpAt(secretBase32, now + delta * 30000) === c) return true;
  }
  return false;
}

export function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20)); // 160 bit, saran Google
}

export function otpauthUri(username, secretBase32) {
  return `otpauth://totp/KoncetCloud:${encodeURIComponent(username)}?secret=${secretBase32}&issuer=KoncetCloud&algorithm=SHA1&digits=6&period=30`;
}

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(str) {
  return Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

// --- Sesi: payload memuat identitas pengguna, bukan cuma masa berlaku ------
export function issueToken(secret, user, ttlMs = TTL_MS, extra = {}) {
  const payload = b64url(
    Buffer.from(JSON.stringify({ u: user.username, r: user.role, exp: Date.now() + ttlMs, ...extra })),
  );
  const sig = b64url(crypto.createHmac('sha256', secret).update(payload).digest());
  return `${payload}.${sig}`;
}


/** Mengembalikan {u, r} bila token sah, atau null. */
export function verifyToken(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = b64url(crypto.createHmac('sha256', secret).update(payload).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(fromB64url(payload).toString('utf8'));
    if (typeof data.exp !== 'number' || Date.now() >= data.exp) return null;
    if (typeof data.u !== 'string' || !data.u) return null;
    return { u: data.u, r: data.r === 'admin' ? 'admin' : 'viewer', pending: data.p === '2fa' };
  } catch {
    return null;
  }
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function randomPassword() {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const pick = (n) => Array.from(crypto.randomBytes(n), (b) => alphabet[b % alphabet.length]).join('');
  return `${pick(5)}-${pick(5)}-${pick(5)}`;
}

// --- Muat / simpan berkas auth ---------------------------------------------
function readRaw() {
  try {
    return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeRaw(data) {
  fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function publicUser(u) {
  return {
    username: u.username,
    role: u.role,
    createdAt: u.createdAt || null,
    disabled: !!u.disabled,
    totpEnabled: !!u.totpEnabled,
  };
}

/**
 * Muat auth.json dan migrasikan bentuk lama (satu password di root) ke daftar
 * pengguna. Salt+hash dipindah utuh, jadi password yang sudah berlaku tetap
 * bisa dipakai login sebagai "admin".
 */
function migrateOrCreate(raw) {
  if (raw && Array.isArray(raw.users) && raw.users.length) {
    return { data: { secret: raw.secret, users: raw.users, createdAt: raw.createdAt }, created: false, migrated: false };
  }
  if (raw && raw.secret && raw.salt && raw.hash) {
    const data = {
      secret: raw.secret,
      users: [
        {
          username: 'admin',
          salt: raw.salt,
          hash: raw.hash,
          role: 'admin',
          createdAt: raw.createdAt || new Date().toISOString(),
          disabled: false,
        },
      ],
      createdAt: raw.createdAt || new Date().toISOString(),
    };
    writeRaw(data);
    return { data, created: false, migrated: true };
  }

  const password = randomPassword();
  const rec = makeRecord(password);
  const data = {
    secret: crypto.randomBytes(32).toString('hex'),
    users: [
      { username: 'admin', ...rec, role: 'admin', createdAt: new Date().toISOString(), disabled: false },
    ],
    createdAt: new Date().toISOString(),
  };
  writeRaw(data);
  fs.writeFileSync(
    PASSWORD_FILE,
    `Password KoncetCloud (pengguna: admin)\n${password}\n\nUbah kapan saja:\nnode D:/omni-buddy/server/set-password.js\n`,
    { mode: 0o600 },
  );
  return { data, created: true, migrated: false };
}

/**
 * Baca auth.json (migrasi bila perlu) dan kembalikan state aplikasi.
 * Bentuk: { secret, users, createdAt }.
 */
export function ensureAuth() {
  const raw = readRaw();
  const { data, created, migrated } = migrateOrCreate(raw);
  return { record: data, created, migrated, passwordFile: created ? PASSWORD_FILE : null };
}

export function findUser(record, username) {
  const name = String(username || '').trim().toLowerCase();
  if (!name) return null;
  return (record.users || []).find((u) => String(u.username).toLowerCase() === name) || null;
}

export function listUsers(record) {
  return (record.users || []).map(publicUser);
}

export function verifyUserPassword(record, username, password) {
  const u = findUser(record, username);
  if (!u || u.disabled) return null;
  return verifyPassword(password, u) ? u : null;
}

export function isValidUsername(name) {
  // Mengizinkan bentuk email (mengandung @) sebagai username.
  return /^[A-Za-z0-9._@-]{3,64}$/.test(String(name || ''));
}

export function createUser(record, username, password, role) {
  const name = String(username || '').trim();
  if (!isValidUsername(name)) return { error: 'Username 3-64 karakter: huruf, angka, titik, @, _ atau -.' };
  if (String(password || '').length < 8) return { error: 'Password minimal 8 karakter.' };
  if (!ROLES.includes(role)) return { error: 'Role harus admin atau viewer.' };
  if (findUser(record, name)) return { error: 'Username sudah dipakai.', code: 'already_exists' };
  const user = { username: name, ...makeRecord(password), role, createdAt: new Date().toISOString(), disabled: false };
  record.users.push(user);
  writeRaw(record);
  return { user: publicUser(user) };
}

export function deleteUser(record, username) {
  const u = findUser(record, username);
  if (!u) return { error: 'Pengguna tidak ditemukan.', code: 'not_found' };
  if (u.role === 'admin' && (record.users.filter((x) => x.role === 'admin').length <= 1)) {
    return { error: 'Admin terakhir tidak dapat dihapus.', code: 'protected' };
  }
  record.users = record.users.filter((x) => x !== u);
  writeRaw(record);
  return { ok: true };
}

/**
 * Ganti password. `rotateSecret` = true hanya saat pemilik akun mengganti
 * password sendiri (semua sesi lama langsung tidak sah).
 */
export function changePassword(record, username, nextPassword, { rotateSecret = false } = {}) {
  const u = findUser(record, username);
  if (!u) return { error: 'Pengguna tidak ditemukan.', code: 'not_found' };
  if (String(nextPassword || '').length < 8) return { error: 'Password baru minimal 8 karakter.' };
  Object.assign(u, makeRecord(nextPassword));
  if (rotateSecret) record.secret = crypto.randomBytes(32).toString('hex');
  writeRaw(record);
  // Berkas .password.txt adalah catatan milik pemilik. Saat password admin
  // diganti, TULIS ULANG dengan password baru supaya catatan selalu akurat
  // (sebelumnya dihapus, dan pemilik jadi kehilangan catatannya).
  if (u.role === 'admin' && record.users.filter((x) => x.role === 'admin').length === 1) {
    try {
      fs.writeFileSync(
        PASSWORD_FILE,
        `Password KoncetCloud (pengguna: ${u.username})\n${String(nextPassword)}\n\nUbah lewat UI: Akun -> Kelola pengguna -> Ganti password\n`,
        { mode: 0o600 },
      );
    } catch {
      /* gagal menulis catatan tidak boleh menjatuhkan perubahan password */
    }
  }
  return { ok: true };
}

// --- 2FA: aktifkan / matikan ------------------------------------------------
/** Buat secret baru (belum aktif) untuk ditampilkan sebagai QR/teks. */
export function startTotpSetup(record, username) {
  const u = findUser(record, username);
  if (!u) return { error: 'Pengguna tidak ditemukan.', code: 'not_found' };
  u.totpPending = generateTotpSecret();
  writeRaw(record);
  return { secret: u.totpPending, uri: otpauthUri(u.username, u.totpPending) };
}

/** Aktifkan 2FA setelah pengguna membuktikan kode dari aplikasi autentikator. */
export function enableTotp(record, username, code) {
  const u = findUser(record, username);
  if (!u) return { error: 'Pengguna tidak ditemukan.', code: 'not_found' };
  const secret = u.totpPending || u.totpSecret;
  if (!secret) return { error: 'Mulai penyiapan 2FA dulu.', code: 'bad_request' };
  if (!verifyTotp(secret, code)) return { error: 'Kode tidak cocok. Coba lagi.', code: 'bad_credentials' };
  u.totpSecret = secret;
  u.totpEnabled = true;
  u.totpPending = null;
  writeRaw(record);
  return { ok: true };
}

/** Matikan 2FA. Wajib membuktikan kode (kalau aktif) atau password (dicek pemanggil). */
export function disableTotp(record, username, code) {
  const u = findUser(record, username);
  if (!u) return { error: 'Pengguna tidak ditemukan.', code: 'not_found' };
  if (u.totpEnabled && !verifyTotp(u.totpSecret, code)) {
    return { error: 'Kode tidak cocok. Coba lagi.', code: 'bad_credentials' };
  }
  u.totpSecret = null;
  u.totpEnabled = false;
  u.totpPending = null;
  writeRaw(record);
  return { ok: true };
}

export function verifyUserTotp(record, username, code) {
  const u = findUser(record, username);
  if (!u || !u.totpEnabled) return true; // 2FA nonaktif: tidak perlu kode
  return verifyTotp(u.totpSecret, code);
}

// --- Middleware -------------------------------------------------------------
function currentUser(req, record) {
  const token = parseCookies(req.headers.cookie || '')[SESSION_COOKIE];
  const claims = verifyToken(token, record.secret);
  if (!claims) return null;
  const u = findUser(record, claims.u);
  if (!u || u.disabled) return null;
  return u;
}

export function requireAuth(record) {
  return (req, res, next) => {
    const u = currentUser(req, record);
    if (!u) return res.status(401).json({ error: 'Perlu masuk dulu.', code: 'unauthorized' });
    req.user = publicUser(u);
    next();
  };
}

export function requireAdmin(record) {
  return (req, res, next) => {
    const u = currentUser(req, record);
    if (!u) return res.status(401).json({ error: 'Perlu masuk dulu.', code: 'unauthorized' });
    req.user = publicUser(u);
    if (u.role !== 'admin') {
      return res.status(403).json({ error: 'Akses hanya untuk admin.', code: 'forbidden' });
    }
    next();
  };
}

/** Info pengguna dari cookie, tanpa menolak permintaan (dipakai /api/session). */
export function sessionUser(req, record) {
  const u = currentUser(req, record);
  return u ? publicUser(u) : null;
}

// --- Pembatasan percobaan login, dihitung per username ----------------------
export function makeLoginLimiter({ windowMs = 15 * 60 * 1000, max = 10 } = {}) {
  const hits = new Map();
  const key = (username) => String(username || '').trim().toLowerCase() || '(kosong)';
  return {
    check(username) {
      const k = key(username);
      const now = Date.now();
      let rec = hits.get(k);
      if (!rec || now > rec.reset) rec = { count: 0, reset: now + windowMs };
      hits.set(k, rec);
      return { blocked: rec.count >= max, retryAfter: Math.max(1, Math.ceil((rec.reset - now) / 1000)) };
    },
    fail(username) {
      const k = key(username);
      const now = Date.now();
      let rec = hits.get(k);
      if (!rec || now > rec.reset) rec = { count: 0, reset: now + windowMs };
      rec.count += 1;
      hits.set(k, rec);
      if (hits.size > 5000) {
        for (const [kk, v] of hits) if (now > v.reset) hits.delete(kk);
      }
    },
    reset(username) {
      hits.delete(key(username));
    },
  };
}

export function isSecureRequest(req) {
  if (req.secure) return true;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return proto === 'https';
}

export function sessionCookie(token, { secure = false, maxAge = TTL_MS / 1000 } = {}) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAge)}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
