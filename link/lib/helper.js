// Runs the Windows helper (helper.ps1) and talks to it over stdin/stdout.
// On macOS/Linux the screen and input features report as unavailable;
// accounts, Spotify and launching apps still work everywhere.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

export class Helper {
  constructor(log = console.log) {
    this.log = log;
    this.proc = null;
    this.ready = false;
    this.pending = []; // FIFO of { resolve, reject } for capture/info replies
    this.buffer = Buffer.alloc(0);
    this.restarts = 0;
    this.supported = process.platform === 'win32';
    this.info = null;
  }

  start() {
    if (!this.supported || this.proc) return;
    const proc = spawn(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(HERE, 'helper.ps1')],
      { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }
    );
    this.proc = proc;
    proc.stdout.on('data', (chunk) => this.onData(chunk));
    proc.stderr.on('data', (d) => this.log(`[helper] ${String(d).trim()}`));
    proc.on('exit', (code) => {
      this.proc = null;
      this.ready = false;
      this.buffer = Buffer.alloc(0);
      this.pending.splice(0).forEach((p) => p.reject(new Error('Helper stopped')));
      // Restart a crashed helper, but don't spin if it keeps dying.
      if (this.restarts < 5) {
        this.restarts += 1;
        this.log(`[helper] exited (${code}), restarting…`);
        setTimeout(() => this.start(), 1500);
      } else {
        this.log('[helper] keeps crashing; screen and input are disabled until Link restarts.');
      }
    });
  }

  stop() {
    this.restarts = 99;
    if (this.proc) this.proc.kill();
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 5) {
      const type = String.fromCharCode(this.buffer[0]);
      const len = this.buffer.readInt32LE(1);
      if (this.buffer.length < 5 + len) break;
      const payload = this.buffer.subarray(5, 5 + len);
      this.buffer = this.buffer.subarray(5 + len);
      if (type === 'L') {
        const msg = payload.toString('utf8');
        if (msg === 'ready') {
          this.ready = true;
          this.restarts = 0;
          this.log('[helper] ready: screen capture and remote input available');
          this.request('info').then((json) => (this.info = JSON.parse(json.toString('utf8')))).catch(() => {});
        } else this.log(`[helper] ${msg}`);
      } else {
        const waiter = this.pending.shift();
        if (!waiter) continue;
        if (type === 'E') waiter.reject(new Error(payload.toString('utf8')));
        else waiter.resolve(Buffer.from(payload));
      }
    }
  }

  send(line) {
    if (!this.proc || !this.ready) return false;
    this.proc.stdin.write(`${line}\n`);
    return true;
  }

  request(line, timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
      if (!this.send(line)) return reject(new Error('Screen helper is not running'));
      const entry = { resolve, reject };
      const timer = setTimeout(() => {
        // Leave the slot in place so later replies stay aligned; just fail this caller.
        entry.resolve = () => {};
        entry.reject = () => {};
        reject(new Error('Helper timed out'));
      }, timeoutMs);
      this.pending.push({
        resolve: (v) => {
          clearTimeout(timer);
          entry.resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          entry.reject(e);
        }
      });
    });
  }

  capture(maxWidth = 1280, quality = 60) {
    return this.request(`capture ${Math.round(maxWidth)} ${Math.round(quality)}`);
  }

  async screens() {
    const json = await this.request('info');
    this.info = JSON.parse(json.toString('utf8'));
    return this.info;
  }

  selectScreen(i) {
    this.send(`screen ${Number(i) | 0}`);
    return this.screens();
  }

  // ---- input (validated here; the helper trusts what it gets) ----

  input(ev) {
    const n = (v) => Math.min(1, Math.max(0, Number(v) || 0)).toFixed(5);
    const btn = (b) => (b === 'r' || b === 'm' ? b : 'l');
    switch (ev.t) {
      case 'move':
        return this.send(`move ${n(ev.x)} ${n(ev.y)}`);
      case 'down':
      case 'up':
      case 'click':
        if (ev.x !== undefined) this.send(`move ${n(ev.x)} ${n(ev.y)}`);
        return this.send(`${ev.t} ${btn(ev.b)}`);
      case 'dbl':
        if (ev.x !== undefined) this.send(`move ${n(ev.x)} ${n(ev.y)}`);
        return this.send('dbl');
      case 'wheel':
        return this.send(`wheel ${Math.max(-1200, Math.min(1200, Math.round(Number(ev.d) || 0)))}`);
      case 'hwheel':
        return this.send(`hwheel ${Math.max(-1200, Math.min(1200, Math.round(Number(ev.d) || 0)))}`);
      case 'key': {
        const vk = Number(ev.vk) | 0;
        if (vk < 1 || vk > 254) return false;
        const mode = ['down', 'up'].includes(ev.mode) ? ev.mode : 'press';
        return this.send(`key ${vk} ${mode}`);
      }
      case 'combo': {
        const keys = (Array.isArray(ev.keys) ? ev.keys : []).map((k) => Number(k) | 0).filter((k) => k > 0 && k < 255);
        if (!keys.length || keys.length > 4) return false;
        return this.send(`combo ${keys.join('+')}`);
      }
      case 'text': {
        const text = String(ev.text || '').slice(0, 500);
        if (!text) return false;
        return this.send(`text ${Buffer.from(text, 'utf8').toString('base64')}`);
      }
      default:
        return false;
    }
  }

  media(action) {
    if (!['playpause', 'next', 'prev', 'volup', 'voldown', 'mute'].includes(action)) return false;
    return this.send(`media ${action}`);
  }
}
