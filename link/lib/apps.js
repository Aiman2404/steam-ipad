// Laptop apps the deck can open. Admins manage the list in the dashboard;
// members can only launch entries from it, never arbitrary commands.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';

export const DEFAULT_APPS = [
  { name: 'GitHub', target: 'https://github.com/Aiman2404', icon: 'github' },
  { name: 'VS Code', target: 'vscode://', icon: 'code' },
  { name: 'Steam', target: 'steam://open/main', icon: 'steam' },
  { name: 'Discord', target: 'discord://', icon: 'discord' },
  { name: 'Spotify', target: 'spotify:', icon: 'spotify' },
  { name: 'Files', target: process.platform === 'win32' ? 'explorer.exe' : homedir(), icon: 'folder' }
];

const ICONS = ['github', 'code', 'steam', 'discord', 'spotify', 'folder', 'browser', 'game', 'terminal', 'app'];

// Targets are URLs/URI schemes (https://, steam://, spotify:) or a program
// or file path. Reject shell metacharacters outright as a second line of
// defence (we never use a shell, but a path shouldn't need them).
function validTarget(target) {
  const t = String(target || '').trim();
  if (!t || t.length > 400) return null;
  if (/[\r\n"`<>|&^%]/.test(t)) return null;
  return t;
}

export function sanitizeApps(list) {
  if (!Array.isArray(list)) throw new Error('Apps must be a list.');
  if (list.length > 24) throw new Error('At most 24 apps.');
  return list.map((a) => {
    const name = String(a.name || '').trim().slice(0, 30);
    const target = validTarget(a.target);
    if (!name) throw new Error('Every app needs a name.');
    if (!target) throw new Error(`"${name}" has an invalid target.`);
    return {
      id: typeof a.id === 'string' && a.id.length <= 40 ? a.id : randomUUID(),
      name,
      target,
      icon: ICONS.includes(a.icon) ? a.icon : 'app'
    };
  });
}

export function seedApps(store) {
  if (!store.data.apps || !store.data.apps.length) {
    store.data.apps = sanitizeApps(DEFAULT_APPS);
    store.save();
  }
}

// Opens the target with the OS's default handler, without a shell.
export function launch(target) {
  let cmd;
  let args;
  if (process.platform === 'win32') {
    // explorer.exe hands URLs and URI schemes to their registered app and
    // starts programs/files directly.
    cmd = 'explorer.exe';
    args = [target];
  } else if (process.platform === 'darwin') {
    cmd = 'open';
    args = [target];
  } else {
    cmd = 'xdg-open';
    args = [target];
  }
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: false });
  child.on('error', () => {});
  child.unref();
}
