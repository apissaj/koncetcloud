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
    class="sg-popover fixed z-50 min-w-[200px] overflow-hidden p-2"
    :style="{ left: `${x}px`, top: `${y}px` }"
    role="menu"
  >
    <button
      v-if="canOpen"
      type="button"
      class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--foreground)] transition sg-hover"
      @click="emit('open')"
    >
      <IconFolderOpen :size="18" :stroke="1.8" class="text-[var(--muted-foreground)]" />
      Buka
    </button>
    <button
      v-if="!item.dir"
      type="button"
      class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--foreground)] transition sg-hover"
      @click="emit('download')"
    >
      <IconDownload :size="18" :stroke="1.8" class="text-[var(--muted-foreground)]" />
      Unduh
    </button>
    <button
      v-if="canWrite"
      type="button"
      class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--foreground)] transition sg-hover"
      @click="emit('rename')"
    >
      <IconPencil :size="18" :stroke="1.8" class="text-[var(--muted-foreground)]" />
      Ubah nama
    </button>
    <button
      type="button"
      class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--foreground)] transition sg-hover"
      @click="emit('details')"
    >
      <IconInfoCircle :size="18" :stroke="1.8" class="text-[var(--muted-foreground)]" />
      Detail
    </button>
    <template v-if="canWrite">
      <div class="my-1 h-px bg-[var(--border)]" />
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--destructive)] transition sg-hover"
        @click="emit('delete')"
      >
        <IconTrash :size="18" :stroke="1.8" />
        Hapus
      </button>
    </template>
  </div>
</template>