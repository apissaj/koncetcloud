<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { IconAlertTriangle } from '@tabler/icons-vue';
import AppShell from './components/AppShell.vue';
import FileExplorer from './components/FileExplorer.vue';
import BackupJobs from './components/BackupJobs.vue';
import HomeView from './components/HomeView.vue';
import QuotaPanel from './components/QuotaPanel.vue';
import AccountsPanel from './components/AccountsPanel.vue';
import UsersPanel from './components/UsersPanel.vue';
import AuditPanel from './components/AuditPanel.vue';
import LoginView from './components/LoginView.vue';

const view = ref('drive');
const remotes = ref([]);
const activeRemote = ref('');
const currentPath = ref('');
const status = ref(null);
const statusError = ref('');
const remotesError = ref('');
const rootFiles = ref([]);
const authed = ref(null); // null = sedang memeriksa sesi
const currentUser = ref(null); // { username, role }
const isAdmin = computed(() => currentUser.value?.role === 'admin');
const sessionError = ref('');

const VIEW_HASH = { home: 'beranda', drive: 'drive', jobs: 'backup', quota: 'penyimpanan', accounts: 'akun', users: 'pengguna', audit: 'riwayat' };
const HASH_VIEW = { beranda: 'home', drive: 'drive', berkas: 'drive', backup: 'jobs', penyimpanan: 'quota', kapasitas: 'quota', akun: 'accounts', pengguna: 'users', riwayat: 'audit' };

async function api(url, opts) {
  const r = await fetch(url, opts);
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) {
    authed.value = false;
    throw new Error(d.error || 'Sesi berakhir. Masuk lagi.');
  }
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

async function checkSession() {
  sessionError.value = '';
  try {
    const r = await fetch('/api/session');
    const d = await r.json().catch(() => ({}));
    authed.value = d.authenticated === true;
    currentUser.value = d.user || null;
  } catch (e) {
    authed.value = false;
    currentUser.value = null;
    sessionError.value = e.message;
  }
}

async function onAuthed(user) {
  authed.value = true;
  currentUser.value = user || null;
  await loadStatus();
}

async function logout() {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } catch (e) {
    /* tetap lanjut ke halaman login */
  }
  authed.value = false;
  currentUser.value = null;
  remotes.value = [];
  rootFiles.value = [];
  activeRemote.value = '';
  currentPath.value = '';
  status.value = null;
}

async function loadStatus() {
  statusError.value = '';
  try {
    status.value = await api('/api/status');
  } catch (e) {
    status.value = null;
    statusError.value = e.message;
  }
  try {
    const r = await api('/api/remotes');
    remotes.value = r.remotes || [];
    remotesError.value = '';
    if (!activeRemote.value && remotes.value.length) activeRemote.value = `${remotes.value[0].name}:`;
  } catch (e) {
    remotes.value = [];
    // Jangan diam: kalau fetch gagal, tampilkan penyebabnya, bukan "belum ada remote".
    if (authed.value) remotesError.value = e.message;
  }
  if (activeRemote.value) loadRootFiles();
}

async function loadRootFiles() {
  try {
    const d = await api(`/api/files?fs=${encodeURIComponent(activeRemote.value)}&path=`);
    rootFiles.value = d.items || [];
  } catch (e) {
    rootFiles.value = [];
  }
}

function selectRemote(name) {
  activeRemote.value = `${name}:`;
  currentPath.value = '';
  view.value = 'drive';
  syncHash();
  loadRootFiles();
}
function changeView(v) {
  view.value = v;
  syncHash();
}
function navigate(p) {
  currentPath.value = p;
}
function goUp() {
  const parts = currentPath.value.split('/').filter(Boolean);
  parts.pop();
  currentPath.value = parts.join('/');
}
function openFile(item) {
  if (!item) return;
  if (item.dir) {
    view.value = 'drive';
    currentPath.value = item.path;
    syncHash();
    return;
  }
  const parent = item.path.split('/').slice(0, -1).join('/');
  view.value = 'drive';
  currentPath.value = parent;
  syncHash();
}
function onFilesLoaded() {
  if (!currentPath.value) loadRootFiles();
}

function syncHash() {
  const h = `#${VIEW_HASH[view.value] || view.value}`;
  if (location.hash !== h) history.replaceState(null, '', h);
}
function syncFromHash() {
  const v = HASH_VIEW[(location.hash || '').replace('#', '')];
  if (v) view.value = v;
}

const connected = computed(() => status.value?.connected === true);

// Bundle yang sedang dijalankan tab ini, diambil dari nama file script-nya.
const LOADED_BUILD = (document.currentScript?.src || '')
  .split('/')
  .pop() || [...document.querySelectorAll('script[src*="index-"]')].map((s) => s.src.split('/').pop())[0] || '';
