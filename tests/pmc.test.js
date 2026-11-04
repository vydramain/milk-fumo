// pmc's F3 and Enter rules (spec 7): one quick view, changed only by F3 or Enter. The tile bodies are stubbed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PmcPane } from '../site/js/pmc.js';
import { kindOf } from '../site/js/catalog.js';

globalThis.fetch = async () => ({ ok: true, json: async () => [] });
const element = () => ({
  style: {}, addEventListener() {}, appendChild() {}, removeAttribute() {}, remove() {}, load() {}, pause() {},
  play: async () => {},
});
globalThis.Audio = function Audio() { return element(); };
globalThis.document = { createElement: element, body: element() };

const file = (name) => ({ name, dir: false, size: 1, date: '2026-11-04' });
const dir = (name) => ({ name, dir: true, size: 0, date: '2026-11-04' });

function setup() {
  const calls = { openFile: [], openApp: [], open: [], made: [], disposed: [] };
  const ws = {
    requestDraw() {}, drawHeld: new Set(),
    openFile: (...a) => calls.openFile.push(a), openApp: (...a) => calls.openApp.push(a),
  };
  const pmc = new PmcPane(ws);
  pmc.panels[0].dir = 'm';
  pmc.panels[0].entries = [file('a.mp3'), file('b.mp3'), file('a.png'), file('b.png'), dir('folder'), dir('game')];
  pmc.makeView = (item) => {
    const view = {
      kind: kindOf(item),
      open: (...a) => calls.open.push(a),
      dispose: () => calls.disposed.push(item.name),
    };
    calls.made.push(item.name);
    return view;
  };
  // Cursor rows: 0 is "..", then the entries in order.
  const at = (name) => { pmc.panels[0].cursor = 1 + pmc.panels[0].entries.findIndex((e) => e.name === name); };
  return { pmc, calls, at };
}

test('F3 on a file opens the quick view of its kind; moving the cursor does not change it', () => {
  const { pmc, calls, at } = setup();
  at('a.mp3');
  pmc.f3();
  assert.equal(pmc.quick.kind, 'audio');
  assert.equal(pmc.quick.path, 'm/a.mp3');
  assert.equal(pmc.quickIdx, 1);
  const view = pmc.quickView();
  at('a.png');
  assert.equal(pmc.quickView(), view);
  assert.deepEqual(calls.made, ['a.mp3']);
});

test('F3 on another file of the same kind calls view.open', () => {
  const { pmc, calls, at } = setup();
  at('a.mp3');
  pmc.f3();
  const view = pmc.quick.view;
  at('b.mp3');
  pmc.f3();
  assert.equal(pmc.quick.view, view);
  assert.equal(pmc.quick.path, 'm/b.mp3');
  assert.equal(calls.open.length, 1);
  assert.equal(calls.open[0][0], 'm');
  assert.equal(calls.open[0][2], 1);
});

test('F3 on a file of another kind replaces the view', () => {
  const { pmc, calls, at } = setup();
  at('a.mp3');
  pmc.f3();
  at('a.png');
  pmc.f3();
  assert.equal(pmc.quick.kind, 'image');
  assert.deepEqual(calls.disposed, ['a.mp3']);
  assert.deepEqual(calls.made, ['a.mp3', 'a.png']);
});

test('F3 on the shown file closes; F3 with the quick panel active closes', () => {
  const { pmc, calls, at } = setup();
  at('a.mp3');
  pmc.f3();
  pmc.f3();
  assert.equal(pmc.quick, null);
  assert.deepEqual(calls.disposed, ['a.mp3']);
  pmc.f3();
  pmc.act = pmc.quickIdx;
  pmc.f3();
  assert.equal(pmc.quick, null);
  assert.equal(pmc.act, 0);
});

test('F3 on an app or a folder shows FolderInfo', () => {
  const { pmc, at } = setup();
  pmc.makeView = PmcPane.prototype.makeView;
  at('folder');
  pmc.f3();
  assert.equal(pmc.quick.kind, 'folder');
  assert.equal(pmc.quick.view.constructor.name, 'FolderInfo');
  pmc.panels[0].entries.push(dir('game.exe'));
  at('game.exe');
  assert.equal(kindOf(pmc.cursorItem(0)), 'app');
  pmc.f3();
  assert.equal(pmc.quick.view.constructor.name, 'FolderInfo');
});

test('Enter on a file of the quick view kind opens it in the quick view, not ws.openFile', () => {
  const { pmc, calls, at } = setup();
  at('a.png');
  pmc.f3();
  at('b.png');
  pmc.enter(0);
  assert.equal(calls.openFile.length, 0);
  assert.equal(calls.open.length, 1);
  assert.equal(pmc.quick.path, 'm/b.png');
});

test('Enter on a file of another kind calls ws.openFile', () => {
  const { pmc, calls, at } = setup();
  at('a.png');
  pmc.f3();
  at('a.mp3');
  pmc.enter(0);
  assert.equal(calls.openFile.length, 1);
  assert.equal(calls.open.length, 0);
  assert.equal(pmc.quick.path, 'm/a.png');
});

test('a failed listing gives no unhandled rejection and FolderInfo shows no false count', async () => {
  const seen = [];
  const onRejection = (e) => seen.push(e);
  process.on('unhandledRejection', onRejection);
  globalThis.fetch = async () => ({ ok: true, json: async () => { throw new SyntaxError('not json'); } });
  const { pmc, at } = setup();
  pmc.makeView = PmcPane.prototype.makeView;
  pmc.panels[0].entries.push(dir('g.exe'));
  at('g.exe');
  pmc.f3();
  await new Promise((r) => setTimeout(r, 20));
  process.off('unhandledRejection', onRejection);
  globalThis.fetch = async () => ({ ok: true, json: async () => [] });
  assert.equal(seen.length, 0);
  assert.equal(pmc.quick.view.failed, true);
  assert.equal(pmc.quick.view.count, null);
});
