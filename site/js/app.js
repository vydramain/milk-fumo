// App state and event routing: workspace, caches of texts, listings and pmc states, paths of note tiles.
// No DOM and no listeners here; main.js adds them later, and this slice adds none.
import { createWorkspace, reduce, focusedPane, COMMANDS } from './workspace.js';
import { drawWorkspace, tilesRect } from './render.js';
import { keyCommand, pointCommand } from './input.js';
import { place } from './layout_geom.js';
import { createPmc } from './pmc.js';
import { pmcKey } from './pmc_keys.js';
import { drawPmc } from './pmc_view.js';
import { noteLayout } from './note_layout.js';
import { drawNote } from './note_view.js';
import { parseMarkdown } from './md.js';
import { listDirectory, fileUrl } from './catalog.js';
import { HOME_NOTE, TUTORIAL_NOTE } from './config.js';
import { drawText } from './font.js';
import { TEXT, TEXT_DIM } from './theme.js';
import { PMC_MIN_W, PMC_MIN_H } from './metrics.js';

const TYPE = Object.freeze({ PMC: 'pmc', NOTE: 'note', EMPTY: 'empty', AUDIO: 'audio', VIDEO: 'video', IMAGE: 'image' });
// File kind (catalog.js kindOf) -> tile type; a kind missing here (text, other) has no tile yet.
const TILE_BY_KIND = { note: TYPE.NOTE, audio: TYPE.AUDIO, video: TYPE.VIDEO, image: TYPE.IMAGE };
const SIDE_RIGHT = 'right';
const ROOT_PATH = ''; // path of the content root in listings
const ACTION_OPEN_FILE = 'openFile'; // pmc_keys.js ACTION.OPEN_FILE
const ACTION_LAUNCH = 'launch'; // pmc_keys.js ACTION.LAUNCH: an app folder (.exe)
const FONT = 'rv'; // font of the placeholder labels
const LOADING_TEXT = 'loading...';
const TOO_SMALL_TEXT = 'too small';
const EMPTY_TEXT = 'pmc (Shift+Enter)';
const COMING_SOON_TEXT = 'coming soon';
const NOT_SUPPORTED_TEXT = 'not supported yet';

