// The layout is pure: these tests need no browser. Run with: npm test (node --test tests/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../site/js/layout.js';
import { CHROME, TABS_STRIP, PANE_MIN, SPLITTER } from '../site/js/metrics.js';

const min = { a: PANE_MIN.generic, b: PANE_MIN.generic, c: PANE_MIN.app };
const minOf = (id) => min[id];
const area = { x: 4, y: 4, w: 1001, h: 600 };

test('a new tile shares the space 1:1', () => {
  const root = L.split('h', L.leaf(['a']), L.leaf(['b']));
  const p = L.place(root, area, minOf);
  const [ra, rb] = p.leaves.map((l) => l.rect);
  assert.equal(ra.w + SPLITTER + rb.w, area.w);
  assert.ok(Math.abs(ra.w - rb.w) <= 1, `widths ${ra.w} and ${rb.w}`);
});

test('a split never goes past the minimum of a side', () => {
  const root = L.split('h', L.leaf(['c']), L.leaf(['b']));
  root.ratio = 0.01;
  const p = L.place(root, area, minOf);
  assert.equal(p.leaves[0].rect.w, PANE_MIN.app.w + CHROME.w);
});

test('a closed tile gives its space back to its neighbor', () => {
  const layout = L.newLayout(L.split('h', L.leaf(['a']), L.leaf(['b'])));
  L.removePane(layout, 'a');
  assert.deepEqual(L.paneIds(layout.root), ['b']);
  assert.equal(layout.root.tabs.length, 1);
});

test('the minimum of a tile is its pane plus the frame, and a stack adds the tab strip', () => {
  const one = L.minSize(L.leaf(['a']), minOf);
  assert.deepEqual(one, { w: PANE_MIN.generic.w + CHROME.w, h: PANE_MIN.generic.h + CHROME.h });
  const stacked = L.minSize(L.leaf(['a', 'b']), minOf);
  assert.equal(stacked.h, one.h + TABS_STRIP);
});

test('a dropped title bar near an edge makes a neighbor; in the middle it stacks', () => {
  const leaves = L.place(L.split('h', L.leaf(['a']), L.leaf(['b'])), area, minOf).leaves;
  const left = leaves[0].rect;
  assert.equal(L.dropTarget(leaves, left.x + 2, left.y + left.h / 2).side, 'left');
  assert.equal(L.dropTarget(leaves, left.x + left.w / 2, left.y + left.h / 2).side, 'stack');
});

test('an arrow moves the border on its side: right grows the first part when the tile is in it', () => {
  const root = L.split('h', L.leaf(['a']), L.leaf(['b']));
  assert.equal(L.resizeTarget(root, 'a', 'right').sign, 1);
  assert.equal(L.resizeTarget(root, 'b', 'left').sign, -1);
  assert.equal(L.resizeTarget(root, 'a', 'left'), null);
});

test('moving a pane into a stack keeps one leaf with two tabs', () => {
  const layout = L.newLayout(L.split('h', L.leaf(['a']), L.leaf(['b'])));
  L.movePane(layout, 'a', L.leafOf(layout.root, 'b'), 'stack');
  assert.deepEqual(L.paneIds(layout.root), ['b', 'a']);
  assert.equal(L.leavesOf(layout.root).length, 1);
});
