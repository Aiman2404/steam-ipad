// Bottom 5-button hardware dock. Tap launches the app (iOS URL scheme or web
// link, or a deck:lyrics|library|queue view); long-press to reassign.

import { $, $$, escapeHtml, store, toast, onLongPress } from '../util.js';
import { openSheet, closeSheet } from './sheet.js';
import { linkApi, linkIsAdmin } from '../link.js';
import { appIcon } from './laptop-view.js';

const BRANDS = {
  discord: {
    color: '#5865F2',
    sub: 'Voice & Party',
    url: 'discord://',
    svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>'
  },
  steam: {
    color: '#66c0f4',
    sub: 'Remote Play',
    url: 'steamlink://',
    svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-9.95 9.03l5.33 2.2a2.82 2.82 0 0 1 2.57-.47l2.43-3.52a3.77 3.77 0 1 1 3.77 3.77h-.09l-3.46 2.47c0 .19-.02.38-.07.57a2.83 2.83 0 0 1-5.46-.35L3.3 14.18A10 10 0 1 0 12 2zm4.15 7.24a2.51 2.51 0 1 0 0 5.02 2.51 2.51 0 0 0 0-5.02zm-6.4 6.53a1.88 1.88 0 1 0 0 3.76 1.88 1.88 0 0 0 0-3.76z"/></svg>'
  },
  spotify: {
    color: '#1ed760',
    sub: 'Open the app',
    url: 'spotify://',
    svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>'
  },
  moonlight: {
    color: '#c084fc',
    sub: 'PC Host Stream',
    url: 'moonlight://',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
  },
  youtube: {
    color: '#ff4e45',
    sub: 'Video',
    url: 'youtube://',
    svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>'
  },
  github: {
    color: '#e6edf3',
    sub: 'Aiman2404',
    url: 'https://github.com/Aiman2404',
    svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>'
  },
  laptop: {
    color: '#38bdf8',
    sub: 'Screen & apps',
    url: 'deck:laptop',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M1.5 20h21"/></svg>'
  },
  lyrics: {
    color: '#f472b6',
    sub: 'Deck view',
    url: 'deck:lyrics',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h16M4 12h11M4 18h7"/></svg>'
  }
};

// Defaults that work on any device without extra apps installed. (The old
// Steam Link / Moonlight shortcuts did nothing unless those apps were on the iPad.)
const DEFAULT_SLOTS = [
  { name: 'Spotify', sub: 'Open the app', url: 'spotify://' },
  { name: 'Lyrics', sub: 'Deck view', url: 'deck:lyrics' },
  { name: 'Library', sub: 'Deck view', url: 'deck:library' },
  { name: 'Up next', sub: 'Deck view', url: 'deck:queue' },
  { name: 'GitHub', sub: 'Aiman2404', url: 'https://github.com/Aiman2404' }
];

// Colours for dock buttons that come from DeckOS Link.
const LINK_COLORS = {
  github: '#e6edf3', code: '#3b9eff', steam: '#66c0f4', discord: '#5865F2', spotify: '#1ed760',
  folder: '#fbbf24', browser: '#38bdf8', game: '#c084fc', terminal: '#a3e635', app: '#94a3b8',
  lyrics: '#f472b6', library: '#a78bfa', queue: '#2dd4bf', laptop: '#38bdf8'
};

const K_DOCK = 'deckos.dock';

function brandFor(name, url) {
  const s = `${name} ${url}`.toLowerCase();
  if (s.includes('discord')) return BRANDS.discord;
  if (s.includes('steam')) return BRANDS.steam;
  if (s.includes('spotify')) return BRANDS.spotify;
  if (s.includes('moonlight')) return BRANDS.moonlight;
  if (s.includes('youtube')) return BRANDS.youtube;
  if (s.includes('github')) return BRANDS.github;
  if (s.includes('laptop') || s.includes('deck:laptop')) return BRANDS.laptop;
  if (s.includes('lyric') || s.includes('deck:')) return BRANDS.lyrics;
  return null;
}

function loadSlots() {
  const saved = store.get(K_DOCK, null);
  if (Array.isArray(saved) && saved.length === 5) return saved;
  return DEFAULT_SLOTS.map((s) => ({ ...s }));
}

export class Dock {
  constructor({ onDeckView }) {
    this.onDeckView = onDeckView;
    this.slots = loadSlots();
    this.editing = 0;
    this.linkMode = false;
    this.render();
  }

