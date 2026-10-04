<template>
  <div v-if="open" class="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 p-4" @click.self="emit('close')">
    <div class="w-full max-w-[560px] overflow-hidden rounded-2xl bg-white shadow-[0_20px_40px_rgba(15,23,42,0.18)] dark:bg-slate-800">
      <header class="flex items-center gap-3 border-b border-[#eceff1] px-6 py-4 dark:border-slate-700">
        <span class="grid size-10 place-items-center rounded-full bg-[#e8f0fe] text-[#1a73e8] dark:bg-sky-500/15 dark:text-sky-300">
          <IconHelpCircle :size="22" :stroke="2" />
        </span>
        <h2 class="text-lg font-semibold text-[#202124] dark:text-slate-100">Tentang KoncetCloud</h2>
        <button type="button" class="ml-auto grid size-8 place-items-center rounded-full text-[#5f6368] transition hover:bg-black/5 dark:text-slate-400 dark:hover:bg-white/10" aria-label="Tutup" @click="emit('close')">
          <IconX :size="18" :stroke="2" />
        </button>
      </header>

      <div class="flex flex-col gap-4 px-6 py-5 text-sm text-[#3c4043] dark:text-slate-300">
        <p>
          KoncetCloud adalah antarmuka untuk rclone yang berjalan di komputer ini. Berkas Anda
          tidak pernah melewati server pihak ketiga: rclone yang mengunggah, dan halaman ini
          hanya mengirim perintah ke rclone lokal.
        </p>
        <div class="grid grid-cols-2 gap-3 rounded-xl border border-[#e0e3e7] p-4 dark:border-slate-700">
          <div>
            <p class="text-xs text-[#5f6368] dark:text-slate-400">Mesin rclone</p>
            <p class="font-medium">{{ version || 'tidak terhubung' }}</p>
          </div>
          <div>
            <p class="text-xs text-[#5f6368] dark:text-slate-400">Alamat control plane</p>
            <p class="font-medium">{{ rc || '—' }}</p>
          </div>
        </div>
        <div>
          <p class="mb-2 font-semibold text-[#202124] dark:text-slate-100">Periksa sebelum mengunggah</p>
          <p class="mb-2 text-[#5f6368] dark:text-slate-400">
            Jalankan skrip ini dari terminal untuk melihat berapa berkas yang belum tersalin,
            tanpa mengirim apa pun:
          </p>
          <code class="block overflow-x-auto rounded-xl bg-[#f1f3f4] px-3 py-2 font-mono text-xs text-[#202124] dark:bg-slate-900 dark:text-slate-200">bash D:/omni-buddy/scripts/preflight.sh</code>
        </div>
        <p class="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
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