// Tile chrome: bevels, focus frame, title bar, tabs and environment bar. Only fillRect and drawText, at integer pixels.
import { SURFACE, SUNKEN, BUTTON, BRASS, BEVEL_LIGHT, BEVEL_DARK, SURFACE_DARK, TEXT, TEXT_BRIGHT, TEXT_DIM } from './theme.js';
import { drawText, measureText, FONTS } from './font.js';
import { BEVEL, PAD, ROW_H } from './metrics.js';

// Font key of font.js used for all chrome text.
const CHROME_FONT = 'rv';
// Text is centred vertically in a row.
const TEXT_Y = Math.floor((ROW_H - FONTS[CHROME_FONT].height) / 2);
// Title button side: left buttons are laid out from the bar's left edge.
export const SIDE_LEFT = 'left';
// Title button side: right buttons keep the x given by the caller.
export const SIDE_RIGHT = 'right';

// A rect is a caller contract: integer x, y, w, h and a minimum size. A violation throws with the reason.
function checkRect(rect, name, minW, minH) {
  const { x, y, w, h } = rect ?? {};
  if (![x, y, w, h].every(Number.isInteger)) {
    throw new Error(`chrome: ${name} needs integer x, y, w and h, got ${JSON.stringify(rect)}`);
  }
  if (w < minW || h < minH) {
    throw new Error(`chrome: ${name} is ${w}x${h}, minimum is ${minW}x${minH}`);
  }
}

// A button, tab or cell along the axis of a bar must have integer x and width and lie inside the bar's width.
function checkSpan(rect, name, x, w) {
  if (!Number.isInteger(x) || !Number.isInteger(w)) {
    throw new Error(`chrome: ${name} needs integer x and width, got x=${x}, width=${w}`);
  }
  if (x < rect.x || x + w > rect.x + rect.w) {
    throw new Error(`chrome: ${name} at x=${x} width ${w} is outside ${rect.x}..${rect.x + rect.w}`);
  }
}

// The only drawing primitive of this module: a filled rect.
function paint(ctx, color, x, y, w, h) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// Bevel of BEVEL pixels inside rect: light on top and left, dark on bottom and right.
function bevel(ctx, rect, light, dark) {
  checkRect(rect, 'frame', 2 * BEVEL, 2 * BEVEL);
  const { x, y, w, h } = rect;
  paint(ctx, light, x, y, w, BEVEL);
  paint(ctx, light, x, y, BEVEL, h);
  paint(ctx, dark, x, y + h - BEVEL, w, BEVEL);
  paint(ctx, dark, x + w - BEVEL, y, BEVEL, h);
}

// Area of rect inside the bevel.
function fillInside(ctx, rect, color) {
  const { x, y, w, h } = rect;
  paint(ctx, color, x + BEVEL, y + BEVEL, w - 2 * BEVEL, h - 2 * BEVEL);
}

// Raised tile frame with a SURFACE content area.
export function drawRaised(ctx, rect, light, dark) {
  bevel(ctx, rect, light, dark);
  fillInside(ctx, rect, SURFACE);
}

// Sunken content area: the bevel is inverted, dark on top and left.
export function drawSunken(ctx, rect) {
  bevel(ctx, rect, BEVEL_DARK, BEVEL_LIGHT);
  fillInside(ctx, rect, SUNKEN);
}

// Brass frame of the focused tile, BEVEL pixels wide, drawn inside rect.
export function drawFocusFrame(ctx, rect) {
  bevel(ctx, rect, BRASS, BRASS);
}

// Width of a title button or tab: its text plus padding on both sides.
function cellWidth(label) {
  return measureText(label, CHROME_FONT) + 2 * PAD;
}

// Resolves the x of every title button. Left buttons follow each other from rect.x + PAD with PAD between them
// (passing x for them is an error); right buttons keep their x. Returns the buttons and the x where the title starts.
function placeButtons(rect, buttons) {
  let cursor = rect.x + PAD;
  const placed = buttons.map((button) => {
    const side = button.side ?? SIDE_RIGHT;
    if (side !== SIDE_LEFT && side !== SIDE_RIGHT) {
      throw new Error(`chrome: title button "${button.label}" side must be left or right, got ${side}`);
    }
    if (side === SIDE_LEFT && button.x !== undefined) {
      throw new Error(`drawTitleBar: left button "${button.label}" takes its x from the layout, do not pass x`);
    }
    const w = cellWidth(button.label);
    const x = side === SIDE_LEFT ? cursor : button.x;
    checkSpan(rect, `title button "${button.label}"`, x, w);
    if (side === SIDE_LEFT) {
      cursor += w + PAD;
    }
    return { label: button.label, x, w };
  });
  return { buttons: placed, titleX: cursor };
}

