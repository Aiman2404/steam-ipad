#!/bin/sh
# DeckOS Link for macOS and Linux: double-click (macOS) or run ./link/start.command.
# Screen sharing needs Windows; accounts, laptop apps and Spotify work here too.
cd "$(dirname "$0")/.." || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "DeckOS Link needs Node.js. Get the LTS version from https://nodejs.org and run this again."
  (open https://nodejs.org/en/download || xdg-open https://nodejs.org/en/download) >/dev/null 2>&1
  read -r _
  exit 1
fi
(sleep 2; open http://127.0.0.1:7777/dashboard/ || xdg-open http://127.0.0.1:7777/dashboard/) >/dev/null 2>&1 &
node link/server.js
