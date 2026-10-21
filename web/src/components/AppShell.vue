<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  IconAlertTriangle,
  IconBell,
  IconCircleCheck,
  IconEye,
  IconHelp,
  IconLogout,
  IconX,
  IconMenu2,
  IconMoon,
  IconSun,
  IconUser,
} from '@tabler/icons-vue';
import { apiFetch } from '../composables/useApi.js';
import AppSidebar from './AppSidebar.vue';
import BrandMark from './BrandMark.vue';
import BrandWordmark from './BrandWordmark.vue';
import AppSearch from './AppSearch.vue';
import HelpModal from './HelpModal.vue';

const props = defineProps({
  currentSection: { type: String, required: true },
  remotes: { type: Array, default: () => [] },
  active: { type: String, default: '' },
  status: { type: Object, default: null },
  files: { type: Array, default: () => [] },
  user: { type: Object, default: null },
});

const isViewer = computed(() => props.user?.role === 'viewer');

const emit = defineEmits(['select-remote', 'view', 'new-folder', 'open-file', 'logout']);

const isMobileNavOpen = ref(false);
const isHelpModalOpen = ref(false);
const theme = ref('light');

// --- Pemberitahuan: ringkasan job backup + peringatan kapasitas ---
const notifOpen = ref(false);
const notifItems = ref([]);
const notifLoading = ref(false);
const notifError = ref('');

const notifBadge = computed(() => notifItems.value.some((n) => n.kind === 'warn'));

let notifSafety = null;

async function loadNotif() {
  // Loading ditandai hanya sebagai petunjuk; UI tidak pernah menunggunya.
  notifLoading.value = true;
  notifError.value = '';
  window.clearTimeout(notifSafety);
  notifSafety = window.setTimeout(() => { notifLoading.value = false; }, 12000);
  const items = [];
  // Timeout supaya permintaan yang menggantung tidak membuat spinner
  // berputar selamanya.
  const tmo = () => (AbortSignal.timeout ? { signal: AbortSignal.timeout(8000) } : {});
  try {
    const r = await apiFetch('/api/jobs', tmo());
    const d = await r.json();
    for (const job of d.jobs || []) {
      const st = job.lastRun?.status;
      if (st === 'failed' || st === 'interrupted') {
        items.push({ kind: 'warn', text: `Job "${job.name}" ${st === 'failed' ? 'gagal' : 'terputus'}. Jalankan ulang dari halaman Backup.` });
      } else if (st === 'running') {
        items.push({ kind: 'ok', text: `Job "${job.name}" sedang berjalan.` });
      } else if (st === 'done') {
        items.push({ kind: 'ok', text: `Job "${job.name}" selesai.` });
      }
    }
    if (!items.length) items.push({ kind: 'ok', text: 'Belum ada job backup yang dijalankan.' });
  } catch (e) {
    notifError.value = e.message;
  }

  // Peringatan kapasitas untuk remote yang penuh atau over-quota.
  try {
    const r2 = await apiFetch('/api/remotes', tmo());
    const d2 = await r2.json();
    for (const rem of d2.remotes || []) {
      if (!rem.ok || !rem.total) continue;
      const pct = (rem.used / rem.total) * 100;
      if (pct >= 100) {
        items.push({ kind: 'warn', text: `Remote "${rem.name}" sudah melebihi kuota (${pct.toFixed(0)}%). Upload baru akan gagal.` });
      } else if (pct >= 90) {
        items.push({ kind: 'warn', text: `Remote "${rem.name}" hampir penuh (${pct.toFixed(0)}%).` });
      }
      if (rem.free < 0) {
        items.push({ kind: 'warn', text: `Remote "${rem.name}" kelebihan ${(Math.abs(rem.free) / 1e9).toFixed(0)} GB. Kosongkan atau pindahkan berkas.` });
      }
    }
  } catch (e) {
    /* biarkan: peringatan kapasitas opsional */
  }

// Item transfer dari HP (LocalSend). Ditampilkan hanya kalau transfer sedang
  // aktif ATAU baru selesai (kurang dari 1 jam), supaya bell tidak dipenuhi
  // entri lama dari transfer hari-hari sebelumnya. Endpoint admin-only, jadi
  // blok ini hanya dijalankan untuk admin.
  if (props.user?.role === 'admin') {
    try {
      const r3 = await apiFetch('/api/phone/status', tmo());
      const d3 = await r3.json();
      const st = d3.live;
      const active = st && (st.phase === 'receiving' || st.phase === 'pushing');
      const recent = st && st.finishedAt && Date.now() - new Date(st.finishedAt).getTime() < 3600000;
      if (st && st.phase !== 'idle' && (active || recent)) {
        const rx = Number(st.receivedBytes) || 0;
        const mbText = `${(rx / 1e6).toFixed(rx >= 1e7 ? 0 : 1)} MB`;
        if (st.phase === 'receiving') {
          items.push({ kind: 'ok', text: `Transfer dari HP: ${st.receivedFiles}/${st.totalFiles} file diterima (${mbText}).` });
        } else if (st.phase === 'pushing') {
          items.push({ kind: 'ok', text: `Transfer dari HP: ${st.pushedFiles}/${st.totalFiles} file terkirim ke ${st.dest}.` });
        } else if (st.phase === 'done' && st.failedFiles === 0) {
          items.push({ kind: 'ok', text: `Transfer dari HP selesai (${st.totalFiles} file).` });
        }
        if (st.failedFiles > 0) {
          items.push({ kind: 'warn', text: `Transfer dari HP: ${st.failedFiles} file gagal terkirim. Cek halaman Transfer.` });
        }
      }
    } catch (e) {
      /* gagal: lewati saja, bell dari jobs sudah menangani sesi berakhir */
    }
  }

  notifItems.value = items;
  notifLoading.value = false;
}

