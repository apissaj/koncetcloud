<script setup>
import { computed, ref } from 'vue';
import { IconSearch, IconX } from '@tabler/icons-vue';
import { getFileIcon } from '../composables/useFileType.js';
import { formatBytes } from '../composables/useFormatFile.js';

const props = defineProps({
  files: { type: Array, default: () => [] },
});
const emit = defineEmits(['open-file']);

const term = ref('');
const isOpen = ref(false);

const results = computed(() => {
  const q = term.value.trim().toLowerCase();
  if (!q) return [];
  return props.files.filter((f) => (f.name || '').toLowerCase().includes(q)).slice(0, 20);
});

function clear() {
  term.value = '';
  isOpen.value = false;
}
function open(item) {
  emit('open-file', item);
  clear();
}
</script>

<template>
  <div class="relative w-full max-w-[720px]">
    <div class="flex h-12 items-center gap-3 rounded-full bg-[#e9eef6] px-4 transition focus-within:bg-white focus-within:shadow-[0_1px_6px_rgba(32,33,36,0.28)] dark:bg-slate-800 dark:focus-within:bg-slate-800">
      <IconSearch :size="20" :stroke="2" class="shrink-0 text-[#5f6368] dark:text-slate-400" />
      <input
        v-model="term"
        type="text"
        class="min-w-0 flex-1 bg-transparent text-sm text-[#202124] outline-none placeholder:text-[#5f6368] dark:text-slate-100 dark:placeholder:text-slate-400"
        placeholder="Telusuri di KoncetCloud"
        aria-label="Telusuri berkas"
        @focus="isOpen = true"
      />
      <button v-if="term" type="button" class="grid size-6 shrink-0 place-items-center rounded-full text-[#5f6368] hover:bg-black/5 dark:text-slate-400 dark:hover:bg-white/10" aria-label="Bersihkan pencarian" @click="clear">
        <IconX :size="16" :stroke="2" />
      </button>
    </div>

    <div v-if="isOpen && term.trim()" class="absolute left-0 right-0 top-full z-30 mt-2 max-h-[420px] overflow-y-auto rounded-2xl border border-[#e0e3e7] bg-white p-2 shadow-[0_16px_40px_rgba(32,33,36,0.16)] dark:border-slate-700 dark:bg-slate-800">
      <p v-if="!results.length" class="px-3 py-3 text-sm text-[#5f6368] dark:text-slate-400">
        Tidak ada hasil untuk "{{ term }}".
      </p>
      <button
        v-for="item in results"
        :key="item.path"
        type="button"
        class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-[#f8fafd] dark:hover:bg-slate-700/70"
        @click="open(item)"
      >
        <component :is="getFileIcon(item, false)" :size="18" :stroke="1.8" class="shrink-0 text-[#5f6368] dark:text-slate-400" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm text-[#202124] dark:text-slate-100">{{ item.name }}</span>
          <span class="block truncate font-mono text-[11px] text-[#5f6368] dark:text-slate-400">{{ item.path }}</span>
        </span>
        <span class="shrink-0 text-xs text-[#5f6368] dark:text-slate-400">{{ item.dir ? 'Folder' : formatBytes(item.size) }}</span>
      </button>
    </div>
  </div>
</template>