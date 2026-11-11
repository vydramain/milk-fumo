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
    // A failed listing is not kept: the next visit to the folder asks again. One handler for both outcomes, so the
    // derived promise never rejects unhandled; callers still get the rejection from `pending`.
    pending.then((entries) => resolved.set(path, entries), () => cache.delete(path));
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
  if (!response.ok) throw Object.assign(new Error(`${response.status} ${dir}`), { status: response.status });
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

// ---- links: /?open=<path under the content root> ---------------------------------------------------------------------

// The link in a query string: null without `open`, { path } for a good one, { code: 400 } for a broken one. This is the
// trust boundary of links: a path is split into segments and every one must be a plain name, so a link can only name
// something under the content root. One trailing slash is accepted and dropped.
export function linkPath(search) {
  const raw = new URLSearchParams(search).get('open');
  if (raw === null) return null;
  const path = raw.endsWith('/') ? raw.slice(0, -1) : raw;
  const bad = path.split('/').some((s) => s === '' || s === '.' || s === '..' || /[\\:]/.test(s));
  return bad ? { code: 400 } : { path };
}

// The address of a path: `/` for the root, else `/?open=` and the segments, each encoded, the slashes literal.
export function linkOf(path) {
  return path ? '/?open=' + path.split('/').map(encodeURIComponent).join('/') : '/';
}

// What a link names, from the listing of its parent folder: { kind, dir, entry } (`dir` is the folder the viewer works
// in: the path itself for a folder, else the parent), or { code, name } for a link that cannot open: 404 (not in the
// listing, or the listing failed), 403 (the listing was refused), 415 (a file the site has no viewer for).
export async function resolveLink(path) {
  const cut = path.lastIndexOf('/');
  const dir = path.slice(0, Math.max(cut, 0));
  const name = path.slice(cut + 1);
  let entries;
  try { entries = await list(dir); } catch (err) { return { code: err.status === 403 ? 403 : 404, name }; }
  const entry = entries.find((e) => e.name === name);
  if (!entry) return { code: 404, name };
  const kind = kindOf(entry);
  if (kind === 'folder') return { kind, dir: path, entry };
  return kind === 'other' ? { code: 415, name } : { kind, dir, entry };
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
