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
    <section class="grid gap-5 rounded-[24px] bg-gradient-to-b from-[#e8f0fe] to-[#f1f6ff] p-6 dark:from-slate-800 dark:to-slate-900 sm:grid-cols-[minmax(0,1.6fr)_280px] sm:p-7">
      <div>
        <p class="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-[#1a73e8] dark:text-sky-400">KoncetCloud</p>
        <h1 class="mb-2 text-[28px] font-medium leading-tight text-[#202124] dark:text-slate-100">
          Semua cloud Anda, satu rumah.
        </h1>
        <p class="max-w-xl text-sm text-[#5f6368] dark:text-slate-400">
          Jelajahi berkas di remote rclone yang berjalan di komputer ini dan jalankan job backup
          lokal ke drive Anda. Tidak ada file yang lewat server pihak ketiga.
        </p>
        <div class="mt-5 flex flex-wrap gap-3">
          <button type="button" class="inline-flex h-10 items-center gap-2 rounded-full bg-[#1a73e8] px-5 text-sm font-medium text-white transition hover:bg-[#1765cc]" @click="emit('view', 'drive')">
            <IconFolder :size="18" :stroke="2" />
            Drive Saya
          </button>
          <button type="button" class="inline-flex h-10 items-center gap-2 rounded-full border border-[#dadce0] bg-white px-5 text-sm font-medium text-[#1a73e8] transition hover:bg-[#f8fafd] dark:border-slate-600 dark:bg-slate-800 dark:text-sky-300" @click="emit('view', 'jobs')">
            <IconClockHour4 :size="18" :stroke="1.8" />
            Job backup
          </button>
        </div>
      </div>

      <div class="flex flex-col items-center justify-center gap-3 rounded-[20px] border border-[#e0e3e7] bg-white p-5 text-center dark:border-slate-700 dark:bg-slate-800/80">
        <div class="grid size-[116px] place-items-center rounded-full" :style="{ background: `conic-gradient(#1a73e8 0 ${percent}%, #eaf1fb ${percent}% 100%)` }">
          <div class="grid size-[82px] place-items-center rounded-full bg-white text-lg font-bold text-[#1a73e8] dark:bg-slate-800 dark:text-sky-300">{{ percentLabel }}</div>
        </div>
        <div>
          <p class="text-sm font-semibold text-[#202124] dark:text-slate-100">{{ formatBytes(totalUsed) }}</p>
          <p class="text-xs text-[#5f6368] dark:text-slate-400">{{ formatBytes(totalCapacity) }} total kapasitas</p>
        </div>
      </div>
    </section>

    <section v-if="recentFiles.length" class="rounded-[24px] bg-white p-5 dark:bg-slate-800 sm:p-6">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-base font-medium text-[#202124] dark:text-slate-100">Berkas terbaru</h2>
        <button type="button" class="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-[#1a73e8] transition hover:bg-[#e8f0fe] dark:text-sky-300 dark:hover:bg-sky-500/15" @click="emit('view', 'drive')">
          Lihat semua
          <IconArrowRight :size="16" :stroke="2" />
        </button>
      </div>
      <div class="flex flex-col">
        <button
          v-for="f in recentFiles"
          :key="f.path"
          type="button"
          class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-[#f8fafd] dark:hover:bg-slate-700/60"
          @click="emit('open-file', f)"
        >
          <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f1f3f4] text-[#5f6368] dark:bg-slate-700 dark:text-slate-300">
            <component :is="getFileIcon(f, false)" :size="18" :stroke="1.8" />
          </span>
          <span class="min-w-0 flex-1">
            <TruncateMarquee as="span" class="block text-sm font-medium text-[#202124] dark:text-slate-100" :text="f.name" />
            <span class="block truncate font-mono text-[11px] text-[#5f6368] dark:text-slate-400">{{ f.path }}</span>
          </span>
          <span class="shrink-0 text-xs text-[#5f6368] dark:text-slate-400">{{ formatBytes(f.size) }}</span>
        </button>
      </div>
    </section>

    <section v-else class="flex flex-col items-center gap-2 rounded-[24px] border border-dashed border-[#e0e3e7] py-14 text-center dark:border-slate-700">
      <p class="font-medium text-[#5f6368] dark:text-slate-300">Belum ada berkas di drive aktif</p>
      <p class="text-sm text-[#5f6368] dark:text-slate-400">Pilih remote di panel kiri untuk mulai menelusuri.</p>
    </section>
  </div>
</template>