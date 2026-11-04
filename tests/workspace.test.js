// The workspace's tiles: the start layout, one tile per type, and no splitting. No browser needed: fetch,
// Audio and document are stubbed with the least the tile bodies touch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Workspace } from '../site/js/workspace.js';
import { NoteBody } from '../site/js/note.js';
import { Player } from '../site/js/media.js';
import { view } from '../site/js/view.js';
import { ENV_CELLS, TUTORIAL_ACTIONS, T } from '../site/js/texts.js';
import { list } from '../site/js/catalog.js';

const ENTRIES = [
  { name: 'a.mp3', type: 'file', size: 1, mtime: '2026-11-04T00:00:00Z' },
  { name: 'b.mp3', type: 'file', size: 1, mtime: '2026-11-04T00:00:00Z' },
  { name: 'a.md', type: 'file', size: 1, mtime: '2026-11-04T00:00:00Z' },
  { name: 'b.md', type: 'file', size: 1, mtime: '2026-11-04T00:00:00Z' },
];
globalThis.fetch = async () => ({ ok: true, json: async () => ENTRIES, text: async () => '# note' });
const element = () => ({
  style: {}, addEventListener() {}, appendChild() {}, removeAttribute() {}, remove() {}, load() {}, pause() {},
  play: async () => {},
});
globalThis.Audio = function Audio() { return element(); };
globalThis.document = { createElement: element, body: element() };

const settle = () => new Promise((r) => setTimeout(r, 0));
const item = (name) => ({ name, dir: false, size: 1, date: '2026-11-04' });
const pmcOf = (ws) => [...ws.panes.values()].find((t) => t.tab === 'pmc').body;

test('start: readme note left, pmc right and focused', () => {
  const ws = new Workspace(() => {});
  assert.equal(ws.panes.size, 2);
  assert.equal(ws.titleOf(ws.focus), 'pmc');
  const other = [...ws.panes.values()].find((t) => t.id !== ws.focus);
  assert.equal(ws.titleOf(other.id), 'Note');
  assert.ok(other.body instanceof NoteBody);
  assert.equal(other.body.path, 'readme.md');
  assert.deepEqual([ws.L.root.a.tabs[0], ws.L.root.b.tabs[0]], [other.id, ws.focus]);
});

test('Shift+Enter with pmc open focuses it, no new tile', () => {
  const ws = new Workspace(() => {});
  const pmcId = ws.focus;
  ws.setFocus([...ws.panes.keys()].find((id) => id !== pmcId));
  ws.command('open-pmc');
  assert.equal(ws.panes.size, 2);
  assert.equal(ws.focus, pmcId);
});

test('KEYS_MENU has no KeyH/KeyV', () => {
  const ws = new Workspace(() => {});
  // On the note, which has no use for letters: the workspace must not take Shift+H or Shift+V either.
  ws.setFocus([...ws.panes.keys()].find((id) => id !== ws.focus));
  assert.equal(ws.key({ code: 'KeyH', shiftKey: true }), false);
  assert.equal(ws.key({ code: 'KeyV', shiftKey: true }), false);
  assert.equal(ws.panes.size, 2);
  assert.ok(!ENV_CELLS.some((c) => c.command.startsWith('split-')));
  assert.ok(!TUTORIAL_ACTIONS.some((a) => a.done === 'split'));
});

test('openFile on a note while a Note tile exists focuses it and loads the new path', () => {
  const ws = new Workspace(() => {});
  const note = [...ws.panes.values()].find((t) => t.tab === 'Note');
  ws.openFile(pmcOf(ws), 'texts', item('b.md'));
  assert.equal(ws.panes.size, 2);
  assert.equal(ws.focus, note.id);
  assert.equal(ws.panes.get(note.id).body.path, 'texts/b.md');
  assert.equal(ws.titleOf(note.id), 'Note');
});

test('openApp same name focuses, other name adds a tile', () => {
  const ws = new Workspace(() => {});
  const pmc = pmcOf(ws);
  ws.openApp(pmc, 'games', 'squid-maid.exe');
  assert.equal(ws.panes.size, 3);
  const app = [...ws.panes.values()].find((t) => t.tab === 'App');
  assert.equal(ws.titleOf(app.id), 'squid-maid.exe');
  ws.setFocus(pmc.id);
  ws.openApp(pmc, 'games', 'squid-maid.exe');
  assert.equal(ws.panes.size, 3);
  assert.equal(ws.focus, app.id);
  ws.openApp(pmc, 'games', 'other.exe');
  assert.equal(ws.panes.size, 4);
});

