// The pocket version: the site on a touch-first device (DESIGN.md, Pocket version). One tile fills the screen, as one
// program on a Pocket PC; the open tiles are slanted tabs at the bottom; Back closes the current tile.
// The tiles' bodies are the desktop's (note.js, media.js, image.js, app.js). Their draw() lays out keyboard key bars
// and foot panels, so this module draws their pocket layout from their parts, and its own chrome: the title bar,
// a key bar of touch cells, the message line and the tab strip with ppmc.
import { C } from './theme.js';
import { RV, VGA, textWidth, fitText } from './font.js';
import { Hits, box, wellFrame, keyBar, loadBar, NO_KEYS } from './widgets.js';
import { KIND, kindOf, list, setOf, formatSize } from './catalog.js';
import { layout } from './markdown.js';
import { NoteBody } from './note.js';
import { Player, headerOf } from './media.js';
import { ImageView } from './image.js';
import { AppPane } from './app.js';
import { HOME_NOTE, START_DIR } from './config.js';
import { POCKET_ACTIONS, P, T } from './texts.js';
import { view } from './view.js';

export const POCKET_W = 240;   // the layout width of a Pocket PC screen; the scale is the largest whole one that fits
export const ROW = 16;         // a list row: pmc's 12 grown for a finger
export const BAR = 16;         // a key-bar row: a 14 px cell and 2 px between rows
export const SLOTS = 4;        // key-bar cells in a row; Back is always the last slot of the last row
const DRAG = 4;                // layout pixels a finger moves before a tap is a drag

// The layout of a screen `devW` x `devH` device pixels: a whole scale k, so font pixels stay whole, and the size in
// layout pixels.
export function layoutOf(devW, devH) {
  const k = Math.max(1, Math.floor(devW / POCKET_W));
  return { k, w: Math.floor(devW / k), h: Math.floor(devH / k) };
}

const join = (dir, name) => (dir ? dir + '/' : '') + name;
const clock = (t) => (Number.isFinite(t) && t >= 0
  ? String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(Math.floor(t % 60)).padStart(2, '0') : '--:--');
const TILE_OF = { audio: 'Player', video: 'Video', image: 'Image', note: 'Note' };

export class Pocket {
  // `history`: Back and the system back gesture go through the browser history (the site; one screen on the page).
  constructor(requestDraw, { history = false } = {}) {
    this.requestDraw = requestDraw;
    this.useHistory = history;
    // What the desktop bodies read from their workspace.
    this.drawHeld = NO_KEYS;
    this.fullVideo = null;
    this.frame = 0;

    this.tiles = ['Note'];     // the open tiles, in tab order
    this.recent = ['Note'];    // the same, the most recently active last: Back returns to the one before
    this.active = 'Note';
    this.progress = new Set();
    this.msg = P.start;
    this.full = false;         // the video fills the screen
    this.note = new NoteBody(this, HOME_NOTE);
    this.pmc = { dir: START_DIR, entries: null, error: false, load: null, cursor: 0, top: 0, view: 1 };
    this.players = { audio: null, video: null };
    this.image = null;
    this.app = null;
    this.hits = new Hits();
    this.down = null;
    this.changeDir(START_DIR);

    if (history) {
      // The history lives one page load: after a reload the page stands on an old tile's entry, so it goes back to
      // the entry of the first tile, and the next system back leaves the site.
      const n = window.history.state?.pocket || 1;
      if (n > 1) window.history.go(1 - n);
      else window.history.replaceState({ pocket: 1 }, '');
      // The system back leaves the fullscreen first and gives the history entry back, as the Back cell does.
      window.addEventListener('popstate', (e) => {
        // Forward (an entry with as many tiles or more) opens nothing back; only going back closes.
        if ((e.state?.pocket ?? 1) >= this.tiles.length) return;
        if (this.full) { this.fullscreen(false); window.history.pushState({ pocket: this.tiles.length }, ''); }
        else if (this.active === 'pmc' && this.pmc.dir) { this.openRow(this.rows()[0]); window.history.pushState({ pocket: this.tiles.length }, ''); }
        else if (this.tiles.length > 1) this.closeActive();
        this.requestDraw();
      });
    }
  }

  // ---- tiles ----

  activate(id) {
    this.recent = this.recent.filter((x) => x !== id);
    this.recent.push(id);
    this.active = id;
  }

