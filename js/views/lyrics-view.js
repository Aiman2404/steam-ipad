// Apple-Music-style synced lyrics. The active line is found every animation
// frame from the player clock (not from 4Hz timeupdate events), the list
// glides with a GPU transform instead of scrollIntoView, and the active line
// gets a karaoke sweep (per word when LRCLIB has word timing).

import { $, $$, escapeHtml, store } from '../util.js';
import { getLyrics } from '../lyrics.js';

// Show a line a hair before it is sung; reads more naturally.
const LEAD_MS = 180;
const K_NUDGE = 'deckos.lyrics.nudge';

export class LyricsView {
  constructor(player) {
    this.player = player;
    this.root = $('#lyrics');
    this.trackEl = $('#lyricsTrack');
    this.token = 0;
    this.lines = [];
    this.kind = 'none';
    this.active = -2;
    this.offsets = [];
    this.lastP = -1;
    this.track = null;
    this.nudges = store.get(K_NUDGE, {});

    this.trackEl.addEventListener('click', (e) => {
      const row = e.target.closest('.ly');
      if (!row || this.kind !== 'synced') return;
      const line = this.lines[Number(row.dataset.i)];
      if (line) this.player.seek(Math.max(0, line.t + this.nudge() - LEAD_MS + 1));
    });

    $$('.nudge [data-nudge]').forEach((btn) =>
      btn.addEventListener('click', () => this.adjustNudge(Number(btn.dataset.nudge)))
    );
    window.addEventListener('resize', () => this.measure());
  }

  key() {
    return this.track ? this.track.uri : '';
  }

  nudge() {
    return this.nudges[this.key()] || 0;
  }

  adjustNudge(delta) {
    if (!this.track) return;
    const next = Math.max(-5000, Math.min(5000, this.nudge() + delta));
    if (next) this.nudges[this.key()] = next;
    else delete this.nudges[this.key()];
    // Keep the map small.
    const keys = Object.keys(this.nudges);
    if (keys.length > 200) delete this.nudges[keys[0]];
    store.set(K_NUDGE, this.nudges);
    this.paintNudge();
    this.active = -2;
  }

  paintNudge() {
    const v = this.nudge() / 1000;
    $('#nudgeValue').textContent = `${v > 0 ? '+' : ''}${v.toFixed(2)}s`;
  }

  async setTrack(track) {
    const token = ++this.token;
    this.track = track;
    this.lines = [];
    this.kind = 'loading';
    this.active = -2;
    this.paintNudge();
    this.root.classList.remove('is-plain');
    this.trackEl.style.transform = 'none';

    if (!track) {
      this.showMessage('Nothing playing', 'Pick something from the Library tab.');
      this.setBadge('');
      return;
    }
    if (track.isEpisode) {
      this.showMessage('Podcast', 'Lyrics are only available for songs.');
      this.setBadge('');
      return;
    }

    this.trackEl.innerHTML = '';
    this.root.insertAdjacentHTML('beforeend', '<div class="lyrics-empty" data-msg><div class="shimmer"></div><div class="shimmer"></div><div class="shimmer"></div></div>');
    this.setBadge('Finding lyrics…');

    let result;
    try {
      result = await getLyrics(track);
    } catch (_) {
      if (token !== this.token) return;
      this.showMessage('Lyrics offline', "Couldn't reach the lyrics service. They'll load with the next song.");
      this.setBadge('');
      return;
    }
    if (token !== this.token) return;
    this.render(result);
  }

  setBadge(text) {
    $('#lyricsBadge').textContent = text;
  }

  clearMessage() {
    $$('[data-msg]', this.root).forEach((n) => n.remove());
  }

  showMessage(title, body) {
    this.clearMessage();
    this.trackEl.innerHTML = '';
    this.root.insertAdjacentHTML(
      'beforeend',
      `<div class="lyrics-empty" data-msg><strong>${escapeHtml(title)}</strong><span>${escapeHtml(body)}</span></div>`
    );
  }

