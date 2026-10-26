@echo off
rem DeckOS Link: double-click to run it in the background (tray icon next to the clock)
rem and open the dashboard, where your iPad connects by QR code.
start "" powershell.exe -NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0link\app\DeckOS-Link.ps1"
