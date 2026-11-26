import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';

globalThis.document = { createElement: () => ({ getContext: () => ({}) }) };
const { Paint } = await import('../site/js/paint.js');
const { AppPane } = await import('../site/js/app.js');
const { view } = await import('../site/js/view.js');

const rect = { x: 1, y: 3, w: 1, h: 3 };

test('image and clip use the same raster edges as fill at 1.5×', () => {
  const ctx = { save() {}, beginPath() {}, clip() {} };
  const paint = new Paint(ctx, 1.5);
  const bounds = [];
  ctx.fillRect = ctx.rect = (...args) => bounds.push(args);
  ctx.drawImage = (_source, ...args) => bounds.push(args);

  const { x, y, w, h } = rect;
  paint.fill(x, y, w, h, '#fff');
  paint.image({}, x, y, w, h);
  paint.clip(rect);

  assert.deepEqual(bounds, [[2, 5, 1, 4], [2, 5, 1, 4], [2, 5, 1, 4]]);
});

test('app iframe well shares the Canvas edges at 1.5× and DPR 2', () => {
  const saved = { ...view };
  Object.assign(view, { ui: 1.5, dpr: 2 });
  try {
    const wrap = { style: {} };
    AppPane.prototype.place.call({ wrap }, { x: 9, y: 39, w: 1476, h: 823 });
    const { left, top, width, height } = wrap.style;
    assert.deepEqual([left, top, width, height].map(parseFloat), [7, 29.5, 1107, 617]);
  } finally {
    Object.assign(view, saved);
  }
});

class Element extends EventTarget {
  style = {};
  contentWindow = new EventTarget();
  paused = true;
  srcWrites = [];

  get src() { return this.srcWrites.at(-1); }
  set src(value) { this.srcWrites.push(value); }

  getAttribute(name) { return this[name] ?? null; }
  setPointerCapture() {}
  focus() {}
  load() {}
  async play() {}
}

const previousPage = 'http://localhost/?open=about.md';

function browserHistory(win, url) {
  const entry = (state, href = globalThis.location.href) => ({
    state: structuredClone(state),
    url: new URL(href, url),
  });
  const entries = [{ ...entry(null, previousPage), external: true }, entry(null, url)];
  let index = 1;
  return {
    get state() { return entries[index].state; },
    get length() { return entries.length; },
    replaceState(state, _title, href) {
      entries[index] = entry(state, href);
      globalThis.location = entries[index].url;
    },
    pushState(state, _title, href) {
      entries.splice(index + 1, entries.length, entry(state, href));
      index++;
      globalThis.location = entries[index].url;
    },
    navigate(href) {
      this.pushState(null, '', href);
      entries[index].external = true;
    },
    back() { this.go(-1); },
    forward() { this.go(1); },
    go(delta) {
      queueMicrotask(() => {
        const next = index + delta;
        if (next < 0 || next >= entries.length) return;
        const restored = entries[index].external;
        index = next;
        globalThis.location = entries[index].url;
        if (entries[index].external) return;
        if (restored) win.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
        else win.dispatchEvent(Object.assign(new Event('popstate'), { state: this.state }));
      });
    },
  };
}

