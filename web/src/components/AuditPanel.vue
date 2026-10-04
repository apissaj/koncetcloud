<script setup>
import { onMounted, ref } from 'vue';
import { IconAlertTriangle, IconCircleCheck, IconHistory } from '@tabler/icons-vue';
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
};

const entries = ref([]);
const total = ref(0);
const loading = ref(true);
const error = ref('');
const limit = 100;
const offset = ref(0);

async function api(url) {
  const r = await fetch(url);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
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
    entries.value = [];
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
    <div class="rounded-[24px] bg-white p-5 dark:bg-slate-800 sm:p-7">
      <p class="mb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[#1a73e8] dark:text-sky-400">Riwayat</p>
      <h1 class="text-[26px] font-medium text-[#202124] dark:text-slate-100">Riwayat aksi</h1>
      <p class="mt-2 max-w-[720px] text-sm text-[#5f6368] dark:text-slate-400">
        Catatan siapa melakukan apa: login, hapus, ubah nama, jalankan job, dan lainnya.
        Dicatat otomatis oleh server, tidak bisa diubah dari UI.
      </p>
    </div>

    <LoadingState v-if="loading" message="Memuat riwayat..." />

    <div v-else-if="error" class="rounded-[24px] border border-[#e0e3e7] bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
      <p class="font-medium text-[#c5221f]">Riwayat tidak bisa dibaca</p>
      <p class="mt-1 text-sm text-[#5f6368] dark:text-slate-400">{{ error }}</p>
      <button type="button" class="mt-3 inline-flex h-10 items-center rounded-full border border-[#dadce0] bg-white px-5 text-sm font-medium text-[#3c4043] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" @click="load">Coba lagi</button>
    </div>

    <div v-else-if="!entries.length" class="flex flex-col items-center gap-2 rounded-[24px] border border-dashed border-[#e0e3e7] py-14 text-center dark:border-slate-700">
      <IconHistory :size="28" :stroke="1.5" class="text-[#5f6368] dark:text-slate-400" />
      <p class="font-medium text-[#5f6368] dark:text-slate-300">Belum ada riwayat</p>
      <p class="text-sm text-[#5f6368] dark:text-slate-400">Aksi yang dicatat akan muncul di sini.</p>
    </div>

    <div v-else class="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white dark:border-slate-700 dark:bg-slate-800">
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="border-b border-[#e8eaed] bg-[#f8fafd] text-xs uppercase tracking-wide text-[#5f6368] dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400">
            <th class="px-4 py-3 font-medium">Waktu</th>
            <th class="px-4 py-3 font-medium">Pengguna</th>
            <th class="px-4 py-3 font-medium">Aksi</th>
            <th class="hidden px-4 py-3 font-medium sm:table-cell">Detail</th>
            <th class="hidden px-4 py-3 font-medium md:table-cell">IP</th>
            <th class="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[#eceff1] dark:divide-slate-700">
          <tr v-for="(e, i) in entries" :key="i" class="align-top">
            <td class="whitespace-nowrap px-4 py-3 font-mono text-xs text-[#5f6368] dark:text-slate-400">{{ fmtTs(e.ts) }}</td>
            <td class="px-4 py-3 font-medium text-[#202124] dark:text-slate-100">{{ e.user || '(anonim)' }}</td>
            <td class="px-4 py-3">
              <span class="inline-flex items-center gap-1.5">
                <IconAlertTriangle v-if="e.ok === false" :size="13" :stroke="2" class="shrink-0 text-[#ea4335]" />
                <IconCircleCheck v-else :size="13" :stroke="2" class="shrink-0 text-[#34a853]" />
                {{ label(e.action) }}
              </span>
            </td>
            <td class="hidden max-w-[320px] truncate px-4 py-3 text-xs text-[#5f6368] dark:text-slate-400 sm:table-cell" :title="e.detail || ''">{{ e.detail || '-' }}</td>
            <td class="hidden px-4 py-3 font-mono text-xs text-[#5f6368] dark:text-slate-400 md:table-cell">{{ e.ip || '-' }}</td>
            <td class="px-4 py-3">
              <span
                class="rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
                :class="e.ok === false
                  ? 'border-[#ea4335]/35 bg-[#fce8e6] text-[#c5221f] dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300'
                  : 'border-[#34a853]/35 bg-[#e6f4ea] text-[#137333] dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300'"
              >{{ okLabel(e) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="flex items-center justify-between px-1 text-sm text-[#5f6368] dark:text-slate-400">
      <span>{{ total }} entri</span>
      <div class="flex gap-2">
        <button type="button" class="inline-flex h-9 items-center rounded-full border border-[#dadce0] bg-white px-4 text-sm font-medium text-[#3c4043] transition hover:bg-[#f8fafd] disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" :disabled="offset <= 0" @click="prev">Sebelumnya</button>
        <button type="button" class="inline-flex h-9 items-center rounded-full border border-[#dadce0] bg-white px-4 text-sm font-medium text-[#3c4043] transition hover:bg-[#f8fafd] disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" :disabled="offset + limit >= total" @click="next">Berikutnya</button>
      </div>
    </div>
  </div>
</template>