<script setup>
import { computed, onMounted, ref } from 'vue';
import { IconShieldCheck, IconShieldOff, IconDeviceMobile, IconCopy, IconCircleCheck } from '@tabler/icons-vue';
import QRCode from 'qrcode';
import { apiFetch } from '../composables/useApi.js';

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
  const r = await apiFetch(url, opts);
  return r.json().catch(() => ({}));
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
    <div class="sg-card p-5 sm:p-7">
      <p class="mb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[var(--primary)]">Keamanan</p>
      <h1 class="text-[26px] font-medium text-[var(--foreground)]">Autentikasi dua faktor</h1>
      <p class="mt-2 max-w-[720px] text-sm text-[var(--muted-foreground)]">
        Dengan 2FA aktif, login butuh password dan kode 6 digit dari aplikasi autentikator.
        Kalau password bocor, akun tetap aman.
      </p>
    </div>

    <div v-if="loading" class="sg-card p-6 text-sm text-[var(--muted-foreground)]">
      Memeriksa status...
    </div>

    <div v-else class="sg-card p-5 sm:p-7">
      <div class="flex flex-wrap items-center gap-3">
        <span
          class="grid size-11 shrink-0 place-items-center rounded-full"
          :class="enabled
            ? 'bg-[var(--success)]/10 text-[var(--success)]'
            : 'bg-[var(--muted)] text-[var(--muted-foreground)]'"
        >
          <component :is="enabled ? IconShieldCheck : IconShieldOff" :size="22" :stroke="1.8" />
        </span>
        <div class="min-w-0">
          <p class="text-sm font-semibold text-[var(--foreground)]">
            {{ enabled ? '2FA aktif' : '2FA belum aktif' }}
          </p>
          <p class="text-xs text-[var(--muted-foreground)]">
            {{ enabled ? 'Login butuh kode autentikator.' : 'Disarankan aktif, terutama karena aplikasi bisa diakses dari internet.' }}
          </p>
        </div>
        <span
          class="ml-auto rounded-full px-3 py-1 text-[11px] font-medium"
          :class="enabled
            ? 'sg-control text-[var(--success)]'
            : 'sg-control text-[var(--muted-foreground)]'"
        >{{ enabled ? 'Aman' : 'Perlu diaktifkan' }}</span>
      </div>

      <p v-if="notice" class="mt-4 rounded-xl border border-[var(--glass-edge)] bg-[var(--success)]/10 px-3 py-2 text-xs text-[var(--success)]">{{ notice }}</p>
      <p v-if="error" class="mt-4 rounded-xl border border-[var(--destructive)] bg-[var(--destructive)]/10 px-3 py-2 text-xs text-[var(--destructive)]">{{ error }}</p>

      <!-- Belum aktif, belum mulai setup -->
      <div v-if="!enabled && !setupActive" class="mt-5">
        <button type="button" class="sg-primary inline-flex h-11 items-center gap-2 px-5 text-sm font-medium text-white transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none disabled:opacity-60" :disabled="busy" @click="startSetup">
          <IconDeviceMobile :size="18" :stroke="2" />
          {{ busy ? 'Menyiapkan...' : 'Aktifkan 2FA' }}
        </button>
      </div>

      <!-- Proses setup: QR + secret + konfirmasi -->
      <div v-if="setupActive" class="mt-5 grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
        <div class="flex flex-col items-center gap-2">
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR 2FA" class="rounded-xl border border-[var(--glass-edge)] bg-white p-2" />
          <p class="text-center text-[11px] text-[var(--muted-foreground)]">Pindai dengan aplikasi autentikator</p>
        </div>

        <div class="flex flex-col gap-4">
          <div>
            <p class="mb-1.5 text-xs font-semibold text-[var(--muted-foreground)]">Atau masukkan kode ini manual</p>
            <div class="flex items-center gap-2">
              <code class="sg-control min-w-0 flex-1 overflow-x-auto px-3 py-2 font-mono text-xs text-[var(--foreground)]">{{ setupSecret }}</code>
              <button type="button" class="sg-control inline-flex h-10 shrink-0 items-center gap-1.5 px-3 text-xs font-medium text-[var(--foreground)] transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none" @click="copySecret">
                <component :is="copied ? IconCircleCheck : IconCopy" :size="15" :stroke="2" />
                {{ copied ? 'Tersalin' : 'Salin' }}
              </button>
            </div>
          </div>

          <div>
            <label class="mb-1.5 block text-xs font-semibold text-[var(--muted-foreground)]" for="tfa-code">Kode dari aplikasi (6 digit)</label>
            <input
              id="tfa-code"
              v-model="code"
              type="text"
              inputmode="numeric"
              maxlength="6"
              class="sg-field h-11 w-40 px-3.5 text-center font-mono text-lg tracking-[0.3em] text-[var(--foreground)] outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]"
              placeholder="123456"
              @keydown.enter="confirmEnable"
            />
          </div>

          <div class="flex gap-2">
            <button type="button" class="sg-primary inline-flex h-10 items-center px-5 text-sm font-medium text-white transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none disabled:opacity-60" :disabled="busy" @click="confirmEnable">
              {{ busy ? 'Memeriksa...' : 'Aktifkan' }}
            </button>
            <button type="button" class="sg-control inline-flex h-10 items-center px-5 text-sm font-medium text-[var(--foreground)] transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none" @click="cancelSetup">Batal</button>
          </div>
        </div>
      </div>

      <!-- Sudah aktif: tombol matikan -->
      <div v-if="enabled" class="mt-5">
        <button v-if="!showDisable" type="button" class="sg-control inline-flex h-10 items-center gap-2 px-5 text-sm font-medium text-[var(--destructive)] transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none" @click="showDisable = true">
          <IconShieldOff :size="17" :stroke="1.8" />
          Matikan 2FA
        </button>
        <div v-else class="flex flex-wrap items-end gap-3">
          <div>
            <label class="mb-1.5 block text-xs font-semibold text-[var(--muted-foreground)]" for="off-code">Kode autentikator (untuk konfirmasi)</label>
            <input
              id="off-code"
              v-model="disableCode"
              type="text"
              inputmode="numeric"
              maxlength="6"
              class="sg-field h-11 w-40 px-3.5 text-center font-mono text-lg tracking-[0.3em] text-[var(--foreground)] outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)]"
              placeholder="123456"
            />
          </div>
          <button type="button" class="sg-control inline-flex h-11 items-center px-5 text-sm font-medium text-[var(--destructive)] transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none disabled:opacity-60" :disabled="disableBusy" @click="confirmDisable">
            {{ disableBusy ? 'Mematikan...' : 'Konfirmasi matikan' }}
          </button>
          <button type="button" class="sg-control inline-flex h-11 items-center px-5 text-sm font-medium text-[var(--foreground)] transition focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none" @click="showDisable = false; disableCode = ''">Batal</button>
        </div>
      </div>
    </div>

    <div class="sg-card p-5 text-sm text-[var(--muted-foreground)]">
      <p class="mb-2 font-medium text-[var(--foreground)]">Catatan</p>
      <ul class="list-disc space-y-1 pl-5">
        <li>Aplikasi yang disarankan: Google Authenticator, Aegis, Bitwarden, 1Password.</li>
        <li>Sesi biasa berlaku 12 jam. Pilih "Tetap masuk" saat login untuk 14 hari.</li>
        <li>Simpan kode cadangan aplikasi autentikator Anda; kalau ponsel hilang, hubungi admin untuk reset.</li>
      </ul>
    </div>
  </div>
</template>