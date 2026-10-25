// Laptop tab (DeckOS Link only): live laptop screen, touch control for
// admins, keyboard, media keys and the laptop app launcher.
//
// Touch on the screen image:
//   tap            -> left click there
//   hold           -> right click
//   drag           -> click-and-drag (select text, move windows)
//   two fingers    -> scroll

import { $, $$, escapeHtml, toast, store } from '../util.js';
import { linkApi, linkInfo, linkIsAdmin } from '../link.js';

const APP_ICONS = {
  github: '<path fill="currentColor" d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"/>',
  code: '<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  steam: '<path fill="currentColor" d="M12 2a10 10 0 0 0-9.95 9.03l5.33 2.2a2.82 2.82 0 0 1 2.57-.47l2.43-3.52a3.77 3.77 0 1 1 3.77 3.77h-.09l-3.46 2.47c0 .19-.02.38-.07.57a2.83 2.83 0 0 1-5.46-.35L3.3 14.18A10 10 0 1 0 12 2z"/>',
  discord: '<path fill="currentColor" d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.3 18.3 0 0 0-5.5 0L8.7 3a19.7 19.7 0 0 0-4.9 1.4C.7 9-.3 13.6.1 18.1a19.9 19.9 0 0 0 6 3l1.3-2a13 13 0 0 1-1.9-.9l.4-.3a14.2 14.2 0 0 0 12.2 0l.4.3a12.3 12.3 0 0 1-1.9.9l1.2 2a19.8 19.8 0 0 0 6-3c.5-5.2-.8-9.7-3.5-13.7zM8 15.3c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.5 8 10.5s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z"/>',
  spotify: '<path fill="currentColor" d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24zm5.5 17.3a.75.75 0 0 1-1 .25c-2.8-1.7-6.4-2.1-10.6-1.1a.75.75 0 1 1-.33-1.46c4.56-1.04 8.5-.6 11.68 1.34.36.22.47.68.25 1.03zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.24-1.99-8.17-2.57-12-1.4a.94.94 0 1 1-.55-1.8c4.37-1.32 9.8-.68 13.53 1.6.44.27.58.85.31 1.29zm.13-3.4C15.24 8.4 8.82 8.16 5.16 9.3a1.13 1.13 0 1 1-.66-2.16c4.2-1.27 11.27-1.03 15.71 1.62a1.13 1.13 0 1 1-1.11 1.87z"/>',
  folder: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>',
  browser: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  game: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M7 8h10a5 5 0 0 1 4.9 6l-.6 3a2.5 2.5 0 0 1-4.4 1L15 16H9l-1.9 2a2.5 2.5 0 0 1-4.4-1l-.6-3A5 5 0 0 1 7 8z"/><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M8 11v3M6.5 12.5h3"/>',
  terminal: '<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="m5 7 5 5-5 5M12 18h7"/>',
  app: '<rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="2"/>'
};

const icon = (key) => `<svg viewBox="0 0 24 24" width="20" height="20">${APP_ICONS[key] || APP_ICONS.app}</svg>`;
export const appIcon = icon;

// Windows virtual-key codes
const VK = { esc: 27, tab: 9, enter: 13, back: 8, win: 91, ctrl: 17, alt: 18, shift: 16, del: 46, left: 37, up: 38, right: 39, down: 40 };

export class LaptopView {
  constructor() {
    this.visible = false;
    this.control = false;
    this.queue = [];
    this.flushTimer = null;
    this.pointers = new Map();
    this.gesture = null;
    this.apps = [];
    document.addEventListener('visibilitychange', () => this.syncStream());
  }

