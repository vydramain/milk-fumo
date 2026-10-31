// The workspace: the tiles, their focus, the resize and move modes, dragging, the message line and the environment
// bar. Keys, pointers and the bar's cells all lead to the same commands here.
import { FRAME, PANE_MIN, TITLE_H, DRAG_START, ENV_H, MSG_H, VIEWPORT_MIN } from './metrics.js';
import * as L from './layout.js';
import { C } from './theme.js';
import { RV, textWidth, fitText } from './font.js';
import { Hits, box, centerText } from './widgets.js';
import { ENV_CELLS, T, TUTORIAL_ACTIONS } from './texts.js';
import { HOME_NOTE, TUTORIAL_NOTE } from './config.js';
import { setOf, list, kindOf } from './catalog.js';
import { PmcPane } from './pmc.js';
import { NoteBody } from './note.js';
import { Player } from './media.js';
import { ImageView } from './image.js';
import { AppPane } from './app.js';

const MARGIN = 4;
const ARROWS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
const KEYS_MENU = { KeyH: 'split-right', KeyV: 'split-down', Enter: 'open-pmc', KeyW: 'stack', KeyR: 'resize', KeyF: 'maximize', KeyQ: 'close' };
const EMPTY_TILE_MIN = PANE_MIN.generic;

class EmptyBody {
  constructor(ws) { this.ws = ws; this.link = null; }
  get minimum() { return EMPTY_TILE_MIN; }
  draw(p, r, hits) {
    const title = T.emptyOpen;
    const at = centerText(RV, { x: r.x, y: r.y, w: r.w, h: r.h - 12 }, title, 2);
    p.text(RV, at.x, at.y, title, C.bright, 2);
    const w = textWidth(RV, title, 2);
    hits.add({ x: at.x, y: at.y, w, h: 16 }, { click: () => this.ws.openPmcIn(this.ws.tileOf(this)) });
    const hint = T.emptyHint;
    p.text(RV, r.x + Math.floor((r.w - textWidth(RV, hint)) / 2), r.y + r.h - 10, hint, C.dim);
  }
  key() { return false; }
  dispose() {}
}

// A file that is still loading, or a list that could not be read.
class LoadingBody {
  constructor(ws) { this.ws = ws; this.minimum = EMPTY_TILE_MIN; }
  draw(p, r) { p.text(RV, r.x + 4, r.y + 4, T.loading, C.cov); }
  key() { return false; }
  dispose() {}
}

class MessageBody {
  constructor(text) { this.text = text; this.minimum = EMPTY_TILE_MIN; }
  draw(p, r) { p.fill(r.x, r.y, r.w, r.h, C.cb); p.text(RV, r.x + 6, r.y + 6, this.text, C.ct); }
  key() { return false; }
  dispose() {}
}

// A tile: a body in the layout, with its label, and its tab name.
let nextId = 1;
function makeTile(body, label, tab) {
  return { id: 'p' + nextId++, body, label, tab };
}

export class Workspace {
  constructor(requestDraw) {
    this.requestDraw = requestDraw;
    this.panes = new Map();
    this.root = null;
    this.L = L.newLayout(null);
    this.focus = null;
    this.msg = '';
    this.mode = null;          // 'resize' | 'move' | null
    this.drag = null;          // { move(x, y), up(x, y) } while a press is held
    this.dropAt = null;        // where a dragged tile would land
    this.progress = new Set();
    this.hits = new Hits();
    this.rects = new Map();    // pane id -> content rectangle, from the last draw
    this.area = { x: MARGIN, y: MARGIN, w: 0, h: 0 };
    this.frame = 0;
    this.setup();
  }

  // Start: the Home note on the left and the Tutorial on the right, focused, 1:1.
  setup() {
    const home = makeTile(new NoteBody(this, HOME_NOTE), 'Home: ' + HOME_NOTE, 'Home');
    const tutorial = makeTile(new NoteBody(this, TUTORIAL_NOTE), 'Tutorial: ' + TUTORIAL_NOTE, 'Tutorial');
    this.panes.set(home.id, home);
    this.panes.set(tutorial.id, tutorial);
    this.L = L.newLayout(L.split('h', L.leaf([home.id]), L.leaf([tutorial.id])));
    this.setFocus(tutorial.id);
  }