async function openPocket(t, filename, { nativeFull = true } = {}) {
  const canvas = new Element();
  const ctx = {
    canvas,
    fills: [],
    fillRect(...bounds) { this.fills.push(bounds); },
    setTransform() {},
    createPattern() {},
    save() {},
    beginPath() {},
    rect() {},
    clip() {},
    restore() {},
  };
  canvas.getContext = () => ctx;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0 });

  let pending;
  const overlays = [];
  const win = new EventTarget();
  const folder = filename.endsWith('.exe') ? 'games' : 'video';
  const url = new URL(`http://localhost/?open=${folder}/${filename}`);
  const history = browserHistory(win, url);
  Object.assign(win, { devicePixelRatio: 3, history });
  const document = new EventTarget();
  Object.assign(document, {
    getElementById: (id) => id === 'screen' ? canvas : null,
    querySelector: () => null,
    documentElement: {
      async requestFullscreen() {
        if (!nativeFull) throw new TypeError('Fullscreen request was denied');
        document.fullscreenElement = this;
        document.dispatchEvent(new Event('fullscreenchange'));
      },
    },
    async exitFullscreen() {
      this.fullscreenElement = null;
      this.dispatchEvent(new Event('fullscreenchange'));
    },
    createElement: (tag) => Object.assign(new Element(), {
      tagName: tag,
      getContext: () => ctx,
      appendChild(child) { this.child = child; },
    }),
    body: {
      append(element) {
        overlays.push(element);
        element.parentNode = this;
        element.remove = () => {
          overlays.splice(overlays.indexOf(element), 1);
          element.parentNode = null;
        };
      },
      appendChild(element) { this.append(element); },
    },
  });
  Object.assign(globalThis, {
    window: win, document, history,
    devicePixelRatio: 3, innerWidth: 393, innerHeight: 852,
    matchMedia: () => ({ matches: true }),
    location: url,
    requestAnimationFrame: (callback) => { pending = callback; },
  });

  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url === `/content/${folder}/`) {
      return Response.json([{ name: filename, type: filename.endsWith('.exe') ? 'directory' : 'file', mtime: '2020-01-01' }]);
    }
    return url.endsWith('/index.html') ? new Response('<!doctype html>') : new Response(null, { status: 404 });
  });

  const labels = new Map();
  const text = Paint.prototype.text;
  t.mock.method(Paint.prototype, 'text', function (font, x, y, label, ...args) {
    labels.set(label, [x * this.dpr / 3, y * this.dpr / 3]);
    return text.call(this, font, x, y, label, ...args);
  });

  const draw = () => {
    assert.ok(pending, 'a draw was requested');
    const callback = pending;
    pending = null;
    labels.clear();
    ctx.fills.length = 0;
    callback();
  };
  const settle = async () => {
    await setImmediate();
    if (pending) draw();
  };
  const tap = (clientX, clientY) => {
    for (const type of ['pointerdown', 'pointerup']) {
      canvas.dispatchEvent(Object.assign(new Event(type), { clientX, clientY }));
    }
    draw();
  };
  const tapLabel = (label) => {
    assert.ok(labels.has(label), `${label} is visible`);
    tap(...labels.get(label));
  };
  const tapFull = () => tapLabel('Full');

  await import(`../site/js/main.js?test=${encodeURIComponent(t.name)}`);
  await setImmediate();
  overlays[0]?.child?.dispatchEvent(new Event('load'));
  draw();
  const overlay = overlays[0];
  assert.ok(overlay, 'the content link opens the overlay');
  return { canvas, ctx, overlay, overlays, draw, settle, tap, tapFull, tapLabel, win, document, history };
}

function size({ width, height }) {
  const css = (value, viewport) => value.endsWith('%') ? parseFloat(value) * viewport / 100 : parseFloat(value);
  return [css(width, innerWidth), css(height, innerHeight)];
}

for (const filename of ['clip.webm', 'demo.exe']) {
  test(`Pocket ${filename} fills the viewport in Full before and after rotation`, async (t) => {
    const nativeFull = filename.endsWith('.exe');
    const { canvas, ctx, overlay, draw, settle, tap, tapFull, win, document, history } = await openPocket(t, filename, { nativeFull });
    const startLength = history.length;
    const paintedCorner = () => ctx.fills.some(([x, y, w, h]) => x + w >= canvas.width && y + h >= canvas.height);
    const portraitTile = size(overlay.style);
    const portraitTileCorner = paintedCorner();

    tapFull();
    await settle();
    if (nativeFull) {
      assert.ok(document.fullscreenElement, 'the browser entered native Full');
      assert.equal(history.length, startLength, 'native Full needs no extra history entry');
    }
    const portraitFull = size(overlay.style);
    const portraitFullCorner = paintedCorner();

    Object.assign(globalThis, { innerWidth: 852, innerHeight: 393 });
    win.dispatchEvent(new Event('resize'));
    draw();
    const landscapeFull = size(overlay.style);
    const landscapeFullCorner = paintedCorner();

    if (filename.endsWith('.webm')) {
      tap(851.5, 392.5);
      await settle();
    } else {
      await document.exitFullscreen();
      draw();
    }
    const landscapeTile = size(overlay.style);

    assert.deepEqual({
      portraitFull,
      landscapeFull,
      canvasCornersPainted: [portraitTileCorner, portraitFullCorner, landscapeFullCorner, paintedCorner()],
      portraitTileVisible: portraitTile[0] < 393,
      landscapeTileRestored: landscapeTile[0] < 852 && landscapeTile[1] < 393,
    }, {
      portraitFull: [393, 852],
      landscapeFull: [852, 393],
      canvasCornersPainted: [true, true, true, true],
      portraitTileVisible: true,
      landscapeTileRestored: true,
    });

    history.back();
    await setImmediate();
    assert.equal(location.href, previousPage, 'one Back leaves the direct link after exiting Full');
  });
}

