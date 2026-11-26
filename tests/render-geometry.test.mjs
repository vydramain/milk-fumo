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

  getAttribute(name) { return this[name] ?? null; }
  setPointerCapture() {}
  focus() {}
  load() {}
  async play() {}
}

async function openPocket(t, filename) {
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
  const history = { replaceState() {} };
  Object.assign(win, { devicePixelRatio: 3, history });
  const document = new EventTarget();
  Object.assign(document, {
    getElementById: (id) => id === 'screen' ? canvas : null,
    querySelector: () => null,
    documentElement: {
      async requestFullscreen() {
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
      append(element) { overlays.push(element); element.parentNode = this; },
      appendChild(element) { this.append(element); },
    },
  });
  const folder = filename.endsWith('.exe') ? 'games' : 'video';
  Object.assign(globalThis, {
    window: win, document, history,
    devicePixelRatio: 3, innerWidth: 393, innerHeight: 852,
    matchMedia: () => ({ matches: true }),
    location: new URL(`http://localhost/?open=${folder}/${filename}`),
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
  const tap = (clientX, clientY) => {
    for (const type of ['pointerdown', 'pointerup']) {
      canvas.dispatchEvent(Object.assign(new Event(type), { clientX, clientY }));
    }
    draw();
  };
  const tapFull = () => {
    assert.ok(labels.has('Full'), 'Full is visible');
    tap(...labels.get('Full'));
  };

  await import('../site/js/main.js?open=' + filename);
  await setImmediate();
  overlays[0]?.child?.dispatchEvent(new Event('load'));
  draw();
  const overlay = overlays[0];
  assert.ok(overlay, 'the content link opens the overlay');
  return { canvas, ctx, overlay, draw, tap, tapFull, win, document };
}

function size({ width, height }) {
  const css = (value, viewport) => value.endsWith('%') ? parseFloat(value) * viewport / 100 : parseFloat(value);
  return [css(width, innerWidth), css(height, innerHeight)];
}

for (const filename of ['clip.webm', 'demo.exe']) {
  test(`Pocket ${filename} fills the viewport in Full before and after rotation`, async (t) => {
    const { canvas, ctx, overlay, draw, tap, tapFull, win, document } = await openPocket(t, filename);
    const paintedCorner = () => ctx.fills.some(([x, y, w, h]) => x + w >= canvas.width && y + h >= canvas.height);
    const portraitTile = size(overlay.style);
    const portraitTileCorner = paintedCorner();

    tapFull();
    const portraitFull = size(overlay.style);
    const portraitFullCorner = paintedCorner();

    Object.assign(globalThis, { innerWidth: 852, innerHeight: 393 });
    win.dispatchEvent(new Event('resize'));
    draw();
    const landscapeFull = size(overlay.style);
    const landscapeFullCorner = paintedCorner();

    if (filename.endsWith('.webm')) {
      tap(851.5, 392.5);
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
  });
}