  // ---- state -------------------------------------------------------------------------------

  tileOf(body) {
    for (const t of this.panes.values()) if (t.body === body) return t;
    return null;
  }

  minOf(id) {
    const t = this.panes.get(id);
    return t ? t.body.minimum || EMPTY_TILE_MIN : EMPTY_TILE_MIN;
  }

  titleOf(id) {
    const t = this.panes.get(id);
    if (!t) return '';
    return t.body instanceof PmcPane ? t.body.title() : t.label;
  }

  setFocus(id) {
    const leaf = L.leafOf(this.L.root, id);
    if (!leaf) return;
    leaf.active = leaf.tabs.indexOf(id);
    this.focus = id;
  }

  focusByUser(id) {
    if (id !== this.focus) this.progress.add('focus');
    this.setFocus(id);
  }

  // The state of a tutorial action: done, next (the first one not done), or none.
  progressOf(action) {
    if (this.progress.has(action.done)) return 'done';
    const next = TUTORIAL_ACTIONS.find((a) => !this.progress.has(a.done));
    return next === action ? 'next' : 'none';
  }

  // The layout placed for the current area, computed now; used by commands between draws.
  placed() {
    return L.place(this.L.root, this.area, (id) => this.minOf(id));
  }

  leafRectOf(id) {
    const leaf = L.leafOf(this.L.root, id);
    return this.placed().leaves.find((l) => l.node === leaf);
  }

  // The tab name of a leaf's pane, for messages.
  firstTitle(node) {
    const leaves = L.leavesOf(node);
    return leaves.length ? this.titleOf(leaves[0].tabs[leaves[0].active]) : '';
  }

  // ---- commands ----------------------------------------------------------------------------

  focusDir(dir) {
    if (this.L.max) { this.msg = T.maximized; return; }
    const from = this.leafRectOf(this.focus);
    const next = L.neighborIn(this.placed().leaves, from, dir);
    if (!next) { this.msg = T.noTileThere; return; }
    this.focusByUser(next.node.tabs[next.node.active]);
  }

  focusNext() {
    const leaves = L.leavesOf(this.L.root);
    const at = leaves.findIndex((l) => l.tabs.includes(this.focus));
    const next = leaves[(at + 1) % leaves.length];
    this.focusByUser(next.tabs[next.active]);
  }

  newEmptyTile() {
    const tile = makeTile(new EmptyBody(this), T.emptyTitle, 'Empty');
    this.panes.set(tile.id, tile);
    return tile;
  }

  // Splits the focused tile: a new empty tile beside it, on the right or below.
  splitFocus(axis, after) {
    if (this.L.max) { this.msg = T.maximized; return; }
    const tile = this.newEmptyTile();
    const leaf = L.leafOf(this.L.root, this.focus);
    L.addBeside(this.L, leaf, axis, L.leaf([tile.id]), after);
    this.setFocus(tile.id);
    this.progress.add('split');
  }

  // Shift+Enter: pmc fills an empty focused tile, or opens in a new tile beside a full one.
  openPmcHere() {
    if (this.L.max) { this.msg = T.maximized; return; }
    const current = this.panes.get(this.focus);
    if (current && current.body instanceof EmptyBody) {
      this.fillTile(current, new PmcPane(this), 'pmc');
    } else {
      const tile = this.newEmptyTile();
      L.addBeside(this.L, L.leafOf(this.L.root, this.focus), 'h', L.leaf([tile.id]), true);
      this.fillTile(tile, new PmcPane(this), 'pmc');
      this.setFocus(tile.id);
    }
    this.progress.add('open');
  }

  openPmcIn(tile) {
    if (!tile) return;
    this.fillTile(tile, new PmcPane(this), 'pmc');
    this.focusByUser(tile.id);
    this.progress.add('open');
    this.requestDraw();
  }

