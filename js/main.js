// DeckOS entry point: wires the player to the views and runs the frame loop.

import { $, $$, toast } from './util.js';
import { handleRedirect, isLoggedIn } from './spotify-auth.js';
import { Player } from './player.js';
import { NowPlaying } from './views/now-playing.js';
import { LyricsView } from './views/lyrics-view.js';
import { LibraryView } from './views/library-view.js';
import { QueueView } from './views/queue-view.js';
import { Sliders } from './views/sliders.js';
import { Dock } from './views/dock.js';
import { Settings } from './views/settings.js';
import { getLyrics } from './lyrics.js';
import { spotify } from './spotify-api.js';
import { bindSheets } from './views/sheet.js';
import { Ambient } from './views/ambient.js';

const player = new Player();
const nowPlaying = new NowPlaying(player);
const lyrics = new LyricsView(player);
const queue = new QueueView(player);
const sliders = new Sliders(player);
const ambient = new Ambient(player);
let settings;
const library = new LibraryView(player, { openSettings: (focus) => settings.open(focus) });
const dock = new Dock({ onDeckView: (tab) => showTab(tab) });
settings = new Settings(player, {
  onLogout: () => {
    player.spotify.stop();
    library.onLogin();
    updateChip();
  },
  openDock: () => dock.openEditor(0)
});

bindSheets();

// ---------------- tabs ----------------

let currentTab = 'lyrics';

function moveInk() {
  const active = $(`.tab[data-tab="${currentTab}"]`);
  const ink = $('.tab-ink');
  if (!active || !ink) return;
  ink.style.width = `${active.offsetWidth}px`;
  ink.style.transform = `translate3d(${active.offsetLeft}px,0,0)`;
}

function showTab(tab) {
  if (!['lyrics', 'library', 'queue'].includes(tab)) return;
  currentTab = tab;
  $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === tab));
  $$('.pane').forEach((p) => p.classList.toggle('is-active', p.dataset.pane === tab));
  moveInk();
  if (tab === 'library') library.refresh();
  queue.setVisible(tab === 'queue');
}

$$('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

// ---------------- source chip ----------------

let spotifyStatus = '';

function updateChip() {
  const chip = $('#sourceChip');
  const text = $('#sourceChipText');
  const s = player.state;
  if (s.source === 'local' && s.track) {
    chip.dataset.state = 'live';
    text.textContent = 'On this iPad';
  } else if (!isLoggedIn()) {
    chip.dataset.state = '';
    text.textContent = 'Connect Spotify';
  } else if (spotifyStatus) {
    chip.dataset.state = 'warn';
    text.textContent = spotifyStatus;
  } else if (player.spotify.state.device) {
    chip.dataset.state = 'live';
    text.textContent = `Spotify · ${player.spotify.state.device.name}`;
  } else {
    chip.dataset.state = 'warn';
    text.textContent = 'Spotify · pick a device';
  }
}

$('#sourceChip').addEventListener('click', () => {
  if (isLoggedIn()) settings.openDevices();
  else settings.open('spotify');
});
$('#settingsBtn').addEventListener('click', () => settings.open());

// ---------------- player events ----------------

player.on('track', (track) => {
  nowPlaying.setTrack(track);
  lyrics.setTrack(track);
  library.setCurrent(track);
  queue.invalidate();
  schedulePrefetch(track);
});

// Warm the lyrics cache for the next song so they appear the instant it starts.
let prefetchTimer = null;
function schedulePrefetch(track) {
  clearTimeout(prefetchTimer);
  if (!track) return;
  prefetchTimer = setTimeout(async () => {
    let next = null;
    if (player.state.source === 'local') {
      const local = player.local;
      const pos = local.order.indexOf(local.index);
      const row = local.tracks[local.order[pos + 1]];
      if (row) next = { title: row.title, artist: row.artist, album: row.album, durationMs: row.durationMs };
    } else {
      const q = await spotify.queue().catch(() => null);
      const t = q && q.queue && q.queue[0];
      if (t && t.type !== 'episode') {
        next = {
          title: t.name,
          artist: (t.artists || []).map((a) => a.name).join(', '),
          album: (t.album && t.album.name) || '',
          durationMs: t.duration_ms
        };
      }
    }
    if (next) getLyrics(next).catch(() => {});
  }, 8000);
}

player.on('state', (s) => {
  nowPlaying.setState(s);
  if (s.track) nowPlaying.refreshCover(s.track);
  sliders.setState(s);
  ambient.setState(s);
  updateChip();
});

player.spotify.on('state', updateChip);
player.on('error', (e) => toast(e.message || String(e), 'error'));
player.on('needs-device', () => {
  toast('Pick where Spotify should play', 'error');
  settings.openDevices();
});
player.on('auth-lost', () => {
  toast('Spotify session expired. Connect again in Settings.', 'error');
  library.onLogin();
  updateChip();
});
player.on('status', (msg) => {
  spotifyStatus = msg ? 'Spotify · reconnecting' : '';
  updateChip();
});

// ---------------- frame loop ----------------

function frame() {
  if (player.state.track) {
    const pos = player.positionNow();
    nowPlaying.tick(pos);
    lyrics.tick(pos);
  }
  requestAnimationFrame(frame);
}

// ---------------- clock ----------------

function tickClock() {
  const d = new Date();
  $('#clock').textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---------------- boot ----------------

async function boot() {
  tickClock();
  setInterval(tickClock, 10000);
  showTab('lyrics');
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      moveInk();
      lyrics.measure();
    });
  }
  window.addEventListener('resize', moveInk);

  const redirect = await handleRedirect();
  if (redirect.handled) {
    if (redirect.error) toast(redirect.error, 'error');
    else toast('Spotify connected', 'ok');
  }

  await player.local.load();
  library.refresh();

  if (isLoggedIn()) player.spotify.start();
  else if (!player.local.tracks.length) showTab('library');
  updateChip();
  nowPlaying.setTrack(null);
  lyrics.setTrack(null);

  requestAnimationFrame(frame);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot();
