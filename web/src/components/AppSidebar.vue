<script setup>
import { computed } from 'vue';
import {
  IconChevronDown,
  IconClockHour4,
  IconClockHour4Filled,
  IconCloud,
  IconCloudFilled,
  IconFolder,
  IconFolderFilled,
  IconHome,
  IconClipboardList,
  IconClipboardListFilled,
  IconHomeFilled,
  IconListCheck,
  IconListCheckFilled,
  IconPlus,
  IconSettings,
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

const navItems = computed(() => [
  { id: 'home', label: 'Beranda', icon: IconHome, activeIcon: IconHomeFilled },
  { id: 'drive', label: 'Drive Saya', icon: IconFolder, activeIcon: IconFolderFilled },
  { id: 'jobs', label: 'Backup', icon: IconClockHour4, activeIcon: IconClockHour4Filled },
  { id: 'quota', label: 'Penyimpanan', icon: IconCloud, activeIcon: IconCloudFilled },
  { id: 'accounts', label: 'Akun', icon: IconUser, activeIcon: IconUserFilled },
  ...(props.user?.role === 'admin'
    ? [
        { id: 'users', label: 'Kelola pengguna', icon: IconListCheck, activeIcon: IconListCheckFilled },
        { id: 'audit', label: 'Riwayat', icon: IconClipboardList, activeIcon: IconClipboardListFilled },
      ]
    : []),
]);

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
</script>

<template>
  <nav class="flex h-full flex-col gap-4" aria-label="Navigasi utama">
    <div class="flex items-center gap-2 lg:hidden">
      <span class="grid size-11 place-items-center rounded-2xl bg-white dark:bg-slate-900">
        <IconCloudFilled :size="22" :stroke="0" class="text-[#1a73e8]" />
      </span>
      <span class="text-lg font-semibold text-[#202124] dark:text-slate-100">KoncetCloud</span>
    </div>

    <button type="button" class="inline-flex h-12 w-fit items-center gap-2 rounded-full border border-[#dadce0] bg-white px-5 text-sm font-medium text-[#3c4043] transition hover:border-[#c7d2e0] hover:bg-[#f8fafd] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700" @click="emit('view', 'jobs')">
      <IconPlus :size="18" :stroke="2" />
      Job baru
    </button>

    <ul class="flex flex-col gap-0.5">
      <li v-for="item in navItems" :key="item.id">
        <button
          type="button"
          class="flex w-full items-center gap-4 rounded-xl px-4 py-2.5 text-left text-sm transition"
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

    <div class="mt-1">
      <p class="mb-2 px-4 text-[11px] font-bold uppercase tracking-[0.08em] text-[#5f6368] dark:text-slate-400">
        Penyimpanan
      </p>
      <ul class="flex flex-col gap-0.5">
        <li v-for="r in remotes" :key="r.name">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-left text-sm transition"
            :class="active === `${r.name}:` && currentSection === 'drive'
              ? 'bg-[#e8f0fe] font-medium text-[#1967d2] dark:bg-sky-500/15 dark:text-sky-300'
              : 'text-[#3c4043] hover:bg-black/[0.04] dark:text-slate-300 dark:hover:bg-white/5'"
            @click="emit('select-remote', r.name)"
          >
            <span class="flex min-w-0 items-center gap-3">
              <IconCloud :size="20" :stroke="1.8" />
              <span class="truncate">{{ r.name }}</span>
            </span>
            <span v-if="!r.ok" class="shrink-0 text-[11px] text-[#ea4335]">error</span>
          </button>
        </li>
        <li v-if="!remotes.length" class="px-4 py-2 text-xs text-[#5f6368] dark:text-slate-400">
          Belum ada remote rclone.
        </li>
      </ul>
    </div>

    <div class="mt-auto">
      <div class="rounded-2xl border border-[#e0e3e7] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:border-slate-700 dark:bg-slate-800">
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
      <button type="button" class="mt-2 flex w-full items-center gap-4 rounded-xl px-4 py-2.5 text-left text-sm text-[#3c4043] transition hover:bg-black/[0.04] dark:text-slate-300 dark:hover:bg-white/5" @click="emit('view', 'quota')">
        <IconSettings :size="20" :stroke="1.8" />
        Penyimpanan
      </button>
    </div>
  </nav>
</template>