  fillTile(tile, body, tab) {
    if (tile.body && tile.body.dispose) tile.body.dispose();
    tile.body = body;
    tile.tab = tab;
    if (body instanceof PmcPane) body.id = tile.id;
    this.requestDraw();
  }

  // Ctrl+Shift+arrows: the focused tile moves past its neighbor in that direction.
  moveDir(dir) {
    if (this.L.max) { this.msg = T.maximized; return false; }
    const from = this.leafRectOf(this.focus);
    const target = L.neighborIn(this.placed().leaves, from, dir);
    if (!target) { this.msg = T.noTileThere; return false; }
    const moved = L.movePane(this.L, this.focus, target.node, dir);
    if (moved) this.progress.add('move');
    return moved;
  }

  startMove() {
    if (this.panes.size < 2) { this.msg = T.onlyOneTile; return; }
    this.mode = 'move';
    this.msg = T.moveHint;
  }

  // Shift+W: the focused tile is stacked into the tile on its right, or on its left when there is none.
  stackFocus() {
    if (this.L.max) { this.msg = T.maximized; return; }
    const from = this.leafRectOf(this.focus);
    const leaves = this.placed().leaves;
    const target = L.neighborIn(leaves, from, 'right') || L.neighborIn(leaves, from, 'left');
    if (!target) { this.msg = T.noTileThere; return; }
    if (L.movePane(this.L, this.focus, target.node, 'stack')) this.progress.add('stack');
  }

  startResize() {
    if (this.panes.size < 2) { this.msg = T.onlyOneTile; return; }
    this.mode = 'resize';
    this.msg = T.resizeHint;
  }

  // Moves the border an arrow points at by px. A border stops at the minimum of either side and says so.
  resizeBy(dir, px) {
    if (this.L.max) { this.msg = T.maximized; return; }
    const target = L.resizeTarget(this.L.root, this.focus, dir);
    if (!target) { this.msg = T.noBorderThere; return; }
    const info = this.placed().splits.find((s) => s.node === target.node);
    if (!info) return;
    const horizontal = target.node.axis === 'h';
    const want = info.size + target.sign * px;
    const size = Math.min(Math.max(want, info.minA), info.avail - info.minB);
    if (size !== want) this.minimumMessage(want < info.minA, target.node, info, horizontal);
    target.node.ratio = size / info.avail;
    if (size === info.size) return;
    this.progress.add('resize');
  }

  // Says whose minimum stops a border: the first part of the split, or the second.
  minimumMessage(first, node, info, horizontal) {
    const side = first ? node.a : node.b;
    const title = this.firstTitle(side);
    const min = first ? info.minA : info.minB;
    this.msg = horizontal ? T.minWidth(title, min) : T.minHeight(title, min);
  }

  toggleMaximize() {
    this.L.max = this.L.max === this.focus ? null : this.focus;
    this.progress.add('maximize');
  }

  // Shift+Q, the X of the title bar, or the close key inside an app: the focused tile goes, its neighbor takes focus.
  closeFocus() {
    if (this.panes.size === 1) { this.msg = T.onlyOneTile; return; }
    const id = this.focus;
    const leaf = L.leafOf(this.L.root, id);
    let next = null;
    if (leaf.tabs.length > 1) {
      const at = leaf.tabs.indexOf(id);
      next = leaf.tabs[at > 0 ? at - 1 : 1];
    } else {
      const from = this.leafRectOf(id);
      const leaves = this.placed().leaves;
      const n = ['right', 'left', 'down', 'up'].map((d) => L.neighborIn(leaves, from, d)).find(Boolean);
      next = n ? n.node.tabs[n.node.active] : null;
    }
    const tile = this.panes.get(id);
    L.removePane(this.L, id);
    this.panes.delete(id);
    if (tile.body.dispose) tile.body.dispose();
    this.focus = next || this.firstId();
    this.setFocus(this.focus);
    this.progress.add('close');
  }

  firstId() {
    return L.paneIds(this.L.root)[0];
  }

  closeApp(app) {
    const tile = this.tileOf(app);
    if (tile) { this.focus = tile.id; this.closeFocus(); this.requestDraw(); }
  }

