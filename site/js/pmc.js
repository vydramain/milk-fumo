// pmc, the file panel: two panels in one tile, with the keys and the look of the early Midnight Commander.
// The panels only read: there is no copy, move or delete. F3 turns the other panel into a quick view of the cursor.
import { START_DIR } from './config.js';
import { PANE_MIN, ROW } from './metrics.js';
import { C } from './theme.js';
import { RV, textWidth, fitText } from './font.js';
import { KIND, kindOf, list, known, setOf, formatSize, formatBytes } from './catalog.js';
import { Player } from './media.js';
import { ImageView } from './image.js';
import { NoteBody } from './note.js';
import { T, PMC_KEYS } from './texts.js';
import { box, scrollbar, panelFrame, wellFrame, keyBar, loadBar, LOAD_W, NO_KEYS } from './widgets.js';

const COL_SIZE = 56;
const COL_DATE = 70;
const DOUBLE_MS = 400;
// The kinds with a viewer that Enter can open a file in.
const VIEWED = ['audio', 'video', 'image', 'note'];
// What a key-bar cell does and which keys sink it; the labels are in texts.js. Esc has no cell: it still clears the
// search and closes the quick view (key), but the bar keeps the room for the keys that need telling.
const MC_KEYS = [
  { action: 'enter', codes: ['Enter'] },
  { action: 'quick', codes: ['F3'] },
  { action: 'tab', codes: ['Tab'] },
  { action: 'up', codes: ['Ctrl+PageUp'] },
  { action: null, codes: [] },
];

function newPanel(dir) {
  return { dir, entries: null, error: false, cursor: 0, top: 0, vis: 1, search: '' };
}

export class PmcPane {
  constructor(ws) {
    this.ws = ws;
    this.id = null;
    this.act = 0;
    this.panels = [newPanel(START_DIR), newPanel(START_DIR)];
    // The quick view (F3) is shown on panel quickIdx. It changes only by F3 or Enter, never by the cursor.
    this.quick = null; // { kind, path, view }
    this.quickIdx = 1;
    this.panels.forEach((_, i) => this.reload(i));
    this.lastClick = { panel: -1, row: -1, at: 0 };
  }

  get minimum() { return PANE_MIN.pmc; }

  // The items of a panel: the parent entry first, when there is one, then the listing.
  items(panel) {
    const up = panel.dir ? [{ name: '..', dir: true, up: true, size: 0, date: '' }] : [];
    return up.concat(panel.entries || []);
  }

  cursorItem(idx) {
    const panel = this.panels[idx];
    return this.items(panel)[panel.cursor];
  }

  // Loads the listing of a panel's folder. The promise resolves when the panel has its entries.
  reload(idx) {
    const panel = this.panels[idx];
    panel.error = false;
    return list(panel.dir)
      .then((entries) => { panel.entries = entries; })
      .catch(() => { panel.error = true; panel.entries = []; })
      .finally(() => this.ws.requestDraw());
  }

  changeDir(idx, dir, cursorName) {
    const panel = this.panels[idx];
    panel.dir = dir;
    panel.entries = null;
    panel.cursor = 0;
    panel.top = 0;
    panel.search = '';
    this.reload(idx).then(() => {
      if (cursorName === undefined) return;
      const i = this.items(panel).findIndex((e) => e.name === cursorName);
      panel.cursor = Math.max(0, i);
      this.ws.requestDraw();
    });
  }

  // Up one level: the cursor stands on the folder that was just left, as in MC.
  up(idx) {
    const panel = this.panels[idx];
    if (!panel.dir) return;
    const parts = panel.dir.split('/');
    const left = parts.pop();
    this.changeDir(idx, parts.join('/'), left);
  }

  move(idx, d) {
    const panel = this.panels[idx];
    const n = this.items(panel).length;
    panel.search = '';
    panel.cursor = Math.max(0, Math.min(n - 1, panel.cursor + d));
    this.ws.requestDraw();
  }

