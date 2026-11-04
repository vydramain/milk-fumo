// ImageView.load: wants the current and the next picture (wrapping); a done picture is shown with no new request.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
globalThis.Image = class { addEventListener() {} };
const { ImageView } = await import('../site/js/image.js');

test('load wants current and next with wrap; N on a done picture adds no request for it', async () => {
  const urls = [];
  globalThis.fetch = async (url) => { urls.push(url); return new Response(new Uint8Array(3)); };
  const set = [{ name: 'a.png' }, { name: 'b.png' }, { name: 'c.png' }];
  const v = new ImageView({ requestDraw() {}, held: new Set() }, 'd', set, 2);
  assert.equal(urls.length, 2);                       // c and the wrapped a
  await new Promise((r) => setTimeout(r, 10));
  v.key({ code: 'KeyN' });                            // a is done already; b is new
  assert.equal(urls.length, 3);
  assert.equal(v.shown, 'd/a.png');
  v.dispose();
});