test('closing the Player then openFile makes a new tile', async () => {
  const ws = new Workspace(() => {});
  const pmc = pmcOf(ws);
  // pmc passes the listing's own entry, which the set is searched for.
  const entries = await list('music');
  const track = (name) => entries.find((e) => e.name === name);
  ws.openFile(pmc, 'music', track('a.mp3'));
  await settle();
  assert.equal(ws.panes.size, 3);
  const player = [...ws.panes.values()].find((t) => t.tab === 'Player');
  assert.equal(ws.titleOf(player.id), 'Player');
  // A second track while the Player is open goes to the same tile.
  ws.openFile(pmc, 'music', track('b.mp3'));
  await settle();
  assert.equal(ws.panes.size, 3);
  assert.equal(ws.focus, player.id);
  assert.equal(ws.panes.get(player.id).body.entry.name, 'b.mp3');
  ws.closeFocus();
  assert.equal(ws.panes.size, 2);
  ws.openFile(pmc, 'music', track('a.mp3'));
  await settle();
  assert.equal(ws.panes.size, 3);
  const again = [...ws.panes.values()].find((t) => t.tab === 'Player');
  assert.notEqual(again.id, player.id);
});

test('a file or app opened again while another tile is maximized restores the layout', () => {
  const ws = new Workspace(() => {});
  const pmc = pmcOf(ws);
  const note = [...ws.panes.values()].find((t) => t.tab === 'Note');
  ws.L.max = pmc.id;
  ws.openFile(pmc, 'texts', item('b.md'));
  assert.equal(ws.focus, note.id);
  assert.equal(ws.L.max, null);
  ws.openApp(pmc, 'games', 'squid-maid.exe');
  const app = [...ws.panes.values()].find((t) => t.tab === 'App');
  ws.setFocus(pmc.id);
  ws.L.max = pmc.id;
  ws.openApp(pmc, 'games', 'squid-maid.exe');
  assert.equal(ws.focus, app.id);
  assert.equal(ws.L.max, null);
});

test('a press anywhere in a tile focuses it; its widgets still take the press; a border focuses nothing', () => {
  const ws = new Workspace(() => {});
  const note = [...ws.panes.values()].find((t) => t.tab === 'Note');
  const pmcId = ws.focus;
  let row = 0, link = 0, border = 0;
  // As the last draw left them: the two tiles with a border between, a pmc row (press), the note's text (wheel
  // only) with a link over it, and the border's press.
  ws.tiles = [{ id: note.id, r: { x: 0, y: 0, w: 100, h: 100 } }, { id: pmcId, r: { x: 104, y: 0, w: 100, h: 100 } }];
  ws.hits.add({ x: 10, y: 10, w: 80, h: 80 }, { wheel: () => {} });
  ws.hits.add({ x: 20, y: 20, w: 10, h: 10 }, { click: () => link++ });
  ws.hits.add({ x: 110, y: 20, w: 80, h: 10 }, { press: () => { row++; } });
  ws.hits.add({ x: 100, y: 0, w: 4, h: 100 }, { press: () => { border++; } });
  ws.pointerDown(50, 50);
  ws.pointerUp(50, 50);
  assert.equal(ws.focus, note.id);
  ws.pointerDown(150, 25);
  ws.pointerUp(150, 25);
  assert.equal(ws.focus, pmcId);
  assert.equal(row, 1);
  ws.pointerDown(25, 25);
  ws.pointerUp(25, 25);
  assert.equal(link, 1);
  assert.equal(ws.focus, note.id);
  ws.pointerDown(101, 50);
  ws.pointerUp(101, 50);
  assert.equal(border, 1);
  assert.equal(ws.focus, note.id);
});

test('fullscreen video: the panel and the cursor show for 3 s after a move, and while the pointer is over the panel', () => {
  const ws = new Workspace(() => {});
  ws.screen = { w: 800, h: 600 };
  assert.equal(ws.cursorHidden(), false);
  ws.fullVideo = {};
  ws.panelUntil = Date.now() + 1000;
  assert.equal(ws.cursorHidden(), false);
  ws.panelUntil = Date.now() - 1;
  ws.point = { x: 400, y: 100 };
  assert.equal(ws.cursorHidden(), true);
  ws.point = { x: 400, y: 590 };
  assert.equal(ws.cursorHidden(), false);
});

