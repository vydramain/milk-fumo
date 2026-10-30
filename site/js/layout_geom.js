// Tile geometry: minimum sizes, placement and hit testing of a layout tree. Pure: no drawing, no DOM, no tree changes.
// Sizes are in CSS pixels; rect is { x, y, w, h }.
import { SPLITTER } from './metrics.js';

// Size key along a split axis: 'h' splits left and right, so its children add up in width.
const SIZE_KEY = { h: 'w', v: 'h' };

// Half a pixel step: a ratio at the middle of a size step makes Math.floor give that size exactly.
const HALF_STEP = 0.5;

// Smallest width or height of the rect to place into; a zero-size rect has nothing to lay out.
const MIN_RECT_SIDE = 1;

// Leaf that holds tabId, or null.
function leafOf(node, tabId) {
  if (!node) return null;
  if (node.kind === 'leaf') return node.tabs.includes(tabId) ? node : null;
  return leafOf(node.a, tabId) ?? leafOf(node.b, tabId);
}

// Largest tab minimum of a leaf, per side.
function leafMin(leaf, tabMin) {
  return leaf.tabs.reduce((acc, tabId) => {
    const min = tabMin(tabId);
    return { w: Math.max(acc.w, min.w), h: Math.max(acc.h, min.h) };
  }, { w: 0, h: 0 });
}

// Space the two children share along the axis: the rect minus the splitter, never negative.
function splitTotal(rect, axis) {
  return Math.max(0, rect[SIZE_KEY[axis]] - SPLITTER);
}

// Rects of both children and of the splitter; first and second are the child sizes along the axis.
function splitRects(rect, axis, first, second) {
  const { x, y, w, h } = rect;
  if (axis === 'h') {
    return {
      a: { x, y, w: first, h },
      splitter: { x: x + first, y, w: SPLITTER, h },
      b: { x: x + first + SPLITTER, y, w: second, h },
    };
  }
  return {
    a: { x, y, w, h: first },
    splitter: { x, y: y + first, w, h: SPLITTER },
    b: { x, y: y + first + SPLITTER, w, h: second },
  };
}

// Ratio at which place() gives the first child exactly size of total.
function ratioForSize(size, total) {
  return total > 0 ? Math.min(1, (size + HALF_STEP) / total) : 0;
}

// Ratio of a split: a finite number from 0 to 1.
function isRatio(ratio) {
  return Number.isFinite(ratio) && ratio >= 0 && ratio <= 1;
}

// Appends the records of node placed in rect; path is the 'a' / 'b' route from the root to node.
function placeNode(node, rect, path, out) {
  if (node.kind === 'leaf') {
    out.push({ kind: 'tile', tabId: node.tabs[node.active], rect });
    return;
  }
  if (!isRatio(node.ratio)) throw new Error(`place: split ratio ${node.ratio} must be a finite number from 0 to 1`);
  if (!Object.hasOwn(SIZE_KEY, node.axis)) throw new Error(`place: unknown split axis "${node.axis}"`);
  const axisSize = rect[SIZE_KEY[node.axis]];
  if (axisSize < SPLITTER) throw new Error(`place: split at ${JSON.stringify(path)} is shorter than the splitter`);
  const total = splitTotal(rect, node.axis);
  const first = Math.floor(total * node.ratio);
  const rects = splitRects(rect, node.axis, first, total - first);
  out.push({ kind: 'splitter', axis: node.axis, rect: rects.splitter, path });
  placeNode(node.a, rects.a, [...path, 'a'], out);
  placeNode(node.b, rects.b, [...path, 'b'], out);
}

// Rect with integer x, y and w, h of at least MIN_RECT_SIDE.
function isRect(rect) {
  const ints = ['x', 'y', 'w', 'h'].every((key) => Number.isInteger(rect?.[key]));
  return ints && rect.w >= MIN_RECT_SIDE && rect.h >= MIN_RECT_SIDE;
}

// Only the tile that holds tabId, on the whole rect; it shows its active tab.
function placeMaximized(node, rect, tabId) {
  const leaf = leafOf(node, tabId);
  if (!leaf) throw new Error(`place: maximized tile "${tabId}" not found`);
  return [{ kind: 'tile', tabId: leaf.tabs[leaf.active], rect }];
}

// Minimum size { w, h } of a node. A leaf takes the largest minimum of its tabs; a split adds the splitter
// along its axis and takes the largest across it. tabMin(tabId) gives one tab's minimum with its frame.
export function minSize(node, tabMin) {
  if (!node) return { w: 0, h: 0 };
  if (node.kind === 'leaf') return leafMin(node, tabMin);
  const a = minSize(node.a, tabMin);
  const b = minSize(node.b, tabMin);
  return node.axis === 'h'
    ? { w: a.w + b.w + SPLITTER, h: Math.max(a.h, b.h) }
    : { w: Math.max(a.w, b.w), h: a.h + b.h + SPLITTER };
}

// Tile and splitter records for the tree in rect, or only the maximized tile. Precondition: rect >= minSize(node, tabMin).
export function place(node, rect, maximized) {
  if (!isRect(rect)) throw new Error('place: rect must have integer x, y and w, h of at least 1');
  if (maximized !== null) return placeMaximized(node, rect, maximized);
  if (!node) return [];
  const out = [];
  placeNode(node, rect, [], out);
  return out;
}

// Ratio of a split moved to the nearest value that keeps both children at their minimums along the axis.
// Precondition: rect is at least minSize(node, tabMin) along the axis; the caller checks it with minSize.
// Null returns ratio as is. Throws on a leaf (no border), an unknown split axis or a non-finite ratio.
export function clampRatio(node, rect, tabMin, ratio) {
  if (!node) return ratio;
  if (node.kind === 'leaf') throw new Error('clampRatio: a leaf has no border to move');
  if (!Object.hasOwn(SIZE_KEY, node.axis)) throw new Error(`clampRatio: unknown split axis "${node.axis}"`);
  if (!Number.isFinite(ratio)) throw new Error(`clampRatio: ratio ${ratio} must be a finite number`);
  const key = SIZE_KEY[node.axis];
  const total = splitTotal(rect, node.axis);
  const low = minSize(node.a, tabMin)[key];
  const high = Math.max(low, total - minSize(node.b, tabMin)[key]);
  const desired = Math.floor(total * ratio);
  const size = Math.min(Math.max(desired, low), high);
  return size === desired ? ratio : ratioForSize(size, total);
}

// Record of placed that holds the point (x, y): a splitter first, then a tile; null if none does.
export function hitTest(placed, x, y) {
  const inside = (item) => {
    const { rect } = item;
    return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
  };
  const splitter = placed.find((item) => item.kind === 'splitter' && inside(item));
  if (splitter) return splitter;
  return placed.find((item) => item.kind === 'tile' && inside(item)) ?? null;
}
