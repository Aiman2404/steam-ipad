// Spotify Connect source. Spotify itself plays the audio (the Spotify app on
// the iPad, or any other device), full-length, and DeckOS is the remote +
// display. Position is interpolated locally between polls so lyrics and the
// scrubber move smoothly without hammering the API.

import { Emitter } from '../util.js';
import { spotify } from '../spotify-api.js';
import { isLoggedIn } from '../spotify-auth.js';

const BLANK = {
  source: 'spotify',
  track: null,
  isPlaying: false,
  positionMs: 0,
  at: 0,
  shuffle: false,
  repeat: 'off',
  volume: null,
  volumeSupported: false,
  device: null
};

function pickImage(images) {
  if (!images || !images.length) return '';
  // Images come largest-first; 640px is plenty for a 250px cover on a retina iPad.
  return images[0].url;
}

function toTrack(item, context) {
  if (!item) return null;
  const isEpisode = item.type === 'episode';
  return {
    id: item.id || item.uri,
    uri: item.uri,
    title: item.name,
    artist: isEpisode ? (item.show && item.show.name) || 'Podcast' : (item.artists || []).map((a) => a.name).join(', '),
    album: isEpisode ? '' : (item.album && item.album.name) || '',
    cover: pickImage(isEpisode ? item.images || (item.show && item.show.images) : item.album && item.album.images),
    durationMs: item.duration_ms || 0,
    contextUri: (context && context.uri) || null,
    isEpisode
  };
}

export class SpotifySource extends Emitter {
  constructor() {
    super();
    this.state = { ...BLANK };
    this.timer = null;
    this.running = false;
    this.epoch = 0; // bumped on every user action so in-flight polls can't undo it
    this.inFlight = false;
    this.lastError = '';
    document.addEventListener('visibilitychange', () => {
      if (!this.running) return;
      if (document.hidden) clearTimeout(this.timer);
      else this.poll();
    });
  }

  start() {
    if (this.running || !isLoggedIn()) return;
    this.running = true;
    this.poll();
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.state = { ...BLANK };
    this.emit('state', this.state);
  }

  positionNow(now = performance.now()) {
    const s = this.state;
    if (!s.track) return 0;
    const pos = s.isPlaying ? s.positionMs + (now - s.at) : s.positionMs;
    return Math.min(Math.max(0, pos), s.track.durationMs || pos);
  }

  schedule(delay) {
    clearTimeout(this.timer);
    if (!this.running || document.hidden) return;
    this.timer = setTimeout(() => this.poll(), delay);
  }

  async poll() {
    if (!this.running || this.inFlight) return;
    this.inFlight = true;
    const epoch = this.epoch;
    const t0 = performance.now();
    let delay = 3000;
    try {
      const data = await spotify.playbackState();
      const t1 = performance.now();
      if (epoch === this.epoch) this.apply(data, t0 + (t1 - t0) / 2);
      if (this.lastError) {
        this.lastError = '';
        this.emit('status', '');
      }
      delay = this.nextDelay();
    } catch (e) {
      if (e.reason === 'NO_TOKEN') {
        this.running = false;
        this.emit('auth-lost');
        return;
      }
      if (e.message !== this.lastError) {
        this.lastError = e.message;
        this.emit('status', e.message);
      }
      delay = e.status === 429 ? 15000 : 6000;
    } finally {
      this.inFlight = false;
    }
    this.schedule(delay);
  }

  nextDelay() {
    const s = this.state;
    if (!s.track) return 7000;
    if (!s.isPlaying) return 5000;
    // Poll right after the song should end so the next track appears instantly.
    const remaining = s.track.durationMs - this.positionNow();
    if (remaining < 3500) return Math.max(remaining + 350, 400);
    return 3000;
  }

