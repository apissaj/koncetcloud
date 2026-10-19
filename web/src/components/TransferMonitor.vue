<script setup>
// Monitor live transfer dari HP: menerima (LocalSend -> staging) lalu mendorong
// ke cloud (rclone). Data dari GET /api/phone/status, di-poll tiap 2 detik.
// Upload chunked lewat browser tetap tersedia di bagian bawah sebagai alternatif.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  IconAlertTriangle,
  IconArrowsRightLeft,
  IconCloudUp,
  IconDeviceMobile,
  IconProgressCheck,
  IconRefresh,
} from '@tabler/icons-vue';
import { formatBytes } from '../composables/useFormatFile.js';
import { apiFetch } from '../composables/useApi.js';
import PhoneBackup from './PhoneBackup.vue';

const data = ref(null);
const loading = ref(true);
const error = ref('');
let timer = null;
let inflight = false;

const live = computed(() => data.value?.live || null);
const history = computed(() => data.value?.history || []);
const phase = computed(() => live.value?.phase || 'idle');

const PHASE_META = {
  idle: { label: 'Tidak ada transfer', tone: 'muted' },
  receiving: { label: 'Menerima dari HP', tone: 'accent' },
  pushing: { label: 'Mengirim ke cloud', tone: 'accent' },
  done: { label: 'Selesai', tone: 'ok' },
  failed: { label: 'Selesai dengan kegagalan', tone: 'warn' },
};
const TONE_CLASS = {
  muted: 'border-[#dadce0] bg-[#f1f3f4] text-[#5f6368] dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300',
  accent: 'border-[#1a73e8]/40 bg-[#e8f0fe] text-[#1967d2] dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-300',
  ok: 'border-[#34a853]/35 bg-[#e6f4ea] text-[#137333] dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300',
  warn: 'border-[#ea4335]/35 bg-[#fce8e6] text-[#c5221f] dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300',
};
const phaseMeta = computed(() => PHASE_META[phase.value] || PHASE_META.idle);
const phaseClass = computed(() => TONE_CLASS[phaseMeta.value.tone]);

const hasSession = computed(() => phase.value !== 'idle');
const pushing = computed(() => phase.value === 'pushing');
const finished = computed(() => phase.value === 'done' || phase.value === 'failed');

const pctReceive = computed(() => {
  const total = live.value?.totalBytes || 0;
  return total ? Math.min(100, (live.value.receivedBytes / total) * 100) : 0;
});
const pctPush = computed(() => {
  const total = live.value?.totalFiles || 0;
  return total ? Math.min(100, (live.value.pushedFiles / total) * 100) : 0;
});

