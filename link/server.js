#!/usr/bin/env node
// DeckOS Link - run on the laptop:  node link/server.js
//
// Serves the deck and the dashboard on the home network, keeps accounts,
// shares one Spotify link, opens laptop apps, and streams the laptop screen
// (with remote mouse/keyboard for admins) to the deck.

import { createServer } from 'node:http';
import { networkInterfaces, hostname } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { Store } from './lib/store.js';
import { Auth, AuthError, isAdmin, publicUser } from './lib/auth.js';
import { Helper } from './lib/helper.js';
import { SpotifyLink } from './lib/spotify.js';
import { seedApps, sanitizeApps, launch } from './lib/apps.js';
import { Router, HttpError, parseCookies, readJson, send, redirect, serveStatic } from './lib/http.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const PORT = Number(process.env.PORT) || 7777;
const COOKIE = 'deckos_session';
const VERSION = 1;

const store = new Store(process.env.DECKOS_DATA || join(HERE, 'data', 'link.json'));
const auth = new Auth(store);
const helper = new Helper();
const spotifyLink = new SpotifyLink(store);
seedApps(store);
helper.start();

const router = new Router();

// ------------------------------------------------------------------ utils

function clientIp(req) {
  return req.socket.remoteAddress || 'unknown';
}

function isLoopback(req) {
  const ip = clientIp(req);
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function sessionCookie(token, maxAge) {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
}

function currentUser(req) {
  return auth.userForToken(parseCookies(req)[COOKIE]);
}

function requireUser(ctx) {
  if (!ctx.user) throw new HttpError(401, 'Please sign in.');
  return ctx.user;
}

function requireAdmin(ctx) {
  requireUser(ctx);
  if (!isAdmin(ctx.user)) throw new HttpError(403, 'Only admins can do that.');
  return ctx.user;
}

// Real Wi-Fi/Ethernet addresses first; skip VirtualBox, Hyper-V/WSL, VMware
// and Docker adapters that a phone on the home network can't reach.
const VIRTUAL = /virtualbox|vmware|vethernet|wsl|hyper-v|docker|loopback|tailscale|zerotier|vbox/i;

function lanUrls() {
  const urls = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    if (VIRTUAL.test(name)) continue;
    for (const a of list || []) {
      // VirtualBox host-only adapters often have generic names; spot them by MAC.
      const vbox = /^0a:00:27|^08:00:27/i.test(a.mac || '');
      if (a.family === 'IPv4' && !a.internal && !vbox && !a.address.startsWith('169.254.')) urls.push(`http://${a.address}:${PORT}/`);
    }
  }
  return urls;
}

const features = () => ({
  screen: helper.supported && helper.ready,
  input: helper.supported && helper.ready,
  platform: process.platform
});

// ------------------------------------------------------------- accounts

router.add('GET', '/api/link/info', (ctx) => ({
  link: true,
  version: VERSION,
  name: store.data.settings.name,
  host: hostname(),
  urls: lanUrls(),
  needsSetup: auth.needsSetup(),
  user: ctx.user ? publicUser(ctx.user) : null,
  spotify: { linked: spotifyLink.status().linked, account: spotifyLink.status().account },
  features: features()
}));

router.add('POST', '/api/setup', async (ctx) => {
  const body = await readJson(ctx.req);
  auth.setupOwner(body);
  return signIn(ctx, body.username, body.password);
});

function signIn(ctx, username, password) {
  const { token, user, maxAge } = auth.login(clientIp(ctx.req), username, password, ctx.req.headers['user-agent']);
  ctx.headers['Set-Cookie'] = sessionCookie(token, maxAge);
  return { user: publicUser(user) };
}

router.add('POST', '/api/login', async (ctx) => {
  const body = await readJson(ctx.req);
  return signIn(ctx, body.username, body.password);
});

router.add('POST', '/api/logout', (ctx) => {
  auth.logout(parseCookies(ctx.req)[COOKIE]);
  ctx.headers['Set-Cookie'] = sessionCookie('', 0);
  return { ok: true };
});

router.add('GET', '/api/me', (ctx) => ({ user: publicUser(requireUser(ctx)) }));

router.add('POST', '/api/me/password', async (ctx) => {
  const user = requireUser(ctx);
  const body = await readJson(ctx.req);
  auth.changeOwnPassword(user, body.current, body.next);
  return { ok: true };
});

router.add('GET', '/api/users', (ctx) => {
  requireAdmin(ctx);
  return { users: auth.users.map(publicUser) };
});

