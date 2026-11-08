// Widgets of the immediate-mode UI. A widget draws itself and, in the same call, registers its rectangle
// with the frame's hit list. A click is checked against the list from the top down.
import { C } from './theme.js';
import { RV, textWidth, fitText } from './font.js';
import { T } from './texts.js';
import { TITLE_H } from './metrics.js';

// The hits of one frame. A later hit is on top of an earlier one, so a widget is added after its container.
export class Hits {
  constructor() { this.list = []; this.clips = []; }

  // A tile's body is drawn inside its content rectangle, and its hits are kept inside it too: a button that
  // reaches past the edge of its tile is not drawn, so it must not take a click that belongs to the next tile.
  clip(r) { this.clips.push(r); }
  unclip() { this.clips.pop(); }

  // on: { click(x, y), wheel(dy), press(x, y) -> { move, up } | move | undefined }
  add(r, on) {
    const c = this.clips.at(-1);
    if (c) {
      const x0 = Math.max(r.x, c.x), y0 = Math.max(r.y, c.y);
      const x1 = Math.min(r.x + r.w, c.x + c.w), y1 = Math.min(r.y + r.h, c.y + c.h);
      if (x1 <= x0 || y1 <= y0) return;
      r = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    this.list.push({ r, on });
  }

  // The topmost hit under a point that has the handler `key`, or null.
  find(x, y, key) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i];
      if (h.on[key] && x >= h.r.x && y >= h.r.y && x < h.r.x + h.r.w && y < h.r.y + h.r.h) return h;
    }
    return null;
  }

  // The topmost hit under a point, whatever its handlers are.
  at(x, y) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i];
      if (x >= h.r.x && y >= h.r.y && x < h.r.x + h.r.w && y < h.r.y + h.r.h) return h;
    }
    return null;
  }
}

// A raised or sunken box with a bevel `width` px wide: 1 px for small boxes, 2 px for buttons and fields.
export function box(p, r, raised, color = C.btn, width = 1) {
  p.fill(r.x, r.y, r.w, r.h, color);
  p.bevel(r, width, raised);
}

// The panel frame: a 1 px dark line on the top and left, a light line inside it, and a light
// shadow outside on the right and bottom. Returns the inside, which is 1 px border and 4 px padding in.
export function panelFrame(p, r) {
  p.fill(r.x, r.y, r.w, 1, C.lo);
  p.fill(r.x, r.y, 1, r.h, C.lo);
  p.fill(r.x + 1, r.y + 1, r.w - 2, 1, C.hi);
  p.fill(r.x + 1, r.y + 1, 1, r.h - 2, C.hi);
  p.fill(r.x + r.w, r.y + 1, 1, r.h, C.hi);
  p.fill(r.x + 1, r.y + r.h, r.w, 1, C.hi);
  return { x: r.x + 5, y: r.y + 5, w: r.w - 10, h: r.h - 10 };
}

// A sunken well with a 2 px frame. Returns the inside.
export function wellFrame(p, r, color = C.inset) {
  p.fill(r.x, r.y, r.w, r.h, color);
  p.bevel(r, 2, false);
  return { x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 4 };
}

// Text centered in a rectangle: x and y of the text.
export function centerText(font, r, s, scale = 1) {
  return {
    x: r.x + Math.floor((r.w - textWidth(font, s, scale)) / 2),
    y: r.y + Math.floor((r.h - font.rows * scale) / 2),
  };
}

// A button: a raised box with a label. `on` makes it pressed.
export function button(p, hits, r, label, { on = false, color = C.text, click } = {}) {
  box(p, r, !on, on ? C.inset : C.btn, 2);
  const at = centerText(RV, r, label);
  p.text(RV, at.x, at.y, label, on ? C.bright : color);
  if (click) hits.add(r, { click });
}

