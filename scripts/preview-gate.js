#!/usr/bin/env node
// Digital Ambush preview gate — founder-locked rules (Rob, 2026-11-16)
// Enforces: no repeated image sources, right-weighted hero focal point,
// hero wordmark comparable to H1, clean live render.
// Usage: node preview-gate.js <page.html> [liveUrl]

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const pageArg = process.argv[2] || 'index.html';
const liveUrl = process.argv[3] || null;
const results = [];
let failed = 0;

function check(name, pass, detail) {
  results.push({ name, pass, detail });
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  const abs = path.resolve(pageArg);
  if (!fs.existsSync(abs)) {
    console.error('missing page: ' + abs);
    process.exit(2);
  }
  const html = fs.readFileSync(abs, 'utf8');
  const dir = path.dirname(abs);

  // ---- Rule 3: no repeated image SOURCE. Two crops of one photo = repeat.
  // The same file may legitimately appear twice as responsive twins of ONE placement
  // (e.g. .hero-bg for desktop + .hero-banner for mobile). Dedupe by declared
  // placement slot first, then require every SLOT to use a different source photo.
  const slotOf = (selectorOrSrc, idx) => selectorOrSrc;
  const srcs = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/g)].map(m => m[1]);
  const bgs = [...html.matchAll(/url\(["']?([^"')]+\.(?:jpg|jpeg|png|webp))["']?\)/gi)].map(m => m[1]);
  // A slot = an actual <img> element, or a background-image declared for a UNIQUE
  // selector. Responsive twins (.hero-bg / .hero-banner) are ONE slot.
  const bgSlots = new Set();
  for (const m of html.matchAll(/([.#][\w-]+(?:\s*[^{}]*?)?)\{[^{}]*?url\(["']?([^"')]+\.(?:jpg|jpeg|png|webp))["']?\)/gi)) {
    bgSlots.add(path.basename(m[2]).toLowerCase());
  }
  const imgSlots = srcs.map(s => path.basename(s).toLowerCase());
  const all = [...imgSlots, ...bgSlots];
  const bySource = {};
  for (const s of all) bySource[s] = (bySource[s] || 0) + 1;
  const dupFiles = Object.entries(bySource).filter(([, n]) => n > 1);
  // Provenance map: distinct files can still be one source photo. Require a
  // declared map so the human/agent must state each file's originating photo.
  const mapPath = path.join(dir, 'asset-sources.json');
  let provFail = [];
  if (!fs.existsSync(mapPath)) {
    provFail.push('asset-sources.json MISSING — cannot prove photos are distinct sources');
  } else {
    const prov = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    const used = {};
    // AG provenance schema nests entries under .assets as objects with source_url.
    const flat = Object.fromEntries(
      Object.entries(prov.assets || {}).map(([k, v]) => [
        k.toLowerCase(),
        typeof v === 'string' ? v : (v && (v.source_url || v.source || JSON.stringify(v))),
      ])
    );
    const provLower = { ...Object.fromEntries(Object.entries(prov).filter(([k]) => k !== 'assets').map(([k, v]) => [k.toLowerCase(), v])), ...flat };
    for (const s of all) {
      const base = path.basename(s).toLowerCase();
      const origin = provLower[base];
      if (!origin) provFail.push(`${base} has no declared source photo`);
      else (used[origin] = used[origin] || []).push(base);
    }
    for (const [origin, files] of Object.entries(used)) {
      if (files.length > 1) provFail.push(`REPEATED SOURCE "${origin}" used by ${files.join(', ')}`);
    }
  }

  check('no image file reused', dupFiles.length === 0,
    dupFiles.length ? dupFiles.map(([f, n]) => `${f} x${n}`).join('; ') : `${all.length} image references, all unique`);
  check('no source photo reused across placements', provFail.length === 0,
    provFail.length ? provFail.join('; ') : 'provenance map clean');
  // Hard fail if a single source photo feeds more than one on-page slot
  if (fs.existsSync(mapPath)) {
    const prov = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    const perSlot = {};
    for (const s of all) {
      const o = prov[path.basename(s).toLowerCase()] || Object.entries(prov).find(([k]) => k.toLowerCase() === path.basename(s).toLowerCase())?.[1];
      if (o) perSlot[o] = (perSlot[o] || 0) + 1;
    }
    const dupes = Object.entries(perSlot).filter(([, n]) => n > 1);
    check('no single source photo used for 2+ slots', dupes.length === 0,
      dupes.length ? dupes.map(([o, n]) => `${o} -> ${n} slots`).join('; ') : 'every slot has a distinct source photo');
  }

  // ---- Rules 1 & 2 measured in a real render
  const b = await chromium.launch();
  const viewports = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ];
  for (const vp of viewports) {
    const p = await b.newPage({ viewport: { width: vp.width, height: vp.height } });
    const errs = [], bad = [];
    p.on('pageerror', e => errs.push(String(e)));
    p.on('response', r => { if (r.status() >= 400 && !r.url().startsWith('data:')) bad.push(r.status() + ' ' + path.basename(r.url())); });
    await p.goto(liveUrl || 'file://' + abs, { waitUntil: 'networkidle', timeout: 60000 });

    const info = await p.evaluate(() => {
      const bg = document.querySelector('.hero-bg');
      const wm = document.querySelector('.hero-wordmark');
      const h1 = document.querySelector('h1');
      const out = {
        bgPos: bg ? getComputedStyle(bg).backgroundPosition : null,
        wmSize: wm ? parseFloat(getComputedStyle(wm).fontSize) : null,
        h1Size: h1 ? parseFloat(getComputedStyle(h1).fontSize) : null,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        broken: [...document.images].filter(i => !i.complete || i.naturalWidth === 0).length,
        heroBox: bg ? { x: bg.getBoundingClientRect().x, y: bg.getBoundingClientRect().y, w: bg.getBoundingClientRect().width, h: bg.getBoundingClientRect().height } : null,
      };
      return out;
    });

    if (vp.name === 'desktop') {
      // Rule 2: wordmark within ~10% of H1 and clearly large
      const ratio = info.wmSize && info.h1Size ? info.wmSize / info.h1Size : 0;
      check('hero wordmark exists and is large', !!info.wmSize && info.wmSize >= 40,
        info.wmSize ? `${info.wmSize.toFixed(1)}px vs h1 ${info.h1Size.toFixed(1)}px` : 'no .hero-wordmark found');
      check('wordmark size comparable to H1 (>=0.9x)', ratio >= 0.9, `ratio ${ratio.toFixed(2)}`);

      // Rule 1: measure the hero luminance ramp left->right
      if (info.heroBox && !liveUrl) {
        const shot = path.join(dir, '.gate-hero.png');
        await p.screenshot({ path: shot, clip: { x: info.heroBox.x, y: Math.max(0, info.heroBox.y), width: vp.width, height: Math.min(700, info.heroBox.h) } });
        const { execFileSync } = require('child_process');
        const col = (x) => parseFloat(execFileSync('convert',
          [shot, '-crop', `180x600+${x}+50`, '+repage', '-colorspace', 'gray', '-format', '%[fx:mean*255]', 'info:'],
          { encoding: 'utf8' }));
        const L = col(Math.round(vp.width * 0.62)), M = col(Math.round(vp.width * 0.75)), R = col(Math.round(vp.width * 0.87));
        // Overlay darkens left edge, so require sustained rise into the right third
        check('hero focal point is right-weighted', R > M && M > L && R > L * 1.6,
          `lum L=${L.toFixed(1)} M=${M.toFixed(1)} R=${R.toFixed(1)}`);
        fs.unlinkSync(shot);
      }

      if (info.bgPos) {
        const rightWeighted = /(100%|right)/.test(info.bgPos) && !/^(center|50%)/.test(info.bgPos);
        check('hero background-position right-weighted', rightWeighted, info.bgPos);
      }
    }

    check(`${vp.name}: no js errors`, errs.length === 0, errs.join('; '));
    check(`${vp.name}: no http errors`, bad.length === 0, bad.join('; '));
    check(`${vp.name}: no broken images`, info.broken === 0, `${info.broken} broken`);
    check(`${vp.name}: no horizontal overflow`, info.overflowX === 0, `overflow ${info.overflowX}px`);
    await p.close();
  }
  await b.close();

  console.log('\n' + (failed ? `GATE FAILED (${failed})` : `GATE PASSED (${results.length} checks)`));
  process.exit(failed ? 1 : 0);
})();
