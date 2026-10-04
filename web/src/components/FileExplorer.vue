<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import {
  IconArrowUp,
  IconChevronRight,
  IconFolderPlus,
  IconRefresh,
} from '@tabler/icons-vue';
import { formatBytes } from '../composables/useFormatFile.js';
import { getFileCategory } from '../composables/useFileType.js';
import FileListHeader from './FileListHeader.vue';
import FileListRow from './FileListRow.vue';
import FileListGridCard from './FileListGridCard.vue';
import FileListFilterBar from './FileListFilterBar.vue';
import FileListViewModeToggle from './FileListViewModeToggle.vue';
import FileListContextMenu from './FileListContextMenu.vue';
import NewFolderModal from './NewFolderModal.vue';
import FileDetailsModal from './FileDetailsModal.vue';
import LoadingState from './LoadingState.vue';

const props = defineProps({
  fs: { type: String, default: '' },
  path: { type: String, default: '' },
  role: { type: String, default: 'admin' },
});
const canWrite = computed(() => props.role === 'admin');
const emit = defineEmits(['navigate', 'up', 'select-file', 'files-loaded']);

const items = ref([]);
const loading = ref(false);
const error = ref('');
const viewMode = ref(localStorage.getItem('omni-buddy-view') === 'grid' ? 'grid' : 'list');
const filter = ref('');
const typeFilter = ref('all');
const activeFilterMenu = ref('');
const sortBy = ref('name');
const sortDir = ref('asc');
const selected = ref([]);
const lastIndex = ref(-1);
const menu = ref(null);
const showNewFolder = ref(false);
const detailFile = ref(null);
const refreshKey = ref(0);

watch(viewMode, (v) => {
  try { localStorage.setItem('omni-buddy-view', v); } catch (e) {}
});
watch(() => [props.fs, props.path], () => { load(); }, { immediate: false });

const breadcrumbs = computed(() => props.path.split('/').filter(Boolean));

const counts = computed(() => {
  let folders = 0, files = 0, bytes = 0;
  for (const it of items.value) {
    if (it.dir) folders++;
    else { files++; bytes += it.size || 0; }
  }
  return { folders, files, bytes };
});

const shown = computed(() => {
  const q = filter.value.trim().toLowerCase();
  let list = items.value;
  if (q) list = list.filter((it) => (it.name || '').toLowerCase().includes(q));
  if (typeFilter.value !== 'all') {
    list = list.filter((it) => {
      if (typeFilter.value === 'folder') return it.dir;
      return !it.dir && getFileCategory(it) === typeFilter.value;
    });
  }
  const dir = sortDir.value === 'asc' ? 1 : -1;
  const k = sortBy.value;
  return [...list].sort((a, b) => {
    if (a.dir !== b.dir) return a.dir ? -1 : 1;
    let r = 0;
    if (k === 'size') r = (a.size || 0) - (b.size || 0);
    else if (k === 'modTime') r = new Date(a.modTime || 0) - new Date(b.modTime || 0);
    else r = (a.name || '').localeCompare(b.name || '', 'id');
    return r * dir;
  });
});

async function load() {
  if (!props.fs) { items.value = []; return; }
  loading.value = true;
  error.value = '';
  try {
    const params = new URLSearchParams({ fs: props.fs, path: props.path });
    const r = await fetch(`/api/files?${params}`);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    items.value = d.items || [];
    emit('files-loaded', items.value);
  } catch (e) {
    error.value = e.message;
    items.value = [];
  } finally {
    loading.value = false;
  }
}

function sortByField(field) {
  if (sortBy.value === field) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  else { sortBy.value = field; sortDir.value = 'asc'; }
}
function applyFilter(type, value) {
  if (type === 'type') { typeFilter.value = value; activeFilterMenu.value = ''; }
}
function clearFilter(type) {
  if (type === 'type') typeFilter.value = 'all';
}
function toggleFilterMenu(type) {
  activeFilterMenu.value = activeFilterMenu.value === type ? '' : type;
}

