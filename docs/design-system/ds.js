// The design system: every drawing component of the site on its own canvas, drawn by the site's own modules.
// Nothing here draws a component itself. This file only gives each component a canvas, the pointer and the keys,
// a network it can slow down, and fixtures in place of the published content.
import { C } from '../../site/js/theme.js';
import * as M from '../../site/js/metrics.js';
import { Paint } from '../../site/js/paint.js';
import { RV, VGA } from '../../site/js/font.js';
import { RV_FONT, VGA_9X16 } from '../../site/js/font_data.js';
import { Hits, box, panelFrame, wellFrame, scrollbar, loadBar, keyBar, keyRows, footBar, messageScreen, errorScreen, NO_KEYS } from '../../site/js/widgets.js';
import * as L from '../../site/js/layout.js';
import { Workspace, LoadingBody, MessageBody } from '../../site/js/workspace.js';
import { PmcPane } from '../../site/js/pmc.js';
import { NoteBody } from '../../site/js/note.js';
import { Player } from '../../site/js/media.js';
import { ImageView } from '../../site/js/image.js';
import { AppPane } from '../../site/js/app.js';
import { KIND, list, setOf, urlOf, linkPath, linkOf } from '../../site/js/catalog.js';
import { view } from '../../site/js/view.js';
import { T, ERRORS, LINK_LINES, PMC_KEYS, PLAYER_KEYS, IMAGE_KEYS, NOTE_KEYS, APP_KEYS } from '../../site/js/texts.js';
import { NET, params } from './net.js';

// ---- the network: net.js ------------------------------------------------------------------------------------------

view.ui = Number(params.get('ui')) || 2;
view.dpr = devicePixelRatio || 1;

// ---- stages --------------------------------------------------------------------------------------------------------

const stages = [];

// A canvas for one scene, `w` x `h` layout pixels. A layout pixel is `ui` device pixels: the page's scale, or the
// stage's own. The buffer and the pointer follow the rules of main.js.
class Stage {
  constructor(el, { w, h, ui, make }) {
    this.el = el;
    this.w = w;
    this.h = h;
    this.ui = ui;
    this.queued = false;
    this.canvas = document.createElement('canvas');
    this.canvas.tabIndex = 0;
    el.append(this.canvas);
    this.scene = make(this);
    this.held = this.scene.held || new Set();
    this.listen();
    this.draw();
  }

  get scale() { return this.ui ?? view.ui; }

  get focused() { return document.activeElement === this.canvas; }

  draw() {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => this.frame());
  }

  frame() {
    this.queued = false;
    const s = this.scale, d = devicePixelRatio || 1, c = this.canvas;
    c.width = Math.round(this.w * s);
    c.height = Math.round(this.h * s);
    c.style.width = c.width / d + 'px';
    c.style.height = c.height / d + 'px';
    // The app frames are placed by view.ui; the workspace sets the browser tab's title, which is the page's here.
    const ui = view.ui, title = document.title;
    view.ui = s;
    view.dpr = d;
    this.scene.render(new Paint(c.getContext('2d'), s), this.w, this.h, this);
    view.ui = ui;
    document.title = title;
    adopt(this, this.scene.apps?.() || []);
    c.style.cursor = this.scene.cursorHidden?.() ? 'none' : '';
    if (this.scene.animated?.()) this.draw();
  }

  point(e) {
    const r = this.canvas.getBoundingClientRect();
    const k = (devicePixelRatio || 1) / this.scale;
    return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
  }

  listen() {
    const c = this.canvas, s = this.scene;
    const on = (type, fn, opts) => c.addEventListener(type, (e) => { fn(e); this.draw(); }, opts);
    on('pointerdown', (e) => { c.focus(); c.setPointerCapture(e.pointerId); s.down?.(...this.point(e)); });
    on('pointermove', (e) => s.move?.(...this.point(e)));
    on('pointerup', (e) => s.up?.(...this.point(e)));
    on('pointercancel', (e) => s.up?.(...this.point(e)));
    on('dblclick', (e) => s.dbl?.(...this.point(e)));
    on('wheel', (e) => { if (s.wheel?.(...this.point(e), e.deltaY)) e.preventDefault(); }, { passive: false });
    on('keydown', (e) => {
      (e.ctrlKey ? [e.code, 'Ctrl+' + e.code] : [e.code]).forEach((k) => this.held.add(k));
      const ui = view.ui;
      if (s.key?.(e)) e.preventDefault();
      if (view.ui !== ui) { syncScaleButtons(); redrawAll(); }
    });
    on('keyup', (e) => { this.held.delete(e.code); this.held.delete('Ctrl+' + e.code); });
    on('focus', () => {});
    on('blur', () => this.held.clear());
  }
}

function redrawAll() { for (const st of stages) st.draw(); }

// An app's frame is put in the page by AppPane, placed in canvas coordinates. It goes into its stage at once, before
// its index.html arrives: moving a loaded iframe would reload it.
function adopt(st, apps) {
  for (const app of apps) if (app.wrap.parentNode !== st.el) st.el.append(app.wrap);
}

