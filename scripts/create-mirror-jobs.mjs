#!/usr/bin/env node
// Buat job mirror ke remote baru, kalau belum ada.
// Jalankan SETELAH menambah remote via add-remote.bat:
//   node D:/omni-buddy/scripts/create-mirror-jobs.mjs
//
// Hanya membuat job — TIDAK menjalankannya. Jalankan lewat UI KoncetCloud
// (#backup) supaya guard anti-dobel aktif.
import fs from 'node:fs';

const BASE = process.env.KC_BASE || 'http://127.0.0.1:5599';
const SOURCES = [
  { dir: 'D:/HP IP15', sub: 'Backup iPhone/HP IP15', name: 'HP IP15' },
  { dir: 'D:/Video Iphone', sub: 'Backup iPhone/Video Iphone', name: 'Video Iphone' },
  { dir: 'D:/video', sub: 'Backup iPhone/video', name: 'video' },
  { dir: 'D:/Flashdisk Sayaangg', sub: 'Backup Flashdisk/Flashdisk Sayaangg', name: 'Flashdisk Sayaangg' },
];

async function login() {
  const raw = fs.readFileSync('D:/omni-buddy/server/.password.txt', 'utf8');
  const pw = raw.split('\n').map((l) => l.trim()).find((l, i) => i > 0 && l && !l.startsWith('Ubah'));
  const r = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pw }),
  });
  const cookie = (r.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  if (!r.ok || !cookie) throw new Error('login gagal');
  return cookie;
}

const cookie = await login();
const H = { 'Content-Type': 'application/json', cookie };
const api = async (p, o = {}) => {
  const r = await fetch(BASE + p, { ...o, headers: { ...H, ...(o.headers || {}) } });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const remotes = (await api('/api/remotes')).body.remotes.filter((x) => x.ok).map((x) => x.name);
const jobs = (await api('/api/jobs')).body.jobs;
const haveDest = new Set(jobs.map((j) => j.dest));

console.log('remote aktif:', remotes.join(', ') || '(tidak ada)');

let created = 0;
for (const rn of remotes) {
  for (const s of SOURCES) {
    const dest = `${rn}:${s.sub}`;
    if (haveDest.has(dest)) continue;
    const r = await api('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ name: `Mirror ${rn} - ${s.name}`, source: s.dir, dest }),
    });
    if (r.status === 201) { created++; console.log('  + job:', `Mirror ${rn} - ${s.name}`); }
    else console.log('  ! gagal:', r.status, JSON.stringify(r.body));
  }
}
console.log(created ? `selesai: ${created} job baru dibuat.` : 'tidak ada job baru (semua sudah ada).');
console.log('Jalankan lewat UI #backup — klik Jalankan per job.');
