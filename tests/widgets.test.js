// The hit list of a frame: a hit made inside a clip is cut to it, and a hit outside it is dropped.
// No browser needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hits } from '../site/js/widgets.js';

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
