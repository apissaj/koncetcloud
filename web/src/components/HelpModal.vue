<template>
  <div v-if="open" class="fixed inset-0 z-50 grid place-items-center bg-[var(--foreground)]/40 p-4" @click.self="emit('close')">
    <div class="sg-popover w-full max-w-[560px] overflow-hidden">
      <header class="flex items-center gap-3 border-b border-[var(--border)] px-6 py-4">
        <span class="grid size-10 place-items-center rounded-full bg-[var(--muted)] text-[var(--primary)]">
          <IconHelpCircle :size="22" :stroke="2" />
        </span>
        <h2 class="text-lg font-semibold text-[var(--foreground)]">Tentang KoncetCloud</h2>
        <button type="button" class="sg-control ml-auto grid size-8 place-items-center rounded-full text-[var(--muted-foreground)] transition hover:bg-[var(--hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-line)] focus-visible:outline-none" aria-label="Tutup" @click="emit('close')">
          <IconX :size="18" :stroke="2" />
        </button>
      </header>

      <div class="flex flex-col gap-4 px-6 py-5 text-sm text-[var(--muted-foreground)]">
        <p>
          KoncetCloud adalah antarmuka untuk rclone yang berjalan di komputer ini. Berkas Anda
          tidak pernah melewati server pihak ketiga: rclone yang mengunggah, dan halaman ini
          hanya mengirim perintah ke rclone lokal.
        </p>
        <div class="sg-panel grid grid-cols-2 gap-3 p-4">
          <div>
            <p class="text-xs text-[var(--muted-foreground)]">Mesin rclone</p>
            <p class="font-medium text-[var(--foreground)]">{{ version || 'tidak terhubung' }}</p>
          </div>
          <div>
            <p class="text-xs text-[var(--muted-foreground)]">Alamat control plane</p>
            <p class="font-medium text-[var(--foreground)]">{{ rc || '—' }}</p>
          </div>
        </div>
        <div>
          <p class="mb-2 font-semibold text-[var(--foreground)]">Periksa sebelum mengunggah</p>
          <p class="mb-2 text-[var(--muted-foreground)]">
            Jalankan skrip ini dari terminal untuk melihat berapa berkas yang belum tersalin,
            tanpa mengirim apa pun:
          </p>
          <code class="sg-control block overflow-x-auto px-3 py-2 font-mono text-xs text-[var(--foreground)]">bash D:/omni-buddy/scripts/preflight.sh</code>
        </div>
        <p class="rounded-xl border border-[var(--destructive)]/35 bg-[var(--destructive)]/10 px-4 py-3 text-xs text-[var(--destructive)]">
          Jangan pakai <code class="font-mono">dryRun=true</code> lewat API rclone: pada rclone 1.75.1
          opsi itu tidak dihormati dan berkas benar-benar terunggah. Untuk menghentikan transfer,
          panggil <code class="font-mono">job/stop</code>.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { IconHelpCircle, IconX } from '@tabler/icons-vue';

defineProps({
  open: { type: Boolean, default: false },
  version: { type: String, default: '' },
  rc: { type: String, default: '' },
});
const emit = defineEmits(['close']);
</script>