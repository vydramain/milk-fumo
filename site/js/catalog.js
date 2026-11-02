// Reading the content: the folder listing that nginx serves as JSON, and the kind of each entry.
// The site only reads. A folder is listed once per visit; the cache is not kept between visits.
import { CONTENT_ROOT, APP_SUFFIX } from './config.js';

export const KIND = {
  up: { code: 'Up', color: 'cov' },
  folder: { code: 'Fd', color: 'sel' },
  app: { code: 'Ap', color: 'peach' },
  audio: { code: 'Sn', color: 'teal' },
  image: { code: 'Im', color: 'green' },
  video: { code: 'Vi', color: 'mauve' },
  note: { code: 'Tx', color: 'ct' },
  other: { code: 'Fi', color: 'cs' },
};

const EXT = {
  mp3: 'audio', ogg: 'audio', wav: 'audio', flac: 'audio',
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image',
  mp4: 'video', webm: 'video',
  md: 'note',
};

function kindOfFile(name) {
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  return EXT[ext] || 'other';
}

export function isApp(name) {
  return name.endsWith(APP_SUFFIX);
}

// The URL of a folder or a file, given its path relative to the content root.
export function urlOf(path) {
  return CONTENT_ROOT + path.split('/').map(encodeURIComponent).join('/');
}

// The entries of a folder: { name, dir, size, date } with the folders first, by name.
const cache = new Map();

export function list(path) {
  if (!cache.has(path)) {
    const pending = fetchList(path);
    cache.set(path, pending);
    pending.then((entries) => resolved.set(path, entries));
    // A failed listing is not kept: the next visit to the folder asks again.
    pending.catch(() => cache.delete(path));
  }
  return cache.get(path);
}

// The entries of a folder that has been read already, or undefined: for the status line, which cannot wait.
const resolved = new Map();
export function known(path) {
  return resolved.get(path);
}

async function fetchList(path) {
  const dir = path ? path.replace(/\/?$/, '/') : '';
  const response = await fetch(urlOf(dir), { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${response.status} ${dir}`);
  const raw = await response.json();
  const items = raw
    .filter((e) => !e.name.startsWith('.'))
    .map((e) => ({
      name: e.name,
      dir: e.type === 'directory',
      size: e.type === 'directory' ? 0 : e.size || 0,
      date: new Date(e.mtime).toISOString().slice(0, 10),
    }));
  items.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
  return items;
}

// The kind of an entry, from its name and whether it is a folder.
export function kindOf(entry) {
  if (entry.up) return 'up';
  if (entry.dir) return isApp(entry.name) ? 'app' : 'folder';
  return kindOfFile(entry.name);
}

// The entries of the same media kind in a folder, in listing order: a player's or viewer's set.
export function setOf(items, kind) {
  return items.filter((e) => !e.dir && kindOf(e) === kind);
}

export function formatSize(n) {
  if (n >= 1048576) return (n / 1048576).toFixed(1) + 'M';
  if (n >= 1024) return Math.round(n / 1024) + 'K';
  return n + 'B';
}

export function formatBytes(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
