# SteamOS Cyber-Deck — iPad Air 2 Edition

[![Live Cyber-Deck App](https://img.shields.io/badge/Live%20Cyber--Deck-aiman2404.github.io%2Fsteam--ipad-00e5ff?style=for-the-badge&logo=github)](https://aiman2404.github.io/steam-ipad/)
[![GitHub Actions CI/CD](https://img.shields.io/badge/Deploy-GitHub%20Pages-1db954?style=for-the-badge&logo=githubactions)](https://github.com/Aiman2404/steam-ipad/actions)

A single-file, fully offline-capable **SteamOS / Steam Deck–inspired web dashboard** built for the **iPad Air 2** locked in landscape mode. Designed to sit inside a custom 3D-printed bezel that replicates the Steam Deck's hardware trench aesthetics on a 9.7-inch tablet.

🌐 **Live URL (Always-On, no laptop needed):** [https://aiman2404.github.io/steam-ipad/](https://aiman2404.github.io/steam-ipad/)

---

## 📐 3D-Printed iPad Air 2 Bezel Concept

The UI is engineered around the **iPad Air 2 (9.7-inch, 4:3 aspect ratio)** locked at `100vw × 100vh` in landscape orientation.

The layout is divided into three hardware zones separated by **10 px deep trench gutters** — visually simulating the recessed moat between button banks on 3D-printed PLA/PETG enclosures:

```
┌─────────────────────────────────────────┬──────────┐
│                                         │  SOUND   │
│        MEDIA & SPOTIFY DECK (80%)       │ SLIDER 1 │  76% Height
│   Visualizer · Lyrics · Embed Tabs      │────────  │
│   Library Drawer · Transport Controls   │  BRIGHT  │
│                                         │ SLIDER 2 │
├──────────┬──────────┬──────────┬────────┴──────────┤
│  BTN 1   │  BTN 2   │  BTN 3   │  BTN 4   │ BTN 5  │  24% Height
│ SteamLnk │ Discord  │ Spotify  │  Lyrics  │ GitHub │
└──────────┴──────────┴──────────┴──────────┴────────┘
```

### Print Notes
- **Material:** PLA+ or PETG (matte black recommended for carbon-fiber look)
- **Trench depth:** 10 mm recessed moats between button zones
- **Button cutouts:** 5 × tactile mechanical-switch bays (24% height strip)
- **Slider channels:** 2 × vertical capacitive-touch rails (right 20% strip)
- **iPad mount:** Landscape-locked friction-fit recess with USB-C passthrough slot

---

## ✨ Features

### 🎵 Main Media & Spotify Deck (80% width, 76% height)
- **SteamOS Status Bar** — DeckOS logo, live clock, 3D Print bezel grid toggle
- **HTML5 Canvas Frequency Visualizer** — real Web Audio API FFT spectrum bars (cyan → green gradient)
- **Album Art** with ambient radial glow that changes color per track
- **Tab 1 — Visualizer Deck:** Transport controls (play/pause, prev, next, seek, shuffle, like)
- **Tab 2 — Lyrics / Subtitles:** Synced scrolling lyric lines per track
- **Tab 3 — Spotify Embed:** Official Spotify iframe playlist player (no API key needed) with preset switcher (RapCaviar, Mint Electronic) and custom URL loader
- **Library Drawer:** 4 built-in procedural synth tracks playable fully offline

### 🎚️ Vertical Sliders Zone (20% width, 76% height)
- **Slider 1 — Sound:** Touch-drag bottom-to-top fill, controls real Web Audio API `GainNode` volume (0–100%)
- **Slider 2 — Display:** Touch-drag bottom-to-top fill, controls full-viewport black overlay opacity (15–100% brightness simulation)

### 🕹️ Bottom 5-Button Hardware Dock (100% width, 24% height)
- 5 large tactile-style buttons with brand glow accents
- **Right-click or tap B✎** on any button to open the **Assign 5 Buttons** modal
- Type an app name (Discord, Steam Link, Spotify, Moonlight, YouTube, GitHub) → icon and iOS URL scheme auto-assigned
- Configs saved to **localStorage** — persists across sessions
- Dock buttons that target `deck:` views switch tabs in-app instead of navigating away

---

## 🚀 Getting Started

No build tools, no npm, no dependencies to install.

1. Open `index.html` directly in Safari on iPad (or any modern browser)
2. **Add to Home Screen** via Safari share menu → full-screen PWA-style app
3. Enable **Guided Access** on iPad to lock to landscape and disable home button

```bash
# Or serve locally for development:
npx serve .
# Then open http://localhost:3000 in iPad Safari
```

---

## 🌐 Spotify Integration

| Mode | Requirement |
|------|-------------|
| Embedded Playlist | None — paste any `open.spotify.com` link |
| Live "Currently Playing" Sync | Spotify Developer OAuth Bearer Token (optional) |

---

## 🗂️ Project Structure

```
steam-ipad/
├── index.html     # Single-file app — all HTML, CSS, and JS inline
└── README.md      # This file
```

---

## 🔧 Customization

All CSS variables are at the top of `index.html`:

```css
:root {
  --trench-size: 10px;       /* Bezel gutter width */
  --steam-bg:   #080a0e;     /* Main background */
  --panel-bg:   #11151d;     /* Panel surface */
  --steam-cyan: #00e5ff;     /* Accent cyan */
  --spotify-green: #1db954;  /* Spotify green */
}
```

---

## 📦 Tech Stack

| Layer | Technology |
|-------|-----------|
| Layout | CSS Grid + Flexbox, Tailwind CDN |
| Audio Engine | Web Audio API (`OscillatorNode`, `GainNode`, `AnalyserNode`) |
| Visualizer | HTML5 Canvas 2D, `requestAnimationFrame` |
| Typography | Inter + JetBrains Mono (Google Fonts) |
| State | `localStorage` (dock button assignments) |
| Streaming | Official Spotify Embed iframe |

---

*Built for the [esp-oled-bot](https://github.com/Aiman2404/esp-oled-bot) project ecosystem — hardware meets software on a custom 3D-printed iPad Air 2 Steam Deck cyber-deck.*
