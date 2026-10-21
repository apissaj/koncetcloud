<script setup>
import { IconCloud } from '@tabler/icons-vue';
import TruncateMarquee from './TruncateMarquee.vue';
import { formatBytes, formatDate, getModifiedTime, providerIcon, providerLabel } from '../composables/useFormatFile.js';
import { getFileIcon } from '../composables/useFileType.js';

const props = defineProps({
  item: { type: Object, required: true },
  selected: { type: Boolean, default: false },
});

const emit = defineEmits(['select', 'open', 'contextmenu']);
</script>

<template>
  <div
    class="sg-card group select-none p-4 transition hover:-translate-y-0.5"
    :class="selected
      ? 'sg-state'
      : 'sg-hover'"
    @click="emit('select', $event)"
    @dblclick="emit('open', $event)"
    @contextmenu="emit('contextmenu', $event)"
  >
    <button type="button" class="flex w-full flex-col items-start gap-4 text-left">
      <div class="flex w-full items-start justify-between gap-3">
        <span
          class="grid size-12 place-items-center rounded-2xl transition"
          :class="selected
            ? 'bg-[var(--muted)] text-[var(--foreground)]'
            : 'bg-[var(--muted)] text-[var(--muted-foreground)]'"
        >
          <component :is="getFileIcon(item, selected)" :size="22" :stroke="selected ? 0 : 1.8" class="transition-transform duration-200 group-hover:scale-110" />
        </span>
      </div>
      <div class="min-w-0">
        <TruncateMarquee as="p" class="text-sm font-semibold text-[var(--foreground)]" :text="item.name" />
        <div class="mt-1 flex min-w-0 items-center gap-2 text-xs text-[var(--muted-foreground)]">
          <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--card)]">
            <img
              v-if="providerIcon(item.fs)"
              :src="providerIcon(item.fs)"
              :alt="providerLabel(item.fs)"
              class="size-3.5 object-contain"
            />
            <IconCloud v-else :size="14" :stroke="1.8" class="text-[var(--muted-foreground)]" />
          </span>
          <span class="truncate">{{ item.email || 'lokal' }}</span>
        </div>
      </div>
      <div class="flex w-full items-center justify-between text-xs text-[var(--muted-foreground)]">
        <span>{{ formatDate(getModifiedTime(item)) }}</span>
        <span>{{ item.dir ? 'Folder' : formatBytes(item.size) }}</span>
      </div>
    </button>
  </div>
</template>