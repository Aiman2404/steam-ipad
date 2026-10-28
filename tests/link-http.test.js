import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serveStatic, Router, parseCookies } from '../link/lib/http.js';
import { sanitizeApps } from '../link/lib/apps.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED = ['index.html', 'manifest.json', 'sw.js', 'css', 'js', 'icons'];

function serve() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const path = new URL(req.url, 'http://x').pathname;
      if (!serveStatic(req, res, REPO, path === '/' ? '/index.html' : path, ALLOWED)) {
        res.writeHead(404);
        res.end();
      }
    }).listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('serves the deck but nothing outside the allow-list', async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const status = async (p) => (await fetch(base + p)).status;
  try {
    assert.equal(await status('/'), 200);
    assert.equal(await status('/js/main.js'), 200);
    assert.equal(await status('/link/server.js'), 404);
    assert.equal(await status('/package.json'), 404);
    assert.equal(await status('/js/..%2f..%2fpackage.json'), 404);
    assert.equal(await status('/js/%2e%2e/package.json'), 404);
    assert.equal(await status('/.git/config'), 404);
    assert.equal(await status('/js/.hidden'), 404);
  } finally {
    server.close();
  }
});

test('router matches params', () => {
  const r = new Router();
  r.add('PATCH', '/api/users/:id', () => 'ok');
  const m = r.match('PATCH', '/api/users/abc-123');
  assert.equal(m.params.id, 'abc-123');
  assert.equal(r.match('GET', '/api/users/abc-123'), null);
  assert.equal(r.match('PATCH', '/api/users/a/b'), null);
});

test('app targets reject shell metacharacters and blanks', () => {
  assert.throws(() => sanitizeApps([{ name: 'x', target: 'calc.exe & del /q *' }]), /invalid target/);
  assert.throws(() => sanitizeApps([{ name: 'x', target: 'a|b' }]), /invalid target/);
  assert.throws(() => sanitizeApps([{ name: '', target: 'https://x' }]), /needs a name/);
  const [app] = sanitizeApps([{ name: 'GitHub', target: 'https://github.com', icon: 'nope' }]);
  assert.equal(app.icon, 'app');
  assert.ok(app.id);
});

import { resolveDock, sanitizeDock } from '../link/lib/apps.js';

test('dock defaults to the first five laptop apps, padded with deck views', () => {
  const apps = sanitizeApps([
    { name: 'GitHub', target: 'https://github.com' },
    { name: 'Steam', target: 'steam://open/main' }
  ]);
  const slots = resolveDock({ data: { apps } });
  assert.deepEqual(slots.map((s) => s.name), ['GitHub', 'Steam', 'Lyrics', 'Library', 'Up next']);
  assert.equal(slots[0].kind, 'laptop');
});

test('custom dock is validated and survives a deleted app', () => {
  const apps = sanitizeApps([{ name: 'GitHub', target: 'https://github.com' }]);
  assert.throws(() => sanitizeDock([{ kind: 'view', view: 'lyrics' }], apps), /exactly five/);
  assert.throws(() => sanitizeDock(Array(5).fill({ kind: 'laptop', appId: 'nope' }), apps), /laptop app or a deck view/);
  const dock = sanitizeDock([{ kind: 'laptop', appId: apps[0].id }, ...Array(4).fill({ kind: 'view', view: 'laptop' })], apps);
  const slots = resolveDock({ data: { apps: [], dock } });
  assert.equal(slots[0].kind, 'view'); // GitHub was removed -> falls back
  assert.equal(slots[1].name, 'Laptop screen');
});

test('a malformed cookie or path does not throw', () => {
  // Some other app on localhost can set cookies like this one.
  const cookies = parseCookies({ headers: { cookie: 'junk=100%; deckos_session=abc' } });
  assert.equal(cookies.junk, '100%');
  assert.equal(cookies.deckos_session, 'abc');

  const router = new Router();
  router.add('GET', '/api/users/:id', () => ({}));
  assert.equal(router.match('GET', '/api/users/%E0').params.id, '%E0');
});
