<script setup>
import { computed, onMounted, ref } from 'vue';
import { IconShieldCheck, IconShieldOff, IconDeviceMobile, IconCopy, IconCircleCheck } from '@tabler/icons-vue';
import QRCode from 'qrcode';

const props = defineProps({
  user: { type: Object, default: null },
});
const emit = defineEmits(['changed']);

const enabled = ref(false);
const loading = ref(true);
const error = ref('');
const notice = ref('');

const setupUri = ref('');
const setupSecret = ref('');
const qrDataUrl = ref('');
const code = ref('');
const busy = ref(false);

const disableCode = ref('');
const disableBusy = ref(false);
const showDisable = ref(false);

const copied = ref(false);

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
    const me = await api('/api/me');
    enabled.value = !!me.totpEnabled;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function startSetup() {
  error.value = '';
  notice.value = '';
  busy.value = true;
  try {
    const d = await api('/api/2fa/start', { method: 'POST' });
    setupSecret.value = d.secret;
    setupUri.value = d.uri;
    // QR digambar di browser; secret tidak dikirim ke mana pun.
    qrDataUrl.value = await QRCode.toDataURL(d.uri, { width: 220, margin: 1 });
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function confirmEnable() {
  if (code.value.replace(/\D/g, '').length !== 6) {
    error.value = 'Masukkan 6 digit kode dari aplikasi autentikator.';
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    await api('/api/2fa/enable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.value.trim() }),
    });
    notice.value = '2FA aktif. Mulai sekarang login butuh kode dari aplikasi autentikator.';
    setupUri.value = '';
    setupSecret.value = '';
    qrDataUrl.value = '';
    code.value = '';
    await load();
    emit('changed');
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function confirmDisable() {
  disableBusy.value = true;
  error.value = '';
  try {
    await api('/api/2fa/disable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: disableCode.value.trim() }),
    });
    notice.value = '2FA dimatikan. Login kembali hanya dengan password.';
    disableCode.value = '';
    showDisable.value = false;
    await load();
    emit('changed');
  } catch (e) {
    error.value = e.message;
  } finally {
    disableBusy.value = false;
  }
}

async function copySecret() {
  try {
    await navigator.clipboard.writeText(setupSecret.value);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  } catch {
    error.value = 'Gagal menyalin. Salin manual dari teks di atas.';
  }
}

function cancelSetup() {
  setupUri.value = '';
  setupSecret.value = '';
  qrDataUrl.value = '';
  code.value = '';
  error.value = '';
}

const setupActive = computed(() => !!setupUri.value);

onMounted(load);
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="rounded-[24px] bg-white p-5 dark:bg-slate-800 sm:p-7">
      <p class="mb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[#1a73e8] dark:text-sky-400">Keamanan</p>
      <h1 class="text-[26px] font-medium text-[#202124] dark:text-slate-100">Autentikasi dua faktor</h1>
      <p class="mt-2 max-w-[720px] text-sm text-[#5f6368] dark:text-slate-400">
        Dengan 2FA aktif, login butuh password dan kode 6 digit dari aplikasi autentikator.
        Kalau password bocor, akun tetap aman.
      </p>
    </div>

    <div v-if="loading" class="rounded-2xl border border-[#e0e3e7] bg-white p-6 text-sm text-[#5f6368] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
      Memeriksa status...
    </div>

    <div v-else class="rounded-[24px] border border-[#e0e3e7] bg-white p-5 dark:border-slate-700 dark:bg-slate-800 sm:p-7">
      <div class="flex flex-wrap items-center gap-3">
        <span
          class="grid size-11 shrink-0 place-items-center rounded-full"
          :class="enabled
            ? 'bg-[#e6f4ea] text-[#137333] dark:bg-emerald-400/10 dark:text-emerald-300'
            : 'bg-[#f1f3f4] text-[#5f6368] dark:bg-slate-700 dark:text-slate-300'"
        >
          <component :is="enabled ? IconShieldCheck : IconShieldOff" :size="22" :stroke="1.8" />
        </span>
        <div class="min-w-0">
          <p class="text-sm font-semibold text-[#202124] dark:text-slate-100">
            {{ enabled ? '2FA aktif' : '2FA belum aktif' }}
          </p>
          <p class="text-xs text-[#5f6368] dark:text-slate-400">
            {{ enabled ? 'Login butuh kode autentikator.' : 'Disarankan aktif, terutama karena aplikasi bisa diakses dari internet.' }}
          </p>
        </div>
        <span
          class="ml-auto rounded-full border px-3 py-1 text-[11px] font-medium"
          :class="enabled
            ? 'border-[#34a853]/35 bg-[#e6f4ea] text-[#137333] dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300'
            : 'border-[#dadce0] bg-[#f1f3f4] text-[#5f6368] dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300'"
        >{{ enabled ? 'Aman' : 'Perlu diaktifkan' }}</span>
      </div>

      <p v-if="notice" class="mt-4 rounded-xl border border-[#34a853]/35 bg-[#e6f4ea] px-3 py-2 text-xs text-[#137333] dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300">{{ notice }}</p>
      <p v-if="error" class="mt-4 rounded-xl border border-[#ea4335]/35 bg-[#ea4335]/10 px-3 py-2 text-xs text-[#c5221f] dark:text-red-300">{{ error }}</p>

      <!-- Belum aktif, belum mulai setup -->
      <div v-if="!enabled && !setupActive" class="mt-5">
        <button type="button" class="inline-flex h-11 items-center gap-2 rounded-full bg-[#1a73e8] px-5 text-sm font-medium text-white transition hover:bg-[#1765cc] disabled:opacity-60" :disabled="busy" @click="startSetup">
          <IconDeviceMobile :size="18" :stroke="2" />
          {{ busy ? 'Menyiapkan...' : 'Aktifkan 2FA' }}
        </button>
      </div>

      <!-- Proses setup: QR + secret + konfirmasi -->
      <div v-if="setupActive" class="mt-5 grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
        <div class="flex flex-col items-center gap-2">
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR 2FA" class="rounded-xl border border-[#e0e3e7] bg-white p-2 dark:border-slate-600" />
          <p class="text-center text-[11px] text-[#5f6368] dark:text-slate-400">Pindai dengan aplikasi autentikator</p>
        </div>

        <div class="flex flex-col gap-4">
          <div>
            <p class="mb-1.5 text-xs font-semibold text-[#5f6368] dark:text-slate-400">Atau masukkan kode ini manual</p>
            <div class="flex items-center gap-2">
              <code class="min-w-0 flex-1 overflow-x-auto rounded-xl border border-[#dadce0] bg-[#f8fafd] px-3 py-2 font-mono text-xs text-[#202124] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">{{ setupSecret }}</code>
              <button type="button" class="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-[#dadce0] bg-white px-3 text-xs font-medium text-[#3c4043] transition hover:bg-[#f8fafd] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" @click="copySecret">
                <component :is="copied ? IconCircleCheck : IconCopy" :size="15" :stroke="2" />
                {{ copied ? 'Tersalin' : 'Salin' }}
              </button>
            </div>
          </div>

          <div>
            <label class="mb-1.5 block text-xs font-semibold text-[#5f6368] dark:text-slate-400" for="tfa-code">Kode dari aplikasi (6 digit)</label>
            <input
              id="tfa-code"
              v-model="code"
              type="text"
              inputmode="numeric"
              maxlength="6"
              class="h-11 w-40 rounded-xl border border-[#dadce0] bg-white px-3.5 text-center font-mono text-lg tracking-[0.3em] text-[#202124] outline-none transition focus:border-[#1a73e8] focus:shadow-[0_0_0_3px_rgba(26,115,232,0.15)] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              placeholder="123456"
              @keydown.enter="confirmEnable"
            />
          </div>

          <div class="flex gap-2">
            <button type="button" class="inline-flex h-10 items-center rounded-full bg-[#1a73e8] px-5 text-sm font-medium text-white transition hover:bg-[#1765cc] disabled:opacity-60" :disabled="busy" @click="confirmEnable">
              {{ busy ? 'Memeriksa...' : 'Aktifkan' }}
            </button>
            <button type="button" class="inline-flex h-10 items-center rounded-full border border-[#dadce0] bg-white px-5 text-sm font-medium text-[#3c4043] transition hover:bg-[#f8fafd] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" @click="cancelSetup">Batal</button>
          </div>
        </div>
      </div>

      <!-- Sudah aktif: tombol matikan -->
      <div v-if="enabled" class="mt-5">
        <button v-if="!showDisable" type="button" class="inline-flex h-10 items-center gap-2 rounded-full border border-[#ea4335]/50 bg-[#ea4335]/10 px-5 text-sm font-medium text-[#c5221f] transition hover:bg-[#ea4335]/20 dark:border-red-400/40 dark:text-red-300" @click="showDisable = true">
          <IconShieldOff :size="17" :stroke="1.8" />
          Matikan 2FA
        </button>
        <div v-else class="flex flex-wrap items-end gap-3">
          <div>
            <label class="mb-1.5 block text-xs font-semibold text-[#5f6368] dark:text-slate-400" for="off-code">Kode autentikator (untuk konfirmasi)</label>
            <input
              id="off-code"
              v-model="disableCode"
              type="text"
              inputmode="numeric"
              maxlength="6"
              class="h-11 w-40 rounded-xl border border-[#dadce0] bg-white px-3.5 text-center font-mono text-lg tracking-[0.3em] text-[#202124] outline-none transition focus:border-[#1a73e8] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              placeholder="123456"
            />
          </div>
          <button type="button" class="inline-flex h-11 items-center rounded-full border border-[#ea4335]/50 bg-[#ea4335]/10 px-5 text-sm font-medium text-[#c5221f] transition hover:bg-[#ea4335]/20 disabled:opacity-60 dark:border-red-400/40 dark:text-red-300" :disabled="disableBusy" @click="confirmDisable">
            {{ disableBusy ? 'Mematikan...' : 'Konfirmasi matikan' }}
          </button>
          <button type="button" class="inline-flex h-11 items-center rounded-full border border-[#dadce0] bg-white px-5 text-sm font-medium text-[#3c4043] transition hover:bg-[#f8fafd] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" @click="showDisable = false; disableCode = ''">Batal</button>
        </div>
      </div>
    </div>

    <div class="rounded-2xl border border-[#e0e3e7] bg-white p-5 text-sm text-[#5f6368] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
      <p class="mb-2 font-medium text-[#202124] dark:text-slate-100">Catatan</p>
      <ul class="list-disc space-y-1 pl-5">
        <li>Aplikasi yang disarankan: Google Authenticator, Aegis, Bitwarden, 1Password.</li>
        <li>Sesi biasa berlaku 12 jam. Pilih "Tetap masuk" saat login untuk 14 hari.</li>
        <li>Simpan kode cadangan aplikasi autentikator Anda; kalau ponsel hilang, hubungi admin untuk reset.</li>
      </ul>
    </div>
  </div>
</template>