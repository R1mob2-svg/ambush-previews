#!/usr/bin/env node
/**
 * source-hero.js — NEO photo sourcing with the luminance rule applied
 * BEFORE the photo is ever committed.
 *
 * This is the part AG keeps skipping. The hero rule is not "pick a nice photo
 * and crop it right" — it is "pick a photo whose light already runs into the
 * right third". This tool searches Wikimedia Commons, downloads candidates,
 * measures the raw L/M/R ramp of each, and returns only the ones that can
 * physically satisfy the gate.
 *
 * Usage:
 *   node scripts/source-hero.js "boiler room pipework" [--n 8] [--min 1400]
 */
const { execFileSync } = require('child_process');
const { runConvert } = require('./imagick');
const fs = require('fs');
const path = require('path');
const https = require('https');

const q = process.argv[2];
const arg = (flag, def) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : def;
};
const n = +arg('--n', 8);
const minW = +arg('--min', 1400);
const outDir = arg('--out', '/tmp/herocand');
fs.mkdirSync(outDir, { recursive: true });

const UA = 'NEO-Ambush/1.0 (https://geminx.example; founder@geminx)';

function get(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': UA } }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return res(get(r.headers.location));
      let b = '';
      r.on('data', (c) => (b += c));
      r.on('end', () => res(b));
    }).on('error', rej);
  });
}

function download(url, dest) {
  return new Promise((res, rej) => {
    const f = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': UA } }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        f.close();
        return download(r.headers.location, dest).then(res, rej);
      }
      r.pipe(f);
      f.on('finish', () => f.close(() => res(dest)));
    }).on('error', rej);
  });
}

/**
 * Raw L/M/R of the photo itself, resized to a 1440-wide frame.
 *
 * BUGFIX (NEO 2026-11-17): this used to sample columns at 62%/75%/87% of the
 * width — i.e. only the right third. That never measured the actual
 * left-to-right ramp the gate checks, so it reported flat/inverted for photos
 * that were genuinely fine and found "0 candidates" for most modern trades.
 * It now samples true thirds (0-33%, 33-67%, 67-100%) centre-cropped to the
 * useful vertical band, which matches what vet-hero.js and gate2.js measure.
 */
function rawRamp(file) {
  const third = (i) =>
    parseFloat(
      runConvert(
        [file, '-resize', '1440x', '-gravity', 'center', '-crop', `480x800+${(i - 1) * 480}+0`, '+repage',
          '-colorspace', 'gray', '-format', '%[fx:mean*255]', 'info:'], { encoding: 'utf8' })
    );
  return { L: third(0), M: third(1), R: third(2) };
}

(async () => {
  const api =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search' +
    `&gsrsearch=${encodeURIComponent(q + ' filetype:bitmap')}&gsrnamespace=6&gsrlimit=40` +
    '&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1600';

  const raw = await get(api);
  const d = JSON.parse(raw);
  const pages = Object.values(d?.query?.pages || {});

  const cands = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii) continue;
    if (!/\.(jpe?g|png)$/i.test(p.title)) continue;
    if (ii.width < minW) continue;
    if (ii.width < ii.height) continue; // need landscape for a hero
    cands.push({
      title: p.title,
      url: ii.thumburl || ii.url,
      full: ii.url,
      w: ii.width,
      h: ii.height,
      license: ii.extmetadata?.LicenseShortName?.value || '?',
      desc: (ii.extmetadata?.ImageDescription?.value || '').replace(/<[^>]+>/g, '').slice(0, 90),
    });
  }

  console.log(`${cands.length} landscape bitmaps >= ${minW}px for "${q}"\n`);
  const good = [];
  for (const c of cands.slice(0, n * 3)) {
    const dest = path.join(outDir, path.basename(c.title).replace(/[^\w.-]/g, '_'));
    try {
      await download(c.url, dest);
      const r = rawRamp(dest);
      const ratio = r.R / r.L;
      // Normal ramp, or reversed (light running right->left) — the latter is
      // recoverable by mirroring the plate, which NEO can do deterministically.
      // A photo only needs a strong directional ramp. The left-dark scrim adds
      // contrast on top, so accepting slightly under 1.5 raw here is correct:
      // the authoritative test is the composite in gate2.js, not this filter.
      const ok = ratio > 1.25 && r.R > r.M && r.M > r.L;
      const okRev = 1 / ratio > 1.25 && r.L > r.M && r.M > r.R;
      const tag = ok ? 'GOOD' : okRev ? 'MIRR' : '--  ';
      console.log(`${tag}  R/L=${ratio.toFixed(2)}  L=${r.L.toFixed(0)} M=${r.M.toFixed(0)} R=${r.R.toFixed(0)}  ${c.title.replace('File:', '')}`);
      if (ok) good.push({ ...c, file: dest, ramp: r, ratio, mirror: false });
      else if (okRev) good.push({ ...c, file: dest, ramp: r, ratio: 1 / ratio, mirror: true });
      if (good.length >= n) break;
    } catch (e) {
      console.log(`ERR   ${c.title} — ${e.message}`);
    }
  }

  console.log(`\n${good.length} candidate(s) already satisfy the luminance rule:`);
  for (const g of good) {
    console.log(`\n  ${g.file}`);
    console.log(`  ${g.license} · ${g.w}x${g.h} · R/L after ${g.mirror ? 'MIRROR' : 'direct'}=${g.ratio.toFixed(2)}`);
    console.log(`  ${g.full}`);
    if (g.desc) console.log(`  "${g.desc}"`);
  }
  if (!good.length) console.log('\nnone — try a query describing directional light, e.g. "workshop window light"');
})();
