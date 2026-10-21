<script setup>
import { computed, onMounted, ref } from 'vue';
import { IconUserPlus, IconTrash, IconKey, IconShieldCheck, IconEye, IconLock, IconX } from '@tabler/icons-vue';
import { apiFetch } from '../composables/useApi.js';
import LoadingState from './LoadingState.vue';

const props = defineProps({
  currentUser: { type: Object, default: null },
});
const emit = defineEmits(['changed']);

const users = ref([]);
const loading = ref(true);
const error = ref('');
const notice = ref('');

const form = ref({ username: '', password: '', role: 'viewer' });
const formError = ref('');
const creating = ref(false);

const pwTarget = ref(null);
const pwValue = ref('');
const pwCurrent = ref(''); // hanya untuk mengganti password sendiri
const pwError = ref('');
const pwBusy = ref(false);

async function api(url, opts) {
  const r = await apiFetch(url, opts);
  return r.json().catch(() => ({}));
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const d = await api('/api/users');
    users.value = d.users || [];
  } catch (e) {
    error.value = e.message;
    if (e.message.includes('Sesi berakhir')) users.value = [];
  } finally {
    loading.value = false;
  }
}

async function create() {
  formError.value = '';
  notice.value = '';
  if (!form.value.username.trim() || !form.value.password) {
    formError.value = 'Username dan password wajib diisi.';
    return;
  }
  creating.value = true;
  try {
    await api('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: form.value.username.trim(),
        password: form.value.password,
        role: form.value.role,
      }),
    });
    notice.value = `Pengguna "${form.value.username.trim()}" ditambahkan.`;
    form.value = { username: '', password: '', role: 'viewer' };
    await load();
    emit('changed');
  } catch (e) {
    formError.value = e.message;
  } finally {
    creating.value = false;
  }
}

async function remove(u) {
  if (!window.confirm(`Hapus pengguna "${u.username}"? Aksesnya dicabut segera.`)) return;
  notice.value = '';
  try {
    await api(`/api/users/${encodeURIComponent(u.username)}`, { method: 'DELETE' });
    notice.value = `Pengguna "${u.username}" dihapus.`;
    await load();
    emit('changed');
  } catch (e) {
    error.value = e.message;
  }
}

function openPw(u) {
  pwTarget.value = u;
  pwValue.value = '';
  pwCurrent.value = '';
  pwError.value = '';
}

