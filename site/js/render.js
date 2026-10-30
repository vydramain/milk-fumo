// Workspace drawing: environment bar, message line, tile frames with title bars, content and tabs.
// Draws through the caller's canvas context only; no event handlers and no state of its own.
import { place } from './layout_geom.js';
import { drawRaised, drawSunken, drawFocusFrame, drawTitleBar, drawTabs, drawEnvBar, SIDE_LEFT, SIDE_RIGHT } from './chrome.js';
import { measureText } from './font.js';
import { BEVEL, PAD, ROW_H, VIEWPORT_MIN_W, VIEWPORT_MIN_H } from './metrics.js';
import { SURFACE_DARK, BEVEL_LIGHT, BEVEL_DARK } from './theme.js';

// Font key of font.js used for chrome text; must match CHROME_FONT in chrome.js.
const CHROME_FONT = 'rv';
// Environment bar cells, left to right; the first one is the hint for moving focus (README «Controls»).
const ENV_LABELS = ['Shift+arrows Focus', 'Split', 'Open pmc', 'Stack', 'Maximize', 'Close'];
// Title bar buttons (README «UI»): SIDE_LEFT ones sit at the left edge, SIDE_RIGHT ones at the right edge, in this order.
// '|' and '-' stand in for the split glyphs │ and ─ (U+2502, U+2500): neither code is a key of RV_FONT (font_data.js).
// Deviation from README: owner decision pending.
const TITLE_BUTTONS = [
  { label: 'X', side: SIDE_LEFT },
  { label: '|', side: SIDE_RIGHT },
  { label: '-', side: SIDE_RIGHT },
  { label: 'M', side: SIDE_RIGHT },
];

// A button or cell is its text plus padding on both sides, as in chrome.js.
function cellWidth(label) {
  return measureText(label, CHROME_FONT) + 2 * PAD;
}

// Screen is a caller contract: integer x, y, w, h, at least the viewport minimum.
function checkArgs(state, screen, drawContent) {
  if (!state || !(state.panes instanceof Map)) throw new Error('render: state must be a workspace state with panes');
  const { x, y, w, h } = screen ?? {};
  if (![x, y, w, h].every(Number.isInteger)) {
    throw new Error(`render: screen needs integer x, y, w and h, got ${JSON.stringify(screen)}`);
  }
  if (w < VIEWPORT_MIN_W || h < VIEWPORT_MIN_H) {
    throw new Error(`render: screen is ${w}x${h}, minimum is ${VIEWPORT_MIN_W}x${VIEWPORT_MIN_H}`);
  }
  if (typeof drawContent !== 'function') throw new Error('render: drawContent must be a function');
}

// Leaf that holds tabId, or null. place() gives only the active tab, so the tab list comes from the tree.
function leafOf(node, tabId) {
  if (!node) return null;
  if (node.kind === 'leaf') return node.tabs.includes(tabId) ? node : null;
  return leafOf(node.a, tabId) ?? leafOf(node.b, tabId);
}

// Rect shrunk by d on every side.
function insetRect(rect, d) {
  return { x: rect.x + d, y: rect.y + d, w: rect.w - 2 * d, h: rect.h - 2 * d };
}

// Whole screen in SURFACE_DARK; gaps between tiles (SPLITTER) show it.
function fillScreen(ctx, screen) {
  ctx.fillStyle = SURFACE_DARK;
  ctx.fillRect(screen.x, screen.y, screen.w, screen.h);
}

// Bottom rect of the environment bar, with the message row above it when message is not empty.
function bottomRect(screen, message) {
  const h = message ? 2 * ROW_H : ROW_H;
  return { x: screen.x, y: screen.y + screen.h - h, w: screen.w, h };
}

// Tile area: the screen minus the environment bar and, when message is not empty, the message row.
export function tilesRect(screen, message) {
  const bar = bottomRect(screen, message);
  return { x: screen.x, y: screen.y, w: screen.w, h: screen.h - bar.h };
}