  // Opens a new tile to the right of pmc's tile: a file, a folder's app, a player, a picture or a note.
  openFile(pmc, dir, item) {
    const kind = kindOf(item);
    const path = (dir ? dir + '/' : '') + item.name;
    const tile = makeTile(new LoadingBody(this), item.name, '');
    this.panes.set(tile.id, tile);
    L.addBeside(this.L, L.leafOf(this.L.root, pmc.id), 'h', L.leaf([tile.id]), true);
    this.requestDraw();
    // A listing can arrive after the tile was closed: then the new body is dropped at once.
    const alive = (body) => {
      if (this.panes.has(tile.id)) return true;
      if (body.dispose) body.dispose();
      return false;
    };
    if (kind === 'audio' || kind === 'video' || kind === 'image') {
      list(dir).then((entries) => {
        const set = setOf(entries, kind);
        const index = Math.max(0, set.indexOf(item));
        if (kind === 'image') {
          const body = new ImageView(this, dir, set, index);
          if (alive(body)) this.fillTile(tile, body, 'Image');
        } else {
          const body = new Player(this, kind, dir, set, index);
          if (alive(body)) this.fillTile(tile, body, kind === 'video' ? 'Video' : 'Player');
        }
        tile.label = (kind === 'image' ? 'Image: ' : kind === 'video' ? 'Video: ' : 'Player: ') + item.name;
      }).catch(() => { if (this.panes.has(tile.id)) this.fillTile(tile, new MessageBody(T.loadError + path), 'File'); });
    } else if (kind === 'note') {
      this.fillTile(tile, new NoteBody(this, path), 'Note');
      tile.label = 'Note: ' + item.name;
    } else {
      this.fillTile(tile, new MessageBody(T.noViewer), 'File');
      tile.label = item.name;
    }
  }

  openApp(pmc, dir, name) {
    const tile = makeTile(new AppPane(this, dir, name), 'App: ' + (dir ? dir + '/' : '') + name + '/', 'App');
    this.panes.set(tile.id, tile);
    L.addBeside(this.L, L.leafOf(this.L.root, pmc.id), 'h', L.leaf([tile.id]), true);
    this.requestDraw();
  }

  // True while something needs a frame at every animation frame: a playing video.
  animated() {
    for (const t of this.panes.values()) {
      if (t.body.animated && t.body.animated()) return true;
      if (t.body instanceof PmcPane && t.body.quickOn && t.body.view && t.body.view.animated && t.body.view.animated()) return true;
    }
    return false;
  }

  // Every app on screen: the app tiles, and the app shown in a pmc quick view. Used for messages and hiding.
  apps() {
    const list = [];
    for (const t of this.panes.values()) {
      if (t.body instanceof AppPane) list.push(t.body);
      if (t.body instanceof PmcPane && t.body.view instanceof AppPane) list.push(t.body.view);
    }
    return list;
  }

  // Focuses the tile of an app, when its frame is clicked (the click goes into the frame, not the canvas).
  focusApp(frame) {
    const tile = [...this.panes.values()].find((t) => t.body instanceof AppPane && t.body.frame === frame);
    if (tile) this.focusByUser(tile.id);
  }

  // The window is resized: the area of the layout follows.
  resize(w, h) {
    this.area = { x: MARGIN, y: MARGIN, w: w - 2 * MARGIN, h: h - 2 * MARGIN - MSG_H - ENV_H - 2 * MARGIN };
  }

  // The smallest window the current layout fits in: the layout's minimum plus the margins and the bars.
  minimum() {
    const m = L.minSize(this.L.root, (id) => this.minOf(id)) || { w: 0, h: 0 };
    return {
      w: Math.max(VIEWPORT_MIN.w, m.w + 2 * MARGIN),
      h: Math.max(VIEWPORT_MIN.h, m.h + 3 * MARGIN + MSG_H + ENV_H + 2 * MARGIN),
    };
  }

  // ---- keys --------------------------------------------------------------------------------