function openItem(item) {
  if (item.dir) emit('navigate', item.path);
  else detailFile.value = item;
}
function selectItem(item, event) {
  const i = shown.value.findIndex((x) => x.path === item.path);
  if (event.shiftKey && lastIndex.value >= 0) {
    const [a, b] = [Math.min(lastIndex.value, i), Math.max(lastIndex.value, i)];
    const range = shown.value.slice(a, b + 1).map((x) => x.path);
    selected.value = [...new Set([...selected.value, ...range])];
  } else if (event.ctrlKey || event.metaKey) {
    selected.value = selected.value.includes(item.path)
      ? selected.value.filter((p) => p !== item.path)
      : [...selected.value, item.path];
  } else {
    selected.value = [item.path];
  }
  lastIndex.value = i;
}

function openMenu(item, event) {
  if (!selected.value.includes(item.path)) selected.value = [item.path];
  menu.value = { item, x: event.clientX, y: event.clientY };
}
function closeMenu() { menu.value = null; }

async function actionRename() {
  if (!canWrite.value) return;
  const item = menu.value?.item || detailFile.value;
  if (!item) return;
  const next = window.prompt('Nama baru untuk "' + item.name + '"', item.name);
  closeMenu();
  if (!next || next === item.name) return;
  const parent = item.path.split('/').slice(0, -1).join('/');
  const to = parent ? `${parent}/${next}` : next;
  try {
    const r = await fetch('/api/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fs: props.fs, from: item.path, to }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    await load();
  } catch (e) {
    window.alert(`Gagal ubah nama: ${e.message}`);
  }
}
async function actionDelete() {
  if (!canWrite.value) return;
  const item = menu.value?.item || detailFile.value;
  if (!item) return;
  closeMenu();
  if (!window.confirm(`Hapus "${item.name}"? Aksi ini tidak bisa dibatalkan.`)) return;
  try {
    const r = await fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fs: props.fs, path: item.path, dir: item.dir }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    selected.value = selected.value.filter((p) => p !== item.path);
    await load();
  } catch (e) {
    window.alert(`Gagal hapus: ${e.message}`);
  }
}
function downloadItem() {
  const item = menu.value?.item || detailFile.value;
  if (!item) return;
  closeMenu();
  window.open(`/api/download?fs=${encodeURIComponent(props.fs)}&path=${encodeURIComponent(item.path)}`, '_blank');
}
function goUp() {
  selected.value = [];
  emit('up');
}
function navigateTo(segments) {
  selected.value = [];
  emit('navigate', segments.join('/'));
}

