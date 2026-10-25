// The two tall hardware sliders. SOUND drives the real output: Spotify device
// volume over the API, or the Web Audio gain for songs on this iPad.
// DISPLAY dims the screen with an overlay (web pages can't set iPad brightness).

import { $, clamp, store, throttle } from '../util.js';

const K_BRIGHT = 'deckos.brightness';

function bindVertical(el, { onInput, onCommit }) {
  let dragging = false;
  const pct = (clientY) => {
    const r = el.getBoundingClientRect();
    return clamp((r.bottom - clientY) / r.height, 0, 1);
  };
  el.addEventListener('pointerdown', (e) => {
    dragging = true;
    el.classList.add('is-dragging');
    el.setPointerCapture(e.pointerId);
    onInput(pct(e.clientY));
  });
  el.addEventListener('pointermove', (e) => {
    if (dragging) onInput(pct(e.clientY));
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('is-dragging');
    if (onCommit) onCommit(pct(e.clientY));
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', () => {
    dragging = false;
    el.classList.remove('is-dragging');
  });
  return () => dragging;
}

function paint(el, ratio, label) {
  el.querySelector('.slider-fill').style.transform = `scaleY(${ratio})`;
  el.querySelector('.slider-value').textContent = label;
  el.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
}

export class Sliders {
  constructor(player) {
    this.player = player;
    this.volEl = $('#volumeSlider');
    this.brightEl = $('#brightSlider');

    const sendVolume = throttle((v) => player.setVolume(v), 300);
    this.isDraggingVolume = bindVertical(this.volEl, {
      onInput: (r) => {
        const v = Math.round(r * 100);
        paint(this.volEl, r, `${v}%`);
        sendVolume(v);
      },
      onCommit: (r) => sendVolume(Math.round(r * 100))
    });

    const bright = store.get(K_BRIGHT, 100);
    this.setBrightness(bright / 100);
    bindVertical(this.brightEl, {
      onInput: (r) => this.setBrightness(r),
      onCommit: (r) => store.set(K_BRIGHT, Math.round(Math.max(0.15, r) * 100))
    });
  }

  setBrightness(r) {
    const v = Math.max(0.15, r);
    paint(this.brightEl, v, `${Math.round(v * 100)}%`);
    $('#dimmer').style.opacity = ((1 - v) * 0.85).toFixed(3);
    this.brightEl.querySelector('.slider-sub').textContent = v < 0.5 ? 'Night' : '';
  }

  // Reflect the active device's volume unless the user is mid-drag.
  setState(s) {
    const sub = this.volEl.querySelector('.slider-sub');
    if (s.source === 'spotify' && !s.device) {
      sub.textContent = 'No device';
    } else {
      sub.textContent = s.device ? s.device.name : '';
    }
    this.volEl.classList.toggle('is-disabled', s.source === 'spotify' && !!s.device && !s.volumeSupported);
    if (this.isDraggingVolume()) return;
    if (s.volume == null) {
      paint(this.volEl, 0, '--');
    } else {
      paint(this.volEl, s.volume / 100, `${Math.round(s.volume)}%`);
    }
  }
}
