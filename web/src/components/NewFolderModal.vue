<script setup>
import { computed, ref } from 'vue';
import { IconFolderPlus, IconX } from '@tabler/icons-vue';
import { apiFetch } from '../composables/useApi.js';

const props = defineProps({
  fs: { type: String, default: '' },
  parentPath: { type: String, default: '' },
});
const emit = defineEmits(['close', 'created']);

const folderName = ref('');
const busy = ref(false);
const error = ref('');

const fullPath = computed(() => {
  const n = folderName.value.trim();
  if (!n) return props.parentPath;
  return props.parentPath ? `${props.parentPath}/${n}` : n;
});

async function submit() {
  const n = folderName.value.trim();
  if (!n) return (error.value = 'Nama folder wajib diisi.');
  if (n.includes('/')) return (error.value = 'Nama folder tidak boleh mengandung "/".');
  busy.value = true;
  error.value = '';
  try {
    await apiFetch('/api/mkdir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fs: props.fs, path: fullPath.value }),
    });
    emit('created');
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center bg-[var(--foreground)]/40 p-4" @click.self="emit('close')">
    <div class="sg-popover w-full max-w-[440px] overflow-hidden">
      <header class="flex items-center gap-3 border-b border-[var(--border)] px-6 py-4">
        <span class="grid size-10 place-items-center rounded-full bg-[var(--muted)] text-[var(--foreground)]">
          <IconFolderPlus :size="22" :stroke="2" />
        </span>
        <h2 class="text-lg font-semibold text-[var(--foreground)]">Folder baru</h2>
        <button type="button" class="sg-control ml-auto grid size-8 place-items-center rounded-full text-[var(--muted-foreground)] transition hover:bg-[var(--hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none" aria-label="Tutup" @click="emit('close')">
          <IconX :size="18" :stroke="2" />
        </button>
      </header>

      <div class="px-6 py-5">
        <label class="mb-1.5 block text-xs font-semibold text-[var(--muted-foreground)]" for="nf-name">Nama folder</label>
        <input
          id="nf-name"
          v-model="folderName"
          type="text"
          class="sg-field h-11 w-full px-3.5 text-sm text-[var(--foreground)] outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]"
          placeholder="mis. Dokumen"
          autofocus
          @keydown.enter="submit"
        />
        <p class="mt-3 text-xs text-[var(--muted-foreground)]">
          Dibuat di <span class="font-mono text-[var(--foreground)]">{{ fs }}{{ fullPath || '/' }}</span>
        </p>
        <p v-if="error" class="mt-3 rounded-lg border border-[var(--destructive)]/35 bg-[var(--destructive)]/10 px-3 py-2 text-xs text-[var(--destructive)]">
          {{ error }}
        </p>
      </div>

      <footer class="flex justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
        <button type="button" class="sg-control inline-flex h-10 items-center rounded-full px-5 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none disabled:opacity-60" :disabled="busy" @click="emit('close')">
          Batal
        </button>
        <button type="button" class="sg-primary inline-flex h-10 items-center rounded-full px-5 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none disabled:opacity-60" :disabled="busy" @click="submit">
          {{ busy ? 'Membuat...' : 'Buat folder' }}
        </button>
      </footer>
    </div>
  </div>
</template>