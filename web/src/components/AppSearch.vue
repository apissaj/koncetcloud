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
    <div class="sg-field flex h-12 items-center gap-3 px-4 transition focus-within:ring-2 focus-within:ring-[var(--focus-line)]">
      <IconSearch :size="20" :stroke="2" class="shrink-0 text-[var(--muted-foreground)]" />
      <input
        v-model="term"
        type="text"
        class="min-w-0 flex-1 bg-transparent text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]"
        placeholder="Telusuri di KoncetCloud"
        aria-label="Telusuri berkas"
        @focus="isOpen = true"
      />
      <button v-if="term" type="button" class="sg-control sg-hover grid size-6 shrink-0 place-items-center rounded-full text-[var(--muted-foreground)] focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]" aria-label="Bersihkan pencarian" @click="clear">
        <IconX :size="16" :stroke="2" />
      </button>
    </div>

    <div v-if="isOpen && term.trim()" class="sg-popover absolute left-0 right-0 top-full z-30 mt-2 max-h-[420px] overflow-y-auto p-2">
      <p v-if="!results.length" class="px-3 py-3 text-sm text-[var(--muted-foreground)]">
        Tidak ada hasil untuk "{{ term }}".
      </p>
      <button
        v-for="item in results"
        :key="item.path"
        type="button"
        class="sg-hover flex w-full items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 text-left transition"
        @click="open(item)"
      >
        <component :is="getFileIcon(item, false)" :size="18" :stroke="1.8" class="shrink-0 text-[var(--muted-foreground)]" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm text-[var(--foreground)]">{{ item.name }}</span>
          <span class="block truncate font-mono text-[11px] text-[var(--muted-foreground)]">{{ item.path }}</span>
        </span>
        <span class="shrink-0 text-xs text-[var(--muted-foreground)]">{{ item.dir ? 'Folder' : formatBytes(item.size) }}</span>
      </button>
    </div>
  </div>
</template>