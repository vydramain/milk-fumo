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

test('Pocket Design System draws examples in Offline without uncaught errors', async (t) => {
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
      const content = await readFile(file);
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
  const url = `http://127.0.0.1:${server.address().port}/docs/pocket-design-system/index.html?net=offline`;
  const { stdout, stderr } = await run(chromium, [
    '--headless', '--disable-dev-shm-usage', '--enable-logging=stderr',
    '--dump-dom', '--virtual-time-budget=2000', `--user-data-dir=${profile}`, url,
  ], { timeout: 15000 });
  assert.match(stdout, /class="stage"><canvas/);
  const uncaught = stderr.split('\n').filter((line) => line.includes('CONSOLE') && line.includes('Uncaught'));
  assert.deepEqual(uncaught, []);
});