router.add('POST', '/api/users', async (ctx) => {
  requireAdmin(ctx);
  const body = await readJson(ctx.req);
  const role = body.role === 'admin' ? 'admin' : 'member';
  return { user: publicUser(auth.createUser({ ...body, role })) };
});

router.add('PATCH', '/api/users/:id', async (ctx) => {
  const actor = requireAdmin(ctx);
  const body = await readJson(ctx.req);
  return { user: publicUser(auth.updateUser(actor, ctx.params.id, body)) };
});

router.add('DELETE', '/api/users/:id', (ctx) => {
  auth.deleteUser(requireAdmin(ctx), ctx.params.id);
  return { ok: true };
});

router.add('POST', '/api/users/:id/transfer', (ctx) => {
  auth.transferOwnership(requireAdmin(ctx), ctx.params.id);
  return { ok: true };
});

// ----------------------------------------------------------------- apps

router.add('GET', '/api/apps', (ctx) => {
  requireUser(ctx);
  return { apps: store.data.apps };
});

router.add('PUT', '/api/apps', async (ctx) => {
  requireAdmin(ctx);
  const body = await readJson(ctx.req);
  try {
    store.data.apps = sanitizeApps(body.apps);
  } catch (e) {
    throw new HttpError(400, e.message);
  }
  store.save();
  return { apps: store.data.apps };
});

router.add('POST', '/api/apps/:id/launch', (ctx) => {
  requireUser(ctx);
  const app = store.data.apps.find((a) => a.id === ctx.params.id);
  if (!app) throw new HttpError(404, 'No such app.');
  launch(app.target);
  console.log(`[apps] ${ctx.user.username} opened ${app.name}`);
  return { ok: true };
});

// --------------------------------------------------------------- screen

const viewers = new Set();
let streaming = false;
const stream = { width: 1280, quality: 55, fps: 10 };

function pumpFrames() {
  if (streaming) return;
  streaming = true;
  const loop = async () => {
    while (viewers.size) {
      const started = Date.now();
      let frame;
      try {
        frame = await helper.capture(stream.width, stream.quality);
      } catch (_) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      const head = Buffer.from(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
      for (const v of viewers) {
        // Skip a slow viewer instead of buffering frames for it.
        if (v.busy) continue;
        const ok = v.res.write(Buffer.concat([head, frame, Buffer.from('\r\n')]));
        if (!ok) {
          v.busy = true;
          v.res.once('drain', () => (v.busy = false));
        }
      }
      const wait = 1000 / stream.fps - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    streaming = false;
  };
  loop();
}

router.add('GET', '/api/screen/stream', (ctx) => {
  requireUser(ctx);
  if (!features().screen) throw new HttpError(503, 'Screen sharing needs DeckOS Link running on Windows.');
  const { res, req } = ctx;
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
    Connection: 'keep-alive'
  });
  const viewer = { res, busy: false };
  viewers.add(viewer);
  req.on('close', () => viewers.delete(viewer));
  pumpFrames();
  ctx.handled = true;
});

router.add('GET', '/api/screen/info', async (ctx) => {
  requireUser(ctx);
  if (!features().screen) return { available: false, platform: process.platform };
  const info = await helper.screens();
  return { available: true, ...info, stream };
});

router.add('POST', '/api/screen/select', async (ctx) => {
  requireAdmin(ctx);
  const body = await readJson(ctx.req);
  return helper.selectScreen(body.index);
});

router.add('POST', '/api/screen/quality', async (ctx) => {
  requireAdmin(ctx);
  const body = await readJson(ctx.req);
  stream.width = Math.max(640, Math.min(1920, Number(body.width) || stream.width));
  stream.quality = Math.max(25, Math.min(90, Number(body.quality) || stream.quality));
  stream.fps = Math.max(2, Math.min(20, Number(body.fps) || stream.fps));
  return { stream };
});

// Remote mouse/keyboard: admins only.
router.add('POST', '/api/input', async (ctx) => {
  requireAdmin(ctx);
  if (!features().input) throw new HttpError(503, 'Remote input needs DeckOS Link running on Windows.');
  const body = await readJson(ctx.req);
  const events = Array.isArray(body.events) ? body.events.slice(0, 60) : [];
  events.forEach((ev) => helper.input(ev));
  return { ok: true };
});

// Media keys and volume on the laptop: any signed-in member.
router.add('POST', '/api/media', async (ctx) => {
  requireUser(ctx);
  if (!features().input) throw new HttpError(503, 'Laptop media keys need DeckOS Link running on Windows.');
  const body = await readJson(ctx.req);
  if (!helper.media(body.action)) throw new HttpError(400, 'Unknown media action.');
  return { ok: true };
});