// A scroll bar at the right of a rectangle: arrows at both ends, a dithered track, a thumb.
// Returns the width it takes. `top` is the first visible item, `view` the number of visible items.
export function scrollbar(p, hits, r, { top, view, total, onTop }) {
  const w = 14;
  const x = r.x + r.w - w;
  p.dither({ x, y: r.y, w, h: r.h }, C.inset, C.lo);
  const up = { x, y: r.y, w, h: 14 }, dn = { x, y: r.y + r.h - 14, w, h: 14 };
  box(p, up, true);
  box(p, dn, true);
  arrow(p, up, true);
  arrow(p, dn, false);
  const track = { x, y: r.y + 14, w, h: r.h - 28 };
  if (total > view && track.h > 0) {
    const th = Math.max(8, Math.floor(track.h * view / total));
    const max = total - view;
    const ty = track.y + Math.floor((track.h - th) * top / max);
    box(p, { x, y: ty, w, h: th }, true);
  }
  hits.add(up, { click: () => onTop(Math.max(0, top - 1)) });
  hits.add(dn, { click: () => onTop(Math.min(Math.max(0, total - view), top + 1)) });
  hits.add(track, {
    press: (px, py) => {
      const pos = (py - track.y) / track.h;
      onTop(Math.round(pos * Math.max(0, total - view)));
      return (qx, qy) => onTop(Math.round((qy - track.y) / track.h * Math.max(0, total - view)));
    },
  });
  return w;
}

// A 7-pixel triangle in a 14-pixel button: the apex is up or down.
function arrow(p, r, upward) {
  for (let i = 0; i < 4; i++) {
    const y = r.y + 5 + i;
    if (upward) p.fill(r.x + 7 - i, y, 1 + 2 * i, 1, C.bright);
    else p.fill(r.x + 4 + i, y, 7 - 2 * i, 1, C.bright);
  }
}

// A small bitmap: rows of bits, the leftmost bit first.
export function bitmap(p, x, y, rows, cols, color, scale = 1) {
  rows.forEach((bits, row) => {
    for (let c = 0; c < cols; c++) {
      if ((bits >> (cols - 1 - c)) & 1) p.fill(x + c * scale, y + row * scale, scale, scale, color);
    }
  });
}

export const LOAD_W = 37, LOAD_H = 11;

// The load bar: a 1 px sunken well, a 1 px checker fill of floor(share * 35) px, and the
// word `load`, `done` or `errr` 6 px in: bright over the empty part, dark over the fill. `load` is
// { state, share } or null, which draws nothing.
export function loadBar(p, x, y, load) {
  if (!load) return;
  const well = { x, y, w: LOAD_W, h: LOAD_H };
  p.fill(x, y, LOAD_W, LOAD_H, C.inset);
  p.bevel(well, 1, false);
  const fill = load.state === 'done' ? 35 : load.state === 'errr' ? 0 : Math.floor(Math.min(1, Math.max(0, load.share)) * 35);
  if (fill > 0) p.dither({ x: x + 1, y: y + 1, w: fill, h: 9 }, C.sel, C.inset);
  p.text(RV, x + 7, y + 2, load.state, C.bright);
  if (fill > 0) {
    p.clip({ x: x + 1, y: y + 1, w: fill, h: 9 });
    p.text(RV, x + 7, y + 2, load.state, C.dark);
    p.unclip();
  }
}

// The key bar: cells of equal width, 2 px apart, the key in a dark box and the name after it. A cell with `click` is
// a button; it is drawn sunken while one of its `codes` is in `held`.
// The held set of a tile that is not focused: its cells never sink.
export const NO_KEYS = Object.freeze(new Set());

