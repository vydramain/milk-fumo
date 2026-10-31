// pmc, the file panel: two panels in one tile, with the keys and the look of the early Midnight Commander.
// The panels only read: there is no copy, move or delete. F3 turns the other panel into a quick view of the cursor.
import { START_DIR } from './config.js';
import { PANE_MIN, ROW } from './metrics.js';
import { C } from './theme.js';
import { RV, textWidth, fitText } from './font.js';
import { KIND, kindOf, list, setOf, formatSize, formatBytes } from './catalog.js';
import { Player } from './media.js';
import { ImageView } from './image.js';
import { NoteBody } from './note.js';
import { T } from './texts.js';
import { box, scrollbar } from './widgets.js';
import { AppPane } from './app.js';

const SUB = 13;      // the path bar and the header of a panel
const STAT = 14;     // the status line under a panel
const COL_SIZE = 56;
const COL_DATE = 70;
const SCROLL = 14;
const DOUBLE_MS = 400;
const MC_KEYS = [
  { key: 'Enter', label: 'Open', action: 'enter' },
  { key: 'F3', label: 'View', action: 'quick' },
  { key: 'Tab', label: 'Panel', action: 'tab' },
  { key: 'Esc', label: 'List', action: 'back' },
  { key: 'Ctrl+PgUp', label: 'Up', action: 'up' },
  { key: 'Letters', label: 'Search', action: null },
];

function newPanel(dir) {
  return { dir, entries: null, error: false, cursor: 0, top: 0, vis: 1, search: '', rect: null };
}

export class PmcPane {
  constructor(ws) {
    this.ws = ws;
    this.id = null;
    this.act = 0;
    this.panels = [newPanel(START_DIR), newPanel(START_DIR)];
    // The quick view (F3) is shown on panel quickIdx and follows the cursor of the other panel.
    this.quickOn = false;
    this.quickIdx = 1;
    this.view = null;
    this.viewKey = '';
    this.panels.forEach((_, i) => this.reload(i));
    this.lastClick = { panel: -1, row: -1, at: 0 };
  }

  get minimum() { return PANE_MIN.pmc; }

  title() {
    const dir = this.panels[this.act].dir;
    return `pmc: /${dir}${dir ? '/' : ''}`;
  }

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

  // Enter: a folder is entered, an app is launched, a file opens in a new tile on the right.
  enter(idx) {
    const panel = this.panels[idx];
    const item = this.cursorItem(idx);
    if (!item) return;
    if (item.up) { this.up(idx); return; }
    if (kindOf(item) === 'app') { this.ws.openApp(this, panel.dir, item.name); return; }
    if (item.dir) { this.changeDir(idx, (panel.dir ? panel.dir + '/' : '') + item.name); return; }
    this.ws.openFile(this, panel.dir, item);
  }

  // A letter moves the cursor to the first name that starts with the letters typed so far.
  search(idx, ch) {
    const panel = this.panels[idx];
    const q = (panel.search + ch).toLowerCase();
    const i = this.items(panel).findIndex((e) => !e.up && e.name.toLowerCase().startsWith(q));
    if (i >= 0) { panel.search = q; panel.cursor = i; }
  }

  toggleQuick() {
    if (this.quickOn) this.closeQuick();
    else { this.quickOn = true; this.quickIdx = 1 - this.act; }
    this.ws.requestDraw();
  }

