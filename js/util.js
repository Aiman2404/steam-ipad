// Small shared helpers used across DeckOS modules.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatTime(ms) {
  const total = Math.max(0, Math.floor((ms || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// "iPad", "iPhone" or a neutral word for Android / other devices.
// iPadOS 13+ reports itself as a Mac, so check for touch too.
export const DEVICE = (() => {
  const ua = navigator.userAgent || '';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/iPhone|iPod/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'phone' : 'tablet';
  return 'device';
})();

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// localStorage that never throws (private mode, quota, disabled storage).
export const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (_) {}
  }
};

let toastTimer = null;
let lastToast = { message: '', at: 0 };
export function toast(message, tone = 'info') {
  const el = $('#toast');
  if (!el) return;
  // A failing action retried quickly shouldn't strobe the same message.
  const now = Date.now();
  if (message === lastToast.message && now - lastToast.at < 4000) return;
  lastToast = { message, at: now };
  $('#toastText').textContent = message;
  el.dataset.tone = tone;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2600);
}

// Tiny event emitter so sources and views stay decoupled.
export class Emitter {
  constructor() {
    this.handlers = {};
  }
  on(event, fn) {
    (this.handlers[event] = this.handlers[event] || []).push(fn);
    return () => this.off(event, fn);
  }
  off(event, fn) {
    this.handlers[event] = (this.handlers[event] || []).filter((h) => h !== fn);
  }
  emit(event, payload) {
    (this.handlers[event] || []).forEach((fn) => fn(payload));
  }
}

export function throttle(fn, wait) {
  let last = 0;
  let timer = null;
  let pendingArgs = null;
  return (...args) => {
    const now = Date.now();
    pendingArgs = args;
    const remaining = wait - (now - last);
    if (remaining <= 0) {
      last = now;
      fn(...pendingArgs);
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn(...pendingArgs);
      }, remaining);
    }
  };
}

// Long-press helper; iPad Safari never fires contextmenu on buttons.
export function onLongPress(el, handler, ms = 550) {
  let timer = null;
  let fired = false;
  const start = (e) => {
    fired = false;
    timer = setTimeout(() => {
      fired = true;
      handler(e);
    }, ms);
  };
  const cancel = () => clearTimeout(timer);
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointerleave', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  // Swallow the click that follows a long press.
  el.addEventListener('click', (e) => {
    if (fired) {
      e.stopImmediatePropagation();
      e.preventDefault();
      fired = false;
    }
  }, true);
}
