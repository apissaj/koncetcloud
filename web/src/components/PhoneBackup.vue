<script setup>
// Backup dari HP: pilih foto/video dari browser HP, kirim per chunk ke server,
// server pindahkan ke remote cloud. Admin saja (menulis ke remote).
import { computed, onMounted, ref } from 'vue';
import { IconDeviceMobile, IconUpload, IconX, IconCircleCheck, IconAlertTriangle } from '@tabler/icons-vue';
import { apiFetch } from '../composables/useApi.js';

const remotes = ref([]);
const remote = ref('');
const subdir = ref('Backup HP');
const files = ref([]); // { file, status: 'menunggu'|'mengirim'|'selesai'|'gagal', sent, error }
const busy = ref(false);
const loadingRemotes = ref(true);
const loadError = ref('');
const cancelRequested = ref(false);

const MAX_FILE = 4 * 1024 * 1024 * 1024;

const totalBytes = computed(() => files.value.reduce((a, f) => a + f.file.size, 0));
const doneCount = computed(() => files.value.filter((f) => f.status === 'selesai').length);

function fmt(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' GB';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MB';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + ' KB';
  return n + ' B';
}

async function loadRemotes() {
  loadError.value = '';
  loadingRemotes.value = true;
  try {
    const r = await apiFetch('/api/phone/targets');
    const d = await r.json().catch(() => ({}));
    remotes.value = d.remotes || [];
    if (!remote.value && remotes.value.length) remote.value = remotes.value[0].name;
  } catch (e) {
    loadError.value = 'Gagal memuat daftar akun: ' + e.message;
  } finally {
    loadingRemotes.value = false;
  }
}

function onPick(e) {
  const picked = Array.from(e.target.files || []);
  e.target.value = '';
  for (const f of picked) {
    if (f.size > MAX_FILE) {
      files.value.push({ file: f, status: 'gagal', sent: 0, error: 'Lebih dari 4 GB, dilewati.' });
    } else {
      files.value.push({ file: f, status: 'menunggu', sent: 0, error: '' });
    }
  }
}

function removeOne(i) {
  if (busy.value) return;
  files.value.splice(i, 1);
}

async function postJson(url, body) {
  const r = await apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json().catch(() => ({}));
}

