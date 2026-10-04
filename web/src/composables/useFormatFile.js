import cloudflareLogo from '../assets/cloudflare.svg';
import dropboxLogo from '../assets/dropbox.svg';
import googleDriveLogo from '../assets/google-drive.svg';
import megaLogo from '../assets/mega.svg';
import oneDriveLogo from '../assets/microsoft-onedrive.svg';
import pcloudLogo from '../assets/pcloud.svg';
import s3Logo from '../assets/s3-storage.svg';
import yandexLogo from '../assets/yandex-disk.svg';

const PROVIDER_META = {
  google_drive: { key: 'google_drive', label: 'Google Drive', icon: googleDriveLogo },
  onedrive: { key: 'onedrive', label: 'OneDrive', icon: oneDriveLogo },
  dropbox: { key: 'dropbox', label: 'Dropbox', icon: dropboxLogo },
  mega: { key: 'mega', label: 'MEGA', icon: megaLogo },
  pcloud: { key: 'pcloud', label: 'pCloud', icon: pcloudLogo },
  yandex: { key: 'yandex', label: 'Yandex Disk', icon: yandexLogo },
  s3: { key: 's3', label: 'S3 Storage', icon: s3Logo },
};

// Backend hanya mengirim nama remote (mis. "gdrive"). Petakan nama ke provider.
function providerKeyFromName(name = '') {
  const n = String(name).toLowerCase();
  if (n.includes('gdrive')) return 'google_drive';
  if (n.includes('onedrive')) return 'onedrive';
  if (n.includes('dropbox')) return 'dropbox';
  if (n.includes('mega')) return 'mega';
  if (n.includes('pcloud') || n.includes('p-cloud')) return 'pcloud';
  if (n.includes('yandex')) return 'yandex';
  if (n.includes('s3')) return 's3';
  return 'google_drive';
}

export function getProviderMeta(key) {
  if (typeof key === 'string' && !PROVIDER_META[key] && key.includes(':')) {
    key = providerKeyFromName(key.replace(/:$/, ''));
  }
  return PROVIDER_META[key] || { key: key || 'unknown', label: key || 'Provider', icon: null };
}

export function providerKey(file) {
  return `${file.provider || 'unknown'}::${file.email || ''}`;
}

export function providerLabel(provider) {
  return getProviderMeta(provider).label;
}

export function providerIcon(provider) {
  return getProviderMeta(provider).icon;
}

export function formatBytes(value) {
  if (!value) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let amount = Number(value) || 0;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount.toFixed(amount >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatDate(value, locale = 'id-ID') {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function getModifiedTime(file) {
  return file.modTime;
}