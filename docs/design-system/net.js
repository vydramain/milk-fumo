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
let mode = params.get('net') || 'slow';   // fast | slow | stalled | offline
const activeTransfers = new Set();
export const NET = {
  get mode() { return mode; },
  set mode(next) {
    if (mode === next) return;
    mode = next;
    for (const update of activeTransfers) update();
  },
};

const realFetch = window.fetch.bind(window);
const ROOT = new URL(CONTENT_ROOT, location.href).pathname;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

window.fetch = async (input, opts = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.href);
  if (!url.pathname.startsWith(ROOT) || opts.method === 'HEAD') return realFetch(input, opts);
  const path = decodeURIComponent(url.pathname.slice(ROOT.length));
  if (NET.mode === 'offline') { await sleep(LATENCY); return new Response('', { status: 503 }); }
  if (path === '' || path.endsWith('/')) return listing(path.replace(/\/$/, ''));
  return download(input, opts);
};

async function download(input, opts) {
  const { signal: callerSignal = input.signal } = opts;
  const controller = new AbortController();
  const signal = callerSignal ? AbortSignal.any([callerSignal, controller.signal]) : controller.signal;
  signal.throwIfAborted();

  function update() {
    if (NET.mode === 'offline') controller.abort(new TypeError('offline'));
  }

  let abort;
  const interrupted = new Promise((_, reject) => {
    abort = () => reject(signal.reason);
  });
  signal.addEventListener('abort', abort);
  activeTransfers.add(update);

  try {
    const headers = realFetch(input, { ...opts, signal }).then((res) => {
      if (signal.aborted) {
        res.body?.cancel(signal.reason).catch(() => {});
        throw signal.reason;
      }
      return res.ok && res.body ? transfer(res, signal) : res;
    });
    return await Promise.race([interrupted, headers]);
  } finally {
    activeTransfers.delete(update);
    signal.removeEventListener('abort', abort);
  }
}

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

// The headers stay so the download knows its total. Mode changes also reach a pending read or delay.
function transfer(res, signal) {
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  let sent = 0;
  let ctl, wake, timer;
  let active = true;

  function wait(ms) {
    return new Promise((done) => {
      wake = () => {
        clearTimeout(timer);
        timer = undefined;
        wake = undefined;
        done();
      };
      if (ms !== undefined) timer = setTimeout(wake, ms);
    });
  }

  function finish() {
    active = false;
    activeTransfers.delete(update);
    signal?.removeEventListener('abort', abort);
    wake?.();
  }

  function fail(error) {
    finish();
    ctl.error(error);
    reader.cancel(error).catch(() => {});
  }

  function abort() { fail(signal.reason); }

  function update() {
    if (NET.mode === 'offline') fail(new TypeError('offline'));
    else if (NET.mode === 'fast' || timer === undefined) wake?.();
  }

  const body = new ReadableStream({
    start(controller) {
      ctl = controller;
      activeTransfers.add(update);
      signal?.addEventListener('abort', abort);
      if (signal?.aborted) abort();
      else update();
    },
    async pull() {
      try {
        const { done, value } = await reader.read();
        if (!active) return;
        if (done) { finish(); ctl.close(); return; }
        for (let i = 0; i < value.length; i += CHUNK) {
          const part = value.subarray(i, i + CHUNK);
          let paced = false;
          while (active) {
            if (NET.mode === 'stalled' && total && sent + part.length > total * STALL_AT) await wait();
            else if (NET.mode !== 'fast' && !paced) {
              await wait(part.length / RATE * 1000);
              paced = true;
            } else break;
          }
          if (!active) return;
          ctl.enqueue(part);
          sent += part.length;
        }
      } catch (error) {
        if (active) fail(error);
      }
    },
    cancel(reason) {
      finish();
      return reader.cancel(reason);
    },
  });
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}
