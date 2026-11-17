#!/usr/bin/env node
/**
 * NEO image-tool resolver — portable ImageMagick invocation.
 *
 * WHY THIS EXISTS (bug found 2026-11-17 on the Windows host):
 *   gate2.js / vet-hero.js / source-hero.js all called execFileSync('convert', ...).
 *   On Windows, `convert` resolves to C:\WINDOWS\system32\convert.exe — the
 *   NTFS/FAT disk-conversion utility, NOT ImageMagick. It rejects `-crop` with
 *   "Invalid Parameter", so every hero luminance measurement on that host was
 *   erroring out. ImageMagick was not installed at all.
 *
 *   On POSIX, ImageMagick 7 also ships `magick` and *discourages* `convert`.
 *
 * This module prefers `magick` (IM7, cross-platform) and falls back to
 * `convert` (IM6 / POSIX), and additionally probes the standard Windows
 * install location so a not-yet-refreshed PATH does not break a gate run.
 *
 * API:
 *   imageTool('convert')  -> path or binary name for the convert operation
 *   imageTool('identify') -> path or binary name for the identify operation
 *   runConvert(args)      -> execFileSync wrapper
 *   runIdentify(args)     -> execFileSync wrapper
 *   assertImageTooling()  -> throws a clear, actionable error if unusable
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const isWin = process.platform === 'win32';

const WIN_GLOBS = [
  'C:\\Program Files\\ImageMagick-7.1.2-Q16-HDRI',
  'C:\\Program Files\\ImageMagick-7.1.1-Q16-HDRI',
  'C:\\Program Files\\ImageMagick-7.1.0-Q16-HDRI',
];

let cachedMagick = null;
let probed = false;

function findWinMagick() {
  // Newest first: enumerate any ImageMagick-* install dir.
  const roots = ['C:\\Program Files', 'C:\\Program Files (x86)'];
  const found = [];
  for (const root of roots) {
    let entries = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory() || !/^ImageMagick/i.test(e.name)) continue;
      const exe = path.join(root, e.name, 'magick.exe');
      if (fs.existsSync(exe)) found.push(exe);
    }
  }
  if (found.length) {
    // Sort descending so the highest version wins.
    found.sort().reverse();
    return found[0];
  }
  for (const p of WIN_GLOBS) {
    const exe = path.join(p, 'magick.exe');
    if (fs.existsSync(exe)) return exe;
  }
  return null;
}

function resolveMagick() {
  if (probed) return cachedMagick;
  probed = true;
  // 1) `magick` on PATH (IM7 everywhere).
  try {
    execFileSync(isWin ? 'where' : 'which', ['magick'], { stdio: 'ignore' });
    cachedMagick = 'magick';
    return cachedMagick;
  } catch {
    /* keep probing */
  }
  // 2) Standard Windows install dir (PATH may not be refreshed yet).
  if (isWin) {
    const exe = findWinMagick();
    if (exe) {
      cachedMagick = exe;
      return cachedMagick;
    }
  }
  // 3) POSIX IM6 `convert`.
  if (!isWin) {
    try {
      execFileSync('which', ['convert'], { stdio: 'ignore' });
      cachedMagick = 'convert';
      return cachedMagick;
    } catch {
      /* fall through */
    }
  }
  cachedMagick = null;
  return cachedMagick;
}

/**
 * Returns the argument vector prefix for a given ImageMagick subcommand.
 * On IM7 a single `magick` binary fronts everything; `magick identify` is the
 * identify form, while `magick -format ... info:` covers convert usage directly,
 * so convert needs no extra subcommand token.
 */
function argvFor(op, args) {
  const bin = resolveMagick();
  if (!bin) {
    throw new Error(
      'ImageMagick not found. gate2.js and vet-hero.js cannot measure hero ' +
        'luminance without it.\n' +
        (isWin
          ? 'Install it with:  winget install --id ImageMagick.ImageMagick'
          : 'Install it with:  sudo apt-get install -y imagemagick')
    );
  }
  const isMagickBin = path.basename(bin).toLowerCase().startsWith('magick');
  if (isMagickBin) {
    // `magick identify` for identify; plain `magick` for convert semantics.
    return op === 'identify' ? [bin, 'identify', ...args] : [bin, ...args];
  }
  // Legacy `convert` / `identify` binaries.
  return [op === 'identify' ? 'identify' : bin, ...args];
}

function run(op, args) {
  const [bin, ...rest] = argvFor(op, args);
  return execFileSync(bin, rest, { encoding: 'utf8', windowsHide: true });
}

const runConvert = (args) => run('convert', args);
const runIdentify = (args) => run('identify', args);

/** Throws a clear error if the gate cannot do image work on this host. */
function assertImageTooling() {
  const bin = resolveMagick();
  if (!bin) {
    throw new Error(
      'ImageMagick missing — refusing to run a gate that cannot measure images.\n' +
        (isWin
          ? 'Fix: winget install --id ImageMagick.ImageMagick'
          : 'Fix: sudo apt-get install -y imagemagick')
    );
  }
  // Prove it can actually do the operation the gate needs.
  let out;
  try {
    out = run('convert', ['-size', '10x10', 'xc:white', '-colorspace', 'gray', '-format', '%[fx:mean*255]', 'info:']);
  } catch (e) {
    throw new Error(`ImageMagick at "${bin}" is present but cannot execute: ${e.message}`);
  }
  const v = parseFloat(out);
  if (!Number.isFinite(v)) {
    throw new Error(`ImageMagick at "${bin}" returned a non-numeric pixel probe: "${out.trim()}"`);
  }
  return { bin, probe: v };
}

module.exports = { resolveMagick, runConvert, runIdentify, assertImageTooling, isWin };
