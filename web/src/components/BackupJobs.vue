<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  IconAlertTriangle,
  IconClockHour4,
  IconCloudUpload,
  IconPlayerPlay,
  IconPlus,
  IconTrash,
} from '@tabler/icons-vue';
import { formatBytes } from '../composables/useFormatFile.js';
import LoadingState from './LoadingState.vue';

const props = defineProps({
  role: { type: String, default: 'admin' },
});
const canWrite = computed(() => props.role === 'admin');

const jobs = ref([]);
const loading = ref(true);
const error = ref('');
const formError = ref('');

const name = ref('');
const source = ref('');
const dest = ref('');
const creating = ref(false);

const progress = ref({});
const running = ref({});
const runError = ref({});
const timers = ref({});

async function api(url, opts) {
  const r = await fetch(url, opts);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const d = await api('/api/jobs');
    jobs.value = d.jobs || [];
  } catch (e) {
    error.value = e.message;
    jobs.value = [];
  } finally {
    loading.value = false;
  }
}

async function create() {
  formError.value = '';
  if (!source.value.trim() || !dest.value.trim()) {
    formError.value = 'Folder sumber dan tujuan wajib diisi.';
    return;
  }
  creating.value = true;
  try {
    const d = await api('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.value.trim() || undefined,
        source: source.value.trim(),
        dest: dest.value.trim(),
      }),
    });
    jobs.value.push(d.job);
    name.value = '';
    source.value = '';
    dest.value = '';
  } catch (e) {
    formError.value = e.message;
  } finally {
    creating.value = false;
  }
}

async function remove(job) {
  if (!window.confirm(`Hapus job "${job.name}"? Berkas yang sudah tersalin tetap ada di drive.`)) return;
  try {
    const r = await fetch(`/api/jobs/${encodeURIComponent(job.id)}`, { method: 'DELETE' });
    if (!r.ok && r.status !== 204) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error || `HTTP ${r.status}`);
    }
    stopPoll(job.id);
    jobs.value = jobs.value.filter((j) => j.id !== job.id);
  } catch (e) {
    window.alert(`Gagal hapus job: ${e.message}`);
  }
}

async function run(job) {
  running.value = { ...running.value, [job.id]: true };
  runError.value = { ...runError.value, [job.id]: '' };
  try {
    await api(`/api/jobs/${encodeURIComponent(job.id)}/run`, { method: 'POST' });
    startPoll(job.id);
  } catch (e) {
    running.value = { ...running.value, [job.id]: false };
    runError.value = { ...runError.value, [job.id]: e.message };
  }
}

async function stop(job) {
  if (!window.confirm(`Hentikan job "${job.name}"? Berkas yang sudah tersalin tetap ada.`)) return;
  try {
    await api(`/api/jobs/${encodeURIComponent(job.id)}/stop`, { method: 'POST' });
    stopPoll(job.id);
    running.value = { ...running.value, [job.id]: false };
    await load();
  } catch (e) {
    runError.value = { ...runError.value, [job.id]: e.message };
  }
}

function startPoll(id) {
  stopPoll(id);
  poll(id);
  timers.value[id] = setInterval(() => poll(id), 2500);
}
async function poll(id) {
  try {
    const d = await api(`/api/jobs/${encodeURIComponent(id)}/progress`);
    progress.value = { ...progress.value, [id]: d.progress || {} };
    const job = d.job;
    if (job) {
      const i = jobs.value.findIndex((j) => j.id === id);
      if (i >= 0) jobs.value[i] = job;
      const st = job.lastRun?.status;
      if (st && st !== 'running') {
        running.value = { ...running.value, [id]: false };
        stopPoll(id);
      }
    }
  } catch (e) {
    running.value = { ...running.value, [id]: false };
    stopPoll(id);
  }
}
function stopPoll(id) {
  if (timers.value[id]) {
    clearInterval(timers.value[id]);
    delete timers.value[id];
  }
}

