// The network of the design systems: the fixtures in content/ stand in for the content directory, and the network
// can be slowed down. Both design systems (this one and docs/pocket-design-system) import it; it replaces window.fetch.
import { urlOf } from '../../site/js/catalog.js';
import { CONTENT_ROOT } from './config.js';

// ---- the network ---------------------------------------------------------------------------------------------------

// The fixtures stand in for the content directory. nginx lists a folder as JSON; here the tree below is the listing,
// and the sizes come from the files. A name that is listed but has no file gives a 404 (errr); a folder that is not
// in the tree gives a 403 (the pmc folder error).
const TREE = {
  '': ['apps/', 'empty/', 'images/', 'locked/', 'music/', 'notes/', 'video/', 'readme.md'],
  'apps': ['broken.exe/', 'demo.exe/'],
  'apps/demo.exe': ['index.html'],
  'apps/broken.exe': [],
  'empty': [],
  'images': ['missing.png', 'sprite-48.png', 'testcard-1280.png'],
  'music': ['01 brass-hum.mp3', '02 olive-drone.ogg', '03 untagged.mp3', 'missing.mp3'],
  'notes': ['missing.md', 'plain.txt', 'short.md'],
  'video': ['testcard.webm'],
};
const MTIME = '2026-11-04T12:00:00Z';
const RATE = 32 * 1024;     // bytes per second on the slow network
const CHUNK = 4096;
const LATENCY = 300;        // ms before a listing comes, on the slow and stalled networks
const STALL_AT = 0.4;       // the stalled network holds every file at this share

export const params = new URLSearchParams(location.search);
export const NET = { mode: params.get('net') || 'slow' };   // fast | slow | stalled | offline

const realFetch = window.fetch.bind(window);
const ROOT = new URL(CONTENT_ROOT, location.href).pathname;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

window.fetch = async (input, opts = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.href);
  if (!url.pathname.startsWith(ROOT) || opts.method === 'HEAD') return realFetch(input, opts);
  const path = decodeURIComponent(url.pathname.slice(ROOT.length));
  if (NET.mode === 'offline') { await sleep(LATENCY); return new Response('', { status: 503 }); }
  if (path === '' || path.endsWith('/')) return listing(path.replace(/\/$/, ''));
  const res = await realFetch(input, opts);
  return NET.mode === 'fast' || !res.ok ? res : slowed(res, opts.signal);
};

async function listing(dir) {
  if (NET.mode !== 'fast') await sleep(LATENCY);
  const names = TREE[dir];
  if (!names) return new Response('', { status: 403 });
  const entries = await Promise.all(names.map(async (n) => {
    const folder = n.endsWith('/');
    const name = folder ? n.slice(0, -1) : n;
    let size = 0;
    if (!folder) {
      const head = await realFetch(urlOf(dir ? dir + '/' + name : name), { method: 'HEAD' });
      size = head.ok ? Number(head.headers.get('content-length')) || 0 : 0;
    }
    return { name, type: folder ? 'directory' : 'file', size, mtime: MTIME };
  }));
  return Response.json(entries);
}

// The body of a response, given out at RATE in CHUNK pieces; on the stalled network it stops at STALL_AT of the file
// until the network changes. The headers stay, so the download knows its total.
function slowed(res, signal) {
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  let sent = 0;
  const body = new ReadableStream({
    async pull(ctl) {
      const { done, value } = await reader.read();
      if (done) { ctl.close(); return; }
      for (let i = 0; i < value.length; i += CHUNK) {
        const part = value.subarray(i, i + CHUNK);
        while (NET.mode === 'stalled' && total && sent + part.length > total * STALL_AT && !signal?.aborted) await sleep(200);
        if (NET.mode !== 'fast') await sleep(part.length / RATE * 1000);
        if (signal?.aborted) { reader.cancel(); ctl.close(); return; }
        // Going offline breaks a download under way, as a lost connection does: the reader fails and the bar says errr.
        if (NET.mode === 'offline') { reader.cancel(); ctl.error(new TypeError('offline')); return; }
        ctl.enqueue(part);
        sent += part.length;
      }
    },
    cancel() { reader.cancel(); },
  });
  return new Response(body, { status: res.status, headers: res.headers });
}
