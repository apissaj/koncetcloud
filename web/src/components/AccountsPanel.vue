<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  IconAlertTriangle,
  IconArrowsExchange,
  IconAt,
  IconCircleCheck,
  IconCloudPlus,
  IconExternalLink,
  IconLoader2,
  IconLock,
  IconPlugConnected,
  IconPlus,
  IconRefresh,
  IconUnlink,
  IconX,
} from '@tabler/icons-vue';
import { formatBytes, providerIcon } from '../composables/useFormatFile.js';
import LoadingState from './LoadingState.vue';
import ConnectFormModal from './ConnectFormModal.vue';

const emit = defineEmits(['changed']);

const props = defineProps({
  role: { type: String, default: 'admin' },
});
const canWrite = computed(() => props.role === 'admin');

// Peta id platform (kontrak) -> key provider untuk ikon.
const ICON_KEY = { mega: 'mega', pcloud: 'pcloud', onedrive: 'onedrive', gdrive: 'google_drive' };

const platforms = ref([]);
const remotes = ref([]);
const loading = ref(true);
const error = ref('');

const busy = ref({});
const actionError = ref({});
const notice = ref({});

const formPlatform = ref(null); // objek platform untuk modal form
const formMode = ref('connect'); // 'connect' (akun pertama) | 'add' (akun tambahan)
const formDefaultRemote = ref('');

const oauth = ref(null); // { platform, process, authUrl, status, error }
let oauthTimer = null;

async function api(url, opts) {
  const r = await fetch(url, opts);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(d.error || `HTTP ${r.status}`);
    e.code = d.code;
    e.status = r.status;
    throw e;
  }
  return d;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const d = await api('/api/platforms');
    platforms.value = d.platforms || [];
  } catch (e) {
    error.value = e.message;
    platforms.value = [];
  } finally {
    loading.value = false;
  }
  // Data kapasitas cadangan: /api/remotes menyertakan used/total/free per remote.
  try {
    const r = await api('/api/remotes');
    remotes.value = r.remotes || [];
  } catch (e) {
    remotes.value = [];
  }
}

// --- Daftar kartu: platform + remote tambahan (mis. "mega2") -------------
const platformIds = computed(() => new Set(platforms.value.map((p) => p.id)));

// Cocokkan nama remote ke platform berdasarkan awalan id (mega2 -> mega).
function platformForRemote(name) {
  const n = String(name || '').toLowerCase();
  if (!n) return null;
  let best = null;
  for (const p of platforms.value) {
    const id = String(p.id).toLowerCase();
    if (n === id || n.startsWith(id)) {
      if (!best || id.length > best.id.length) best = p;
    }
  }
  return best;
}

const cards = computed(() => {
  const out = platforms.value.map((p) => ({
    id: p.id,
    platformId: p.id,
    platform: p,
    label: p.label,
    remote: p.remote || null,
    account: p.account || null,
    connected: !!p.connected,
    auth: p.auth,
    freeTier: p.freeTier,
    error: p.error || null,
    isExtra: false,
  }));
  // Remote tambahan: nama bukan id platform (mis. "mega2") tetap jadi kartu sendiri.
  const ids = platformIds.value;
  for (const r of remotes.value) {
    const name = r.name;
    if (!name || ids.has(name)) continue;
    const p = platformForRemote(name);
    out.push({
      id: name,
      platformId: p ? p.id : null,
      platform: p || null,
      label: p ? p.label : name,
      remote: name,
      account: r.account || null,
      connected: true,
      auth: p ? p.auth : null,
      freeTier: p ? p.freeTier : null,
      error: r.ok === false ? r.error || 'Remote tidak bisa dibaca.' : null,
      isExtra: true,
    });
  }
  return out;
});