// Title bar at the top of rect: title after the left buttons, labels are brass when focused.
// The title box (text plus PAD on both sides) must not overlap any button; checked before drawing.
export function drawTitleBar(ctx, rect, title, buttons, focused) {
  checkRect(rect, 'title bar', 1, ROW_H);
  const { buttons: placed, titleX } = placeButtons(rect, buttons);
  const boxX = titleX - PAD;
  const boxW = measureText(title, CHROME_FONT) + 2 * PAD;
  checkSpan(rect, `title "${title}"`, boxX, boxW);
  for (const button of placed) {
    if (button.x < boxX + boxW && button.x + button.w > boxX) {
      throw new Error(`chrome: title "${title}" ends at x=${boxX + boxW}, title button "${button.label}" starts at x=${button.x}`);
    }
  }
  const { x, y, w } = rect;
  const textY = y + TEXT_Y;
  paint(ctx, SURFACE_DARK, x, y, w, ROW_H);
  drawText(ctx, title, titleX, textY, CHROME_FONT, TEXT_BRIGHT);
  const labelColor = focused ? BRASS : TEXT;
  for (const button of placed) {
    paint(ctx, BUTTON, button.x, y, button.w, ROW_H);
    drawText(ctx, button.label, button.x + PAD, textY, CHROME_FONT, labelColor);
  }
}

// Tab strip at the bottom of rect; the active tab (by index) has a SUNKEN block and a brass label.
export function drawTabs(ctx, rect, tabs, active) {
  checkRect(rect, 'tabs', 1, ROW_H);
  if (!Number.isInteger(active) || active < 0 || active >= tabs.length) {
    throw new Error(`chrome: active tab must be an integer in [0, ${tabs.length}), got ${active}`);
  }
  const widths = tabs.map(cellWidth);
  checkSpan(rect, 'tab strip', rect.x, widths.reduce((sum, tabW) => sum + tabW, 0));
  const y = rect.y + rect.h - ROW_H;
  let tabX = rect.x;
  tabs.forEach((label, index) => {
    const isActive = index === active;
    const tabW = widths[index];
    paint(ctx, isActive ? SUNKEN : SURFACE, tabX, y, tabW, ROW_H);
    drawText(ctx, label, tabX + PAD, y + TEXT_Y, CHROME_FONT, isActive ? BRASS : TEXT);
    tabX += tabW;
  });
}

// Environment bar at the bottom of rect, with the message row above it when message is not empty.
export function drawEnvBar(ctx, rect, cells, message) {
  checkRect(rect, 'environment bar', 1, message ? 2 * ROW_H : ROW_H);
  for (const cell of cells) {
    checkSpan(rect, `environment cell "${cell.label}"`, cell.x, cell.width);
    const textW = measureText(cell.label, CHROME_FONT);
    if (textW > cell.width - 2 * PAD) {
      throw new Error(`chrome: environment cell "${cell.label}" text is ${textW}px, cell fits ${cell.width - 2 * PAD}px`);
    }
  }
  const { x, w } = rect;
  const barY = rect.y + rect.h - ROW_H;
  paint(ctx, SURFACE_DARK, x, barY, w, ROW_H);
  for (const cell of cells) {
    paint(ctx, BUTTON, cell.x, barY, cell.width, ROW_H);
    drawText(ctx, cell.label, cell.x + PAD, barY + TEXT_Y, CHROME_FONT, TEXT);
  }
  if (message) {
    const messageY = barY - ROW_H;
    paint(ctx, SURFACE_DARK, x, messageY, w, ROW_H);
    drawText(ctx, message, x + PAD, messageY + TEXT_Y, CHROME_FONT, TEXT_DIM);
  }
}