  // Returns true if the key was used. Shift combinations are the environment's; the rest go to the focused tile.
  key(e) {
    const k = e.code;
    // While a title bar is held, the only key is Escape, which cancels the drag; other keys wait for the drop.
    if (this.drag) {
      if (k === 'Escape') { this.drag = null; this.dropAt = null; this.msg = ''; }
      return true;
    }
    if (this.mode === 'resize' || this.mode === 'move') return this.modeKey(e);
    const shift = e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey;
    const ctrlShift = e.shiftKey && e.ctrlKey && !e.altKey && !e.metaKey;
    if (ctrlShift && ARROWS[k]) { this.moveDir(ARROWS[k]); return true; }
    if (shift && ARROWS[k]) { this.msg = ''; this.focusDir(ARROWS[k]); return true; }
    if (shift && KEYS_MENU[k]) {
      if (e.repeat) return true;
      this.msg = '';
      this.command(KEYS_MENU[k]);
      return true;
    }
    this.msg = '';
    const tile = this.panes.get(this.focus);
    if (!tile || !tile.body.key) return false;
    const r = this.rects.get(this.focus) || { h: 0 };
    return tile.body.key(e, r) || false;
  }

  modeKey(e) {
    const k = e.code;
    if (k === 'Enter' || k === 'Escape') { this.mode = null; this.msg = ''; return true; }
    if (!ARROWS[k]) return true;
    if (this.mode === 'resize') this.resizeBy(ARROWS[k], FRAME);
    else this.moveDir(ARROWS[k]);
    if (this.mode === 'move' && this.L.max === null) this.msg = T.moveHint;
    return true;
  }

  command(name) {
    const actions = {
      'split-right': () => this.splitFocus('h', true),
      'split-down': () => this.splitFocus('v', true),
      'open-pmc': () => this.openPmcHere(),
      'stack': () => this.stackFocus(),
      'resize': () => this.startResize(),
      'maximize': () => this.toggleMaximize(),
      'close': () => this.closeFocus(),
      'focus': () => this.focusNext(),
      'move': () => this.startMove(),
    };
    if (actions[name]) actions[name]();
    this.requestDraw();
  }

  // ---- pointer -----------------------------------------------------------------------------

  // A press goes to the topmost widget under the point: its press handler starts a drag, or its click runs at once.
  // A press anywhere also ends a resize or move mode.
  pointerDown(x, y) {
    if (this.mode) this.mode = null;
    this.msg = '';
    const top = this.hits.at(x, y);
    if (top && top.on.press) this.drag = normalizeDrag(top.on.press(x, y));
    else if (top && top.on.click) top.on.click(x, y);
    this.requestDraw();
  }

  pointerMove(x, y) {
    if (!this.drag || !this.drag.move) return;
    this.drag.move(x, y);
    this.requestDraw();
  }

  pointerUp(x, y) {
    if (this.drag && this.drag.up) this.drag.up(x, y);
    this.drag = null;
    this.dropAt = null;
    this.requestDraw();
  }

  wheel(x, y, dy) {
    const h = this.hits.find(x, y, 'wheel');
    if (!h) return false;
    h.on.wheel(dy);
    return true;
  }

  // A title bar or a tab: a click focuses, a drag past DRAG_START moves the tile to where it is dropped.
  tileDrag(id, x0, y0) {
    let moved = false;
    return {
      move: (x, y) => {
        if (!moved && Math.hypot(x - x0, y - y0) > DRAG_START) { moved = true; this.msg = T.dragHint; }
        if (moved) this.dropAt = L.dropTarget(this.lastLeaves || [], x, y);
      },
      up: () => {
        if (!moved) { this.focusByUser(id); return; }
        const drop = this.dropAt;
        this.dropAt = null;
        this.msg = '';
        if (drop && L.leavesOf(this.L.root).includes(drop.leaf) && L.movePane(this.L, id, drop.leaf, drop.side)) {
          this.progress.add(drop.side === 'stack' ? 'stack' : 'move');
          this.setFocus(id);
        }
      },
    };
  }

