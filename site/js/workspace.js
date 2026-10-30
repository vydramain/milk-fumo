// Workspace state: tile tree, pane registry, focus, maximized tile and message line. A pure reducer:
// no drawing, DOM or keyboard. reduce() returns a new state and never mutates its input.
// Invariant: the focused tile is the active tab of its leaf, so focus is always on a visible tab.
import { single, insertBeside, remove, stack, activate, toggleMaximize } from './layout.js';

// Type of a tile with no content yet; only such a tile can take a type by setType.
const EMPTY_TYPE = 'empty';

// Kinds of tile content; every pane records its type.
const TILE_TYPES = ['pmc', 'note', 'audio', 'video', 'app', 'image', EMPTY_TYPE];

// Command names accepted by reduce().
export const COMMANDS = {
  split: 'split',
  close: 'close',
  focus: 'focus',
  stack: 'stack',
  maximize: 'maximize',
  message: 'message',
  clearMessage: 'clearMessage',
  activate: 'activate',
  setType: 'setType',
};

// Ids are ID_PREFIX + counter; the first tile takes 1, so the counter starts at 2.
const ID_PREFIX = 'p';
const FIRST_ID = `${ID_PREFIX}1`;
const FIRST_NEXT_ID = 2;

function checkType(type, caller) {
  if (!TILE_TYPES.includes(type)) throw new Error(`${caller}: unknown tile type "${type}"`);
}

// An empty tile has no title; other tiles are titled by their type until a title command exists.
function newPane(type) {
  return { type, title: type === EMPTY_TYPE ? '' : type };
}

// Leaf that holds tab id, or null. Mirrors layout.js findLeaf, which is not exported.
function leafOf(node, id) {
  if (!node) return null;
  if (node.kind === 'leaf') return node.tabs.includes(id) ? node : null;
  return leafOf(node.a, id) ?? leafOf(node.b, id);
}

// Visible tab of the first leaf (leaves in order a, b), or null for an empty tree.
function firstVisibleTab(node) {
  if (!node) return null;
  if (node.kind === 'leaf') return node.tabs[node.active];
  return firstVisibleTab(node.a);
}

// Commands that act on the focused tile need one; the reason is reported when there is none.
function requireFocus(state, name) {
  if (state.focus === null) throw new Error(`${name}: no focused tile`);
  return state.focus;
}

export function createWorkspace(firstType) {
  checkType(firstType, 'createWorkspace');
  return {
    tree: single(FIRST_ID),
    panes: new Map([[FIRST_ID, newPane(firstType)]]),
    focus: FIRST_ID,
    maximized: null,
    nextId: FIRST_NEXT_ID,
    message: '',
  };
}

export function findPane(state, id) {
  return state.panes.get(id) ?? null;
}

export function focusedPane(state) {
  return findPane(state, state.focus);
}

function splitTile(state, { side, type }) {
  const target = requireFocus(state, COMMANDS.split);
  checkType(type, COMMANDS.split);
  const id = `${ID_PREFIX}${state.nextId}`;
  const tree = insertBeside(state.tree, target, id, side);
  const panes = new Map(state.panes).set(id, newPane(type));
  return { ...state, tree, panes, focus: id, nextId: state.nextId + 1 };
}

// Focus moves to the visible tab of the remaining tree; a closed maximized tile clears maximized.
function closeTile(state) {
  const id = requireFocus(state, COMMANDS.close);
  const tree = remove(state.tree, id);
  if (tree === null) return replaceWithEmpty(state);
  const panes = new Map(state.panes);
  panes.delete(id);
  const maximized = state.maximized === id ? null : state.maximized;
  return { ...state, tree, panes, focus: firstVisibleTab(tree), maximized };
}

// Closing the last tile leaves an empty tile, so the screen always has a tree.
function replaceWithEmpty(state) {
  const id = `${ID_PREFIX}${state.nextId}`;
  const panes = new Map([[id, newPane(EMPTY_TYPE)]]);
  return { ...state, tree: single(id), panes, focus: id, maximized: null, nextId: state.nextId + 1 };
}

// A tab hidden in a stack becomes active, so focus stays on a visible tab.
function focusTile(state, { id }) {
  if (!state.panes.has(id)) throw new Error(`focus: tile "${id}" not found`);
  const leaf = leafOf(state.tree, id);
  if (!leaf) throw new Error(`focus: tile "${id}" is not in the layout`);
  return { ...state, tree: activate(state.tree, id, leaf.tabs.indexOf(id)), focus: id };
}

// The moved tab becomes active in its target leaf, and focus follows it.
function stackTile(state, { id, target }) {
  return { ...state, tree: stack(state.tree, id, target), focus: id };
}

function maximizeFocus(state) {
  const id = requireFocus(state, COMMANDS.maximize);
  return { ...state, maximized: toggleMaximize(state.tree, state.maximized, id) };
}

function setMessage(state, { text }) {
  if (typeof text !== 'string') throw new Error('message: text must be a string');
  return { ...state, message: text };
}

function clearMessage(state) {
  return { ...state, message: '' };
}

// Focus moves to the tab that became active, so it stays on a visible tab.
function activateTab(state, { index }) {
  const id = requireFocus(state, COMMANDS.activate);
  const tree = activate(state.tree, id, index);
  const leaf = leafOf(tree, id);
  return { ...state, tree, focus: leaf.tabs[index] };
}

// Only an empty tile can take a type; it keeps its place and tabs.
function setFocusType(state, { type }) {
  const id = requireFocus(state, COMMANDS.setType);
  if (state.panes.get(id).type !== EMPTY_TYPE) throw new Error('setType: only an empty tile can open a type');
  if (type === EMPTY_TYPE) throw new Error(`setType: "${EMPTY_TYPE}" is not a type to open`);
  checkType(type, COMMANDS.setType);
  const panes = new Map(state.panes).set(id, newPane(type));
  return { ...state, panes };
}

// Command name -> handler(state, command); one table instead of a chain of ifs.
const HANDLERS = {
  [COMMANDS.split]: splitTile,
  [COMMANDS.close]: closeTile,
  [COMMANDS.focus]: focusTile,
  [COMMANDS.stack]: stackTile,
  [COMMANDS.maximize]: maximizeFocus,
  [COMMANDS.message]: setMessage,
  [COMMANDS.clearMessage]: clearMessage,
  [COMMANDS.activate]: activateTab,
  [COMMANDS.setType]: setFocusType,
};

export function reduce(state, command) {
  if (command === null || typeof command !== 'object') throw new Error('reduce: command must be an object');
  const { name } = command;
  if (!Object.hasOwn(HANDLERS, name)) throw new Error(`reduce: unknown command "${name}"`);
  return HANDLERS[name](state, command);
}