async function uploadOne(item) {
  const f = item.file;
  const init = await postJson('/api/phone/upload/init', {
    name: f.name,
    size: f.size,
    dest: remote.value + ':',
    subdir: subdir.value.trim(),
  });
  const chunk = init.chunkSize;
  let offset = 0;
  while (offset < f.size) {
    if (cancelRequested.value) {
      await apiFetch(`/api/phone/upload/${init.id}`, { method: 'DELETE' }).catch(() => {});
      throw new Error('Dibatalkan.');
    }
    const blob = f.slice(offset, Math.min(offset + chunk, f.size));
    let ok = false;
    let lastErr = '';
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      try {
        await apiFetch(`/api/phone/upload/${init.id}/chunk?offset=${offset}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: blob,
        });
        ok = true;
      } catch (e) {
        lastErr = e.message;
        await new Promise((res) => setTimeout(res, 800 * attempt));
      }
    }
    if (!ok) throw new Error(`Chunk gagal setelah 3 percobaan: ${lastErr}`);
    offset += blob.size;
    item.sent = offset;
  }
  await postJson(`/api/phone/upload/${init.id}/finish`, {});
}

async function startUpload() {
  if (busy.value || !remote.value || !files.value.some((f) => f.status === 'menunggu')) return;
  busy.value = true;
  cancelRequested.value = false;
  for (const item of files.value) {
    if (item.status !== 'menunggu') continue;
    if (cancelRequested.value) break;
    item.status = 'mengirim';
    try {
      await uploadOne(item);
      item.status = 'selesai';
    } catch (e) {
      item.status = 'gagal';
      item.error = e.message;
    }
  }
  busy.value = false;
}

function cancelAll() {
  cancelRequested.value = true;
}

onMounted(loadRemotes);
</script>

<template>
  <section class="mx-auto flex w-full max-w-3xl flex-col gap-5">
    <div class="sg-card p-5 sm:p-7">
      <p class="mb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Backup HP</p>
      <h1 class="text-xl font-semibold text-[var(--foreground)]">Kirim foto & video dari HP</h1>
      <p class="mt-1 text-sm text-[var(--muted-foreground)]">
        Pilih file dari galeri HP. File dikirim bertahap lalu disimpan ke akun cloud yang kamu pilih.
      </p>

      <div class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label class="flex flex-col gap-1.5 text-xs font-medium text-[var(--muted-foreground)]">
          Akun tujuan
          <select
            v-model="remote"
            :disabled="busy || !remotes.length"
            class="sg-field h-11 px-3 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]"
          >
            <option v-if="loadingRemotes" value="">Memuat akun...</option>
            <option v-else-if="!remotes.length" value="">Belum ada akun</option>
            <option v-for="r in remotes" :key="r.name" :value="r.name">{{ r.name }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1.5 text-xs font-medium text-[var(--muted-foreground)]">
          Folder di dalam akun
          <input
            v-model="subdir"
            :disabled="busy"
            type="text"
            placeholder="Backup HP"
            class="sg-field h-11 px-3.5 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]"
          />
        </label>
      </div>

      <p v-if="loadError" class="sg-card mt-3 flex items-start gap-1.5 px-3 py-2 text-xs text-[var(--destructive)]">
        <IconAlertTriangle :size="14" :stroke="1.8" class="mt-0.5 shrink-0" />{{ loadError }}
      </p>

      <div class="mt-5 flex flex-wrap items-center gap-3">
        <label
          class="sg-primary inline-flex h-11 cursor-pointer items-center gap-2 px-5 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]"
          :class="busy ? 'pointer-events-none opacity-60' : ''"
        >
          <IconDeviceMobile :size="18" :stroke="1.8" />
          Pilih foto/video
          <input type="file" multiple accept="image/*,video/*" class="sr-only" @change="onPick" />
        </label>
        <button
          v-if="!busy"
          type="button"
          class="sg-control inline-flex h-11 items-center gap-2 px-5 text-sm font-medium text-[var(--foreground)] transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] disabled:opacity-50"
          :disabled="!remote || !files.some((f) => f.status === 'menunggu')"
          @click="startUpload"
        >
          <IconUpload :size="18" :stroke="1.8" />
          Kirim {{ files.filter((f) => f.status === 'menunggu').length }} file
        </button>
        <button
          v-else
          type="button"
          class="sg-control inline-flex h-11 items-center gap-2 px-5 text-sm font-medium text-[var(--destructive)] transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]"
          @click="cancelAll"
        >
          <IconX :size="18" :stroke="1.8" />
          Batalkan
        </button>
      </div>
    </div>

    <div v-if="files.length" class="sg-card p-5 sm:p-6">
      <p class="mb-3 text-xs text-[var(--muted-foreground)]">
        {{ doneCount }} dari {{ files.length }} selesai · total {{ fmt(totalBytes) }}
      </p>
      <ul class="flex flex-col gap-2">
        <li
          v-for="(item, i) in files"
          :key="i"
          class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--glass-edge)] p-3 last:border-b-0"
        >
          <div class="min-w-0">
            <p class="truncate text-sm text-[var(--foreground)]">{{ item.file.name }}</p>
            <div class="sg-groove mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
              <div
                class="h-full bg-[var(--primary)] transition-[width]"
                :style="{ width: (item.file.size ? (item.sent / item.file.size) * 100 : 0) + '%' }"
              />
            </div>
            <p class="mt-1 text-[11px] text-[var(--muted-foreground)]">
              {{ fmt(item.file.size) }}
              <span v-if="item.status === 'mengirim'"> · mengirim {{ fmt(item.sent) }}</span>
              <span v-if="item.error" class="text-[var(--destructive)]"> · {{ item.error }}</span>
            </p>
          </div>
          <span
            v-if="item.status === 'selesai'"
            class="sg-control inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium text-[var(--success)]"
          >
            <IconCircleCheck :size="13" :stroke="1.8" />Selesai
          </span>
          <span
            v-else-if="item.status === 'gagal'"
            class="sg-control rounded-full px-2.5 py-0.5 text-[11px] font-medium text-[var(--destructive)]"
          >Gagal</span>
          <span
            v-else-if="item.status === 'mengirim'"
            class="sg-state rounded-full px-2.5 py-0.5 text-[11px] font-medium text-[var(--status-running)]"
          >Mengirim</span>
          <button
            v-else
            type="button"
            :disabled="busy"
            class="grid size-8 place-items-center rounded-full text-[var(--muted-foreground)] transition hover:bg-[var(--muted)] disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]"
            aria-label="Hapus dari daftar"
            @click="removeOne(i)"
          >
            <IconX :size="16" :stroke="1.8" />
          </button>
        </li>
      </ul>
    </div>

    <div v-else class="flex flex-col items-center gap-2 rounded-[24px] border border-dashed border-[var(--glass-edge)] py-14 text-center">
      <IconDeviceMobile :size="36" :stroke="1.5" class="text-[var(--muted-foreground)]" />
      <p class="text-sm text-[var(--muted-foreground)]">Belum ada file dipilih.</p>
    </div>
  </section>
</template>
