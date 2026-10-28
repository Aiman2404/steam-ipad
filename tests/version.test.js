// The deck's Settings and the Link dashboard show different copies of the
// version number; make sure a release never ships with them out of step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VERSION } from '../js/version.js';

test('js/version.js matches package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(VERSION, pkg.version);
});

test('CHANGELOG has an entry for this version', () => {
  const log = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  const headings = log.split(/\r?\n/).filter((line) => line.startsWith('## '));
  assert.ok(
    headings.some((h) => h === `## v${VERSION}` || h.startsWith(`## v${VERSION} `)),
    `no "## v${VERSION}" heading in CHANGELOG.md`
  );
});