  render() {
    const info = linkInfo();
    const admin = linkIsAdmin();
    const canScreen = info && info.features && info.features.screen;
    $('#laptop').innerHTML = `
      <div class="lap-apps" id="lapApps"><div class="spinner" style="margin:6px auto"></div></div>
      <div class="lap-screen ${canScreen ? '' : 'is-off'}" id="lapScreen">
        ${canScreen
          ? `<img id="lapImg" alt="Laptop screen" draggable="false" />
             <div class="lap-hint" id="lapHint">${admin ? 'Turn on Control to use the mouse' : 'View only · admins can control'}</div>`
          : `<div class="lyrics-empty"><strong>Screen not available</strong><span>Run DeckOS Link on a Windows laptop to see and control its screen here.</span></div>`}
      </div>
      <div class="lap-bar">
        ${admin && canScreen ? '<button class="pill" id="lapControl" aria-pressed="false">Control</button>' : ''}
        ${admin && canScreen ? `<button class="pill" id="lapKeys" aria-label="Keyboard">⌨</button>
          <button class="key" data-vk="${VK.esc}">esc</button>
          <button class="key" data-vk="${VK.tab}">tab</button>
          <button class="key" data-vk="${VK.back}">⌫</button>
          <button class="key" data-vk="${VK.enter}">⏎</button>
          <button class="key" data-combo="${VK.win}">⊞</button>
          <button class="key" data-combo="${VK.ctrl}+67">copy</button>
          <button class="key" data-combo="${VK.ctrl}+86">paste</button>` : ''}
        <span class="lap-gap"></span>
        <button class="key" data-media="prev" aria-label="Previous">⏮</button>
        <button class="key" data-media="playpause" aria-label="Play or pause">⏯</button>
        <button class="key" data-media="next" aria-label="Next">⏭</button>
        <button class="key" data-media="voldown" aria-label="Volume down">−</button>
        <button class="key" data-media="volup" aria-label="Volume up">+</button>
        <button class="key" data-media="mute" aria-label="Mute">🔇</button>
        <button class="pill" id="lapWide" aria-pressed="false" aria-label="Expand">⤢</button>
      </div>
      <input id="lapType" class="lap-type" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false" aria-label="Type on the laptop" />`;

    this.bind();
    this.loadApps();
    this.syncStream();
  }

  async loadApps() {
    try {
      const { apps } = await linkApi('/api/apps');
      this.apps = apps;
      $('#lapApps').innerHTML = apps.length
        ? apps.map((a) => `<button class="lap-app" data-app="${escapeHtml(a.id)}">${icon(a.icon)}<span>${escapeHtml(a.name)}</span></button>`).join('')
        : '<span class="row-sub">No laptop apps yet. An admin can add them in the dashboard.</span>';
      $$('#lapApps [data-app]').forEach((b) =>
        b.addEventListener('click', async () => {
          const app = this.apps.find((a) => a.id === b.dataset.app);
          try {
            await linkApi(`/api/apps/${encodeURIComponent(app.id)}/launch`, { method: 'POST' });
            toast(`Opening ${app.name} on the laptop`, 'ok');
          } catch (e) {
            toast(e.message, 'error');
          }
        })
      );
    } catch (e) {
      $('#lapApps').innerHTML = `<span class="row-sub">${escapeHtml(e.message)}</span>`;
    }
  }

  setVisible(v) {
    const was = this.visible;
    this.visible = v;
    if (v && !was) this.render();
    else this.syncStream();
    // The laptop screen gets the whole deck by default (remembered).
    this.applyWide(v && store.get('deckos.laptop.wide', true));
  }

  applyWide(on) {
    document.body.classList.toggle('wide', on);
    const btn = $('#lapWide');
    if (btn) btn.setAttribute('aria-pressed', String(on));
  }

  // Only pull frames while the tab is on screen, so the laptop isn't
  // capturing for nobody.
  syncStream() {
    const want = this.visible && !document.hidden && !!$('#lapImg');
    if (want && !this.pulling) this.pullFrames();
    if (!want) this.pulling = null;
  }

