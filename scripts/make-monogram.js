#!/usr/bin/env node
/**
 * make-monogram.js — deterministic brand monogram for a prospect page.
 *
 * The Golden Master ships the Simplicity logo twice (header + footer). A
 * prospect must never carry someone else's mark, so the compiler replaces both
 * slots with a neutral monogram generated from the prospect's own initials.
 *
 * No network, no fonts other than DejaVu Sans Bold (shipped with ImageMagick).
 * Same initials + same palette => byte-identical PNG.
 *
 * Usage: node scripts/make-monogram.js --name "CHEEK ELECTRICAL" --primary #0b1329 \
 *          --accent #f59e0b --out <dir>/favicon.png
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { resolveMagick } = require('./imagick.js');

function isIm7(bin) { return /magick(\.exe)?$/i.test(path.basename(bin)); }

function initialsFrom(name) {
  const STOP = new Set(['LTD', 'LIMITED', 'THE', 'AND', '&', 'PLC', 'UK', 'LLP', 'CO']);
  const words = String(name)
    .toUpperCase()
    .replace(/[^A-Z0-9\s&]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));
  if (!words.length) return 'NA';
  if (words.length === 1) return words[0].slice(0, 2);
  return (words[0][0] + words[1][0]).toUpperCase();
}

function main() {
  const argv = process.argv.slice(2);
  const get = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const name = get('--name', '');
  const primary = get('--primary', '#0b1329');
  const accent = get('--accent', '#f59e0b');
  const out = get('--out', null);
  if (!name || !out) {
    console.error('usage: make-monogram.js --name "BUSINESS NAME" --out favicon.png [--primary #hex] [--accent #hex]');
    process.exit(4);
  }
  const ini = initialsFrom(name);
  const bin = resolveMagick();
  const size = 256;

  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const common = [
    '-size', `${size}x${size}`, 'xc:' + primary,
    '-fill', accent,
    '-draw', `roundrectangle 18,18,${size - 18},${size - 18},44,44`,
    '-fill', '#ffffff',
    '-font', 'DejaVu-Sans-Bold',
    '-pointsize', '86',
    '-gravity', 'center',
    '-annotate', '+0+6', ini,
  ];

  try {
    if (isIm7(bin)) execFileSync(bin, ['convert', ...common, out], { timeout: 60000 });
    else execFileSync(bin, common.concat([out]), { timeout: 60000 });
  } catch (e) {
    console.error('MONOGRAM_FAILED: ' + String(e.message || e).slice(0, 300));
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, initials: ini, out, primary, accent }));
}

main();
