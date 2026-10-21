<script setup>
import { computed, ref, watch } from 'vue';
import {
  IconChevronDown,
  IconChevronRight,
  IconClipboardList,
  IconClipboardListFilled,
  IconClockHour4,
  IconClockHour4Filled,
  IconCloud,
  IconCloudFilled,
  IconDeviceMobile,
  IconDeviceMobileFilled,
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
import BrandWordmark from './BrandWordmark.vue';

const props = defineProps({
  remotes: { type: Array, default: () => [] },
  active: { type: String, default: '' },
  currentSection: { type: String, default: 'drive' },
  user: { type: Object, default: null },
});

const isAdmin = computed(() => props.user?.role === 'admin');
const emit = defineEmits(['select-remote', 'view']);

// Daftar remote bisa dilipat. Kolaps dihitung dinamis (watch remotes.length),
// bukan saat mount, karena props.remotes terisi asinkron.
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

const mainNav = computed(() => [
  { id: 'home', label: 'Beranda', icon: IconHome, activeIcon: IconHomeFilled },
  { id: 'drive', label: 'Drive Saya', icon: IconFolder, activeIcon: IconFolderFilled },
  { id: 'jobs', label: 'Backup', icon: IconClockHour4, activeIcon: IconClockHour4Filled },
  { id: 'accounts', label: 'Akun', icon: IconUser, activeIcon: IconUserFilled },
  { id: 'security', label: 'Keamanan', icon: IconShield, activeIcon: IconShieldFilled },
]);

const adminNav = computed(() =>
  isAdmin.value
    ? [
        { id: 'quota', label: 'Penyimpanan', icon: IconCloud, activeIcon: IconCloudFilled },
        { id: 'transfer', label: 'Transfer', icon: IconDeviceMobile, activeIcon: IconDeviceMobileFilled },
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
  <!--
    Tiga zona: brand+aksi (tetap) - menu+remote (scroll) - kartu Total (dipatok).
    Kartu Total sengaja DI LUAR area scroll supaya selalu terlihat di layar.
  -->
  <nav class="flex h-full min-h-0 flex-col" aria-label="Navigasi utama">
    <!-- Zona 1: brand & aksi utama (tidak ikut scroll) -->
    <div class="flex shrink-0 flex-col gap-5 pb-4">
      <div class="flex items-center gap-2 lg:hidden">
        <BrandWordmark :size="24" class="text-[var(--foreground)]" />
      </div>

      <button
        type="button"
        class="sg-primary inline-flex h-12 w-fit items-center gap-2 px-5 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]"
        @click="emit('view', 'jobs')"
      >
        <IconPlus :size="18" :stroke="2" />
        Job baru
      </button>
    </div>

    <!-- Zona 2: menu + remote (SATU-SATUNYA bagian yang bisa scroll) -->
    <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
      <ul class="flex flex-col gap-0.5">
        <li v-for="item in mainNav" :key="item.id">
          <button
            type="button"
            class="flex w-full items-center gap-3.5 rounded-[var(--radius-control)] px-3.5 py-2.5 text-left text-sm transition"
            :class="isActive(item.id)
              ? 'sg-state font-medium text-[var(--foreground)]'
              : 'sg-hover text-[var(--muted-foreground)]'"
            @click="emit('view', item.id)"
          >
            <component :is="isActive(item.id) ? item.activeIcon : item.icon" :size="20" :stroke="isActive(item.id) ? 0 : 1.8" />
            {{ item.label }}
          </button>
        </li>
      </ul>

      <template v-if="adminNav.length">
        <div class="mx-3.5 h-px bg-[var(--glass-edge)]" aria-hidden="true" />
        <ul class="flex flex-col gap-0.5">
          <li v-for="item in adminNav" :key="item.id">
            <button
              type="button"
              class="flex w-full items-center gap-3.5 rounded-[var(--radius-control)] px-3.5 py-2.5 text-left text-sm transition"
              :class="isActive(item.id)
                ? 'sg-state font-medium text-[var(--foreground)]'
                : 'sg-hover text-[var(--muted-foreground)]'"
              @click="emit('view', item.id)"
            >
              <component :is="isActive(item.id) ? item.activeIcon : item.icon" :size="20" :stroke="isActive(item.id) ? 0 : 1.8" />
              {{ item.label }}
            </button>
          </li>
        </ul>
      </template>

      <div class="mx-3.5 h-px bg-[var(--glass-edge)]" aria-hidden="true" />
      <div>
        <button
          type="button"
          class="sg-hover mb-1 flex w-full items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-left transition"
          :aria-expanded="!remotesCollapsed"
          @click="toggleCollapse"
        >
          <component :is="remotesCollapsed ? IconChevronRight : IconChevronDown" :size="14" :stroke="2" class="shrink-0 text-[var(--muted-foreground)]" />
          <span class="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Remote</span>
          <span class="sg-control ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted-foreground)]">{{ remotes.length }}</span>
        </button>
        <ul class="flex flex-col gap-0.5 pt-0.5">
          <li v-for="r in visibleRemotes" :key="r.name">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-2 rounded-[var(--radius-control)] px-3.5 py-2 text-left text-sm transition"
              :class="active === `${r.name}:` && currentSection === 'drive'
                ? 'sg-state font-medium text-[var(--foreground)]'
                : 'sg-hover text-[var(--muted-foreground)]'"
              @click="emit('select-remote', r.name)"
            >
              <span class="flex min-w-0 items-center gap-3">
                <IconCloud :size="18" :stroke="1.8" />
                <span class="truncate">{{ r.name }}</span>
              </span>
              <span v-if="!r.ok" class="shrink-0 text-[10px] text-[var(--destructive)]">error</span>
            </button>
          </li>
          <li v-if="!remotes.length" class="px-3.5 py-2 text-xs text-[var(--muted-foreground)]">
            Belum ada remote rclone.
          </li>
          <li v-else-if="hiddenCount > 0">
            <button
              type="button"
              class="sg-hover w-full rounded-[var(--radius-control)] px-3.5 py-2 text-left text-xs font-medium text-[var(--foreground)] underline-offset-2 transition"
              @click="toggleCollapse"
            >
              +{{ hiddenCount }} remote lagi
            </button>
          </li>
        </ul>
      </div>
    </div>

    <!-- Zona 3: kartu Total (dipatok, tidak ikut scroll) -->
    <div class="shrink-0 border-t border-[var(--glass-edge)] pt-4">
      <div class="sg-card p-4">
        <div class="mb-2 flex items-center justify-between">
          <span class="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
            <IconCloudFilled :size="18" :stroke="0" class="text-[var(--muted-foreground)]" />
            Total
          </span>
          <span class="text-sm font-semibold text-[var(--foreground)]">{{ percentLabel }}</span>
        </div>
        <div class="sg-groove h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
          <div class="h-full rounded-full bg-[var(--primary)]" :style="{ width: `${percent}%` }" />
        </div>
        <p class="mt-2 text-[11px] text-[var(--muted-foreground)]">
          {{ formatBytes(totalUsed) }} dari {{ formatBytes(totalCapacity) }} terpakai
        </p>
      </div>
    </div>
  </nav>
</template>