function remoteNameOf(card) {
  return card.remote || card.id;
}
function remoteInfo(card) {
  return remotes.value.find((r) => r.name === remoteNameOf(card)) || null;
}
function capacityOf(card) {
  if (card.total != null || card.used != null) {
    return { used: card.used || 0, total: card.total || 0, free: card.free };
  }
  const r = remoteInfo(card);
  if (r && (r.total != null || r.used != null)) {
    return { used: r.used || 0, total: r.total || 0, free: r.free };
  }
  return null;
}
function isActive(card) {
  if (!card.connected) return false;
  const r = remoteInfo(card);
  if (r) return r.ok !== false;
  return true;
}
function pct(c) {
  if (!c || !c.total) return 0;
  return Math.min(100, (c.used / c.total) * 100);
}
function pctLabel(c) {
  const v = pct(c);
  return `${v.toFixed(v >= 10 ? 0 : 1)}%`;
}
function isProtected(card) {
  return remoteNameOf(card) === 'gdrive';
}
function iconOf(card) {
  const key = card.platformId ? ICON_KEY[card.platformId] || card.platformId : `${card.remote}:`;
  return providerIcon(key);
}
function iconOfPlatform(p) {
  return providerIcon(ICON_KEY[p?.id] || p?.id);
}
function fmtBytes(v) {
  return v > 0 ? formatBytes(v) : '0 B';
}

// Nama remote default untuk akun tambahan: id platform + angka berikutnya
// yang belum terpakai (mega -> mega2, kalau mega2 ada -> mega3).
function nextRemoteName(platformId) {
  if (!platformId) return '';
  const used = new Set(remotes.value.map((r) => r.name));
  if (!used.has(platformId)) return platformId;
  let n = 2;
  while (used.has(`${platformId}${n}`)) n += 1;
  return `${platformId}${n}`;
}
function canAddAccount(card) {
  return card.connected && !card.isExtra && !!card.platformId;
}

function clearMsgs(id) {
  actionError.value = { ...actionError.value, [id]: '' };
  notice.value = { ...notice.value, [id]: '' };
}
function setBusy(id, v) {
  busy.value = { ...busy.value, [id]: v };
}

function openForm(platform, mode, defaultRemote) {
  formPlatform.value = platform;
  formMode.value = mode;
  formDefaultRemote.value = defaultRemote;
}
function closeForm() {
  formPlatform.value = null;
  formMode.value = 'connect';
  formDefaultRemote.value = '';
}
function onConnect(card) {
  clearMsgs(card.id);
  if (card.auth === 'form') {
    openForm(card.platform, 'connect', card.platformId);
    return;
  }
  startOauth(card.platform);
}
function openAddAccount(card) {
  clearMsgs(card.id);
  openForm(card.platform, 'add', nextRemoteName(card.platformId));
}

function onFormConnected({ remote, warning }) {
  const key = remote || formPlatform.value?.id;
  closeForm();
  if (warning) notice.value = { ...notice.value, [key]: warning };
  load();
  emit('changed');
}
function onFormOauthStarted({ platform, process, authUrl }) {
  closeForm();
  oauth.value = { platform, process, authUrl: authUrl || '', status: 'waiting', error: '' };
  startOauthPoll();
}

async function startOauth(p) {
  setBusy(p.id, true);
  try {
    const d = await api('/api/platforms/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, name: p.id }),
    });
    oauth.value = { platform: p, process: d.process, authUrl: d.authUrl || '', status: 'waiting', error: '' };
    startOauthPoll();
  } catch (e) {
    actionError.value = { ...actionError.value, [p.id]: e.message };
  } finally {
    setBusy(p.id, false);
  }
}

function startOauthPoll() {
  stopOauthPoll();
  pollOauth();
  oauthTimer = setInterval(pollOauth, 2000);
}
async function pollOauth() {
  const o = oauth.value;
  if (!o || !o.process || o.status === 'done' || o.status === 'failed') return;
  const process = o.process;
  try {
    const d = await api(`/api/platforms/oauth/${encodeURIComponent(process)}`);
    if (!oauth.value || oauth.value.process !== process) return; // modal ditutup / diganti
    if (d.authUrl) oauth.value.authUrl = d.authUrl;
    if (d.status === 'done') {
      oauth.value.status = 'done';
      stopOauthPoll();
      await load();
      emit('changed');
    } else if (d.status === 'failed') {
      oauth.value.status = 'failed';
      oauth.value.error = d.error || 'Proses login gagal atau timeout.';
      stopOauthPoll();
    } else {
      oauth.value.status = 'waiting';
    }
  } catch (e) {
    if (!oauth.value || oauth.value.process !== process) return;
    oauth.value.status = 'failed';
    oauth.value.error = e.message;
    stopOauthPoll();
  }
}
function stopOauthPoll() {
  if (oauthTimer) {
    clearInterval(oauthTimer);
    oauthTimer = null;
  }
}
function closeOauth() {
  stopOauthPoll();
  oauth.value = null;
}

