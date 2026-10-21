<script setup>
// Mark KoncetCloud: kotak rounded (wadah) dengan K sebagai ruang kosong (lubang).
// fill="currentColor" -> otomatis mengikuti tema terang/gelap.
defineProps({ size: { type: Number, default: 36 } });
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 256 256"
    role="img"
    aria-label="KoncetCloud"
    fill="currentColor"
  >
    <path
      fill-rule="evenodd"
      d="M76 16 H180 A60 60 0 0 1 240 76 V180 A60 60 0 0 1 180 240 H76 A60 60 0 0 1 16 180 V76 A60 60 0 0 1 76 16 Z M78 76 H106 V110 L140 76 H176 L124 128 L176 180 H140 L106 146 V180 H78 Z"
    />
  </svg>
</template>