function toggleNotif() {
  notifOpen.value = !notifOpen.value;
  if (notifOpen.value) loadNotif();
}

function applyTheme(next) {
  theme.value = next;
  document.documentElement.classList.toggle('dark', next === 'dark');
  window.localStorage.setItem('omni-buddy-theme', next);
}
function toggleTheme() {
  applyTheme(theme.value === 'dark' ? 'light' : 'dark');
}
function closeMobileNav() {
  isMobileNavOpen.value = false;
}
function handleSelectRemote(name) {
  isMobileNavOpen.value = false;
  emit('select-remote', name);
}
function handleView(v) {
  isMobileNavOpen.value = false;
  emit('view', v);
}

const connected = computed(() => props.status?.connected === true);

function handleWindowKeydown(event) {
  if (event.key === 'Escape') {
    isHelpModalOpen.value = false;
    isMobileNavOpen.value = false;
    notifOpen.value = false;
  }
}

function handleDocumentClick(event) {
  if (notifOpen.value && !event.target.closest('[data-notif-root]')) notifOpen.value = false;
}

onMounted(() => {
  theme.value = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  window.addEventListener('keydown', handleWindowKeydown);
  document.addEventListener('click', handleDocumentClick);
  // Muat sekali agar badge peringatan langsung akurat saat halaman dibuka.
  loadNotif();
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeydown);
  document.removeEventListener('click', handleDocumentClick);
});
</script>