// -------------------------------------------------------------- spotify

const spotifyRedirect = () => `http://127.0.0.1:${PORT}/api/spotify/callback`;

router.add('GET', '/api/spotify/status', (ctx) => {
  requireUser(ctx);
  return { ...spotifyLink.status(), redirectUri: spotifyRedirect(), clientId: isAdmin(ctx.user) ? spotifyLink.status().clientId : undefined };
});

router.add('PUT', '/api/spotify/client', async (ctx) => {
  requireAdmin(ctx);
  const body = await readJson(ctx.req);
  try {
    spotifyLink.setClientId(body.clientId);
  } catch (e) {
    throw new HttpError(400, e.message);
  }
  return spotifyLink.status();
});

router.add('GET', '/api/spotify/login', (ctx) => {
  requireAdmin(ctx);
  if (!isLoopback(ctx.req)) {
    throw new HttpError(400, `Link Spotify from the laptop itself: open http://127.0.0.1:${PORT}/dashboard/ there.`);
  }
  try {
    redirect(ctx.res, spotifyLink.loginUrl(spotifyRedirect()));
  } catch (e) {
    throw new HttpError(400, e.message);
  }
  ctx.handled = true;
});

router.add('GET', '/api/spotify/callback', async (ctx) => {
  const q = Object.fromEntries(new URL(ctx.req.url, 'http://x').searchParams);
  try {
    await spotifyLink.handleCallback(q);
    redirect(ctx.res, '/dashboard/#spotify=linked');
  } catch (e) {
    redirect(ctx.res, `/dashboard/#spotify-error=${encodeURIComponent(e.message)}`);
  }
  ctx.handled = true;
});

router.add('POST', '/api/spotify/unlink', (ctx) => {
  requireAdmin(ctx);
  spotifyLink.unlink();
  return spotifyLink.status();
});

router.add('GET', '/api/spotify/token', async (ctx) => {
  requireUser(ctx);
  try {
    const t = await spotifyLink.accessToken();
    if (!t) throw new HttpError(404, 'Spotify is not linked yet. An admin can link it in the dashboard.');
    return t;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(502, e.message);
  }
});

// ---------------------------------------------------------------- server

const DECK_FILES = ['index.html', 'manifest.json', 'sw.js', 'css', 'js', 'icons'];

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  const path = url.pathname;
  const ctx = { req, res, params: {}, headers: {}, user: null, handled: false };

  // Baseline hardening for every response.
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');

  try {
    if (path.startsWith('/api/')) {
      // State-changing calls must carry our header. Browsers won't send a
      // custom header cross-site without a CORS preflight, which we never
      // allow, so this blocks CSRF from other sites on the network.
      const mutating = !['GET', 'HEAD'].includes(req.method);
      if (mutating && req.headers['x-deckos'] !== '1') throw new HttpError(403, 'Missing X-DeckOS header.');
      const match = router.match(req.method, path);
      if (!match) throw new HttpError(404, 'Not found.');
      ctx.params = match.params;
      ctx.user = currentUser(req);
      const result = await match.handler(ctx);
      if (!ctx.handled) send(res, 200, result || { ok: true }, ctx.headers);
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');
    if (path === '/dashboard') return redirect(res, '/dashboard/');
    if (path.startsWith('/dashboard/')) {
      if (serveStatic(req, res, HERE, path, ['dashboard'])) return;
    } else if (serveStatic(req, res, REPO, path === '/' ? '/index.html' : path, DECK_FILES)) {
      return;
    }
    throw new HttpError(404, 'Not found.');
  } catch (e) {
    const status = e instanceof HttpError || e instanceof AuthError ? e.status : 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) send(res, status, { error: status === 500 ? 'Something went wrong on the laptop.' : e.message });
    else res.end();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const lan = lanUrls();
  console.log('');
  console.log('  DeckOS Link is running');
  console.log('  ──────────────────────');
  console.log(`  Dashboard (this laptop):  http://127.0.0.1:${PORT}/dashboard/`);
  lan.forEach((u) => console.log(`  Deck on your iPad/phone:  ${u}`));
  if (auth.needsSetup()) console.log('\n  First run: open the dashboard to create the owner account.');
  if (!helper.supported) console.log('\n  Screen sharing and remote input need Windows; everything else works.');
  console.log('');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${PORT} is busy. Is DeckOS Link already running? Or set PORT=xxxx.`);
  else console.error(e);
  process.exit(1);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    store.flush();
    helper.stop();
    process.exit(0);
  });
}
