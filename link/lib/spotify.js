// Server-side Spotify link. An admin links Spotify once from the dashboard
// on the laptop; Link keeps the refresh token and hands short-lived access
// tokens to signed-in decks. That lets every member use the music deck
// without their own Spotify developer app, and it works over plain http on
// the home network (Spotify only accepts https or loopback redirect URIs,
// and the laptop's 127.0.0.1 is loopback).

import { randomBytes, createHash } from 'node:crypto';

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read'
].join(' ');

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export class SpotifyLink {
  constructor(store) {
    this.store = store;
    this.pending = new Map(); // state -> { verifier, redirectUri, at }
    this.refreshing = null;
  }

  get cfg() {
    return this.store.data.spotify;
  }

  status() {
    return { clientId: this.cfg.clientId, linked: !!this.cfg.refreshToken, account: this.cfg.account || '' };
  }

  setClientId(id) {
    const clean = String(id || '').trim();
    if (!/^[0-9a-f]{32}$/i.test(clean)) throw new Error('That does not look like a Spotify Client ID (32 letters/numbers).');
    if (clean !== this.cfg.clientId) this.unlink();
    this.cfg.clientId = clean;
    this.store.save();
  }

  loginUrl(redirectUri) {
    if (!this.cfg.clientId) throw new Error('Save your Spotify Client ID first.');
    const verifier = b64url(randomBytes(48));
    const state = b64url(randomBytes(16));
    this.pending.set(state, { verifier, redirectUri, at: Date.now() });
    for (const [k, v] of this.pending) if (Date.now() - v.at > 10 * 60 * 1000) this.pending.delete(k);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.cfg.clientId,
      scope: SCOPES,
      redirect_uri: redirectUri,
      code_challenge_method: 'S256',
      code_challenge: b64url(createHash('sha256').update(verifier).digest()),
      state
    });
    return `${AUTH_URL}?${params}`;
  }

  async tokenRequest(body) {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json.error_description || json.error || `Spotify token error ${res.status}`);
      err.code = json.error;
      throw err;
    }
    this.cfg.accessToken = json.access_token;
    this.cfg.expiresAt = Date.now() + (json.expires_in - 60) * 1000;
    if (json.refresh_token) this.cfg.refreshToken = json.refresh_token;
    this.store.save();
  }

  async handleCallback({ code, state, error }) {
    if (error) throw new Error(error === 'access_denied' ? 'Spotify login was cancelled.' : error);
    const p = this.pending.get(state);
    this.pending.delete(state);
    if (!p) throw new Error('Spotify login expired. Try again.');
    await this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: p.redirectUri,
      client_id: this.cfg.clientId,
      code_verifier: p.verifier
    });
    try {
      const me = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${this.cfg.accessToken}` }
      }).then((r) => r.json());
      this.cfg.account = me.display_name || me.id || '';
      this.store.save();
    } catch (_) {}
  }

  async accessToken() {
    if (!this.cfg.refreshToken) return null;
    if (this.cfg.accessToken && Date.now() < this.cfg.expiresAt) {
      return { accessToken: this.cfg.accessToken, expiresAt: this.cfg.expiresAt };
    }
    if (!this.refreshing) {
      this.refreshing = this.tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: this.cfg.refreshToken,
        client_id: this.cfg.clientId
      })
        .catch((e) => {
          if (e.code === 'invalid_grant') this.unlink();
          throw e;
        })
        .finally(() => {
          this.refreshing = null;
        });
    }
    await this.refreshing;
    return { accessToken: this.cfg.accessToken, expiresAt: this.cfg.expiresAt };
  }

  unlink() {
    Object.assign(this.cfg, { refreshToken: '', accessToken: '', expiresAt: 0, account: '' });
    this.store.save();
  }
}
