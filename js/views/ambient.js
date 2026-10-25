// Ambient screen: after a few idle minutes with nothing playing, the deck
// fades to a big clock over the aurora. Any touch brings it back.

import { $ } from '../util.js';

const IDLE_MS = 3 * 60 * 1000;

export class Ambient {
  constructor(player) {
    this.player = player;
    this.el = $('#ambient');
    this.lastActivity = Date.now();
    this.on = false;

    const wake = (e) => {
      this.lastActivity = Date.now();
      if (this.on) {
        // Swallow the waking touch so it doesn't also press a button.
        e.preventDefault();
        e.stopPropagation();
        this.hide();
      }
    };
    ['pointerdown', 'keydown'].forEach((evt) => window.addEventListener(evt, wake, true));
    setInterval(() => this.check(), 15000);
  }

  check() {
    if (this.on) {
      this.paint();
      return;
    }
    const s = this.player.state;
    const busy = s.isPlaying || document.querySelector('.sheet-backdrop:not([hidden])');
    if (busy) {
      this.lastActivity = Date.now();
      return;
    }
    if (Date.now() - this.lastActivity > IDLE_MS) this.show();
  }

  paint() {
    const d = new Date();
    $('#ambientTime').textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    $('#ambientDate').textContent = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  }

  show() {
    this.paint();
    this.on = true;
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('is-on'));
  }

  hide() {
    this.on = false;
    this.el.classList.remove('is-on');
    setTimeout(() => {
      if (!this.on) this.el.hidden = true;
    }, 600);
  }

  // Wake immediately when music starts from elsewhere (e.g. the Spotify app).
  setState(s) {
    if (s.isPlaying) {
      this.lastActivity = Date.now();
      if (this.on) this.hide();
    }
  }
}
