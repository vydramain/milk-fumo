// Tile layout tree: a pure model of splits and tab leaves, no drawing or DOM. Errors are thrown with the reason.
// Every tree operation returns a new tree and never mutates its input; unchanged subtrees are shared.
//
// Split: { kind: 'split', axis: 'h' | 'v', ratio, a, b }, where ratio is the share of child a.
// Leaf: { kind: 'leaf', tabs: [tab id, ...], active: index }. A tile is a leaf; its tabs are tab ids.
// The tree is null when empty. The caller keeps the maximized id; it clears it when remove() is called with that id.

// A new tile shares the space of its neighbor 1:1.
const NEW_TILE_RATIO = 0.5;

// Side of the target -> split axis, and whether the placed leaf is the first child (a).
const SIDES = {
  left: { axis: 'h', newFirst: true },
  right: { axis: 'h', newFirst: false },
  top: { axis: 'v', newFirst: true },
  bottom: { axis: 'v', newFirst: false },
};

// Leaf that holds tab tabId, or null.
function findLeaf(node, tabId) {
  if (!node) return null;
  if (node.kind === 'leaf') return node.tabs.includes(tabId) ? node : null;
  return findLeaf(node.a, tabId) ?? findLeaf(node.b, tabId);
}

// Replaces the leaf that holds tabId with fn(leaf); other subtrees are shared.
function mapLeaf(node, tabId, fn) {
  if (node.kind === 'leaf') return node.tabs.includes(tabId) ? fn(node) : node;
  const a = mapLeaf(node.a, tabId, fn);
  const b = mapLeaf(node.b, tabId, fn);
  return a === node.a && b === node.b ? node : { ...node, a, b };
}

// Removes tab id. A leaf left empty becomes null, so its split is replaced by the sibling.
function removeTab(node, id) {
  if (node.kind === 'leaf') {
    if (!node.tabs.includes(id)) return node;
    const index = node.tabs.indexOf(id);
    const tabs = node.tabs.filter((tab) => tab !== id);
    if (tabs.length === 0) return null;
    // A removed tab before the active one shifts the active index back, so the same tab stays active.
    const shifted = index < node.active ? node.active - 1 : node.active;
    return { kind: 'leaf', tabs, active: Math.min(shifted, tabs.length - 1) };
  }
  const a = removeTab(node.a, id);
  const b = removeTab(node.b, id);
  if (a === node.a && b === node.b) return node;
  if (a === null) return b;
  if (b === null) return a;
  return { ...node, a, b };
}

// Removes the whole leaf object (all its tabs) by identity; the sibling takes its place.
function removeLeaf(node, leaf) {
  if (node === leaf) return null;
  if (node.kind === 'leaf') return node;
  const a = removeLeaf(node.a, leaf);
  const b = removeLeaf(node.b, leaf);
  if (a === node.a && b === node.b) return node;
  if (a === null) return b;
  if (b === null) return a;
  return { ...node, a, b };
}

// Splits the leaf of targetId 1:1 and puts the given leaf on the side.
function placeBeside(tree, targetId, leaf, side) {
  const { axis, newFirst } = SIDES[side];
  return mapLeaf(tree, targetId, (target) => ({
    kind: 'split',
    axis,
    ratio: NEW_TILE_RATIO,
    a: newFirst ? leaf : target,
    b: newFirst ? target : leaf,
  }));
}

// Tree for an empty screen: the only way to create the first tile (insertBeside needs a target).
export function single(id) {
  if (typeof id !== 'string' || id === '') throw new Error('single: tab id must be a non-empty string');
  return { kind: 'leaf', tabs: [id], active: 0 };
}

// Splits the leaf of targetId 1:1; the new tile takes the given side.
export function insertBeside(tree, targetId, newId, side) {
  if (!Object.hasOwn(SIDES, side)) throw new Error(`insertBeside: unknown side "${side}"`);
  if (typeof newId !== 'string' || newId === '') throw new Error('insertBeside: new tab id must be a non-empty string');
  if (findLeaf(tree, newId)) throw new Error(`insertBeside: tile "${newId}" already exists`);
  if (!findLeaf(tree, targetId)) throw new Error(`insertBeside: target tile "${targetId}" not found`);
  return placeBeside(tree, targetId, { kind: 'leaf', tabs: [newId], active: 0 }, side);
}

// Moves the whole leaf of id (all its tabs) beside the leaf of targetId, as insertBeside places it.
export function moveBeside(tree, id, targetId, side) {
  if (!Object.hasOwn(SIDES, side)) throw new Error(`moveBeside: unknown side "${side}"`);
  const from = findLeaf(tree, id);
  const to = findLeaf(tree, targetId);
  if (!from) throw new Error(`moveBeside: tile "${id}" not found`);
  if (!to) throw new Error(`moveBeside: target tile "${targetId}" not found`);
  if (from === to) throw new Error(`moveBeside: tile "${id}" is already in the leaf of "${targetId}"`);
  return placeBeside(removeLeaf(tree, from), targetId, from, side);
}

// Removes tab id; the space of an emptied leaf goes to its neighbor. Removing the last tile gives null.
export function remove(tree, id) {
  if (!findLeaf(tree, id)) throw new Error(`remove: tile "${id}" not found`);
  return removeTab(tree, id);
}

// Moves tab id into the leaf of targetId and makes it active.
export function stack(tree, id, targetId) {
  const from = findLeaf(tree, id);
  const to = findLeaf(tree, targetId);
  if (!from) throw new Error(`stack: tile "${id}" not found`);
  if (!to) throw new Error(`stack: target tile "${targetId}" not found`);
  if (from === to) throw new Error(`stack: tile "${id}" is already in the same leaf as "${targetId}"`);
  const rest = removeTab(tree, id);
  return mapLeaf(rest, targetId, (leaf) => ({ kind: 'leaf', tabs: [...leaf.tabs, id], active: leaf.tabs.length }));
}

// Makes the tab with index active in the leaf that holds tabId.
export function activate(tree, tabId, index) {
  const leaf = findLeaf(tree, tabId);
  if (!leaf) throw new Error(`activate: tile "${tabId}" not found`);
  const inRange = Number.isInteger(index) && index >= 0 && index < leaf.tabs.length;
  if (!inRange) throw new Error(`activate: tab index ${index} out of range`);
  return mapLeaf(tree, tabId, (node) => ({ ...node, active: index }));
}

// Sets the ratio of the split at path ('a' / 'b' steps from the root); ratio is clamped to [0, 1] inclusive.
// Minimum sizes are not checked here: min_size (next task) holds them. Non-finite values throw.
export function setRatio(tree, path, ratio) {
  if (!Number.isFinite(ratio)) throw new Error('setRatio: ratio must be a finite number');
  return setAt(tree, path, 0, Math.min(1, Math.max(0, ratio)));
}

// Walks path from node; the node reached at the end of path must be a split.
function setAt(node, path, depth, ratio) {
  if (!node || node.kind !== 'split') throw new Error(`setRatio: no split at depth ${depth}`);
  if (depth === path.length) return { ...node, ratio };
  const side = path[depth];
  if (side !== 'a' && side !== 'b') throw new Error(`setRatio: bad path step "${side}"`);
  return { ...node, [side]: setAt(node[side], path, depth + 1, ratio) };
}

// Returns the new maximized value: null if id was maximized, otherwise id. Does not change the tree.
export function toggleMaximize(tree, maximized, id) {
  if (maximized === id) return null;
  if (!findLeaf(tree, id)) throw new Error(`toggleMaximize: tile "${id}" not found`);
  return id;
}
