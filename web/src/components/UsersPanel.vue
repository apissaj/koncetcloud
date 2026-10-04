<script setup>
import { computed, onMounted, ref } from 'vue';
import { IconUserPlus, IconTrash, IconKey, IconShieldCheck, IconEye, IconLock, IconX } from '@tabler/icons-vue';
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
  const r = await fetch(url, opts);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const d = await api('/api/users');
    users.value = d.users || [];
  } catch (e) {
    error.value = e.message;
    users.value = [];
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
    <div class="rounded-[24px] bg-white p-5 dark:bg-slate-800 sm:p-7">
      <p class="mb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[#1a73e8] dark:text-sky-400">Pengguna</p>
      <h1 class="text-[26px] font-medium text-[#202124] dark:text-slate-100">Kelola pengguna</h1>
      <p class="mt-2 max-w-[720px] text-sm text-[#5f6368] dark:text-slate-400">
        Admin punya akses penuh. Viewer hanya bisa melihat, menelusuri, dan mengunduh berkas.
        Viewer tidak bisa menghapus, mengubah nama, membuat folder, atau menjalankan job backup.
      </p>

      <form class="mt-5 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto_auto]" @submit.prevent="create">
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-semibold text-[#5f6368] dark:text-slate-400">Username</span>
          <input v-model="form.username" type="text" class="h-11 rounded-xl border border-[#dadce0] bg-white px-3.5 text-sm text-[#202124] outline-none transition focus:border-[#1a73e8] focus:shadow-[0_0_0_3px_rgba(26,115,232,0.15)] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" placeholder="mis. keluarga" />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-semibold text-[#5f6368] dark:text-slate-400">Password (min 8)</span>
          <input v-model="form.password" type="password" autocomplete="new-password" class="h-11 rounded-xl border border-[#dadce0] bg-white px-3.5 text-sm text-[#202124] outline-none transition focus:border-[#1a73e8] focus:shadow-[0_0_0_3px_rgba(26,115,232,0.15)] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" placeholder="Password" />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-semibold text-[#5f6368] dark:text-slate-400">Role</span>
          <select v-model="form.role" class="h-11 rounded-xl border border-[#dadce0] bg-white px-3.5 text-sm text-[#202124] outline-none transition focus:border-[#1a73e8] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button type="submit" class="inline-flex h-11 items-center justify-center gap-2 self-end rounded-full bg-[#1a73e8] px-5 text-sm font-medium text-white transition hover:bg-[#1765cc] disabled:opacity-60" :disabled="creating">
          <IconUserPlus :size="18" :stroke="2" />
          {{ creating ? 'Menyimpan...' : 'Tambah' }}
        </button>
      </form>
      <p v-if="formError" class="mt-3 rounded-xl border border-[#ea4335]/35 bg-[#ea4335]/10 px-3 py-2 text-xs text-[#c5221f] dark:text-red-300">{{ formError }}</p>
      <p v-if="notice" class="mt-3 rounded-xl border border-[#34a853]/35 bg-[#e6f4ea] px-3 py-2 text-xs text-[#137333] dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300">{{ notice }}</p>
    </div>

    <LoadingState v-if="loading" message="Memuat daftar pengguna..." />

    <div v-else-if="error" class="rounded-[24px] border border-[#e0e3e7] bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
      <p class="font-medium text-[#c5221f]">Daftar pengguna tidak bisa dibaca</p>
      <p class="mt-1 text-sm text-[#5f6368] dark:text-slate-400">{{ error }}</p>
      <button type="button" class="mt-3 inline-flex h-10 items-center rounded-full border border-[#dadce0] bg-white px-5 text-sm font-medium text-[#3c4043] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" @click="load">Coba lagi</button>
    </div>

    <div v-else class="flex flex-col gap-3">
      <h2 class="px-1 text-xs font-bold uppercase tracking-[0.08em] text-[#5f6368] dark:text-slate-400">
        {{ users.length }} pengguna
      </h2>
      <article
        v-for="u in users"
        :key="u.username"
        class="grid grid-cols-1 items-center gap-4 rounded-2xl border border-[#e0e3e7] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-800 sm:grid-cols-[minmax(0,1fr)_auto]"
      >
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2.5">
            <span class="grid size-9 shrink-0 place-items-center rounded-full" :class="u.role === 'admin' ? 'bg-[#e8f0fe] text-[#1a73e8] dark:bg-sky-500/15 dark:text-sky-300' : 'bg-[#f1f3f4] text-[#5f6368] dark:bg-slate-700 dark:text-slate-300'">
              <component :is="u.role === 'admin' ? IconShieldCheck : IconEye" :size="18" :stroke="1.8" />
            </span>
            <span class="truncate text-sm font-semibold text-[#202124] dark:text-slate-100">{{ u.username }}</span>
            <span
              class="rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
              :class="u.role === 'admin'
                ? 'border-[#1a73e8]/35 bg-[#e8f0fe] text-[#1967d2] dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-300'
                : 'border-[#dadce0] bg-[#f1f3f4] text-[#5f6368] dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300'"
            >{{ u.role === 'admin' ? 'Admin' : 'Viewer' }}</span>
            <span v-if="isMe(u)" class="rounded-full border border-[#34a853]/35 bg-[#e6f4ea] px-2.5 py-0.5 text-[11px] font-medium text-[#137333] dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300">Anda</span>
            <span v-if="locked(u)" class="inline-flex items-center gap-1 rounded-full border border-[#dadce0] bg-[#f1f3f4] px-2 py-0.5 text-[11px] text-[#5f6368] dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">
              <IconLock :size="12" :stroke="2" />
              terkunci
            </span>
          </div>
          <p class="mt-2 text-xs text-[#5f6368] dark:text-slate-400">
            Dibuat: {{ u.createdAt ? new Date(u.createdAt).toLocaleString('id-ID') : 'tidak diketahui' }}
          </p>
        </div>

        <div class="flex shrink-0 gap-2">
          <button type="button" class="inline-flex h-10 items-center gap-2 rounded-full border border-[#dadce0] bg-white px-4 text-sm font-medium text-[#3c4043] transition hover:bg-[#f8fafd] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" @click="openPw(u)">
            <IconKey :size="17" :stroke="1.8" />
            Ganti password
          </button>
          <button
            type="button"
            class="inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition"
            :class="locked(u)
              ? 'cursor-not-allowed border-[#dadce0] text-[#9aa0a6] dark:border-slate-700 dark:text-slate-500'
              : 'border-[#ea4335]/50 bg-[#ea4335]/10 text-[#c5221f] hover:bg-[#ea4335]/20 dark:border-red-400/40 dark:text-red-300'"
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
    <div v-if="pwTarget" class="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 p-4" @click.self="pwTarget = null">
      <div class="w-full max-w-[420px] overflow-hidden rounded-2xl bg-white shadow-[0_20px_40px_rgba(15,23,42,0.18)] dark:bg-slate-800">
        <header class="flex items-center gap-3 border-b border-[#eceff1] px-6 py-4 dark:border-slate-700">
          <span class="grid size-10 place-items-center rounded-full bg-[#e8f0fe] text-[#1a73e8] dark:bg-sky-500/15 dark:text-sky-300">
            <IconKey :size="22" :stroke="2" />
          </span>
          <div class="min-w-0">
            <h2 class="text-lg font-semibold text-[#202124] dark:text-slate-100">Ganti password</h2>
            <p class="truncate text-xs text-[#5f6368] dark:text-slate-400">{{ pwTarget.username }}</p>
          </div>
          <button type="button" class="ml-auto grid size-8 place-items-center rounded-full text-[#5f6368] transition hover:bg-black/5 dark:text-slate-400 dark:hover:bg-white/10" aria-label="Tutup" @click="pwTarget = null">
            <IconX :size="18" :stroke="2" />
          </button>
        </header>
        <div class="flex flex-col gap-4 px-6 py-5">
          <div v-if="pwTarget && isMe(pwTarget)">
            <label class="mb-1.5 block text-xs font-semibold text-[#5f6368] dark:text-slate-400" for="cp">Password lama</label>
            <input id="cp" v-model="pwCurrent" type="password" autocomplete="current-password" class="h-11 w-full rounded-xl border border-[#dadce0] bg-white px-3.5 text-sm text-[#202124] outline-none transition focus:border-[#1a73e8] focus:shadow-[0_0_0_3px_rgba(26,115,232,0.15)] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" placeholder="Password lama" />
            <p class="mt-1.5 text-[11px] text-[#5f6368] dark:text-slate-400">
              Wajib untuk akun sendiri. Setelah diganti, semua sesi lama berakhir.
            </p>
          </div>
          <div>
            <label class="mb-1.5 block text-xs font-semibold text-[#5f6368] dark:text-slate-400" for="np">Password baru (min 8)</label>
            <input id="np" v-model="pwValue" type="password" autocomplete="new-password" class="h-11 w-full rounded-xl border border-[#dadce0] bg-white px-3.5 text-sm text-[#202124] outline-none transition focus:border-[#1a73e8] focus:shadow-[0_0_0_3px_rgba(26,115,232,0.15)] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" placeholder="Password baru" :autofocus="!(pwTarget && isMe(pwTarget))" @keydown.enter="savePw" />
          </div>
          <p v-if="pwError" class="rounded-xl border border-[#ea4335]/35 bg-[#ea4335]/10 px-3 py-2 text-xs text-[#c5221f] dark:text-red-300">{{ pwError }}</p>
        </div>
        <footer class="flex justify-end gap-2 border-t border-[#eceff1] px-6 py-4 dark:border-slate-700">
          <button type="button" class="inline-flex h-10 items-center rounded-full border border-[#dadce0] bg-white px-5 text-sm font-medium text-[#3c4043] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" @click="pwTarget = null">Batal</button>
          <button type="button" class="inline-flex h-10 items-center rounded-full bg-[#1a73e8] px-5 text-sm font-medium text-white transition hover:bg-[#1765cc] disabled:opacity-60" :disabled="pwBusy" @click="savePw">
            {{ pwBusy ? 'Menyimpan...' : 'Simpan' }}
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>