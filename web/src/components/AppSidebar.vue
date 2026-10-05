<script setup>
import { computed, ref, watch } from 'vue';
import {
  IconClipboardList,
  IconClipboardListFilled,
  IconClockHour4,
  IconClockHour4Filled,
  IconCloud,
  IconChevronDown,
  IconChevronRight,
  IconCloudFilled,
  IconFolder,
  IconFolderFilled,
  IconHome,
  IconHomeFilled,
  IconListCheck,
  IconListCheckFilled,
  IconPlus,
  IconShield,
  IconShieldFilled,
  IconUser,
  IconUserFilled,
} from '@tabler/icons-vue';
import { formatBytes } from '../composables/useFormatFile.js';

const props = defineProps({
  remotes: { type: Array, default: () => [] },
  active: { type: String, default: '' },
  currentSection: { type: String, default: 'drive' },
  user: { type: Object, default: null },
});

const isAdmin = computed(() => props.user?.role === 'admin');
const emit = defineEmits(['select-remote', 'view']);

// Daftar remote bisa dilipat. Default tertutup kalau banyak remote, supaya
// sidebar tidak penuh; angka total tetap terlihat. Kolaps dihitung DINAMIS
// (bukan saat mount), karena props.remotes terisi asinkron setelah mount.
const MAX_VISIBLE = 5;
const remotesCollapsed = ref(false);
const userToggledCollapse = ref(false);
watch(
  () => props.remotes.length,
  (n) => {
    if (!userToggledCollapse.value && n > MAX_VISIBLE) remotesCollapsed.value = true;
  },
  { immediate: true },
);
function toggleCollapse() {
  userToggledCollapse.value = true;
  remotesCollapsed.value = !remotesCollapsed.value;
}

// Menu utama (semua peran)
const mainNav = computed(() => [
  { id: 'home', label: 'Beranda', icon: IconHome, activeIcon: IconHomeFilled },
  { id: 'drive', label: 'Drive Saya', icon: IconFolder, activeIcon: IconFolderFilled },
  { id: 'jobs', label: 'Backup', icon: IconClockHour4, activeIcon: IconClockHour4Filled },
  { id: 'accounts', label: 'Akun', icon: IconUser, activeIcon: IconUserFilled },
  { id: 'security', label: 'Keamanan', icon: IconShield, activeIcon: IconShieldFilled },
]);

// Menu admin, dipisah garis supaya tidak menyatu dengan menu utama
const adminNav = computed(() =>
  isAdmin.value
    ? [
        { id: 'quota', label: 'Penyimpanan', icon: IconCloud, activeIcon: IconCloudFilled },
        { id: 'users', label: 'Kelola pengguna', icon: IconListCheck, activeIcon: IconListCheckFilled },
        { id: 'audit', label: 'Riwayat', icon: IconClipboardList, activeIcon: IconClipboardListFilled },
      ]
    : [],
);

function isActive(id) {
  return props.currentSection === id;
}

const totalUsed = computed(() => props.remotes.reduce((sum, r) => sum + (r.used || 0), 0));
const totalCapacity = computed(() => props.remotes.reduce((sum, r) => sum + (r.total || 0), 0));
const percent = computed(() => {
  if (!totalCapacity.value) return 0;
  return Math.min(100, (totalUsed.value / totalCapacity.value) * 100);
});
const percentLabel = computed(() => `${percent.value.toFixed(percent.value >= 10 ? 0 : 1)}%`);

// Saat dilipat: tampilkan remote yang sedang dipilih + beberapa teratas saja.
const visibleRemotes = computed(() => {
  if (!remotesCollapsed.value) return props.remotes;
  const shown = props.remotes.slice(0, MAX_VISIBLE);
  const current = props.remotes.find((r) => props.active === `${r.name}:`);
  if (current && !shown.some((r) => r.name === current.name)) {
    return [...shown.slice(0, MAX_VISIBLE - 1), current];
  }
  return shown;
});
const hiddenCount = computed(() => Math.max(0, props.remotes.length - visibleRemotes.value.length));
</script>