// The pointer rules of Workspace.pointerDown for a scene that is not a workspace: a press starts a drag, a click runs,
// and the held button is drawn sunk until the pointer is up.
class Router {
  hits = new Hits();
  drag = null;
  pressed = null;
  down(x, y) {
    const top = this.hits.at(x, y);
    if (top?.on.press) { const d = top.on.press(x, y); this.drag = typeof d === 'function' ? { move: d } : d || null; }
    else if (top?.on.click) { this.pressed = top.r; top.on.click(x, y); }
  }
  move(x, y) { this.drag?.move?.(x, y); }
  up(x, y) { this.drag?.up?.(x, y); this.drag = null; this.pressed = null; }
  wheel(x, y, dy) { const h = this.hits.find(x, y, 'wheel'); if (h) h.on.wheel(dy); return !!h; }
}

// The sunk look of the held button, as Workspace.render draws it.
function sink(p, hits, pressed) {
  const same = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  const held = pressed && hits.list.find((h) => h.on.click && same(h.r, pressed));
  if (held) p.bevel(held.r, 2, false);
}

// A drawing of widgets: draw(p, hits, W, H, st) is called every frame on the main surface.
function drawing(draw, animated) {
  return (st) => {
    const r = new Router();
    return {
      render(p, W, H) {
        r.hits = new Hits();
        p.fill(0, 0, W, H, C.win);
        draw(p, r.hits, W, H, st);
        sink(p, r.hits, r.pressed);
      },
      down: (x, y) => r.down(x, y), move: (x, y) => r.move(x, y), up: (x, y) => r.up(x, y),
      wheel: (x, y, dy) => r.wheel(x, y, dy),
      // A focused widget stage keeps every key but Tab, so held arrows and Space sink cells instead of scrolling the page.
      key: (e) => e.code !== 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey,
      animated,
    };
  };
}

// The part of a workspace a tile body sees. The body draws, reads the held keys and asks for frames; opening other
// tiles is the workspace's, so here it does nothing (the Environment stage has the whole workspace).
function workspaceFor(st, extra = {}) {
  return {
    requestDraw: () => st.draw(), drawHeld: NO_KEYS, frame: 0, fullVideo: null, progressOf: () => 'none',
    closeApp() {}, openFile() {}, openApp() {}, ...extra,
  };
}

// A tile body alone, in the stage less a margin. `make(ws)` returns the body or a promise of it; meanwhile the stage
// shows the workspace's LoadingBody, and a failure its MessageBody; the error itself goes to the console, so a broken
// stage is never taken for a folder that could not be read. Keys go to the body while the canvas has focus.
function tileBody(make, { focused = true, margin = 4, ws: extra } = {}) {
  return (st) => {
    const ws = workspaceFor(st, extra);
    const r = new Router();
    let body = new LoadingBody(ws);
    Promise.resolve().then(() => make(ws)).then(
      (b) => { body = b; adopt(st, b instanceof AppPane ? [b] : []); st.draw(); },
      (err) => { console.error(`stage "${st.el.dataset.demo}":`, err); body = new MessageBody(T.folderError); st.draw(); },
    );
    return {
      render(p, W, H) {
        p.fill(0, 0, W, H, C.win);
        const rect = { x: margin, y: margin, w: W - 2 * margin, h: H - 2 * margin };
        r.hits = new Hits();
        ws.frame++;
        ws.drawHeld = st.focused ? st.held : NO_KEYS;
        p.clip(rect);
        r.hits.clip(rect);
        body.draw(p, rect, r.hits, focused);
        r.hits.unclip();
        p.unclip();
        sink(p, r.hits, r.pressed);
      },
      key: (e) => body.key?.(e),
      down: (x, y) => r.down(x, y), move: (x, y) => r.move(x, y), up: (x, y) => r.up(x, y),
      wheel: (x, y, dy) => r.wheel(x, y, dy),
      animated: () => !!(body.animated?.() || body.quick?.view?.animated?.()),
      apps: () => (body instanceof AppPane ? [body] : []),
    };
  };
}

// A workspace without the start screen: a stage builds its own layout.
class DemoWorkspace extends Workspace { setup() {} }

let tiles = 0;
function addTile(ws, body, label, tab = label) {
  const id = 'd' + ++tiles;
  ws.panes.set(id, { id, body, label, tab });
  return id;
}

// A plain body for the chrome stages: a sunken field with a word in it.
class Blank {
  constructor(text) { this.text = text; this.minimum = M.PANE_MIN.generic; }
  draw(p, r) { p.fill(r.x, r.y, r.w, r.h, C.inset); p.text(RV, r.x + 6, r.y + 6, this.text, C.dim); }
}

// The message line and the environment bar take this much under the tiles (two margins of 4 px, then the bars).
const BARS = 2 * 4 + M.MSG_H + M.ENV_H;

