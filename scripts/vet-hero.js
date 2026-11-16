#!/usr/bin/env node
/**
 * vet-hero.js — objective photo vetting with no eyeballs required.
 *
 * Vision models are rate-limited and humans are subjective. This checks the
 * properties the gate and the founder's rules actually care about, mechanically:
 *
 *   1. LUMINANCE RAMP   raw L->R must rise into the right third (R>M>L, R/L>1.5)
 *   2. DETAIL GUARD     real photographic variance, not a flat gradient or colour card
 *
 * Deliberately NOT checked: "subject placement" by edge energy. I built that check,
 * calibrated it against five heroes the gate already passes, and it rejected all
 * five. Edge energy measures texture, not subject position. A check that fails
 * everything it should pass is a liar, so it is not in this tool.
 *
 * Usage: node scripts/vet-hero.js <image> [<image> ...]
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function num(expr, file) {
  return parseFloat(execFileSync('convert', [file, '-format', expr, 'info:'], { encoding: 'utf8' }));
}

function ramp(file) {
  const col = (frac) =>
    parseFloat(
      execFileSync('convert',
        [file, '-resize', '1440x', '-crop', `160x600+${Math.round(1440 * frac)}+80`, '+repage',
          '-colorspace', 'gray', '-format', '%[fx:mean*255]', 'info:'], { encoding: 'utf8' })
    );
  return { L: col(0.62), M: col(0.75), R: col(0.87) };
}

/**
 * Real photographic detail: standard deviation of the image itself. A washed-out
 * or synthetic image (a flat gradient, a solid colour card) has near-zero
 * variance. Calibrated against heroes already passing the gate:
 *   cheek 29.5 · assg 24.9 · hobbs 55.9 · heat-zone 44.2  -> threshold 18 is safe
 */
function detail(file) {
  return num('%[fx:standard_deviation*255]', (execFileSync('convert',
    [file, '-resize', '1200x', '-colorspace', 'gray', file + '.d.png'], { encoding: 'utf8' }), file + '.d.png')) &&
    (() => { const v = num('%[fx:standard_deviation*255]', file + '.d.png'); fs.unlinkSync(file + '.d.png'); return v; })();
}

for (const file of process.argv.slice(2)) {
  if (!fs.existsSync(file)) { console.log(`MISSING ${file}`); continue; }
  const dim = execFileSync('identify', ['-format', '%wx%h', file], { encoding: 'utf8' });
  const r = ramp(file);
  const lc = detail(file);
  const ratio = r.R / r.L;

  const rampOk = r.R > r.M && r.M > r.L && ratio > 1.5;
  const notFlat = lc > 18;

  console.log(`\n${path.basename(file)}  ${dim}`);
  console.log(`  ramp      L=${r.L.toFixed(0)} M=${r.M.toFixed(0)} R=${r.R.toFixed(0)}  R/L=${ratio.toFixed(2)}  ${rampOk ? 'OK' : 'FAIL'}`);
  console.log(`  detail    ${lc.toFixed(1)}  ${notFlat ? 'has real photographic detail' : 'FLAT / SYNTHETIC'}`);
  console.log(`  verdict   ${rampOk && notFlat ? 'VETTED' : 'REJECTED'}`);
}