  open(id) {
    if (!this.tiles.includes(id)) {
      this.tiles.push(id);
      if (this.useHistory) window.history.pushState({ pocket: this.tiles.length }, '');
    }
    this.activate(id);
  }

  // Back: through the history when this screen owns it, so the cell and the system gesture are one action.
  back() {
    if (this.full) { this.fullscreen(false); return; }
    // In a folder, pmc's Back goes up, as Open on `..`; at the root it closes pmc.
    if (this.active === 'pmc' && this.pmc.dir) { this.openRow(this.rows()[0]); return; }
    if (this.tiles.length === 1) { this.msg = P.lastTile; return; }
    if (this.useHistory && window.history.state && window.history.state.pocket > 1) window.history.back();
    else this.closeActive();
  }

  closeActive() {
    if (this.tiles.length === 1) { this.msg = P.lastTile; return; }
    const id = this.active;
    const kind = id === 'Player' ? 'audio' : id === 'Video' ? 'video' : null;
    if (kind && this.players[kind]) { this.players[kind].element.remove(); this.players[kind].dispose(); this.players[kind] = null; }
    if (id === 'Image' && this.image) { this.image.dispose(); this.image = null; }
    if (id === 'App' && this.app) { this.app.dispose(); this.app = null; }
    if (id === 'Note') this.note.dispose();
    this.tiles =this.tiles.filter((x) => x !== id);
    this.recent = this.recent.filter((x) => x !== id);
    this.active = this.recent.at(-1);
    this.progress.add('close');
    this.msg = '';
  }

  // Shift+Q inside an app (app.js) closes its tile.
  closeApp(app) {
    if (app !== this.app) return;
    this.activate('App');
    this.back();
    this.requestDraw();
  }

  apps() { return this.app ? [this.app] : []; }

  // A playing video needs a frame at every animation frame (media.js: animated).
  animated() { return this.active === 'Video' && !!this.players.video && this.players.video.animated(); }

  // The tutorial marks: done, the next one, or none (markdown.js layout).
  progressOf(action) {
    if (this.progress.has(action.done)) return 'done';
    return POCKET_ACTIONS.find((a) => !this.progress.has(a.done)) === action ? 'next' : 'none';
  }

