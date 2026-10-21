<script setup>
import { computed } from 'vue';
import { IconArrowRight, IconFolder, IconClockHour4 } from '@tabler/icons-vue';
import { formatBytes } from '../composables/useFormatFile.js';
import { getFileIcon } from '../composables/useFileType.js';
import TruncateMarquee from './TruncateMarquee.vue';

const props = defineProps({
  remotes: { type: Array, default: () => [] },
  files: { type: Array, default: () => [] },
  active: { type: String, default: '' },
});
const emit = defineEmits(['view', 'open-file', 'select-remote']);

const totalUsed = computed(() => props.remotes.reduce((s, r) => s + (r.used || 0), 0));
const totalCapacity = computed(() => props.remotes.reduce((s, r) => s + (r.total || 0), 0));
const percent = computed(() => (totalCapacity.value ? Math.min(100, (totalUsed.value / totalCapacity.value) * 100) : 0));
const percentLabel = computed(() => `${percent.value.toFixed(percent.value >= 10 ? 0 : 1)}%`);

const recentFiles = computed(() => props.files.filter((f) => !f.dir).slice(0, 6));
</script>

<template>
  <div class="flex flex-col gap-5">
    <section class="sg-card grid gap-5 p-6 sm:grid-cols-[minmax(0,1.6fr)_280px] sm:p-7">
      <div>
        <p class="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">KoncetCloud</p>
        <h1 class="mb-2 text-[28px] font-medium leading-tight text-[var(--foreground)]">
          Semua cloud Anda, satu rumah.
        </h1>
        <p class="max-w-xl text-sm text-[var(--muted-foreground)]">
          Jelajahi berkas di remote rclone yang berjalan di komputer ini dan jalankan job backup
          lokal ke drive Anda. Tidak ada file yang lewat server pihak ketiga.
        </p>
        <div class="mt-5 flex flex-wrap gap-3">
          <button type="button" class="sg-primary inline-flex h-10 items-center gap-2 px-5 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]" @click="emit('view', 'drive')">
            <IconFolder :size="18" :stroke="2" />
            Drive Saya
          </button>
          <button type="button" class="sg-control inline-flex h-10 items-center gap-2 px-5 text-sm font-medium text-[var(--foreground)] transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]" @click="emit('view', 'jobs')">
            <IconClockHour4 :size="18" :stroke="1.8" />
            Job backup
          </button>
        </div>
      </div>

      <div class="sg-card flex flex-col items-center justify-center gap-3 p-5 text-center">
        <div class="grid size-[116px] place-items-center rounded-full" :style="{ background: `conic-gradient(var(--primary) 0 ${percent}%, var(--muted) ${percent}% 100%)` }">
          <div class="grid size-[82px] place-items-center rounded-full bg-[var(--card)] text-lg font-bold text-[var(--foreground)]">{{ percentLabel }}</div>
        </div>
        <div>
          <p class="text-sm font-semibold text-[var(--foreground)]">{{ formatBytes(totalUsed) }}</p>
          <p class="text-xs text-[var(--muted-foreground)]">{{ formatBytes(totalCapacity) }} total kapasitas</p>
        </div>
      </div>
    </section>

    <section v-if="recentFiles.length" class="sg-card p-5 sm:p-6">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-base font-medium text-[var(--foreground)]">Berkas terbaru</h2>
        <button type="button" class="sg-hover inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-[var(--foreground)] underline-offset-2 transition hover:underline focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]" @click="emit('view', 'drive')">
          Lihat semua
          <IconArrowRight :size="16" :stroke="2" />
        </button>
      </div>
      <div class="flex flex-col">
        <button
          v-for="f in recentFiles"
          :key="f.path"
          type="button"
          class="sg-hover flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 text-left transition"
          @click="emit('open-file', f)"
        >
          <span class="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--muted)] text-[var(--muted-foreground)]">
            <component :is="getFileIcon(f, false)" :size="18" :stroke="1.8" />
          </span>
          <span class="min-w-0 flex-1">
            <TruncateMarquee as="span" class="block text-sm font-medium text-[var(--foreground)]" :text="f.name" />
            <span class="block truncate font-mono text-[11px] text-[var(--muted-foreground)]">{{ f.path }}</span>
          </span>
          <span class="shrink-0 text-xs text-[var(--muted-foreground)]">{{ formatBytes(f.size) }}</span>
        </button>
      </div>
    </section>

    <section v-else class="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-edge)] py-14 text-center">
      <p class="font-medium text-[var(--muted-foreground)]">Belum ada berkas di drive aktif</p>
      <p class="text-sm text-[var(--muted-foreground)]">Pilih remote di panel kiri untuk mulai menelusuri.</p>
    </section>
  </div>
</template>