<script setup>
import { ref, watch } from 'vue';
import { IconAlertTriangle, IconCloudPlus, IconLock, IconX } from '@tabler/icons-vue';

const props = defineProps({
  platform: { type: Object, required: true },
  mode: { type: String, default: 'connect' }, // 'connect' | 'add'
  defaultRemoteName: { type: String, default: '' },
});
const emit = defineEmits(['close', 'connected', 'oauth']);

const user = ref('');
const pass = ref('');
const remote = ref('');
const busy = ref(false);
const error = ref('');

watch(
  () => props.defaultRemoteName,
  (v) => {
    if (v) remote.value = v;
  },
  { immediate: true },
);

const isAddMode = () => props.mode === 'add';
const isOAuth = () => props.platform.auth === 'oauth';

function validate() {
  // Platform OAuth login lewat browser: tidak butuh email/password di sini.
  if (isOAuth()) {
    if (!remote.value.trim()) return 'Nama remote wajib diisi.';
    return '';
  }
  if (!user.value.trim()) return 'Email wajib diisi.';
  if (!pass.value) return 'Password wajib diisi.';
  if (isAddMode() && !remote.value.trim()) return 'Nama remote wajib diisi.';
  return '';
}

async function submit() {
  error.value = '';
  const vErr = validate();
  if (vErr) {
    error.value = vErr;
    return;
  }
  busy.value = true;
  const name = remote.value.trim() || props.platform.id;
  try {
    const r = await fetch('/api/platforms/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: props.platform.id,
        name,
        user: user.value.trim(),
        pass: pass.value,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 409 || d.code === 'already_exists') {
        throw new Error(d.error || 'Platform ini sudah terpasang.');
      }
      throw new Error(d.error || `HTTP ${r.status}`);
    }
    if (isOAuth()) {
      // Mode OAuth: backend langsung balas dengan processId untuk dipantau di sini.
      if (!d.process) throw new Error('Server tidak mengembalikan proses OAuth.');
      // Kosongkan field password dari state frontend sebelum menutup modal.
      pass.value = '';
      emit('oauth', { platform: props.platform, process: d.process, authUrl: d.authUrl || '' });
      closeDlg();
      return;
    }
    // Sukses (mode form): kosongkan field password dari state frontend.
    pass.value = '';
    emit('connected', { remote: d.remote || name, warning: d.warning || '' });
    closeDlg();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

function closeDlg() {
  emit('close');
}
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center bg-[var(--foreground)]/40 p-4" @click.self="emit('close')">
    <div class="sg-popover w-full max-w-[460px] overflow-hidden">
      <header class="flex items-center gap-3 border-b border-[var(--border)] px-6 py-4">
        <span class="grid size-10 place-items-center rounded-full bg-[var(--muted)] text-[var(--primary)]">
          <IconCloudPlus :size="22" :stroke="2" />
        </span>
        <div class="min-w-0">
          <h2 class="text-lg font-semibold text-[var(--foreground)]">
            {{ isAddMode() ? `Tambah akun ${platform.label}` : `Hubungkan ${platform.label}` }}
          </h2>
          <p class="text-xs text-[var(--muted-foreground)]">
            {{ isAddMode() ? 'Sambungkan akun lain di platform yang sama.' : `Masuk dengan akun ${platform.label} Anda.` }}
          </p>
        </div>
        <button type="button" class="sg-control ml-auto grid size-8 shrink-0 place-items-center rounded-full text-[var(--muted-foreground)] transition hover:bg-[var(--hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none" aria-label="Tutup" @click="emit('close')">
          <IconX :size="18" :stroke="2" />
        </button>
      </header>

      <form class="px-6 py-5" @submit.prevent="submit">
        <p v-if="isOAuth()" class="text-sm text-[var(--muted-foreground)]">
          Platform ini login lewat browser. Isi nama remote lalu lanjutkan, dan selesaikan login
          {{ platform.label }} di tab yang terbuka.
        </p>

        <label class="mb-1.5 block text-xs font-semibold text-[var(--muted-foreground)]" for="cf-remote">
          Nama remote{{ isOAuth() ? '' : ' (opsional)' }}
        </label>
        <input
          id="cf-remote"
          v-model="remote"
          type="text"
          autocomplete="off"
          spellcheck="false"
          :placeholder="defaultRemoteName || `${platform.id}2`"
          class="sg-field h-11 w-full px-3.5 font-mono text-sm text-[var(--foreground)] outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]"
        />
        <p class="mt-1.5 text-xs text-[var(--muted-foreground)]">
          Biarkan kosong untuk memakai nama bawaan. Untuk akun tambahan, isi dengan nama baru seperti {{ defaultRemoteName || `${platform.id}2` }}.
        </p>

        <template v-if="!isOAuth()">
          <label class="mb-1.5 mt-4 block text-xs font-semibold text-[var(--muted-foreground)]" for="cf-user">Email</label>
          <input
            id="cf-user"
            v-model="user"
            type="email"
            autocomplete="off"
            spellcheck="false"
            class="sg-field h-11 w-full px-3.5 text-sm text-[var(--foreground)] outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]"
            placeholder="nama@email.com"
          />

          <label class="mb-1.5 mt-4 block text-xs font-semibold text-[var(--muted-foreground)]" for="cf-pass">Password</label>
          <div class="relative">
            <input
              id="cf-pass"
              v-model="pass"
              type="password"
              autocomplete="off"
              class="sg-field h-11 w-full px-3.5 pr-11 text-sm text-[var(--foreground)] outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]"
              placeholder="••••••••"
            />
            <span class="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]">
              <IconLock :size="18" :stroke="1.8" />
            </span>
          </div>
          <p class="mt-2 flex items-start gap-1.5 text-xs text-[var(--muted-foreground)]">
            <IconLock :size="14" :stroke="1.8" class="mt-0.5 shrink-0" />
            Kredensial dikirim langsung ke server lokal Anda, tidak disimpan di halaman ini, dan password tidak ditampilkan kembali setelah berhasil.
          </p>
        </template>

        <p v-if="error" class="mt-3 flex items-start gap-1.5 rounded-xl border border-[var(--destructive)]/35 bg-[var(--destructive)]/10 px-3 py-2 text-xs text-[var(--destructive)]">
          <IconAlertTriangle :size="14" :stroke="2" class="mt-0.5 shrink-0" />
          {{ error }}
        </p>

        <div class="mt-5 flex justify-end gap-2">
          <button type="button" class="sg-control inline-flex h-10 items-center px-5 text-sm font-medium text-[var(--foreground)] transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none" :disabled="busy" @click="emit('close')">
            Batal
          </button>
          <button type="submit" class="sg-primary inline-flex h-10 items-center px-5 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none disabled:opacity-60" :disabled="busy">
            {{ busy ? 'Menghubungkan...' : (isAddMode() ? 'Tambah akun' : 'Hubungkan') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
