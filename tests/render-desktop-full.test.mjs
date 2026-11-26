import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';

async function openDesktop(t, link, height = 721) {
  const canvas = new EventTarget();
  canvas.style = {};
  const fills = [];
  const video = Object.assign(new EventTarget(), {
    paused: true,
    videoWidth: 640,
    videoHeight: 360,
    load() {},
    async play() {},
  });
  let videoFrame;
  const ctx = {
    canvas,
    fillRect(x, y, w, h) { fills.push({ x, y, w, h, color: this.fillStyle }); },
    setTransform() {},
    drawImage(source, ...bounds) {
      if (source === video) videoFrame = bounds;
    },
    save() {},
    beginPath() {},
    rect() {},
    clip() {},
    restore() {},
  };
  canvas.getContext = () => ctx;

  const document = new EventTarget();
  const win = new EventTarget();
  let draw;
  Object.assign(document, {
    getElementById: (id) => id === 'screen' ? canvas : null,
    querySelector: () => null,
    createElement: (tag) => tag === 'video' ? video : { getContext: () => ctx },
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
  });
  Object.assign(win, { devicePixelRatio: 2 });
  Object.assign(globalThis, {
    document, window: win,
    devicePixelRatio: 2, innerWidth: 1121, innerHeight: height,
    screen: { width: 1121, height: 721 },
    matchMedia: () => ({ matches: false }),
    location: new URL('http://localhost/?open=' + link),
    history: { replaceState() {} },
    localStorage: { getItem: () => 'win-55' },
    requestAnimationFrame: (callback) => { draw = callback; },
  });
  t.mock.method(globalThis, 'fetch', async (url) => url === '/content/video/'
    ? Response.json([{ name: 'clip.webm', type: 'file', mtime: '2020-01-01' }])
    : new Response(null, { status: 404 }));

  await import('../site/js/main.js?open=' + link);
  const { C } = await import('../site/js/theme.js');
  const { view } = await import('../site/js/view.js');
  await setImmediate();

  const shift = (code) => {
    for (const type of ['keydown', 'keyup']) {
      win.dispatchEvent(Object.assign(new Event(type), { code, shiftKey: true }));
    }
  };
  const corner = () => {
    const x = canvas.width - 1, y = canvas.height - 1;
    const last = fills.findLast((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    return last?.color;
  };

  return {
    canvas, document, C, view, shift, corner,
    draw() {
      fills.length = 0;
      videoFrame = undefined;
      draw();
      return videoFrame;
    },
  };
}

test('desktop video Full fits the video and paints the last device column at 1.5×', async (t) => {
  const { canvas, document, C, view, shift, draw, corner } = await openDesktop(t, 'video/clip.webm');
  draw();
  shift('KeyS');
  shift('KeyS');
  draw();
  assert.equal(view.ui, 1.5, 'desktop scale is 1.5×');
  shift('KeyF');
  assert.ok(document.fullscreenElement, 'Shift+F enters Full for the video');
  assert.deepEqual([canvas.width, canvas.height], [2242, 1442]);

  const frame = draw();
  const fullCorner = corner();
  await document.exitFullscreen();
  draw();
  const tileCorner = corner();

  assert.deepEqual([fullCorner, tileCorner], [C.crust, C.dark], 'the last device pixel has the right background in Full and after exit');
  assert.ok(frame, 'the video is drawn in Full');
  const [x, y, w, h] = frame;
  assert.deepEqual([x, w], [0, canvas.width], 'the width-limited video fills the Canvas without cropping');
  assert.ok(Math.abs(h - w * 360 / 640) <= 1, 'the fitted video keeps its aspect ratio to within a device pixel');
  assert.ok(Math.abs(y - (canvas.height - y - h)) <= 2, 'the letterbox margins are centered');
});

test('desktop link error paints the last device column at 1.5×', async (t) => {
  const { canvas, C, view, draw, corner } = await openDesktop(t, 'video//clip.webm', 539);
  draw();

  assert.equal(view.ui, 1.5, 'the short viewport starts at 1.5×');
  assert.deepEqual([canvas.width, canvas.height], [2242, 1080]);
  assert.equal(corner(), C.dark, 'the link error background covers the last device pixel');
});