  // Enter: a folder is entered, an app is launched; a file of the quick view's kind opens in the quick view, any other
  // file in the tile of its type.
  enter(idx) {
    const panel = this.panels[idx];
    const item = this.cursorItem(idx);
    if (!item) return;
    if (item.up) { this.up(idx); return; }
    if (kindOf(item) === 'app') { this.ws.openApp(this, panel.dir, item.name); return; }
    if (item.dir) { this.changeDir(idx, (panel.dir ? panel.dir + '/' : '') + item.name); return; }
    if (this.quick && VIEWED.includes(kindOf(item)) && this.quick.kind === kindOf(item)) { this.showQuick(idx, item); return; }
    this.ws.openFile(this, panel.dir, item);
  }

  // A letter moves the cursor to the first name that starts with the letters typed so far.
  search(idx, ch) {
    const panel = this.panels[idx];
    const q = (panel.search + ch).toLowerCase();
    const i = this.items(panel).findIndex((e) => !e.up && e.name.toLowerCase().startsWith(q));
    if (i >= 0) { panel.search = q; panel.cursor = i; }
  }

  // F3: closes the quick view when the focus is on it or the cursor is on the file it shows; otherwise shows the
  // cursor's item in it. Up-dir rows are ignored.
  f3() {
    const item = this.cursorItem(this.act);
    if (this.quick && (this.act === this.quickIdx || (item && this.quick.path === this.pathOf(this.act, item)))) this.closeQuick();
    else if (item && !item.up && this.panels[this.act].entries) this.showQuick(this.act, item);
    this.ws.requestDraw();
  }

  pathOf(idx, item) {
    const dir = this.panels[idx].dir;
    return (dir ? dir + '/' : '') + item.name;
  }

  // Shows `item` of panel `idx` in the quick view: the same viewer opens it when the kind is the same, else the viewer
  // is replaced. The view goes to the other panel.
  showQuick(idx, item) {
    const source = this.panels[idx];
    const kind = item.dir ? 'folder' : kindOf(item);
    const path = this.pathOf(idx, item);
    const q = this.quick;
    if (q && q.kind === kind && q.view && q.view.open) {
      const set = setOf(source.entries, kind);
      q.view.open(source.dir, set, Math.max(0, set.indexOf(item)));
      q.path = path;
      return;
    }
    if (q && q.view && q.view.dispose) q.view.dispose();
    if (!q) this.quickIdx = 1 - idx;
    this.quick = { kind, path, view: this.makeView(item, source) };
  }

  closeQuick() {
    if (this.quick && this.quick.view && this.quick.view.dispose) this.quick.view.dispose();
    this.quick = null;
    if (this.act === this.quickIdx) this.act = 1 - this.quickIdx;
  }

  // The panel that lists files, and the one that shows the quick view when it is on.
  get listIdx() { return 1 - this.quickIdx; }

  switchPanel() {
    this.panels[this.act].search = '';
    this.act = 1 - this.act;
  }

  // Keys. When the active panel shows a quick view, its player, picture or note takes the keys first.
  key(e) {
    const k = e.code;
    const onView = this.quick && this.act === this.quickIdx;
    if (onView && this.quick.view && this.quick.view.key && this.quick.view.key(e)) return true;
    if (e.ctrlKey && k === 'PageUp' && !onView) this.up(this.act);
    else if (e.ctrlKey || e.altKey || e.metaKey) return false;
    else if (k === 'Tab') this.switchPanel();
    else if (k === 'F3') this.f3();
    else if (k === 'Escape') {
      const panel = this.panels[this.act];
      if (panel.search) panel.search = '';
      else if (this.quick) this.closeQuick();
      else return false;
    } else if (onView) return false;
    else {
      const panel = this.panels[this.act];
      if (k === 'Backspace') panel.search = panel.search.slice(0, -1);
      else if (k === 'ArrowUp') this.move(this.act, -1);
      else if (k === 'ArrowDown') this.move(this.act, 1);
      else if (k === 'PageUp') this.move(this.act, -(panel.vis - 1));
      else if (k === 'PageDown') this.move(this.act, panel.vis - 1);
      else if (k === 'Home') { panel.search = ''; panel.cursor = 0; }
      else if (k === 'End') { panel.search = ''; panel.cursor = this.items(panel).length - 1; }
      else if (k === 'Enter') this.enter(this.act);
      else if (e.key.length === 1 && e.key !== ' ') this.search(this.act, e.key);
      else return false;
    }
    this.ws.requestDraw();
    return true;
  }

  quickView() {
    return this.quick ? this.quick.view : null;
  }

