// Thin Spotify Web API client: auth header, token refresh on 401,
// Retry-After handling on 429, and readable errors for the UI.

import { getAccessToken, refresh } from './spotify-auth.js';

const API = 'https://api.spotify.com/v1';
let blockedUntil = 0;

export class SpotifyError extends Error {
  constructor(status, message, reason) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

const FRIENDLY = {
  NO_ACTIVE_DEVICE: 'No active Spotify device. Open Spotify on the iPad and play anything once.',
  PREMIUM_REQUIRED: 'Controlling playback needs Spotify Premium.',
  VOLUME_CONTROL_DISALLOW: 'This device does not allow remote volume. Use the iPad volume buttons.',
  QUOTA_EXCEEDED: 'Spotify API quota reached for now. DeckOS will retry shortly.'
};

export async function api(path, { method = 'GET', body, query, retried = false } = {}) {
  if (Date.now() < blockedUntil) {
    throw new SpotifyError(429, 'Rate limited, waiting…', 'RATE_LIMITED');
  }
  const token = await getAccessToken();
  if (!token) throw new SpotifyError(401, 'Not connected to Spotify.', 'NO_TOKEN');

  const url = new URL(path.startsWith('http') ? path : API + path);
  if (query) Object.entries(query).forEach(([k, v]) => v != null && url.searchParams.set(k, v));

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (res.status === 401 && !retried) {
    await refresh();
    return api(path, { method, body, query, retried: true });
  }

  if (res.status === 204 || res.status === 202) return null;

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {}

  if (!res.ok) {
    const reason = (json && json.error && json.error.reason) || (json && json.reason) || '';
    if (res.status === 429) {
      const wait = parseInt(res.headers.get('Retry-After') || '5', 10);
      blockedUntil = Date.now() + Math.max(wait, reason === 'QUOTA_EXCEEDED' ? 60 : 1) * 1000;
    }
    const msg = FRIENDLY[reason] || (json && json.error && json.error.message) || `Spotify error ${res.status}`;
    throw new SpotifyError(res.status, msg, reason);
  }
  return json;
}

// Collects every page of a paged endpoint (playlists, saved tracks, ...).
export async function getAllPages(path, query = {}, maxItems = 500) {
  const items = [];
  let next = null;
  let page = await api(path, { query: { limit: 50, ...query } });
  while (page) {
    items.push(...(page.items || []));
    next = page.next;
    if (!next || items.length >= maxItems) break;
    page = await api(next);
  }
  return items;
}

export const spotify = {
  me: () => api('/me'),
  playbackState: () => api('/me/player', { query: { additional_types: 'episode' } }),
  devices: () => api('/me/player/devices').then((r) => (r && r.devices) || []),
  queue: () => api('/me/player/queue'),
  play: (body, deviceId) => api('/me/player/play', { method: 'PUT', body, query: { device_id: deviceId } }),
  pause: () => api('/me/player/pause', { method: 'PUT' }),
  next: () => api('/me/player/next', { method: 'POST' }),
  previous: () => api('/me/player/previous', { method: 'POST' }),
  seek: (ms) => api('/me/player/seek', { method: 'PUT', query: { position_ms: Math.round(ms) } }),
  volume: (pct) => api('/me/player/volume', { method: 'PUT', query: { volume_percent: Math.round(pct) } }),
  shuffle: (state) => api('/me/player/shuffle', { method: 'PUT', query: { state } }),
  repeat: (state) => api('/me/player/repeat', { method: 'PUT', query: { state } }),
  transfer: (deviceId, play = true) => api('/me/player', { method: 'PUT', body: { device_ids: [deviceId], play } }),
  playlists: () => getAllPages('/me/playlists', {}, 200),
  // Since Feb 2026 playlist contents moved from /tracks to /items and are only
  // returned for playlists the user owns or collaborates on.
  playlistItems: (id) => getAllPages(`/playlists/${id}/items`, {}, 300),
  savedTracks: () => getAllPages('/me/tracks', {}, 300),
  search: (q) => api('/search', { query: { q, type: 'track', limit: 10 } })
};

// Playlist items are { item } now, { track } before the 2026 migration.
export const unwrapItem = (entry) => (entry && (entry.item || entry.track)) || null;
