# Security

## Reporting a problem

Please **don't open a public issue** for security problems. Use
[**Report a vulnerability**](https://github.com/Aiman2404/steam-ipad/security/advisories/new)
(GitHub's private reporting) instead. You'll get a reply as soon as possible,
and the fix will credit you unless you'd rather stay anonymous.

Only the latest version on `main` gets fixes.

## How DeckOS keeps you safe

**The deck (the web page)** has no server and no database. Your settings,
songs and Spotify login stay on your own iPad. Spotify sign-in uses PKCE, so
there is no secret in the code. Lyrics come from LRCLIB.

**DeckOS Link (the laptop app)** is built for your home network:

- It only answers devices on private networks (home Wi-Fi, `10.x`, `172.16-31.x`,
  `192.168.x`, Tailscale `100.64.x`). Requests from the internet are refused.
- It refuses requests addressed to a foreign domain name, which blocks
  "DNS rebinding" attacks from websites you visit.
- The owner account can only be created on the laptop itself.
- Passwords are stored as salted scrypt hashes; sessions are random tokens
  stored hashed, in `HttpOnly`, `SameSite=Strict` cookies.
- Sign-in is rate-limited per device, and state-changing requests need a
  custom header (blocks cross-site request forgery).
- Members can only open apps from the admin's list, never run commands.
  Mouse/keyboard control is admins only.
- Accounts and tokens live in `link/data/` on the laptop and are never committed.
- No third-party packages: nothing to be hijacked in a supply-chain attack.

## Using it safely

- **Never port-forward 7777 on your router.** Link shows your laptop screen and
  lets admins control it. For access away from home, use
  [Tailscale](https://tailscale.com) (free) instead.
- Only make people you fully trust **admins**: an admin can control the laptop.
- Link uses plain `http` on your home Wi-Fi. Don't run it on public or shared
  Wi-Fi (cafés, hotels, school networks).
