'use strict';
// Regression probe added during DA-FACTORY-WAKE-RECOVERY-20261124T11Z.
// package.json declares "main": "index.js" but the repository does not contain
// that file, so `require('ambush-previews')` fails. This probe records the
// current truth instead of asserting a fixed state: it passes only when the
// entrypoint actually exists, so it is red until the entrypoint is restored.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('declared package entrypoint exists on disk', () => {
  const main = pkg.main || 'index.js';
  const entry = path.join(root, main);
  assert.ok(
    fs.existsSync(entry),
    `MISSING_ENTRYPOINT: package.json main="${main}" but ${main} is absent from the repository`
  );
});

test('repository exposes at least one preview html or asset manifest', () => {
  const candidates = ['previews', 'outreach-preview', 'assets', 'public'];
  const present = candidates.filter((d) => fs.existsSync(path.join(root, d)));
  assert.ok(
    present.length > 0,
    `NO_PREVIEW_SURFACE: none of ${candidates.join(', ')} exist at repository root`
  );
});