// A real workspace on a stage. `build(ws)` makes its layout; `real` keeps the site's start screen. `tilesOnly` draws the
// tiles without the bars, `bars` the bars alone; `fixed` makes the stage a picture that takes no pointer.
function workspace(build, { real = false, tilesOnly = false, bars = false, fixed = false, before } = {}) {
  return (st) => {
    const ws = real ? new Workspace(() => st.draw()) : new DemoWorkspace(() => st.draw());
    const openApp = ws.openApp.bind(ws);
    ws.openApp = (...args) => { openApp(...args); adopt(st, ws.apps()); };
    if (build) build(ws, st);
    const preset = new Set(ws.held);
    if (!fixed) ws.held = st.held = new Set();
    return {
      held: fixed ? undefined : ws.held,
      render(p, W, H) {
        if (before) before(ws, W, H);
        if (fixed) ws.held = new Set([...preset, ...st.held]);
        if (bars) { p.fill(0, 0, W, H, C.dark); ws.drawBars(p, W, H); return; }
        if (!tilesOnly) { ws.render(p, W, H); return; }
        ws.hits = new Hits();
        ws.tiles = [];
        ws.frame++;
        ws.renderTiles(p, W, H + BARS);
        sink(p, ws.hits, ws.pressed);
        for (const app of ws.apps()) if (app.drawnAt !== ws.frame) app.hide();
      },
      ...(fixed ? {} : {
        down: (x, y) => ws.pointerDown(x, y), move: (x, y) => ws.pointerMove(x, y), up: (x, y) => ws.pointerUp(x, y),
        wheel: (x, y, dy) => ws.wheel(x, y, dy), dbl: (x, y) => ws.doubleClick(x, y), key: (e) => ws.key(e),
      }),
      animated: () => ws.animated(),
      cursorHidden: () => ws.cursorHidden(),
      apps: () => ws.apps(),
      ws,
    };
  };
}

// A click into an app's frame takes the keys from the canvas: the stage's workspace focuses that app's tile (main.js).
addEventListener('blur', () => {
  const el = document.activeElement;
  if (el?.tagName !== 'IFRAME') return;
  for (const st of stages) { st.scene.ws?.focusApp(el); st.draw(); }
});
addEventListener('message', (e) => {
  for (const st of stages) for (const app of st.scene.apps?.() || []) app.message(e);
});
// Leaving the browser's fullscreen (Esc) returns a fullscreen video to its tile, as in main.js.
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) return;
  for (const st of stages) if (st.scene.ws && st.el.dataset.demo === 'environment') { st.scene.ws.fullVideo = null; st.draw(); }
});

// ---- helpers for the stages ----------------------------------------------------------------------------------------

function label(p, x, y, s, color = C.dim) { p.text(RV, x, y, s, color); }

async function setIn(dir, kind) { return setOf(await list(dir), kind); }

// Opens a folder in a pmc panel and puts the cursor on a name.
async function cd(pmc, i, dir, name) {
  const panel = pmc.panels[i];
  panel.dir = dir;
  await pmc.reload(i);
  if (name) panel.cursor = Math.max(0, pmc.items(panel).findIndex((e) => e.name === name));
}

// The key bars of the tiles, with the keys that sink their cells. This is a copy of the cells the tiles build (the
// labels come from texts.js, the codes are written here); the tiles' own bars are drawn on their stages under Tiles.
const PLAYER_CELLS = [
  { ...PLAYER_KEYS.prev, codes: ['KeyP'] }, { ...PLAYER_KEYS.play, wide: PLAYER_KEYS.pause.label, codes: ['Space'] },
  { ...PLAYER_KEYS.stop, codes: ['KeyS'] }, { ...PLAYER_KEYS.next, codes: ['KeyN'] }, { ...PLAYER_KEYS.mute, codes: ['KeyM'] },
  { ...PLAYER_KEYS.seek, codes: ['ArrowRight', 'ArrowLeft'] }, { ...PLAYER_KEYS.volume, codes: ['ArrowUp', 'ArrowDown'] },
];
const BARS_OF = {
  pmc: PMC_KEYS.map((k, i) => ({ ...k, codes: [['Enter'], ['F3'], ['Tab'], ['Ctrl+PageUp'], []][i] })),
  Player: PLAYER_CELLS,
  Video: [...PLAYER_CELLS.slice(0, 5), { ...PLAYER_KEYS.loop, codes: ['KeyL'] }, ...PLAYER_CELLS.slice(5), { ...PLAYER_KEYS.full, codes: ['KeyF'] }],
  Image: [{ ...IMAGE_KEYS.prev, codes: ['ArrowLeft', 'KeyP'] }, { ...IMAGE_KEYS.next, codes: ['ArrowRight', 'KeyN'] }],
  Note: [
    { ...NOTE_KEYS.scroll, codes: ['ArrowUp', 'ArrowDown'] }, { ...NOTE_KEYS.edge, codes: ['Home', 'End'] },
  ],
  App: [{ ...APP_KEYS.close, codes: ['KeyQ'] }, { ...APP_KEYS.restart, codes: ['Digit0'] }, { ...APP_KEYS.full, codes: ['KeyF'] }],
};

