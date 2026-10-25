// Library tab: real Spotify playlists, Liked Songs and search, plus songs
// uploaded to this iPad. Replaces the old "import" that fetched a playlist's
// name and then filled it with the same five hard-coded demo songs.

import { $, $$, escapeHtml, formatTime, toast, store, DEVICE } from '../util.js';
import { spotify, unwrapItem } from '../spotify-api.js';
import { isLoggedIn, getClientId, beginLogin, isLinkSpotify } from '../spotify-auth.js';

const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z"/></svg>';
const ICON_SHUFFLE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>';
const ICON_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
const ICON_HEART = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4h2c.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.8 4.3 7.2C19.5 16.4 12 21 12 21z"/></svg>';

const art = (src, extra = '') =>
  `<div class="row-art ${extra}">${src ? `<img src="${escapeHtml(src)}" alt="" loading="lazy" />` : ''}</div>`;

const eq = '<div class="eq"><i></i><i></i><i></i></div>';

export class LibraryView {
  constructor(player, { openSettings }) {
    this.player = player;
    this.openSettings = openSettings;
    this.tab = store.get('deckos.libTab', 'spotify');
    this.playlists = null;
    this.detail = null; // { kind: 'playlist'|'liked', playlist, tracks, note }
    this.searchResults = null;
    this.searchTimer = null;
    this.currentUri = null;

    $$('.lib-switch .seg').forEach((btn) =>
      btn.addEventListener('click', () => this.switchTab(btn.dataset.lib))
    );
    $('#fileInput').addEventListener('change', (e) => this.upload(e.target.files));
    player.on('local-library', () => this.renderLocal());
    this.switchTab(this.tab);
  }

  switchTab(tab) {
    this.tab = tab;
    store.set('deckos.libTab', tab);
    $$('.lib-switch .seg').forEach((b) => b.classList.toggle('is-active', b.dataset.lib === tab));
    $('#libSpotify').hidden = tab !== 'spotify';
    $('#libLocal').hidden = tab !== 'local';
    if (tab === 'spotify') this.renderSpotify();
    else this.renderLocal();
  }

  // Called whenever the Library tab becomes visible or login state changes.
  refresh() {
    if (this.tab === 'spotify') this.renderSpotify();
    else this.renderLocal();
  }

  setCurrent(track) {
    this.currentUri = track ? track.uri : null;
    $$('.row[data-uri]').forEach((row) => {
      const on = row.dataset.uri === this.currentUri;
      row.classList.toggle('is-current', on);
      const a = row.querySelector('.row-art');
      const existing = a && a.querySelector('.eq');
      if (on && a && !existing) a.insertAdjacentHTML('beforeend', eq);
      if (!on && existing) existing.remove();
    });
  }

  // ---------------- Spotify ----------------

  renderSpotify() {
    const root = $('#libSpotify');
    if (!isLoggedIn() && isLinkSpotify()) {
      root.innerHTML = `
        <div class="empty">
          <h3>Spotify isn't linked yet</h3>
          <p>An admin links Spotify once in the DeckOS Link dashboard on the laptop, then everyone here can play it.</p>
        </div>`;
      return;
    }
    if (!isLoggedIn()) {
      const configured = !!getClientId();
      root.innerHTML = `
        <div class="empty">
          <h3>Your Spotify, full length</h3>
          <p>Connect your Spotify account to browse your playlists and Liked Songs. Spotify plays the full songs and DeckOS shows synced lyrics and controls playback.</p>
          <button class="pill pill-spotify" data-act="connect">${configured ? 'Connect Spotify' : 'Set up Spotify'}</button>
        </div>`;
      root.querySelector('[data-act="connect"]').addEventListener('click', () => {
        if (configured) beginLogin().catch((e) => toast(e.message, 'error'));
        else this.openSettings('spotify');
      });
      return;
    }
    if (this.detail) return this.renderDetail();

    root.innerHTML = `
      <div class="lib-head">
        <input class="search" id="spSearch" type="search" placeholder="Search songs on Spotify" autocomplete="off" autocorrect="off" spellcheck="false" />
      </div>
      <div class="scroll" id="spList"></div>`;
    const input = $('#spSearch');
    input.addEventListener('input', () => {
      clearTimeout(this.searchTimer);
      const q = input.value.trim();
      this.searchTimer = setTimeout(() => this.search(q), 380);
    });
    if (this.searchResults && this.searchResults.q) {
      input.value = this.searchResults.q;
      this.paintSearch();
    } else {
      this.paintPlaylists();
    }
  }