<template>
  <nav class="flex h-full flex-col gap-5" aria-label="Navigasi utama">
    <div class="flex items-center gap-2 lg:hidden">
      <span class="grid size-11 place-items-center rounded-2xl bg-white dark:bg-slate-900">
        <IconCloudFilled :size="22" :stroke="0" class="text-[#1a73e8]" />
      </span>
      <span class="text-lg font-semibold text-[#202124] dark:text-slate-100">KoncetCloud</span>
    </div>

    <button
      type="button"
      class="inline-flex h-12 w-fit items-center gap-2 rounded-full border border-[#dadce0] bg-white px-5 text-sm font-medium text-[#3c4043] transition hover:border-[#c7d2e0] hover:bg-[#f8fafd] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      @click="emit('view', 'jobs')"
    >
      <IconPlus :size="18" :stroke="2" />
      Job baru
    </button>

    <ul class="flex flex-col gap-0.5">
      <li v-for="item in mainNav" :key="item.id">
        <button
          type="button"
          class="flex w-full items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-left text-sm transition"
          :class="isActive(item.id)
            ? 'bg-[#e8f0fe] font-medium text-[#1967d2] dark:bg-sky-500/15 dark:text-sky-300'
            : 'text-[#3c4043] hover:bg-black/[0.04] dark:text-slate-300 dark:hover:bg-white/5'"
          @click="emit('view', item.id)"
        >
          <component :is="isActive(item.id) ? item.activeIcon : item.icon" :size="20" :stroke="isActive(item.id) ? 0 : 1.8" />
          {{ item.label }}
        </button>
      </li>
    </ul>

    <template v-if="adminNav.length">
      <div class="mx-3.5 h-px bg-[#e8eaed] dark:bg-slate-700" aria-hidden="true" />
      <ul class="flex flex-col gap-0.5">
        <li v-for="item in adminNav" :key="item.id">
          <button
            type="button"
            class="flex w-full items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-left text-sm transition"
            :class="isActive(item.id)
              ? 'bg-[#e8f0fe] font-medium text-[#1967d2] dark:bg-sky-500/15 dark:text-sky-300'
              : 'text-[#3c4043] hover:bg-black/[0.04] dark:text-slate-300 dark:hover:bg-white/5'"
            @click="emit('view', item.id)"
          >
            <component :is="isActive(item.id) ? item.activeIcon : item.icon" :size="20" :stroke="isActive(item.id) ? 0 : 1.8" />
            {{ item.label }}
          </button>
        </li>
      </ul>
    </template>

    <div class="mx-3.5 h-px bg-[#e8eaed] dark:bg-slate-700" aria-hidden="true" />
    <div class="min-h-0">
      <button
        type="button"
        class="mb-1 flex w-full items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-left transition hover:bg-black/[0.04] dark:hover:bg-white/5"
        :aria-expanded="!remotesCollapsed"
        @click="toggleCollapse"
      >
        <component :is="remotesCollapsed ? IconChevronRight : IconChevronDown" :size="14" :stroke="2" class="shrink-0 text-[#5f6368] dark:text-slate-400" />
        <span class="text-[11px] font-bold uppercase tracking-[0.08em] text-[#5f6368] dark:text-slate-400">Remote</span>
        <span class="ml-auto rounded-full border border-[#dadce0] px-1.5 py-0.5 text-[10px] font-medium text-[#5f6368] dark:border-slate-600 dark:text-slate-400">{{ remotes.length }}</span>
      </button>
      <ul class="flex max-h-[38vh] flex-col gap-0.5 overflow-y-auto pt-0.5">
        <li v-for="r in visibleRemotes" :key="r.name">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-2 rounded-xl px-3.5 py-2 text-left text-sm transition"
            :class="active === `${r.name}:` && currentSection === 'drive'
              ? 'bg-[#e8f0fe] font-medium text-[#1967d2] dark:bg-sky-500/15 dark:text-sky-300'
              : 'text-[#3c4043] hover:bg-black/[0.04] dark:text-slate-300 dark:hover:bg-white/5'"
            @click="emit('select-remote', r.name)"
          >
            <span class="flex min-w-0 items-center gap-3">
              <IconCloud :size="18" :stroke="1.8" />
              <span class="truncate">{{ r.name }}</span>
            </span>
            <span v-if="!r.ok" class="shrink-0 text-[10px] text-[#ea4335]">error</span>
          </button>
        </li>
        <li v-if="!remotes.length" class="px-3.5 py-2 text-xs text-[#5f6368] dark:text-slate-400">
          Belum ada remote rclone.
        </li>
        <li v-else-if="hiddenCount > 0">
          <button
            type="button"
            class="w-full rounded-xl px-3.5 py-2 text-left text-xs font-medium text-[#1a73e8] transition hover:bg-[#e8f0fe]/60 dark:text-sky-300 dark:hover:bg-sky-500/10"
            @click="toggleCollapse"
          >
            +{{ hiddenCount }} remote lagi
          </button>
        </li>
      </ul>
    </div>

    <div class="mt-auto pt-2">
      <div class="rounded-2xl border border-[#e0e3e7] bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <div class="mb-2 flex items-center justify-between">
          <span class="flex items-center gap-2 text-sm font-medium text-[#202124] dark:text-slate-100">
            <IconCloudFilled :size="18" :stroke="0" class="text-[#1a73e8]" />
            Total
          </span>
          <span class="text-sm font-semibold text-[#1a73e8] dark:text-sky-300">{{ percentLabel }}</span>
        </div>
        <div class="h-1.5 w-full overflow-hidden rounded-full bg-[#e8eaed] dark:bg-slate-700">
          <div class="h-full rounded-full bg-[#1a73e8] dark:bg-sky-400" :style="{ width: `${percent}%` }" />
        </div>
        <p class="mt-2 text-[11px] text-[#5f6368] dark:text-slate-400">
          {{ formatBytes(totalUsed) }} dari {{ formatBytes(totalCapacity) }} terpakai
        </p>
      </div>
    </div>
  </nav>
</template>