  // The video's fullscreen: the frame fills the screen, a tap or Back leaves it. The browser's fullscreen is asked
  // for on the site only; an iPhone refuses it for a page, and the frame still fills the screen.
  fullscreen(on) {
    this.full = on;
    if (!this.useHistory) return;
    if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  // ---- pmc: one panel ----

  // Loads a folder. Only the latest load is applied: a listing that comes after pmc moved on is dropped.
  changeDir(dir, cursorName) {
    const pm = this.pmc;
    Object.assign(pm, { dir, entries: null, error: false, cursor: 0, top: 0 });
    const load = list(dir);
    pm.load = load;
    return load
      .then((entries) => {
        if (pm.load !== load) return;
        pm.entries = entries;
        const i = cursorName ? this.rows().findIndex((r) => r.name === cursorName) : -1;
        if (i >= 0) { pm.cursor = i; pm.top = Math.max(0, i - pm.view + 1); }
      })
      .catch(() => { if (pm.load === load) { pm.error = true; pm.entries = []; } })
      .then(() => this.requestDraw());
  }

  rows() {
    const pm = this.pmc;
    const items = pm.entries || [];
    return pm.dir ? [{ name: '..', up: true }, ...items] : items;
  }

  moveCursor(d) {
    const pm = this.pmc;
    pm.cursor = Math.max(0, Math.min(this.rows().length - 1, pm.cursor + d));
    if (pm.cursor < pm.top) pm.top = pm.cursor;
    else if (pm.cursor >= pm.top + pm.view) pm.top = pm.cursor - pm.view + 1;
  }

  // Opens the row: a folder in pmc, a file in the tile of its type (one tile per type, as on the desktop).
  openRow(e, autoplay = true) {
    const pm = this.pmc;
    const kind = kindOf(e);
    if (kind === 'up') {
      const parts = pm.dir.split('/');
      const left = parts.pop();
      return this.changeDir(parts.join('/'), left);
    }
    if (kind === 'folder') { this.progress.add('enter'); return this.changeDir(join(pm.dir, e.name)); }
    if (kind === 'app') {
      if (this.app) this.app.dispose();
      this.app = new AppPane(this, pm.dir, e.name);
      this.progress.add('app');
      this.open('App');
      this.msg = P.appRunning(e.name);
      return;
    }
    const tile = TILE_OF[kind];
    if (!tile) { this.msg = `${e.name}: ${T.noViewer}`; return; }
    this.progress.add('play');
    this.msg = '';
    if (kind === 'note') {
      this.note.dispose();
      this.note = new NoteBody(this, join(pm.dir, e.name));
    } else {
      const set = setOf(pm.entries, kind);
      const index = Math.max(0, set.indexOf(e));
      if (kind === 'image') {
        if (this.image) this.image.open(pm.dir, set, index);
        else this.image = new ImageView(this, pm.dir, set, index);
      } else {
        const pl = this.players[kind];
        if (pl) { pl.open(pm.dir, set, index); if (!autoplay) pl.pause(); }
        else {
          const made = this.players[kind] = new Player(this, kind, pm.dir, set, index);
          if (kind === 'video') made.element.addEventListener('loadeddata', () => this.requestDraw());   // the first frame
          if (autoplay) made.play();
        }
      }
    }
    this.open(tile);
  }

  // A state to start from, for the design system: `path` is a folder (ending in /) or a file under the content root.
  async go(path, { autoplay = true } = {}) {
    const parts = path.split('/').filter(Boolean);
    const file = path && !path.endsWith('/') ? parts.pop() : null;
    this.open('pmc');
    await this.changeDir(parts.join('/'));
    if (file) {
      this.pmc.cursor = Math.max(0, this.rows().findIndex((r) => r.name === file));
      const row = this.rows()[this.pmc.cursor];
      if (row) await this.openRow(row, autoplay);
    }
    this.requestDraw();
  }

  // ---- drawing ----

  render(p, W, H) {
    this.frame++;
    const hits = this.hits = new Hits();
    const video = this.active === 'Video' && this.players.video;
    if (this.full && video) {
      if (this.app) this.app.hide();
      const all = { x: 0, y: 0, w: W, h: H };
      p.fill(0, 0, W, H, C.crust);
      this.placeVideo(all);
      hits.add(all, { click: () => this.fullscreen(false) });
      return;
    }
    if (!video) this.placeVideo(null);

    // The one tile: a raised frame over the whole screen, as a maximized tile.
    p.fill(0, 0, W, H, C.win);
    p.bevel({ x: 0, y: 0, w: W, h: H }, 2, true);
    this.titleBar(p, { x: 4, y: 4, w: W - 8, h: 14 });

    const keys = this.keysOf(this.active);
    const keyRows = Math.ceil(keys.length / SLOTS);
    const tabsY = H - 4 - 14;
    const msgY = tabsY - 2 - 14;
    const keysY = msgY - 2 - keyRows * BAR;
    const body = { x: 4, y: 20, w: W - 8, h: keysY - 2 - 20 };

    p.clip(body);
    hits.clip(body);
    if (this.active === 'Note') this.drawNote(p, hits, body);
    else if (this.active === 'pmc') this.drawPmc(p, hits, body);
    else if (this.active === 'Player') this.drawMedia(p, hits, body, this.players.audio);
    else if (video) this.drawMedia(p, hits, body, video);
    else if (this.active === 'Image') this.drawImage(p, body);
    else if (this.active === 'App') this.drawApp(p, body);
    hits.unclip();
    p.unclip();
    if (this.app && this.active !== 'App') this.app.hide();

    // The key bar: SLOTS cells a row; an empty slot stays blank, so Back keeps its place on every tile.
    const cellW = Math.floor((W - 8 - 2 * (SLOTS - 1)) / SLOTS);
    keys.forEach((cell, i) => {
      if (!cell) return;
      const r = { x: 4 + (i % SLOTS) * (cellW + 2), y: keysY + Math.floor(i / SLOTS) * BAR, w: cellW, h: 14 };
      keyBar(p, hits, r, [cell], NO_KEYS);
    });
    const msg = { x: 4, y: msgY, w: W - 8, h: 14 };
    p.fill(msg.x, msg.y, msg.w, msg.h, C.inset);
    p.bevel(msg, 1, false);
    p.text(RV, msg.x + 4, msg.y + 3, fitText(RV, this.msg.replace(/[[\]]/g, ''), msg.w - 8), C.bright);
    this.tabStrip(p, hits, { x: 4, y: tabsY, w: W - 8, h: 14 });
    // Every tappable thing looks pressed while the finger is on it, as on the desktop (workspace.js).
    const pr = this.down && !this.down.moved && this.down.pressed;
    const held = pr && hits.list.find((h) => h.on.click && h.r.x === pr.x && h.r.y === pr.y && h.r.w === pr.w && h.r.h === pr.h);
    if (held) p.bevel(held.r, 2, false);
  }

  // The video is shown by its own element over the frame, as app.js shows an app's iframe: a phone's browser gave the
  // canvas black frames of a video that is not on the page (Android Chrome, 2026-11-09). `r` null hides it.
  placeVideo(r) {
    const el = this.players.video && this.players.video.element;
    if (!el) return;
    if (!r) { el.style.display = 'none'; return; }
    if (!el.parentNode) {
      el.style.cssText = `position:absolute;object-fit:contain;pointer-events:none;background:${C.crust};`;
      document.body.append(el);
    }
    const k = view.ui / view.dpr;
    Object.assign(el.style, { display: 'block', left: `${r.x * k}px`, top: `${r.y * k}px`, width: `${r.w * k}px`, height: `${r.h * k}px` });
  }

  title() {
    const a = this.active;
    if (a === 'Note') return T.tile.Note + ' · ' + this.note.path.split('/').pop();
    if (a === 'Image' && this.image) return T.tile.Image + ' · ' + this.image.entry.name;
    if (a === 'App' && this.app) return T.tile.App + ' · ' + this.app.name;
    return T.tile[a] || a;
  }

  // The title bar: the tile's title on a plate over the dither, the clock on the right. No X: Back closes.
  titleBar(p, r) {
    p.dither(r, C.win, C.lo);
    const now = new Date();
    const time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const label = fitText(RV, this.title(), r.w - textWidth(RV, time) - 30);
    p.fill(r.x + 2, r.y, textWidth(RV, label) + 12, r.h, C.win);
    p.text(RV, r.x + 8, r.y + 3, label, C.bright);
    const tw = textWidth(RV, time) + 8;
    p.fill(r.x + r.w - tw, r.y, tw, r.h, C.win);
    p.text(RV, r.x + r.w - tw + 4, r.y + 3, time, C.text);
  }

  // The tab strip: slanted folder tabs, the active one brass, and the ppmc cell at the right. ppmc opens pmc; while
  // pmc is the current tile the cell is sunken and takes no tap.
  tabStrip(p, hits, r) {
    const cell = { x: r.x + r.w - 44, y: r.y, w: 44, h: r.h };
    let x = r.x + 2;
    // Too many tabs for the strip: all get the same narrower width and a cut name, so every tile keeps a tab.
    const names = this.tiles.map((id) => T.tile[id] || id);
    const fit = Math.floor((cell.x - 6 - x) / names.length) - 4;
    const full = names.reduce((s, n) => s + textWidth(RV, n) + 22, 0) <= cell.x - 6 - x;
    for (const [i, id] of this.tiles.entries()) {
      const w = full ? textWidth(RV, names[i]) + 18 : fit;
      const label = fitText(RV, names[i], w - 18);
      const active = id === this.active;
      const rows = p.slant(x, r.y, w, r.h, 6, active ? C.sel : C.win);
      if (!active) rows.forEach((rx, i) => { p.fill(rx + w - 1, r.y + i, 1, 1, C.lo); p.fill(rx + w, r.y + i, 2, 1, C.hi); });
      p.text(RV, x + 9, r.y + 3, label, active ? C.dark : C.text);
      hits.add({ x, y: r.y - 2, w: w + 6, h: r.h + 4 }, { click: () => {
        if (id !== this.active) this.progress.add('switch');
        this.activate(id);
        this.msg = '';
      } });
      x += w + 4;
    }
    const here = this.active === 'pmc';
    box(p, cell, !here, here ? C.inset : C.btn, 1);
    p.fill(cell.x + 3, cell.y + 2, textWidth(RV, P.ppmc) + 6, 10, C.dark);
    p.text(RV, cell.x + 6, cell.y + 3, P.ppmc, here ? C.dim : this.progress.has('open') ? C.bright : C.sel);
    if (!here) {
      hits.add({ x: cell.x - 2, y: cell.y - 4, w: cell.w + 4, h: cell.h + 6 }, { click: () => {
        this.open('pmc');
        this.progress.add('open');
        this.msg = P.pmcHint;
      } });
    }
  }

  // The key bars, SLOTS a row, null for an empty slot. The key is a symbol: a phone has no keyboard.
  // No volume and no seek cells: the phone has volume buttons, and the position slider seeks under the finger.
  keysOf(id) {
    const c = (key, label, click) => ({ key, label, codes: [], click: () => { click(); this.requestDraw(); } });
    const BACK = c('<', 'Back', () => this.back());
    if (id === 'pmc') {
      const cur = () => this.rows()[this.pmc.cursor];
      return [c('>', 'Open', () => cur() && this.openRow(cur())), c('^', 'Up', () => this.moveCursor(-1)),
        c('v', 'Down', () => this.moveCursor(1)), BACK];
    }
    if ((id === 'Player' || id === 'Video') && this.players[id === 'Player' ? 'audio' : 'video']) {
      const pl = this.players[id === 'Player' ? 'audio' : 'video'];
      const cells = [
        c('|<', 'Prev', () => pl.load(pl.index - 1, pl.playing)),
        pl.playing ? c('||', 'Pause', () => pl.pause()) : c('>', 'Play', () => pl.play()),
        c('[]', 'Stop', () => pl.stop()),
        c('>|', 'Next', () => pl.load(pl.index + 1, pl.playing)),
        c('M', pl.element.muted ? 'Unmute' : 'Mute', () => pl.toggleMute()),
      ];
      return id === 'Player' ? [...cells, null, null, BACK] : [...cells, c('F', 'Full', () => this.fullscreen(true)), null, BACK];
    }
    if (id === 'Image' && this.image) {
      return [c('<', 'Prev', () => this.image.load(this.image.index - 1)), c('>', 'Next', () => this.image.load(this.image.index + 1)), null, BACK];
    }
    if (id === 'App' && this.app) return [c('0', 'Restart', () => this.app.restart()), null, null, BACK];
    // A note scrolls under the finger: Back alone.
    return [null, null, null, BACK];
  }

  // The note: the desktop's Markdown layout in a sunken well, with the pocket tutorial in place of {{actions}}.
  drawNote(p, hits, r) {
    const well = wellFrame(p, r, C.inset);
    const n = this.note;
    const view = { x: well.x + 6, y: well.y + 6, w: well.w - 12, h: well.h - 12 };
    if (n.error) { p.text(RV, view.x, view.y, fitText(RV, T.loadError + n.path, view.w), C.red); return; }
    if (!n.blocks) { loadBar(p, view.x, view.y, n.download); return; }
    const lay = layout(n.blocks, view.w, (a) => this.progressOf(a), POCKET_ACTIONS);
    n.top = Math.max(0, Math.min(n.top, lay.height - view.h));
    hits.add(view, { scroll: (dy) => { n.top -= dy; } });
    p.clip(view);
    for (const op of lay.ops) n.drawOp(p, op, view, n.top);
    p.unclip();
    for (const h of lay.hits) {
      const y = view.y + h.y - n.top;
      if (y < view.y || y + h.h > view.y + view.h) continue;
      hits.add({ x: view.x + h.x, y, w: h.w, h: h.h }, { click: () => window.open(h.href, '_blank', 'noopener,noreferrer') });
    }
  }

  // pmc: the path, the list well with its columns, the status line with the folder's load bar.
  drawPmc(p, hits, r) {
    const pm = this.pmc;
    const field = { x: r.x, y: r.y, w: r.w, h: 14 };
    p.fill(field.x, field.y, field.w, field.h, C.inset);
    p.bevel(field, 1, false);
    p.text(RV, field.x + 4, field.y + 3, fitText(RV, '/' + (pm.dir ? pm.dir + '/' : ''), field.w - 8), C.sel);

    const well = wellFrame(p, { x: r.x, y: r.y + 16, w: r.w, h: r.h - 32 }, C.inset);
    const sizeX = well.x + well.w - 6 * 7 - 4;
    p.fill(well.x, well.y, well.w, 11, C.win);
    p.text(RV, well.x + 4, well.y + 2, 'Name', C.bright);
    p.text(RV, sizeX, well.y + 2, 'Size', C.bright);
    const all = this.rows();
    const view = pm.view = Math.max(1, Math.floor((well.h - 12) / ROW));
    pm.top = Math.max(0, Math.min(pm.top, all.length - view));
    for (let i = 0; i < view && pm.top + i < all.length; i++) {
      const n = pm.top + i, e = all[n], kd = KIND[kindOf(e)];
      const row = { x: well.x, y: well.y + 12 + i * ROW, w: well.w, h: ROW };
      const cur = n === pm.cursor;
      if (cur) p.fill(row.x, row.y, row.w, row.h, C.sel);
      p.text(RV, row.x + 4, row.y + 4, kd.code, cur ? C.dark : C[kd.color]);
      p.text(RV, row.x + 20, row.y + 4, fitText(RV, e.name + (e.dir ? '/' : ''), sizeX - row.x - 24), cur ? C.dark : C.text);
      p.text(RV, sizeX, row.y + 4, e.up ? 'UP--DIR' : e.dir ? 'SUB-DIR' : formatSize(e.size), cur ? C.dark : e.dir || e.up ? C.dim : C.text);
      // A tap on a row puts the cursor there; a tap on the cursor opens it.
      hits.add(row, { click: () => {
        if (cur) this.openRow(e);
        else { pm.cursor = n; this.msg = P.again(e.name); }
      } });
    }
    // Under the rows drawn: under `..` while a folder loads or fails.
    const listY = well.y + 12 + (all.length - pm.top) * ROW;
    if (pm.error) p.text(RV, well.x + 4, listY + 4, T.folderError, C.red);
    else if (!pm.entries) p.text(RV, well.x + 4, listY + 4, T.loading, C.dim);
    // A drag comes in steps of a few pixels: they add up until they make a whole row.
    hits.add(well, { scroll: (dy) => {
      pm.drag = (pm.drag || 0) + dy;
      const n = Math.trunc(pm.drag / ROW);
      pm.top -= n;
      pm.drag -= n * ROW;
    } });

    const status = { x: r.x, y: r.y + r.h - 14, w: r.w, h: 14 };
    p.fill(status.x, status.y, status.w, status.h, C.inset);
    p.bevel(status, 1, false);
    const e = all[pm.cursor];
    const files = (pm.entries || []).filter((x) => !x.dir).length;
    const info = e ? e.name + (e.dir || e.up ? '' : ' · ' + formatSize(e.size)) : '';
    p.text(RV, status.x + 4, status.y + 3, fitText(RV, [info, files + ' files'].filter(Boolean).join(' · '), status.w - 8 - 39), C.text);
    const state = pm.error ? 'errr' : pm.entries ? 'done' : 'load';
    loadBar(p, status.x + status.w - 38, status.y + 1, { state, share: state === 'done' ? 1 : 0 });
  }

  // The Player and Video tiles as the desktop draws them (media.js) on the olive tile: the now-playing well, the
  // Position slider, then the playlist (audio) or the fitted frame (video). The volume is left out.
  drawMedia(p, hits, r, pl) {
    const end = this.nowPlaying(p, r, pl);
    const below = pl.seekBar(p, hits, { x: r.x + 2, y: end + 6, w: r.w - 4 });
    const rest = { x: r.x, y: below + 6, w: r.w, h: r.y + r.h - below - 6 };
    if (pl.kind === 'audio') { pl.playlist(p, hits, rest); return; }
    p.fill(rest.x, rest.y, rest.w, rest.h, C.crust);
    this.placeVideo(rest);
  }

  // The now-playing well: the top of media.js transport() without its volume.
  // ponytail: a copy of those lines, since transport() draws the volume too; a shared function in media.js if they drift.
  nowPlaying(p, r, pl) {
    const now = { x: r.x, y: r.y, w: r.w, h: 56 };
    p.fill(now.x, now.y, now.w, now.h, C.cb);
    const time = clock(pl.element.currentTime);
    p.text(VGA, now.x + 10, now.y + 12, time, C.green, 2);
    const tx = now.x + 10 + textWidth(VGA, time, 2) + 12;
    const tw = now.x + now.w - 8 - tx;
    const head = headerOf(pl.entry.name, pl.tags.get(pl.path(pl.index)));
    p.text(RV, tx, now.y + 10, fitText(RV, head.name, tw, 2), C.ct, 2);
    if (head.art) p.text(RV, tx, now.y + 28, fitText(RV, head.art, tw), C.cs);
    const folder = pl.dir ? '/' + pl.dir + '/' : '/';
    const size = pl.kind === 'video' ? ` · ${pl.videoSize()}` : '';
    const meta = `${pl.entry.name.split('.').pop().toUpperCase()} · ${clock(pl.duration())} · ${folder} · ${pl.index + 1} of ${pl.set.length}${size}`;
    p.text(RV, tx, now.y + (head.art ? 40 : 30), fitText(RV, meta, tw), C.cs);
    return now.y + now.h;
  }

  // The picture: fitted into the navy area and never enlarged, as image.js draws it; its name is in the title.
  // ponytail: the lines of ImageView.draw without its key bar and foot panel.
  drawImage(p, r) {
    const im = this.image;
    p.fill(r.x, r.y, r.w, r.h, C.cb);
    const path = im.path(im.index);
    const d = im.downloads.peek(path);
    const img = im.img;
    if (d.state === 'done' && im.shown === path && img.complete && img.naturalWidth) {
      const s = Math.min(1, r.w / img.naturalWidth, r.h / img.naturalHeight);
      const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
      p.image(img, r.x + Math.floor((r.w - w) / 2), r.y + Math.floor((r.h - h) / 2), w, h);
    } else if (d.state === 'errr' || (im.shown === path && img.complete)) {
      p.text(RV, r.x + 6, r.y + 6, fitText(RV, T.loadError + im.entry.name, r.w - 12), C.red);
    } else {
      loadBar(p, r.x + 6, r.y + 6, d);
    }
  }

  // The app: a navy well with a status line, the app's frame over the rest (app.js places it).
  drawApp(p, r) {
    const app = this.app;
    p.fill(r.x, r.y, r.w, r.h, C.cb);
    p.bevel(r, 1, false);
    const inner = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 };
    if (app.status === 'error') {
      p.text(RV, inner.x + 6, inner.y + 3, fitText(RV, app.error || T.appNoIndex, inner.w - 12), C.red);
      app.hide();
      return;
    }
    if (app.status === 'loading') p.text(RV, inner.x + 6, inner.y + 3, T.appLoading, C.ct);
    app.place(app.status === 'loading' ? { x: inner.x, y: inner.y + 14, w: inner.w, h: inner.h - 14 } : inner);
  }

