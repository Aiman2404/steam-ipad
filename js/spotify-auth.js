// Spotify Authorization Code + PKCE flow. Runs entirely in the browser:
// no client secret, no backend. The user registers their own Spotify app and
// pastes its Client ID into DeckOS settings once.

import { store } from './util.js';

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

export const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read'
].join(' ');

// When the deck is served by DeckOS Link, the laptop holds the Spotify
// link and hands out access tokens; no Client ID or login on the device.
let linkMode = null; // { linked: bool } or null
let linkToken = null;

export function useLinkSpotify(status) {
  linkMode = status ? { linked: !!status.linked } : null;
  linkToken = null;
}

async function linkAccessToken(force = false) {
  if (!force && linkToken && Date.now() < linkToken.expiresAt - 30000) return linkToken.accessToken;
  const res = await fetch('./api/spotify/token', { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) {
    linkToken = null;
    if (res.status === 401 || res.status === 404) return null;
    throw new Error(`Laptop could not refresh Spotify (${res.status})`);
  }
  linkToken = await res.json();
  return linkToken.accessToken;
}

const K_CLIENT = 'deckos.spotify.clientId';
const K_TOKENS = 'deckos.spotify.tokens';
const K_VERIFIER = 'deckos.spotify.verifier';
const K_STATE = 'deckos.spotify.state';

// Must match the Redirect URI registered in the Spotify dashboard exactly.
export function redirectUri() {
  return new URL('./', window.location.href).href;
}

export const getClientId = () => store.get(K_CLIENT, '');
export const setClientId = (id) => store.set(K_CLIENT, (id || '').trim());

function randomString(len) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function beginLogin() {
  if (linkMode) throw new Error('Spotify is linked on the laptop. Ask an admin to link it in the DeckOS Link dashboard.');
  const clientId = getClientId();
  if (!clientId) throw new Error('Add your Spotify Client ID in Settings first.');
  const verifier = randomString(64);
  const state = randomString(16);
  store.set(K_VERIFIER, verifier);
  store.set(K_STATE, state);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: await challengeFor(verifier),
    state
  });
  // Same-window navigation keeps an iOS home-screen app inside its own shell.
  window.location.assign(`${AUTH_URL}?${params}`);
}

function saveTokens(json) {
  const prev = store.get(K_TOKENS, {});
  const tokens = {
    accessToken: json.access_token,
    // Spotify rotates refresh tokens with PKCE; keep the old one if none is sent.
    refreshToken: json.refresh_token || prev.refreshToken,
    expiresAt: Date.now() + (json.expires_in - 60) * 1000
  };
  store.set(K_TOKENS, tokens);
  return tokens;
}

async function tokenRequest(body) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error_description || json.error || `Token request failed (${res.status})`);
    err.code = json.error;
    throw err;
  }
  return saveTokens(json);
}

// Call on startup. Returns true if this page load was an OAuth redirect.
export async function handleRedirect() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');
  if (!code && !error) return { handled: false };

  const cleanUrl = window.location.pathname + window.location.hash;
  window.history.replaceState(null, '', cleanUrl);

  if (error) return { handled: true, error: error === 'access_denied' ? 'Spotify login was cancelled.' : error };
  if (params.get('state') !== store.get(K_STATE)) {
    return { handled: true, error: 'Spotify login expired. Please try again.' };
  }

  try {
    await tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      client_id: getClientId(),
      code_verifier: store.get(K_VERIFIER, '')
    });
    return { handled: true };
  } catch (e) {
    return { handled: true, error: e.message };
  } finally {
    store.remove(K_VERIFIER);
    store.remove(K_STATE);
  }
}

let refreshing = null;

export async function getAccessToken() {
  if (linkMode) return linkAccessToken();
  const tokens = store.get(K_TOKENS, null);
  if (!tokens || !tokens.refreshToken) return null;
  if (tokens.accessToken && Date.now() < tokens.expiresAt) return tokens.accessToken;
  return (await refresh()).accessToken;
}

export function refresh() {
  if (linkMode) return linkAccessToken(true).then((accessToken) => ({ accessToken }));
  if (!refreshing) {
    const tokens = store.get(K_TOKENS, {});
    refreshing = tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: getClientId()
    })
      .catch((e) => {
        // A revoked or expired refresh token means the user has to log in again.
        if (e.code === 'invalid_grant') logout();
        throw e;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

export const isLoggedIn = () => (linkMode ? linkMode.linked : !!(store.get(K_TOKENS, null) || {}).refreshToken);
export const isLinkSpotify = () => !!linkMode;

export function logout() {
  if (linkMode) return;
  store.remove(K_TOKENS);
}