  // A border: dragged, it moves the split's ratio; it stops at the minimum of either side.
  borderDrag(info) {
    const horizontal = info.node.axis === 'h';
    const origin = horizontal ? info.rect.x : info.rect.y;
    return {
      move: (x, y) => {
        const pos = (horizontal ? x : y) - origin;
        const want = pos;
        const size = Math.min(Math.max(want, info.minA), info.avail - info.minB);
        if (size !== want) this.minimumMessage(want < info.minA, info.node, info, horizontal);
        else this.msg = '';
        info.node.ratio = size / info.avail;
        this.progress.add('resize');
        this.requestDraw();
      },
    };
  }

  // ---- drawing -----------------------------------------------------------------------------

  render(p, W, H) {
    this.hits = new Hits();
    this.rects = new Map();
    this.frame++;
    p.fill(0, 0, W, H, C.dark);
    this.resize(W, H);
    const placed = L.place(this.L.root, this.area, (id) => this.minOf(id));
    this.lastLeaves = placed.leaves;
    this.layoutSplits = placed.splits;
    const maxed = this.L.max && this.panes.has(this.L.max) ? this.L.max : null;
    const leaves = maxed ? placed.leaves.filter((l) => l.node.tabs.includes(maxed)).map((l) => ({ ...l, rect: this.area })) : placed.leaves;
    for (const l of leaves) this.drawLeaf(p, l.node, l.rect);
    if (!maxed) {
      for (const s of placed.splitters) {
        const info = placed.splits.find((i) => i.node === s.node);
        this.hits.add(s.rect, { press: () => this.borderDrag(info) });
      }
    }
    if (this.dropAt && this.drag) {
      const r = L.dropPreview(this.dropAt);
      p.dither({ x: r.x, y: r.y, w: r.w, h: r.h }, C.win, C.sel);
    }
    this.drawBars(p, W, H);
    // An app whose tile was not drawn this frame is hidden: its iframe lies over the canvas.
    for (const app of this.apps()) if (app.drawnAt !== this.frame) app.hide();
  }

  // A tile is drawn in order: its frame, the click that focuses it, the title bar, the tabs, and its body.
  // A hit added later lies on top, so the focusing click comes before everything inside the tile.
  drawLeaf(p, node, rect) {
    const id = node.tabs[node.active];
    const tile = this.panes.get(id);
    p.fill(rect.x, rect.y, rect.w, rect.h, C.win);
    p.bevel(rect, 2, true);
    if (id === this.focus) this.focusRing(p, rect);
    this.hits.add(rect, { click: () => this.focusByUser(id) });
    const titleR = L.titleRect(rect);
    p.dither(titleR, C.win, C.lo);
    this.titleBar(p, id, titleR);
    this.tabStrip(p, node, rect);
    const content = L.contentRect(rect);
    this.rects.set(id, content);
    p.clip(content);
    tile.body.draw(p, content, this.hits, id === this.focus);
    p.unclip();
  }

  // The brass frame around the focused tile, in the gap around it.
  focusRing(p, r) {
    p.fill(r.x - 2, r.y - 2, r.w + 4, 2, C.sel);
    p.fill(r.x - 2, r.y + r.h, r.w + 4, 2, C.sel);
    p.fill(r.x - 2, r.y, 2, r.h, C.sel);
    p.fill(r.x + r.w, r.y, 2, r.h, C.sel);
  }

