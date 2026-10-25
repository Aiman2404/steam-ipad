// "On this iPad" source: songs uploaded from Files/iCloud, stored in IndexedDB,
// played through an <audio> element routed into Web Audio. iOS Safari ignores
// audio.volume, so volume goes through a GainNode instead.

import { Emitter, DEVICE } from '../util.js';
import { idb } from '../idb.js';
import { readTags, readDuration } from '../tags.js';

const BLANK = {
  source: 'local',
  track: null,
  isPlaying: false,
  positionMs: 0,
  at: 0,
  shuffle: false,
  repeat: 'context',
  volume: 80,
  volumeSupported: true,
  device: { name: `This ${DEVICE}` }
};

async function lookupArtwork(title, artist) {
  try {
    const term = `${title} ${artist || ''}`.trim();
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=5`);
    const data = await res.json();
    const hit = (data.results || []).find((r) => !artist || (r.artistName || '').toLowerCase().includes(artist.toLowerCase().split(/[,&]/)[0].trim()))
      || (data.results || [])[0];
    return hit ? hit.artworkUrl100.replace('100x100bb', '600x600bb') : '';
  } catch (_) {
    return '';
  }
}

export class LocalSource extends Emitter {
  constructor() {
    super();
    this.state = { ...BLANK };
    this.tracks = [];
    this.index = -1;
    this.order = [];
    this.coverUrls = new Map();
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.setAttribute('playsinline', '');
    this.ctx = null;
    this.gain = null;
    this.objectUrl = null;
    this.bindAudio();
  }

  async load() {
    const rows = await idb.allTracks().catch(() => []);
    this.tracks = rows.sort((a, b) => a.addedAt - b.addedAt);
    this.rebuildOrder();
    this.emit('library', this.tracks);
  }

  // ---------- audio graph ----------

  ensureGraph() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    const node = this.ctx.createMediaElementSource(this.audio);
    this.gain = this.ctx.createGain();
    node.connect(this.gain);
    this.gain.connect(this.ctx.destination);
    this.applyVolume();
  }

  applyVolume() {
    const v = this.state.volume / 100;
    // Perceptual curve so the slider feels even.
    if (this.gain) this.gain.gain.value = Math.pow(v, 1.7);
    else this.audio.volume = v;
  }

  bindAudio() {
    const a = this.audio;
    const sync = () => {
      this.state = { ...this.state, isPlaying: !a.paused, positionMs: a.currentTime * 1000, at: performance.now() };
      this.emit('state', this.state);
    };
    a.addEventListener('play', sync);
    a.addEventListener('pause', sync);
    a.addEventListener('seeked', sync);
    a.addEventListener('playing', sync);
    a.addEventListener('waiting', sync);
    a.addEventListener('loadedmetadata', () => {
      if (!this.state.track || !isFinite(a.duration)) return;
      const durationMs = Math.round(a.duration * 1000);
      if (Math.abs(durationMs - this.state.track.durationMs) > 1000) {
        this.state = { ...this.state, track: { ...this.state.track, durationMs } };
        const row = this.tracks[this.index];
        if (row) {
          row.durationMs = durationMs;
          idb.putTrack(row).catch(() => {});
        }
        this.emit('state', this.state);
      }
    });
    a.addEventListener('ended', () => this.handleEnded());
    a.addEventListener('error', () => {
      if (!a.getAttribute('src')) return;
      this.emit('error', new Error('Could not play this file. Try re-uploading it.'));
    });
  }

  positionNow() {
    return this.audio.currentTime * 1000;
  }

  // ---------- library ----------

  async addFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|flac|ogg|alac)$/i.test(f.name));
    const added = [];
    for (const file of files) {
      const tags = await readTags(file);
      const durationMs = await readDuration(file);
      const row = {
        id: `loc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: tags.title,
        artist: tags.artist,
        album: tags.album,
        durationMs,
        blob: file,
        picture: tags.picture,
        coverUrl: '',
        addedAt: Date.now() + added.length
      };
      await idb.putTrack(row);
      this.tracks.push(row);
      added.push(row);
    }
    this.rebuildOrder();
    this.emit('library', this.tracks);

    // Fill missing artwork in the background.
    added.filter((r) => !r.picture).forEach(async (row) => {
      row.coverUrl = await lookupArtwork(row.title, row.artist);
      if (!row.coverUrl) return;
      idb.putTrack(row).catch(() => {});
      if (this.state.track && this.state.track.id === row.id) {
        this.state = { ...this.state, track: this.toTrack(row) };
        this.emit('state', this.state);
      }
      this.emit('library', this.tracks);
    });
    return added.length;
  }

  async remove(id) {
    const i = this.tracks.findIndex((t) => t.id === id);
    if (i < 0) return;
    const wasCurrent = i === this.index;
    this.tracks.splice(i, 1);
    await idb.deleteTrack(id).catch(() => {});
    const url = this.coverUrls.get(id);
    if (url) URL.revokeObjectURL(url);
    this.coverUrls.delete(id);
    if (wasCurrent) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.index = -1;
      this.state = { ...this.state, track: null, isPlaying: false, positionMs: 0 };
      this.emit('state', this.state);
    } else if (i < this.index) {
      this.index -= 1;
    }
    this.rebuildOrder();
    this.emit('library', this.tracks);
  }

  coverFor(row) {
    if (row.picture) {
      if (!this.coverUrls.has(row.id)) this.coverUrls.set(row.id, URL.createObjectURL(row.picture));
      return this.coverUrls.get(row.id);
    }
    return row.coverUrl || '';
  }

  toTrack(row) {
    return {
      id: row.id,
      uri: `local:${row.id}`,
      title: row.title,
      artist: row.artist,
      album: row.album,
      cover: this.coverFor(row),
      durationMs: row.durationMs,
      contextUri: 'local:library'
    };
  }

  rebuildOrder() {
    const ids = this.tracks.map((_, i) => i);
    if (this.state.shuffle) {
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      // Keep the current song first so shuffle doesn't jump.
      const cur = ids.indexOf(this.index);
      if (cur > 0) [ids[0], ids[cur]] = [ids[cur], ids[0]];
    }
    this.order = ids;
  }

  // ---------- transport ----------

  playIndex(i) {
    const row = this.tracks[i];
    if (!row) return;
    this.ensureGraph();
    this.index = i;
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(row.blob);
    this.audio.src = this.objectUrl;
    this.state = { ...this.state, track: this.toTrack(row), positionMs: 0, at: performance.now(), isPlaying: true };
    this.emit('state', this.state);
    this.updateMediaSession(row);
    this.audio.play().catch(() => {
      this.state = { ...this.state, isPlaying: false };
      this.emit('state', this.state);
    });
  }

  playId(id) {
    const i = this.tracks.findIndex((t) => t.id === id);
    if (i >= 0) this.playIndex(i);
  }

  togglePlay() {
    if (this.index < 0) {
      if (this.tracks.length) this.playIndex(this.order[0] || 0);
      return;
    }
    this.ensureGraph();
    if (this.audio.paused) this.audio.play().catch(() => {});
    else this.audio.pause();
  }

  pause() {
    this.audio.pause();
  }

  step(dir) {
    if (!this.tracks.length) return;
    const pos = this.order.indexOf(this.index);
    let next = pos + dir;
    if (next >= this.order.length || next < 0) {
      if (this.state.repeat === 'off' && dir > 0) {
        this.audio.pause();
        return;
      }
      next = (next + this.order.length) % this.order.length;
    }
    this.playIndex(this.order[next]);
  }

  next() {
    this.step(1);
  }

  previous() {
    if (this.audio.currentTime > 3) this.seek(0);
    else this.step(-1);
  }

  handleEnded() {
    if (this.state.repeat === 'track') {
      this.seek(0);
      this.audio.play().catch(() => {});
    } else {
      this.step(1);
    }
  }

  seek(ms) {
    if (!this.state.track) return;
    this.audio.currentTime = ms / 1000;
    this.state = { ...this.state, positionMs: ms, at: performance.now() };
    this.emit('state', this.state);
  }

  toggleShuffle() {
    this.state = { ...this.state, shuffle: !this.state.shuffle };
    this.rebuildOrder();
    this.emit('state', this.state);
  }

  cycleRepeat() {
    const order = ['off', 'context', 'track'];
    this.state = { ...this.state, repeat: order[(order.indexOf(this.state.repeat) + 1) % order.length] };
    this.emit('state', this.state);
  }

  setVolume(pct) {
    this.state = { ...this.state, volume: pct };
    this.applyVolume();
    this.emit('state', this.state);
  }

  updateMediaSession(row) {
    if (!('mediaSession' in navigator)) return;
    const cover = this.coverFor(row);
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: row.title,
        artist: row.artist,
        album: row.album,
        artwork: cover ? [{ src: cover, sizes: '512x512' }] : []
      });
      navigator.mediaSession.setActionHandler('play', () => this.togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.previous());
    } catch (_) {}
  }
}
