// The workspace's tiles: the start layout, one tile per type, and no splitting. No browser needed: fetch,
// Audio and document are stubbed with the least the tile bodies touch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Workspace } from '../site/js/workspace.js';
import { NoteBody } from '../site/js/note.js';
import { ENV_CELLS, TUTORIAL_ACTIONS } from '../site/js/texts.js';
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