  // Served by DeckOS Link: the five buttons come from the dashboard.
  async useLink() {
    this.linkMode = true;
    await this.refreshLink();
    setInterval(() => this.refreshLink(), 60000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.refreshLink();
    });
  }

  async refreshLink() {
    try {
      const { slots } = await linkApi('/api/dock');
      this.slots = slots.map((s) => ({
        name: s.name,
        sub: s.sub,
        icon: s.icon,
        url: s.kind === 'laptop' ? `laptop:${s.id}` : `deck:${s.view}`
      }));
      this.render();
    } catch (_) {}
  }

  iconFor(slot) {
    if (slot.icon) {
      const views = { lyrics: BRANDS.lyrics.svg, laptop: BRANDS.laptop.svg };
      const svg = views[slot.icon] || appIcon(slot.icon in LINK_COLORS ? slot.icon : 'app');
      return { color: LINK_COLORS[slot.icon] || LINK_COLORS.app, svg };
    }
    const brand = brandFor(slot.name, slot.url);
    if (brand) return { color: brand.color, svg: brand.svg };
    return { color: '#94a3b8', svg: `<span class="glyph">${escapeHtml((slot.name || '?').trim().charAt(0).toUpperCase())}</span>` };
  }

  render() {
    const root = $('#dock');
    root.innerHTML = this.slots
      .map((slot, i) => {
        const { color, svg: icon } = this.iconFor(slot);
        return `
          <button class="zone glass dock-btn" data-slot="${i}" style="--brand:${color}" type="button">
            <span class="halo"></span>
            <span class="dock-slot mono">B${i + 1}</span>
            <span class="dock-icon">${icon}</span>
            <span class="dock-label">
              <span class="dock-name" style="display:block">${escapeHtml(slot.name)}</span>
              <span class="dock-sub"><i></i>${escapeHtml(slot.sub)}</span>
            </span>
          </button>`;
      })
      .join('');
    $$('#dock [data-slot]').forEach((btn) => {
      const i = Number(btn.dataset.slot);
      btn.addEventListener('click', () => this.launch(i));
      onLongPress(btn, () => this.openEditor(i));
    });
  }

  launch(i) {
    const slot = this.slots[i];
    if (!slot || !slot.url) return this.openEditor(i);
    if (slot.url.startsWith('deck:')) {
      this.onDeckView(slot.url.slice(5));
      return;
    }
    if (slot.url.startsWith('laptop:')) {
      linkApi(`/api/apps/${encodeURIComponent(slot.url.slice(7))}/launch`, { method: 'POST' })
        .then(() => toast(`Opening ${slot.name} on the laptop`, 'ok'))
        .catch((e) => toast(e.message, 'error'));
      return;
    }
    toast(`Opening ${slot.name}…`);
    if (/^https?:\/\//i.test(slot.url)) {
      window.open(slot.url, '_blank', 'noopener');
      return;
    }
    // App links (spotify://, discord://…) silently do nothing when the app
    // isn't installed, so say so if we're still here a moment later.
    let left = false;
    const away = () => (left = true);
    window.addEventListener('blur', away, { once: true });
    document.addEventListener('visibilitychange', away, { once: true });
    window.location.href = slot.url;
    setTimeout(() => {
      window.removeEventListener('blur', away);
      document.removeEventListener('visibilitychange', away);
      if (!left && !document.hidden) toast(`Couldn't open ${slot.name}. Is the app installed on this device?`, 'error');
    }, 1800);
  }

  save() {
    store.set(K_DOCK, this.slots);
    this.render();
  }

  openEditor(i = 0) {
    if (this.linkMode) {
      if (linkIsAdmin()) window.open('./dashboard/#dock', '_blank', 'noopener');
      else toast('Admins choose the dock buttons in DeckOS Link', 'info');
      return;
    }
    this.editing = i;
    this.renderEditor();
    openSheet('dockSheet');
  }

  renderEditor() {
    const slot = this.slots[this.editing];
    const presets = [
      { name: 'Steam Link', url: 'steamlink://' },
      { name: 'Discord', url: 'discord://' },
      { name: 'Spotify', url: 'spotify://' },
      { name: 'Moonlight', url: 'moonlight://' },
      { name: 'YouTube', url: 'youtube://' },
      { name: 'GitHub', url: 'https://github.com/Aiman2404' },
      { name: 'Lyrics', url: 'deck:lyrics' },
      { name: 'Library', url: 'deck:library' },
      { name: 'Laptop', url: 'deck:laptop' }
    ];
    $('#dockBody').innerHTML = `
      <p class="row-sub" style="margin:0 0 12px">Tip: long-press any dock button to edit it.</p>
      <div class="slot-tabs">
        ${this.slots.map((s, i) => `<button class="slot-tab ${i === this.editing ? 'is-active' : ''}" data-tab="${i}">B${i + 1} · ${escapeHtml(s.name)}</button>`).join('')}
      </div>
      <div class="group">
        <span class="label" style="margin-top:0">Quick presets</span>
        <div class="presets">
          ${presets.map((p, i) => `<button class="pill" data-preset="${i}">${escapeHtml(p.name)}</button>`).join('')}
        </div>
        <span class="label">Name</span>
        <input class="input" id="slotName" value="${escapeHtml(slot.name)}" style="width:100%" />
        <span class="label">Subtitle</span>
        <input class="input" id="slotSub" value="${escapeHtml(slot.sub)}" style="width:100%" />
        <span class="label">Opens (iOS app link, web URL, or deck:lyrics / deck:library / deck:queue / deck:laptop)</span>
        <input class="input mono" id="slotUrl" value="${escapeHtml(slot.url)}" style="width:100%" autocapitalize="off" autocorrect="off" />
      </div>
      <div class="sheet-actions">
        <button class="pill" data-act="reset">Reset all</button>
        <button class="pill pill-accent" data-act="save">Save B${this.editing + 1}</button>
      </div>`;

    $$('#dockBody [data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        this.editing = Number(b.dataset.tab);
        this.renderEditor();
      })
    );
    $$('#dockBody [data-preset]').forEach((b) =>
      b.addEventListener('click', () => {
        const p = presets[Number(b.dataset.preset)];
        const brand = brandFor(p.name, p.url);
        $('#slotName').value = p.name;
        $('#slotSub').value = brand ? brand.sub : '';
        $('#slotUrl').value = p.url;
      })
    );
    $('#dockBody [data-act="save"]').addEventListener('click', () => {
      this.slots[this.editing] = {
        name: $('#slotName').value.trim() || `App ${this.editing + 1}`,
        sub: $('#slotSub').value.trim(),
        url: $('#slotUrl').value.trim()
      };
      this.save();
      closeSheet('dockSheet');
      toast(`B${this.editing + 1} → ${this.slots[this.editing].name}`, 'ok');
    });
    $('#dockBody [data-act="reset"]').addEventListener('click', () => {
      this.slots = DEFAULT_SLOTS.map((s) => ({ ...s }));
      this.save();
      this.renderEditor();
      toast('Dock reset', 'ok');
    });
  }
}
