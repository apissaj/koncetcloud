<template>
  <div v-if="variant === 'overlay'" class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/80 text-center text-[#202124] backdrop-blur-[2px] transition-opacity select-none dark:bg-slate-900/80 dark:text-slate-100" role="status" aria-live="polite">
    <span class="loading-spinner" aria-hidden="true" />
    <p class="text-sm font-medium">{{ message || 'Sedang memuat...' }}</p>
  </div>
  <div v-else class="flex flex-col items-center justify-center gap-3 py-10 text-center text-[#5f6368] dark:text-slate-400">
    <span class="loading-spinner" aria-hidden="true" />
    <p class="text-sm">{{ message || 'Sedang memuat...' }}</p>
  </div>
</template>

<script setup>
defineProps({
  message: { type: String, default: null },
  variant: { type: String, default: 'panel' },
});
</script>