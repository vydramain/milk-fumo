// ImageView.load: wants the current and the next picture, none after the last; a done picture is shown with no new request.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
globalThis.Image = class { addEventListener() {} };
const { ImageView } = await import('../site/js/image.js');

test('the last picture wants only itself; N wraps to the first; a done picture adds no request', async () => {
  const urls = [];
  globalThis.fetch = async (url) => { urls.push(url); return new Response(new Uint8Array(3)); };
  const set = [{ name: 'a.png' }, { name: 'b.png' }, { name: 'c.png' }];
  const v = new ImageView({ requestDraw() {}, drawHeld: new Set() }, 'd', set, 2);
  assert.deepEqual(urls, ['/content/d/c.png']);      // the last: nothing after it is preloaded
  v.key({ code: 'KeyN' });                            // wraps to a; b is its next
  assert.equal(urls.length, 3);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(v.shown, 'd/a.png');
  v.key({ code: 'KeyP' });                            // c is done already: no new request
  assert.equal(urls.length, 3);
  v.dispose();
});
