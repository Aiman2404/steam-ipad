# DeckOS — Steam Deck–style dashboard for iPad Air 2

[![Live](https://img.shields.io/badge/Live-aiman2404.github.io%2Fsteam--ipad-38bdf8?style=for-the-badge&logo=github)](https://aiman2404.github.io/steam-ipad/)
[![Deploy](https://img.shields.io/badge/Deploy-GitHub%20Pages-a855f7?style=for-the-badge&logo=githubactions)](https://github.com/Aiman2404/steam-ipad/actions)

A landscape web app for an **iPad Air 2** mounted in a custom 3D-printed Steam Deck–style bezel. It's a music deck with synced lyrics, two hardware-style sliders and five launcher buttons, in an "Aurora Glass" design that re-tints itself to the album cover of whatever is playing.

**Live:** https://aiman2404.github.io/steam-ipad/

---

## What it does

### 🎵 Music deck
- **Spotify, full-length.** Spotify plays the music (in the Spotify app on the iPad, or any Spotify Connect speaker/PC) and DeckOS is the remote and display: play/pause, next/previous, seek, shuffle, repeat, volume, and picking the device.
- **Your real library.** Your playlists, Liked Songs and Spotify search. Tap any song to play from there.
- **Songs on this iPad.** Add MP3/M4A files from the Files app or iCloud Drive. They're stored on the iPad (IndexedDB), survive restarts, play in full offline, and show the title, artist and **embedded cover art** read from the file's tags.
- **Synced lyrics.** Fetched from [LRCLIB](https://lrclib.net), matched on title, artist, album and the **exact track length**, so the timing fits the version you're hearing. The current line is tracked every frame, with a karaoke-style sweep (word by word when LRCLIB has word timing). Tap a line to jump there. Use the **− / +** nudge to shift timing for one song.
- **Up next.** Shows Spotify's real queue, or the upcoming iPad songs.
- **Living theme.** Accent colours, the aurora and the blurred backdrop all come from the current cover.

### 🎚️ Sliders
- **SOUND:** the real output volume. That's the Spotify device volume, or the audio gain for iPad songs. (iOS ignores the usual web volume control, so this goes through Web Audio.)
- **DISPLAY:** dims the screen with an overlay. Web pages can't change the iPad's real brightness.

### 🕹️ Dock
Five launcher buttons. Tap to open an app (`steamlink://`, `discord://`, `spotify://`, `moonlight://`, `youtube://`, any web link) or a deck view (`deck:lyrics`, `deck:library`, `deck:queue`). **Long-press** a button to change it.

---

## Spotify setup (one time, ~2 minutes)

Spotify doesn't let websites stream full songs on iPad. DeckOS controls the official Spotify app instead, which needs a free Spotify developer app of your own:

1. Go to **https://developer.spotify.com/dashboard** and log in. The account must have **Premium**: Spotify requires it for apps in Development Mode and for playback control.
2. **Create app.** Use any name and description. Set the **Redirect URI** to exactly
   `https://aiman2404.github.io/steam-ipad/`
   (DeckOS → Settings shows the exact value for wherever you host it), tick **Web API**, and Save.
3. Copy the **Client ID** from the app's settings.
4. On the iPad, open DeckOS → ⚙️ **Settings**, paste the Client ID, then tap **Connect** and log in.
5. Open the Spotify app on the iPad and play anything once so it appears as a device. After that, DeckOS can start, switch and control playback by itself.

Development-mode apps allow up to 5 Spotify accounts. Add extra ones under *User Management* in the dashboard.

---

## 💻 DeckOS Link: laptop dashboard, accounts and laptop screen

DeckOS Link is a small server you run on your laptop. Nothing to install except [Node.js](https://nodejs.org) (LTS). It gives you:

- **A login dashboard** with accounts. The first account is the **owner**. **Admins** control everything: people, laptop apps, the screen, remote mouse/keyboard and the Spotify link. **Members** use the deck: music, lyrics, opening laptop apps, watching the laptop screen and its media keys.
- **The laptop screen on the deck** (Laptop tab). Admins can turn on **Control**: tap to click, hold to right-click, drag, two fingers to scroll, plus a keyboard, shortcut keys and copy/paste.
- **Laptop apps on the deck:** one-tap GitHub, VS Code, Steam, Discord, Spotify, Files, or anything an admin adds.
- **One shared Spotify link.** Link your Premium account once on the laptop and everyone signed in can use it.

### Start it

1. Install Node.js LTS on the laptop.
2. Double-click **`link\start.cmd`** (or run `node link/server.js`). Allow it on **Private networks** when Windows Firewall asks.
3. The dashboard opens at `http://127.0.0.1:7777/dashboard/`. Create the **owner** account.
4. **People:** add family/friends as members or admins.
5. **Spotify:** in your Spotify developer app add the Redirect URI `http://127.0.0.1:7777/api/spotify/callback`, paste the Client ID, press **Link Spotify**.
6. **Overview** shows the deck address (like `http://192.168.1.25:7777/`) with a QR code. Open it on the iPad (same Wi-Fi), sign in, and **Add to Home Screen**.

The iPad and laptop must be on the same Wi-Fi, and Link must be running for the Laptop tab. Screen sharing and remote control need Windows; accounts, apps and Spotify also work on macOS/Linux. Accounts and tokens are stored in `link/data/` on the laptop (never committed).

> The GitHub Pages deck still works on its own with no laptop and no login. The Link deck is a second home-screen app that adds accounts and the laptop.

---

## Any screen

The deck measures the real screen and scales itself to fit: iPad Air 2, iPad 9, iPad Pro, Samsung and other Android tablets, and phones. In portrait the player sits above the lyrics and the sliders turn horizontal. If something is still hidden behind a status bar or the printed bezel, nudge it in Settings → **Screen edges**.

---

## iPad install

1. Open the live URL in **Safari** → Share → **Add to Home Screen**. It launches full-screen and works offline.
2. Settings → Display & Brightness → Auto-Lock → **Never**, so the deck stays on in the bezel.
3. Optional: Settings → Accessibility → **Guided Access** to lock the iPad to DeckOS.
4. iPad songs play through Web Audio. If they're silent, check that the iPad isn't muted (side switch / Control Center).

---

## Project structure

```
index.html                   markup for the three bezel zones
css/deck.css                 Aurora Glass design (no framework, Safari 15-safe)
js/main.js                   wiring + animation-frame loop
js/player.js                 one controller over both sources
js/sources/spotify-source.js Spotify Connect control + smooth position clock
js/sources/local-source.js   on-iPad songs (IndexedDB, Web Audio gain, Media Session)
js/spotify-auth.js           PKCE login (no secret, no server)
js/spotify-api.js            Web API client (token refresh, rate-limit backoff)
js/lyrics.js                 LRCLIB lookup + LRC / word-sync parser
js/tags.js                   ID3 / MP4 tag + cover art reader
js/palette.js                album-cover colour extraction
js/fit.js                    fits the deck to any screen (safe areas, portrait, phones)
js/link.js                   talks to DeckOS Link when served by the laptop
js/views/*                   now playing, lyrics, library, queue, laptop, sliders, dock, settings
sw.js                        network-first service worker (offline shell)
link/server.js               DeckOS Link server (zero dependencies)
link/lib/                    accounts, store, Spotify link, app launcher, Windows helper
link/dashboard/              the Link dashboard
tests/                       node --test suites (npm test)
```

No build step. Any static host works; GitHub Pages deploys `main` automatically.

```bash
# local development (ES modules need http://, not file://)
python -m http.server 8000
```

To run Spotify against a local server, add `http://127.0.0.1:8000/` as a second Redirect URI in your Spotify app.

---

## Layout reference for the printed bezel

```
┌─────────────────────────────────────────┬────┬────┐
│                                         │SND │DISP│
│      MEDIA DECK (80% w)                 │    │    │  76% h
│  cover · title · transport | lyrics /   │    │    │
│  library / up next                      │    │    │
├────────┬────────┬────────┬────────┬─────┴────┴────┤
│  B1    │  B2    │  B3    │  B4    │      B5       │  24% h
└────────┴────────┴────────┴────────┴───────────────┘
            10px trench gutters between all zones
```

Settings → **3D-print bezel guides** outlines every zone for test-fitting the frame.

---

*Part of the [esp-oled-bot](https://github.com/Aiman2404/esp-oled-bot) hardware ecosystem.*
