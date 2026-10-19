// Helper fetch bersama: kesalahan HTTP dilempar sebagai Error (dengan `status`
// dan `code` dari body); 401 yang berarti SESI BERAKHIR memicu event
// 'kc:unauthorized' supaya App.vue menampilkan halaman login. 401 dengan `code`
// lain (mis. kode TOTP salah) bukan sesi berakhir, jadi jangan logout.
export async function apiFetch(url, opts = {}) {
  const r = await fetch(url, opts);
  if (r.status === 401) {
    const d = await r.json().catch(() => ({}));
    if (d.code === 'bad_credentials' || d.code === 'bad_totp') {
      const e = new Error(d.error || 'Kode tidak cocok.');
      e.status = 401;
      e.code = d.code;
      throw e;
    }
    window.dispatchEvent(new CustomEvent('kc:unauthorized'));
    const e = new Error(d.error || 'Sesi berakhir. Masuk lagi.');
    e.status = 401;
    e.code = d.code || 'unauthorized';
    throw e;
  }
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    const e = new Error(d.error || `HTTP ${r.status}`);
    e.status = r.status;
    e.code = d.code;
    throw e;
  }
  return r;
}
