// Settings sheet: Spotify setup/connection, display options, dock, storage.
// Also owns the "Play on…" Spotify device picker.

import { $, $$, escapeHtml, store, toast, DEVICE } from '../util.js';
import { openSheet, closeSheet } from './sheet.js';
import { getClientId, setClientId, beginLogin, logout, isLoggedIn, redirectUri } from '../spotify-auth.js';
import { spotify } from '../spotify-api.js';
import { idb } from '../idb.js';
import { getEdges, setEdges } from '../fit.js';

const K_PREFS = 'deckos.prefs';

export function loadPrefs() {
  return { calm: false, guides: false, ...store.get(K_PREFS, {}) };
}

export function applyPrefs(prefs) {
  document.body.classList.toggle('calm', !!prefs.calm);
  $('#deck').classList.toggle('guides', !!prefs.guides);
}

export class Settings {
  constructor(player, { onLogout, openDock }) {
    this.player = player;
    this.onLogout = onLogout;
    this.openDock = openDock;
    this.prefs = loadPrefs();
    this.profile = null;
    applyPrefs(this.prefs);
  }

  setPref(key, value) {
    this.prefs[key] = value;
    store.set(K_PREFS, this.prefs);
    applyPrefs(this.prefs);
  }

  async open(focus) {
    this.render();
    openSheet('settingsSheet');
    if (focus === 'spotify' && !getClientId()) {
      const input = $('#clientIdInput');
      if (input) input.focus();
    }
    if (isLoggedIn() && !this.profile) {
      this.profile = await spotify.me().catch(() => null);
      if (!$('#settingsSheet').hidden) this.render();
    }
  }