  // Pull one JPEG at a time (long-poll). iPad Safari doesn't reliably show
  // a multipart MJPEG stream in an <img>, but plain JPEGs work everywhere.
  // Each frame is decoded off-screen first so the picture never flickers.
  async pullFrames() {
    const token = {};
    this.pulling = token;
    let seq = 0;
    let shownUrl = null;
    let failures = 0;
    while (this.pulling === token) {
      try {
        const res = await fetch(`./api/screen/frame?after=${seq}`, { credentials: 'same-origin', cache: 'no-store' });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Screen error ${res.status}`);
        seq = Number(res.headers.get('X-Frame-Seq')) || seq + 1;
        const url = URL.createObjectURL(await res.blob());
        const next = new Image();
        next.src = url;
        await next.decode().catch(() => {});
        const img = $('#lapImg');
        if (this.pulling !== token || !img) {
          URL.revokeObjectURL(url);
          break;
        }
        img.src = url;
        if (shownUrl) URL.revokeObjectURL(shownUrl);
        shownUrl = url;
        if (failures) this.setHint(null);
        failures = 0;
      } catch (e) {
        failures += 1;
        if (failures === 2) this.setHint(`Can't get the laptop screen: ${e.message}`);
        await new Promise((r) => setTimeout(r, Math.min(5000, 800 * failures)));
      }
    }
    if (shownUrl) URL.revokeObjectURL(shownUrl);
  }

  setHint(message) {
    const hint = $('#lapHint');
    if (!hint) return;
    if (message) {
      hint.dataset.error = '1';
      hint.textContent = message;
    } else if (hint.dataset.error) {
      delete hint.dataset.error;
      hint.textContent = this.control
        ? 'Tap to click · hold to right-click · drag · two fingers to scroll'
        : linkIsAdmin() ? 'Turn on Control to use the mouse' : 'View only · admins can control';
    }
  }

  bind() {
    $$('#laptop [data-media]').forEach((b) =>
      b.addEventListener('click', () =>
        linkApi('/api/media', { method: 'POST', body: { action: b.dataset.media } }).catch((e) => toast(e.message, 'error'))
      )
    );
    $$('#laptop [data-vk]').forEach((b) => b.addEventListener('click', () => this.push({ t: 'key', vk: Number(b.dataset.vk) })));
    $$('#laptop [data-combo]').forEach((b) =>
      b.addEventListener('click', () => this.push({ t: 'combo', keys: b.dataset.combo.split('+').map(Number) }))
    );

    const wide = $('#lapWide');
    wide.addEventListener('click', () => {
      const on = !document.body.classList.contains('wide');
      store.set('deckos.laptop.wide', on);
      this.applyWide(on);
    });

    const control = $('#lapControl');
    if (control) {
      control.addEventListener('click', () => {
        this.control = !this.control;
        control.setAttribute('aria-pressed', String(this.control));
        $('#lapScreen').classList.toggle('is-control', this.control);
        $('#lapHint').textContent = this.control
          ? 'Tap to click · hold to right-click · drag · two fingers to scroll'
          : 'Turn on Control to use the mouse';
      });
    }

    const keys = $('#lapKeys');
    const type = $('#lapType');
    if (keys) {
      keys.addEventListener('click', () => type.focus());
      type.addEventListener('input', () => {
        if (type.value) this.push({ t: 'text', text: type.value });
        type.value = '';
      });
      type.addEventListener('keydown', (e) => {
        const special = { Backspace: VK.back, Enter: VK.enter, Tab: VK.tab, Escape: VK.esc, ArrowLeft: VK.left, ArrowRight: VK.right, ArrowUp: VK.up, ArrowDown: VK.down, Delete: VK.del };
        if (special[e.key]) {
          e.preventDefault();
          this.push({ t: 'key', vk: special[e.key] });
        }
      });
    }

    const screen = $('#lapScreen');
    if (screen && $('#lapImg')) this.bindTouch(screen);
  }

