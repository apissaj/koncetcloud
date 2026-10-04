<script setup>
import { computed, ref } from 'vue';
import { IconFolderPlus, IconX } from '@tabler/icons-vue';

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
    const r = await fetch('/api/mkdir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fs: props.fs, path: fullPath.value }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    emit('created');
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 p-4" @click.self="emit('close')">
    <div class="w-full max-w-[440px] overflow-hidden rounded-2xl bg-white shadow-[0_20px_40px_rgba(15,23,42,0.18)] dark:bg-slate-800">
      <header class="flex items-center gap-3 border-b border-[#eceff1] px-6 py-4 dark:border-slate-700">
        <span class="grid size-10 place-items-center rounded-full bg-[#e8f0fe] text-[#1a73e8] dark:bg-sky-500/15 dark:text-sky-300">
          <IconFolderPlus :size="22" :stroke="2" />
        </span>
        <h2 class="text-lg font-semibold text-[#202124] dark:text-slate-100">Folder baru</h2>
        <button type="button" class="ml-auto grid size-8 place-items-center rounded-full text-[#5f6368] transition hover:bg-black/5 dark:text-slate-400 dark:hover:bg-white/10" aria-label="Tutup" @click="emit('close')">
          <IconX :size="18" :stroke="2" />
        </button>
      </header>

      <div class="px-6 py-5">
        <label class="mb-1.5 block text-xs font-semibold text-[#5f6368] dark:text-slate-400" for="nf-name">Nama folder</label>
        <input
          id="nf-name"
          v-model="folderName"
          type="text"
          class="h-11 w-full rounded-xl border border-[#dadce0] bg-white px-3.5 text-sm text-[#202124] outline-none transition focus:border-[#1a73e8] focus:shadow-[0_0_0_3px_rgba(26,115,232,0.15)] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          placeholder="mis. Dokumen"
          autofocus
          @keydown.enter="submit"
        />
        <p class="mt-3 text-xs text-[#5f6368] dark:text-slate-400">
          Dibuat di <span class="font-mono text-[#202124] dark:text-slate-200">{{ fs }}{{ fullPath || '/' }}</span>
        </p>
        <p v-if="error" class="mt-3 rounded-xl border border-[#ea4335]/35 bg-[#ea4335]/10 px-3 py-2 text-xs text-[#c5221f] dark:text-red-300">
          {{ error }}
        </p>
      </div>

      <footer class="flex justify-end gap-2 border-t border-[#eceff1] px-6 py-4 dark:border-slate-700">
        <button type="button" class="inline-flex h-10 items-center rounded-full border border-[#dadce0] bg-white px-5 text-sm font-medium text-[#3c4043] transition hover:bg-[#f8fafd] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" :disabled="busy" @click="emit('close')">
          Batal
        </button>
        <button type="button" class="inline-flex h-10 items-center rounded-full bg-[#1a73e8] px-5 text-sm font-medium text-white transition hover:bg-[#1765cc] disabled:opacity-60" :disabled="busy" @click="submit">
          {{ busy ? 'Membuat...' : 'Buat folder' }}
        </button>
      </footer>
    </div>
  </div>
</template>