  async paintPlaylists() {
    const list = $('#spList');
    if (!list) return;
    if (!this.playlists) {
      list.innerHTML = '<div class="spinner"></div>';
      try {
        this.playlists = await spotify.playlists();
      } catch (e) {
        list.innerHTML = `<div class="note">Couldn't load playlists: ${escapeHtml(e.message)}</div>`;
        return;
      }
      if (!$('#spList')) return;
    }
    const rows = this.playlists
      .filter(Boolean)
      .map((p, i) => {
        const cover = p.images && p.images.length ? p.images[p.images.length > 1 ? 1 : 0].url : '';
        const count = (p.items && p.items.total) != null ? p.items.total : p.tracks && p.tracks.total;
        const sub = [p.owner && p.owner.display_name, count != null ? `${count} ${count === 1 ? 'song' : 'songs'}` : ''].filter(Boolean).join(' · ');
        return `<button class="row" data-pl="${i}">${art(cover)}<div class="row-text"><div class="row-title">${escapeHtml(p.name)}</div><div class="row-sub">${escapeHtml(sub)}</div></div></button>`;
      })
      .join('');
    list.innerHTML = `
      <button class="row" data-liked>
        <div class="row-art is-liked">${ICON_HEART}</div>
        <div class="row-text"><div class="row-title">Liked Songs</div><div class="row-sub">Your saved tracks</div></div>
      </button>
      <div class="section-label">Playlists</div>
      ${rows || '<div class="note">No playlists yet.</div>'}`;
    list.querySelector('[data-liked]').addEventListener('click', () => this.openLiked());
    $$('[data-pl]', list).forEach((row) =>
      row.addEventListener('click', () => this.openPlaylist(this.playlists[Number(row.dataset.pl)]))
    );
  }

  async search(q) {
    if (!q) {
      this.searchResults = null;
      this.paintPlaylists();
      return;
    }
    const list = $('#spList');
    if (list) list.innerHTML = '<div class="spinner"></div>';
    try {
      const res = await spotify.search(q);
      this.searchResults = { q, tracks: (res.tracks && res.tracks.items) || [] };
    } catch (e) {
      this.searchResults = { q, tracks: [], error: e.message };
    }
    this.paintSearch();
  }

  paintSearch() {
    const list = $('#spList');
    if (!list || !this.searchResults) return;
    const { tracks, error } = this.searchResults;
    if (error) {
      list.innerHTML = `<div class="note">${escapeHtml(error)}</div>`;
      return;
    }
    if (!tracks.length) {
      list.innerHTML = '<div class="note">No songs found.</div>';
      return;
    }
    list.innerHTML = tracks.map((t, i) => this.trackRow(t, i)).join('');
    $$('[data-i]', list).forEach((row) =>
      row.addEventListener('click', () => {
        const t = tracks[Number(row.dataset.i)];
        // Play inside its album so "next" keeps going naturally.
        if (t.album && t.album.uri) this.player.playSpotifyContext(t.album.uri, t.uri);
        else this.player.playSpotifyUris([t.uri], 0);
      })
    );
    this.setCurrent({ uri: this.currentUri });
  }

  trackRow(t, i) {
    const images = (t.album && t.album.images) || [];
    const cover = images.length ? images[images.length - 1].url : '';
    const artists = (t.artists || []).map((a) => a.name).join(', ');
    return `<button class="row" data-i="${i}" data-uri="${escapeHtml(t.uri)}">${art(cover)}<div class="row-text"><div class="row-title">${escapeHtml(t.name)}</div><div class="row-sub">${escapeHtml(artists)}</div></div><span class="row-end mono">${formatTime(t.duration_ms)}</span></button>`;
  }

  async openPlaylist(playlist) {
    this.detail = { kind: 'playlist', playlist, tracks: null, note: '' };
    this.renderDetail();
    try {
      const items = await spotify.playlistItems(playlist.id);
      this.detail.tracks = items.map(unwrapItem).filter((t) => t && t.uri && t.type !== 'episode');
    } catch (e) {
      this.detail.tracks = [];
      this.detail.note = e.status === 403 || e.status === 404
        ? "Spotify only shares the song list of playlists you own or collaborate on. Tap Play and it will still play in full."
        : e.message;
    }
    if (this.detail && this.detail.playlist === playlist) this.renderDetail();
  }

  async openLiked() {
    this.detail = { kind: 'liked', playlist: { name: 'Liked Songs' }, tracks: null, note: '' };
    this.renderDetail();
    try {
      const items = await spotify.savedTracks();
      this.detail.tracks = items.map(unwrapItem).filter((t) => t && t.uri);
    } catch (e) {
      this.detail.tracks = [];
      this.detail.note = e.message;
    }
    if (this.detail && this.detail.kind === 'liked') this.renderDetail();
  }