  // ---- input: a tap clicks, a drag scrolls, a press (the Position slider) follows the finger ----

  pointerDown(x, y) {
    const click = this.hits.find(x, y, 'click');
    this.down = { x, y, last: y, moved: false, drag: null, scroll: this.hits.find(x, y, 'scroll'), pressed: click && click.r };
    this.requestDraw();
    const pr = this.hits.find(x, y, 'press');
    if (pr) {
      const r = pr.on.press(x, y);
      this.down.drag = typeof r === 'function' ? r : (r && r.move) || (() => {});
      this.requestDraw();
    }
  }

  pointerMove(x, y) {
    const d = this.down;
    if (!d) return;
    if (d.drag) { d.drag(x, y); this.requestDraw(); return; }
    if (!d.moved && (Math.abs(y - d.y) > DRAG || Math.abs(x - d.x) > DRAG)) { d.moved = true; this.requestDraw(); }
    if (d.moved && d.scroll) { d.scroll.on.scroll(y - d.last); d.last = y; this.requestDraw(); }
  }

  pointerUp(x, y) {
    const d = this.down;
    this.down = null;
    if (!d || d.moved || d.drag) return;
    const h = this.hits.find(x, y, 'click');
    if (h) { h.on.click(x, y); this.requestDraw(); }
  }

  // The browser took the touch (a system gesture, a second finger): nothing is clicked.
  cancel() { this.down = null; }

  // A mouse wheel, for a desktop that is shown the pocket version (the design system): it scrolls like a drag.
  wheel(x, y, dy) {
    const h = this.hits.find(x, y, 'scroll');
    if (!h) return false;
    h.on.scroll(-Math.sign(dy) * ROW * 3);
    return true;
  }
}
