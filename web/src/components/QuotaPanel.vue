<script setup>
import { computed } from 'vue';
import { IconCloudFilled } from '@tabler/icons-vue';
import { formatBytes, providerIcon, providerLabel } from '../composables/useFormatFile.js';

const props = defineProps({
  remotes: { type: Array, default: () => [] },
});

function pct(r) {
  if (!r.total) return 0;
  return Math.min(100, (r.used / r.total) * 100);
}
function pctLabel(r) {
  const p = pct(r);
  return `${p.toFixed(p >= 10 ? 0 : 1)}%`;
}

const totalUsed = computed(() => props.remotes.reduce((s, r) => s + (r.used || 0), 0));
const totalFree = computed(() => props.remotes.reduce((s, r) => s + (r.free || 0), 0));
const totalAll = computed(() => totalUsed.value + totalFree.value);
const totalPct = computed(() => (totalAll.value ? Math.min(100, (totalUsed.value / totalAll.value) * 100) : 0));
const totalPctLabel = computed(() => `${totalPct.value.toFixed(totalPct.value >= 10 ? 0 : 1)}%`);
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="rounded-[24px] bg-white p-5 dark:bg-slate-800 sm:p-7">
      <p class="mb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[#1a73e8] dark:text-sky-400">Penyimpanan</p>
      <h1 class="text-[26px] font-medium text-[#202124] dark:text-slate-100">Kapasitas</h1>
      <p class="mt-2 max-w-[720px] text-sm text-[#5f6368] dark:text-slate-400">
        Diambil langsung dari tiap remote rclone lewat <span class="font-mono text-xs">operations/about</span>.
        Ini kuota akun Anda sendiri, bukan penyimpanan pihak ketiga.
      </p>

      <div v-if="!remotes.length" class="mt-6 rounded-2xl border border-dashed border-[#e0e3e7] py-12 text-center dark:border-slate-700">
        <p class="font-medium text-[#5f6368] dark:text-slate-300">Belum ada remote rclone</p>
        <p class="mt-1 text-sm text-[#5f6368] dark:text-slate-400">Tambahkan remote lewat <span class="font-mono text-xs">rclone config</span>.</p>
      </div>

      <template v-else>
        <div class="mt-6 flex flex-col items-center gap-5 rounded-[20px] border border-[#e0e3e7] bg-[#f8fafd] p-5 dark:border-slate-700 dark:bg-slate-900/50 sm:flex-row sm:items-center">
          <div class="grid size-[132px] shrink-0 place-items-center rounded-full" :style="{ background: `conic-gradient(#1a73e8 0 ${totalPct}%, #eaf1fb ${totalPct}% 100%)` }">
            <div class="grid size-[94px] place-items-center rounded-full bg-white text-lg font-bold text-[#1a73e8] dark:bg-slate-800 dark:text-sky-300">
              {{ totalPctLabel }}
            </div>
          </div>
          <div class="min-w-0 flex-1">
            <dl class="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <dt class="text-xs text-[#5f6368] dark:text-slate-400">Terpakai</dt>
                <dd class="text-base font-semibold text-[#202124] dark:text-slate-100">{{ formatBytes(totalUsed) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-[#5f6368] dark:text-slate-400">Kosong</dt>
                <dd class="text-base font-semibold text-[#202124] dark:text-slate-100">{{ formatBytes(totalFree) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-[#5f6368] dark:text-slate-400">Total</dt>
                <dd class="text-base font-semibold text-[#202124] dark:text-slate-100">{{ formatBytes(totalAll) }}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div class="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <article
            v-for="r in remotes"
            :key="r.name"
            class="rounded-2xl border border-[#e0e3e7] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:border-[#c7d2e0] hover:shadow-[0_4px_12px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-800"
          >
            <header class="flex items-start justify-between gap-3">
              <div class="flex min-w-0 items-center gap-2.5">
                <span class="grid size-9 shrink-0 place-items-center rounded-full bg-[#f1f3f4] dark:bg-slate-700">
                  <component :is="IconCloudFilled" v-if="!providerIcon(r.name)" :size="18" :stroke="0" class="text-[#5f6368] dark:text-slate-300" />
                  <img v-else :src="providerIcon(r.name)" :alt="providerLabel(r.name)" class="size-4.5 object-contain" />
                </span>
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-[#202124] dark:text-slate-100">{{ r.name }}</p>
                  <p class="truncate text-xs text-[#5f6368] dark:text-slate-400">{{ providerLabel(r.name) }}</p>
                </div>
              </div>
              <span
                class="shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
                :class="r.ok
                  ? 'border-[#34a853]/35 bg-[#e6f4ea] text-[#137333] dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300'
                  : 'border-[#ea4335]/35 bg-[#fce8e6] text-[#c5221f] dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300'"
              >{{ r.ok ? 'Aktif' : 'Error' }}</span>
            </header>

            <p v-if="!r.ok" class="mt-3 text-xs text-[#c5221f] dark:text-red-300">{{ r.error }}</p>

            <template v-else>
              <div class="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#e8eaed] dark:bg-slate-700">
                <div class="h-full rounded-full bg-[#1a73e8] dark:bg-sky-400" :style="{ width: `${pct(r)}%` }" />
              </div>
              <div class="mt-2 flex items-center justify-between text-xs">
                <span class="text-[#5f6368] dark:text-slate-400">{{ formatBytes(r.used) }} / {{ formatBytes(r.total) }}</span>
                <span class="font-medium text-[#1a73e8] dark:text-sky-300">{{ pctLabel(r) }}</span>
              </div>
              <div class="mt-2 flex items-center justify-between text-xs text-[#5f6368] dark:text-slate-400">
                <span>{{ formatBytes(r.free) }} kosong</span>
                <span v-if="r.trashed">{{ formatBytes(r.trashed) }} di sampah</span>
              </div>
            </template>
          </article>
        </div>
      </template>
    </div>
  </div>
</template>