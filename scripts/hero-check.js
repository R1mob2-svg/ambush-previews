#!/usr/bin/env node
/**
 * hero-check.js — replicate gate2's hero composition maths on a raw photo.
 *
 * gate2 measures the hero PHOTO rendered through background-size:cover at a
 * 1440px viewport with background-position 100% 30%, sampling a tall strip at
 * fractional x positions (0.62 / 0.75 / 0.87) and ten full-height bands.
 *
 * Doing the same thing up-front means the compiler can put a photo in the hero
 * slot that will actually pass, instead of building a page and losing it at the
 * gate. Uses ImageMagick only for decoding: converts the crop gate2 would show
 * to a small raw PGM and computes the same luminance numbers.
 *
 * Usage: node scripts/hero-check.js <photo.jpg>
 * Output (JSON): {ok, peak, floor, textBand, contrast, textOk, width, height}
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { resolveMagick } = require('./imagick.js');

const VP_W = 1440;
const VP_H = 640;
const SAMPLE_TOP = 20;
const BG_POS_X = 1.0;   // 100%
const BG_POS_Y = 0.30;  // 30%

function magickBin() {
  try {
    if (typeof resolveMagick === 'function') return resolveMagick();
  } catch (e) { /* fall through */ }
  return 'magick';
}

// IM7 takes subcommands through `magick`; IM6 binds them to the binary name
// (`convert`, `identify`). resolveMagick() returns whichever exists.
function isIm7(bin) {
  return /magick(\.exe)?$/i.test(path.basename(bin));
}

function imCmd(bin, op) {
  return isIm7(bin) ? [bin, op] : [op === 'identify' ? 'identify' : 'convert'];
}

function probeSize(file, bin) {
  const [cmd, ...pre] = imCmd(bin, 'identify');
  const out = execFileSync(cmd, [...pre, '-format', '%w %h', file], { encoding: 'utf8', timeout: 30000 });
  const [w, h] = out.trim().split(/\s+/).map(Number);
  return { w, h };
}

function main() {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) {
    console.error(JSON.stringify({ ok: false, reason: 'missing_file', file }));
    process.exit(1);
  }
  const bin = magickBin();

  let size;
  try { size = probeSize(file, bin); } catch (e) {
    console.error(JSON.stringify({ ok: false, reason: 'identify_failed', error: String(e.message || e).slice(0, 200) }));
    process.exit(1);
  }
  const { w: iw, h: ih } = size;
  if (!iw || !ih) {
    console.error(JSON.stringify({ ok: false, reason: 'bad_dimensions' }));
    process.exit(1);
  }

  // background-size: cover
  const cover = Math.max(VP_W / iw, VP_H / ih);
  const dw = iw * cover;
  const dh = ih * cover;
  const ox = (VP_W - dw) * BG_POS_X;
  const oy = (VP_H - dh) * BG_POS_Y;

  // region of the source photo that is actually visible
  const srcX = Math.max(0, -ox / cover);
  const srcY = Math.max(0, -oy / cover);
  const srcW = Math.min(iw - srcX, VP_W / cover);
  const srcH = Math.min(ih - srcY, VP_H / cover);

  const tmp = path.join(os.tmpdir(), `herocheck-${process.pid}-${Date.now()}.pgm`);
  const AW = 144;           // analysis width, 10x the 10% bands
  const AH = 64;
  try {
    const [cmd, ...pre] = imCmd(bin, 'convert');
    execFileSync(cmd, [
      ...pre,
      file + '[0]',
      '-crop', `${Math.max(1, Math.round(srcW))}x${Math.max(1, Math.round(srcH))}+${Math.round(srcX)}+${Math.round(srcY)}`,
      '+repage',
      '-resize', `${AW}x${AH}!`,
      '-colorspace', 'sRGB',
      '-depth', '8',
      `pgm:${tmp}`,
    ], { encoding: 'utf8', timeout: 60000 });
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
    console.error(JSON.stringify({ ok: false, reason: 'convert_failed', error: String(e.message || e).slice(0, 300) }));
    process.exit(1);
  }

  const buf = fs.readFileSync(tmp);
  try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ }

  // parse binary PGM (P5)
  let pos = 0;
  const readToken = () => {
    while (pos < buf.length && /\s/.test(String.fromCharCode(buf[pos]))) pos++;
    if (buf[pos] === 0x23) { // '#'
      while (pos < buf.length && buf[pos] !== 0x0a) pos++;
      return readToken();
    }
    const start = pos;
    while (pos < buf.length && !/\s/.test(String.fromCharCode(buf[pos]))) pos++;
    return buf.toString('ascii', start, pos);
  };
  const magic = readToken();
  if (magic !== 'P5') {
    console.error(JSON.stringify({ ok: false, reason: 'unexpected_pgm_magic', magic }));
    process.exit(1);
  }
  const pw = Number(readToken());
  const ph = Number(readToken());
  const maxv = Number(readToken());
  pos++; // single whitespace after maxval
  const px = buf.subarray(pos);
  if (px.length < pw * ph) {
    console.error(JSON.stringify({ ok: false, reason: 'short_pgm_payload', got: px.length, want: pw * ph }));
    process.exit(1);
  }
  const scale = maxv > 0 ? 255 / maxv : 1;

  const top = Math.round((SAMPLE_TOP / VP_H) * ph);
  const colMean = (frac) => {
    const x0 = Math.round(pw * frac);
    const x1 = Math.min(x0 + Math.max(1, Math.round(pw * 0.11)), pw);
    let t = 0, n = 0;
    for (let y = top; y < ph; y++) {
      for (let x = x0; x < x1; x++) { t += px[y * pw + x] * scale; n++; }
    }
    return n ? t / n : 0;
  };

  const bands = [];
  for (let b = 0; b < 10; b++) {
    const x0 = Math.round((b / 10) * pw);
    const x1 = Math.min(Math.round(((b + 1) / 10) * pw), pw);
    let t = 0, n = 0;
    for (let y = top; y < ph; y++) {
      for (let x = x0; x < x1; x++) { t += px[y * pw + x] * scale; n++; }
    }
    if (n) bands.push(t / n);
  }

  const peak = Math.max(...bands);
  const floor = Math.min(...bands);
  const textBand = colMean(0.62);
  const contrast = floor > 0 ? peak / floor : 0;
  const textOk = peak > 0 ? peak / Math.max(1, textBand) >= 1.15 : false;

  console.log(JSON.stringify({
    ok: true,
    file,
    width: iw,
    height: ih,
    peak: Number(peak.toFixed(2)),
    floor: Number(floor.toFixed(2)),
    textBand: Number(textBand.toFixed(2)),
    contrast: Number(contrast.toFixed(3)),
    textOk,
    pass: contrast >= 1.35 && textOk,
  }));
}

main();
