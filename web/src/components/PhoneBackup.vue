<script setup>
// Backup dari HP: pilih foto/video dari browser HP, kirim per chunk ke server,
// server pindahkan ke remote cloud. Admin saja (menulis ke remote).
import { computed, onMounted, ref } from 'vue';
import { IconDeviceMobile, IconUpload, IconX, IconCircleCheck, IconAlertTriangle } from '@tabler/icons-vue';

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
    const r = await fetch('/api/phone/targets');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
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
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
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
      await fetch(`/api/phone/upload/${init.id}`, { method: 'DELETE' }).catch(() => {});
      throw new Error('Dibatalkan.');
    }
    const blob = f.slice(offset, Math.min(offset + chunk, f.size));
    let ok = false;
    let lastErr = '';
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      try {
        const r = await fetch(`/api/phone/upload/${init.id}/chunk?offset=${offset}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: blob,
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || `HTTP ${r.status}`);
        }
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
    <div class="rounded-[24px] bg-white p-5 dark:bg-slate-800 sm:p-7">
      <p class="mb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[#1a73e8] dark:text-sky-400">Backup HP</p>
      <h1 class="text-xl font-semibold text-[#202124] dark:text-slate-100">Kirim foto & video dari HP</h1>
      <p class="mt-1 text-sm text-[#5f6368] dark:text-slate-400">
        Pilih file dari galeri HP. File dikirim bertahap lalu disimpan ke akun cloud yang kamu pilih.
      </p>

      <div class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label class="flex flex-col gap-1.5 text-xs font-medium text-[#3c4043] dark:text-slate-300">
          Akun tujuan
          <select
            v-model="remote"
            :disabled="busy || !remotes.length"
            class="h-11 rounded-xl border border-[#dadce0] bg-white px-3 text-sm text-[#202124] outline-none focus:border-[#1a73e8] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          >
            <option v-if="loadingRemotes" value="">Memuat akun...</option>
            <option v-else-if="!remotes.length" value="">Belum ada akun</option>
            <option v-for="r in remotes" :key="r.name" :value="r.name">{{ r.name }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1.5 text-xs font-medium text-[#3c4043] dark:text-slate-300">
          Folder di dalam akun
          <input
            v-model="subdir"
            :disabled="busy"
            type="text"
            placeholder="Backup HP"
            class="h-11 rounded-xl border border-[#dadce0] bg-white px-3.5 text-sm text-[#202124] outline-none focus:border-[#1a73e8] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>
      </div>

      <p v-if="loadError" class="mt-3 flex items-start gap-1.5 rounded-xl border border-[#ea4335]/35 bg-[#ea4335]/10 px-3 py-2 text-xs text-[#c5221f]">
        <IconAlertTriangle :size="14" :stroke="1.8" class="mt-0.5 shrink-0" />{{ loadError }}
      </p>

      <div class="mt-5 flex flex-wrap items-center gap-3">
        <label
          class="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-[#1a73e8] px-5 text-sm font-medium text-white transition hover:bg-[#1765cc]"
          :class="busy ? 'pointer-events-none opacity-60' : ''"
        >
          <IconDeviceMobile :size="18" :stroke="1.8" />
          Pilih foto/video
          <input type="file" multiple accept="image/*,video/*" class="sr-only" @change="onPick" />
        </label>
        <button
          v-if="!busy"
          type="button"
          class="inline-flex h-11 items-center gap-2 rounded-full border border-[#dadce0] bg-white px-5 text-sm font-medium text-[#3c4043] transition hover:bg-[#f1f3f4] disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          :disabled="!remote || !files.some((f) => f.status === 'menunggu')"
          @click="startUpload"
        >
          <IconUpload :size="18" :stroke="1.8" />
          Kirim {{ files.filter((f) => f.status === 'menunggu').length }} file
        </button>
        <button
          v-else
          type="button"
          class="inline-flex h-11 items-center gap-2 rounded-full border border-amber-500/50 bg-amber-500/10 px-5 text-sm font-medium text-amber-700 transition hover:bg-amber-500/20 dark:text-amber-300"
          @click="cancelAll"
        >
          <IconX :size="18" :stroke="1.8" />
          Batalkan
        </button>
      </div>
    </div>

    <div v-if="files.length" class="rounded-[24px] bg-white p-5 dark:bg-slate-800 sm:p-6">
      <p class="mb-3 text-xs text-[#5f6368] dark:text-slate-400">
        {{ doneCount }} dari {{ files.length }} selesai · total {{ fmt(totalBytes) }}
      </p>
      <ul class="flex flex-col gap-2">
        <li
          v-for="(item, i) in files"
          :key="i"
          class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-[#e0e3e7] p-3 dark:border-slate-700"
        >
          <div class="min-w-0">
            <p class="truncate text-sm text-[#202124] dark:text-slate-100">{{ item.file.name }}</p>
            <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#f1f3f4] dark:bg-slate-700">
              <div
                class="h-full bg-[#1a73e8] transition-[width]"
                :style="{ width: (item.file.size ? (item.sent / item.file.size) * 100 : 0) + '%' }"
              />
            </div>
            <p class="mt-1 text-[11px] text-[#5f6368] dark:text-slate-400">
              {{ fmt(item.file.size) }}
              <span v-if="item.status === 'mengirim'"> · mengirim {{ fmt(item.sent) }}</span>
              <span v-if="item.error" class="text-[#c5221f] dark:text-red-300"> · {{ item.error }}</span>
            </p>
          </div>
          <span
            v-if="item.status === 'selesai'"
            class="inline-flex items-center gap-1 rounded-full border border-[#34a853]/35 bg-[#e6f4ea] px-2.5 py-0.5 text-[11px] font-medium text-[#137333]"
          >
            <IconCircleCheck :size="13" :stroke="1.8" />Selesai
          </span>
          <span
            v-else-if="item.status === 'gagal'"
            class="rounded-full border border-[#ea4335]/35 bg-[#fce8e6] px-2.5 py-0.5 text-[11px] font-medium text-[#c5221f]"
          >Gagal</span>
          <span
            v-else-if="item.status === 'mengirim'"
            class="rounded-full border border-[#1a73e8]/40 bg-[#e8f0fe] px-2.5 py-0.5 text-[11px] font-medium text-[#1967d2]"
          >Mengirim</span>
          <button
            v-else
            type="button"
            :disabled="busy"
            class="grid size-8 place-items-center rounded-full text-[#5f6368] transition hover:bg-[#f1f3f4] disabled:opacity-40"
            aria-label="Hapus dari daftar"
            @click="removeOne(i)"
          >
            <IconX :size="16" :stroke="1.8" />
          </button>
        </li>
      </ul>
    </div>

    <div v-else class="flex flex-col items-center gap-2 rounded-[24px] border border-dashed border-[#e0e3e7] py-14 text-center dark:border-slate-700">
      <IconDeviceMobile :size="36" :stroke="1.5" class="text-[#5f6368]" />
      <p class="text-sm text-[#5f6368] dark:text-slate-400">Belum ada file dipilih.</p>
    </div>
  </section>
</template>
