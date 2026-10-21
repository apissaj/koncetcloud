<script setup>
import { IconLayoutGrid, IconLayoutGridFilled, IconList, IconListDetailsFilled } from '@tabler/icons-vue';

// viewMode disimpan sebagai string 'list' | 'grid' (FileExplorer menyimpannya
// sebagai string juga), jadi prop bertipe String, bukan Boolean.
const props = defineProps({
  modelValue: { type: String, default: 'list' },
});
const emit = defineEmits(['update:modelValue']);

function setMode(mode) {
  if (props.modelValue !== mode) emit('update:modelValue', mode);
}
</script>

<template>
  <div class="flex items-center gap-2">
    <button
      type="button"
      class="grid size-9 place-items-center rounded-full transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none"
      :class="modelValue === 'list'
        ? 'sg-state text-[var(--foreground)]'
        : 'sg-control text-[var(--muted-foreground)] hover:bg-[var(--hover)]'"
      :aria-pressed="modelValue === 'list'"
      aria-label="Tampilan daftar"
      @click="setMode('list')"
    >
      <component :is="modelValue === 'list' ? IconListDetailsFilled : IconList" :size="18" :stroke="modelValue === 'list' ? 0 : 2" />
    </button>
    <button
      type="button"
      class="grid size-9 place-items-center rounded-full transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none"
      :class="modelValue === 'grid'
        ? 'sg-state text-[var(--foreground)]'
        : 'sg-control text-[var(--muted-foreground)] hover:bg-[var(--hover)]'"
      :aria-pressed="modelValue === 'grid'"
      aria-label="Tampilan ikon"
      @click="setMode('grid')"
    >
      <component :is="modelValue === 'grid' ? IconLayoutGridFilled : IconLayoutGrid" :size="18" :stroke="modelValue === 'grid' ? 0 : 2" />
    </button>
  </div>
</template>
