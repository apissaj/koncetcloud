import {
  IconArchiveFilled,
  IconFileDescription,
  IconFileDescriptionFilled,
  IconFileMusicFilled,
  IconFileText,
  IconFileTextFilled,
  IconFileZip,
  IconFolder,
  IconFolderFilled,
  IconMusic,
  IconPhoto,
  IconPhotoFilled,
  IconVideo,
  IconVideoFilled,
} from '@tabler/icons-vue';

const ICON_FACTORY = {
  folder: { filled: IconFolderFilled, outline: IconFolder },
  image: { filled: IconPhotoFilled, outline: IconPhoto },
  video: { filled: IconVideoFilled, outline: IconVideo },
  audio: { filled: IconFileMusicFilled, outline: IconMusic },
  archive: { filled: IconArchiveFilled, outline: IconFileZip },
  document: { filled: IconFileTextFilled, outline: IconFileText },
  other: { filled: IconFileDescriptionFilled, outline: IconFileDescription },
  all: { filled: IconFileDescriptionFilled, outline: IconFileDescription },
};

function getFileExtension(item) {
  const source = item.name || '';
  const parts = source.toLowerCase().split('.');
  return parts.length > 1 ? parts.at(-1) : '';
}

export function getFileCategory(item) {
  if (item.dir) return 'folder';
  const mimeType = (item.mime || '').toLowerCase();
  const extension = getFileExtension(item);

  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (
    mimeType.includes('zip') ||
    mimeType.includes('rar') ||
    mimeType.includes('7z') ||
    mimeType.includes('tar') ||
    ['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)
  ) {
    return 'archive';
  }
  if (
    mimeType === 'application/pdf' ||
    mimeType.startsWith('text/') ||
    mimeType.includes('document') ||
    mimeType.includes('word') ||
    mimeType.includes('sheet') ||
    mimeType.includes('excel') ||
    mimeType.includes('presentation') ||
    mimeType.includes('powerpoint') ||
    mimeType === 'application/json'
  ) {
    return 'document';
  }

  return 'other';
}

export function getFileIcon(item, filled = false) {
  const category = item.dir ? 'folder' : getFileCategory(item);
  const entry = ICON_FACTORY[category] || ICON_FACTORY.document;
  return filled ? entry.filled : entry.outline;
}

export function getTypeFilterIcon(value, filled = false) {
  const entry = ICON_FACTORY[value] || ICON_FACTORY.all;
  return filled ? entry.filled : entry.outline;
}