const buildStale = ref(false);

// Kalau server menyajikan bundle yang beda dari yang dimuat tab ini, berarti
// aplikasi sudah di-rebuild: tawarkan muat ulang supaya tab lama tidak
// menampilkan UI basi tanpa penjelasan.
async function checkBuild() {
  if (!LOADED_BUILD) return;
  try {
    const r = await fetch('/api/health');
    const d = await r.json();
    if (d.build && d.build !== LOADED_BUILD) buildStale.value = true;
  } catch (e) {
    /* server sedang mati, biarkan */
  }
}

let buildTimer = null;

onMounted(async () => {
  syncFromHash();
  window.addEventListener('hashchange', syncFromHash);
  await checkSession();
  if (authed.value) loadStatus();
  checkBuild();
  buildTimer = setInterval(checkBuild, 20000);
});
</script>

<template>
  <div v-if="authed === null" class="grid min-h-screen place-items-center bg-[#f8fafd] dark:bg-slate-900">
    <p class="text-sm text-[#5f6368] dark:text-slate-400">Memeriksa sesi...</p>
  </div>

  <LoginView v-else-if="!authed" @authed="onAuthed" />

  <AppShell
    v-else
    :current-section="view"
    :remotes="remotes"
    :active="activeRemote"
    :status="status"
    :files="rootFiles"
    :user="currentUser"
    @select-remote="selectRemote"
    @view="changeView"
    @open-file="openFile"
    @logout="logout"
  >
    <div v-if="buildStale" class="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[#1a73e8]/35 bg-[#e8f0fe] px-4 py-3 text-sm text-[#1967d2] dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-300">
      <span>Versi baru KoncetCloud sudah tersedia. Muat ulang halaman untuk memakainya.</span>
      <button type="button" class="ml-auto inline-flex h-8 shrink-0 items-center rounded-full border border-[#1a73e8]/40 bg-white px-4 text-xs font-medium text-[#1967d2] transition hover:bg-[#1a73e8]/10 dark:bg-slate-800 dark:text-sky-300" @click="location.reload()">
        Muat ulang
      </button>
    </div>

    <div v-if="remotesError && !remotes.length" class="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[#ea4335]/35 bg-[#fce8e6] px-4 py-3 text-sm text-[#c5221f] dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300">
      <span>
        Gagal memuat daftar remote: {{ remotesError }}. Daftar kosong di sini BUKAN berarti
        belum ada remote.
      </span>
      <button type="button" class="ml-auto inline-flex h-8 shrink-0 items-center rounded-full border border-[#c5221f]/40 bg-white px-4 text-xs font-medium text-[#c5221f] transition hover:bg-[#c5221f]/10 dark:bg-slate-800 dark:text-red-300" @click="loadStatus">
        Muat ulang
      </button>
    </div>

    <div v-if="statusError" class="mb-4 flex items-start gap-2.5 rounded-2xl border border-[#ea4335]/35 bg-[#fce8e6] px-4 py-3 text-sm text-[#c5221f] dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300">
      <IconAlertTriangle :size="18" :stroke="2" class="mt-0.5 shrink-0" />
      <span>
        rclone lokal tidak bisa dihubungi ({{ statusError }}). Jalankan
        <span class="font-mono text-xs">rclone rcd --rc-addr 127.0.0.1:5572 --rc-no-auth --rc-serve</span>
        lalu muat ulang halaman.
      </span>
    </div>

    <HomeView
      v-if="view === 'home'"
      :remotes="remotes"
      :files="rootFiles"
      :active="activeRemote"
      :role="currentUser?.role"
      @view="changeView"
      @open-file="openFile"
    />

    <FileExplorer
      v-else-if="view === 'drive'"
      :fs="activeRemote"
      :path="currentPath"
      :role="currentUser?.role"
      @navigate="navigate"
      @up="goUp"
      @files-loaded="onFilesLoaded"
    />

    <BackupJobs v-else-if="view === 'jobs'" :role="currentUser?.role" />

    <UsersPanel v-else-if="view === 'users' && isAdmin" :current-user="currentUser" />
    <AuditPanel v-else-if="view === 'audit' && isAdmin" />

    <QuotaPanel v-else-if="view === 'quota'" :remotes="remotes" />

    <AccountsPanel v-else-if="view === 'accounts'" :role="currentUser?.role" @changed="loadStatus" />

    <p v-else class="rounded-2xl border border-[#e0e3e7] bg-white p-6 text-sm text-[#5f6368] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
      Halaman ini hanya untuk admin.
    </p>
  </AppShell>
</template>