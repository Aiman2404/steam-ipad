import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isLoopbackAddress, isPrivateAddress, isAllowedHost } from '../link/lib/net.js';

const SERVER = join(dirname(fileURLToPath(import.meta.url)), '..', 'link', 'server.js');

test('loopback addresses', () => {
  for (const ip of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '127.5.5.5']) assert.ok(isLoopbackAddress(ip), ip);
  for (const ip of ['192.168.1.2', '10.0.0.1', '8.8.8.8', '', undefined]) assert.ok(!isLoopbackAddress(ip), String(ip));
});

test('only home-network addresses are private', () => {
  const ok = ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.25', '::ffff:192.168.0.9',
    '169.254.1.1', '100.101.102.103', 'fd12:3456::1', 'fe80::1'];
  const bad = ['8.8.8.8', '172.32.0.1', '172.15.0.1', '100.128.0.1', '1.1.1.1', '::ffff:8.8.8.8', '2001:db8::1', 'nonsense'];
  for (const ip of ok) assert.ok(isPrivateAddress(ip), ip);
  for (const ip of bad) assert.ok(!isPrivateAddress(ip), ip);
});

test('Host header must not be a foreign domain', () => {
  for (const h of ['127.0.0.1:7777', '192.168.1.25:7777', 'localhost:7777', '[::1]:7777', 'my-pc.local:7777', 'box.tail1234.ts.net'])
    assert.ok(isAllowedHost(h), h);
  for (const h of ['evil.example.com', 'evil.com:7777', '', '[::1]evil', 'local.evil.com'])
    assert.ok(!isAllowedHost(h), h);
  assert.ok(isAllowedHost('deck.myrouter:7777', ['deck.myrouter']));
});

function get(port, path, host) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, headers: { Host: host } }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end();
  });
}

test('the server boots and refuses rebinding hosts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'deckos-'));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(port), DECKOS_DATA: join(dir, 'link.json'), DECKOS_NO_HELPER: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  try {
    await new Promise((resolve, reject) => {
      proc.stdout.on('data', (d) => String(d).includes('running') && resolve());
      proc.on('exit', (code) => reject(new Error(`server exited ${code}`)));
    });
    assert.equal(await get(port, '/api/link/info', `127.0.0.1:${port}`), 200);
    assert.equal(await get(port, '/', `localhost:${port}`), 200);
    assert.equal(await get(port, '/api/link/info', `evil.example.com:${port}`), 403);
  } finally {
    proc.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});
