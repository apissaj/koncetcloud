<script setup>
import { ref } from 'vue';
import { IconCloudFilled, IconLock, IconUser } from '@tabler/icons-vue';
import logoUrl from '../assets/logo.svg';

const emit = defineEmits(['authed']);

const username = ref('');
const password = ref('');
const code = ref('');
const remember = ref(false);
const needsCode = ref(false);   // server minta kode autentikator
const busy = ref(false);
const error = ref('');

async function submit() {
  if (!username.value.trim() || !password.value) {
    error.value = 'Username dan password wajib diisi.';
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username.value.trim(),
        password: password.value,
        code: code.value.trim() || undefined,
        remember: remember.value,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      // 2FA aktif: tampilkan kolom kode, jangan bersihkan username/password.
      if (d.code === 'totp_required' || d.code === 'bad_totp') needsCode.value = true;
      throw new Error(d.error || `HTTP ${r.status}`);
    }
    username.value = '';
    password.value = '';
    code.value = '';
    emit('authed', d.user);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="grid min-h-screen place-items-center bg-[var(--background)] p-4">
    <form class="sg-card w-full max-w-[420px] p-7" @submit.prevent="submit">
      <div class="mb-6 flex flex-col items-center gap-3 text-center">
        <span class="grid size-14 place-items-center overflow-hidden rounded-2xl bg-[var(--muted)]">
          <img :src="logoUrl" alt="KoncetCloud" class="size-11 object-contain" />
        </span>
        <div>
          <h1 class="text-xl font-semibold text-[var(--foreground)]">KoncetCloud</h1>
          <p class="mt-1 text-sm text-[var(--muted-foreground)]">
            Masuk untuk mengelola backup dan berkas Anda.
          </p>
        </div>
      </div>

      <label class="mb-1.5 block text-xs font-semibold text-[var(--muted-foreground)]" for="kc-user">Username</label>
      <div class="relative mb-4">
        <IconUser :size="18" :stroke="1.8" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
        <input
          id="kc-user"
          v-model="username"
          type="text"
          autocomplete="username"
          class="sg-field h-11 w-full pl-10 pr-3.5 text-sm text-[var(--foreground)] outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]"
          placeholder="admin"
          autofocus
        />
      </div>

      <label class="mb-1.5 block text-xs font-semibold text-[var(--muted-foreground)]" for="kc-pass">Password</label>
      <div class="relative">
        <IconLock :size="18" :stroke="1.8" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
        <input
          id="kc-pass"
          v-model="password"
          type="password"
          autocomplete="current-password"
          class="sg-field h-11 w-full pl-10 pr-3.5 text-sm text-[var(--foreground)] outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]"
          placeholder="Password"
        />
      </div>

      <div v-if="needsCode" class="mt-4">
        <label class="mb-1.5 block text-xs font-semibold text-[var(--muted-foreground)]" for="kc-code">Kode autentikator</label>
        <input
          id="kc-code"
          v-model="code"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          class="sg-control h-11 w-full px-3.5 text-center font-mono text-lg tracking-[0.3em] text-[var(--foreground)] outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]"
          placeholder="123456"
        />
        <p class="mt-1.5 text-[11px] text-[var(--muted-foreground)]">
          Buka aplikasi autentikator (Google Authenticator, Aegis, dll) lalu ketik kode 6 digit.
        </p>
      </div>

      <label class="mt-4 flex cursor-pointer items-center gap-2 text-sm text-[var(--muted-foreground)]">
        <input v-model="remember" type="checkbox" class="size-4 accent-[var(--primary)]" />
        Tetap masuk 14 hari
      </label>

      <p v-if="error" class="mt-3 rounded-xl border border-[var(--destructive)]/35 bg-[var(--destructive)]/10 px-3 py-2 text-xs text-[var(--destructive)]">
        {{ error }}
      </p>

      <button type="submit" class="sg-primary mt-5 inline-flex h-11 w-full items-center justify-center gap-2 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none disabled:opacity-60" :disabled="busy">
        <IconCloudFilled v-if="!busy" :size="18" :stroke="0" />
        {{ busy ? 'Memeriksa...' : needsCode ? 'Verifikasi' : 'Masuk' }}
      </button>
    </form>
  </div>
</template>