function statusOf(job) {
  const st = job.lastRun?.status;
  if (running.value[job.id] || st === 'running') return { label: 'Berjalan', cls: 'border-[#1a73e8]/40 bg-[#e8f0fe] text-[#1967d2] dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-300' };
  if (!job.lastRun) return { label: 'Belum jalan', cls: 'border-[#dadce0] bg-[#f1f3f4] text-[#5f6368] dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300' };
  if (st === 'done') return { label: 'Selesai', cls: 'border-[#34a853]/35 bg-[#e6f4ea] text-[#137333] dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300' };
  if (st === 'error' || st === 'failed') return { label: 'Gagal', cls: 'border-[#ea4335]/35 bg-[#fce8e6] text-[#c5221f] dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300' };
  return { label: 'Belum jalan', cls: 'border-[#dadce0] bg-[#f1f3f4] text-[#5f6368] dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300' };
}
function fmtDate(s) {
  if (!s) return 'belum pernah';
  const d = new Date(s);
  if (isNaN(d.getTime())) return 'belum pernah';
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
}
function progText(id) {
  const p = progress.value[id];
  if (!p) return '';
  const st = p.stats || {};
  const parts = [];
  if (st.bytes != null) parts.push(`${formatBytes(st.bytes)} terkirim`);
  if (st.speed != null && st.speed > 0) parts.push(`${formatBytes(st.speed)}/detik`);
  if (st.errors) parts.push(`${st.errors} error`);
  return parts.join(' · ');
}