function bytesText(v) {
  const n = Number(v) || 0;
  if (n <= 0) return '0 B';
  return formatBytes(n);
}
function freeText(v) {
  if (v == null) return null;
  return v <= 0 ? '0 B' : formatBytes(v);
}
function speedText(bps) {
  const b = Number(bps) || 0;
  if (b <= 0) return '0 MB/s';
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB/s`;
  return `${(b / 1e6).toFixed(b >= 1e7 ? 0 : 1)} MB/s`;
}
function etaText(sec) {
  if (sec == null) return null;
  if (sec >= 3600) return `${Math.round(sec / 3600)} jam`;
  if (sec >= 60) return `${Math.round(sec / 60)} menit`;
  return `${Math.round(sec)} detik`;
}
function formatDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function load() {
  // Cegah tumpang tindih: kalau respons sebelumnya belum kembali, lewati siklus
  // ini supaya respons lama tidak menimpa state yang lebih baru (out-of-order).
  if (inflight) return;
  inflight = true;
  try {
    const r = await apiFetch('/api/phone/status');
    data.value = await r.json();
    error.value = '';
  } catch (e) {
    error.value = e.message;
    if (e.message.includes('Sesi berakhir')) data.value = null;
  } finally {
    inflight = false;
    loading.value = false;
  }
}

onMounted(() => {
  load();
  timer = window.setInterval(load, 2000);
});
onBeforeUnmount(() => {
  window.clearInterval(timer);
});
</script>

<template>
  <section class="mx-auto flex w-full max-w-4xl flex-col gap-5">
    <div class="rounded-[24px] bg-white p-5 dark:bg-slate-800 sm:p-7">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="mb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[#1a73e8] dark:text-sky-400">Transfer</p>
          <h1 class="text-xl font-semibold text-[#202124] dark:text-slate-100">Transfer dari HP</h1>
          <p class="mt-1 max-w-[560px] text-sm text-[#5f6368] dark:text-slate-400">
            Pantau progres kiriman dari HP (LocalSend) sampai tersimpan di cloud. Halaman ini menyegarkan sendiri tiap 2 detik.
          </p>
        </div>
        <span class="inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium" :class="phaseClass">
          <span class="size-2 rounded-full bg-current" aria-hidden="true" />
          {{ phaseMeta.label }}
        </span>
      </div>

      <p
        v-if="error"
        class="mt-4 flex items-start gap-2 rounded-xl border border-[#ea4335]/35 bg-[#fce8e6] px-3 py-2.5 text-sm text-[#c5221f] dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300"
      >
        <IconAlertTriangle :size="16" :stroke="2" class="mt-0.5 shrink-0" />
        <span>{{ error }}. Mencoba lagi otomatis tiap 2 detik.</span>
      </p>

      <p v-if="loading" class="mt-6 text-sm text-[#5f6368] dark:text-slate-400">Memuat status transfer...</p>

      <div
        v-else-if="!hasSession"
        class="mt-6 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[#e0e3e7] py-12 text-center dark:border-slate-700"
      >
        <IconDeviceMobile :size="34" :stroke="1.5" class="text-[#5f6368] dark:text-slate-400" />
        <p class="text-sm font-medium text-[#202124] dark:text-slate-100">Belum ada transfer masuk</p>
        <p class="max-w-[420px] text-sm text-[#5f6368] dark:text-slate-400">
          Buka aplikasi LocalSend di HP, pilih foto atau video, lalu kirim ke perangkat KoncetCloud. Progresnya muncul di sini.
        </p>
      </div>

      <div v-else class="mt-5 flex flex-col gap-5">
        <div>
          <div class="mb-1.5 flex items-center justify-between gap-3 text-sm">
            <span class="flex items-center gap-2 font-medium text-[#202124] dark:text-slate-100">
              <IconDeviceMobile :size="18" :stroke="1.8" class="text-[#5f6368] dark:text-slate-400" />
              Menerima dari HP
            </span>
            <span class="shrink-0 tabular-nums text-[#5f6368] dark:text-slate-400">{{ live.receivedFiles }}/{{ live.totalFiles }} file</span>
          </div>
          <div
            class="h-2 w-full overflow-hidden rounded-full bg-[#e8eaed] dark:bg-slate-700"
            role="progressbar"
            aria-label="Progres menerima dari HP"
            :aria-valuenow="Math.round(pctReceive)"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div class="h-full rounded-full bg-[#1a73e8] transition-[width] dark:bg-sky-400" :style="{ width: pctReceive + '%' }" />
          </div>
          <p class="mt-1.5 text-xs text-[#5f6368] dark:text-slate-400">{{ bytesText(live.receivedBytes) }} dari {{ bytesText(live.totalBytes) }}</p>
        </div>

        <div>
          <div class="mb-1.5 flex items-center justify-between gap-3 text-sm">
            <span class="flex items-center gap-2 font-medium text-[#202124] dark:text-slate-100">
              <IconCloudUp :size="18" :stroke="1.8" class="text-[#5f6368] dark:text-slate-400" />
              Mengirim ke cloud
            </span>
            <span class="shrink-0 tabular-nums text-[#5f6368] dark:text-slate-400">{{ live.pushedFiles }}/{{ live.totalFiles }} file</span>
          </div>
          <div
            class="h-2 w-full overflow-hidden rounded-full bg-[#e8eaed] dark:bg-slate-700"
            role="progressbar"
            aria-label="Progres mengirim ke cloud"
            :aria-valuenow="Math.round(pctPush)"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div class="h-full rounded-full bg-[#34a853] transition-[width] dark:bg-emerald-400" :style="{ width: pctPush + '%' }" />
          </div>
          <p class="mt-1.5 truncate text-xs text-[#5f6368] dark:text-slate-400">
            <template v-if="pushing && live.currentFile">
              Sedang mengirim: <span class="text-[#202124] dark:text-slate-200">{{ live.currentFile }}</span>
            </template>
            <template v-else-if="finished">
              {{ live.pushedFiles }} file tersimpan ke cloud<span v-if="live.failedFiles">, {{ live.failedFiles }} gagal</span>
            </template>
            <template v-else>Menunggu semua file diterima sebelum dikirim ke cloud.</template>
          </p>
        </div>

        <div
          v-if="phase === 'failed'"
          class="flex items-start gap-2 rounded-xl border border-[#ea4335]/35 bg-[#fce8e6] px-3 py-2.5 text-sm text-[#c5221f] dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300"
        >
          <IconAlertTriangle :size="16" :stroke="2" class="mt-0.5 shrink-0" />
          <span>{{ live.failedFiles }} file gagal tersimpan ke cloud. File yang gagal tetap ada di server dan bisa dicoba ulang.</span>
        </div>

        <dl class="grid grid-cols-1 gap-x-6 gap-y-4 border-t border-[#e8eaed] pt-5 dark:border-slate-700 sm:grid-cols-2">
          <div class="flex items-start gap-2.5">
            <IconArrowsRightLeft :size="18" :stroke="1.8" class="mt-0.5 shrink-0 text-[#5f6368] dark:text-slate-400" />
            <div class="min-w-0">
              <dt class="text-xs text-[#5f6368] dark:text-slate-400">Tujuan</dt>
              <dd class="truncate text-sm text-[#202124] dark:text-slate-100">{{ live.dest || 'Belum ditentukan' }}</dd>
              <dd v-if="freeText(data.destFree) !== null" class="text-xs text-[#5f6368] dark:text-slate-400">{{ freeText(data.destFree) }} kosong</dd>
            </div>
          </div>
          <div class="flex items-start gap-2.5">
            <IconDeviceMobile :size="18" :stroke="1.8" class="mt-0.5 shrink-0 text-[#5f6368] dark:text-slate-400" />
            <div class="min-w-0">
              <dt class="text-xs text-[#5f6368] dark:text-slate-400">Pengirim</dt>
              <dd class="truncate text-sm text-[#202124] dark:text-slate-100">{{ live.sender && live.sender.alias ? live.sender.alias : 'Perangkat' }}</dd>
              <dd class="truncate text-xs text-[#5f6368] dark:text-slate-400">{{ live.sender && live.sender.ip ? live.sender.ip : 'alamat tidak diketahui' }}</dd>
            </div>
          </div>
          <div v-if="pushing" class="flex items-start gap-2.5">
            <IconCloudUp :size="18" :stroke="1.8" class="mt-0.5 shrink-0 text-[#5f6368] dark:text-slate-400" />
            <div class="min-w-0">
              <dt class="text-xs text-[#5f6368] dark:text-slate-400">Kecepatan</dt>
              <dd class="text-sm text-[#202124] dark:text-slate-100">{{ live.rclone ? speedText(live.rclone.speed) : 'Menunggu data' }}</dd>
              <dd v-if="live.rclone && etaText(live.rclone.eta)" class="text-xs text-[#5f6368] dark:text-slate-400">Perkiraan {{ etaText(live.rclone.eta) }}</dd>
            </div>
          </div>
        </dl>
      </div>
    </div>

    <div class="rounded-[24px] bg-white p-5 dark:bg-slate-800 sm:p-7">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold text-[#202124] dark:text-slate-100">Riwayat transfer</h2>
          <p class="mt-0.5 text-sm text-[#5f6368] dark:text-slate-400">5 transfer terakhir pada sesi server ini.</p>
        </div>
        <button
          type="button"
          class="inline-flex h-11 items-center gap-2 rounded-full border border-[#dadce0] bg-white px-4 text-sm font-medium text-[#3c4043] transition hover:bg-[#f1f3f4] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          @click="load"
        >
          <IconRefresh :size="18" :stroke="1.8" />
          Muat ulang
        </button>
      </div>

      <div
        v-if="!history.length"
        class="mt-5 rounded-2xl border border-dashed border-[#e0e3e7] py-10 text-center text-sm text-[#5f6368] dark:border-slate-700 dark:text-slate-400"
      >
        Belum ada transfer yang selesai.
      </div>
      <ul v-else class="mt-4 flex flex-col gap-2">
        <li
          v-for="(h, i) in history"
          :key="i"
          class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-[#e0e3e7] p-3.5 dark:border-slate-700"
        >
          <div class="min-w-0">
            <p class="truncate text-sm text-[#202124] dark:text-slate-100">
              {{ h.senderAlias || 'Perangkat' }} · {{ h.totalFiles }} file · {{ bytesText(h.totalBytes) }}
            </p>
            <p class="truncate text-xs text-[#5f6368] dark:text-slate-400">{{ h.dest }} · {{ formatDateTime(h.finishedAt) }}</p>
          </div>
          <span
            v-if="h.failedFiles > 0"
            class="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#ea4335]/35 bg-[#fce8e6] px-2.5 py-0.5 text-[11px] font-medium text-[#c5221f] dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300"
          >
            <IconAlertTriangle :size="13" :stroke="2" />{{ h.failedFiles }} gagal
          </span>
          <span
            v-else
            class="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#34a853]/35 bg-[#e6f4ea] px-2.5 py-0.5 text-[11px] font-medium text-[#137333] dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300"
          >
            <IconProgressCheck :size="13" :stroke="2" />Berhasil
          </span>
        </li>
      </ul>
    </div>

    <details class="rounded-[24px] border border-[#e0e3e7] bg-white p-2 dark:border-slate-700 dark:bg-slate-800">
      <summary
        class="flex cursor-pointer list-none items-center gap-2 rounded-[18px] px-4 py-3 text-sm font-medium text-[#202124] transition hover:bg-[#f8fafd] dark:text-slate-100 dark:hover:bg-slate-700"
      >
        <IconCloudUp :size="18" :stroke="1.8" class="text-[#5f6368] dark:text-slate-400" />
        Upload via browser (alternatif)
      </summary>
      <div class="p-2 pt-1">
        <PhoneBackup />
      </div>
    </details>
  </section>
</template>