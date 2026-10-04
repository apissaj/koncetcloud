<script setup>
import { IconChevronDown, IconChevronUp } from '@tabler/icons-vue';

const props = defineProps({
  sortable: { type: Boolean, default: true },
  sortBy: { type: String, default: 'name' },
  sortDirection: { type: String, default: 'asc' },
  showOwner: { type: Boolean, default: true },
});

const emit = defineEmits(['sort']);

function handleSort(field) {
  if (!props.sortable) return;
  emit('sort', field);
}
function indicatorFor(field) {
  if (props.sortBy !== field) return null;
  return props.sortDirection === 'asc' ? IconChevronUp : IconChevronDown;
}
</script>

<template>
  <div
    class="sticky top-0 z-10 grid min-h-11 items-center gap-3 border-b border-[#e8eaed] bg-[#f8fafd]/95 px-[18px] text-[13px] text-[#5f6368] backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-400"
    :class="showOwner
      ? 'grid-cols-[minmax(260px,2fr)_minmax(180px,1.1fr)_minmax(150px,1fr)_140px]'
      : 'grid-cols-[minmax(260px,3fr)_minmax(140px,1fr)_140px]'"
  >
    <template v-if="sortable">
      <button type="button" class="flex items-center gap-1 text-left hover:text-[#1a73e8]" @click="handleSort('name')">
        <span>Nama</span>
        <component :is="indicatorFor('name')" v-if="indicatorFor('name')" :size="14" :stroke="2" />
      </button>
      <span v-if="showOwner">Pemilik</span>
      <button type="button" class="flex items-center gap-1 text-left hover:text-[#1a73e8]" @click="handleSort('modTime')">
        <span>Terakhir diubah</span>
        <component :is="indicatorFor('modTime')" v-if="indicatorFor('modTime')" :size="14" :stroke="2" />
      </button>
      <button type="button" class="flex items-center gap-1 text-left hover:text-[#1a73e8]" @click="handleSort('size')">
        <span>Ukuran</span>
        <component :is="indicatorFor('size')" v-if="indicatorFor('size')" :size="14" :stroke="2" />
      </button>
    </template>
    <template v-else>
      <span>Nama</span>
      <span v-if="showOwner">Pemilik</span>
      <span>Terakhir diubah</span>
      <span>Ukuran</span>
    </template>
  </div>
</template>