export function keyBar(p, hits, r, cells, held) {
  const w = Math.floor((r.w - 2 * (cells.length - 1)) / cells.length);
  // A cell sinks only with its own modifiers: a Shift cell with Shift held, any other without Shift; a plain code
  // without Ctrl (a Ctrl key is held as 'Ctrl+' + code). So the environment's Shift combinations sink no tile cell.
  const shift = held.has('ShiftLeft') || held.has('ShiftRight');
  const ctrl = held.has('ControlLeft') || held.has('ControlRight');
  cells.forEach((k, i) => {
    const cell = { x: r.x + i * (w + 2), y: r.y, w, h: r.h };
    const down = shift === k.key.startsWith('Shift+') && k.codes.some((c) => held.has(c) && (c.startsWith('Ctrl+') || !ctrl));
    box(p, cell, !down, down ? C.inset : C.btn, 1);
    // A name that does not fit whole is cut to its first two letters, and the key gives way to them, down to one letter.
    let key = fitText(RV, k.key, w - 14);
    let label = k.label;
    if (textWidth(RV, label) > w - textWidth(RV, key) - 16) {
      label = [...label].slice(0, 2).join('');
      key = fitText(RV, k.key, Math.max(RV.advance, w - 16 - textWidth(RV, label)));
    }
    const keyW = textWidth(RV, key);
    p.fill(cell.x + 4, cell.y + 2, keyW + 6, 10, C.dark);
    p.text(RV, cell.x + 7, cell.y + 3, key, C.bright);
    const nx = cell.x + 4 + keyW + 6 + 4;
    p.text(RV, nx, cell.y + 3, fitText(RV, label, cell.x + w - nx - 2), C.text);
    if (k.click) hits.add(cell, { click: k.click });
  });
}

// The screens that replace the workspace when the screen is too small or the device is a touch-first one: a tile with
// a title and lines of text, or the text alone, centered on the darkest surface.
export function messageScreen(p, size, title, lines) {
  p.fill(0, 0, size.w, size.h, C.dark);
  const lineList = Array.isArray(lines) ? lines : [lines];
  const head = title ? TITLE_H + 6 : 0;
  const w = 360;
  const h = 7 + head + 8 + lineList.length * 12 + 8 + 7;
  const frame = { x: Math.round((size.w - w) / 2), y: Math.round((size.h - h) / 2), w, h };
  p.fill(frame.x, frame.y, frame.w, frame.h, C.win);
  p.bevel(frame, 2, true);
  if (title) {
    const tr = { x: frame.x + 7, y: frame.y + 7, w: frame.w - 14, h: TITLE_H };
    p.dither(tr, C.win, C.lo);
    p.fill(tr.x + 14, tr.y, textWidth(RV, title) + 12, tr.h, C.win);
    p.text(RV, tr.x + 20, tr.y + 3, title, C.bright);
  }
  const body = { x: frame.x + 7, y: frame.y + 7 + head, w: frame.w - 14, h: h - 14 - head };
  p.fill(body.x, body.y, body.w, body.h, C.inset);
  lineList.forEach((s, i) => p.text(RV, body.x + 8, body.y + 8 + i * 12, s, C.text));
}

// The foot panel: a sunken field with the line `text`, the load bar after it (2 px from the keyboard field, 1 px down),
// then the keyboard field: `Keyboard: app` in C.sel when `appKeys`, `Keyboard: —` in C.cov otherwise.
export function footBar(p, r, text, load, appKeys) {
  const kw = textWidth(RV, T.keyboardApp) + 12;
  const kx = r.x + r.w - kw;
  const bx = kx - 2 - LOAD_W;
  const addr = { x: r.x, y: r.y, w: (load ? bx : kx) - 2 - r.x, h: r.h };
  p.fill(addr.x, addr.y, addr.w, addr.h, C.inset);
  p.bevel(addr, 1, false);
  p.text(RV, addr.x + 4, addr.y + 4, fitText(RV, text, addr.w - 8), C.bright);
  loadBar(p, bx, r.y + 1, load);
  p.fill(kx, r.y, kw, r.h, C.inset);
  p.bevel({ x: kx, y: r.y, w: kw, h: r.h }, 1, false);
  p.text(RV, kx + 6, r.y + 4, appKeys ? T.keyboardApp : T.keyboardNone, appKeys ? C.sel : C.cov);
}