  // Map a client point to 0..1 on the laptop screen (the image is letterboxed).
  toScreen(clientX, clientY) {
    const img = $('#lapImg');
    const r = img.getBoundingClientRect();
    const nw = img.naturalWidth || 16;
    const nh = img.naturalHeight || 9;
    const scale = Math.min(r.width / nw, r.height / nh);
    const w = nw * scale;
    const h = nh * scale;
    const x = (clientX - (r.left + (r.width - w) / 2)) / w;
    const y = (clientY - (r.top + (r.height - h) / 2)) / h;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }

  bindTouch(el) {
    const HOLD_MS = 550;
    const MOVE_PX = 9;

    el.addEventListener('pointerdown', (e) => {
      if (!this.control) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.pointers.size === 2) {
        // Second finger: switch to scrolling.
        clearTimeout(this.gesture && this.gesture.hold);
        if (this.gesture && this.gesture.dragging) this.push({ t: 'up', b: 'l' });
        const ys = [...this.pointers.values()];
        this.gesture = { scroll: true, lastY: (ys[0].y + ys[1].y) / 2, lastX: (ys[0].x + ys[1].x) / 2 };
        return;
      }
      const at = this.toScreen(e.clientX, e.clientY);
      if (!at) return;
      this.gesture = {
        start: { x: e.clientX, y: e.clientY },
        at,
        moved: false,
        dragging: false,
        held: false,
        hold: setTimeout(() => {
          if (!this.gesture || this.gesture.moved) return;
          this.gesture.held = true;
          this.push({ t: 'click', b: 'r', ...at });
          if (navigator.vibrate) navigator.vibrate(12);
        }, HOLD_MS)
      };
    });

    el.addEventListener('pointermove', (e) => {
      if (!this.control || !this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = this.gesture;
      if (!g) return;
      if (g.scroll) {
        const ps = [...this.pointers.values()];
        if (ps.length < 2) return;
        const y = (ps[0].y + ps[1].y) / 2;
        const x = (ps[0].x + ps[1].x) / 2;
        const dy = y - g.lastY;
        const dx = x - g.lastX;
        if (Math.abs(dy) >= 6) {
          this.push({ t: 'wheel', d: Math.round(dy * 6) });
          g.lastY = y;
        }
        if (Math.abs(dx) >= 6) {
          this.push({ t: 'hwheel', d: Math.round(-dx * 6) });
          g.lastX = x;
        }
        return;
      }
      if (g.held) return;
      if (!g.moved && Math.hypot(e.clientX - g.start.x, e.clientY - g.start.y) > MOVE_PX) {
        g.moved = true;
        clearTimeout(g.hold);
        g.dragging = true;
        this.push({ t: 'down', b: 'l', ...g.at });
      }
      if (g.dragging) {
        const at = this.toScreen(e.clientX, e.clientY);
        if (at) this.push({ t: 'move', ...at });
      }
    });

    const end = (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      const g = this.gesture;
      if (!g) return;
      if (g.scroll) {
        if (!this.pointers.size) this.gesture = null;
        return;
      }
      clearTimeout(g.hold);
      if (g.dragging) this.push({ t: 'up', b: 'l' });
      else if (!g.held && !g.moved) this.push({ t: 'click', b: 'l', ...g.at });
      this.gesture = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // Batch input into one request every ~40ms; consecutive moves collapse.
  push(ev) {
    const last = this.queue[this.queue.length - 1];
    if (ev.t === 'move' && last && last.t === 'move') this.queue[this.queue.length - 1] = ev;
    else this.queue.push(ev);
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), 40);
  }

  async flush() {
    this.flushTimer = null;
    const events = this.queue.splice(0, 60);
    if (!events.length) return;
    try {
      await linkApi('/api/input', { method: 'POST', body: { events } });
    } catch (e) {
      toast(e.message, 'error');
    }
    if (this.queue.length && !this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), 0);
  }
}