<template>
  <div class="flex h-screen flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
    <HelpModal :version="status?.version" :rc="status?.rc" :open="isHelpModalOpen" @close="isHelpModalOpen = false" />

    <header class="sg-panel z-30 grid h-16 shrink-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 px-2 sm:gap-4 sm:px-4 lg:grid-cols-[256px_minmax(320px,720px)_1fr] lg:gap-3 lg:px-0 lg:pr-4">
      <div class="flex min-w-0 items-center gap-2 lg:gap-3 lg:pl-4">
        <button type="button" class="sg-control sg-hover grid size-10 shrink-0 place-items-center rounded-full text-[var(--muted-foreground)] transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] lg:hidden" aria-label="Buka menu navigasi" @click.stop="isMobileNavOpen = !isMobileNavOpen">
          <IconMenu2 :size="22" :stroke="2" />
        </button>
        <div class="hidden items-center gap-2.5 lg:flex">
          <BrandMark :size="30" class="shrink-0 text-[var(--foreground)]" />
          <BrandWordmark :size="22" :lead="false" class="text-[var(--foreground)]" />
        </div>
        <span class="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] lg:hidden">
          <span class="size-2 rounded-full" :class="connected ? 'bg-[var(--success)]' : 'bg-[var(--destructive)]'"></span>
          {{ connected ? 'terhubung' : 'terputus' }}
        </span>
      </div>

      <div class="flex min-w-0 justify-center">
        <AppSearch :files="files" @open-file="emit('open-file', $event)" />
      </div>

      <div class="flex items-center justify-end gap-1 pr-1 sm:gap-2">
        <span v-if="isViewer" class="hidden items-center gap-1.5 rounded-full border border-[var(--status-interrupted)] px-3 py-1.5 text-xs font-medium text-[var(--status-interrupted)] sm:flex" title="Aksi yang mengubah data dinonaktifkan untuk viewer">
          <IconEye :size="14" :stroke="2" />
          Mode lihat
        </span>
        <span v-if="user" class="sg-control hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs text-[var(--muted-foreground)] md:flex">
          <IconUser :size="14" :stroke="2" />
          {{ user.username }}
          <span class="sg-control rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">{{ user.role }}</span>
        </span>
        <span class="sg-control hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs text-[var(--muted-foreground)] xl:flex">
          <span class="size-2 rounded-full" :class="connected ? 'bg-[var(--success)]' : 'bg-[var(--destructive)]'"></span>
          {{ connected ? `rclone ${status?.version || ''}` : 'rclone terputus' }}
        </span>
        <button type="button" class="sg-control sg-hover grid size-10 place-items-center rounded-full text-[var(--muted-foreground)] transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]" :aria-label="theme === 'dark' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'" @click="toggleTheme">
          <component :is="theme === 'dark' ? IconSun : IconMoon" :size="20" :stroke="2" />
        </button>
        <button type="button" class="sg-control sg-hover grid size-10 place-items-center rounded-full text-[var(--muted-foreground)] transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]" aria-label="Buka bantuan" @click="isHelpModalOpen = true">
          <IconHelp :size="20" :stroke="2" />
        </button>
        <div class="relative" data-notif-root>
          <button
            type="button"
            class="sg-control sg-hover relative grid size-10 place-items-center rounded-full text-[var(--muted-foreground)] transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]"
            aria-label="Pemberitahuan"
            :aria-expanded="notifOpen"
            @click.stop="toggleNotif"
          >
            <IconBell :size="20" :stroke="2" />
            <span
              v-if="notifBadge"
              class="absolute right-1.5 top-1.5 size-2 rounded-full bg-[var(--destructive)]"
              aria-hidden="true"
            />
          </button>
          <div
            v-if="notifOpen"
            class="sg-popover absolute right-0 top-full z-40 mt-2 w-[350px] max-w-[85vw] overflow-hidden"
          >
            <header class="flex items-center justify-between border-b border-[var(--glass-edge)] px-4 py-3">
              <span class="text-xs font-bold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Pemberitahuan</span>
              <button type="button" class="sg-control sg-hover grid size-7 place-items-center rounded-full text-[var(--muted-foreground)] transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]" aria-label="Tutup" @click="notifOpen = false">
                <IconX :size="15" :stroke="2" />
              </button>
            </header>

            <div v-if="notifError" class="px-4 py-4 text-sm text-[var(--destructive)]">
              {{ notifError }}
            </div>

            <p v-else-if="notifLoading && !notifItems.length" class="px-4 py-4 text-sm text-[var(--muted-foreground)]">
              Memuat pemberitahuan...
            </p>

            <ul v-if="!notifError" class="max-h-[min(60vh,420px)] overflow-y-auto px-2 pb-4 pt-2">
              <li
                v-for="(n, i) in notifItems"
                :key="i"
                class="sg-control flex items-start gap-2.5 px-3 py-2.5 text-sm"
                :class="n.kind === 'warn' ? 'text-[var(--destructive)]' : 'text-[var(--foreground)]'"
              >
                <IconAlertTriangle v-if="n.kind === 'warn'" :size="16" :stroke="2" class="mt-0.5 shrink-0" />
                <IconCircleCheck v-else :size="16" :stroke="2" class="mt-0.5 shrink-0 text-[var(--success)]" />
                <span class="min-w-0 leading-snug">{{ n.text }}</span>
              </li>
              <li v-if="!notifItems.length" class="px-3 py-3 text-sm text-[var(--muted-foreground)]">
                Tidak ada pemberitahuan. Semua berjalan normal.
              </li>
            </ul>

            <footer class="border-t border-[var(--glass-edge)] px-4 py-3 text-right">
              <button type="button" class="text-xs font-medium text-[var(--foreground)] underline-offset-2 transition hover:underline" @click="loadNotif">
                Muat ulang
              </button>
            </footer>
          </div>
        </div>
        <button type="button" class="sg-control sg-hover grid size-10 place-items-center rounded-full text-[var(--muted-foreground)] transition hover:text-[var(--destructive)] focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]" aria-label="Keluar" title="Keluar" @click="emit('logout')">
          <IconLogout :size="20" :stroke="2" />
        </button>
      </div>
    </header>

    <div class="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[256px_minmax(0,1fr)]">
      <div class="hidden h-full overflow-hidden border-r border-[var(--glass-edge)] px-3 py-4 lg:block">
        <AppSidebar :remotes="remotes" :active="active" :current-section="currentSection" :user="user" @select-remote="handleSelectRemote" @view="handleView" />
      </div>

      <div v-if="isMobileNavOpen" class="fixed inset-0 z-40 lg:hidden" @click.self="closeMobileNav">
        <div class="absolute inset-0 bg-[var(--foreground)]/40" />
        <div class="sg-panel absolute left-0 top-0 flex h-full w-[280px] flex-col overflow-hidden px-3 py-4" data-mobile-nav-card>
          <AppSidebar :remotes="remotes" :active="active" :current-section="currentSection" :user="user" @select-remote="handleSelectRemote" @view="handleView" />
        </div>
      </div>

      <main class="min-w-0 overflow-y-auto px-3 pb-10 pt-4 sm:px-6">
        <slot />
      </main>
    </div>
  </div>
</template>