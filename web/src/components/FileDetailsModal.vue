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
  <div class="fixed inset-0 z-50 grid place-items-center bg-[var(--foreground)]/40 p-4" @click.self="emit('close')">
    <div class="sg-popover flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden">
      <header class="flex items-center gap-3 border-b border-[var(--border)] px-6 py-4">
        <span class="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--muted)] text-[var(--foreground)]">
          <component :is="getFileIcon(item, true)" :size="22" :stroke="0" />
        </span>
        <div class="min-w-0">
          <h2 class="truncate text-lg font-semibold text-[var(--foreground)]">{{ item.name }}</h2>
          <p class="text-xs text-[var(--muted-foreground)]">{{ item.dir ? 'Folder' : 'Berkas' }}</p>
        </div>
        <button type="button" class="sg-control ml-auto grid size-8 shrink-0 place-items-center rounded-full text-[var(--muted-foreground)] transition hover:bg-[var(--hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none" aria-label="Tutup" @click="emit('close')">
          <IconX :size="18" :stroke="2" />
        </button>
      </header>

      <div class="overflow-y-auto px-6 py-5">
        <div v-if="isImage || isVideo" class="mb-4 flex max-h-[280px] items-center justify-center overflow-hidden rounded-xl bg-[var(--muted)]">
          <img v-if="isImage" :src="mediaUrl" :alt="item.name" class="max-h-[280px] w-full object-contain" />
          <video v-else :src="mediaUrl" controls class="max-h-[280px] w-full" />
        </div>

        <dl class="divide-y divide-[var(--border)]">
          <div v-for="m in meta" :key="m.label" class="grid grid-cols-[110px_minmax(0,1fr)] gap-3 py-2.5 text-sm">
            <dt class="text-[var(--muted-foreground)]">{{ m.label }}</dt>
            <dd class="min-w-0 break-words font-mono text-[var(--foreground)]">{{ m.value }}</dd>
          </div>
        </dl>
      </div>

      <footer v-if="!item.dir" class="flex justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
        <a
          :href="downloadUrl"
          class="sg-primary inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none"
          @click="emit('close')"
        >
          <IconDownload :size="18" :stroke="2" />
          Unduh
        </a>
      </footer>
    </div>
  </div>
</template>