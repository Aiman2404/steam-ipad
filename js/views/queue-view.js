// "Up next": Spotify's real queue, or the upcoming songs on this iPad.

import { $, $$, escapeHtml, formatTime } from '../util.js';
import { spotify } from '../spotify-api.js';

export class QueueView {
  constructor(player) {
    this.player = player;
    this.visible = false;
    this.stale = true;
    this.token = 0;
  }

  setVisible(visible) {
    this.visible = visible;
    if (visible && this.stale) this.load();
  }

  invalidate() {
    this.stale = true;
    if (this.visible) this.load();
  }

  async load() {
    this.stale = false;
    const token = ++this.token;
    const root = $('#queue');
    const s = this.player.state;

    if (!s.track) {
      root.innerHTML = '<div class="empty"><h3>Nothing queued</h3><p>Start something from the Library tab.</p></div>';
      return;
    }

    if (s.source === 'local') {
      const local = this.player.local;
      const pos = local.order.indexOf(local.index);
      const upcoming = local.order.slice(pos + 1).concat(s.repeat === 'context' ? local.order.slice(0, pos) : []);
      this.paint(upcoming.slice(0, 30).map((i) => {
        const r = local.tracks[i];
        return { id: r.id, title: r.title, artist: r.artist, cover: local.coverFor(r), durationMs: r.durationMs };
      }), true);
      return;
    }

    root.innerHTML = '<div class="spinner"></div>';
    try {
      const q = await spotify.queue();
      if (token !== this.token) return;
      const items = ((q && q.queue) || []).slice(0, 30).map((t) => {
        const images = (t.album && t.album.images) || t.images || [];
        return {
          title: t.name,
          artist: (t.artists || []).map((a) => a.name).join(', ') || (t.show && t.show.name) || '',
          cover: images.length ? images[images.length - 1].url : '',
          durationMs: t.duration_ms
        };
      });
      this.paint(items, false);
    } catch (e) {
      if (token === this.token) root.innerHTML = `<div class="note">${escapeHtml(e.message)}</div>`;
    }
  }

  paint(items, tappable) {
    const root = $('#queue');
    if (!items.length) {
      root.innerHTML = '<div class="empty"><h3>End of the line</h3><p>Nothing else is queued after this song.</p></div>';
      return;
    }
    root.innerHTML = `
      <div class="section-label" style="padding-left:16px">Next up</div>
      <div class="scroll">
        ${items
          .map(
            (t, i) => `<${tappable ? 'button' : 'div'} class="row" ${tappable ? `data-id="${escapeHtml(t.id)}"` : ''}>
              <div class="row-art">${t.cover ? `<img src="${escapeHtml(t.cover)}" alt="" loading="lazy" />` : ''}</div>
              <div class="row-text"><div class="row-title">${escapeHtml(t.title)}</div><div class="row-sub">${escapeHtml(t.artist)}</div></div>
              <span class="row-end mono">${i === 0 ? 'Next' : formatTime(t.durationMs)}</span>
            </${tappable ? 'button' : 'div'}>`
          )
          .join('')}
      </div>`;
    if (tappable) {
      $$('#queue [data-id]').forEach((row) => row.addEventListener('click', () => this.player.playLocal(row.dataset.id)));
    }
  }
}
