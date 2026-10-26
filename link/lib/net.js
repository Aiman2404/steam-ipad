// Network rules for DeckOS Link. Link is a home-network app: it can see the
// laptop screen and, for admins, drive the mouse and keyboard. So it only
// answers devices on private networks, and only under addresses a browser
// can't be tricked into using by another website (DNS rebinding).

import { hostname } from 'node:os';

const v4 = (ip) => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n <= 255) ? parts : null;
};

const unmap = (ip) => String(ip || '').toLowerCase().replace(/^::ffff:/, '');

export function isLoopbackAddress(ip) {
  const a = unmap(ip);
  if (a === '::1') return true;
  const p = v4(a);
  return !!p && p[0] === 127;
}

// Loopback, home/office LAN ranges, link-local, and 100.64.0.0/10 (carrier
// NAT, also what Tailscale uses for devices you own).
export function isPrivateAddress(ip) {
  const a = unmap(ip);
  if (isLoopbackAddress(a)) return true;
  const p = v4(a);
  if (p) {
    return (
      p[0] === 10 ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127)
    );
  }
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
  return /^f[cd][0-9a-f]{2}:/.test(a) || /^fe[89ab][0-9a-f]:/.test(a);
}

// The Host header must be an IP address, localhost, this laptop's name, a
// .local/.lan/.home name or a Tailscale name, or one listed in DECKOS_HOSTS.
// A rebinding attack always arrives with the attacker's own domain here.
export function isAllowedHost(hostHeader, extra = []) {
  let h = String(hostHeader || '').trim().toLowerCase();
  if (!h) return false;
  if (h.startsWith('[')) return /^\[[0-9a-f:.]+\](:\d+)?$/.test(h);
  h = h.replace(/:\d+$/, '').replace(/\.$/, '');
  if (v4(h) || h === 'localhost') return true;
  const me = hostname().toLowerCase();
  if (h === me || /\.(local|lan|home|home\.arpa|ts\.net)$/.test(h) || h.startsWith(`${me}.`)) return true;
  return extra.map((x) => x.trim().toLowerCase()).filter(Boolean).includes(h);
}
