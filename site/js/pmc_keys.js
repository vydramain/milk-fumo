import {
  moveCursor,
  setCursor,
  switchPanel,
  enterFolder,
  goUp,
  toggleQuick,
  appendSearch,
  backspaceSearch,
  escape,
  upRows,
} from './pmc.js';
import { kindOf, entryPath, KIND } from './catalog.js';
// Maps a keyboard event to an operation on the pmc state (README «pmc»). Pure: the caller fetches listings and acts.

const KEY = Object.freeze({
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  PAGE_UP: 'PageUp',
  PAGE_DOWN: 'PageDown',
  HOME: 'Home',
  END: 'End',
  ENTER: 'Enter',
  TAB: 'Tab',
  F3: 'F3',
  ESCAPE: 'Escape',
  BACKSPACE: 'Backspace',
});

const ACTION = Object.freeze({
  LAUNCH: 'launch', // an app (folder ending in .exe): the caller runs it
  OPEN_FILE: 'openFile', // a file: the caller opens it in a new tile
});
// PgUp/PgDn step at the minimum pmc height PMC_MIN_H = 156 (metrics.js): panelH = 124, visible = floor((124 - 2*16) / 16) = 5.
const VISIBLE_PAGE = 5;
const SEPARATOR = '/'; // parent path is cut at it; pmc.js and catalog.js do not export a parent helper

// Keys that change only the cursor or the search; they need no listing.
const STATE_KEYS = Object.freeze({
  [KEY.ARROW_UP]: (state) => moveCursor(state, -1),
  [KEY.ARROW_DOWN]: (state) => moveCursor(state, 1),
  [KEY.PAGE_UP]: (state) => moveCursor(state, -VISIBLE_PAGE),
  [KEY.PAGE_DOWN]: (state) => moveCursor(state, VISIBLE_PAGE),
  [KEY.HOME]: (state) => setCursor(state, 0),
  [KEY.END]: (state) => setCursor(state, Number.MAX_SAFE_INTEGER), // pmc.js clamps to the last row
  [KEY.TAB]: switchPanel,
  [KEY.F3]: toggleQuick,
  [KEY.ESCAPE]: escape,
  [KEY.BACKSPACE]: backspaceSearch,
});

function isLetter(key) {
  return typeof key === 'string' && /^\p{L}$/u.test(key);
}

// Ctrl+PgUp and Enter on "..": the parent listing comes from the caller. At the root nothing is fetched.
function upOneLevel(state, listing) {
  const path = state.panels[state.active].path;
  if (upRows(path) === 0) {
    return { state, action: null };
  }
  const parent = path.slice(0, Math.max(0, path.lastIndexOf(SEPARATOR)));
  return { state: goUp(state, listing(parent)), action: null };
}

// Enter on the cursor row: ".." goes up, a folder is entered, an app is launched, a file is opened.
function enterCursor(state, listing) {
  const panel = state.panels[state.active];
  const hasUpRow = upRows(panel.path) === 1;
  if (hasUpRow && panel.cursor === 0) {
    return upOneLevel(state, listing);
  }
  const entry = panel.entries[panel.cursor - (hasUpRow ? 1 : 0)];
  if (!entry) return { state, action: null }; // deliberate no-op: nothing to open; the view shows its placeholder
  const path = entryPath(panel.path, entry.name);
  const kind = kindOf(entry);
  if (kind === KIND.FOLDER) {
    return { state: enterFolder(state, listing(path), entry.name), action: null };
  }
  if (kind === KIND.APP) {
    return { state, action: { type: ACTION.LAUNCH, path } };
  }
  return { state, action: { type: ACTION.OPEN_FILE, path, kind } };
}

function checkArguments(state, event, listings) {
  if (!state || !Array.isArray(state.panels) || !state.panels[state.active]) {
    throw new Error('pmcKey: state has no active panel; expected a state from createPmc');
  }
  if (!event || typeof event !== 'object') {
    throw new Error('pmcKey: event must be a keyboard event object');
  }
  if (typeof listings !== 'function') {
    throw new Error('pmcKey: listings must be a function listing(path)');
  }
}

// Returns { state, action }: the new state and the side effect for the caller, or null.
// listing(path) returns the entries array synchronously (the caller's cache); an async listing does not fit.
export function pmcKey(state, event, listings) {
  checkArguments(state, event, listings);
  const { key, shiftKey, ctrlKey, altKey, metaKey } = event;
  if (ctrlKey && !altKey && !shiftKey && !metaKey && key === KEY.PAGE_UP) {
    return upOneLevel(state, listings);
  }
  // Shift with a non-letter, and Ctrl, Alt or Meta, are not pmc keys except Ctrl+PgUp; they return no action.
  if (ctrlKey || altKey || metaKey || (shiftKey && !isLetter(key))) {
    return { state, action: null };
  }
  if (key === KEY.ENTER) {
    return enterCursor(state, listings);
  }
  if (Object.hasOwn(STATE_KEYS, key)) {
    return { state: STATE_KEYS[key](state), action: null };
  }
  if (isLetter(key)) {
    return { state: appendSearch(state, key.toLowerCase()), action: null };
  }
  return { state, action: null };
}