// The rows of the key-bar stage. The player and video bars are `whole`: their rows come from keyRows at the width, as in
// the tiles (M9); the others stay one row, a name that does not fit cut to two letters. `keys` fixes the held keys.
const KEYBAR_W = 700;
const KEYBARS = [];
const oneRow = (name, cells, keys) => KEYBARS.push({ name, cells, w: KEYBAR_W, rows: 1, whole: false, keys });
const wholeRows = (title, cells, w, keys) => {
  const rows = keyRows(cells, w);
  KEYBARS.push({ name: `${title}, ${w} px, ${rows} ${rows === 1 ? 'row' : 'rows'}`, cells, w, rows, whole: true, keys });
};
oneRow('pmc', BARS_OF.pmc);
oneRow('Image', BARS_OF.Image);
oneRow('Note', BARS_OF.Note);
oneRow('App', BARS_OF.App);
for (const w of [M.PANE_MIN.player.w, 440, KEYBAR_W]) wholeRows(w === M.PANE_MIN.player.w ? 'Player, the minimum' : 'Player', BARS_OF.Player, w);
for (const w of [M.PANE_MIN.video.w, 440]) wholeRows(w === M.PANE_MIN.video.w ? 'Video, the minimum' : 'Video', BARS_OF.Video, w);
wholeRows('held: S (a plain key sinks its cell), Player', BARS_OF.Player, 440, new Set(['KeyS']));
oneRow('held: Shift+0 (a Shift cell sinks only with Shift)', BARS_OF.App, new Set(['ShiftLeft', 'Digit0']));
const KEYBARS_H = 4 + KEYBARS.reduce((h, k) => h + 11 + (k.rows * 16 - 2) + 5, 0);

const glyphs = (font) => Object.keys(font).map(Number).filter((c) => c > 0).sort((a, b) => a - b);
const RV_CODES = glyphs(RV_FONT), VGA_CODES = glyphs(VGA_9X16);
const PER_ROW = 32;

const picture = new Image();
picture.src = urlOf('images/sprite-48.png');
picture.addEventListener('load', redrawAll);
const favicons = ['16', '32'].map((n) => Object.assign(new Image(), { src: `../../site/favicon-${n}.png` }));
favicons.forEach((img) => img.addEventListener('load', redrawAll));

// ---- the stages ----------------------------------------------------------------------------------------------------

// Each stage: its size in layout pixels, an optional fixed scale, and the scene.
// The pmc stages: the pmc minimum and a little room around its tile.
const PMC_W = M.PANE_MIN.pmc.w + 28;