  makeView(item, source) {
    const kind = kindOf(item);
    const path = (source.dir ? source.dir + '/' : '') + item.name;
    if (kind === 'audio' || kind === 'video') {
      const set = setOf(source.entries, kind);
      return new Player(this.ws, kind, source.dir, set, Math.max(0, set.indexOf(item)));
    }
    if (kind === 'image') {
      const set = setOf(source.entries, 'image');
      return new ImageView(this.ws, source.dir, set, Math.max(0, set.indexOf(item)));
    }
    if (kind === 'note') return new NoteBody(this.ws, path);
    if (kind === 'folder' || kind === 'app') return new FolderInfo(this.ws, path, item);
    return new Message();
  }

  // The layout: the panel frame; the toolbar; two panels, each a sunken well with
  // the path, the header and the rows, a scroll bar, and a status line under it; the key bar.
  draw(p, r, hits, focused) {
    const inner = panelFrame(p, r);
    const bar = { x: inner.x, y: inner.y, w: inner.w, h: 16 };
    this.toolbar(p, hits, bar);
    const keys = { x: inner.x, y: inner.y + inner.h - 14, w: inner.w, h: 14 };
    const top = bar.y + bar.h + 4;
    const area = { x: inner.x, y: top, w: inner.w, h: keys.y - 4 - top };
    const half = Math.floor((area.w - 4) / 2);
    const rects = [
      { x: area.x, y: area.y, w: half, h: area.h },
      { x: area.x + half + 4, y: area.y, w: area.w - half - 4, h: area.h },
    ];
    // The tile's held keys sink the quick view's bar while its panel is active, pmc's own bar otherwise.
    const held = this.ws.drawHeld;
    const onView = this.quick && this.act === this.quickIdx;
    this.ws.drawHeld = onView ? held : NO_KEYS;
    rects.forEach((rect, i) => this.panel(p, hits, i, rect, focused));
    this.ws.drawHeld = held;
    this.keyBar(p, hits, keys, onView ? NO_KEYS : held);
  }

  toolbar(p, hits, bar) {
    const panel = this.panels[this.act];
    const quick = !!this.quick;
    const view = { x: bar.x + bar.w - 36, y: bar.y + 1, w: 36, h: 14 };
    const field = { x: bar.x, y: bar.y + 1, w: view.x - bar.x - 4, h: 14 };
    box(p, field, false, C.inset, 2);
    p.text(RV, field.x + 4, field.y + 3, '/' + panel.dir + (panel.dir ? '/' : ''), C.bright);
    box(p, view, !quick, quick ? C.inset : C.btn, 2);
    p.text(RV, view.x + 6, view.y + 3, 'View', quick ? C.bright : C.text);
    hits.add(view, { click: () => this.f3() });
  }

