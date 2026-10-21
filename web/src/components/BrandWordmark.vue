<script setup>
// Wordmark "KoncetCloud".
//
// Huruf "K" = geometri K pada mark "Vault K" (BrandMark.vue), dicerminkan jadi
// PATH berisi (di mark itu K adalah LUBANG, di sini jadi huruf biasa).
// Sifat huruf K (dalam satuan viewBox): batang x0-28, lengan atas & bawah 45°,
// puncak (46,52), baseline y=104, cap atas y=0  -> tinggi cap 104.
//
// "oncetCloud" = teks Plus Jakarta Sans ExtraBold (weight 800).
// Ukuran font 137.4 -> cap height font = 745/1000 x 137.4 = 102.3, dan
// huruf tinggi (C,l,d,t) = 757/1000 x 137.4 = 104.0 -> sama dengan cap K.
// Baseline teks y=104 -> sejajar dengan baseline K.
//
// Stem K = 28 satuan, sementara stem ExtraBold = 150/1000 x 137.4 = 20.6:
// K sengaja lebih tebal (dia huruf mark, jangkar wordmark).
//
// fill="currentColor" -> otomatis ikut tema terang/gelap.
import { computed } from 'vue';

const props = defineProps({ size: { type: Number, default: 26 }, lead: { type: Boolean, default: true } });

// viewBox 893 x 108.5 -> lebar harus proporsional terhadap tinggi, kalau tidak
// preserveAspectRatio akan mengecilkan wordmark supaya muat di kotak persegi.
// Tanpa huruf K (lead=false) teks mulai di x=0 dan lebarannya 794.5 -> dipakai
// bersama mark "Vault K" supaya huruf K tak kembar.
const RATIO = computed(() => (props.lead ? 893 : 794.5) / 108.5);
const VIEWBOX = computed(() => (props.lead ? '-1 -1.5 893 108.5' : '0 -1.5 794.5 108.5'));
const TEXT_X = computed(() => (props.lead ? 99.465 : 0));
const width = () => Math.round(props.size * RATIO.value * 100) / 100;
</script>

<template>
  <svg
    :width="width()"
    :height="size"
    :viewBox="VIEWBOX"
    preserveAspectRatio="xMinYMid meet"
    role="img"
    aria-label="KoncetCloud"
    fill="currentColor"
  >
    <!-- K (path, bukan teks) - identik dengan K pada mark -->
    <path v-if="lead" d="M0 0H28V34L62 0H98L46 52L98 104H62L28 70V104H0Z" />
    <!-- "oncetCloud" - baseline y=104 sama dengan baseline K -->
    <text
      :x="TEXT_X"
      y="104"
      font-family="Plus Jakarta Sans, Arial, sans-serif"
      font-size="137.4"
      font-weight="800"
      letter-spacing="-3.572"
    >oncetCloud</text>
  </svg>
</template>
