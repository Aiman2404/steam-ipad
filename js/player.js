// Single controller the UI talks to. It owns both sources and decides which
// one is "active": whichever the user last played, or Spotify when it starts
// playing on its own (e.g. from the Spotify app). Only one plays at a time.

import { Emitter } from './util.js';
import { SpotifySource } from './sources/spotify-source.js';
import { LocalSource } from './sources/local-source.js';

export class Player extends Emitter {
  constructor() {
    super();
    this.spotify = new SpotifySource();
    this.local = new LocalSource();
    this.active = this.local;
    this.lastTrackKey = null;

    this.spotify.on('state', (s) => {
      // Follow Spotify when it starts playing elsewhere while local is idle, or
      // when there's no local song at all (so a paused Spotify song still shows).
      const localIdle = !this.local.state.isPlaying;
      if (this.active !== this.spotify && localIdle && (s.isPlaying || !this.local.state.track)) {
        this.active = this.spotify;
      }
      if (this.active === this.spotify) this.publish();
    });
    this.local.on('state', (s) => {
      if (s.isPlaying && this.active !== this.local) {
        this.active = this.local;
        this.spotify.pause();
      }
      if (this.active === this.local) this.publish();
    });

    ['error', 'needs-device', 'auth-lost', 'status'].forEach((evt) => {
      this.spotify.on(evt, (p) => this.emit(evt, p));
    });
    this.local.on('error', (e) => this.emit('error', e));
    this.local.on('library', (rows) => this.emit('local-library', rows));
  }

  get state() {
    return this.active.state;
  }

  positionNow() {
    return this.active.positionNow();
  }

  publish() {
    const s = this.active.state;
    const key = s.track ? `${s.source}:${s.track.uri}` : null;
    if (key !== this.lastTrackKey) {
      this.lastTrackKey = key;
      this.emit('track', s.track);
    }
    this.emit('state', s);
  }

  useSpotify() {
    if (this.active === this.spotify) return;
    this.local.pause();
    this.active = this.spotify;
    this.publish();
  }

  // ----- transport (forwarded to the active source) -----
  togglePlay() {
    return this.active.togglePlay();
  }
  next() {
    return this.active.next();
  }
  previous() {
    return this.active.previous();
  }
  seek(ms) {
    return this.active.seek(ms);
  }
  toggleShuffle() {
    return this.active.toggleShuffle();
  }
  cycleRepeat() {
    return this.active.cycleRepeat();
  }
  setVolume(pct) {
    return this.active.setVolume(pct);
  }

  // ----- starting playback from the library -----
  playSpotifyContext(contextUri, offsetUri) {
    this.useSpotify();
    return this.spotify.playContext(contextUri, offsetUri);
  }
  playSpotifyUris(uris, index) {
    this.useSpotify();
    return this.spotify.playUris(uris, index);
  }
  playLocal(id) {
    this.active = this.local;
    this.spotify.pause();
    this.local.playId(id);
  }
}