async function disconnect(card) {
  const remote = remoteNameOf(card);
  if (!window.confirm(`Putuskan ${card.label}? Remote "${remote}" akan dihapus dari rclone.conf. Berkas yang sudah ada di drive tidak dihapus.`)) return;
  clearMsgs(card.id);
  setBusy(card.id, true);
  try {
    await api('/api/platforms/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remote }),
    });
    await load();
    emit('changed');
  } catch (e) {
    actionError.value = { ...actionError.value, [card.id]: e.code === 'protected' ? 'Platform ini dilindungi dan tidak bisa diputuskan.' : e.message };
  } finally {
    setBusy(card.id, false);
  }
}

async function mirror(card) {
  const remote = remoteNameOf(card);
  clearMsgs(card.id);
  setBusy(card.id, true);
  try {
    const d = await api('/api/jobs/mirror', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remote }),
    });
    const created = (d.created || []).length;
    const skipped = (d.skipped || []).length;
    notice.value = { ...notice.value, [card.id]: `Job mirror ${remote}: ${created} dibuat, ${skipped} dilewati (sudah ada).` };
  } catch (e) {
    actionError.value = { ...actionError.value, [card.id]: e.message };
  } finally {
    setBusy(card.id, false);
  }
}

onMounted(load);
onBeforeUnmount(stopOauthPoll);
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="rounded-[24px] bg-white p-5 dark:bg-slate-800 sm:p-7">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="mb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[#1a73e8] dark:text-sky-400">Akun</p>
          <h1 class="text-[26px] font-medium text-[#202124] dark:text-slate-100">Hubungkan Akun</h1>
          <p class="mt-2 max-w-[720px] text-sm text-[#5f6368] dark:text-slate-400">
            Sambungkan drive pribadi Anda (MEGA, pCloud, OneDrive, Google Drive) sebagai remote rclone.
            Anda juga bisa menambahkan lebih dari satu akun untuk platform yang sama.
            Setelah terhubung, Anda bisa membuat job mirror dari template Google Drive.
          </p>
        </div>
        <button type="button" class="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-[#dadce0] bg-white px-4 text-sm font-medium text-[#3c4043] transition hover:bg-[#f8fafd] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700" :disabled="loading" @click="load">
          <IconRefresh :size="17" :stroke="1.8" :class="loading ? 'animate-spin' : ''" />
          Muat ulang
        </button>
      </div>
    </div>

    <LoadingState v-if="loading" message="Membaca daftar platform..." />

    <div v-else-if="error" class="rounded-[24px] border border-[#e0e3e7] bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
      <p class="font-medium text-[#c5221f]">Daftar platform tidak bisa dibaca</p>
      <p class="mt-1 text-sm text-[#5f6368] dark:text-slate-400">{{ error }}</p>
      <button type="button" class="mt-3 inline-flex h-10 items-center rounded-full border border-[#dadce0] bg-white px-5 text-sm font-medium text-[#3c4043] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" @click="load">Coba lagi</button>
    </div>

    <div v-else-if="!cards.length" class="flex flex-col items-center gap-2 rounded-[24px] border border-dashed border-[#e0e3e7] py-14 text-center dark:border-slate-700">
      <IconCloudPlus :size="28" :stroke="1.5" class="text-[#5f6368] dark:text-slate-400" />
      <p class="font-medium text-[#5f6368] dark:text-slate-300">Belum ada platform yang tersedia</p>
    </div>

    <div v-else class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <article
        v-for="card in cards"
        :key="card.id"
        class="flex flex-col rounded-2xl border border-[#e0e3e7] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:border-[#c7d2e0] hover:shadow-[0_4px_12px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-800"
      >
        <header class="flex items-start justify-between gap-3">
          <div class="flex min-w-0 items-center gap-2.5">
            <span class="grid size-10 shrink-0 place-items-center rounded-full bg-[#f1f3f4] dark:bg-slate-700">
              <img v-if="iconOf(card)" :src="iconOf(card)" :alt="card.label" class="size-5 object-contain" />
              <IconCloudPlus v-else :size="20" :stroke="1.8" class="text-[#5f6368] dark:text-slate-300" />
            </span>
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-[#202124] dark:text-slate-100">{{ card.label }}</p>
              <p class="truncate font-mono text-xs text-[#5f6368] dark:text-slate-400">
                {{ card.connected ? remoteNameOf(card) : `Gratis ${card.freeTier}` }}
              </p>
            </div>
          </div>
          <div class="flex shrink-0 flex-col items-end gap-1">
            <span
              class="rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
              :class="card.connected
                ? 'border-[#34a853]/35 bg-[#e6f4ea] text-[#137333] dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300'
                : 'border-[#dadce0] bg-[#f1f3f4] text-[#5f6368] dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300'"
            >{{ card.connected ? 'Terhubung' : 'Belum terhubung' }}</span>
            <span
              v-if="card.isExtra"
              class="rounded-full border border-[#dadce0] bg-[#f1f3f4] px-2 py-0.5 text-[11px] font-medium text-[#5f6368] dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
            >Akun tambahan</span>
            <span
              v-else-if="card.connected && isActive(card)"
              class="inline-flex items-center gap-1 rounded-full border border-[#1a73e8]/35 bg-[#e8f0fe] px-2 py-0.5 text-[11px] font-medium text-[#1967d2] dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-300"
            >
              <span class="size-1.5 rounded-full bg-[#1a73e8] dark:bg-sky-300" />
              Aktif
            </span>
          </div>
        </header>

        <p
          v-if="card.account"
          class="mt-2.5 flex items-center gap-1.5 text-xs text-[#5f6368] dark:text-slate-400"
          :title="card.account"
        >
          <IconAt :size="14" :stroke="1.8" class="shrink-0 text-[#9aa0a6] dark:text-slate-500" />
          <span class="truncate font-mono">{{ card.account }}</span>
        </p>

        <p v-if="card.error" class="mt-3 flex items-start gap-1.5 text-xs text-[#c5221f] dark:text-red-300">
          <IconAlertTriangle :size="14" :stroke="2" class="mt-0.5 shrink-0" />
          {{ card.error }}
        </p>

        <div class="mt-3 min-h-[52px]">
          <template v-if="capacityOf(card)">
            <div class="h-1.5 w-full overflow-hidden rounded-full bg-[#e8eaed] dark:bg-slate-700">
              <div class="h-full rounded-full bg-[#1a73e8] dark:bg-sky-400" :style="{ width: `${pct(capacityOf(card))}%` }" />
            </div>
            <div class="mt-2 flex items-center justify-between text-xs">
              <span class="text-[#5f6368] dark:text-slate-400">
                {{ fmtBytes(capacityOf(card).used) }} / {{ fmtBytes(capacityOf(card).total) }}
              </span>
              <span class="font-medium text-[#1a73e8] dark:text-sky-300">{{ pctLabel(capacityOf(card)) }}</span>
            </div>
          </template>
          <p v-else-if="card.connected" class="text-xs text-[#5f6368] dark:text-slate-400">Kapasitas belum tersedia.</p>
          <p v-else class="text-xs text-[#5f6368] dark:text-slate-400">Belum terhubung. Kapasitas muncul setelah tersambung.</p>
        </div>

        <p v-if="actionError[card.id]" class="mt-3 flex items-start gap-1.5 rounded-lg border border-[#ea4335]/35 bg-[#ea4335]/10 px-2.5 py-1.5 text-xs text-[#c5221f] dark:border-red-400/30 dark:text-red-300">
          <IconAlertTriangle :size="14" :stroke="2" class="mt-0.5 shrink-0" />
          {{ actionError[card.id] }}
        </p>
        <p v-if="notice[card.id]" class="mt-3 flex items-start gap-1.5 rounded-lg border border-[#34a853]/35 bg-[#e6f4ea] px-2.5 py-1.5 text-xs text-[#137333] dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300">
          <IconCircleCheck :size="14" :stroke="2" class="mt-0.5 shrink-0" />
          {{ notice[card.id] }}
        </p>

        <div class="mt-4 flex flex-wrap items-center gap-2 pt-1">
          <template v-if="!card.connected">
            <button
              type="button"
              class="inline-flex h-10 items-center gap-2 rounded-full bg-[#1a73e8] px-4 text-sm font-medium text-white transition hover:bg-[#1765cc] disabled:opacity-60"
              :disabled="busy[card.id]"
              v-if="canWrite" @click="onConnect(card)"
            >
              <IconLoader2 v-if="busy[card.id]" :size="17" :stroke="2" class="animate-spin" />
              <IconPlugConnected v-else :size="17" :stroke="2" />
              {{ busy[card.id] ? 'Menyiapkan...' : 'Hubungkan' }}
            </button>
          </template>

          <template v-else>
            <button
              type="button"
              class="inline-flex h-10 items-center gap-2 rounded-full border border-[#1a73e8]/40 bg-[#e8f0fe] px-4 text-sm font-medium text-[#1967d2] transition hover:bg-[#dbe7fb] disabled:opacity-60 dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-300"
              :disabled="busy[card.id]"
              v-if="canWrite" @click="mirror(card)"
            >
              <IconLoader2 v-if="busy[card.id]" :size="17" :stroke="2" class="animate-spin" />
              <IconArrowsExchange v-else :size="17" :stroke="2" />
              Buat job mirror
            </button>

            <button
              v-if="canAddAccount(card) && canWrite"
              type="button"
              class="inline-flex h-10 items-center gap-2 rounded-full border border-[#1a73e8]/40 bg-white px-4 text-sm font-medium text-[#1967d2] transition hover:bg-[#f0f6ff] disabled:opacity-60 dark:border-sky-400/30 dark:bg-slate-800 dark:text-sky-300 dark:hover:bg-slate-700"
              :disabled="busy[card.id]"
              @click="openAddAccount(card)"
            >
              <IconPlus :size="17" :stroke="2" />
              Tambah akun {{ card.label }}
            </button>

            <span
              v-if="isProtected(card)"
              class="inline-flex h-10 items-center gap-2 rounded-full border border-[#dadce0] bg-[#f1f3f4] px-4 text-sm font-medium text-[#5f6368] dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
              title="Platform ini dilindungi dan tidak bisa diputuskan"
            >
              <IconLock :size="17" :stroke="1.8" />
              Dilindungi
            </span>
            <button
              v-else-if="canWrite"
              type="button"
              class="inline-flex h-10 items-center gap-2 rounded-full border border-[#ea4335]/50 bg-[#ea4335]/10 px-4 text-sm font-medium text-[#c5221f] transition hover:bg-[#ea4335]/20 disabled:opacity-60 dark:border-red-400/40 dark:text-red-300"
              :disabled="busy[card.id]"
              @click="disconnect(card)"
            >
              <IconUnlink :size="17" :stroke="1.8" />
              Putuskan
            </button>
          </template>
        </div>
      </article>
    </div>

    <ConnectFormModal
      v-if="formPlatform"
      :platform="formPlatform"
      :mode="formMode"
      :default-remote-name="formDefaultRemote"
      @close="closeForm"
      @connected="onFormConnected"
      @oauth="onFormOauthStarted"
    />

    <!-- Modal OAuth -->
    <div v-if="oauth" class="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 p-4" @click.self="closeOauth">
      <div class="w-full max-w-[480px] overflow-hidden rounded-2xl bg-white shadow-[0_20px_40px_rgba(15,23,42,0.18)] dark:bg-slate-800">
        <header class="flex items-center gap-3 border-b border-[#eceff1] px-6 py-4 dark:border-slate-700">
          <span class="grid size-10 place-items-center rounded-full bg-[#e8f0fe] text-[#1a73e8] dark:bg-sky-500/15 dark:text-sky-300">
            <img v-if="iconOf(oauth.platform)" :src="iconOf(oauth.platform)" :alt="oauth.platform.label" class="size-5 object-contain" />
            <IconPlugConnected v-else :size="22" :stroke="2" />
          </span>
          <div class="min-w-0">
            <h2 class="text-lg font-semibold text-[#202124] dark:text-slate-100">Hubungkan {{ oauth.platform.label }}</h2>
            <p class="text-xs text-[#5f6368] dark:text-slate-400">Login lewat browser, lalu kembali ke halaman ini.</p>
          </div>
          <button type="button" class="ml-auto grid size-8 shrink-0 place-items-center rounded-full text-[#5f6368] transition hover:bg-black/5 dark:text-slate-400 dark:hover:bg-white/10" aria-label="Tutup" @click="closeOauth">
            <IconX :size="18" :stroke="2" />
          </button>
        </header>

        <div class="px-6 py-5">
          <template v-if="oauth.status === 'waiting'">
            <p class="text-sm text-[#3c4043] dark:text-slate-200">Menunggu Anda login di browser...</p>
            <p class="mt-1 flex items-center gap-2 text-xs text-[#5f6368] dark:text-slate-400">
              <IconLoader2 :size="14" :stroke="2" class="animate-spin" />
              Memeriksa status setiap 2 detik.
            </p>

            <div v-if="oauth.authUrl" class="mt-4">
              <a
                :href="oauth.authUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex h-11 items-center gap-2 rounded-full bg-[#1a73e8] px-5 text-sm font-medium text-white transition hover:bg-[#1765cc]"
              >
                <IconExternalLink :size="18" :stroke="2" />
                Buka halaman login {{ oauth.platform.label }}
              </a>
              <p class="mt-2 break-all font-mono text-[11px] text-[#5f6368] dark:text-slate-400">{{ oauth.authUrl }}</p>
            </div>
            <p v-else class="mt-4 flex items-center gap-2 text-sm text-[#5f6368] dark:text-slate-400">
              <IconLoader2 :size="16" :stroke="2" class="animate-spin" />
              Menyiapkan tautan login...
            </p>
          </template>

          <template v-else-if="oauth.status === 'done'">
            <div class="flex items-start gap-3 rounded-xl border border-[#34a853]/35 bg-[#e6f4ea] px-4 py-3 dark:border-emerald-400/30 dark:bg-emerald-400/10">
              <IconCircleCheck :size="20" :stroke="2" class="mt-0.5 shrink-0 text-[#137333] dark:text-emerald-300" />
              <div>
                <p class="text-sm font-medium text-[#137333] dark:text-emerald-300">{{ oauth.platform.label }} berhasil terhubung.</p>
                <p class="mt-0.5 text-xs text-[#137333]/80 dark:text-emerald-300/80">Remote rclone sudah siap dipakai.</p>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="flex items-start gap-3 rounded-xl border border-[#ea4335]/35 bg-[#ea4335]/10 px-4 py-3 dark:border-red-400/30 dark:bg-red-400/10">
              <IconAlertTriangle :size="20" :stroke="2" class="mt-0.5 shrink-0 text-[#c5221f] dark:text-red-300" />
              <div>
                <p class="text-sm font-medium text-[#c5221f] dark:text-red-300">Login gagal</p>
                <p class="mt-0.5 text-xs text-[#c5221f]/80 dark:text-red-300/80">{{ oauth.error }}</p>
              </div>
            </div>
          </template>
        </div>

        <footer class="flex justify-end gap-2 border-t border-[#eceff1] px-6 py-4 dark:border-slate-700">
          <button type="button" class="inline-flex h-10 items-center rounded-full border border-[#dadce0] bg-white px-5 text-sm font-medium text-[#3c4043] transition hover:bg-[#f8fafd] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" @click="closeOauth">
            {{ oauth.status === 'waiting' ? 'Batal' : 'Tutup' }}
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>