// Cells laid out from the left edge; the cells must fit the screen width.
function envCells(screen) {
  let x = screen.x;
  const cells = ENV_LABELS.map((label) => {
    const width = cellWidth(label);
    const cell = { label, x, width };
    x += width;
    return cell;
  });
  if (x > screen.x + screen.w) {
    throw new Error(`render: environment bar needs ${x - screen.x}px, screen is ${screen.w}px wide`);
  }
  return cells;
}

// Title buttons: left-side ones carry no x (chrome places them from the left edge); right-side ones get x
// from the right edge, in TITLE_BUTTONS order.
function titleButtons(rect) {
  const leftButtons = TITLE_BUTTONS.filter((b) => b.side === SIDE_LEFT).map(({ label, side }) => ({ label, side }));
  let right = rect.x + rect.w;
  const rightButtons = TITLE_BUTTONS.filter((b) => b.side === SIDE_RIGHT).reverse().map(({ label, side }) => {
    right -= cellWidth(label);
    return { label, side, x: right };
  }).reverse();
  return [...leftButtons, ...rightButtons];
}

// Titles of the tabs of a leaf, in order; a tab without a pane is a broken state.
function tabTitles(state, leaf) {
  return leaf.tabs.map((id) => {
    const pane = state.panes.get(id);
    if (!pane) throw new Error(`render: tab "${id}" has no pane`);
    return pane.title;
  });
}

// Tiles to draw: each place() record with its layout leaf, pane and tab titles resolved.
// A broken record throws here, before anything is painted.
function tilePlans(state, tilesRect) {
  return place(state.tree, tilesRect, state.maximized ?? null)
    .filter((item) => item.kind === 'tile')
    .map((tile) => {
      const leaf = leafOf(state.tree, tile.tabId);
      const pane = state.panes.get(tile.tabId);
      if (!leaf || !pane) throw new Error(`render: tile "${tile.tabId}" has no layout leaf or pane`);
      return { tile, leaf, pane, tabNames: tabTitles(state, leaf) };
    });
}

// Frame, title bar, content and tabs of one tile from its plan (see tilePlans).
function drawTile(ctx, state, plan, drawContent) {
  const { rect, tabId } = plan.tile;
  const { pane, leaf, tabNames } = plan;
  const focused = state.focus === tabId;
  const inner = insetRect(rect, BEVEL);
  const hasTabs = tabNames.length > 1;
  const tabsH = hasTabs ? ROW_H : 0;
  const titleRect = { x: inner.x, y: inner.y, w: inner.w, h: ROW_H };
  const sunken = { x: inner.x, y: inner.y + ROW_H, w: inner.w, h: inner.h - ROW_H - tabsH };
  const tabRect = { x: inner.x, y: inner.y + inner.h - ROW_H, w: inner.w, h: ROW_H };
  drawRaised(ctx, rect, BEVEL_LIGHT, BEVEL_DARK);
  drawTitleBar(ctx, titleRect, pane.title, titleButtons(inner), focused);
  drawSunken(ctx, sunken);
  drawContent(ctx, pane, insetRect(sunken, BEVEL), focused);
  if (hasTabs) drawTabs(ctx, tabRect, tabNames, leaf.active);
  if (focused) drawFocusFrame(ctx, rect);
}

// Draws the whole workspace in screen: environment bar at the bottom, tiles above it.
// drawContent(ctx, pane, rect, focused) draws the content of one tile inside rect.
export function drawWorkspace(ctx, state, screen, drawContent) {
  checkArgs(state, screen, drawContent);
  const bar = bottomRect(screen, state.message);
  const cells = envCells(screen);
  const plans = tilePlans(state, tilesRect(screen, state.message));
  fillScreen(ctx, screen);
  drawEnvBar(ctx, bar, cells, state.message);
  for (const plan of plans) drawTile(ctx, state, plan, drawContent);
}