  panel(p, hits, idx, r, focused) {
    const panel = this.panels[idx];
    const active = idx === this.act;
    const quick = !!this.quick && idx === this.quickIdx;
    const stat = { x: r.x, y: r.y + r.h - 14, w: r.w, h: 14 };
    // The bar shows the panel's listing: loading, failed, or done.
    const load = panel.error ? { state: 'errr', share: 0 } : panel.entries === null ? { state: 'load', share: 0 } : { state: 'done', share: 1 };
    const well = wellFrame(p, { x: r.x, y: r.y, w: r.w, h: r.h - 16 });
    const sb = { x: well.x + well.w - 14, y: well.y, w: 14, h: well.h };
    const col = { x: well.x, y: well.y, w: well.w - 14, h: well.h };
    const pathBar = { x: col.x, y: col.y, w: col.w, h: 13 };
    p.fill(pathBar.x, pathBar.y, pathBar.w, pathBar.h, active ? C.sel : C.win);
    p.fill(pathBar.x, pathBar.y + 12, pathBar.w, 1, C.lo);
    const label = quick ? 'View: ' + this.quick.path.split('/').pop() : '/' + panel.dir + (panel.dir ? '/' : '');
    const shown = fitText(RV, label, pathBar.w - 8);
    p.text(RV, pathBar.x + Math.floor((pathBar.w - textWidth(RV, shown)) / 2), pathBar.y + 3, shown, active ? C.dark : C.text);
    hits.add(pathBar, { click: () => this.activate(idx) });
    const body = { x: col.x, y: col.y + 26, w: col.w, h: col.h - 26 };

    if (quick) {
      p.fill(body.x, body.y, body.w, body.h, C.inset);
      const view = this.quickView();
      if (view) view.draw(p, body, hits, focused);
      else p.text(RV, body.x + 4, body.y + 4, T.noViewer, C.cov);
      this.statLine(p, stat, T.quickFooter, '', load);
      return;
    }

    const items = this.items(panel);
    const n = items.length;
    const nameW = col.w - COL_SIZE - COL_DATE;
    panel.vis = Math.max(1, Math.floor(body.h / ROW));
    panel.cursor = Math.min(panel.cursor, Math.max(0, n - 1));
    if (panel.cursor < panel.top) panel.top = panel.cursor;
    if (panel.cursor >= panel.top + panel.vis) panel.top = panel.cursor - panel.vis + 1;
    panel.top = Math.max(0, Math.min(panel.top, n - panel.vis));

    // The header: the three column names, with the lines between them.
    p.fill(col.x, col.y + 13, col.w, 13, C.win);
    p.fill(col.x, col.y + 25, col.w, 1, C.lo);
    p.text(RV, col.x + 4, col.y + 16, 'Name', C.bright);
    p.text(RV, col.x + nameW + 4, col.y + 16, 'Size', C.bright);
    p.text(RV, col.x + nameW + COL_SIZE + 4, col.y + 16, 'Modified', C.bright);
    p.fill(col.x + nameW, col.y + 13, 1, 13, C.lo);
    p.fill(col.x + nameW + COL_SIZE, col.y + 13, 1, 13, C.lo);

    p.fill(body.x, body.y, body.w, body.h, C.inset);
    // The list's own hit is added before its rows, so a row's click lies on top of it.
    hits.add(body, {
      wheel: (dy) => { this.activate(idx); this.move(idx, dy > 0 ? 3 : -3); },
      click: () => this.activate(idx),
    });
    p.clip(body);
    for (let i = panel.top; i < Math.min(n, panel.top + panel.vis); i++) {
      const row = { x: body.x, y: body.y + (i - panel.top) * ROW, w: body.w, h: ROW };
      this.row(p, hits, idx, items[i], i, row, nameW, focused && active, active);
    }
    p.unclip();
    p.fill(body.x + nameW, body.y, 1, body.h, C.lo);
    p.fill(body.x + nameW + COL_SIZE, body.y, 1, body.h, C.lo);
    if (panel.error) p.text(RV, body.x + 4, body.y + 4, T.folderError, C.red);
    scrollbar(p, hits, sb, {
      top: panel.top, view: panel.vis, total: n,
      onTop: (t) => { panel.top = t; this.ws.requestDraw(); },
    });

    const cur = items[panel.cursor];
    const total = (panel.entries || []).reduce((sum, e) => sum + (e.dir ? 0 : e.size), 0);
    const info = panel.search ? `Search: ${panel.search}_` : cur ? `${this.describe(cur, panel)} · total ${formatSize(total)}` : '';
    this.statLine(p, stat, info, cur && !cur.up ? cur.date : '', load);
  }

  // One row: the kind code and the name, the size right-aligned in its column, and the date. The cursor is brass
  // in the focused active panel, dark-grey in the other active one, and not shown in the inactive panel, which dims it.
  row(p, hits, idx, item, i, r, nameW, focused, active) {
    const cursor = i === this.panels[idx].cursor;
    const dark = cursor && focused;
    if (cursor && active) p.fill(r.x, r.y, r.w, r.h, focused ? C.sel : C.lo);
    const kind = item.up ? 'up' : kindOf(item);
    const dim = cursor && !active;
    const name = item.dir && !item.up ? item.name + '/' : item.name;
    const size = item.up ? 'UP--DIR' : item.dir ? (kind === 'app' ? 'APP-DIR' : 'SUB-DIR') : formatSize(item.size);
    p.text(RV, r.x + 4, r.y + 2, KIND[kind].code, dark ? C.dark : C[KIND[kind].color]);
    p.text(RV, r.x + 22, r.y + 2, fitText(RV, name, nameW - 26), dark ? C.dark : dim ? C.dim : item.dir ? C.bright : C.text);
    p.text(RV, r.x + nameW + COL_SIZE - 4 - textWidth(RV, size), r.y + 2, size, dark ? C.dark : item.dir ? C.dim : C.text);
    p.text(RV, r.x + nameW + COL_SIZE + 4, r.y + 2, item.date || '', dark ? C.dark : C.dim);
    hits.add(r, { click: () => this.click(idx, i) });
  }

