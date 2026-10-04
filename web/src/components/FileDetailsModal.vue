<script setup>
import { computed } from 'vue';
import { IconDownload, IconX } from '@tabler/icons-vue';
import { formatBytes, formatDate, getModifiedTime } from '../composables/useFormatFile.js';
import { getFileIcon } from '../composables/useFileType.js';

const props = defineProps({
  item: { type: Object, required: true },
  fs: { type: String, default: '' },
});
const emit = defineEmits(['close', 'download']);

const isImage = computed(() => (props.item.mime || '').startsWith('image/'));
const isVideo = computed(() => (props.item.mime || '').startsWith('video/'));
const mediaUrl = computed(() => {
  if (!isImage.value && !isVideo.value) return '';
  return `/api/download?fs=${encodeURIComponent(props.fs || 'gdrive:')}&path=${encodeURIComponent(props.item.path)}&raw=1`;
});
const downloadUrl = computed(() => `/api/download?fs=${encodeURIComponent(props.fs || 'gdrive:')}&path=${encodeURIComponent(props.item.path)}`);

const meta = computed(() => [
  { label: 'Nama', value: props.item.name },
  { label: 'Tipe', value: props.item.dir ? 'Folder' : props.item.mime || 'file' },
  { label: 'Ukuran', value: props.item.dir ? '—' : formatBytes(props.item.size) },
  { label: 'Diubah', value: formatDate(getModifiedTime(props.item)) },
  { label: 'Lokasi', value: `${props.fs}${props.item.path}` },
]);
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 p-4" @click.self="emit('close')">
    <div class="flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_20px_40px_rgba(15,23,42,0.18)] dark:bg-slate-800">
      <header class="flex items-center gap-3 border-b border-[#eceff1] px-6 py-4 dark:border-slate-700">
        <span class="grid size-10 shrink-0 place-items-center rounded-full bg-[#e8f0fe] text-[#1a73e8] dark:bg-sky-500/15 dark:text-sky-300">
          <component :is="getFileIcon(item, true)" :size="22" :stroke="0" />
        </span>
        <div class="min-w-0">
          <h2 class="truncate text-lg font-semibold text-[#202124] dark:text-slate-100">{{ item.name }}</h2>
          <p class="text-xs text-[#5f6368] dark:text-slate-400">{{ item.dir ? 'Folder' : 'Berkas' }}</p>
        </div>
        <button type="button" class="ml-auto grid size-8 shrink-0 place-items-center rounded-full text-[#5f6368] transition hover:bg-black/5 dark:text-slate-400 dark:hover:bg-white/10" aria-label="Tutup" @click="emit('close')">
          <IconX :size="18" :stroke="2" />
        </button>
      </header>

      <div class="overflow-y-auto px-6 py-5">
        <div v-if="isImage || isVideo" class="mb-4 flex max-h-[280px] items-center justify-center overflow-hidden rounded-xl bg-[#f1f3f4] dark:bg-slate-900">
          <img v-if="isImage" :src="mediaUrl" :alt="item.name" class="max-h-[280px] w-full object-contain" />
          <video v-else :src="mediaUrl" controls class="max-h-[280px] w-full" />
        </div>

        <dl class="divide-y divide-[#eceff1] dark:divide-slate-700">
          <div v-for="m in meta" :key="m.label" class="grid grid-cols-[110px_minmax(0,1fr)] gap-3 py-2.5 text-sm">
            <dt class="text-[#5f6368] dark:text-slate-400">{{ m.label }}</dt>
            <dd class="min-w-0 break-words font-mono text-[#202124] dark:text-slate-100">{{ m.value }}</dd>
          </div>
        </dl>
      </div>

      <footer v-if="!item.dir" class="flex justify-end gap-2 border-t border-[#eceff1] px-6 py-4 dark:border-slate-700">
        <a
          :href="downloadUrl"
          class="inline-flex h-10 items-center gap-2 rounded-full bg-[#1a73e8] px-5 text-sm font-medium text-white transition hover:bg-[#1765cc]"
          @click="emit('close')"
        >
          <IconDownload :size="18" :stroke="2" />
          Unduh
        </a>
      </footer>
    </div>
  </div>
</template>