  closeQuick() {
    this.quickOn = false;
    if (this.view && this.view.dispose) this.view.dispose();
    this.view = null;
    this.viewKey = '';
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
    const onView = this.quickOn && this.act === this.quickIdx;
    if (onView && this.view && this.view.key && this.view.key(e, this.panels[this.quickIdx].rect || { h: 0 })) return true;
    if (e.ctrlKey && k === 'PageUp' && !onView) this.up(this.act);
    else if (e.ctrlKey || e.altKey || e.metaKey) return false;
    else if (k === 'Tab') this.switchPanel();
    else if (k === 'F3') this.toggleQuick();
    else if (k === 'Escape') {
      const panel = this.panels[this.act];
      if (panel.search) panel.search = '';
      else if (this.quickOn) this.closeQuick();
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

  // The quick view of the cursor of the panel the other one is not showing: it follows the cursor.
  quickView() {
    const source = this.panels[this.listIdx];
    const item = this.cursorItem(this.listIdx);
    const key = item ? source.dir + '/' + item.name : '';
    if (this.viewKey === key) return this.view;
    if (this.view && this.view.dispose) this.view.dispose();
    this.viewKey = key;
    this.view = item && source.entries ? this.makeView(item, source) : null;
    return this.view;
  }

  makeView(item, source) {
    const kind = kindOf(item);
    const path = (source.dir ? source.dir + '/' : '') + item.name;
    if (kind === 'app') return new AppPane(this.ws, source.dir, item.name);
    if (kind === 'audio' || kind === 'video') {
      const set = setOf(source.entries, kind);
      return new Player(this.ws, kind, source.dir, set, Math.max(0, set.indexOf(item)));
    }
    if (kind === 'image') {
      const set = setOf(source.entries, 'image');
      return new ImageView(this.ws, source.dir, set, Math.max(0, set.indexOf(item)));
    }
    if (kind === 'note') return new NoteBody(this.ws, path);
    if (kind === 'folder') return new FolderInfo(this.ws, path, item);
    return new Message(kind, item);
  }

  draw(p, r, hits, focused) {
    const bar = { x: r.x, y: r.y, w: r.w, h: 16 };
    this.toolbar(p, hits, bar);
    const keys = { x: r.x, y: r.y + r.h - 14, w: r.w, h: 14 };
    const top = bar.y + bar.h + 4;
    const area = { x: r.x, y: top, w: r.w, h: keys.y - 4 - top };
    const half = Math.floor((area.w - 4) / 2);
    const rects = [
      { x: area.x, y: area.y, w: half, h: area.h },
      { x: area.x + half + 4, y: area.y, w: area.w - half - 4, h: area.h },
    ];
    rects.forEach((rect, i) => this.panel(p, hits, i, rect, focused));
    this.keysBar(p, hits, keys);
  }

  toolbar(p, hits, bar) {
    const panel = this.panels[this.act];
    const up = { x: bar.x, y: bar.y, w: 18, h: 16 };
    const home = { x: bar.x + 22, y: bar.y, w: 18, h: 16 };
    box(p, up, true);
    p.text(RV, up.x + 4, up.y + 4, 'Up', C.cov);
    box(p, home, true);
    p.text(RV, home.x + 4, home.y + 4, 'Hm', C.blue);
    hits.add(up, { click: () => this.up(this.act) });
    hits.add(home, { click: () => this.changeDir(this.act, START_DIR) });
    const quick = this.quickOn;
    const view = { x: bar.x + bar.w - 40, y: bar.y + 1, w: 40, h: 14 };
    const field = { x: home.x + 22, y: bar.y, w: view.x - home.x - 26, h: 16 };
    p.fill(field.x, field.y, field.w, field.h, C.inset);
    p.bevel(field, 1, false);
    p.text(RV, field.x + 4, field.y + 4, '/' + panel.dir + (panel.dir ? '/' : ''), C.bright);
    box(p, view, !quick, quick ? C.inset : C.btn);
    p.text(RV, view.x + 6, view.y + 3, 'View', quick ? C.bright : C.text);
    hits.add(view, { click: () => { this.toggleQuick(); this.ws.requestDraw(); } });
  }

  panel(p, hits, idx, r, focused) {
    const panel = this.panels[idx];
    const active = idx === this.act;
    const quick = this.quickOn && idx === this.quickIdx;
    const pathBar = { x: r.x, y: r.y, w: r.w, h: SUB };
    p.fill(pathBar.x, pathBar.y, pathBar.w, pathBar.h, active ? C.sel : C.win);
    const label = quick ? 'View: ' + this.cursorName(this.listIdx) : '/' + panel.dir + (panel.dir ? '/' : '');
    p.text(RV, r.x + Math.floor((r.w - textWidth(RV, label)) / 2), r.y + 3, label, active ? C.dark : C.text);
    hits.add(pathBar, { click: () => this.activate(idx) });
    const statRect = { x: r.x, y: r.y + r.h - STAT, w: r.w, h: STAT };
    const body = { x: r.x, y: r.y + SUB, w: r.w, h: r.h - SUB - STAT };
    panel.rect = body;

    if (quick) {
      p.fill(body.x, body.y, body.w, body.h, C.inset);
      const view = this.quickView();
      if (view) view.draw(p, body, hits, focused);
      else p.text(RV, body.x + 4, body.y + 4, T.noViewer, C.cov);
      this.statLine(p, statRect, T.quickFooter, '');
      return;
    }

    const items = this.items(panel);
    const n = items.length;
    const listY = body.y + SUB;
    const list = { x: body.x, y: listY, w: body.w, h: body.h - SUB };
    panel.vis = Math.max(1, Math.floor(list.h / ROW));
    panel.cursor = Math.min(panel.cursor, Math.max(0, n - 1));
    if (panel.cursor < panel.top) panel.top = panel.cursor;
    if (panel.cursor >= panel.top + panel.vis) panel.top = panel.cursor - panel.vis + 1;
    panel.top = Math.max(0, Math.min(panel.top, n - panel.vis));

    this.header(p, body.x, body.y, body.w);
    p.fill(list.x, list.y, list.w, list.h, C.inset);
    const listW = list.w - SCROLL;
    const nameW = listW - COL_SIZE - COL_DATE;
    // The list's own hit is added before its rows, so a row's click lies on top of it.
    hits.add(list, {
      wheel: (dy) => { this.activate(idx); this.move(idx, dy > 0 ? 3 : -3); },
      click: () => this.activate(idx),
    });
    p.clip(list);
    for (let i = panel.top; i < Math.min(n, panel.top + panel.vis); i++) {
      const row = { x: list.x, y: list.y + (i - panel.top) * ROW, w: listW, h: ROW };
      this.row(p, hits, idx, items[i], i, row, nameW, active && focused, active);
    }
    p.unclip();
    p.fill(list.x + nameW, list.y, 1, list.h, C.lo);
    p.fill(list.x + nameW + COL_SIZE, list.y, 1, list.h, C.lo);
    if (panel.error) p.text(RV, list.x + 4, list.y + 4, T.folderError, C.red);
    scrollbar(p, hits, { x: list.x + listW, y: list.y, w: SCROLL, h: list.h }, {
      top: panel.top, view: panel.vis, total: n,
      onTop: (t) => { panel.top = t; this.ws.requestDraw(); },
    });
    const cur = items[panel.cursor];
    const total = (panel.entries || []).reduce((sum, e) => sum + (e.dir ? 0 : e.size), 0);
    const info = panel.search ? `Search: ${panel.search}_` : cur ? `${this.describe(cur)} · total ${formatSize(total)}` : '';
    this.statLine(p, statRect, info, cur && !cur.up ? cur.date : '');
  }

  header(p, x, y, w) {
    const nameW = w - SCROLL - COL_SIZE - COL_DATE;
    p.fill(x, y, w, SUB, C.win);
    p.text(RV, x + 3, y + 3, 'Name', C.bright);
    p.text(RV, x + nameW + 3, y + 3, 'Size', C.bright);
    p.text(RV, x + nameW + COL_SIZE + 3, y + 3, 'Modified', C.bright);
    p.fill(x, y + SUB - 1, w, 1, C.lo);
  }

  // One row: the kind code, the name, the size on the right of its column, and the date.
  // The cursor is brass in the focused active panel, dark in the other active one, and dim in the inactive panel.
  row(p, hits, idx, item, i, r, nameW, focused, active) {
    const cursor = i === this.panels[idx].cursor;
    if (cursor) {
      if (focused) p.fill(r.x, r.y, r.w, r.h, C.sel);
      else if (active) p.fill(r.x, r.y, r.w, r.h, C.lo);
      else p.fill(r.x, r.y, r.w, r.h, C.csurf);
    }
    const kind = item.up ? 'up' : kindOf(item);
    const dark = cursor && focused;
    const name = item.dir && !item.up ? item.name + '/' : item.name;
    const size = item.up ? 'UP--DIR' : item.dir ? (kind === 'app' ? 'APP-DIR' : 'SUB-DIR') : formatSize(item.size);
    p.text(RV, r.x + 3, r.y + 2, KIND[kind].code, dark ? C.dark : C[KIND[kind].color]);
    p.text(RV, r.x + 21, r.y + 2, name, dark ? C.dark : item.dir ? C.bright : C.text);
    p.text(RV, r.x + nameW + COL_SIZE - textWidth(RV, size) - 3, r.y + 2, size, dark ? C.dark : item.dir ? C.dim : C.text);
    p.text(RV, r.x + nameW + COL_SIZE + 3, r.y + 2, item.date || '', dark ? C.dark : C.dim);
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

  cursorName(idx) {
    const item = this.cursorItem(idx);
    return item ? (item.up ? '..' : item.name) : '';
  }

  describe(item) {
    if (item.up) return T.pmcUpDir;
    if (item.dir) return `${item.name}/ · ${kindOf(item) === 'app' ? 'app' : 'folder'}`;
    return `${item.name} · ${formatBytes(item.size)} bytes`;
  }

  // The status line: what the cursor is on, and its date in a box on the right.
  statLine(p, r, text, date) {
    const dateW = 60;
    const left = { x: r.x, y: r.y, w: r.w - dateW - 2, h: r.h };
    p.fill(left.x, left.y, left.w, left.h, C.inset);
    p.bevel(left, 1, false);
    p.text(RV, left.x + 4, left.y + 3, fitText(RV, text, left.w - 8), C.bright);
    const right = { x: r.x + r.w - dateW, y: r.y, w: dateW, h: r.h };
    p.fill(right.x, right.y, right.w, right.h, C.inset);
    p.bevel(right, 1, false);
    p.text(RV, right.x + 4, right.y + 3, date, C.dim);
  }

  keysBar(p, hits, r) {
    const w = Math.floor(r.w / MC_KEYS.length);
    MC_KEYS.forEach((k, i) => {
      const cell = { x: r.x + i * w, y: r.y, w: i === MC_KEYS.length - 1 ? r.w - i * w : w - 2, h: r.h };
      box(p, cell, true, C.btn);
      const keyW = textWidth(RV, k.key);
      p.fill(cell.x + 3, cell.y + 3, keyW + 2, 8, C.dark);
      p.text(RV, cell.x + 4, cell.y + 3, k.key, C.bright);
      p.text(RV, cell.x + 6 + keyW, cell.y + 3, k.label, C.text);
      // Letters only says how the search works; its click makes the panel active, like its keys would.
      hits.add(cell, { click: () => (k.action ? this.mcKey(k.action) : this.activate(this.listIdx)) });
    });
  }

  mcKey(action) {
    if (action === 'enter') this.enter(this.act);
    else if (action === 'quick') this.toggleQuick();
    else if (action === 'tab') this.switchPanel();
    else if (action === 'back') this.closeQuick();
    else if (action === 'up') this.up(this.act);
    this.ws.requestDraw();
  }

  dispose() {
    if (this.view && this.view.dispose) this.view.dispose();
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
      .catch(() => { this.count = 0; })
      .finally(() => ws.requestDraw());
  }

  draw(p, r) {
    p.fill(r.x, r.y, r.w, r.h, C.win);
    const rows = [['Path', '/' + this.path + '/'], ['Type', 'folder'], ['Items', this.count === null ? '…' : String(this.count)], ['Modified', this.item.date]];
    rows.forEach(([k, v], i) => {
      p.text(RV, r.x + 8, r.y + 8 + i * 12, k, C.dim);
      p.text(RV, r.x + 70, r.y + 8 + i * 12, v, C.bright);
    });
  }

  dispose() {}
}

// A quick view that is only a message: an app's screen, or a file that has no viewer.
class Message {
  constructor(kind, item) {
    this.kind = kind;
    this.item = item;
  }

  draw(p, r) {
    p.fill(r.x, r.y, r.w, r.h, C.cb);
    p.text(RV, r.x + 8, r.y + 8, T.noViewer, C.ct);
  }

  dispose() {}
}
