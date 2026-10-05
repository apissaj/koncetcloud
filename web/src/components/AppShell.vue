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
import logoUrl from '../assets/logo.svg';
import AppSidebar from './AppSidebar.vue';
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
    const r = await fetch('/api/jobs', tmo());
    if (r.status === 401) throw new Error('Sesi berakhir. Masuk lagi.');
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
    const r2 = await fetch('/api/remotes', tmo());
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
  <div class="flex h-screen flex-col overflow-hidden bg-[#f8fafd] text-[#202124] dark:bg-slate-900 dark:text-slate-100">
    <HelpModal :version="status?.version" :rc="status?.rc" :open="isHelpModalOpen" @close="isHelpModalOpen = false" />

    <header class="z-30 grid h-16 shrink-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 bg-[#f8fafd] px-2 dark:bg-slate-900 sm:gap-4 sm:px-4 lg:grid-cols-[256px_minmax(320px,720px)_1fr] lg:gap-3 lg:px-0 lg:pr-4">
      <div class="flex min-w-0 items-center gap-2 lg:gap-3 lg:pl-4">
        <button type="button" class="grid size-10 shrink-0 place-items-center rounded-full text-[#5f6368] transition hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10 lg:hidden" aria-label="Buka menu navigasi" @click.stop="isMobileNavOpen = !isMobileNavOpen">
          <IconMenu2 :size="22" :stroke="2" />
        </button>
        <div class="hidden items-center gap-2 lg:flex">
          <span class="grid size-11 place-items-center overflow-hidden rounded-2xl bg-white dark:bg-slate-800">
            <img :src="logoUrl" alt="KoncetCloud" class="size-9 object-contain" />
          </span>
          <span class="text-[22px] font-semibold text-[#202124] dark:text-slate-100">KoncetCloud</span>
        </div>
        <span class="flex items-center gap-1.5 text-xs text-[#5f6368] dark:text-slate-400 lg:hidden">
          <span class="size-2 rounded-full" :class="connected ? 'bg-[#34a853]' : 'bg-[#ea4335]'"></span>
          {{ connected ? 'terhubung' : 'terputus' }}
        </span>
      </div>

      <div class="flex min-w-0 justify-center">
        <AppSearch :files="files" @open-file="emit('open-file', $event)" />
      </div>

      <div class="flex items-center justify-end gap-1 pr-1 sm:gap-2">
        <span v-if="isViewer" class="hidden items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 sm:flex" title="Aksi yang mengubah data dinonaktifkan untuk viewer">
          <IconEye :size="14" :stroke="2" />
          Mode lihat
        </span>
        <span v-if="user" class="hidden items-center gap-2 rounded-full border border-[#e0e3e7] px-3 py-1.5 text-xs text-[#5f6368] dark:border-slate-700 dark:text-slate-400 md:flex">
          <IconUser :size="14" :stroke="2" />
          {{ user.username }}
          <span class="rounded-full bg-[#f1f3f4] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#5f6368] dark:bg-slate-700 dark:text-slate-300">{{ user.role }}</span>
        </span>
        <span class="hidden items-center gap-2 rounded-full border border-[#e0e3e7] px-3 py-1.5 text-xs text-[#5f6368] dark:border-slate-700 dark:text-slate-400 xl:flex">
          <span class="size-2 rounded-full" :class="connected ? 'bg-[#34a853]' : 'bg-[#ea4335]'"></span>
          {{ connected ? `rclone ${status?.version || ''}` : 'rclone terputus' }}
        </span>
        <button type="button" class="grid size-10 place-items-center rounded-full text-[#5f6368] transition hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10" :aria-label="theme === 'dark' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'" @click="toggleTheme">
          <component :is="theme === 'dark' ? IconSun : IconMoon" :size="20" :stroke="2" />
        </button>
        <button type="button" class="grid size-10 place-items-center rounded-full text-[#5f6368] transition hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10" aria-label="Buka bantuan" @click="isHelpModalOpen = true">
          <IconHelp :size="20" :stroke="2" />
        </button>
        <div class="relative" data-notif-root>
          <button
            type="button"
            class="relative grid size-10 place-items-center rounded-full text-[#5f6368] transition hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10"
            aria-label="Pemberitahuan"
            :aria-expanded="notifOpen"
            @click.stop="toggleNotif"
          >
            <IconBell :size="20" :stroke="2" />
            <span
              v-if="notifBadge"
              class="absolute right-1.5 top-1.5 size-2 rounded-full bg-[#ea4335] dark:bg-red-400"
              aria-hidden="true"
            />
          </button>
          <div
            v-if="notifOpen"
            class="absolute right-0 top-full z-40 mt-2 w-[330px] max-w-[80vw] overflow-hidden rounded-2xl border border-[#e0e3e7] bg-white shadow-[0_16px_40px_rgba(32,33,36,0.16)] dark:border-slate-700 dark:bg-slate-800"
          >
            <header class="flex items-center justify-between border-b border-[#eceff1] px-4 py-3 dark:border-slate-700">
              <span class="text-xs font-bold uppercase tracking-[0.08em] text-[#5f6368] dark:text-slate-400">Pemberitahuan</span>
              <button type="button" class="grid size-7 place-items-center rounded-full text-[#5f6368] transition hover:bg-black/5 dark:text-slate-400 dark:hover:bg-white/10" aria-label="Tutup" @click="notifOpen = false">
                <IconX :size="15" :stroke="2" />
              </button>
            </header>

            <div v-if="notifError" class="px-4 py-4 text-sm text-[#c5221f] dark:text-red-300">
              {{ notifError }}
            </div>

            <p v-else-if="notifLoading && !notifItems.length" class="px-4 py-4 text-sm text-[#5f6368] dark:text-slate-400">
              Memuat pemberitahuan...
            </p>

            <ul v-if="!notifError" class="max-h-[320px] overflow-y-auto px-2 py-2">
              <li
                v-for="(n, i) in notifItems"
                :key="i"
                class="flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-sm"
                :class="n.kind === 'warn' ? 'bg-[#fef7e0] text-[#7a5a00] dark:bg-amber-400/10 dark:text-amber-200' : 'text-[#202124] dark:text-slate-100'"
              >
                <IconAlertTriangle v-if="n.kind === 'warn'" :size="16" :stroke="2" class="mt-0.5 shrink-0" />
                <IconCircleCheck v-else :size="16" :stroke="2" class="mt-0.5 shrink-0" />
                <span>{{ n.text }}</span>
              </li>
              <li v-if="!notifItems.length" class="px-3 py-3 text-sm text-[#5f6368] dark:text-slate-400">
                Tidak ada pemberitahuan. Semua berjalan normal.
              </li>
            </ul>

            <footer class="border-t border-[#eceff1] px-4 py-2.5 text-right dark:border-slate-700">
              <button type="button" class="text-xs font-medium text-[#1a73e8] transition hover:underline dark:text-sky-300" @click="loadNotif">
                Muat ulang
              </button>
            </footer>
          </div>
        </div>
        <button type="button" class="grid size-10 place-items-center rounded-full text-[#5f6368] transition hover:bg-black/5 hover:text-[#c5221f] dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-red-300" aria-label="Keluar" title="Keluar" @click="emit('logout')">
          <IconLogout :size="20" :stroke="2" />
        </button>
      </div>
    </header>

    <div class="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[256px_minmax(0,1fr)]">
      <div class="hidden h-full overflow-hidden border-r border-[#e8eaed] px-3 py-4 dark:border-slate-800 lg:block">
        <AppSidebar :remotes="remotes" :active="active" :current-section="currentSection" :user="user" @select-remote="handleSelectRemote" @view="handleView" />
      </div>

      <div v-if="isMobileNavOpen" class="fixed inset-0 z-40 lg:hidden" @click.self="closeMobileNav">
        <div class="absolute inset-0 bg-slate-900/40" />
        <div class="absolute left-0 top-0 flex h-full w-[280px] flex-col overflow-hidden border-r border-[#e8eaed] bg-white px-3 py-4 dark:border-slate-700 dark:bg-slate-800" data-mobile-nav-card>
          <AppSidebar :remotes="remotes" :active="active" :current-section="currentSection" :user="user" @select-remote="handleSelectRemote" @view="handleView" />
        </div>
      </div>

      <main class="min-w-0 overflow-y-auto px-3 pb-10 pt-4 sm:px-6">
        <slot />
      </main>
    </div>
  </div>
</template>