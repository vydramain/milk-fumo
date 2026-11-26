import assert from 'node:assert/strict';
import test from 'node:test';

const iframeWindow = {};
globalThis.document = {
  body: { appendChild() {} },
  createElement(tag) {
    if (tag === 'canvas') return { getContext: () => ({}) };
    return Object.assign(new EventTarget(), {
      style: {},
      contentWindow: tag === 'iframe' ? iframeWindow : undefined,
      appendChild() {},
      remove() {},
    });
  },
};

const { AppPane } = await import('../site/js/app.js');

test('app iframe handles APP_READY and ERROR and ignores TITLE', (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 404 }));
  const requestDraw = t.mock.fn();
  const app = new AppPane({ requestDraw }, 'games', 'plug-run.exe');
  t.after(() => app.dispose());
  const send = (data) => app.message({ source: iframeWindow, data });

  send({ type: 'APP_READY' });
  assert.equal(app.status, 'ready');
  assert.equal(requestDraw.mock.callCount(), 1);

  send({ type: 'ERROR', text: 'app failed' });
  assert.equal(app.status, 'error');
  assert.equal(app.error, 'app failed');
  assert.equal(requestDraw.mock.callCount(), 2);

  requestDraw.mock.resetCalls();
  send({ type: 'TITLE', text: 'plug-run' });
  assert.equal(app.status, 'error');
  assert.equal(app.error, 'app failed');
  assert.equal(requestDraw.mock.callCount(), 0, 'TITLE must not request a redraw');
});