async function savePw() {
  if (!pwTarget.value) return;
  if (pwValue.value.length < 8) {
    pwError.value = 'Password minimal 8 karakter.';
    return;
  }
  const self = isMe(pwTarget.value);
  if (self && !pwCurrent.value) {
    pwError.value = 'Password lama wajib diisi untuk akun sendiri.';
    return;
  }
  pwBusy.value = true;
  pwError.value = '';
  try {
    await api(`/api/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        self
          ? { username: pwTarget.value.username, current: pwCurrent.value, next: pwValue.value }
          : { username: pwTarget.value.username, next: pwValue.value },
      ),
    });
    notice.value = `Password "${pwTarget.value.username}" diperbarui.`;
    if (self) notice.value += ' Semua sesi lama ikut berakhir, masuk kembali dengan password baru.';
    pwValue.value = '';
    pwCurrent.value = '';
    pwTarget.value = null;
  } catch (e) {
    pwError.value = e.message;
  } finally {
    pwBusy.value = false;
  }
}

function isMe(u) {
  return props.currentUser && u.username === props.currentUser.username;
}
function locked(u) {
  // Terkunci bila: ini akun Anda sendiri, ATAU admin satu-satunya.
  return isMe(u) || (u.role === 'admin' && adminCount.value <= 1);
}

const adminCount = computed(() => users.value.filter((u) => u.role === 'admin').length);

onMounted(load);
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="sg-card p-5 sm:p-7">
      <p class="mb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[var(--primary)]">Pengguna</p>
      <h1 class="text-[26px] font-medium text-[var(--foreground)]">Kelola pengguna</h1>
      <p class="mt-2 max-w-[720px] text-sm text-[var(--muted-foreground)]">
        Admin punya akses penuh. Viewer hanya bisa melihat, menelusuri, dan mengunduh berkas.
        Viewer tidak bisa menghapus, mengubah nama, membuat folder, atau menjalankan job backup.
      </p>

      <form class="mt-5 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto_auto]" @submit.prevent="create">
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-semibold text-[var(--muted-foreground)]">Username</span>
          <input v-model="form.username" type="text" class="sg-field h-11 px-3.5 text-sm text-[var(--foreground)] outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]" placeholder="mis. keluarga" />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-semibold text-[var(--muted-foreground)]">Password (min 8)</span>
          <input v-model="form.password" type="password" autocomplete="new-password" class="sg-field h-11 px-3.5 text-sm text-[var(--foreground)] outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]" placeholder="Password" />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-semibold text-[var(--muted-foreground)]">Role</span>
          <select v-model="form.role" class="sg-field h-11 px-3.5 text-sm text-[var(--foreground)] outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]">
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button type="submit" class="sg-primary inline-flex h-11 items-center justify-center gap-2 self-end px-5 text-sm font-medium text-white transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none disabled:opacity-60" :disabled="creating">
          <IconUserPlus :size="18" :stroke="2" />
          {{ creating ? 'Menyimpan...' : 'Tambah' }}
        </button>
      </form>
      <p v-if="formError" class="mt-3 rounded-xl border border-[var(--destructive)] bg-[var(--destructive)]/10 px-3 py-2 text-xs text-[var(--destructive)]">{{ formError }}</p>
      <p v-if="notice" class="mt-3 rounded-xl border border-[var(--glass-edge)] bg-[var(--success)]/10 px-3 py-2 text-xs text-[var(--success)]">{{ notice }}</p>
    </div>

    <LoadingState v-if="loading" message="Memuat daftar pengguna..." />

    <div v-else-if="error" class="sg-card p-6">
      <p class="font-medium text-[var(--destructive)]">Daftar pengguna tidak bisa dibaca</p>
      <p class="mt-1 text-sm text-[var(--muted-foreground)]">{{ error }}</p>
      <button type="button" class="sg-control mt-3 inline-flex h-10 items-center px-5 text-sm font-medium text-[var(--foreground)] transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none" @click="load">Coba lagi</button>
    </div>

    <div v-else class="flex flex-col gap-3">
      <h2 class="px-1 text-xs font-bold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
        {{ users.length }} pengguna
      </h2>
      <article
        v-for="u in users"
        :key="u.username"
        class="sg-card grid grid-cols-1 items-center gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto]"
      >
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2.5">
            <span class="grid size-9 shrink-0 place-items-center rounded-full" :class="u.role === 'admin' ? 'bg-[var(--muted)] text-[var(--primary)]' : 'bg-[var(--muted)] text-[var(--muted-foreground)]'">
              <component :is="u.role === 'admin' ? IconShieldCheck : IconEye" :size="18" :stroke="1.8" />
            </span>
            <span class="truncate text-sm font-semibold text-[var(--foreground)]">{{ u.username }}</span>
            <span
              class="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
              :class="u.role === 'admin'
                ? 'sg-state text-[var(--foreground)]'
                : 'sg-control text-[var(--muted-foreground)]'"
            >{{ u.role === 'admin' ? 'Admin' : 'Viewer' }}</span>
            <span v-if="isMe(u)" class="rounded-full border border-[var(--glass-edge)] bg-[var(--success)]/10 px-2.5 py-0.5 text-[11px] font-medium text-[var(--success)]">Anda</span>
            <span v-if="locked(u)" class="inline-flex items-center gap-1 rounded-full bg-[var(--muted)] px-2 py-0.5 text-[11px] text-[var(--muted-foreground)]">
              <IconLock :size="12" :stroke="2" />
              terkunci
            </span>
          </div>
          <p class="mt-2 text-xs text-[var(--muted-foreground)]">
            Dibuat: {{ u.createdAt ? new Date(u.createdAt).toLocaleString('id-ID') : 'tidak diketahui' }}
          </p>
        </div>

        <div class="flex shrink-0 gap-2">
          <button type="button" class="sg-control inline-flex h-10 items-center gap-2 px-4 text-sm font-medium text-[var(--foreground)] transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none" @click="openPw(u)">
            <IconKey :size="17" :stroke="1.8" />
            Ganti password
          </button>
          <button
            type="button"
            class="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none"
            :class="locked(u)
              ? 'cursor-not-allowed sg-control text-[var(--muted-foreground)]'
              : 'sg-control text-[var(--destructive)]'"
            :disabled="locked(u)"
            @click="remove(u)"
          >
            <IconTrash :size="17" :stroke="1.8" />
            Hapus
          </button>
        </div>
      </article>
    </div>

    <!-- Modal ganti password -->
    <div v-if="pwTarget" class="fixed inset-0 z-50 grid place-items-center bg-[var(--foreground)]/40 p-4" @click.self="pwTarget = null">
      <div class="sg-popover w-full max-w-[420px] overflow-hidden">
        <header class="flex items-center gap-3 border-b border-[var(--border)] px-6 py-4">
          <span class="grid size-10 place-items-center rounded-full bg-[var(--muted)] text-[var(--primary)]">
            <IconKey :size="22" :stroke="2" />
          </span>
          <div class="min-w-0">
            <h2 class="text-lg font-semibold text-[var(--foreground)]">Ganti password</h2>
            <p class="truncate text-xs text-[var(--muted-foreground)]">{{ pwTarget.username }}</p>
          </div>
          <button type="button" class="ml-auto grid size-8 place-items-center rounded-full text-[var(--muted-foreground)] transition hover:bg-[var(--hover)]" aria-label="Tutup" @click="pwTarget = null">
            <IconX :size="18" :stroke="2" />
          </button>
        </header>
        <div class="flex flex-col gap-4 px-6 py-5">
          <div v-if="pwTarget && isMe(pwTarget)">
            <label class="mb-1.5 block text-xs font-semibold text-[var(--muted-foreground)]" for="cp">Password lama</label>
            <input id="cp" v-model="pwCurrent" type="password" autocomplete="current-password" class="sg-field h-11 w-full px-3.5 text-sm text-[var(--foreground)] outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]" placeholder="Password lama" />
            <p class="mt-1.5 text-[11px] text-[var(--muted-foreground)]">
              Wajib untuk akun sendiri. Setelah diganti, semua sesi lama berakhir.
            </p>
          </div>
          <div>
            <label class="mb-1.5 block text-xs font-semibold text-[var(--muted-foreground)]" for="np">Password baru (min 8)</label>
            <input id="np" v-model="pwValue" type="password" autocomplete="new-password" class="sg-field h-11 w-full px-3.5 text-sm text-[var(--foreground)] outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]" placeholder="Password baru" :autofocus="!(pwTarget && isMe(pwTarget))" @keydown.enter="savePw" />
          </div>
          <p v-if="pwError" class="rounded-xl border border-[var(--destructive)] bg-[var(--destructive)]/10 px-3 py-2 text-xs text-[var(--destructive)]">{{ pwError }}</p>
        </div>
        <footer class="flex justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
          <button type="button" class="sg-control inline-flex h-10 items-center px-5 text-sm font-medium text-[var(--foreground)] transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none" @click="pwTarget = null">Batal</button>
          <button type="button" class="sg-primary inline-flex h-10 items-center px-5 text-sm font-medium text-white transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none disabled:opacity-60" :disabled="pwBusy" @click="savePw">
            {{ pwBusy ? 'Menyimpan...' : 'Simpan' }}
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>