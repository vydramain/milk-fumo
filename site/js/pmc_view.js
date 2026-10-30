// Drawing of the pmc state: two panels in one tile.
// fillRect and drawText (through font.js) with measureText for widths; fillStyle is set for each colour.
// Coordinates come ready from layoutPmc; the view only picks rows and entries.
import { drawText, measureText } from './font.js';
import { SURFACE, SURFACE_DARK, SUNKEN, BUTTON, BRASS, BEVEL_DARK, TEXT, TEXT_BRIGHT, TEXT_DIM } from './theme.js';
import { kindOf, KIND } from './catalog.js';
import { totalSize, upRows } from './pmc.js';
import { TEXTS, PANEL_COUNT, layoutPmc } from './pmc_layout.js';

// Font of all pmc text, as in chrome.js.
const FONT_KEY = 'rv';

// The state is checked before anything is drawn: active is a panel index, and each panel has the fields the view reads.
function checkState(state) {
  const panels = state?.panels;
  if (!Array.isArray(panels) || panels.length !== PANEL_COUNT) {
    throw new Error(`pmc: state needs ${PANEL_COUNT} panels, got ${JSON.stringify(panels)}`);
  }
  if (!Number.isInteger(state.active) || state.active < 0 || state.active >= PANEL_COUNT) {
    throw new Error(`pmc: active must be an integer in [0, ${PANEL_COUNT}), got ${state.active}`);
  }
  panels.forEach((panel, index) => {
    const valid = Array.isArray(panel?.entries) && Number.isInteger(panel.cursor) && Number.isInteger(panel.top);
    if (!valid || typeof panel.path !== 'string') {
      throw new Error(`pmc: panel ${index} needs an entries array, integer cursor and top, and a string path`);
    }
    if (typeof panel.quick !== 'boolean') {
      throw new Error(`pmc: panel ${index} needs a boolean quick, got ${JSON.stringify(panel.quick)}`);
    }
  });
}

function fill(ctx, color, rect) { ctx.fillStyle = color; ctx.fillRect(rect.x, rect.y, rect.w, rect.h); }
// Folders and apps are both listed with SUB-DIR; an app is a folder whose name ends in .exe.
const isFolder = (entry) => [KIND.FOLDER, KIND.APP].includes(kindOf(entry));

// The longest prefix of text that fits width px, so a long name stops at its column line.
function fitText(text, width) {
  const chars = [...text];
  while (chars.length > 0 && measureText(chars.join(''), FONT_KEY) > width) {
    chars.pop();
  }
  return chars.join('');
}

// Text at a prepared text rect from the layout, cut to its width.
function drawIn(ctx, text, textRect, color) {
  drawText(ctx, fitText(text, textRect.w), textRect.x, textRect.y, FONT_KEY, color);
}

// Name, size and date of a row; the ".." row has no date and shows UP--DIR.
function rowLine(panel, index, up) {
  if (index < up) {
    return { name: TEXTS.up, size: TEXTS.upKind, date: '' };
  }
  const entry = panel.entries[index - up];
  return { name: entry.name, size: isFolder(entry) ? TEXTS.folderKind : String(entry.size), date: String(entry.mtime ?? '') };
}

// Paged scroll by the cursor: the window starts at the page the cursor is on. Stateless: the state is not changed.
function firstRow(panel, visible) {
  return Math.floor(panel.cursor / visible) * visible;
}

// Rows of the page from its first row; the cursor is a full-width bar, brass in the active panel.
// An empty folder shows its placeholder in the first row after "..".
function drawRows(ctx, panel, active, geo) {
  const up = upRows(panel.path);
  const count = up + panel.entries.length;
  const first = firstRow(panel, geo.slots.length);
  for (let row = 0; row < geo.slots.length && first + row < count; row++) {
    const slot = geo.slots[row];
    const index = first + row;
    const cursor = index === panel.cursor;
    if (cursor) fill(ctx, active ? BRASS : TEXT_DIM, slot.row.rect);
    const line = rowLine(panel, index, up);
    const color = cursor && active ? TEXT_BRIGHT : TEXT;
    drawIn(ctx, line.name, slot.name.text, color);
    drawIn(ctx, line.size, slot.size.text, color);
    drawIn(ctx, line.date, slot.date.text, color);
  }
  const placeholder = geo.slots[up - first];
  if (panel.entries.length === 0 && placeholder) drawIn(ctx, TEXTS.empty, placeholder.row.text, TEXT_DIM);
}

// One panel: path in the top row, column names, the lines, then the list, or the quick view placeholder in its place.
function drawPanel(ctx, panel, active, geo) {
  fill(ctx, SUNKEN, geo.frame);
  drawIn(ctx, panel.path || TEXTS.root, geo.path.text, active ? BRASS : TEXT_DIM);
  drawIn(ctx, TEXTS.nameColumn, geo.head.name.text, TEXT);
  drawIn(ctx, TEXTS.sizeColumn, geo.head.size.text, TEXT);
  drawIn(ctx, TEXTS.modifiedColumn, geo.head.date.text, TEXT);
  for (const line of geo.lines) {
    fill(ctx, BEVEL_DARK, line);
  }
  if (panel.quick) {
    drawIn(ctx, TEXTS.quickView, geo.slots[0].row.text, TEXT_DIM);
  } else {
    drawRows(ctx, panel, active, geo);
  }
}

// Line under the panels: the name under the cursor of the active panel, and the total of its files.
function drawInfo(ctx, panel, info) {
  const entry = panel.entries[panel.cursor - upRows(panel.path)];
  drawIn(ctx, entry ? entry.name : '', info.name.text, TEXT);
  drawIn(ctx, `${TEXTS.total} ${totalSize(panel.entries)}`, info.total.text, TEXT);
}

// The key bar: each label in a BUTTON cell.
function drawKeys(ctx, keys) {
  fill(ctx, SURFACE_DARK, keys.bar);
  for (const key of keys.cells) {
    fill(ctx, BUTTON, key.rect);
    drawIn(ctx, key.label, key.text, TEXT);
  }
}

// Draws the pmc state inside rect. The state and the rect are checked before anything is drawn.
export function drawPmc(ctx, state, rect) {
  checkState(state);
  const layout = layoutPmc(rect, (text) => measureText(text, FONT_KEY));
  fill(ctx, SURFACE, rect);
  state.panels.forEach((panel, index) => drawPanel(ctx, panel, index === state.active, layout.panels[index]));
  fill(ctx, SURFACE, layout.splitter);
  drawInfo(ctx, state.panels[state.active], layout.info);
  drawKeys(ctx, layout.keys);
}
