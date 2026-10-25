// The two tall hardware sliders. SOUND drives the real output: Spotify device
// volume over the API, or the Web Audio gain for songs on this iPad.
// DISPLAY dims the screen with an overlay (web pages can't set iPad brightness).

import { $, clamp, store, throttle } from '../util.js';

const K_BRIGHT = 'deckos.brightness';

function bindVertical(el, { onInput, onCommit }) {
  let dragging = false;
  // Vertical in landscape; horizontal bars in portrait (wider than tall).
  const pct = (e) => {
    const r = el.getBoundingClientRect();
    if (r.width > r.height) return clamp((e.clientX - r.left) / r.width, 0, 1);
    return clamp((r.bottom - e.clientY) / r.height, 0, 1);
  };
  el.addEventListener('pointerdown', (e) => {
    dragging = true;
    el.classList.add('is-dragging');
    el.setPointerCapture(e.pointerId);
    onInput(pct(e));
  });
  el.addEventListener('pointermove', (e) => {
    if (dragging) onInput(pct(e));
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('is-dragging');
    if (onCommit) onCommit(pct(e));
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', () => {
    dragging = false;
    el.classList.remove('is-dragging');
  });
  return () => dragging;
}

function paint(el, ratio, label) {
  el.querySelector('.slider-fill').style.setProperty('--v', String(ratio));
  el.querySelector('.slider-value').textContent = label;
  el.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
}

export class Sliders {
  constructor(player) {
    this.player = player;
    this.volEl = $('#volumeSlider');
    this.brightEl = $('#brightSlider');

    const sendVolume = throttle((v) => player.setVolume(v), 300);

    // Tapping the speaker icon mutes / restores instead of dragging to the bottom.
    this.volEl.addEventListener('pointerdown', (e) => {
      const icon = this.volEl.querySelector('.slider-icon').getBoundingClientRect();
      const hit = e.clientX >= icon.left - 6 && e.clientX <= icon.right + 6 && e.clientY >= icon.top - 6 && e.clientY <= icon.bottom + 6;
      if (!hit) return;
      e.stopImmediatePropagation();
      const current = player.state.volume;
      if (current == null) return;
      if (current > 0) {
        this.beforeMute = current;
        player.setVolume(0);
      } else {
        player.setVolume(this.beforeMute || 50);
      }
    }, true);
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
    this.volEl.classList.toggle('is-muted', s.volume === 0);
    this.volEl.classList.toggle('is-disabled', s.source === 'spotify' && !!s.device && !s.volumeSupported);
    if (this.isDraggingVolume()) return;
    if (s.volume == null) {
      paint(this.volEl, 0, '--');
    } else {
      paint(this.volEl, s.volume / 100, `${Math.round(s.volume)}%`);
    }
  }
}