  renderDetail() {
    const root = $('#libSpotify');
    const d = this.detail;
    const p = d.playlist;
    const cover = p.images && p.images.length ? p.images[0].url : '';
    const n = d.tracks ? d.tracks.length : 0;
    const count = d.tracks ? `${n} ${n === 1 ? 'song' : 'songs'}` : 'Loading…';
    root.innerHTML = `
      <button class="back" data-act="back">${ICON_BACK}Library</button>
      <div class="detail-head">
        ${d.kind === 'liked' ? `<div class="row-art is-liked">${ICON_HEART}</div>` : art(cover)}
        <div class="row-text">
          <div class="detail-title">${escapeHtml(p.name)}</div>
          <div class="row-sub">${escapeHtml(count)}</div>
          <div class="detail-actions">
            <button class="pill pill-accent" data-act="play">${ICON_PLAY}Play</button>
            <button class="pill" data-act="shuffle">${ICON_SHUFFLE}Shuffle</button>
          </div>
        </div>
      </div>
      <div class="scroll" id="spDetail">
        ${d.note ? `<div class="note">${escapeHtml(d.note)}</div>` : ''}
        ${d.tracks ? d.tracks.map((t, i) => this.trackRow(t, i)).join('') : '<div class="spinner"></div>'}
      </div>`;

    root.querySelector('[data-act="back"]').addEventListener('click', () => {
      this.detail = null;
      this.renderSpotify();
    });
    root.querySelector('[data-act="play"]').addEventListener('click', () => this.playDetail(0, false));
    root.querySelector('[data-act="shuffle"]').addEventListener('click', () => this.playDetail(0, true));
    $$('#spDetail [data-i]').forEach((row) =>
      row.addEventListener('click', () => this.playDetail(Number(row.dataset.i), false))
    );
    this.setCurrent({ uri: this.currentUri });
  }

  async playDetail(index, shuffle) {
    const d = this.detail;
    if (!d) return;
    const tracks = d.tracks || [];
    if (shuffle) {
      // Turn shuffle on first so Spotify picks a random start inside the context.
      if (!this.player.spotify.state.shuffle) await this.player.spotify.toggleShuffle();
    }
    if (d.kind === 'playlist') {
      const offsetUri = !shuffle && tracks[index] ? tracks[index].uri : undefined;
      await this.player.playSpotifyContext(d.playlist.uri, offsetUri);
    } else {
      if (!tracks.length) return;
      // Liked Songs has no context URI we can rely on; play a window of URIs.
      const start = shuffle ? Math.floor(Math.random() * tracks.length) : index;
      await this.player.playSpotifyUris(tracks.slice(start, start + 100).map((t) => t.uri), 0);
    }
  }

  onLogin() {
    this.playlists = null;
    this.detail = null;
    this.searchResults = null;
    this.refresh();
  }

  // ---------------- On this device ----------------

  renderLocal() {
    const root = $('#libLocal');
    const rows = this.player.local.tracks;
    if (!rows.length) {
      root.innerHTML = `
        <div class="empty">
          <h3>Songs on this ${DEVICE}</h3>
          <p>Add MP3 or M4A files from your Files app or storage. They're saved on this ${DEVICE}, play in full and get synced lyrics and their real cover art.</p>
          <button class="pill pill-accent" data-act="add">Add songs</button>
        </div>`;
      root.querySelector('[data-act="add"]').addEventListener('click', () => $('#fileInput').click());
      return;
    }
    root.innerHTML = `
      <div class="lib-head">
        <span class="row-sub" style="flex:1">${rows.length} ${rows.length === 1 ? 'song' : 'songs'} saved on this ${DEVICE}</span>
        <button class="pill pill-accent" data-act="add">+ Add songs</button>
      </div>
      <div class="scroll" id="localList">
        ${rows
          .map((r) => {
            const cover = this.player.local.coverFor(r);
            return `<div class="row" data-id="${escapeHtml(r.id)}" data-uri="local:${escapeHtml(r.id)}" role="button">${art(cover)}<div class="row-text"><div class="row-title">${escapeHtml(r.title)}</div><div class="row-sub">${escapeHtml(r.artist || 'Unknown artist')}</div></div><span class="row-end mono">${formatTime(r.durationMs)}</span><button class="row-x" data-remove="${escapeHtml(r.id)}" aria-label="Remove">✕</button></div>`;
          })
          .join('')}
      </div>`;
    root.querySelector('[data-act="add"]').addEventListener('click', () => $('#fileInput').click());
    $$('#localList .row').forEach((row) =>
      row.addEventListener('click', (e) => {
        const remove = e.target.closest('[data-remove]');
        if (remove) {
          e.stopPropagation();
          this.player.local.remove(remove.dataset.remove);
          return;
        }
        this.player.playLocal(row.dataset.id);
      })
    );
    this.setCurrent({ uri: this.currentUri });
  }

  async upload(files) {
    if (!files || !files.length) return;
    toast(`Adding ${files.length} ${files.length === 1 ? 'song' : 'songs'}…`);
    try {
      const n = await this.player.local.addFiles(files);
      toast(n ? `Added ${n} ${n === 1 ? 'song' : 'songs'}` : 'No audio files found', n ? 'ok' : 'error');
      if (n) this.switchTab('local');
    } catch (e) {
      toast(`Couldn't save songs: ${e.message}`, 'error');
    }
    $('#fileInput').value = '';
  }
}
