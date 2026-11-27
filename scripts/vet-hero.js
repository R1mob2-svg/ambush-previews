#!/usr/bin/env node
/**
 * vet-hero.js — objective photo vetting with no eyeballs required.
 *
 * Vision models are rate-limited and humans are subjective. This checks the
 * properties the gate and the founder's rules actually care about, mechanically:
 *
 *   1. LUMINANCE RAMP   raw plate leans left->right (R/L>1.25), or the reverse,
 *                       which is recoverable by mirroring the plate
 *   2. DETAIL GUARD     real photographic variance, not a flat gradient or colour card
 *
 * Deliberately NOT checked: "subject placement" by edge energy. I built that check,
 * calibrated it against five heroes the gate already passes, and it rejected all
 * five. Edge energy measures texture, not subject position. A check that fails
 * everything it should pass is a liar, so it is not in this tool.
 *
 * Both rules below are aligned with scripts/source-hero.js, which is the selector.
 * This is a prefilter; the authoritative test is the composite in gate2.js.
 *
 * Usage: node scripts/vet-hero.js <image> [<image> ...]
 */
const { runConvert, runIdentify } = require('./imagick');
const fs = require('fs');
const path = require('path');

function num(expr, file) {
  return parseFloat(runConvert([file, '-format', expr, 'info:'], { encoding: 'utf8' }));
}

/**
 * True thirds of the plate: 0-33%, 33-67%, 67-100%, centre-cropped to the
 * useful vertical band.
 *
 * BUGFIX (NEO 2026-11-27): this used to sample at 62%/75%/87% of the width —
 * i.e. three adjacent slices of the right third — and then assert a
 * left-to-right ramp across them. That never measured L->M->R, so it reported
 * flat/inverted for photos that were genuinely fine and rejected the entire
 * candidate pool. source-hero.js fixed this exact bug in its own copy; this
 * file was never ported. Geometry now matches source-hero.js and gate2.js.
 */
function ramp(file) {
  const third = (i) =>
    parseFloat(
      runConvert(
        [file, '-resize', '1440x', '-gravity', 'center', '-crop', `480x800+${(i - 1) * 480}+0`, '+repage',
          '-colorspace', 'gray', '-format', '%[fx:mean*255]', 'info:'], { encoding: 'utf8' })
    );
  return { L: third(0), M: third(1), R: third(2) };
}

/**
 * Real photographic detail: standard deviation of the image itself. A washed-out
 * or synthetic image (a flat gradient, a solid colour card) has near-zero
 * variance. Calibrated against heroes already passing the gate:
 *   cheek 29.5 · assg 24.9 · hobbs 55.9 · heat-zone 44.2  -> threshold 18 is safe
 */
function detail(file) {
  return num('%[fx:standard_deviation*255]', (runConvert(
    [file, '-resize', '1200x', '-colorspace', 'gray', file + '.d.png'], { encoding: 'utf8' }), file + '.d.png')) &&
    (() => { const v = num('%[fx:standard_deviation*255]', file + '.d.png'); fs.unlinkSync(file + '.d.png'); return v; })();
}

/**
 * Directional lean, calibrated to source-hero.js: the left-dark scrim adds
 * contrast on top of the plate, so the raw photo only needs a clear lean, not
 * a 1.5x jump. A reversed plate is accepted and flagged for mirroring.
 */
function lean(r) {
  const ratio = r.R / r.L;
  const forward = r.R > r.M && r.M > r.L && ratio > 1.25;
  const reverse = r.L > r.M && r.M > r.R && 1 / ratio > 1.25;
  return {
    ratio,
    ok: forward || reverse,
    mirrored: reverse && !forward,
    label: forward ? 'OK' : reverse ? 'OK (mirror)' : 'FAIL',
  };
}

for (const file of process.argv.slice(2)) {
  if (!fs.existsSync(file)) { console.log(`MISSING ${file}`); continue; }
  const dim = runIdentify(['-format', '%wx%h', file], { encoding: 'utf8' });
  const r = ramp(file);
  const lc = detail(file);
  const l = lean(r);

  const notFlat = lc > 18;
  const vetted = l.ok && notFlat;

  console.log(`\n${path.basename(file)}  ${dim}`);
  console.log(`  ramp      L=${r.L.toFixed(0)} M=${r.M.toFixed(0)} R=${r.R.toFixed(0)}  R/L=${l.ratio.toFixed(2)}  ${l.label}`);
  console.log(`  detail    ${lc.toFixed(1)}  ${notFlat ? 'has real photographic detail' : 'FLAT / SYNTHETIC'}`);
  console.log(`  verdict   ${vetted ? 'VETTED' : 'REJECTED'}`);
}
