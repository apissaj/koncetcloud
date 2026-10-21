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
    class="group grid min-h-[52px] cursor-default select-none grid-cols-[minmax(260px,2fr)_minmax(180px,1.1fr)_minmax(150px,1fr)_140px] items-center gap-3 border-t border-[var(--border)] px-[18px] transition first:border-t-0"
    :class="selected
      ? 'bg-[var(--glass-state)] shadow-[inset_3px_0_0_var(--focus-line)]'
      : 'hover:bg-[var(--hover)]'"
    @click="emit('select', $event)"
    @dblclick="emit('open', $event)"
    @contextmenu="emit('contextmenu', $event)"
  >
    <div class="flex min-w-0 items-center gap-2.5 text-[var(--foreground)]">
      <component
        :is="getFileIcon(item, selected)"
        :size="18"
        :stroke="selected ? 0 : 1.8"
        class="transition-transform duration-200 group-hover:scale-110"
        :class="selected ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'"
      />
      <TruncateMarquee :text="item.name" />
    </div>
    <div class="flex min-w-0 items-center gap-2 text-[var(--muted-foreground)]">
      <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--muted)]">
        <img
          v-if="providerIcon(item.fs)"
          :src="providerIcon(item.fs)"
          :alt="providerLabel(item.fs)"
          class="size-3.5 object-contain"
        />
        <IconCloud v-else :size="14" :stroke="1.8" class="text-[var(--muted-foreground)]" />
      </span>
      <TruncateMarquee class="min-w-0" :text="item.email || 'lokal'" />
    </div>
    <span class="text-[var(--muted-foreground)]">{{ formatDate(getModifiedTime(item)) }}</span>
    <span class="text-[var(--muted-foreground)]">{{ item.dir ? '—' : formatBytes(item.size) }}</span>
  </div>
</template>