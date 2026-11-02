// The tile layout: a tree, with no DOM. A split node divides its rectangle between a and b:
// axis 'h' puts a left of b, axis 'v' puts a above b. A leaf holds tabs (pane ids), one of them active.
// Tiles never overlap. The minimum sizes come from the panes through minOf(paneId) -> {w, h}.
import { CHROME, TILE_INSET, TILE_TOP, SPLITTER, TABS_H, TITLE_H, EDGE_SHARE } from './metrics.js';

export function leaf(tabs) {
  return { tabs, active: 0 };
}

export function split(axis, a, b) {
  return { axis, ratio: 0.5, a, b };
}

export function newLayout(root) {
  return { root, max: null };
}

function parentOf(node, target, parent = null) {
  if (node === target) return parent;
  if (node.tabs) return undefined;
  return parentOf(node.a, target, node) ?? parentOf(node.b, target, node);
}

function replaceNode(L, old, neu) {
  const p = parentOf(L.root, old);
  if (p === null) L.root = neu;
  else if (p.a === old) p.a = neu;
  else p.b = neu;
}

// The path from the root to the leaf that holds the pane, or null.
export function pathToPane(root, id) {
  const walk = (n, path) => {
    path.push(n);
    if (n.tabs ? n.tabs.includes(id) : walk(n.a, path) || walk(n.b, path)) return path;
    path.pop();
    return null;
  };
  return walk(root, []);
}

export function leafOf(root, id) {
  const path = pathToPane(root, id);
  return path ? path[path.length - 1] : null;
}

export function leavesOf(node, out = []) {
  if (!node) return out;
  if (node.tabs) out.push(node);
  else { leavesOf(node.a, out); leavesOf(node.b, out); }
  return out;
}

export function paneIds(node) {
  return leavesOf(node).flatMap((l) => l.tabs);
}

// Puts `newLeaf` beside `target` (after it, or before it), in a split of the given axis.
export function addBeside(L, target, axis, newLeaf, after) {
  const node = after ? split(axis, target, newLeaf) : split(axis, newLeaf, target);
  replaceNode(L, target, node);
}

// Removes a pane. An empty leaf goes, and its sibling takes the whole space of the parent.
export function removePane(L, id) {
  const path = pathToPane(L.root, id);
  if (!path) return;
  const target = path[path.length - 1];
  target.tabs.splice(target.tabs.indexOf(id), 1);
  target.active = Math.min(target.active, Math.max(0, target.tabs.length - 1));
  if (L.max === id) L.max = null;
  if (target.tabs.length === 0) removeLeaf(L, target);
}

function removeLeaf(L, target) {
  if (L.root === target) { L.root = null; return; }
  const p = parentOf(L.root, target);
  replaceNode(L, p, p.a === target ? p.b : p.a);
}

function addTab(target, id) {
  target.tabs.push(id);
  target.active = target.tabs.length - 1;
}

// Moves a pane onto a target leaf: as a tab, or into a new tile beside the target at a side.
export function movePane(L, id, target, side) {
  const source = leafOf(L.root, id);
  if (source === target && (side === 'stack' || source.tabs.length === 1)) return false;
  removePane(L, id);
  if (side === 'stack') { addTab(target, id); return true; }
  const axis = side === 'left' || side === 'right' ? 'h' : 'v';
  addBeside(L, target, axis, leaf([id]), side === 'right' || side === 'bottom' || side === 'down');
  return true;
}

// The minimum size of a node: a tile holds the largest minimum of its tabs plus its chrome, the tab strip included.
export function minSize(node, minOf) {
  if (node.tabs) {
    let w = 0, h = 0;
    for (const id of node.tabs) {
      const m = minOf(id);
      w = Math.max(w, m.w);
      h = Math.max(h, m.h);
    }
    return { w: w + CHROME.w, h: h + CHROME.h };
  }
  const a = minSize(node.a, minOf), b = minSize(node.b, minOf);
  return node.axis === 'h'
    ? { w: a.w + b.w + SPLITTER, h: Math.max(a.h, b.h) }
    : { w: Math.max(a.w, b.w), h: a.h + b.h + SPLITTER };
}

