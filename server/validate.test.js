// Uji cepat validator remote-filesystem (pakai test runner bawaan Node).
// Jalankan: node --test server/validate.test.js
// Atau semua: node --test server/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFsName, fsRemoteName, assertSafeRemotePath } from './validate.js';

test('parseFsName menerima remote valid', () => {
  assert.equal(parseFsName('gdrive:'), 'gdrive:');
  assert.equal(parseFsName('gdrive3:'), 'gdrive3:');
  assert.equal(parseFsName('AzfaZarqarida:'), 'AzfaZarqarida:');
  assert.equal(fsRemoteName('gdrive:'), 'gdrive');
});

test('parseFsName menolak path lokal / backend on-the-fly / bentuk aneh', () => {
  for (const bad of [
    'C:/Windows', 'D:/omni-buddy/server', '/abs', './x', 'gdrive',
    'gdrive:Backup HP', ':memory:', ':http,url=...:', 'a b:', 'x;y:',
  ]) {
    assert.throws(() => parseFsName(bad), /fs tidak valid/, `harus tolak: ${bad}`);
  }
});

test('parseFsName menolak drive-letter (C:) walau bentuknya cocok', () => {
  for (const bad of ['C:', 'c:', 'Z:', 'A:']) {
    assert.throws(() => parseFsName(bad), /fs tidak valid/, `harus tolak: ${bad}`);
  }
});

test('assertSafeRemotePath menerima path relatif', () => {
  assert.equal(assertSafeRemotePath(''), '');
  assert.equal(assertSafeRemotePath('Backup HP'), 'Backup HP');
  assert.equal(assertSafeRemotePath('Backup HP/sub/file.png'), 'Backup HP/sub/file.png');
  assert.equal(assertSafeRemotePath('a-b_c.d/e'), 'a-b_c.d/e');
});

test('assertSafeRemotePath menolak traversal, absolut, drive, backslash, kontrol', () => {
  for (const bad of ['../x', 'a/../../b', '/etc/passwd', 'C:/Windows', 'a\\b', 'x\u0000y', '..', 'a/..']) {
    assert.throws(() => assertSafeRemotePath(bad), /path tidak valid/, `harus tolak: ${JSON.stringify(bad)}`);
  }
});