test('Pocket Back restores the direct-linked game and its iframe after native Full is denied', async (t) => {
  const { overlay, overlays, document, tapFull, settle, history } = await openPocket(t, 'demo.exe', { nativeFull: false });
  const tileSize = size(overlay.style);
  const iframe = overlay.child;
  const srcWrites = [...iframe.srcWrites];
  const gameUrl = location.href;
  assert.ok(iframe.src, 'the game is loaded');

  tapFull();
  await settle();
  assert.ok(!document.fullscreenElement, 'the native request was refused');
  assert.deepEqual(size(overlay.style), [393, 852], 'the game fills the viewport in CSS Full');

  history.back();
  await settle();
  assert.equal(location.href, gameUrl, 'the first Back stays on the direct-linked game');
  assert.deepEqual(size(overlay.style), tileSize, 'Back restores the game tile');
  assert.equal(overlay.style.display, 'block', 'the game is visible in the tile');
  assert.equal(overlays.length, 1, 'there is one game overlay');
  assert.equal(overlays[0], overlay, 'the original overlay is still mounted');
  assert.equal(overlay.child, iframe, 'the original iframe is still mounted');
  assert.deepEqual(iframe.srcWrites, srcWrites, 'Back does not reload the game');

  history.back();
  await setImmediate();
  assert.equal(location.href, previousPage, 'the next Back reaches the preceding page');
});

test('Pocket Forward traverses a stale CSS Full entry and reaches the later page', async (t) => {
  const { overlay, overlays, tapFull, settle, history } = await openPocket(t, 'demo.exe', { nativeFull: false });
  const gameUrl = location.href;
  const laterPage = 'http://localhost/later';
  const tileSize = size(overlay.style);
  const iframe = overlay.child;

  tapFull();
  await settle();
  assert.deepEqual(size(overlay.style), [393, 852], 'the game entered CSS Full');

  history.navigate(laterPage);
  history.back();
  await settle();
  assert.equal(location.href, gameUrl, 'Back returns to the game document');
  history.back();
  await settle();
  assert.deepEqual(size(overlay.style), tileSize, 'Back returns to the game tile');

  history.forward();
  await settle();
  assert.equal(location.href, gameUrl, 'the first Forward stays on the direct-linked game');
  assert.deepEqual(size(overlay.style), tileSize, 'the stale Full entry keeps the game in its tile');
  assert.equal(overlays[0], overlay, 'the original overlay is still mounted');
  assert.equal(overlay.child, iframe, 'the original iframe is still mounted');

  history.forward();
  await settle();
  assert.equal(location.href, laterPage, 'the second Forward reaches the later page');
});

test('Pocket opening ppmc from a stale CSS Full entry keeps tile history one step deep', async (t) => {
  const { overlay, tapFull, tapLabel, settle, history } = await openPocket(t, 'demo.exe', { nativeFull: false });
  const tileSize = size(overlay.style);

  tapFull();
  await settle();
  assert.deepEqual(size(overlay.style), [393, 852], 'the game entered CSS Full');
  const fullLength = history.length;

  history.back();
  await settle();
  assert.deepEqual(size(overlay.style), tileSize, 'Back restores the game tile');
  history.forward();
  await settle();
  assert.deepEqual(size(overlay.style), tileSize, 'Forward leaves the game in its tile');

  tapLabel('ppmc');
  assert.equal(overlay.style.display, 'none', 'ppmc is open');
  assert.equal(history.length, fullLength, 'ppmc reuses the inactive Full entry to keep one history step from the game');
});