// options.screen: initial rect in physical pixels; requestListing(path): entries or a promise; a refusal is shown.
export function createApp(options) {
  if (options === null || typeof options !== 'object') throw new Error('createApp: options must be an object');
  const { screen, requestRedraw, requestListing } = options;
  if (![screen?.x, screen?.y, screen?.w, screen?.h].every(Number.isInteger)) {
    throw new Error(`createApp: screen needs integer x, y, w and h, got ${JSON.stringify(screen)}`);
  }
  for (const [name, fn] of Object.entries({ requestRedraw, requestListing })) {
    if (typeof fn !== 'function') throw new Error(`createApp: ${name} must be a function, got ${typeof fn}`);
  }
  const texts = new Map(); // note path -> text
  const loadingTexts = new Set(); // note paths being fetched
  const listings = new Map(); // path -> entries as nginx sends them
  const loadingListings = new Set(); // paths asked from the caller and not yet answered
  const pmcOf = new WeakMap(); // pane object -> pmc state
  const pathOf = new WeakMap(); // note pane object -> path of its text
  let screenRect = screen;
  // Start screen: Home on the left, Tutorial to its right and focused (README «Tiles»).
  let workspace = createWorkspace(TYPE.NOTE);
  pathOf.set(focusedPane(workspace), HOME_NOTE);
  workspace = reduce(workspace, { name: COMMANDS.split, side: SIDE_RIGHT, type: TYPE.NOTE });
  pathOf.set(focusedPane(workspace), TUTORIAL_NOTE);
  // Shows a reason in the message line.
  function showMessage(text) { workspace = reduce(workspace, { name: COMMANDS.message, text }); requestRedraw(); }
  // Fetches a note once; a failure throws with its reason.
  async function requireText(path) {
    if (texts.has(path) || loadingTexts.has(path)) return;
    loadingTexts.add(path);
    try {
      const response = await fetch(fileUrl(path)).catch((error) => { throw new Error(`${path}: ${error.message}`); });
      if (!response.ok) throw new Error(`Note ${path} failed: HTTP ${response.status}`);
      texts.set(path, await response.text());
    } finally {
      loadingTexts.delete(path);
    }
    requestRedraw();
  }
  // Asks the caller for a listing once. A refusal, sync or async, is shown and the path can be asked again.
  function requireListing(path) {
    if (listings.has(path) || loadingListings.has(path)) return;
    loadingListings.add(path);
    new Promise((resolve) => resolve(requestListing(path)))
      .then((entries) => { listings.set(path, entries); requestRedraw(); })
      .catch((error) => showMessage(`Cannot list ${path}: ${error.message}`))
      .finally(() => loadingListings.delete(path));
  }
  // pmc state of a pmc tile, made from the root listing on first show; null while that listing loads.
  function pmcFor(pane) {
    if (!pmcOf.has(pane)) {
      if (!listings.has(ROOT_PATH)) return null;
      pmcOf.set(pane, createPmc(listings.get(ROOT_PATH)));
    }
    return pmcOf.get(pane);
  }
  function drawContent(ctx, pane, rect) {
    if (pane.type === TYPE.NOTE) {
      const text = texts.get(pathOf.get(pane));
      if (text === undefined) return drawText(ctx, LOADING_TEXT, rect.x, rect.y, FONT, TEXT);
      return drawNote(ctx, noteLayout(parseMarkdown(text), rect.w).items, rect, 0, new Set()); // no spoiler open here
    }
    if (pane.type === TYPE.PMC) {
      if (rect.w < PMC_MIN_W || rect.h < PMC_MIN_H) return drawText(ctx, TOO_SMALL_TEXT, rect.x, rect.y, FONT, TEXT_DIM);
      const pmc = pmcFor(pane);
      return pmc === null ? drawText(ctx, LOADING_TEXT, rect.x, rect.y, FONT, TEXT) : drawPmc(ctx, pmc, rect);
    }
    return drawText(ctx, pane.type === TYPE.EMPTY ? EMPTY_TEXT : COMING_SOON_TEXT, rect.x, rect.y, FONT, TEXT_DIM);
  }
  function placedTiles() { return place(workspace.tree, tilesRect(screenRect, workspace.message), workspace.maximized); }
  // Applies a command; a type set on a tile that is not empty changes nothing.
  function run(command) {
    if (command.name === COMMANDS.setType && focusedPane(workspace).type !== TYPE.EMPTY) return;
    workspace = reduce(workspace, command);
  }
  // Opens a file in a new tile to the right of the focused one; a note loads its text, a failure goes to the message line.
  function openFile(path, kind) {
    if (!Object.hasOwn(TILE_BY_KIND, kind)) return showMessage(NOT_SUPPORTED_TEXT);
    const type = TILE_BY_KIND[kind];
    run({ name: COMMANDS.split, side: SIDE_RIGHT, type });
    if (type !== TYPE.NOTE) return undefined;
    pathOf.set(focusedPane(workspace), path);
    return requireText(path).catch((error) => showMessage(error.message));
  }
  // pmcKey needs listings synchronously: an uncached listing is requested and this key is dropped.
  function pmcKeyDown(event) {
    const pane = focusedPane(workspace);
    const pmc = pmcFor(pane);
    if (pmc === null) return;
    let missing = null;
    const listing = (path) => { if (!listings.has(path)) missing = path; return listings.get(path) ?? []; };
    const { state, action } = pmcKey(pmc, event, listing);
    if (missing !== null) return requireListing(missing);
    pmcOf.set(pane, state);
    if (action?.type === ACTION_OPEN_FILE) openFile(action.path, action.kind);
    else if (action?.type === ACTION_LAUNCH) showMessage(NOT_SUPPORTED_TEXT);
    return undefined;
  }

  return {
    draw(ctx, size) {
      screenRect = { x: 0, y: 0, w: size.width, h: size.height };
      drawWorkspace(ctx, workspace, screenRect, drawContent);
    },
    // Tile commands on Shift win over pmc search; search takes unshifted letters and other shifted letters.
    keyDown(event) {
      const command = keyCommand(event, placedTiles(), workspace.focus);
      if (command !== null) run(command);
      else if (focusedPane(workspace).type === TYPE.PMC) pmcKeyDown(event);
    },
    pointerDown(x, y) { const command = pointCommand(x, y, placedTiles()); if (command !== null) run(command); },
    // Shows the failure in the message line and rejects with the reason.
    load() {
      return Promise.all([listDirectory(ROOT_PATH), requireText(HOME_NOTE), requireText(TUTORIAL_NOTE)])
        .then(([root]) => { listings.set(ROOT_PATH, root); requestRedraw(); })
        .catch((error) => { showMessage(error.message); throw error; });
    },
  };
}