  // The title bar: the drag area first, then the buttons on top of it: X, the split buttons, and M.
  titleBar(p, id, titleR) {
    const label = fitText(RV, this.titleOf(id), titleR.w - 14 - 52 - 6);
    const ttl = { x: titleR.x + 14, y: titleR.y, w: textWidth(RV, label) + 12, h: TITLE_H };
    this.hits.add(titleR, { press: (x, y) => this.tileDrag(id, x, y) });
    p.fill(ttl.x, ttl.y, ttl.w, ttl.h, C.win);
    p.text(RV, ttl.x + 6, ttl.y + 3, label, C.bright);
    const close = { x: titleR.x, y: titleR.y + 1, w: 12, h: 12 };
    const splitR = { x: titleR.x + titleR.w - 40, y: titleR.y + 1, w: 12, h: 12 };
    const splitD = { x: titleR.x + titleR.w - 26, y: titleR.y + 1, w: 12, h: 12 };
    const max = { x: titleR.x + titleR.w - 12, y: titleR.y + 1, w: 12, h: 12 };
    this.iconBox(p, close, 'X', false);
    this.iconBox(p, splitR, '|', false);
    this.iconBox(p, splitD, '-', false);
    this.iconBox(p, max, 'M', this.L.max === id);
    this.hits.add(close, { click: () => { this.focusByUser(id); this.closeFocus(); this.requestDraw(); } });
    this.hits.add(splitR, { click: () => { this.focusByUser(id); this.splitFocus('h', true); this.requestDraw(); } });
    this.hits.add(splitD, { click: () => { this.focusByUser(id); this.splitFocus('v', true); this.requestDraw(); } });
    this.hits.add(max, { click: () => { this.focusByUser(id); this.toggleMaximize(); this.requestDraw(); } });
  }

  iconBox(p, r, label, pressed) {
    box(p, r, !pressed, pressed ? C.inset : C.win);
    if (label === '|') p.fill(r.x + 5, r.y + 3, 1, 6, C.bright);
    else if (label === '-') p.fill(r.x + 3, r.y + 5, 6, 1, C.bright);
    else p.text(RV, r.x + 3, r.y + 3, label, pressed ? C.sel : C.bright);
  }

  // The tab strip: a slanted tab per pane; the active one is brass with dark text. Always drawn, as in the prototype.
  tabStrip(p, node, rect) {
    const strip = L.tabsRect(rect);
    let x = strip.x + 6;
    node.tabs.forEach((id, i) => {
      const label = this.tabLabel(id);
      const w = textWidth(RV, label) + 18;
      const active = i === node.active;
      const rows = p.slant(x, strip.y, w, strip.h, 6, active ? C.sel : C.win);
      if (!active) rows.forEach((rx, r) => { p.fill(rx + w - 1, strip.y + r, 1, 1, C.lo); p.fill(rx + w, strip.y + r, 2, 1, C.hi); });
      p.text(RV, x + 9, strip.y + 3, label, active ? C.dark : C.text);
      this.hits.add({ x, y: strip.y, w: w + 6, h: strip.h }, { press: (px, py) => {
        this.focusByUser(id);
        return this.tileDrag(id, px, py);
      } });
      x += w + 4;
    });
  }

  tabLabel(id) {
    const t = this.panes.get(id);
    return t ? t.tab || '' : '';
  }

  // The message line and the environment bar at the bottom of the window.
  drawBars(p, W, H) {
    const envY = H - MARGIN - ENV_H;
    const msgY = envY - MARGIN - MSG_H;
    const msg = { x: MARGIN, y: msgY, w: W - 2 * MARGIN, h: MSG_H };
    p.fill(msg.x, msg.y, msg.w, msg.h, C.inset);
    p.bevel(msg, 1, false);
    if (this.msg) p.text(RV, msg.x + 6, msg.y + 3, this.msg, C.bright);
    const cells = ENV_CELLS;
    const gap = 2;
    const w = Math.floor((W - 2 * MARGIN - gap * (cells.length - 1)) / cells.length);
    cells.forEach((c, i) => {
      const r = { x: MARGIN + i * (w + gap), y: envY, w, h: ENV_H };
      const on = (c.command === 'resize' && this.mode === 'resize') || (c.command === 'move' && this.mode === 'move') || (c.command === 'maximize' && this.L.max);
      p.fill(r.x, r.y, r.w, r.h, on ? C.inset : C.win);
      p.bevel(r, 1, !on);
      p.text(RV, r.x + 4, r.y + 4, c.key, C.sel);
      p.text(RV, r.x + 6 + textWidth(RV, c.key), r.y + 4, c.label, C.text);
      this.hits.add(r, { click: () => this.command(c.command) });
    });
  }
}

// A press handler may return a move function, or an object with move and up; both are kept as an object.
function normalizeDrag(r) {
  if (!r) return null;
  if (typeof r === 'function') return { move: r };
  return r;
}
