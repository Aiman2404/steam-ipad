// Tiny JSON-file database for DeckOS Link. Everything lives in
// link/data/link.json on the laptop (git-ignored). Writes are atomic
// (temp file + rename) and serialized so a crash can't corrupt the file.

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const EMPTY = {
  version: 1,
  users: [],
  sessions: [],
  apps: [],
  spotify: { clientId: '', refreshToken: '', accessToken: '', expiresAt: 0, account: '' },
  settings: { name: 'DeckOS Link' }
};

export class Store {
  constructor(file) {
    this.file = file;
    this.data = structuredClone(EMPTY);
    this.writing = false;
    this.dirty = false;
    if (existsSync(file)) {
      try {
        this.data = { ...structuredClone(EMPTY), ...JSON.parse(readFileSync(file, 'utf8')) };
      } catch (e) {
        throw new Error(`Could not read ${file}: ${e.message}. Fix or delete it to start fresh.`);
      }
    }
  }

  // Debounced, atomic save.
  save() {
    this.dirty = true;
    if (this.writing) return;
    this.writing = true;
    setImmediate(() => {
      try {
        while (this.dirty) {
          this.dirty = false;
          mkdirSync(dirname(this.file), { recursive: true });
          const tmp = `${this.file}.tmp`;
          writeFileSync(tmp, JSON.stringify(this.data, null, 2));
          renameSync(tmp, this.file);
        }
      } finally {
        this.writing = false;
      }
    });
  }

  // Synchronous save for shutdown.
  flush() {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }
}
