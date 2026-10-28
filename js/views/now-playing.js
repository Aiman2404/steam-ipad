// Cover, title/artist, scrubber and transport. The cover, backdrop and accent
// colours all switch from the same 'track' event, so they can't drift apart.

import { $, formatTime, clamp } from '../util.js';
import { extractPalette, applyPalette, FALLBACK } from '../palette.js';

export class NowPlaying {
  constructor(player) {
    this.player = player;
    this.track = null;
    this.coverToken = 0;
    this.coverFlip = false;
    this.artFlip = false;
    this.lastSecond = -1;
    this.dragging = false;
    this.dragMs = 0;

    $('#playBtn').addEventListener('click', () => player.togglePlay());
    $('#nextBtn').addEventListener('click', () => player.next());
    $('#prevBtn').addEventListener('click', () => player.previous());
    $('#shuffleBtn').addEventListener('click', () => player.toggleShuffle());
    $('#repeatBtn').addEventListener('click', () => player.cycleRepeat());
    // Compact controls shown in lyrics focus mode.
    document.querySelectorAll('[data-mini]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const act = btn.dataset.mini;
        if (act === 'play') player.togglePlay();
        else if (act === 'next') player.next();
        else player.previous();
      })
    );
    this.bindScrubber();
    this.bindCoverSwipe();
  }

  // Swipe the cover left/right to skip, like a car stereo touch panel.
  bindCoverSwipe() {
    const el = $('#cover');
    el.style.touchAction = 'pan-y';
    let start = null;
    el.addEventListener('pointerdown', (e) => {
      start = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    el.addEventListener('pointerup', (e) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const quick = performance.now() - start.t < 700;
      start = null;
      if (!quick || Math.abs(dx) < 55 || Math.abs(dy) > Math.abs(dx) * 0.7) return;
      el.animate(
        [{ transform: `translate3d(${dx > 0 ? 24 : -24}px,0,0)` }, { transform: 'none' }],
        { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      );
      if (dx < 0) this.player.next();
      else this.player.previous();
    });
    el.addEventListener('pointercancel', () => {
      start = null;
    });
  }

  setTrack(track) {
    this.track = track;
    document.body.classList.toggle('has-track', !!track);
    $('#npTitle').textContent = track ? track.title : 'Nothing playing';
    $('#npArtist').textContent = track ? track.artist || 'Unknown artist' : 'Connect Spotify or add songs to start';
    $('#timeTotal').textContent = formatTime(track ? track.durationMs : 0);
    document.title = track ? `${track.title} · ${track.artist} — DeckOS` : 'DeckOS';
    this.lastSecond = -1;
    this.showCover(track && track.cover);
  }

  // The cover may arrive later (iTunes lookup) for the same track.
  refreshCover(track) {
    if (this.track && track && this.track.uri === track.uri && track.cover !== this.track.cover) {
      this.track = track;
      this.showCover(track.cover);
    }
  }

  showCover(src) {
    const token = ++this.coverToken;
    const media = $('.np');
    if (!src) {
      media.classList.remove('has-cover');
      ['#coverImgA', '#coverImgB'].forEach((id) => $(id).classList.remove('is-on'));
      this.setBackdrop('');
      // Nothing playing: fall back to the brand colours instead of the last song's.
      applyPalette(FALLBACK);
      return;
    }
    const img = this.coverFlip ? $('#coverImgA') : $('#coverImgB');
    const other = this.coverFlip ? $('#coverImgB') : $('#coverImgA');
    img.onload = () => {
      if (token !== this.coverToken) return;
      img.classList.add('is-on');
      other.classList.remove('is-on');
      media.classList.add('has-cover');
      this.coverFlip = !this.coverFlip;
    };
    img.onerror = () => {
      if (token === this.coverToken) media.classList.remove('has-cover');
    };
    img.crossOrigin = 'anonymous';
    img.src = src;
    this.setBackdrop(src);
    extractPalette(src).then((p) => {
      if (token === this.coverToken) applyPalette(p);
    });
  }

  setBackdrop(src) {
    const on = this.artFlip ? $('#artLayerA') : $('#artLayerB');
    const off = this.artFlip ? $('#artLayerB') : $('#artLayerA');
    if (src) {
      on.style.backgroundImage = `url("${src.replace(/"/g, '%22')}")`;
      on.classList.add('is-on');
    }
    off.classList.remove('is-on');
    this.artFlip = !this.artFlip;
  }

  setState(s) {
    document.body.classList.toggle('is-playing', !!s.isPlaying);
    document.body.classList.toggle('paused', !s.isPlaying);
    $('#playBtn').setAttribute('aria-label', s.isPlaying ? 'Pause' : 'Play');
    $('#shuffleBtn').classList.toggle('is-on', !!s.shuffle);
    const repeat = $('#repeatBtn');
    repeat.classList.toggle('is-on', s.repeat !== 'off');
    repeat.classList.toggle('is-one', s.repeat === 'track');
    if (s.track && this.track && s.track.durationMs !== this.track.durationMs) {
      this.track = { ...this.track, durationMs: s.track.durationMs };
      $('#timeTotal').textContent = formatTime(s.track.durationMs);
    }
  }

  tick(positionMs) {
    const duration = this.track ? this.track.durationMs : 0;
    const pos = this.dragging ? this.dragMs : positionMs;
    const ratio = duration ? clamp(pos / duration, 0, 1) : 0;
    this.paintProgress(ratio);
    const sec = Math.floor(pos / 1000);
    if (sec !== this.lastSecond) {
      this.lastSecond = sec;
      $('#timeNow').textContent = formatTime(pos);
    }
  }

  paintProgress(ratio) {
    if (!this.trackWidth) this.trackWidth = $('.scrub-track').offsetWidth;
    $('#scrubFill').style.transform = `scaleX(${ratio})`;
    $('#scrubKnob').style.transform = `translate3d(${ratio * this.trackWidth}px,0,0) scale(${this.dragging ? 1.15 : 0.75})`;
  }

  bindScrubber() {
    const el = $('#scrub');
    const toMs = (clientX) => {
      const rect = $('.scrub-track').getBoundingClientRect();
      this.trackWidth = rect.width;
      return clamp((clientX - rect.left) / rect.width, 0, 1) * (this.track ? this.track.durationMs : 0);
    };
    el.addEventListener('pointerdown', (e) => {
      if (!this.track || !this.track.durationMs) return;
      this.dragging = true;
      el.classList.add('is-dragging');
      el.setPointerCapture(e.pointerId);
      this.dragMs = toMs(e.clientX);
    });
    el.addEventListener('pointermove', (e) => {
      if (this.dragging) this.dragMs = toMs(e.clientX);
    });
    const end = (commit) => (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      el.classList.remove('is-dragging');
      if (commit) this.player.seek(toMs(e.clientX));
    };
    el.addEventListener('pointerup', end(true));
    el.addEventListener('pointercancel', end(false));
    window.addEventListener('resize', () => {
      this.trackWidth = 0;
    });
  }
}
