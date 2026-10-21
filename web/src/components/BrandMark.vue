<script setup>
// Mark KoncetCloud "Vault K": kotak rounded tegas (wadah/brankas) dengan huruf K
// dan slot brankas sebagai RUANG KOSONG (lubang) - bukan warna putih.
// fill="currentColor" -> mark otomatis mengikuti tema terang/gelap.
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
      d="M56 16 H200 A40 40 0 0 1 240 56 V200 A40 40 0 0 1 200 240 H56 A40 40 0 0 1 16 200 V56 A40 40 0 0 1 56 16 Z M78 76 H106 V110 L140 76 H176 L124 128 L176 180 H140 L106 146 V180 H78 Z M240 108 H222 A14 14 0 0 0 208 122 V134 A14 14 0 0 0 222 148 H240 Z"
    />
  </svg>
</template>