  render() {
    const loggedIn = isLoggedIn();
    const clientId = getClientId();
    const device = this.player.spotify.state.device;
    const name = this.profile ? this.profile.display_name || this.profile.id : '';

    const spotifyGroup = loggedIn
      ? `<div class="group">
          <h3><span class="chip-dot" style="background:#1ed760"></span>Spotify connected</h3>
          <p>${name ? `Signed in as <b>${escapeHtml(name)}</b>. ` : ''}${device ? `Playing on <b>${escapeHtml(device.name)}</b>.` : 'No active device right now.'}</p>
          <div class="detail-actions">
            <button class="pill" data-act="devices">Choose device</button>
            <button class="pill" data-act="logout">Disconnect</button>
          </div>
        </div>`
      : `<div class="group">
          <h3>Connect Spotify (one-time, ~2 minutes)</h3>
          <p>Spotify plays full songs in its own app; DeckOS controls it and shows synced lyrics. Needs a Spotify Premium account to control playback.</p>
          <ol>
            <li>On any browser, open <code>developer.spotify.com/dashboard</code> and log in.</li>
            <li>Create app → any name → Redirect URI: <code>${escapeHtml(redirectUri())}</code> → tick <b>Web API</b> → Save.</li>
            <li>Open the app's Settings, copy the <b>Client ID</b> and paste it below.</li>
          </ol>
          <div class="field">
            <input class="input mono" id="clientIdInput" placeholder="Spotify Client ID" value="${escapeHtml(clientId)}" autocapitalize="off" autocorrect="off" spellcheck="false" />
            <button class="pill pill-spotify" data-act="connect" style="height:38px">Connect</button>
          </div>
        </div>`;

    $('#settingsBody').innerHTML = `
      ${spotifyGroup}
      <div class="group">
        <h3>Display</h3>
        <div class="toggle-row">
          <span>Calm background<small>Stop the aurora from drifting (saves battery)</small></span>
          <button class="switch" role="switch" aria-checked="${!!this.prefs.calm}" data-pref="calm"></button>
        </div>
        <div class="toggle-row">
          <span>3D-print bezel guides<small>Outline every hardware zone for fitting the printed frame</small></span>
          <button class="switch" role="switch" aria-checked="${!!this.prefs.guides}" data-pref="guides"></button>
        </div>
      </div>
      <div class="group">
        <h3>Screen edges</h3>
        <p>Add space if anything is hidden behind the status bar, a rounded corner or the printed bezel.</p>
        ${['top', 'bottom', 'sides']
          .map(
            (edge) => `<div class="toggle-row">
              <span style="text-transform:capitalize">${edge}</span>
              <div class="nudge">
                <button type="button" data-edge="${edge}" data-step="-4" aria-label="Less ${edge} space">−</button>
                <span class="mono" data-edge-value="${edge}">${getEdges()[edge]}px</span>
                <button type="button" data-edge="${edge}" data-step="4" aria-label="More ${edge} space">+</button>
              </div>
            </div>`
          )
          .join('')}
      </div>
      <div class="group">
        <h3>Dock &amp; storage</h3>
        <p>${this.player.local.tracks.length} songs saved on this ${DEVICE}.</p>
        <div class="detail-actions">
          <button class="pill" data-act="dock">Edit dock buttons</button>
          <button class="pill" data-act="clear-local">Remove all saved songs</button>
        </div>
      </div>`;

    $$('#settingsBody [data-pref]').forEach((sw) =>
      sw.addEventListener('click', () => {
        const key = sw.dataset.pref;
        this.setPref(key, !this.prefs[key]);
        sw.setAttribute('aria-checked', String(!!this.prefs[key]));
      })
    );
    $$('#settingsBody [data-edge]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const edges = getEdges();
        const key = btn.dataset.edge;
        edges[key] = Math.max(0, Math.min(80, edges[key] + Number(btn.dataset.step)));
        setEdges(edges);
        $(`#settingsBody [data-edge-value="${key}"]`).textContent = `${edges[key]}px`;
      })
    );
    const on = (act, fn) => {
      const el = $(`#settingsBody [data-act="${act}"]`);
      if (el) el.addEventListener('click', fn);
    };
    on('connect', () => {
      const id = $('#clientIdInput').value.trim();
      if (!/^[0-9a-f]{32}$/i.test(id)) {
        toast('That does not look like a Client ID (32 letters/numbers).', 'error');
        return;
      }
      setClientId(id);
      beginLogin().catch((e) => toast(e.message, 'error'));
    });
    on('logout', () => {
      logout();
      this.profile = null;
      this.onLogout();
      this.render();
      toast('Spotify disconnected');
    });
    on('devices', () => {
      closeSheet('settingsSheet');
      this.openDevices();
    });
    on('dock', () => {
      closeSheet('settingsSheet');
      this.openDock();
    });
    on('clear-local', async () => {
      const ids = this.player.local.tracks.map((t) => t.id);
      for (const id of ids) await this.player.local.remove(id);
      await idb.clearTracks().catch(() => {});
      this.render();
      toast('Removed all saved songs');
    });
  }

  async openDevices() {
    const body = $('#deviceBody');
    body.innerHTML = '<div class="spinner"></div>';
    openSheet('deviceSheet');
    let devices = [];
    try {
      devices = await spotify.devices();
    } catch (e) {
      body.innerHTML = `<div class="note">${escapeHtml(e.message)}</div>`;
      return;
    }
    const rows = devices
      .map(
        (d, i) => `<button class="row ${d.is_active ? 'is-current' : ''}" data-dev="${i}">
          <div class="row-art" style="display:grid;place-items:center">${deviceIcon(d.type)}</div>
          <div class="row-text"><div class="row-title">${escapeHtml(d.name)}</div><div class="row-sub">${escapeHtml(d.type)}${d.is_active ? ' · playing' : ''}</div></div>
        </button>`
      )
      .join('');
    body.innerHTML = `
      ${rows || '<div class="note">No Spotify devices found.</div>'}
      <div class="note">Don't see this ${DEVICE}? Open the Spotify app here, play any song for a second, then come back.</div>
      <div class="detail-actions" style="justify-content:flex-end">
        <button class="pill" data-act="refresh">Refresh</button>
        <button class="pill pill-spotify" data-act="open-spotify">Open Spotify</button>
      </div>`;
    $$('#deviceBody [data-dev]').forEach((row) =>
      row.addEventListener('click', async () => {
        const d = devices[Number(row.dataset.dev)];
        closeSheet('deviceSheet');
        this.player.useSpotify();
        await this.player.spotify.transferTo(d.id);
        toast(`Playing on ${d.name}`, 'ok');
      })
    );
    $('#deviceBody [data-act="refresh"]').addEventListener('click', () => this.openDevices());
    $('#deviceBody [data-act="open-spotify"]').addEventListener('click', () => {
      window.location.href = 'spotify://';
    });
  }
}

function deviceIcon(type) {
  const t = (type || '').toLowerCase();
  const path = t === 'smartphone' || t === 'tablet'
    ? '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><line x1="11" y1="18" x2="13" y2="18"/>'
    : t === 'speaker'
      ? '<rect x="5" y="2.5" width="14" height="19" rx="2.5"/><circle cx="12" cy="14" r="3.5"/><circle cx="12" cy="7" r="1"/>'
      : '<rect x="2.5" y="4" width="19" height="12" rx="2"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/>';
  return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${path}</svg>`;
}