const DEMOS = {
  // Foundations
  palette: { w: 664, h: 224, make: drawing((p) => {
    const groups = [
      ['Editor tokens and vgui2-deck states', ['win', 'inset', 'btn', 'sel', 'hi', 'lo', 'dark', 'text', 'bright', 'dim']],
      ['Catppuccin Mocha, the navy wells', ['cb', 'crust', 'ct', 'cs', 'csurf', 'cov', 'cur', 'green', 'teal', 'peach', 'blue', 'mauve', 'yellow', 'red']],
    ];
    let y = 6;
    for (const [title, keys] of groups) {
      label(p, 6, y, title, C.bright);
      y += 12;
      keys.forEach((k, i) => {
        const r = { x: 6 + (i % 7) * 94, y: y + Math.floor(i / 7) * 46, w: 88, h: 22 };
        p.fill(r.x, r.y, r.w, r.h, C[k]);
        p.bevel(r, 1, false);
        label(p, r.x, r.y + 25, 'C.' + k, C.text);
        label(p, r.x, r.y + 34, C[k]);
      });
      y += Math.ceil(keys.length / 7) * 46 + 4;
    }
  }) },
  'type-rv': { w: 336, h: 30 + Math.ceil(RV_CODES.length / PER_ROW) * 12 + 70, make: drawing((p) => {
    label(p, 6, 6, `rv_font 5x7 in an 8x8 cell, advance 6 · ${RV_CODES.length} glyphs`, C.bright);
    RV_CODES.forEach((code, i) => p.text(RV, 6 + (i % PER_ROW) * 10, 22 + Math.floor(i / PER_ROW) * 12, String.fromCodePoint(code), C.text));
    let y = 26 + Math.ceil(RV_CODES.length / PER_ROW) * 12;
    p.text(RV, 6, y, 'Regular', C.text);
    p.text(RV, 60, y, 'Bold', C.bright, 1, true);
    p.text(RV, 100, y, 'Italic', C.text, 1, false, true);
    p.text(RV, 150, y, 'Rules: a·b│c─d—e', C.text);
    y += 14;
    p.text(RV, 6, y, 'Heading 2x', C.bright, 2);
    y += 22;
    p.text(RV, 6, y, 'No glyph: “quotes” → × …  (drawn as their ASCII forms)', C.dim);
  }) },
  'type-vga': { w: 6 + PER_ROW * 10 + 6, h: 30 + Math.ceil(VGA_CODES.length / PER_ROW) * 18 + 50, make: drawing((p, hits, W, H) => {
    p.fill(0, 0, W, H, C.cb);
    label(p, 6, 6, `PxPlus IBM VGA 9x16 · ${VGA_CODES.length} glyphs, drawn 9 px apart here`, C.ct);
    VGA_CODES.forEach((code, i) => p.text(VGA, 6 + (i % PER_ROW) * 10, 20 + Math.floor(i / PER_ROW) * 18, String.fromCodePoint(code), C.ct));
    const y = 26 + Math.ceil(VGA_CODES.length / PER_ROW) * 18;
    p.text(VGA, 6, y, '00:42', C.green, 2);
    p.text(VGA, 110, y + 8, 'code in a note, 1x', C.ct);
  }) },
  kinds: { w: 560, h: 30, make: drawing((p, hits, W, H) => {
    p.fill(0, 0, W, H, C.inset);
    Object.entries(KIND).forEach(([kind, k], i) => {
      const x = 6 + i * 68;
      p.text(RV, x, 6, k.code, C[k.color]);
      label(p, x + 16, 6, kind, C.text);
      label(p, x, 17, 'C.' + k.color);
    });
  }) },
  // The same bar at the three UI scales; 1.5x drops or doubles font pixels.
  'scale-1': { w: 960, h: 42, ui: 1, make: workspace((ws) => { ws.msg = 'UI scale 1x'; }, { bars: true, fixed: true }) },
  'scale-15': { w: 960, h: 42, ui: 1.5, make: workspace((ws) => { ws.msg = 'UI scale 1.5x'; }, { bars: true, fixed: true }) },
  'scale-2': { w: 960, h: 42, ui: 2, make: workspace((ws) => { ws.msg = 'UI scale 2x'; }, { bars: true, fixed: true }) },

  // Primitives
  frames: { w: 640, h: 76, make: drawing((p) => {
    const cells = [
      ['raised 1', (r) => { p.fill(r.x, r.y, r.w, r.h, C.btn); p.bevel(r, 1, true); }],
      ['raised 2', (r) => { p.fill(r.x, r.y, r.w, r.h, C.win); p.bevel(r, 2, true); }],
      ['sunken 1', (r) => { p.fill(r.x, r.y, r.w, r.h, C.inset); p.bevel(r, 1, false); }],
      ['sunken 2', (r) => { p.fill(r.x, r.y, r.w, r.h, C.inset); p.bevel(r, 2, false); }],
      ['box', (r) => box(p, r, true)],
      ['box, on', (r) => box(p, r, false, C.inset, 2)],
      ['panelFrame', (r) => { const i = panelFrame(p, { ...r, w: r.w - 1, h: r.h - 1 }); p.fill(i.x, i.y, i.w, i.h, C.btn); }],
      ['wellFrame', (r) => wellFrame(p, r)],
    ];
    cells.forEach(([name, draw], i) => {
      const r = { x: 6 + i * 79, y: 8, w: 70, h: 44 };
      draw(r);
      label(p, r.x, 58, name);
    });
  }) },
  dithers: { w: 640, h: 60, make: drawing((p) => {
    const cells = [
      ['title bar', C.win, C.lo], ['scroll, volume', C.inset, C.lo], ['load fill', C.sel, C.inset],
      ['drop preview', C.win, C.sel], ['h2 rule', C.lo, C.inset],
    ];
    cells.forEach(([name, a, b], i) => {
      const r = { x: 6 + i * 126, y: 8, w: 118, h: 28 };
      p.dither(r, a, b);
      label(p, r.x, 42, name);
    });
  }) },
  slant: { w: 640, h: 44, make: drawing((p) => {
    p.fill(0, 4, 230, 22, C.inset);
    p.slant(6, 8, 60, 14, 6, C.sel);
    p.slant(80, 8, 60, 14, 6, C.win);
    p.slant(154, 8, 60, 14, 12, C.dim);
    label(p, 6, 28, 'Paint.slant: skew 6, the tabs; skew 12. Every row moves by whole pixels, the edges are steps.');
  }) },
  pixels: { w: 640, h: 150, make: drawing((p) => {
    if (!picture.complete || !picture.naturalWidth) { label(p, 6, 6, T.loading); return; }
    let x = 6;
    for (const s of [1, 2, 4]) {
      p.image(picture, x, 8, 48 * s, 32 * s);
      label(p, x, 14 + 32 * s, `${s}x`);
      x += 48 * s + 16;
    }
    label(p, x, 8, 'Paint.image: no smoothing,');
    label(p, x, 18, 'a pixel is a block');
  }) },

  // Widgets
  scrollbars: { w: 640, h: 140, make: (st) => {
    const tops = [0, 15, 30, 0];
    const totals = [40, 40, 40, 5];
    return drawing((p, hits) => {
      tops.forEach((top, i) => {
        const x = 6 + i * 110;
        const r = { x, y: 8, w: 14, h: 110 };
        scrollbar(p, hits, r, { top, view: 10, total: totals[i], onTop: (t) => { tops[i] = t; } });
        label(p, x + 20, 8, totals[i] > 10 ? `top ${top} of 30` : 'all shown,', C.text);
        label(p, x + 20, 18, totals[i] > 10 ? 'drag or click' : 'no thumb');
      });
    })(st);
  } },
  loadbars: { w: 640, h: 36, make: drawing((p) => {
    const states = [
      ['load 0', { state: 'load', share: 0 }], ['load 0.35', { state: 'load', share: 0.35 }],
      ['load 0.8', { state: 'load', share: 0.8 }], ['done', { state: 'done', share: 1 }], ['errr', { state: 'errr', share: 0 }],
    ];
    states.forEach(([name, load], i) => {
      loadBar(p, 6 + i * 70, 8, load);
      label(p, 6 + i * 70, 24, name);
    });
    label(p, 356, 8, 'null draws nothing', C.text);
  }) },
  'loadbar-motion': { w: 320, h: 28, make: drawing((p) => {
    // 2 s from 0 to 1, then 1 s of done: the bar of a file that arrives.
    const t = (performance.now() % 3000) / 2000;
    loadBar(p, 6, 8, t < 1 ? { state: 'load', share: t } : { state: 'done', share: 1 });
    label(p, 52, 10, t < 1 ? `share ${t.toFixed(2)}` : 'done', C.text);
  }, () => true) },
  keybars: { w: KEYBAR_W + 12, h: KEYBARS_H, make: drawing((p, hits, W, H, st) => {
    const held = st.focused ? st.held : NO_KEYS;
    let y = 4;
    for (const k of KEYBARS) {
      const h = k.rows * 16 - 2;
      label(p, 6, y, k.name, C.text);
      keyBar(p, hits, { x: 6, y: y + 11, w: k.w, h }, k.cells, k.keys || held, k.whole);
      y += 11 + h + 5;
    }
  }) },
  footbars: { w: 600, h: 70, make: drawing((p, hits, W) => {
    footBar(p, { x: 6, y: 6, w: W - 12, h: 14 }, 'testcard-1280.png · PNG · 93K · 3 of 3', { state: 'load', share: 0.4 }, false);
    footBar(p, { x: 6, y: 26, w: W - 12, h: 14 }, 'index.html', { state: 'done', share: 1 }, true);
    footBar(p, { x: 6, y: 46, w: W - 12, h: 14 }, 'without a download, the keys with the tile', null, false);
  }) },
  'screen-small': { w: 400, h: 110, make: drawing((p, hits, W, H) => {
    messageScreen(p, { w: W, h: H }, T.tooSmallTitle, [`${T.tooSmallNeeds} ${M.SCREEN_MIN.w}×${M.SCREEN_MIN.h}`, `${T.tooSmallNow} 800×600`, T.tooSmallHint]);
  }) },

  // The error screen, a stage per code and per link line: Enter sinks the cell while the stage is focused, a click only redraws.
  ...Object.fromEntries([
    ...Object.entries(ERRORS).map(([code, e]) => [`error-${code}`, code, e.line]),
    ['error-link-404', 404, LINK_LINES[404]('track_09.mp3')],
    ['error-link-415', 415, LINK_LINES[415]('plain.txt')],
  ].map(([id, code, line]) => [id, { w: 400, h: 110, make: drawing((p, hits, W, H, st) => {
    errorScreen(p, hits, { w: W, h: H }, { code, line }, st.focused ? st.held : NO_KEYS, () => {});
  }) }])),

  // The workspace
  tiles: { w: 720, h: 150, make: workspace((ws) => {
    const a = addTile(ws, new Blank('focused'), 'Note');
    const b1 = addTile(ws, new Blank('a tab behind'), 'Image');
    const b2 = addTile(ws, new Blank('the front tab'), 'Player');
    const b3 = addTile(ws, new Blank('a tab behind'), 'Video');
    const c = addTile(ws, new Blank('the title is cut to the bar'), 'a-very-long-application-name.exe', 'App');
    ws.L = L.newLayout(L.split('h', L.leaf([a]), L.split('h', L.leaf([b1, b2, b3]), L.leaf([c]))));
    ws.L.root.ratio = 0.3;
    ws.setFocus(b2);
    ws.setFocus(a);
  }, { tilesOnly: true }) },
  maximized: { w: 360, h: 110, make: workspace((ws) => {
    const a = addTile(ws, new Blank('M is pressed while maximized'), 'Note');
    const b = addTile(ws, new Blank(''), 'pmc');
    ws.L = L.newLayout(L.split('h', L.leaf([a]), L.leaf([b])));
    ws.setFocus(a);
    ws.L.max = a;
  }, { tilesOnly: true, fixed: true }) },
  'drop-edge': { w: 360, h: 120, make: dropAt(0.95, 0.5) },
  'drop-stack': { w: 360, h: 120, make: dropAt(0.75, 0.97) },
  'bars-message': { w: 960, h: 42, make: workspace((ws) => { ws.msg = T.minWidth('pmc', 540); }, { bars: true, fixed: true }) },
  'bars-shift': { w: 960, h: 42, make: workspace((ws) => { ws.held = new Set(['ShiftLeft', 'KeyR']); }, { bars: true, fixed: true }) },
  'bars-move': { w: 960, h: 42, make: workspace((ws) => { ws.held = new Set(['ShiftLeft', 'ControlLeft', 'ArrowLeft']); ws.msg = T.moveHint; }, { bars: true, fixed: true }) },
  'bars-resize': { w: 960, h: 42, make: workspace((ws) => { ws.mode = 'resize'; ws.msg = T.resizeHint; }, { bars: true, fixed: true }) },
  favicon: { w: 200, h: 44, make: drawing((p) => {
    const [f16, f32] = favicons;
    if (f16.complete) p.image(f16, 6, 8, 16, 16);
    if (f32.complete) p.image(f32, 30, 8, 32, 32);
    label(p, 70, 8, 'favicon-16.png', C.text);
    label(p, 70, 18, 'favicon-32.png');
  }) },

  // The tiles
  pmc: { w: PMC_W, h: 260, make: tileBody((ws) => new PmcPane(ws)) },
  'pmc-image': { w: PMC_W, h: 260, make: tileBody(async (ws) => {
    const pmc = new PmcPane(ws);
    await cd(pmc, 0, 'images', 'testcard-1280.png');
    pmc.showQuick(0, pmc.cursorItem(0));
    return pmc;
  }) },
  'pmc-audio': { w: PMC_W, h: 300, make: tileBody(async (ws) => {
    const pmc = new PmcPane(ws);
    await cd(pmc, 0, 'music', '01 brass-hum.mp3');
    pmc.showQuick(0, pmc.cursorItem(0));
    return pmc;
  }) },
  'pmc-video': { w: PMC_W, h: 360, make: quick('video', 'testcard.webm') },
  'pmc-note': { w: PMC_W, h: 200, make: quick('notes', 'short.md') },
  'pmc-other': { w: PMC_W, h: 160, make: quick('notes', 'plain.txt') },
  'pmc-folder': { w: PMC_W, h: 200, make: tileBody(async (ws) => {
    const pmc = new PmcPane(ws);
    await cd(pmc, 0, '', 'apps');
    pmc.showQuick(0, pmc.cursorItem(0));
    pmc.switchPanel();
    return pmc;
  }) },
  'pmc-states': { w: PMC_W, h: 200, make: tileBody(async (ws) => {
    const pmc = new PmcPane(ws);
    await cd(pmc, 0, 'locked');
    await cd(pmc, 1, '');
    pmc.act = 1;
    pmc.search(1, 'm');
    pmc.search(1, 'u');
    return pmc;
  }) },
  'pmc-unfocused': { w: PMC_W, h: 200, make: tileBody(async (ws) => {
    const pmc = new PmcPane(ws);
    await cd(pmc, 0, 'notes', 'short.md');
    await cd(pmc, 1, 'empty');
    return pmc;
  }, { focused: false }) },
  note: { w: 640, h: 520, make: tileBody((ws) => new NoteBody(ws, 'readme.md'), {
    // The tutorial's marks: the first two actions done, the third the next one.
    ws: { progressOf: (a) => (['focus', 'open'].includes(a.done) ? 'done' : a.done === 'move' ? 'next' : 'none') },
  }) },
  'note-narrow': { w: 300, h: 400, make: tileBody((ws) => new NoteBody(ws, 'readme.md')) },
  'note-error': { w: 300, h: 90, make: tileBody((ws) => new NoteBody(ws, 'notes/missing.md')) },
  player: { w: 440, h: 250, make: tileBody(async (ws) => new Player(ws, 'audio', 'music', await setIn('music', 'audio'), 0)) },
  video: { w: 440, h: 340, make: tileBody(async (ws) => new Player(ws, 'video', 'video', await setIn('video', 'video'), 0)) },
  'video-full': { w: 480, h: 270, make: (st) => {
    let player = null;
    const scene = workspace(async (ws) => {
      player = new Player(ws, 'video', 'video', await setIn('video', 'video'), 0);
      // The browser's fullscreen would take the whole page; here the stage is the screen.
      player.fullscreen = () => { ws.fullVideo = ws.fullVideo ? null : player; ws.requestDraw(); return true; };
      const id = addTile(ws, player, 'Video');
      ws.L = L.newLayout(L.leaf([id]));
      ws.setFocus(id);
      ws.fullVideo = player;
      ws.showPanel();
    })(st);
    return scene;
  } },
  image: { w: 440, h: 300, make: tileBody(async (ws) => new ImageView(ws, 'images', await setIn('images', 'image'), 2)) },
  'image-small': { w: 440, h: 120, make: tileBody(async (ws) => new ImageView(ws, 'images', await setIn('images', 'image'), 1)) },
  'image-error': { w: 440, h: 90, make: tileBody(async (ws) => new ImageView(ws, 'images', await setIn('images', 'image'), 0)) },
  app: { w: 440, h: 260, make: tileBody((ws) => new AppPane(ws, 'apps', 'demo.exe')) },
  'app-error': { w: 440, h: 90, make: tileBody((ws) => new AppPane(ws, 'apps', 'broken.exe')) },
  'body-loading': { w: 300, h: 24, make: tileBody((ws) => new LoadingBody(ws)) },
  'body-noviewer': { w: 300, h: 24, make: tileBody(() => new MessageBody(T.noViewer)) },
  'body-error': { w: 300, h: 24, make: tileBody(() => new MessageBody(T.loadError + 'notes/plain.txt')) },

  // The whole environment on the fixtures, as main.js runs it.
  environment: { w: 960, h: 540, make: workspace(null, { real: true }) },
};

