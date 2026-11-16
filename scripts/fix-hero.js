#!/usr/bin/env node
/**
 * fix-hero.js — NEO repair for the two AG-owned hero defects.
 *
 * Why: AG validated the hero *photo* (subject right-of-centre, 100% 30%) but
 * never validated the *composite*. The template already paints a
 * left-to-right dark overlay (opacity .97 -> .06). A photo whose dark mass is
 * on the right therefore erases itself under that gradient: bk-gas measures
 * 25.8 -> 21.1 -> 10.6. The overlay is not the bug. The photo's light
 * direction is.
 *
 * This tool finds a photo whose light already runs INTO the right third,
 * which is the only durable fix. It reports measured L/M/R so nobody has to
 * guess or trust a claim.
 *
 * Usage:
 *   node scripts/fix-hero.js <slug>                 diagnose current hero
 *   node scripts/fix-hero.js <slug> --test <file>   score a candidate photo
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const slug = process.argv[2];
const testIdx = process.argv.indexOf('--test');

function ramp(file) {
  // Full-width strip, three vertical bands at 62/75/87% of width
  const w = parseInt(execFileSync('identify', ['-format', '%w', file], { encoding: 'utf8' }));
  const col = (frac, label) =>
    parseFloat(
      execFileSync('convert',
        [file, '-resize', '1440x', '-crop', `160x600+${Math.round(1440 * frac)}+80`, '+repage',
          '-colorspace', 'gray', '-format', '%[fx:mean*255]', 'info:'], { encoding: 'utf8' })
    );
  return { w, L: col(0.62), M: col(0.75), R: col(0.87) };
}

if (testIdx > -1) {
  const f = process.argv[testIdx + 1];
  const r = ramp(f);
  const ratio = r.R / r.L;
  console.log(`${path.basename(f)}  L=${r.L.toFixed(1)} M=${r.M.toFixed(1)} R=${r.R.toFixed(1)}  R/L=${ratio.toFixed(2)}`);
  console.log(ratio > 1.5 && r.R > r.M && r.M > r.L ? '  candidate: PASSES raw ramp' : '  candidate: FAILS raw ramp');
  process.exit(0);
}

const dir = path.resolve(process.argv[3] || slug);
const hero = path.join(dir, 'assets', 'hero.jpg');
if (!fs.existsSync(hero)) { console.error('no hero at ' + hero); process.exit(2); }
const r = ramp(hero);
const prov = JSON.parse(fs.readFileSync(path.join(dir, 'asset-sources.json'), 'utf8'));
const meta = (prov.assets || prov)['hero.jpg'];
console.log(`slug      ${slug}`);
console.log(`source    ${typeof meta === 'object' ? meta.source_url : meta}`);
console.log(`measured  L=${r.L.toFixed(1)} M=${r.M.toFixed(1)} R=${r.R.toFixed(1)}  R/L=${(r.R / r.L).toFixed(2)}`);
console.log(`verdict   ${r.R > r.L * 1.5 && r.R > r.M ? 'the photo light runs into the right third' : 'the photo light runs the WRONG WAY — overlay layer 1 already darkens right-to-left, so this can never pass regardless of background-position'}`);
