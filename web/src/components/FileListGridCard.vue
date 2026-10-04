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
    class="group select-none rounded-[22px] border p-4 transition hover:-translate-y-0.5 hover:border-[#d2e3fc] hover:shadow-[0_10px_30px_rgba(32,33,36,0.08)] dark:hover:border-slate-500"
    :class="selected
      ? 'border-[#1a73e8] bg-gradient-to-br from-[#e8f0fe] to-[#f8fbff] shadow-[0_14px_34px_rgba(26,115,232,0.14)] dark:border-sky-400 dark:from-sky-500/15 dark:to-slate-800'
      : 'border-[#e0e3e7] bg-white dark:border-slate-700 dark:bg-slate-800'"
    @click="emit('select', $event)"
    @dblclick="emit('open', $event)"
    @contextmenu="emit('contextmenu', $event)"
  >
    <button type="button" class="flex w-full flex-col items-start gap-4 text-left">
      <div class="flex w-full items-start justify-between gap-3">
        <span
          class="grid size-12 place-items-center rounded-2xl transition"
          :class="selected
            ? 'bg-[#d3e3fd] text-[#1a73e8] shadow-inner dark:bg-sky-500/20 dark:text-sky-300'
            : 'bg-[#f1f3f4] text-[#5f6368] dark:bg-slate-700 dark:text-slate-300'"
        >
          <component :is="getFileIcon(item, selected)" :size="22" :stroke="selected ? 0 : 1.8" class="transition-transform duration-200 group-hover:scale-110" />
        </span>
      </div>
      <div class="min-w-0">
        <TruncateMarquee as="p" class="text-sm font-semibold text-[#202124] dark:text-slate-100" :text="item.name" />
        <div class="mt-1 flex min-w-0 items-center gap-2 text-xs text-[#5f6368] dark:text-slate-400">
          <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-white dark:bg-slate-900/70">
            <img
              v-if="providerIcon(item.fs)"
              :src="providerIcon(item.fs)"
              :alt="providerLabel(item.fs)"
              class="size-3.5 object-contain"
            />
            <IconCloud v-else :size="14" :stroke="1.8" class="text-[#5f6368] dark:text-slate-400" />
          </span>
          <span class="truncate">{{ item.email || 'lokal' }}</span>
        </div>
      </div>
      <div class="flex w-full items-center justify-between text-xs text-[#5f6368] dark:text-slate-400">
        <span>{{ formatDate(getModifiedTime(item)) }}</span>
        <span>{{ item.dir ? 'Folder' : formatBytes(item.size) }}</span>
      </div>
    </button>
  </div>
</template>