  apply(data, receivedAt) {
    const prev = this.state;
    if (!data || !data.item) {
      this.state = {
        ...BLANK,
        device: data && data.device ? data.device : null,
        shuffle: !!(data && data.shuffle_state),
        repeat: (data && data.repeat_state) || 'off'
      };
      this.emit('state', this.state);
      return;
    }

    const track = toTrack(data.item, data.context);
    const sameTrack = prev.track && prev.track.uri === track.uri;
    let positionMs = data.progress_ms || 0;
    let at = receivedAt;

    // Ignore sub-350ms jitter so lyrics never stutter backwards.
    if (sameTrack && prev.isPlaying && data.is_playing) {
      const predicted = this.positionNow(receivedAt);
      if (Math.abs(predicted - positionMs) < 350) {
        positionMs = prev.positionMs;
        at = prev.at;
      }
    }

    const device = data.device || null;
    this.state = {
      source: 'spotify',
      track,
      isPlaying: !!data.is_playing,
      positionMs,
      at,
      shuffle: !!data.shuffle_state,
      repeat: data.repeat_state || 'off',
      volume: device && device.volume_percent != null ? device.volume_percent : null,
      volumeSupported: !!device && device.supports_volume !== false,
      device
    };
    this.emit('state', this.state);
  }

  // Optimistic local update + invalidate any poll that is already in flight.
  patch(changes) {
    this.epoch += 1;
    this.state = { ...this.state, ...changes };
    this.emit('state', this.state);
  }

  async run(action, optimistic) {
    if (optimistic) this.patch(optimistic);
    else this.epoch += 1;
    try {
      await action();
    } catch (e) {
      if (e.reason === 'NO_ACTIVE_DEVICE' || e.status === 404) {
        const recovered = await this.wakeDevice();
        if (recovered) {
          await action().catch((err) => this.emit('error', err));
        } else {
          this.emit('needs-device');
        }
      } else {
        this.emit('error', e);
      }
    }
    this.schedule(450);
  }

  // No active device: hand playback to the first available one (usually the iPad).
  async wakeDevice() {
    const devices = await spotify.devices().catch(() => []);
    if (!devices.length) return false;
    const target = devices.find((d) => d.is_active) || devices.find((d) => /ipad|tablet/i.test(d.type + d.name)) || devices[0];
    await spotify.transfer(target.id, false).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));
    return true;
  }

  togglePlay() {
    if (this.state.isPlaying) {
      return this.run(() => spotify.pause(), { isPlaying: false, positionMs: this.positionNow(), at: performance.now() });
    }
    return this.run(() => spotify.play(), { isPlaying: true, positionMs: this.positionNow(), at: performance.now() });
  }

  pause() {
    if (!this.state.isPlaying) return Promise.resolve();
    return this.run(() => spotify.pause(), { isPlaying: false, positionMs: this.positionNow(), at: performance.now() });
  }

  next() {
    return this.run(() => spotify.next());
  }

  previous() {
    // Mirror Spotify: restart the song if we're more than 3s in.
    if (this.positionNow() > 3000) return this.seek(0);
    return this.run(() => spotify.previous());
  }

  seek(ms) {
    return this.run(() => spotify.seek(ms), { positionMs: ms, at: performance.now() });
  }

  toggleShuffle() {
    const shuffle = !this.state.shuffle;
    return this.run(() => spotify.shuffle(shuffle), { shuffle });
  }

  cycleRepeat() {
    const order = ['off', 'context', 'track'];
    const repeat = order[(order.indexOf(this.state.repeat) + 1) % order.length];
    return this.run(() => spotify.repeat(repeat), { repeat });
  }

  setVolume(pct) {
    if (!this.state.volumeSupported) {
      this.emit('error', new Error('This Spotify device does not allow remote volume. Use the volume buttons on the device instead.'));
      return Promise.resolve();
    }
    return this.run(() => spotify.volume(pct), { volume: pct });
  }

  playContext(contextUri, offsetUri) {
    const body = { context_uri: contextUri };
    if (offsetUri) body.offset = { uri: offsetUri };
    return this.run(() => spotify.play(body));
  }

  playUris(uris, index = 0) {
    return this.run(() => spotify.play({ uris: uris.slice(0, 100), offset: { position: Math.min(index, 99) } }));
  }

  transferTo(deviceId) {
    return this.run(() => spotify.transfer(deviceId, true));
  }
}