// pmc with the F3 quick view of a file: the cursor on `name` in `dir`, the view in the other panel.
function quick(dir, name) {
  return tileBody(async (ws) => {
    const pmc = new PmcPane(ws);
    await cd(pmc, 0, dir, name);
    pmc.showQuick(0, pmc.cursorItem(0));
    return pmc;
  });
}

// A picture of a drag: two tiles and the drop preview where the pointer would be, at a share of the second tile.
function dropAt(fx, fy) {
  return workspace((ws) => {
    const a = addTile(ws, new Blank('dragged'), 'Image');
    const b = addTile(ws, new Blank(''), 'pmc');
    ws.L = L.newLayout(L.split('h', L.leaf([a]), L.leaf([b])));
    ws.setFocus(a);
    ws.drag = {};
    ws.msg = T.dragHint;
  }, {
    tilesOnly: true, fixed: true,
    before: (ws, W, H) => {
      const leaves = L.place(ws.L.root, { x: 4, y: 4, w: W - 8, h: H - 8 }, (id) => ws.minOf(id)).leaves;
      const r = leaves[1].rect;
      ws.dropAt = L.dropTarget(leaves, r.x + r.w * fx, r.y + r.h * fy);
    },
  });
}

// ---- the page ------------------------------------------------------------------------------------------------------