onMounted(load);
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-1 text-sm">
          <button
            type="button"
            class="flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-[#202124] transition hover:bg-black/5 dark:text-slate-100 dark:hover:bg-white/5"
            @click="emit('navigate', '')"
          >
            {{ fs || 'drive' }}
          </button>
          <template v-for="(seg, i) in breadcrumbs" :key="seg">
            <IconChevronRight :size="16" :stroke="1.5" class="text-[#5f6368] dark:text-slate-500" />
            <button
              type="button"
              class="max-w-[220px] truncate rounded-lg px-2 py-1 text-[#5f6368] transition hover:bg-black/5 hover:text-[#202124] dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100"
              @click="navigateTo(breadcrumbs.slice(0, i + 1))"
            >
              {{ seg }}
            </button>
          </template>
        </div>
        <p class="mt-1 px-2 text-xs text-[#5f6368] dark:text-slate-400">
          {{ counts.folders }} folder, {{ counts.files }} berkas
          <template v-if="counts.bytes">, {{ formatBytes(counts.bytes) }}</template>
        </p>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="grid size-9 place-items-center rounded-full text-[#5f6368] transition hover:bg-black/5 dark:text-slate-400 dark:hover:bg-white/10"
          :disabled="!props.path"
          aria-label="Naik satu tingkat"
          title="Naik satu tingkat"
          @click="goUp"
        >
          <IconArrowUp :size="20" :stroke="1.8" />
        </button>
        <button
          type="button"
          class="grid size-9 place-items-center rounded-full text-[#5f6368] transition hover:bg-black/5 dark:text-slate-400 dark:hover:bg-white/10"
          aria-label="Segarkan"
          title="Segarkan"
          @click="() => { refreshKey++; load(); }"
        >
          <IconRefresh :size="20" :stroke="1.8" />
        </button>
        <FileListViewModeToggle v-model="viewMode" />
        <button
          type="button"
          class="inline-flex h-10 items-center gap-2 rounded-full bg-[#1a73e8] px-4 text-sm font-medium text-white transition hover:bg-[#1765cc] disabled:opacity-60"
          :disabled="!props.fs"
          v-if="canWrite"
          @click="showNewFolder = true"
        >
          <IconFolderPlus :size="18" :stroke="2" />
          Folder baru
        </button>
      </div>
    </div>

    <FileListFilterBar
      :type-options="[]"
      :selected-type-filter="typeFilter"
      :active-filter-menu="activeFilterMenu"
      :search-term="filter"
      @toggle-filter-menu="toggleFilterMenu"
      @apply-filter="applyFilter"
      @clear-filter="clearFilter"
      @update:searchTerm="(v) => (filter = v)"
    />

    <LoadingState v-if="loading" message="Sedang memuat..." />

    <div v-else-if="error" class="flex flex-col items-center gap-3 rounded-2xl border border-[#e0e3e7] bg-white py-12 text-center dark:border-slate-700 dark:bg-slate-800">
      <p class="font-medium text-[#c5221f]">Tidak bisa membaca folder</p>
      <p class="max-w-md px-4 text-sm text-[#5f6368] dark:text-slate-400">{{ error }}</p>
      <button type="button" class="inline-flex h-10 items-center rounded-full border border-[#dadce0] bg-white px-5 text-sm font-medium text-[#3c4043] transition hover:bg-[#f8fafd] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" @click="load">
        Coba lagi
      </button>
    </div>

    <div v-else-if="!items.length" class="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#e0e3e7] py-16 text-center dark:border-slate-700">
      <p class="font-medium text-[#5f6368] dark:text-slate-300">Folder ini kosong</p>
      <p class="text-sm text-[#5f6368] dark:text-slate-400">Buat folder baru atau jalankan job backup.</p>
      <button v-if="canWrite" type="button" class="mt-2 inline-flex h-10 items-center gap-2 rounded-full bg-[#1a73e8] px-4 text-sm font-medium text-white transition hover:bg-[#1765cc]" @click="showNewFolder = true">
        <IconFolderPlus :size="18" :stroke="2" />
        Folder baru
      </button>
    </div>

    <div v-else-if="!shown.length" class="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[#e0e3e7] py-12 text-center dark:border-slate-700">
      <p class="font-medium text-[#5f6368] dark:text-slate-300">Tidak ada yang cocok</p>
      <p class="text-sm text-[#5f6368] dark:text-slate-400">Hapus kata kunci atau filter untuk melihat semua item.</p>
      <button type="button" class="mt-2 inline-flex h-10 items-center rounded-full border border-[#dadce0] bg-white px-5 text-sm font-medium text-[#3c4043] transition hover:bg-[#f8fafd] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" @click="filter = ''; typeFilter = 'all'">Hapus filter</button>
    </div>

    <div v-else class="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white dark:border-slate-700 dark:bg-slate-800">
      <template v-if="viewMode === 'list'">
        <FileListHeader :sortable="true" :sort-by="sortBy" :sort-direction="sortDir" @sort="sortByField" />
        <FileListRow
          v-for="(it, i) in shown"
          :key="it.path"
          :item="it"
          :selected="selected.includes(it.path)"
          @select="selectItem(it, $event)"
          @open="openItem(it)"
          @contextmenu="openMenu(it, $event)"
        />
      </template>
      <template v-else>
        <div class="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <FileListGridCard
            v-for="it in shown"
            :key="it.path"
            :item="it"
            :selected="selected.includes(it.path)"
            @select="selectItem(it, $event)"
            @open="openItem(it)"
            @contextmenu="openMenu(it, $event)"
          />
        </div>
      </template>
    </div>

    <FileListContextMenu
      v-if="menu"
      :item="menu.item"
      :x="menu.x"
      :y="menu.y"
      :can-open="menu.item.dir"
      :can-write="canWrite"
      @close="closeMenu"
      @open="openItem(menu.item)"
      @download="downloadItem"
      @rename="actionRename"
      @details="detailFile = menu.item; closeMenu()"
      @delete="actionDelete"
    />

    <NewFolderModal v-if="showNewFolder" :fs="fs" :parent-path="path" @close="showNewFolder = false" @created="showNewFolder = false; load()" />
    <FileDetailsModal v-if="detailFile" :item="detailFile" :fs="fs" @close="detailFile = null" @download="downloadItem" />
  </div>
</template>