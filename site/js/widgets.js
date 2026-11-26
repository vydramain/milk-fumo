// Widgets of the immediate-mode UI. A widget draws itself and, in the same call, registers its rectangle
// with the frame's hit list. A click is checked against the list from the top down.
import { C, theme } from './theme.js';
import { RV, VGA, uiFont, textWidth, fitText } from './font.js';
import { T, ERRORS } from './texts.js';
import { TITLE_H } from './metrics.js';

// The hits of one frame. A later hit is on top of an earlier one, so a widget is added after its container.
export class Hits {
  constructor() { this.list = []; this.clips = []; }

  // A tile's body is drawn inside its content rectangle, and its hits are kept inside it too: a button that
  // reaches past the edge of its tile is not drawn, so it must not take a click that belongs to the next tile.
  clip(r) { this.clips.push(r); }
  unclip() { this.clips.pop(); }

  // on: { click(x, y), drawPressed(p), wheel(dy), press(x, y) -> { move, up } | move | undefined }
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

// Titlebar.vue and bayerMatrix.ts in win-55-ui beta-0.8.0 use a 45° gradient of 2 px blocks.
const TITLE_BAYER = [
  [0, 48, 12, 60, 3, 51, 15, 63],
  [32, 16, 44, 28, 35, 19, 47, 31],
  [8, 56, 4, 52, 11, 59, 7, 55],
  [40, 24, 36, 20, 43, 27, 39, 23],
  [2, 50, 14, 62, 1, 49, 13, 61],
  [34, 18, 46, 30, 33, 17, 45, 29],
  [10, 58, 6, 54, 9, 57, 5, 53],
  [42, 26, 38, 22, 41, 25, 37, 21],
];

export function titleBackdrop(p, r) {
  if (theme !== 'win-55') {
    p.dither(r, C.win, C.lo);
    return;
  }
  const cols = Math.ceil(r.w / 2);
  const span = Math.max(1, Math.floor(r.w / 2) + Math.floor(r.h / 2) - 6);
  const height = Math.max(0, r.h - 2);
  p.fill(r.x, r.y, r.w, height, '#5555ff');
  for (let y = 0; 2 * y < height; y++) {
    for (let x = 0; x < cols; x++) {
      if ((x + y) / span > (TITLE_BAYER[y % 8][x % 8] + 0.5) / 64) {
        p.fill(r.x + 2 * x, r.y + 2 * y, Math.min(2, r.w - 2 * x), Math.min(2, height - 2 * y), C.blue);
      }
    }
  }
  p.fill(r.x, r.y + height, r.w, r.h - height, C.lo);
}

// The title keeps a 6 px inset on its default plate. Win-55 draws white type with a black shadow.
export function titleLabel(p, r, title, left, width) {
  const font = uiFont();
  const label = fitText(font, title, width);
  const x = r.x + left;
  const y = r.y + Math.floor((r.h - font.rows) / 2);
  if (theme === 'win-55') {
    if (!label) return;
    p.clip(r);
    p.text(font, x + 1, y + 1, label, C.text, 1, true);
    p.text(font, x, y, label, C.hi, 1, true);
    p.unclip();
  } else {
    p.fill(x - 6, r.y, textWidth(font, label) + 12, r.h, C.win);
    p.text(font, x, y, label, C.bright);
  }
}

// A tab's visible shape. Callers keep their own hit rectangles.
export function tileTab(p, r, title, active, pressed = false) {
  if (theme === 'win-55') {
    const tab = { ...r, w: r.w + 2 };
    if (tab.w < 2) return;
    box(p, tab, !pressed, active ? C.sel : C.btn, 2);
    const font = uiFont();
    const label = fitText(font, title, tab.w - 8);
    const offset = pressed ? 1 : 0;
    p.text(font, tab.x + 4 + offset, tab.y + Math.floor((tab.h - font.rows) / 2) + offset, label, active ? C.hi : C.text);
    return;
  }

  const { x, y, w, h } = r;
  const rows = p.slant(x, y, w, h, 6, pressed ? C.inset : active ? C.sel : C.win);
  if (pressed) {
    rows.forEach((rx, i) => {
      p.fill(rx, y + i, 1, 1, C.lo);
      p.fill(rx + w - 1, y + i, 1, 1, C.lo);
    });
    p.fill(rows[0], y, w, 1, C.lo);
  } else if (!active) {
    rows.forEach((rx, i) => {
      p.fill(rx + w - 1, y + i, 1, 1, C.lo);
      p.fill(rx + w, y + i, 2, 1, C.hi);
    });
  }
  const label = fitText(RV, title, w - 18);
  p.text(RV, x + (pressed ? 10 : 9), y + (pressed ? 4 : 3), label, active ? C.dark : C.text);
}

// The panel frame: a 1 px dark line on the top and left, a light line inside it, and a light
// shadow outside on the right and bottom. Returns the inside, which is 1 px border and 4 px padding in.
export function panelFrame(p, r) {
  if (theme === 'win-55') {
    p.fill(r.x, r.y, r.w, r.h, C.win);
    p.edge(r, 1, C.win, C.blue);
    p.edge({ x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }, 1, C.hi, C.lo);
  } else {
    p.fill(r.x, r.y, r.w, 1, C.lo);
    p.fill(r.x, r.y, 1, r.h, C.lo);
    p.fill(r.x + 1, r.y + 1, r.w - 2, 1, C.hi);
    p.fill(r.x + 1, r.y + 1, 1, r.h - 2, C.hi);
    p.fill(r.x + r.w, r.y + 1, 1, r.h, C.hi);
    p.fill(r.x + 1, r.y + r.h, r.w, 1, C.hi);
  }
  return { x: r.x + 5, y: r.y + 5, w: r.w - 10, h: r.h - 10 };
}

// A sunken well with a 2 px frame by default. Returns the inside.
export function wellFrame(p, r, color = C.inset, width = 2) {
  p.fill(r.x, r.y, r.w, r.h, color);
  if (width) p.bevel(r, width, false);
  return { x: r.x + width, y: r.y + width, w: r.w - 2 * width, h: r.h - 2 * width };
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
  const win55 = theme === 'win-55';
  box(p, r, !on, on && !win55 ? C.inset : C.btn, 2);
  const font = uiFont();
  if (win55) label = fitText(font, label, r.w - 6);
  const at = centerText(font, r, label);
  const offset = on && win55 ? 1 : 0;
  p.text(font, at.x + offset, at.y + offset, label, on ? C.bright : color);
  if (click) hits.add(r, { click, drawPressed: win55 ? (q) => button(q, hits, r, label, { on: true, color }) : undefined });
}

// A scroll bar at the right of a rectangle: arrows at both ends, a dithered track, a thumb.
// Returns the width it takes. `top` is the first visible item, `view` the number of visible items.
export function scrollbar(p, hits, r, { top, view, total, onTop }) {
  const w = 14;
  const x = r.x + r.w - w;
  const win55 = theme === 'win-55';
  const track = { x, y: r.y + 14, w, h: r.h - 28 };
  if (!win55) p.dither({ x, y: r.y, w, h: r.h }, C.inset, C.lo);
  else if (track.h > 0) {
    p.fill(x, track.y, w, track.h, C.track);
    p.edge(track, 1, C.blue, C.dark);
    if (track.h > 2) {
      p.edge({ x: x + 1, y: track.y + 1, w: w - 2, h: track.h - 2 }, 1, C.text, null);
      p.fill(x + w - 2, track.y + 1, 1, 1, C.lo);
      p.fill(x + 1, track.y + track.h - 2, 1, 1, C.lo);
    }
  }
  const up = { x, y: r.y, w, h: 14 }, dn = { x, y: r.y + r.h - 14, w, h: 14 };
  if (!win55) {
    box(p, up, true);
    box(p, dn, true);
  }
  arrow(p, up, true);
  arrow(p, dn, false);
  if (total > view && track.h > (win55 ? 2 : 0)) {
    const idealHeight = Math.max(8, Math.floor(track.h * view / total));
    const th = win55 ? Math.min(track.h, idealHeight) : idealHeight;
    const max = total - view;
    const ty = track.y + Math.floor((track.h - th) * top / max);
    if (win55) {
      panelFrame(p, { x: x + 2, y: ty + 1, w: w - 3, h: th - 2 });
      p.fill(x + w - 2, ty + 1, 1, 1, C.win);
    } else box(p, { x, y: ty, w, h: th }, true);
  }
  hits.add(up, {
    click: () => onTop(Math.max(0, top - 1)),
    drawPressed: win55 ? (paint) => arrow(paint, up, true, true) : undefined,
  });
  hits.add(dn, {
    click: () => onTop(Math.min(Math.max(0, total - view), top + 1)),
    drawPressed: win55 ? (paint) => arrow(paint, dn, false, true) : undefined,
  });
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
function arrow(p, r, upward, pressed = false) {
  const win55 = theme === 'win-55';
  if (win55) {
    box(p, r, !pressed, C.btn, 2);
    if (pressed) {
      p.fill(r.x + r.w - 2, r.y + 1, 1, 1, C.lo);
      p.fill(r.x + 1, r.y + r.h - 2, 1, 1, C.lo);
    } else {
      p.fill(r.x + r.w - 2, r.y, 1, 1, C.btn);
      p.fill(r.x, r.y + r.h - 2, 1, 1, C.btn);
      p.fill(r.x + r.w - 1, r.y, 1, 1, C.lo);
      p.fill(r.x, r.y + r.h - 1, 1, 1, C.lo);
    }
  }
  const x = r.x + (win55 ? -1 : 0) + Number(pressed);
  const y = r.y + (win55 && upward ? 4 : 5) + Number(pressed);
  for (let i = 0; i < 4; i++) {
    if (upward) p.fill(x + 7 - i, y + i, 1 + 2 * i, 1, C.bright);
    else p.fill(x + 4 + i, y + i, 7 - 2 * i, 1, C.bright);
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

// The load bar: a 1 px sunken well, a fill of floor(share * 35) px, and the
// word `load`, `done` or `errr` in contrasting colors over the two parts of the bar. `load` is
// { state, share } or null, which draws nothing.
export function loadBar(p, x, y, load) {
  if (!load) return;
  const well = { x, y, w: LOAD_W, h: LOAD_H };
  p.fill(x, y, LOAD_W, LOAD_H, C.inset);
  p.bevel(well, 1, false);
  const fill = load.state === 'done' ? 35 : load.state === 'errr' ? 0 : Math.floor(Math.min(1, Math.max(0, load.share)) * 35);
  const inner = { x: x + 1, y: y + 1, w: fill, h: 9 };
  const win55 = theme === 'win-55';
  if (fill > 0) {
    if (win55) p.fill(inner.x, inner.y, inner.w, inner.h, C.sel);
    else p.dither(inner, C.sel, C.inset);
  }
  p.text(RV, x + 7, y + 2, load.state, win55 && load.state === 'errr' ? C.red : C.bright);
  if (fill > 0) {
    p.clip(inner);
    p.text(RV, x + 7, y + 2, load.state, win55 ? C.hi : C.dark);
    p.unclip();
  }
}

// The key bar: cells of equal width, 2 px apart, the key in a dark box and the name after it. A cell with `click` is
// a button; it is drawn sunken while one of its `codes` is in `held`.
// The held set of a tile that is not focused: its cells never sink.
export const NO_KEYS = Object.freeze(new Set());

// The fewest rows in which every cell holds its key and its whole name (`wide`, when a cell has one, is the longest
// name it may switch to, so the rows stay put when it does). Cells are equal and 2 px apart in a row of w px.
export function keyRows(cells, w) {
  const n = cells.length;
  const font = uiFont();
  const padding = theme === 'win-55' ? 12 : 10;
  const need = Math.max(...cells.map((k) =>
    textWidth(font, k.key) + Math.max(textWidth(font, k.label), textWidth(font, k.wide || k.label)) + padding));
  for (let rows = 1; rows < n; rows++) {
    const cols = Math.ceil(n / rows);
    if (Math.floor((w - 2 * (cols - 1)) / cols) >= need) return rows;
  }
  return n;
}

// `whole`: the bar holds (r.h + 2) / 16 rows of equal columns and every cell shows its key and its whole name (the
// player's bar, sized by keyRows). Otherwise one row, and a name that does not fit is cut to two letters.
export function keyBar(p, hits, r, cells, held, whole = false) {
  const rows = whole ? Math.max(1, Math.round((r.h + 2) / 16)) : 1;
  const cols = Math.ceil(cells.length / rows);
  const w = Math.floor((r.w - 2 * (cols - 1)) / cols);
  const ch = whole ? 14 : r.h;
  // A cell sinks only with its own modifiers: a Shift cell with Shift held, any other without Shift; a plain code
  // without Ctrl (a Ctrl key is held as 'Ctrl+' + code). So the environment's Shift combinations sink no tile cell.
  const shift = held.has('ShiftLeft') || held.has('ShiftRight');
  const ctrl = held.has('ControlLeft') || held.has('ControlRight');
  cells.forEach((k, i) => {
    const cell = { x: r.x + (i % cols) * (w + 2), y: r.y + Math.floor(i / cols) * 16, w, h: ch };
    const down = shift === k.key.startsWith('Shift+') && k.codes.some((c) => held.has(c) && (c.startsWith('Ctrl+') || !ctrl));
    const win55 = theme === 'win-55';
    const font = uiFont();
    const y = cell.y + (win55 ? Math.floor((cell.h - font.rows) / 2) : 3);
    box(p, cell, !down, down && !win55 ? C.inset : C.btn, win55 ? 2 : 1);
    if (win55) p.clip(cell);
    if (whole) {
      const key = fitText(font, k.key, w - 12);
      const kw = textWidth(font, key);
      p.fill(cell.x + 3, cell.y + 2, kw + 4, 10, C.dark);
      p.text(font, cell.x + 5, y, key, C.bright);
      const nx = cell.x + 3 + kw + 4 + 3;
      p.text(font, nx, y, fitText(font, k.label, cell.x + w - nx - (win55 ? 2 : 0)), C.text);
    } else {
      // A name that does not fit whole is cut to its first two letters, and the key gives way to them, down to one letter.
      let key = fitText(font, k.key, w - 14);
      let label = k.label;
      if (textWidth(font, label) > w - textWidth(font, key) - 16) {
        label = [...label].slice(0, 2).join('');
        key = fitText(font, k.key, Math.max(RV.advance, w - 16 - textWidth(font, label)));
      }
      const keyW = textWidth(font, key);
      p.fill(cell.x + 4, cell.y + 2, keyW + 6, 10, C.dark);
      p.text(font, cell.x + 7, y, key, C.bright);
      const nx = cell.x + 4 + keyW + 6 + 4;
      p.text(font, nx, y, fitText(font, label, cell.x + w - nx - 2), C.text);
    }
    if (win55) p.unclip();
    if (k.click) hits.add(cell, { click: k.click });
  });
}

// The screens that replace the workspace when the screen is too small or the device is a touch-first one: a tile with
// a title and lines of text, or the text alone, centered on the darkest surface.
export function messageScreen(p, size, title, lines) {
  p.fill(0, 0, size.w, size.h, C.dark);
  const lineList = Array.isArray(lines) ? lines : [lines];
  const head = title ? TITLE_H + 6 : 0;
  const win55 = theme === 'win-55';
  const font = uiFont();
  const w = win55 ? Math.min(size.w, 360) : 360;
  const h = 7 + head + 8 + lineList.length * 12 + 8 + 7;
  const frame = { x: Math.round((size.w - w) / 2), y: Math.round((size.h - h) / 2), w, h };
  box(p, frame, true, C.win, 2);
  if (title) {
    const tr = { x: frame.x + 7, y: frame.y + 7, w: frame.w - 14, h: TITLE_H };
    titleBackdrop(p, tr);
    titleLabel(p, tr, title, 20, win55 ? tr.w - 26 : Infinity);
  }
  const body = { x: frame.x + 7, y: frame.y + 7 + head, w: frame.w - 14, h: h - 14 - head };
  if (win55) box(p, body, false, C.inset, 2);
  else p.fill(body.x, body.y, body.w, body.h, C.inset);
  lineList.forEach((s, i) => p.text(font, body.x + 8, body.y + 8 + i * 12, win55 ? fitText(font, s, body.w - 16) : s, C.text));
}

// The desktop error stub, centered on the darkest surface: a 360 px box with the code's name on its title plate, the code
// in VGA 2x and the line in the body, and a key bar of one cell, `Enter Return to /`, whose `click` leaves the stub.
// `stub` is { code, line }. The cell is drawn sunken while Enter is in `held`.
export function errorScreen(p, hits, size, { code, line }, held, click) {
  const bounds = p.bounds();
  p.fill(bounds.x, bounds.y, bounds.w, bounds.h, C.dark);
  const bodyH = 48;
  const w = 360, h = 7 + 20 + bodyH + 2 + 14 + 7;
  const frame = { x: Math.round((size.w - w) / 2), y: Math.round((size.h - h) / 2), w, h };
  box(p, frame, true, C.win, 2);
  const win55 = theme === 'win-55';
  const font = uiFont();
  const name = ERRORS[code].name;
  const tr = { x: frame.x + 7, y: frame.y + 7, w: frame.w - 14, h: TITLE_H };
  titleBackdrop(p, tr);
  titleLabel(p, tr, name, 20, win55 ? tr.w - 26 : Infinity);
  const body = { x: frame.x + 7, y: frame.y + 27, w: frame.w - 14, h: bodyH };
  if (win55) box(p, body, false, C.inset, 2);
  else p.fill(body.x, body.y, body.w, body.h, C.inset);
  p.text(VGA, body.x + 10, body.y + 8, String(code), C.sel, 2);
  const lx = body.x + 10 + 54 + 12;
  p.text(font, lx, body.y + 20, fitText(font, line, body.x + body.w - 8 - lx), C.text);
  const cell = { x: body.x, y: body.y + body.h + 2, w: body.w, h: 14 };
  keyBar(p, hits, cell, [{ key: 'Enter', label: T.returnTo, codes: ['Enter'], click }], held);
}

// The foot panel: a sunken field with the line `text`, the load bar after it (2 px from the keyboard field, 1 px down),
// then the keyboard field: `Keyboard: app` in C.sel when `appKeys`, `Keyboard: —` in C.cov otherwise.
export function footBar(p, r, text, load, appKeys) {
  const font = uiFont();
  const y = r.y + (theme === 'win-55' ? Math.floor((r.h - font.rows) / 2) : 4);
  const kw = textWidth(font, T.keyboardApp) + 12;
  const kx = r.x + r.w - kw;
  const bx = kx - 2 - LOAD_W;
  const addr = { x: r.x, y: r.y, w: (load ? bx : kx) - 2 - r.x, h: r.h };
  p.fill(addr.x, addr.y, addr.w, addr.h, C.inset);
  p.bevel(addr, 1, false);
  p.text(font, addr.x + 4, y, fitText(font, text, addr.w - 8), C.bright);
  loadBar(p, bx, r.y + 1, load);
  p.fill(kx, r.y, kw, r.h, C.inset);
  p.bevel({ x: kx, y: r.y, w: kw, h: r.h }, 1, false);
  p.text(font, kx + 6, y, appKeys ? T.keyboardApp : T.keyboardNone, appKeys ? C.sel : C.cov);
}