// The metrics table is the module's own exports, so it cannot fall behind metrics.js.
const metrics = document.querySelector('[data-metrics]');
if (metrics) {
  metrics.innerHTML = '<tr><th>Constant</th><th>Value</th></tr>' + Object.entries(M)
    .map(([k, v]) => `<tr><td><code>${k}</code></td><td><code>${JSON.stringify(v)}</code></td></tr>`).join('');
}

// The links table runs the site's own link check over the inputs of the acceptance criteria.
const links = document.querySelector('[data-links]');
if (links) {
  const inputs = ['?open=music/ambient/track_01.mp3', '?open=video/teaser.webm', '?open=images/poster.jpg', '?open=games/plug-run.exe',
    '?open=music', '?open=about.md', '?open=music/01%20brass-hum.mp3', '?open=../etc/passwd', '?open=a//b', '?open=./x',
    '?open=a%5Cb', '?open=a:b', '?open=', '?open=music/', ''];
  const result = (r) => (r === null ? 'no open parameter: the start screen' : r.code ? `${r.code} ${ERRORS[r.code].name}: ${ERRORS[r.code].line}` : `opens ${JSON.stringify(r.path)}`);
  links.innerHTML = '<tr><th>Query string</th><th>Result</th><th>Address written</th></tr>' + inputs.map((q) => {
    const r = linkPath(q);
    return `<tr><td><code>${q || '(none)'}</code></td><td>${result(r)}</td><td><code>${r && r.path ? linkOf(r.path) : ''}</code></td></tr>`;
  }).join('');
}

