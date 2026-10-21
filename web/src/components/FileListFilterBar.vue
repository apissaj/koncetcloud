<script setup>
import { computed, ref } from 'vue';
import {
  IconCheck,
  IconChevronDown,
  IconSearch,
  IconX,
} from '@tabler/icons-vue';
import { getTypeFilterIcon } from '../composables/useFileType.js';

const props = defineProps({
  typeOptions: { type: Array, default: () => [] },
  selectedTypeFilter: { type: String, default: 'all' },
  activeFilterMenu: { type: String, default: null },
  searchTerm: { type: String, default: '' },
});

const emit = defineEmits(['toggle-filter-menu', 'apply-filter', 'clear-filter', 'update:searchTerm']);

const ALL_TYPES = [
  { value: 'all', label: 'Semua jenis' },
  { value: 'folder', label: 'Folder' },
  { value: 'image', label: 'Gambar' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
  { value: 'archive', label: 'Arsip' },
  { value: 'document', label: 'Dokumen' },
  { value: 'other', label: 'Lainnya' },
];

function getTypeLabel(value) {
  return ALL_TYPES.find((o) => o.value === value)?.label || props.typeOptions.find((o) => o.value === value)?.label || 'Semua jenis';
}
function isFilterActive() {
  return props.selectedTypeFilter !== 'all' && props.selectedTypeFilter !== '';
}
function apply(value) {
  emit('apply-filter', 'type', value);
}
</script>

<template>
  <div class="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
    <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
      <div class="relative">
        <button
          type="button"
          class="inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none"
          :class="isFilterActive() ? 'sg-state' : 'sg-control'"
          @click.stop="emit('toggle-filter-menu', 'type')"
        >
          <component :is="getTypeFilterIcon(selectedTypeFilter, isFilterActive())" :size="16" :stroke="isFilterActive() ? 0 : 1.8" />
          <span>{{ getTypeLabel(selectedTypeFilter) }}</span>
          <IconX v-if="isFilterActive()" :size="16" :stroke="2" class="text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]" @click.stop="emit('clear-filter', 'type')" />
          <IconChevronDown v-else :size="16" :stroke="2" class="text-[var(--muted-foreground)]" />
        </button>
        <div v-if="activeFilterMenu === 'type'" class="sg-popover absolute left-0 top-full z-30 mt-2 min-w-[220px] overflow-hidden p-2">
          <button
            v-for="option in ALL_TYPES"
            :key="option.value"
            type="button"
            class="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition sg-hover text-[var(--foreground)]"
            @click="apply(option.value)"
          >
            <span class="flex items-center gap-2">
              <component :is="getTypeFilterIcon(option.value, selectedTypeFilter === option.value)" :size="16" :stroke="selectedTypeFilter === option.value ? 0 : 1.8" class="text-[var(--muted-foreground)]" />
              {{ option.label }}
            </span>
            <IconCheck v-if="selectedTypeFilter === option.value" :size="16" :stroke="2" class="text-[var(--foreground)]" />
          </button>
        </div>
      </div>
    </div>

    <div class="relative sm:max-w-[300px] sm:flex-1">
      <IconSearch :size="18" :stroke="2" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
      <input
        :value="searchTerm"
        type="text"
        class="sg-field h-11 w-full pl-10 pr-4 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted-foreground)] focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]"
        placeholder="Telusuri folder ini..."
        aria-label="Cari berkas di folder ini"
        @input="emit('update:searchTerm', $event.target.value)"
      />
    </div>
  </div>
</template>