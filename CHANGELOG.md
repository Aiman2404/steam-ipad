# Changelog

All notable changes to DeckOS. Versions follow [semantic versioning](https://semver.org).

## v1.1.0 (2026-10-28)

A fresh look, plus fixes.

### New
- **New logo.** A coral-to-periwinkle "D" that is also the deck, with the SOUND and DISPLAY sliders inside it. It's on the home screen icon, the deck's top bar, the Link dashboard and the Windows tray app.
- **Brand colours.** The deck and dashboard start in coral and periwinkle. Album covers still re-tint everything while music plays.
- **DISPLAY slider controls the laptop.** In the deck served by DeckOS Link, it sets the laptop's real screen brightness.
- **Version number** in Settings → About and on the Link dashboard.
- **New README front page** with a screenshot and a short pitch.

### Fixed
- **Laptop tab no longer fills the iPad's storage.** The offline cache was saving every laptop screen frame, Spotify tokens and the signed-in state. Link's `/api` is never cached now.
- **Tapping a playlist opens the right one.** Before, rows could point at the wrong playlist, and tapping the last row did nothing.
- **Search shows the newest results.** A slow search can no longer overwrite a newer one or come back after you clear the box.
- **Seek knob stays on the bar** on bigger iPads after you drag it.
- **Lyrics loading is clean.** The last song's "No lyrics" message no longer hangs around while the next song loads.
- **Logging out of Spotify** no longer brings the last song back on screen.
- **DeckOS Link doesn't crash** when Windows briefly locks its data file (antivirus, OneDrive), or when the screen helper restarts.
- **Link works even if another app on your laptop sets a strange cookie.** Before, that turned every request, including sign-in, into an error.
- The laptop screen stream's headers are valid now.

### Changed
- The service worker cache was bumped, so iPads pick up the new icon and colours on the next launch. If the old icon stays on your Home Screen, remove it and add DeckOS again (iOS caches home-screen icons).

## v1.0.0 (2026-10-26)

First public release: the music deck, synced lyrics, sliders and dock, DeckOS Link with accounts, laptop screen streaming and remote control, the one-click Windows tray app, and the safety defaults (home network only, owner setup on the laptop only).
