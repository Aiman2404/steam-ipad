@echo off
rem Double-click to start DeckOS Link on this laptop.
title DeckOS Link
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)
start "" "http://127.0.0.1:7777/dashboard/"
node link\server.js
pause