// Places the tree in a rectangle. A split keeps its ratio, but never goes past a minimum.
// Returns the tile rectangles, the splitters and the splits, all in tree order.
export function place(root, rect, minOf) {
  const out = { leaves: [], splitters: [], splits: [] };
  const walk = (node, r) => {
    if (node.tabs) { out.leaves.push({ node, rect: r }); return; }
    const h = node.axis === 'h';
    const avail = (h ? r.w : r.h) - SPLITTER;
    const minA = minSize(node.a, minOf)[h ? 'w' : 'h'];
    const minB = minSize(node.b, minOf)[h ? 'w' : 'h'];
    const size = Math.min(Math.max(Math.round(avail * node.ratio), minA), Math.max(minA, avail - minB));
    const first = h ? { x: r.x, y: r.y, w: size, h: r.h } : { x: r.x, y: r.y, w: r.w, h: size };
    const bar = h ? { x: r.x + size, y: r.y, w: SPLITTER, h: r.h } : { x: r.x, y: r.y + size, w: r.w, h: SPLITTER };
    const second = h
      ? { x: r.x + size + SPLITTER, y: r.y, w: avail - size, h: r.h }
      : { x: r.x, y: r.y + size + SPLITTER, w: r.w, h: avail - size };
    out.splits.push({ node, rect: r, avail, size, minA, minB });
    out.splitters.push({ node, axis: node.axis, rect: bar });
    walk(node.a, first);
    walk(node.b, second);
  };
  if (root) walk(root, rect);
  return out;
}

// The inside of a tile: between the title bar and the tab strip.
export function contentRect(tile) {
  return { x: tile.x + TILE_INSET, y: tile.y + TILE_TOP, w: tile.w - CHROME.w, h: tile.h - CHROME.h };
}

export function titleRect(tile) {
  return { x: tile.x + TILE_INSET, y: tile.y + TILE_INSET, w: tile.w - CHROME.w, h: TITLE_H };
}

// The tab strip: the bottom 14 px of the tile, inside its 2 px of padding and frame.
export function tabsRect(tile) {
  return { x: tile.x + TILE_INSET, y: tile.y + tile.h - TILE_INSET - TABS_H, w: tile.w - CHROME.w, h: TABS_H };
}

export function inside(r, x, y) {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}

// The nearest tile in a direction: adjacent on that side, and sharing some of the same span.
export function neighborIn(leaves, from, dir) {
  const cur = from.rect;
  let best = null, bestDist = Infinity;
  for (const l of leaves) {
    const r = l.rect;
    if (l === from) continue;
    const overlapV = r.y < cur.y + cur.h && r.y + r.h > cur.y;
    const overlapH = r.x < cur.x + cur.w && r.x + r.w > cur.x;
    let gap;
    if (dir === 'left' && overlapV && r.x + r.w <= cur.x) gap = cur.x - (r.x + r.w);
    else if (dir === 'right' && overlapV && r.x >= cur.x + cur.w) gap = r.x - (cur.x + cur.w);
    else if (dir === 'up' && overlapH && r.y + r.h <= cur.y) gap = cur.y - (r.y + r.h);
    else if (dir === 'down' && overlapH && r.y >= cur.y + cur.h) gap = r.y - (cur.y + cur.h);
    else continue;
    if (gap < bestDist) { best = l; bestDist = gap; }
  }
  return best;
}

// Where a dropped title bar lands: a side of a tile near its edge, or stacked into its tabs.
export function dropTarget(leaves, x, y) {
  for (const l of leaves) {
    const r = l.rect;
    if (!inside(r, x, y)) continue;
    if (inside(tabsRect(r), x, y)) return { leaf: l.node, side: 'stack', rect: r };
    const fx = (x - r.x) / r.w, fy = (y - r.y) / r.h;
    const dists = { left: fx, right: 1 - fx, top: fy, bottom: 1 - fy };
    const side = Object.keys(dists).reduce((a, b) => (dists[b] < dists[a] ? b : a));
    return { leaf: l.node, side: dists[side] < EDGE_SHARE ? side : 'stack', rect: r };
  }
  return null;
}

// The rectangle a drop would fill: a half of the tile for a side, the whole tile for a stack.
export function dropPreview(drop) {
  const r = drop.rect;
  if (drop.side === 'stack') return r;
  if (drop.side === 'left') return { x: r.x, y: r.y, w: r.w / 2, h: r.h };
  if (drop.side === 'right') return { x: r.x + r.w / 2, y: r.y, w: r.w / 2, h: r.h };
  if (drop.side === 'top') return { x: r.x, y: r.y, w: r.w, h: r.h / 2 };
  return { x: r.x, y: r.y + r.h / 2, w: r.w, h: r.h / 2 };
}

// The border an arrow moves: the nearest split on the arrow's axis. Right and down move that border forward,
// so the first part grows by 1 and the second shrinks; left and up move it back. A tile can grow or shrink
// whichever side of the border it is on.
export function resizeTarget(root, id, dir) {
  const path = pathToPane(root, id);
  if (!path) return null;
  const axis = dir === 'left' || dir === 'right' ? 'h' : 'v';
  const forward = dir === 'right' || dir === 'down';
  for (let i = path.length - 2; i >= 0; i--) {
    if (path[i].axis === axis) return { node: path[i], sign: forward ? 1 : -1 };
  }
  return null;
}
