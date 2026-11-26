import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = new URL('../', import.meta.url);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const desktop = '/docs/design-system/index.html';
const pocket = '/docs/pocket-design-system/index.html';

async function browser(t) {
  if (process.getuid?.() === 0 && !process.env.CHROMIUM) {
    t.skip('Set CHROMIUM explicitly to run the browser smoke test as root');
    return;
  }

  const chromium = process.env.CHROMIUM || 'chromium';
  try {
    await run(chromium, ['--version']);
  } catch (err) {
    if (err.code !== 'ENOENT' || process.env.CHROMIUM) throw err;
    t.skip('Chromium is required for the browser smoke test');
    return;
  }

  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (!path.startsWith('/docs/') && !path.startsWith('/site/')) {
      res.writeHead(404).end();
      return;
    }
    try {
      const file = new URL('.' + path, root);
      let content = await readFile(file);
      if (path === desktop || path === pocket) {
        const selector = path === desktop ? '[data-demo=palette] canvas' : '#s-note canvas';
        // Sample the rendered canvas after the examples have queued their first frames.
        content = content.toString().replace('</body>', `<script>
          addEventListener('load', () => requestAnimationFrame(() => {
            const canvas = document.querySelector(${JSON.stringify(selector)});
            if (!canvas) return;
            const pixel = canvas.getContext('2d').getImageData(6, 6, 1, 1).data;
            canvas.dataset.sample = Array.from(pixel).join(',');
          }));
        </script></body>`);
      }
      res.setHeader('Content-Type', mime[extname(file.pathname)] || 'application/octet-stream');
      res.end(content);
    } catch {
      res.writeHead(404).end();
    }
  });
  t.after(() => server.close());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const profile = await mkdtemp(fileURLToPath(new URL('.chromium-', root)));
  t.after(() => rm(profile, { recursive: true, force: true }));
  return (path) => run(chromium, [
    '--headless', '--disable-dev-shm-usage', '--enable-logging=stderr',
    '--dump-dom', '--virtual-time-budget=2000', `--user-data-dir=${profile}`,
    `http://127.0.0.1:${server.address().port}${path}`,
  ], { timeout: 15000 });
}

test('Pocket Design System draws examples in Offline without uncaught errors', async (t) => {
  const open = await browser(t);
  if (!open) return;
  const { stdout, stderr } = await open(pocket + '?net=offline');
  assert.match(stdout, /class="stage"><canvas/);
  const uncaught = stderr.split('\n').filter((line) => line.includes('CONSOLE') && line.includes('Uncaught'));
  assert.deepEqual(uncaught, []);
});

test('desktop design system handles Full video and pmc folder errors in Offline', async (t) => {
  const open = await browser(t);
  if (!open) return;
  const { stdout, stderr } = await open(desktop + '?net=offline&ui=1.5');
  assert.match(stdout, /data-demo="video-full"><canvas/);
  assert.match(stdout, /data-demo="pmc-folder"><canvas/);
  assert.match(stdout, /data-ui="1.5" aria-pressed="true"/);
  assert.match(stdout, /data-net="offline" aria-pressed="true"/);
  const errors = stderr.split('\n').filter((line) => line.includes('CONSOLE')
    && (line.includes('Uncaught') || /stage "pmc-folder".*TypeError/.test(line)));
  assert.deepEqual(errors, []);
});

for (const [name, path] of [['desktop', desktop], ['Pocket', pocket]]) {
  test(`${name} design system renders the Win-55 palette selected by the URL`, async (t) => {
    const open = await browser(t);
    if (!open) return;
    const baseline = await open(path + '?net=fast');
    assert.equal(baseline.stdout.match(/data-sample="([^"]+)"/)?.[1], '76,88,68,255');
    const selected = await open(path + '?theme=win-55&net=fast');
    assert.equal(selected.stdout.match(/data-sample="([^"]+)"/)?.[1], '203,203,203,255');
  });
}
