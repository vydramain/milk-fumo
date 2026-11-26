import assert from 'node:assert/strict';
import test from 'node:test';

import { CONTENT_ROOT } from '../docs/design-system/config.js';

globalThis.location = new URL('https://design-system.test/');
globalThis.window = { fetch: (...args) => fetch(...args) };

const { NET } = await import('../docs/design-system/net.js');
const fixture = CONTENT_ROOT + 'notes/short.md';
const nextTurn = () => new Promise((done) => setImmediate(done));

test('Fast download fails if the network goes Offline during transfer', async (t) => {
  let upstream;
  let cancelled = false;
  const source = new ReadableStream({
    start(controller) { upstream = controller; },
    cancel() { cancelled = true; },
  });
  t.mock.method(globalThis, 'fetch', async () => new Response(source));
  NET.mode = 'fast';

  const response = await window.fetch(fixture);
  const reader = response.body.getReader();
  const first = Uint8Array.of(1);
  upstream.enqueue(first);
  assert.deepEqual((await reader.read()).value, first);

  const pending = reader.read();
  NET.mode = 'offline';
  if (!cancelled) {
    upstream.enqueue(Uint8Array.of(2));
    upstream.close();
  }
  await assert.rejects(pending, TypeError);
});

test('going Offline interrupts a Fast download before its headers arrive', async (t) => {
  const { promise: headers, resolve: sendHeaders } = Promise.withResolvers();
  t.mock.method(globalThis, 'fetch', () => headers);
  NET.mode = 'fast';

  const pending = window.fetch(fixture);
  NET.mode = 'offline';
  NET.mode = 'fast';
  sendHeaders(new Response(Uint8Array.of(1)));

  await assert.rejects(async () => (await pending).arrayBuffer(), TypeError);
});

test('switching Slow to Fast releases a chunk waiting for the old transfer rate', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const chunk = new Uint8Array(4096);
  t.mock.method(globalThis, 'fetch', async () => new Response(chunk));
  NET.mode = 'slow';

  const response = await window.fetch(fixture);
  let result;
  response.body.getReader().read().then((part) => { result = part; });
  await nextTurn();
  assert.equal(result, undefined, 'Slow is still pacing the first chunk');

  NET.mode = 'fast';
  await nextTurn();
  assert.equal(result?.value?.byteLength, chunk.byteLength, 'Fast releases the pending chunk without waiting for the old rate');
});
