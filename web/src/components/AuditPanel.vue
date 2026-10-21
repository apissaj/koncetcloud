<script setup>
import { onMounted, ref } from 'vue';
import { IconAlertTriangle, IconCircleCheck, IconHistory } from '@tabler/icons-vue';
import { apiFetch } from '../composables/useApi.js';
import LoadingState from './LoadingState.vue';

const ACTIONS = {
  login: 'Masuk',
  login_failed: 'Gagal masuk',
  login_blocked: 'Login diblokir',
  logout: 'Keluar',
  user_create: 'Buat pengguna',
  user_delete: 'Hapus pengguna',
  password_change: 'Ganti password',
  delete: 'Hapus berkas',
  rename: 'Ubah nama',
  mkdir: 'Buat folder',
  job_run: 'Jalankan job',
  job_stop: 'Hentikan job',
  job_create: 'Buat job',
  job_delete: 'Hapus job',
  mirror_create: 'Buat mirror',
  connect: 'Sambungkan akun',
  disconnect: 'Putuskan akun',
  download: 'Unduh berkas',
  localsend_start: 'Receiver LocalSend aktif',
  localsend_prepare: 'Siapkan transfer',
  localsend_upload: 'Upload file',
  localsend_cancel: 'Batalkan transfer',
  localsend_cleanup: 'Bersihkan file gagal',
  job_mirror: 'Buat job mirror',
  phone_upload: 'Upload dari browser',
  platform_connect: 'Sambungkan akun',
  platform_disconnect: 'Putuskan akun',
};

const entries = ref([]);
const total = ref(0);
const loading = ref(true);
const error = ref('');
const limit = 100;
const offset = ref(0);

async function api(url) {
  const r = await apiFetch(url);
  return r.json().catch(() => ({}));
}

function label(a) {
  return ACTIONS[a] || a || '-';
}
function fmtTs(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return isNaN(d.getTime()) ? ts : d.toLocaleString('id-ID');
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const d = await api(`/api/audit?limit=${limit}&offset=${offset.value}`);
    entries.value = d.entries || [];
    total.value = d.total || 0;
  } catch (e) {
    error.value = e.message;
    if (e.message.includes('Sesi berakhir')) {
      entries.value = [];
      total.value = 0;
    }
  } finally {
    loading.value = false;
  }
}

function next() {
  if (offset.value + limit >= total.value) return;
  offset.value += limit;
  load();
}
function prev() {
  if (offset.value <= 0) return;
  offset.value = Math.max(0, offset.value - limit);
  load();
}

function okLabel(entry) {
  return entry.ok === false ? 'Gagal' : 'OK';
}

onMounted(load);
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="sg-card p-5 sm:p-7">
      <p class="mb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[var(--primary)]">Riwayat</p>
      <h1 class="text-[26px] font-medium text-[var(--foreground)]">Riwayat aksi</h1>
      <p class="mt-2 max-w-[720px] text-sm text-[var(--muted-foreground)]">
        Catatan siapa melakukan apa: login, hapus, ubah nama, jalankan job, dan lainnya.
        Dicatat otomatis oleh server, tidak bisa diubah dari UI.
      </p>
    </div>

    <LoadingState v-if="loading" message="Memuat riwayat..." />

    <div v-else-if="error" class="sg-card p-6">
      <p class="font-medium text-[var(--destructive)]">Riwayat tidak bisa dibaca</p>
      <p class="mt-1 text-sm text-[var(--muted-foreground)]">{{ error }}</p>
      <button type="button" class="sg-control mt-3 inline-flex h-10 items-center px-5 text-sm font-medium text-[var(--foreground)] transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none" @click="load">Coba lagi</button>
    </div>

    <div v-else-if="!entries.length" class="flex flex-col items-center gap-2 rounded-[24px] border border-dashed border-[var(--glass-edge)] py-14 text-center">
      <IconHistory :size="28" :stroke="1.5" class="text-[var(--muted-foreground)]" />
      <p class="font-medium text-[var(--muted-foreground)]">Belum ada riwayat</p>
      <p class="text-sm text-[var(--muted-foreground)]">Aksi yang dicatat akan muncul di sini.</p>
    </div>

    <div v-else class="sg-card overflow-hidden">
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="border-b border-[var(--border)] bg-[var(--muted)] text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
            <th class="px-4 py-3 font-medium">Waktu</th>
            <th class="px-4 py-3 font-medium">Pengguna</th>
            <th class="px-4 py-3 font-medium">Aksi</th>
            <th class="hidden px-4 py-3 font-medium sm:table-cell">Detail</th>
            <th class="hidden px-4 py-3 font-medium md:table-cell">IP</th>
            <th class="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(e, i) in entries" :key="i" class="border-b border-[var(--border)]">
            <td class="whitespace-nowrap px-4 py-3 align-middle font-mono text-xs text-[var(--muted-foreground)]">{{ fmtTs(e.ts) }}</td>
            <td class="px-4 py-3 align-middle font-medium text-[var(--foreground)]">{{ e.user || '(anonim)' }}</td>
            <td class="px-4 py-3 align-middle">
              <span class="inline-flex items-center gap-1.5">
                <IconAlertTriangle v-if="e.ok === false" :size="13" :stroke="2" class="shrink-0 text-[var(--destructive)]" />
                <IconCircleCheck v-else :size="13" :stroke="2" class="shrink-0 text-[var(--success)]" />
                {{ label(e.action) }}
              </span>
            </td>
            <td class="hidden max-w-[320px] px-4 py-3 align-middle text-xs text-[var(--muted-foreground)] sm:table-cell">
              <span class="block truncate" :title="e.detail || ''">{{ e.detail || '-' }}</span>
            </td>
            <td class="hidden px-4 py-3 align-middle font-mono text-xs text-[var(--muted-foreground)] md:table-cell">{{ e.ip || '-' }}</td>
            <td class="px-4 py-3 align-middle">
              <span
                class="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                :class="e.ok === false
                  ? 'sg-control text-[var(--destructive)]'
                  : 'sg-control text-[var(--success)]'"
              >{{ okLabel(e) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="flex items-center justify-between px-1 text-sm text-[var(--muted-foreground)]">
      <span>{{ total }} entri</span>
      <div class="flex gap-2">
        <button type="button" class="sg-control inline-flex h-9 items-center px-4 text-sm font-medium text-[var(--foreground)] transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none disabled:opacity-40" :disabled="offset <= 0" @click="prev">Sebelumnya</button>
        <button type="button" class="sg-control inline-flex h-9 items-center px-4 text-sm font-medium text-[var(--foreground)] transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none disabled:opacity-40" :disabled="offset + limit >= total" @click="next">Berikutnya</button>
      </div>
    </div>
  </div>
</template>