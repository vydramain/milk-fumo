// The hit list of a frame: a hit made inside a clip is cut to it, and a hit outside it is dropped.
// No browser needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hits, loadBar, keyBar } from '../site/js/widgets.js';
import { C } from '../site/js/theme.js';

test('a hit made inside a clip is cut to the clip; one outside it is dropped', () => {
  const hits = new Hits();
  const tile = { x: 10, y: 10, w: 100, h: 50 };
  hits.clip(tile);
  hits.add({ x: 90, y: 20, w: 40, h: 10 }, { click: () => {} });   // reaches past the right edge
  hits.add({ x: 200, y: 20, w: 10, h: 10 }, { click: () => {} });  // outside the tile altogether
  hits.unclip();
  assert.equal(hits.list.length, 1);
  assert.deepEqual(hits.list[0].r, { x: 90, y: 20, w: 20, h: 10 });
});

test('a hit made after the clip is taken away reaches as far as it was drawn', () => {
  const hits = new Hits();
  hits.clip({ x: 0, y: 0, w: 10, h: 10 });
  hits.unclip();
  hits.add({ x: 50, y: 50, w: 10, h: 10 }, { click: () => {} });
  assert.deepEqual(hits.list[0].r, { x: 50, y: 50, w: 10, h: 10 });
});

// A recording Paint: every call is kept as [name, ...args].
function fake() {
  const calls = [];
  const p = {};
  for (const n of ['fill', 'text', 'bevel', 'dither', 'clip', 'unclip']) p[n] = (...a) => calls.push([n, ...a]);
  return { p, calls };
}

test('loadBar at share 0.5 fills floor(0.5*35)=17 px of checker, the word in two colors', () => {
  const { p, calls } = fake();
  loadBar(p, 10, 20, { state: 'load', share: 0.5 });
  assert.equal(calls.find((c) => c[0] === 'dither')[1].w, 17);
  const words = calls.filter((c) => c[0] === 'text');
  assert.equal(words.length, 2);
  assert.ok(words.every((c) => c[4] === 'load'));
  assert.deepEqual(words.map((c) => c[5]).sort(), [C.bright, C.dark].sort());
  assert.equal(calls.find((c) => c[0] === 'clip')[1].w, 17);
});

test('loadBar done fills 35 and errr fills 0', () => {
  const a = fake(), b = fake();
  loadBar(a.p, 0, 0, { state: 'done', share: 1 });
  loadBar(b.p, 0, 0, { state: 'errr', share: 0.9 });
  assert.equal(a.calls.find((c) => c[0] === 'dither')[1].w, 35);
  assert.equal(b.calls.find((c) => c[0] === 'dither'), undefined);
  assert.ok(a.calls.some((c) => c[0] === 'text' && c[4] === 'done'));
  assert.ok(b.calls.some((c) => c[0] === 'text' && c[4] === 'errr'));
});

test('loadBar(null) draws nothing', () => {
  const { p, calls } = fake();
  loadBar(p, 0, 0, null);
  assert.equal(calls.length, 0);
});

test('keyBar makes one click hit per cell with click, cells of equal width 2 px apart', () => {
  const { p } = fake();
  const hits = new Hits();
  const cells = [
    { key: 'A', label: 'a', codes: ['KeyA'], click: () => {} },
    { key: 'B', label: 'b', codes: ['KeyB'] },
    { key: 'C', label: 'c', codes: ['KeyC'], click: () => {} },
  ];
  keyBar(p, hits, { x: 0, y: 0, w: 300, h: 14 }, cells, new Set());
  assert.equal(hits.list.length, 2);
  assert.deepEqual(hits.list.map((h) => [h.r.x, h.r.w]), [[0, 98], [200, 98]]);
});

test('keyBar draws a held cell sunken', () => {
  const { p, calls } = fake();
  const cells = [{ key: 'Space', label: 'Play', codes: ['Space'] }, { key: 'S', label: 'Stop', codes: ['KeyS'] }];
  keyBar(p, new Hits(), { x: 0, y: 0, w: 200, h: 14 }, cells, new Set(['Space']));
  const b = calls.filter((c) => c[0] === 'bevel');
  assert.equal(b.length, 2);
  assert.equal(b[0][3], false);
  assert.equal(b[1][3], true);
});

test('keyBar cuts a name that does not fit to two letters, and the key makes room for them', () => {
  const { p, calls } = fake();
  const cells = [{ key: 'Space', label: 'Play', codes: [] }, { key: 'Up/Down', label: 'Volume', codes: [] }, { key: 'N', label: 'Next', codes: [] }];
  keyBar(p, new Hits(), { x: 0, y: 0, w: 3 * 64 + 4, h: 14 }, cells, new Set());
  assert.ok(JSON.stringify(calls).includes('"Pl"'));
  assert.ok(JSON.stringify(calls).includes('"Vo"'));
  assert.ok(JSON.stringify(calls).includes('"Next"'));
  assert.ok(!JSON.stringify(calls).includes('"Pla"'));
});

test('keyBar keeps at least one letter of the key in a narrow cell', () => {
  const { p, calls } = fake();
  keyBar(p, new Hits(), { x: 0, y: 0, w: 29, h: 14 }, [{ key: 'P', label: 'Prev', codes: [] }], new Set());
  assert.ok(JSON.stringify(calls).includes('"P"'));
});