onMounted(load);
onBeforeUnmount(() => Object.keys(timers.value).forEach((id) => stopPoll(id)));
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="rounded-[24px] bg-white p-5 dark:bg-slate-800 sm:p-7">
      <p class="mb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[#1a73e8] dark:text-sky-400">Backup</p>
      <h1 class="text-[26px] font-medium text-[#202124] dark:text-slate-100">Job backup</h1>
      <p class="mt-2 max-w-[720px] text-sm text-[#5f6368] dark:text-slate-400">
        Salin folder lokal ke drive dengan rclone. Kalau koneksi putus, jalankan job yang sama lagi:
        berkas yang sudah ada di drive tidak dikirim ulang.
      </p>

      <div v-if="canWrite" class="mt-5 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-semibold text-[#5f6368] dark:text-slate-400">Nama job (opsional)</span>
          <input v-model="name" type="text" class="h-11 rounded-xl border border-[#dadce0] bg-white px-3.5 text-sm text-[#202124] outline-none transition focus:border-[#1a73e8] focus:shadow-[0_0_0_3px_rgba(26,115,232,0.15)] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" placeholder="Backup iPhone" />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-semibold text-[#5f6368] dark:text-slate-400">Folder sumber</span>
          <input v-model="source" type="text" class="h-11 rounded-xl border border-[#dadce0] bg-white px-3.5 font-mono text-xs text-[#202124] outline-none transition focus:border-[#1a73e8] focus:shadow-[0_0_0_3px_rgba(26,115,232,0.15)] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" placeholder="D:/HP IP15" />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-semibold text-[#5f6368] dark:text-slate-400">Tujuan di drive</span>
          <input v-model="dest" type="text" class="h-11 rounded-xl border border-[#dadce0] bg-white px-3.5 font-mono text-xs text-[#202124] outline-none transition focus:border-[#1a73e8] focus:shadow-[0_0_0_3px_rgba(26,115,232,0.15)] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" placeholder="gdrive:Backup iPhone/HP IP15" />
        </label>
        <button type="button" class="inline-flex h-11 items-center justify-center gap-2 self-end rounded-full bg-[#1a73e8] px-5 text-sm font-medium text-white transition hover:bg-[#1765cc] disabled:opacity-60" :disabled="creating" @click="create">
          <IconPlus :size="18" :stroke="2" />
          {{ creating ? 'Menyimpan...' : 'Tambah job' }}
        </button>
      </div>
      <p v-if="formError" class="mt-3 rounded-xl border border-[#ea4335]/35 bg-[#ea4335]/10 px-3 py-2 text-xs text-[#c5221f] dark:text-red-300">{{ formError }}</p>
    </div>

    <LoadingState v-if="loading" message="Membaca daftar job..." />

    <div v-else-if="error" class="rounded-[24px] border border-[#e0e3e7] bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
      <p class="font-medium text-[#c5221f]">Daftar job tidak bisa dibaca</p>
      <p class="mt-1 text-sm text-[#5f6368] dark:text-slate-400">{{ error }}</p>
      <button type="button" class="mt-3 inline-flex h-10 items-center rounded-full border border-[#dadce0] bg-white px-5 text-sm font-medium text-[#3c4043] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" @click="load">Coba lagi</button>
    </div>

    <div v-else-if="!jobs.length" class="flex flex-col items-center gap-2 rounded-[24px] border border-dashed border-[#e0e3e7] py-14 text-center dark:border-slate-700">
      <IconCloudUpload :size="28" :stroke="1.5" class="text-[#5f6368] dark:text-slate-400" />
      <p class="font-medium text-[#5f6368] dark:text-slate-300">Belum ada job backup</p>
      <p class="text-sm text-[#5f6368] dark:text-slate-400">Isi form di atas untuk membuat job pertama.</p>
    </div>

    <div v-else class="flex flex-col gap-3">
      <h2 class="px-1 text-xs font-bold uppercase tracking-[0.08em] text-[#5f6368] dark:text-slate-400">
        Daftar job ({{ jobs.length }})
      </h2>
      <article
        v-for="job in jobs"
        :key="job.id"
        class="grid grid-cols-1 items-center gap-4 rounded-2xl border border-[#e0e3e7] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:border-[#c7d2e0] dark:border-slate-700 dark:bg-slate-800 sm:grid-cols-[minmax(0,1fr)_auto]"
      >
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2.5">
            <span class="grid size-9 shrink-0 place-items-center rounded-full bg-[#e8f0fe] text-[#1a73e8] dark:bg-sky-500/15 dark:text-sky-300">
              <IconCloudUpload :size="18" :stroke="1.8" />
            </span>
            <span class="truncate text-sm font-semibold text-[#202124] dark:text-slate-100">{{ job.name }}</span>
            <span class="rounded-full border px-2.5 py-0.5 text-[11px] font-medium" :class="statusOf(job).cls">{{ statusOf(job).label }}</span>
          </div>
          <div class="mt-2.5 flex flex-wrap items-center gap-2 font-mono text-[11px]">
            <span class="max-w-[280px] truncate rounded-lg border border-[#e0e3e7] bg-[#f8fafd] px-2 py-1 text-[#3c4043] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">{{ job.source }}</span>
            <span class="text-[#5f6368] dark:text-slate-400">ke</span>
            <span class="max-w-[280px] truncate rounded-lg border border-[#e0e3e7] bg-[#f8fafd] px-2 py-1 text-[#3c4043] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">{{ job.dest }}</span>
          </div>
          <p class="mt-2 flex items-center gap-1.5 text-xs text-[#5f6368] dark:text-slate-400">
            <IconClockHour4 :size="14" :stroke="1.8" />
            Terakhir jalan: <strong class="font-medium text-[#202124] dark:text-slate-200">{{ fmtDate(job.lastRun?.startedAt) }}</strong>
          </p>
          <p v-if="running[job.id] && progText(job.id)" class="mt-1.5 font-mono text-xs text-[#1a73e8] dark:text-sky-300">{{ progText(job.id) }}</p>
          <p v-if="runError[job.id]" class="mt-1.5 flex items-start gap-1.5 rounded-lg border border-[#ea4335]/35 bg-[#ea4335]/10 px-2.5 py-1.5 text-xs text-[#c5221f] dark:text-red-300">
            <IconAlertTriangle :size="14" :stroke="2" class="mt-0.5 shrink-0" />
            {{ runError[job.id] }}
          </p>
          <p v-if="job.lastRun?.error" class="mt-1.5 flex items-start gap-1.5 text-xs text-[#c5221f] dark:text-red-300">
            <IconAlertTriangle :size="14" :stroke="2" class="mt-0.5 shrink-0" />
            {{ job.lastRun.error }}
          </p>
        </div>

        <div class="flex shrink-0 gap-2">
          <button v-if="!running[job.id] && canWrite" type="button" class="inline-flex h-10 items-center gap-2 rounded-full bg-[#1a73e8] px-4 text-sm font-medium text-white transition hover:bg-[#1765cc] disabled:opacity-60" :disabled="running[job.id]" @click="run(job)">
            <IconPlayerPlay :size="17" :stroke="2" />
            Jalankan
          </button>
          <button v-else-if="canWrite" type="button" class="inline-flex h-10 items-center gap-2 rounded-full border border-amber-500/50 bg-amber-500/10 px-4 text-sm font-medium text-amber-700 transition hover:bg-amber-500/20 dark:text-amber-300" @click="stop(job)">
            Hentikan
          </button>
          <button v-if="canWrite" type="button" class="inline-flex h-10 items-center gap-2 rounded-full border border-[#ea4335]/50 bg-[#ea4335]/10 px-4 text-sm font-medium text-[#c5221f] transition hover:bg-[#ea4335]/20 dark:border-red-400/40 dark:text-red-300" @click="remove(job)">
            <IconTrash :size="17" :stroke="1.8" />
            Hapus
          </button>
        </div>
      </article>
    </div>
  </div>
</template>