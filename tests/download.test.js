// Byte-counted downloads: fetch is mocked with controllable streams, so no network is needed.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Download, Downloads } from '../site/js/download.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const tick = () => new Promise((r) => setTimeout(r, 5));

// A response whose chunks are pushed by the test; returns { push, end, fail, calls, signals }.
function mockFetch(headers = {}, status = 200) {
  const m = { calls: 0, signals: [] };
  globalThis.fetch = async (url, { signal }) => {
    m.calls++;
    m.signals.push(signal);
    const body = new ReadableStream({
      start(c) {
        // As real fetch does: aborting the signal errors the body stream.
        signal.addEventListener('abort', () => { try { c.error(new DOMException('aborted', 'AbortError')); } catch {} });
        m.push = (n) => c.enqueue(new Uint8Array(n).fill(7)); m.end = () => c.close(); m.fail = () => c.error(new Error('net')); },
    });
    return new Response(body, { status, headers });
  };
  return m;
}

test('counts bytes and ends done', async () => {
  const m = mockFetch({ 'content-length': '30', 'content-type': 'audio/mpeg' });
  const d = new Download('a.mp3', () => {});
  await tick();
  m.push(10); await tick();
  assert.equal(d.share, 1 / 3);
  assert.equal(d.state, 'load');
  assert.equal(d.href, null);
  assert.equal(d.prefix().length, 10);
  m.push(10); m.push(10); m.end(); await tick();
  assert.equal(d.state, 'done');
  assert.equal(d.share, 1);
  assert.equal(d.blob.size, 30);
  assert.equal(d.blob.type, 'audio/mpeg');
  assert.ok(d.href.startsWith('blob:'));
  const h = d.href;
  assert.equal(d.href, h);
  URL.revokeObjectURL(h);
});

test('unknown length keeps share 0 until done', async () => {
  const m = mockFetch();
  const d = new Download('a.mp3', () => {});
  await tick();
  m.push(10); await tick();
  assert.equal(d.total, 0);
  assert.equal(d.got, 10);
  assert.equal(d.share, 0);
  m.end(); await tick();
  assert.equal(d.share, 1);
});

test('HTTP 404 and a stream error both give errr', async () => {
  mockFetch({}, 404);
  const a = new Download('a', () => {});
  await tick();
  assert.equal(a.state, 'errr');
  const m = mockFetch({ 'content-length': '30' });
  const b = new Download('b', () => {});
  await tick();
  m.push(10); m.fail(); await tick();
  assert.equal(b.state, 'errr');
  assert.equal(b.share, 0.0 + 10 / 30);
});

test('want() twice returns the same Download; after errr a new one', async () => {
  const m = mockFetch();
  const ds = new Downloads(() => {});
  const a = ds.want('x');
  assert.equal(ds.want('x'), a);
  assert.equal(ds.peek('x'), a);
  assert.equal(m.calls, 1);
  await tick();
  m.fail(); await tick();
  assert.equal(a.state, 'errr');
  const b = ds.want('x');
  assert.notEqual(b, a);
  assert.equal(m.calls, 2);
  ds.dispose();
});

test('dispose aborts and revokes; onChange is silent afterwards', async () => {
  const m = mockFetch({ 'content-length': '10' });
  let n = 0;
  const ds = new Downloads(() => n++);
  const done = ds.want('d');
  await tick();
  m.push(10); m.end(); await tick();
  const href = done.href;
  const m2 = mockFetch({ 'content-length': '10' });
  const live = ds.want('l');
  await tick();
  const revoked = [];
  const orig = URL.revokeObjectURL;
  URL.revokeObjectURL = (u) => { revoked.push(u); orig(u); };
  try {
    const before = n;
    ds.dispose();
    try { m2.push(5); } catch {}
    try { m2.fail(); } catch {}
    await tick();
    assert.ok(m2.signals[0].aborted);
    assert.deepEqual(revoked, [href]);
    assert.equal(live.state, 'load');
    assert.equal(n, before);
  } finally { URL.revokeObjectURL = orig; }
});
