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
    class="group grid min-h-[52px] cursor-default select-none grid-cols-[minmax(260px,2fr)_minmax(180px,1.1fr)_minmax(150px,1fr)_140px] items-center gap-3 border-t border-[#eceff1] px-[18px] transition first:border-t-0 dark:border-slate-700"
    :class="selected
      ? 'bg-gradient-to-r from-[#e8f0fe] to-[#f8fbff] shadow-[inset_4px_0_0_#1a73e8] dark:from-sky-500/15 dark:to-slate-800 dark:shadow-[inset_4px_0_0_#38bdf8]'
      : 'hover:bg-black/[0.02] dark:hover:bg-white/5'"
    @click="emit('select', $event)"
    @dblclick="emit('open', $event)"
    @contextmenu="emit('contextmenu', $event)"
  >
    <div class="flex min-w-0 items-center gap-2.5 text-[#202124] dark:text-slate-100">
      <component
        :is="getFileIcon(item, selected)"
        :size="18"
        :stroke="selected ? 0 : 1.8"
        class="transition-transform duration-200 group-hover:scale-110"
        :class="selected ? 'text-[#1a73e8] dark:text-sky-300' : 'text-[#5f6368] dark:text-slate-400'"
      />
      <TruncateMarquee :text="item.name" />
    </div>
    <div class="flex min-w-0 items-center gap-2 text-[#5f6368] dark:text-slate-400">
      <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-white dark:bg-slate-900/70">
        <img
          v-if="providerIcon(item.fs)"
          :src="providerIcon(item.fs)"
          :alt="providerLabel(item.fs)"
          class="size-3.5 object-contain"
        />
        <IconCloud v-else :size="14" :stroke="1.8" class="text-[#5f6368] dark:text-slate-400" />
      </span>
      <TruncateMarquee class="min-w-0" :text="item.email || 'lokal'" />
    </div>
    <span class="text-[#5f6368] dark:text-slate-400">{{ formatDate(getModifiedTime(item)) }}</span>
    <span class="text-[#5f6368] dark:text-slate-400">{{ item.dir ? '—' : formatBytes(item.size) }}</span>
  </div>
</template>