  render(result) {
    this.clearMessage();
    this.kind = result.kind;
    this.lines = result.lines;

    if (result.kind === 'instrumental') {
      this.showMessage('♪ Instrumental', 'No words in this one — enjoy it.');
      this.setBadge('Instrumental');
      return;
    }
    if (result.kind === 'none' || !this.lines.length) {
      this.showMessage('No lyrics yet', "LRCLIB doesn't have lyrics for this song.");
      this.setBadge('');
      return;
    }

    if (result.kind === 'plain') {
      this.root.classList.add('is-plain');
      this.trackEl.innerHTML = this.lines
        .map((l) => (l.text ? `<div class="ly">${escapeHtml(l.text)}</div>` : '<div class="ly">&nbsp;</div>'))
        .join('');
      this.root.scrollTop = 0;
      this.setBadge('Unsynced lyrics');
      return;
    }

    const hasWords = this.lines.some((l) => l.words && l.words.length);
    this.trackEl.innerHTML = this.lines
      .map((l, i) => {
        if (!l.text) return `<div class="ly is-gap" data-i="${i}"><i></i><i></i><i></i></div>`;
        return `<div class="ly" data-i="${i}"><span class="sweep">${escapeHtml(l.text)}</span></div>`;
      })
      .join('');
    this.setBadge(hasWords ? 'Word-synced · LRCLIB' : 'Synced · LRCLIB');
    this.measure();
  }

  measure() {
    if (this.kind !== 'synced') return;
    this.rows = $$('.ly', this.trackEl);
    this.offsets = this.rows.map((r) => r.offsetTop + r.offsetHeight / 2);
    this.viewH = this.root.clientHeight;
    this.active = -2;
  }

  indexAt(ms) {
    const lines = this.lines;
    let lo = 0;
    let hi = lines.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lines[mid].t <= ms) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  }

  tick(positionMs) {
    if (this.kind !== 'synced' || !this.lines.length) return;
    const ms = positionMs + LEAD_MS - this.nudge();
    const idx = this.indexAt(ms);

    if (idx !== this.active) {
      const prev = this.active;
      this.active = idx;
      if (!this.rows || !this.rows.length) this.measure();
      const rows = this.rows;
      // Only touch rows whose state changed instead of re-rendering the list.
      const from = Math.max(0, Math.min(prev, idx) - 1);
      const to = Math.min(rows.length - 1, Math.max(prev, idx) + 1);
      for (let i = prev < -1 ? 0 : from; i <= (prev < -1 ? rows.length - 1 : to); i++) {
        rows[i].classList.toggle('is-active', i === idx);
        rows[i].classList.toggle('is-past', i < idx);
        if (i !== idx) rows[i].style.removeProperty('--p');
      }
      const anchor = idx < 0 ? this.offsets[0] - 40 : this.offsets[idx];
      const y = this.viewH * 0.4 - anchor;
      this.trackEl.style.transform = `translate3d(0, ${Math.round(y)}px, 0)`;
      this.lastP = -1;
    }

    if (idx < 0) return;
    const line = this.lines[idx];
    if (!line.text) return;
    const p = this.progressFor(line, idx, ms);
    if (Math.abs(p - this.lastP) > 0.004) {
      this.lastP = p;
      this.rows[idx].style.setProperty('--p', p.toFixed(3));
    }
  }

  progressFor(line, idx, ms) {
    const next = this.lines[idx + 1];
    if (line.words && line.words.length) {
      const words = line.words;
      let w = 0;
      while (w + 1 < words.length && words[w + 1].t <= ms) w++;
      const wEnd = words[w + 1] ? words[w + 1].t : next ? next.t : words[w].t + 600;
      const within = Math.min(1, Math.max(0, (ms - words[w].t) / Math.max(1, wEnd - words[w].t)));
      const chars = words.map((x) => x.text.length);
      const total = chars.reduce((a, b) => a + b, 0) || 1;
      const done = chars.slice(0, w).reduce((a, b) => a + b, 0);
      return Math.min(1, (done + chars[w] * within) / total);
    }
    // Line-level timing: sweep at a natural singing pace, capped by the next line.
    const natural = Math.max(900, line.text.length * 85);
    const span = next ? Math.min(next.t - line.t, natural) : natural;
    return Math.min(1, Math.max(0, (ms - line.t) / Math.max(1, span)));
  }
}
