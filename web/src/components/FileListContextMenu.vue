<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import {
  IconDownload,
  IconFolderOpen,
  IconInfoCircle,
  IconPencil,
  IconTrash,
} from '@tabler/icons-vue';

const props = defineProps({
  item: { type: Object, required: true },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  canOpen: { type: Boolean, default: true },
  canWrite: { type: Boolean, default: true },
});
const emit = defineEmits(['close', 'open', 'download', 'rename', 'details', 'delete']);

const menuRef = ref(null);

function handleDocumentClick(event) {
  if (!menuRef.value?.contains(event.target)) emit('close');
}

onMounted(() => document.addEventListener('click', handleDocumentClick));
onBeforeUnmount(() => document.removeEventListener('click', handleDocumentClick));
</script>

<template>
  <div
    ref="menuRef"
    class="fixed z-50 min-w-[200px] overflow-hidden rounded-2xl border border-[#e0e3e7] bg-white p-2 shadow-[0_16px_40px_rgba(32,33,36,0.16)] dark:border-slate-700 dark:bg-slate-800"
    :style="{ left: `${x}px`, top: `${y}px` }"
    role="menu"
  >
    <button
      v-if="canOpen"
      type="button"
      class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[#202124] transition hover:bg-[#f8fafd] dark:text-slate-100 dark:hover:bg-slate-700/70"
      @click="emit('open')"
    >
      <IconFolderOpen :size="18" :stroke="1.8" class="text-[#5f6368] dark:text-slate-400" />
      Buka
    </button>
    <button
      v-if="!item.dir"
      type="button"
      class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[#202124] transition hover:bg-[#f8fafd] dark:text-slate-100 dark:hover:bg-slate-700/70"
      @click="emit('download')"
    >
      <IconDownload :size="18" :stroke="1.8" class="text-[#5f6368] dark:text-slate-400" />
      Unduh
    </button>
    <button
      v-if="canWrite"
      type="button"
      class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[#202124] transition hover:bg-[#f8fafd] dark:text-slate-100 dark:hover:bg-slate-700/70"
      @click="emit('rename')"
    >
      <IconPencil :size="18" :stroke="1.8" class="text-[#5f6368] dark:text-slate-400" />
      Ubah nama
    </button>
    <button
      type="button"
      class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[#202124] transition hover:bg-[#f8fafd] dark:text-slate-100 dark:hover:bg-slate-700/70"
      @click="emit('details')"
    >
      <IconInfoCircle :size="18" :stroke="1.8" class="text-[#5f6368] dark:text-slate-400" />
      Detail
    </button>
    <template v-if="canWrite">
      <div class="my-1 h-px bg-[#eceff1] dark:bg-slate-700" />
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[#c5221f] transition hover:bg-[#ea4335]/10 dark:text-red-300"
        @click="emit('delete')"
      >
        <IconTrash :size="18" :stroke="1.8" />
        Hapus
      </button>
    </template>
  </div>
</template>