test('double click: a video frame enters the fullscreen, anywhere but the shown panel leaves it; audio maximizes', () => {
  globalThis.document.documentElement = { requestFullscreen: async () => {} };
  globalThis.document.fullscreenElement = null;
  const ws = new Workspace(() => {});
  ws.screen = { w: 800, h: 600 };
  const video = new Player(ws, 'video', 'video', [item('a.webm')], 0);
  const tile = { id: 'v1', body: video, label: 'Video', tab: 'Video' };
  ws.panes.set(tile.id, tile);
  ws.tiles = [{ id: tile.id, r: { x: 0, y: 0, w: 400, h: 400 } }];
  video.frameRect = { x: 10, y: 100, w: 300, h: 200 };
  assert.equal(ws.doubleClick(5, 50), false);
  assert.equal(ws.fullVideo, null);
  assert.equal(ws.doubleClick(50, 150), true);
  assert.equal(ws.fullVideo, video);
  ws.panelUntil = Date.now() + 1000;
  assert.equal(ws.doubleClick(400, 590), false);   // on the panel: its cells take the clicks
  assert.equal(ws.fullVideo, video);
  assert.equal(ws.doubleClick(400, 100), true);
  assert.equal(ws.fullVideo, null);
  // An audio Player has no fullscreen: Shift+F maximizes its tile.
  const audio = new Player(ws, 'audio', 'music', [item('a.mp3')], 0);
  ws.panes.set('a1', { id: 'a1', body: audio, label: 'Player', tab: 'Player' });
  ws.focus = 'a1';
  ws.L.max = null;
  ws.fullscreenOrMaximize();
  assert.equal(ws.L.max, 'a1');
  assert.equal(ws.fullVideo, null);
});

test('fullscreen video: Shift+R and other Shift combinations are swallowed, Space reaches the player, Shift+F leaves', () => {
  globalThis.document.documentElement = { requestFullscreen: async () => {} };
  globalThis.document.fullscreenElement = null;
  const ws = new Workspace(() => {});
  const video = new Player(ws, 'video', 'video', [item('a.webm')], 0);
  ws.panes.set('v1', { id: 'v1', body: video, label: 'Video', tab: 'Video' });
  const focus = ws.focus;
  let toggled = 0;
  video.toggle = () => { toggled++; };
  video.fullscreen();
  assert.equal(ws.fullVideo, video);
  const saved = globalThis.setTimeout;
  globalThis.setTimeout = () => 0;   // showPanel's 3 s redraw would keep the test process alive
  try {
    assert.equal(ws.key({ code: 'KeyR', shiftKey: true }), true);
    assert.equal(ws.mode, null);
    assert.equal(ws.key({ code: 'ArrowRight', shiftKey: true }), true);
    assert.equal(ws.focus, focus);
    assert.equal(ws.key({ code: 'Space' }), true);
    assert.equal(toggled, 1);
    assert.ok(ws.panelUntil > Date.now());
  } finally {
    globalThis.setTimeout = saved;
  }
  assert.equal(ws.key({ code: 'KeyF', shiftKey: true }), true);
  assert.equal(ws.fullVideo, null);
});

const window_ = (w, h) => { globalThis.innerWidth = w; globalThis.innerHeight = h; view.dpr = 1; };

// The start layout's minimum is the viewport's 960x540, so 2x needs 1920x1080 and 1.5x needs 1440x810: 1700x1000 holds 1.5x only.
test('at 1700x1000 largestScale is 1.5', () => {
  window_(1700, 1000);
  assert.equal(new Workspace(() => {}).largestScale(), 1.5);
});

test('cycleScale goes 1 -> 1.5 -> 2 -> 1 in a 2000x1200 window', () => {
  window_(2000, 1200);
  const ws = new Workspace(() => {});
  view.ui = 1;
  const seen = [];
  for (let i = 0; i < 3; i++) { ws.cycleScale(); seen.push(view.ui); }
  assert.deepEqual(seen, [1.5, 2, 1]);
});

test('in 1700x1000, cycleScale from 1.5 skips 2 with its message and size, then goes to 1', () => {
  window_(1700, 1000);
  const ws = new Workspace(() => {});
  view.ui = 1.5;
  ws.cycleScale();
  const m = ws.minimum();
  assert.equal(view.ui, 1);
  assert.equal(ws.msg, `${T.scaleNeeds(2)} ${Math.ceil(m.w * 2)}×${Math.ceil(m.h * 2)}`);
});

test('a window shrunk under 1.5 falls to largestScale, not to 1 when 1.5 still fits', () => {
  window_(1700, 1000);
  const ws = new Workspace(() => {});
  view.ui = 2;
  assert.equal(ws.fitsScale(2), false);
  assert.equal(ws.largestScale(), 1.5);
});
