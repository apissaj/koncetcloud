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
    <div class="sg-card p-5 sm:p-7">
      <p class="mb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Penyimpanan</p>
      <h1 class="text-[26px] font-medium text-[var(--foreground)]">Kapasitas</h1>
      <p class="mt-2 max-w-[720px] text-sm text-[var(--muted-foreground)]">
        Diambil langsung dari tiap remote rclone lewat <span class="font-mono text-xs">operations/about</span>.
        Ini kuota akun Anda sendiri, bukan penyimpanan pihak ketiga.
      </p>

      <div v-if="!remotes.length" class="mt-6 rounded-lg border border-dashed border-[var(--glass-edge)] py-12 text-center">
        <p class="font-medium text-[var(--muted-foreground)]">Belum ada remote rclone</p>
        <p class="mt-1 text-sm text-[var(--muted-foreground)]">Tambahkan remote lewat <span class="font-mono text-xs">rclone config</span>.</p>
      </div>

      <template v-else>
        <div class="sg-panel mt-6 flex flex-col items-center gap-5 p-5 sm:flex-row sm:items-center">
          <div class="grid size-[132px] shrink-0 place-items-center rounded-full" :style="{ background: `conic-gradient(var(--primary) 0 ${totalPct}%, var(--muted) ${totalPct}% 100%)` }">
            <div class="grid size-[94px] place-items-center rounded-full bg-[var(--background)] text-lg font-bold text-[var(--foreground)]">
              {{ totalPctLabel }}
            </div>
          </div>
          <div class="min-w-0 flex-1">
            <dl class="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <dt class="text-xs text-[var(--muted-foreground)]">Terpakai</dt>
                <dd class="text-base font-semibold text-[var(--foreground)]">{{ formatBytes(totalUsed) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-[var(--muted-foreground)]">Kosong</dt>
                <dd class="text-base font-semibold text-[var(--foreground)]">{{ formatBytes(totalFree) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-[var(--muted-foreground)]">Total</dt>
                <dd class="text-base font-semibold text-[var(--foreground)]">{{ formatBytes(totalAll) }}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div class="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <article
            v-for="r in remotes"
            :key="r.name"
            class="sg-card p-4"
          >
            <header class="flex items-start justify-between gap-3">
              <div class="flex min-w-0 items-center gap-2.5">
                <span class="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--muted)]">
                  <component :is="IconCloudFilled" v-if="!providerIcon(r.name)" :size="18" :stroke="0" class="text-[var(--foreground)]" />
                  <img v-else :src="providerIcon(r.name)" :alt="providerLabel(r.name)" class="size-4.5 object-contain" />
                </span>
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-[var(--foreground)]">{{ r.name }}</p>
                  <p class="truncate text-xs text-[var(--muted-foreground)]">{{ providerLabel(r.name) }}</p>
                </div>
              </div>
              <span
                class="shrink-0 rounded-full border bg-[var(--muted)] px-2.5 py-0.5 text-[11px] font-medium"
                :class="r.ok
                  ? 'border-[var(--glass-edge)] text-[var(--success)]'
                  : 'border-[var(--destructive)] text-[var(--destructive)]'"
              >{{ r.ok ? 'Aktif' : 'Error' }}</span>
            </header>

            <p v-if="!r.ok" class="mt-3 text-xs text-[var(--destructive)]">{{ r.error }}</p>

            <template v-else>
              <div class="sg-groove mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
                <div class="h-full rounded-full bg-[var(--primary)]" :style="{ width: `${pct(r)}%` }" />
              </div>
              <div class="mt-2 flex items-center justify-between text-xs">
                <span class="text-[var(--muted-foreground)]">{{ formatBytes(r.used) }} / {{ formatBytes(r.total) }}</span>
                <span class="font-medium text-[var(--foreground)]">{{ pctLabel(r) }}</span>
              </div>
              <div class="mt-2 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
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