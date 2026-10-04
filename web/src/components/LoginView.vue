<script setup>
import { ref } from 'vue';
import { IconCloudFilled, IconLock, IconUser } from '@tabler/icons-vue';
import logoUrl from '../assets/logo.svg';

const emit = defineEmits(['authed']);

const username = ref('');
const password = ref('');
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
      body: JSON.stringify({ username: username.value.trim(), password: password.value }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    username.value = '';
    password.value = '';
    emit('authed', d.user);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="grid min-h-screen place-items-center bg-[#f8fafd] p-4 dark:bg-slate-900">
    <form class="w-full max-w-[420px] rounded-[24px] border border-[#e0e3e7] bg-white p-7 shadow-[0_16px_40px_rgba(32,33,36,0.08)] dark:border-slate-700 dark:bg-slate-800" @submit.prevent="submit">
      <div class="mb-6 flex flex-col items-center gap-3 text-center">
        <span class="grid size-14 place-items-center overflow-hidden rounded-2xl bg-[#f8fafd] dark:bg-slate-900">
          <img :src="logoUrl" alt="KoncetCloud" class="size-11 object-contain" />
        </span>
        <div>
          <h1 class="text-xl font-semibold text-[#202124] dark:text-slate-100">KoncetCloud</h1>
          <p class="mt-1 text-sm text-[#5f6368] dark:text-slate-400">
            Masuk untuk mengelola backup dan berkas Anda.
          </p>
        </div>
      </div>

      <label class="mb-1.5 block text-xs font-semibold text-[#5f6368] dark:text-slate-400" for="kc-user">Username</label>
      <div class="relative mb-4">
        <IconUser :size="18" :stroke="1.8" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5f6368] dark:text-slate-400" />
        <input
          id="kc-user"
          v-model="username"
          type="text"
          autocomplete="username"
          class="h-11 w-full rounded-xl border border-[#dadce0] bg-white pl-10 pr-3.5 text-sm text-[#202124] outline-none transition focus:border-[#1a73e8] focus:shadow-[0_0_0_3px_rgba(26,115,232,0.15)] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          placeholder="admin"
          autofocus
        />
      </div>

      <label class="mb-1.5 block text-xs font-semibold text-[#5f6368] dark:text-slate-400" for="kc-pass">Password</label>
      <div class="relative">
        <IconLock :size="18" :stroke="1.8" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5f6368] dark:text-slate-400" />
        <input
          id="kc-pass"
          v-model="password"
          type="password"
          autocomplete="current-password"
          class="h-11 w-full rounded-xl border border-[#dadce0] bg-white pl-10 pr-3.5 text-sm text-[#202124] outline-none transition focus:border-[#1a73e8] focus:shadow-[0_0_0_3px_rgba(26,115,232,0.15)] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          placeholder="Password"
        />
      </div>

      <p v-if="error" class="mt-3 rounded-xl border border-[#ea4335]/35 bg-[#ea4335]/10 px-3 py-2 text-xs text-[#c5221f] dark:text-red-300">
        {{ error }}
      </p>

      <button type="submit" class="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#1a73e8] text-sm font-medium text-white transition hover:bg-[#1765cc] disabled:opacity-60" :disabled="busy">
        <IconCloudFilled v-if="!busy" :size="18" :stroke="0" />
        {{ busy ? 'Memeriksa...' : 'Masuk' }}
      </button>
    </form>
  </div>
</template>
