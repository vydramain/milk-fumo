import { kindOf, entryPath, KIND, ENTRY_DIRECTORY } from './catalog.js';

// Logic of the two-panel file manager (pmc). Pure: listings come from the caller, nothing is drawn or fetched.
// Every function returns a new state and never mutates its input. Panels are 0 and 1.
// Rows: outside the root, row 0 is the ".." row and the entries follow it; at the root the rows are the entries.

const ROOT_PATH = ''; // path of the content root
const SEPARATOR = '/';
const NOT_FOUND = -1;

function compareNames(a, b) {
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

// Folders first, then files; each group by name without regard to case. Returns a new array.
export function sortEntries(entries) {
  const folders = entries.filter((entry) => entry.type === ENTRY_DIRECTORY).sort(compareNames);
  const files = entries.filter((entry) => entry.type !== ENTRY_DIRECTORY).sort(compareNames);
  return folders.concat(files);
}

// entries must already be sorted.
function makePanel(path, entries) {
  return { path, entries, cursor: 0, top: 0, quick: false, search: '' };
}

// Rows before the entries: the ".." row, absent at the root.
function upRows(path) {
  return path === ROOT_PATH ? 0 : 1;
}

function rowCount(path, entries) {
  return upRows(path) + entries.length;
}

function clampCursor(index, count) {
  return Math.max(0, Math.min(index, count - 1));
}

function activePanel(state) {
  return state.panels[state.active];
}

// Replaces the panel at index with the panel merged with change(panel).
function patchPanel(state, index, change) {
  const panels = state.panels.map((panel, i) => (i === index ? { ...panel, ...change(panel) } : panel));
  return { ...state, panels };
}

function patchActive(state, change) {
  return patchPanel(state, state.active, change);
}

// Both panels start at the content root with the same listing.
export function createPmc(rootEntries) {
  const entries = sortEntries(rootEntries);
  return { panels: [makePanel(ROOT_PATH, entries), makePanel(ROOT_PATH, entries)], active: 0 };
}

// Moves the cursor of the active panel. The search is reset; the inactive cursor stays.
export function moveCursor(state, delta) {
  return patchActive(state, (panel) => ({
    cursor: clampCursor(panel.cursor + delta, rowCount(panel.path, panel.entries)),
    search: '',
  }));
}

// Click on a row of the active panel.
export function setCursor(state, index) {
  return patchActive(state, (panel) => ({
    cursor: clampCursor(index, rowCount(panel.path, panel.entries)),
    search: '',
  }));
}

// Tab. The panel being left loses its search; the panel that becomes active leaves quick view, as in the prototype.
export function switchPanel(state) {
  const active = 1 - state.active;
  const left = patchActive(state, () => ({ search: '' }));
  return { ...patchPanel(left, active, () => ({ quick: false })), active };
}

// Enters the folder name of the active panel; childEntries is its listing from the caller.
// Apps (folders ending in .exe) are not entered: the caller launches them.
export function enterFolder(state, childEntries, name) {
  const panel = activePanel(state);
  const entry = panel.entries.find((item) => item.name === name);
  if (!entry) {
    throw new Error(`"${name}" is not in ${panel.path || 'the content root'}`);
  }
  if (kindOf(entry) !== KIND.FOLDER) {
    throw new Error(`"${name}" is not a folder to enter (kind ${kindOf(entry)})`);
  }
  return patchActive(state, () => ({
    path: entryPath(panel.path, name),
    entries: sortEntries(childEntries),
    cursor: 0,
    top: 0,
    search: '',
  }));
}

// Moves the active panel to its parent; the cursor stands on the folder just left.
// parentEntries is the parent's listing from the caller.
export function goUp(state, parentEntries) {
  const panel = activePanel(state);
  if (panel.path === ROOT_PATH) {
    throw new Error('The content root has no parent folder');
  }
  const cut = panel.path.lastIndexOf(SEPARATOR);
  const parentPath = cut < 0 ? ROOT_PATH : panel.path.slice(0, cut);
  const leftName = panel.path.slice(cut + 1);
  const entries = sortEntries(parentEntries);
  // A folder that is gone from the listing gives index -1: the cursor then clamps to the first row.
  const index = entries.findIndex((entry) => entry.name === leftName);
  return patchActive(state, () => ({
    path: parentPath,
    entries,
    cursor: clampCursor(index + upRows(parentPath), rowCount(parentPath, entries)),
    top: 0,
    search: '',
  }));
}

// F3: the inactive panel becomes a quick view of the active panel's cursor entry; again to go back.
// The active panel's search is reset.
export function toggleQuick(state) {
  const toggled = patchPanel(state, 1 - state.active, (panel) => ({ quick: !panel.quick }));
  return patchActive(toggled, () => ({ search: '' }));
}

// A letter typed in the active panel: search by the start of a name, case-insensitive.
// The cursor goes to the first match. With no match the state is returned unchanged: the letter is ignored.
export function appendSearch(state, ch) {
  const panel = activePanel(state);
  const search = panel.search + ch.toLowerCase();
  const index = panel.entries.findIndex((entry) => entry.name.toLowerCase().startsWith(search));
  if (index === NOT_FOUND) {
    return state;
  }
  return patchActive(state, () => ({ search, cursor: index + upRows(panel.path) }));
}

// Backspace: drops the last letter of the search; the cursor stays.
export function backspaceSearch(state) {
  return patchActive(state, (panel) => ({ search: panel.search.slice(0, -1) }));
}

// Clears the search of the active panel.
export function clearSearch(state) {
  return patchActive(state, () => ({ search: '' }));
}

// Esc: clears the search of the active panel if there is one; otherwise leaves quick view of the inactive panel.
export function escape(state) {
  if (activePanel(state).search !== '') {
    return clearSearch(state);
  }
  return patchPanel(state, 1 - state.active, () => ({ quick: false }));
}

// Sum of the sizes of the files in a listing. Folders are not summed: a folder's total is shown separately.
export function totalSize(entries) {
  return entries.filter((entry) => entry.type !== ENTRY_DIRECTORY).reduce((sum, entry) => sum + entry.size, 0);
}