for (const el of document.querySelectorAll('[data-demo]')) {
  const demo = DEMOS[el.dataset.demo];
  if (!demo) { el.textContent = `no stage "${el.dataset.demo}"`; continue; }
  stages.push(new Stage(el, demo));
}

// The controls: the scale of the stages, and the network of the fixtures. Restart loads the page again, with both.
// Shift+S in the Environment stage changes the scale too, so the buttons follow view.ui.
function syncScaleButtons() {
  for (const b of document.querySelectorAll('[data-ui]')) b.setAttribute('aria-pressed', String(Number(b.dataset.ui) === view.ui));
}
syncScaleButtons();
for (const b of document.querySelectorAll('[data-ui]')) {
  b.addEventListener('click', () => {
    view.ui = Number(b.dataset.ui);
    syncScaleButtons();
    redrawAll();
  });
}
for (const b of document.querySelectorAll('[data-net]')) {
  b.setAttribute('aria-pressed', String(b.dataset.net === NET.mode));
  b.addEventListener('click', () => {
    NET.mode = b.dataset.net;
    document.querySelectorAll('[data-net]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
  });
}
document.querySelector('[data-restart]')?.addEventListener('click', () => {
  location.search = new URLSearchParams({ ui: view.ui, net: NET.mode }).toString();
});