  click(idx, i) {
    const now = Date.now();
    const last = this.lastClick;
    this.activate(idx);
    this.panels[idx].cursor = i;
    this.panels[idx].search = '';
    if (last.panel === idx && last.row === i && now - last.at < DOUBLE_MS) {
      this.lastClick = { panel: -1, row: -1, at: 0 };
      this.enter(idx);
    } else {
      this.lastClick = { panel: idx, row: i, at: now };
    }
    this.ws.requestDraw();
  }

  activate(idx) {
    if (this.act !== idx) this.switchPanel();
    this.ws.requestDraw();
  }

  // The status text of an entry: a folder's number of items, read on demand, or a file's size in bytes.
  describe(item, panel) {
    if (item.up) return T.pmcUpDir;
    if (item.dir) {
      if (kindOf(item) === 'app') return `${item.name}/ · app`;
      const path = (panel.dir ? panel.dir + '/' : '') + item.name;
      const entries = known(path);
      if (!entries) { list(path).finally(() => this.ws.requestDraw()); return `${item.name}/ · …`; }
      return `${item.name}/ · ${entries.length} ${entries.length === 1 ? 'item' : 'items'}`;
    }
    return `${item.name} · ${formatBytes(item.size)} bytes`;
  }

  // The status line under a panel: what the cursor is on and the load bar at the end of that box, and the date in a
  // sunken box on the right.
  statLine(p, r, text, date, load) {
    const dateW = textWidth(RV, date) + 12;
    const left = { x: r.x, y: r.y, w: r.w - dateW - 2, h: r.h };
    p.bevel(left, 1, false);
    p.text(RV, left.x + 6, left.y + 3, fitText(RV, text, left.w - 12 - LOAD_W - 2), C.text);
    loadBar(p, left.x + left.w - LOAD_W - 2, left.y + 1, load);
    const right = { x: r.x + r.w - dateW, y: r.y, w: dateW, h: r.h };
    p.bevel(right, 1, false);
    p.text(RV, right.x + 6, right.y + 3, date, C.text);
  }

  // The key bar. Letters only says how the search works; its click makes the panel active, like its keys would.
  keyBar(p, hits, r, held) {
    const cells = MC_KEYS.map((k, i) => ({
      ...PMC_KEYS[i], codes: k.codes,
      click: () => (k.action ? this.mcKey(k.action) : this.activate(this.listIdx)),
    }));
    keyBar(p, hits, r, cells, held);
  }

  mcKey(action) {
    if (action === 'enter') this.enter(this.act);
    else if (action === 'quick') this.f3();
    else if (action === 'tab') this.switchPanel();
    else if (action === 'up') this.up(this.act);
    this.ws.requestDraw();
  }

  dispose() {
    if (this.quick && this.quick.view && this.quick.view.dispose) this.quick.view.dispose();
  }
}

// The info of a folder in the quick view: its path, its number of items and its date.
class FolderInfo {
  constructor(ws, path, item) {
    this.ws = ws;
    this.path = path;
    this.item = item;
    this.count = null;
    list(path)
      .then((entries) => { this.count = entries.length; })
      .catch(() => { this.count = null; this.failed = true; })
      .finally(() => ws.requestDraw());
  }

  draw(p, r) {
    p.fill(r.x, r.y, r.w, r.h, C.win);
    const rows = [['Path', '/' + this.path + '/'], ['Type', 'folder'], ['Items', this.failed ? '—' : this.count === null ? '…' : String(this.count)], ['Modified', this.item.date]];
    rows.forEach(([k, v], i) => {
      p.text(RV, r.x + 8, r.y + 8 + i * 12, k, C.dim);
      p.text(RV, r.x + 70, r.y + 8 + i * 12, v, C.bright);
    });
  }

  dispose() {}
}

// A quick view that is only a message: a file that has no viewer.
class Message {
  draw(p, r) {
    p.fill(r.x, r.y, r.w, r.h, C.cb);
    p.text(RV, r.x + 8, r.y + 8, T.noViewer, C.ct);
  }

  dispose() {}
}
