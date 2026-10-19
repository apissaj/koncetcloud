import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isExpired, sweepFailedDir, FAILED_TTL_MS } from './staging-cleanup.js';

function tmpdir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-sweep-'));
  return d;
}

test('isExpired: file tua dianggap basi, file baru tidak', () => {
  const now = Date.now();
  assert.equal(isExpired(now - FAILED_TTL_MS - 1000, now), true);
  assert.equal(isExpired(now - FAILED_TTL_MS + 1000, now), false);
  assert.equal(isExpired(now - 1000, now), false);
});

test('sweepFailedDir: hapus hanya file yang lebih tua dari TTL', () => {
  const dir = tmpdir();
  try {
    const tua = path.join(dir, 'x-IMG_1.JPG');
    const baru = path.join(dir, 'y-IMG_2.JPG');
    fs.writeFileSync(tua, Buffer.alloc(10));
    fs.writeFileSync(baru, Buffer.alloc(20));
    const old = new Date(Date.now() - FAILED_TTL_MS - 10000);
    fs.utimesSync(tua, old, old);

    const res = sweepFailedDir(dir);
    assert.equal(res.removed, 1);
    assert.equal(res.freedBytes, 10);
    assert.equal(fs.existsSync(tua), false, 'file tua harus dihapus');
    assert.equal(fs.existsSync(baru), true, 'file baru harus tetap');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('sweepFailedDir: folder belum ada tidak error', () => {
  const res = sweepFailedDir(path.join(os.tmpdir(), 'kc-tak-ada-' + Date.now()));
  assert.deepEqual(res, { removed: 0, freedBytes: 0 });
});

test('sweepFailedDir: onAudit menerima nama + byte yang dibebaskan', () => {
  const dir = tmpdir();
  try {
    const f = path.join(dir, 'z-IMG_3.PNG');
    fs.writeFileSync(f, Buffer.alloc(7));
    const old = new Date(Date.now() - FAILED_TTL_MS - 5000);
    fs.utimesSync(f, old, old);
    let audit = null;
    sweepFailedDir(dir, { onAudit: (names, bytes) => { audit = { names, bytes }; } });
    assert.equal(!!audit, true);
    assert.equal(audit.names.length, 1);
    assert.equal(audit.bytes, 7);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});