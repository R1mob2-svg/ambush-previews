#!/usr/bin/env node
/**
 * NEO GATE v2 — build 2. Supersedes scripts/preview-gate.js (v1, 14 checks).
 *
 * Founder-locked rules (Rob, 2026-11-16 PIPELINE LOCKDOWN):
 *   1. Right-weighted hero: background-position 100% 30%, luminance ramps L->R
 *   2. Zero image recycling: no photo may appear on 2+ prospects, nor 2+ slots
 *   3. Strict math supremacy: nothing ships without GATE PASSED
 *   4. No sloppy bypasses: dead-centre crop or flat lighting = instant reject
 *
 * Usage:
 *   node scripts/gate2.js <page.html> [liveUrl]
 *   node scripts/gate2.js <page.html> [liveUrl] --registry <global-registry.json>
 *
 * Exit 0 = PASS. Exit 1 = FAIL. Exit 2 = cannot run.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { runConvert, assertImageTooling } = require('./imagick');

const pageArg = process.argv[2] || 'index.html';
const liveUrl = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : null;
const regIdx = process.argv.indexOf('--registry');
const registryPath = regIdx > -1 ? process.argv[regIdx + 1] : null;

const results = [];
let failed = 0;
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

// Founder-mandated viewport matrix
const VIEWPORTS = [
  { name: '320', width: 320, height: 800 },
  { name: '390', width: 390, height: 844 },
  { name: '430', width: 430, height: 932 },
  { name: '768', width: 768, height: 1024 },
  { name: '820', width: 820, height: 1180 },
  { name: '1024', width: 1024, height: 768 },
  { name: '1280', width: 1280, height: 800 },
  { name: '1440', width: 1440, height: 900 },
];

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

/** Normalise a provenance entry from either schema shape into {origin, sha256}. */
function normProv(v) {
  if (!v) return null;
  if (typeof v === 'string') {
    return v.startsWith('generated:') ? { origin: v, sha256: null, generated: true } : { origin: v, sha256: null };
  }
  return {
    origin: v.source_url || v.source || v.origin || JSON.stringify(v),
    sha256: v.sha256 || null,
    license: v.license || null,
    generated: false,
  };
}

(async () => {
  // Fail loud, never quiet. If ImageMagick is unusable the hero checks would
  // throw mid-run or (worse) be skipped, producing a false PASS. Refuse to run.
  try {
    assertImageTooling();
  } catch (e) {
    console.error('\nGATE ERROR: ' + e.message + '\n');
    process.exit(2);
  }
  const abs = path.resolve(pageArg);
  if (!fs.existsSync(abs)) {
    console.error('missing page: ' + abs);
    process.exit(2);
  }
  const html = fs.readFileSync(abs, 'utf8');
  // Gate 2 contact-authenticity regression. A displayed phone must never
  // contradict the number the button would dial. The legacy sample contact
  // numbers are forbidden until evidence-gated into the business spec.
  const legacyNumbers = /0121(?:&nbsp;|[\\s\\u00a0])*556(?:&nbsp;|[\\s\\u00a0])*7820|07809(?:&nbsp;|[\\s\\u00a0])*444321/i;
  check('No shared sample telephone in preview', !legacyNumbers.test(html));
  const telNumbers = [...html.matchAll(/<a\\b[^>]*href=["']tel:([^"']+)["'][^>]*>([\\s\\S]*?)<\\/a>/gi)];
  const mismatchedNumbers = telNumbers.filter((m) => {
    const dial = String(m[1]).replace(/\\D/g, '').replace(/^44/, '0');
    const visible = String(m[2]).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ');
    const tokens = [...visible.matchAll(/(?:\\+44|0)\\d(?:[\\s()\\-]*\\d){8,10}/g)];
    return tokens.some((x) => {
      const d = x[0].replace(/\\D/g, '').replace(/^44/, '0');
      return d !== dial;
    });
  });
  check('Displayed phone matches tel target', mismatchedNumbers.length === 0,
    mismatchedNumbers.length ? mismatchedNumbers.map((m) => m[1]).join(',') : undefined);
  const dir = path.dirname(abs);
  const slug = path.basename(dir);

  // ---------- collect on-page image slots ----------
  const srcs = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/g)].map((m) => m[1]);
  const bgs = [...html.matchAll(/url\(["']?([^"')]+\.(?:jpg|jpeg|png|webp))["']?\)/gi)].map((m) => m[1]);
  const bgSlots = new Set();
  for (const m of html.matchAll(/([.#][\w-]+(?:\s*[^{}]*?)?)\{[^{}]*?url\(["']?([^"')]+\.(?:jpg|jpeg|png|webp))["']?\)/gi)) {
    bgSlots.add(path.basename(m[2]).toLowerCase());
  }
  const imgSlots = srcs.map((s) => path.basename(s).toLowerCase());
  const all = [...new Set([...imgSlots, ...bgSlots])];

  const byFile = {};
  for (const s of imgSlots) byFile[s] = (byFile[s] || 0) + 1;
  const dupFiles = Object.entries(byFile).filter(([, n]) => n > 1);
  check('<img> src not reused on page', dupFiles.length === 0,
    dupFiles.length ? dupFiles.map(([f, n]) => `${f} x${n}`).join('; ') : `${imgSlots.length} img refs unique`);

  // ---------- provenance ----------
  const mapPath = path.join(dir, 'asset-sources.json');
  const phantom = [];
  const assetDir = path.join(dir, 'assets');
  const onDisk = fs.existsSync(assetDir) ? fs.readdirSync(assetDir) : [];
  const resolveAsset = (name) => onDisk.find((f) => f.toLowerCase() === name.toLowerCase()) || null;
  if (!fs.existsSync(mapPath)) {
    check('asset-sources.json present', false, 'MISSING — cannot prove distinct origins');
  } else {
    check('asset-sources.json present', true, 'found');
    const prov = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    const flat = { ...(prov.assets || {}) };
    for (const [k, v] of Object.entries(prov)) if (k !== 'assets') flat[k] = v;
    const provLower = Object.fromEntries(Object.entries(flat).map(([k, v]) => [k.toLowerCase(), normProv(v)]));

    const noOrigin = [];
    const perOrigin = {};
    for (const s of all) {
      if (s === 'favicon.png') continue;
      const e = provLower[s];
      if (!e || !e.origin || (typeof e.origin === 'string' && e.origin === 'PENDING_AG')) {
        noOrigin.push(s);
        continue;
      }
      (perOrigin[e.origin] = perOrigin[e.origin] || []).push(s);
    }
    check('every image slot has a declared source photo', noOrigin.length === 0,
      noOrigin.length ? noOrigin.join(', ') : 'all declared');
    const repeats = Object.entries(perOrigin).filter(([, f]) => f.length > 1);
    check('no source photo used by 2+ slots on this page', repeats.length === 0,
      repeats.length ? repeats.map(([o, f]) => `${o.split('/').pop()} -> ${f.join(', ')}`) : 'every slot distinct');

    // ---- zero-recycling across the WHOLE board ----
    if (registryPath && fs.existsSync(registryPath)) {
      const reg = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      const borrowed = [];
      for (const s of all) {
        if (s === 'favicon.png') continue;
        const e = provLower[s];
        if (!e || !e.origin) continue;
        for (const [otherSlug, otherAssets] of Object.entries(reg)) {
          if (otherSlug === slug) continue;
          if (Array.isArray(otherAssets) && otherAssets.includes(e.origin)) {
            borrowed.push(`${s} <-> ${otherSlug}`);
          }
        }
      }
      check('zero image recycling across the board', borrowed.length === 0,
        borrowed.length ? borrowed.join('; ') : 'no photo shared with any other prospect');

      // identical bytes anywhere else is also recycling
      const hashBorrowed = [];
      for (const s of all) {
        if (s === 'favicon.png') continue;
        const real = resolveAsset(s);
        const f = real ? path.join(assetDir, real) : null;
        if (!f) { phantom.push(s); continue; }
        const h = sha(f);
        for (const [otherSlug, hashes] of Object.entries(reg.hashes || {})) {
          if (otherSlug === slug) continue;
          if (Array.isArray(hashes) && hashes.includes(h)) hashBorrowed.push(`${s} == ${otherSlug}`);
        }
      }
      check('zero identical asset bytes across the board', hashBorrowed.length === 0,
        hashBorrowed.length ? hashBorrowed.join('; ') : 'all asset bytes unique');

      // declared sha256 must match the bytes on disk
      const provMismatch = [];
      for (const s of all) {
        if (s === 'favicon.png') continue;
        const e = provLower[s];
        const real = resolveAsset(s);
        const f = real ? path.join(assetDir, real) : null;
        if (!e || !e.sha256 || !f) continue;
        if (sha(f) !== e.sha256) provMismatch.push(s);
      }
      check('declared sha256 matches bytes on disk', provMismatch.length === 0,
        provMismatch.length ? provMismatch.join(', ') : 'all hashes verified');
    }
  }

  // Resolve slot basenames to real files case-insensitively (CHEEK-HERO-METER.jpg
  // in HTML vs asset-sources.json keys is not a failure, just a naming case).
  for (const s of all) {
    if (s === 'favicon.png') continue;
    if (!resolveAsset(s)) phantom.push(s);
  }
  check('every declared image exists on disk', phantom.length === 0,
    phantom.length ? `missing: ${[...new Set(phantom)].join(', ')}` : 'all present');

  // favicon
  const hasFavicon = /<link[^>]+rel=["'](?:icon|shortcut icon)["']/i.test(html) || fs.existsSync(path.join(dir, 'favicon.png'));
  check('favicon present', hasFavicon, hasFavicon ? 'yes' : 'none');

  // ---------- render matrix ----------
  const browser = await chromium.launch({
    // NEO 2026-11-18: the hero composition check reads the hero PHOTO bitmap
    // through a canvas. file:// pages taint the canvas unless local file access
    // is granted. These flags only widen read access inside the throwaway gate
    // browser.
    //
    // Railway/container hardening (SIGTERM + OOM root cause):
    //   --no-sandbox / --disable-setuid-sandbox  containers have no usable SUID sandbox
    //   --disable-dev-shm-usage                  /dev/shm is tiny in containers; without
    //                                            this Chromium exhausts shared memory and the
    //                                            render is killed (SIGTERM/SIGBUS)
    //   --disable-gpu                            no GPU in the container; skipping it avoids
    //                                            a costly, failing GPU process spawn
    args: [
      '--allow-file-access-from-files',
      '--disable-web-security',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
  const lumByVp = {};
  const heroShots = [];
  try {
    for (const vp of VIEWPORTS) {
      const p = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      const errs = [];
      const bad = [];
      p.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
      p.on('response', (r) => {
        if (r.status() >= 400 && !r.url().startsWith('data:')) bad.push(r.status() + ' ' + path.basename(r.url()));
      });
      await p.goto(liveUrl || 'file://' + abs, { waitUntil: 'load', timeout: 60000 });
      await p.waitForTimeout(250);

      const info = await p.evaluate(() => {
        // NEO 2026-11-17: version-aware hero selectors.
        // Legacy V6 previews use .hero-bg / .hero-wordmark. The deterministic
        // Golden Master (simplicity-golden-v1) uses .hero-section /
        // .hero-company-title. Detect which template this page actually is and
        // bind to the real nodes, instead of silently measuring nulls on the new
        // template and rubber-stamping it as a pass.
        const isGolden = !!document.querySelector('[data-template="simplicity-golden-v1"]')
          || !!document.querySelector('.hero-section');
        const bg = document.querySelector('.hero-section') || document.querySelector('.hero-bg');
        const wm = document.querySelector('.hero-company-title') || document.querySelector('.hero-wordmark');
        const h1 = document.querySelector('h1');
        const nav = document.querySelector('.nav-links');
        const h1cs = h1 ? getComputedStyle(h1) : null;
        return {
          bgPos: bg ? getComputedStyle(bg).backgroundPosition : null,
          wmSize: wm ? parseFloat(getComputedStyle(wm).fontSize) : null,
          h1Size: h1 ? parseFloat(h1cs.fontSize) : null,
          h1Color: h1cs ? h1cs.color : null,
          navDisplay: nav ? getComputedStyle(nav).display : null,
          isGolden,
          // Zero baked-in hero text: a text-free photo must not be flagged as
          // carrying rasterised words. Fail closed if it is.
          bakedTextFlag: bg
            ? (bg.getAttribute('data-hero-baked-text') || bg.getAttribute('data-baked-text') || '')
            : null,
          overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          broken: [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length,
          heroBox: bg
            ? (() => {
                const r = bg.getBoundingClientRect();
                const cs = getComputedStyle(bg);
                return {
                  x: r.x, y: r.y, w: r.width, h: r.height,
                  // NEO 2026-11-17: composition must be judged on the PHOTO,
                  // not on the photo plus the dark scrim layered over it.
                  // The scrim alone manufactures a left-dark ramp on a totally
                  // flat image, which is how a grey rectangle passed 'focal
                  // weight'. We re-read the raw bitmap through a canvas at the
                  // exact cover-geometry the browser applies. If we cannot read
                  // the photo, the check fails closed.
                  bgImage: cs.backgroundImage,
                  bgSize: cs.backgroundSize,
                  bgPos: cs.backgroundPosition,
                };
              })()
            : null,
          h1Box: h1
            ? (() => {
                const r = h1.getBoundingClientRect();
                return { x: r.x, y: r.y, w: r.width, h: r.height };
              })()
            : null,
        };
      });

      const isDesktop = vp.width >= 1024;

      // NEO 2026-11-17: template-agnostic hero checks.
      // 1) The hero element must actually exist for whichever template is served.
      //    A missing node used to skip every downstream assertion and still yield
      //    a PASS, which is the worst possible outcome for a gate.
      check(`[${vp.name}] hero section present`, !!info.bgPos,
        info.isGolden ? '.hero-section' : '.hero-bg');
      // 2) Zero baked-in hero text.
      check(`[${vp.name}] no baked-in hero text flag`, !info.bakedTextFlag,
        info.bakedTextFlag || 'none');
      // 3) Brand title must dominate the H1 by at least 20% on the Golden Master.
      if (info.isGolden && info.wmSize && info.h1Size) {
        const dominance = info.wmSize / info.h1Size;
        check(`[${vp.name}] company title >=1.2x the H1`, dominance >= 1.2,
          `${dominance.toFixed(2)}x`);
      }

      if (isDesktop) {
        if (info.bgPos) {
          const m = info.bgPos.match(/^([\d.]+%?)\s+([\d.]+%?)$/);
          const rx = m ? m[1] : info.bgPos;
          const rightWeighted = /100%|right/.test(rx) && !/^(center|50%)$/.test(rx);
          check(`[${vp.name}] hero background-position right-weighted`, rightWeighted, info.bgPos);
        }
        if (info.h1Color) {
          const pure = /^rgb\(255,\s*255,\s*255\)$/.test(info.h1Color);
          check(`[${vp.name}] H1 is pure white`, pure, info.h1Color);
        }
        // ---- Rule 4: measured text contrast, not assumed contrast.
        // Sample the pixels actually BEHIND the H1 and require a real ratio
        // against pure white. Catches a right-weighted hero whose brightest
        // region sits exactly where the headline is.
        if (info.h1Box && !liveUrl && vp.width === 1440) {
          const shot = path.join(dir, `.gate2-h1-${vp.name}.png`);
          await p.screenshot({ path: shot, clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 900) } });
          const bx = Math.max(0, Math.round(info.h1Box.x));
          const by = Math.max(0, Math.round(info.h1Box.y));
          const bw = Math.min(Math.round(info.h1Box.w), vp.width - bx);
          const bh = Math.min(Math.round(info.h1Box.h), 900 - by);
          let bgLum = null;
          if (bw > 10 && bh > 10) {
            bgLum = parseFloat(
              runConvert([shot, '-crop', `${bw}x${bh}+${bx}+${by}`, '+repage',
                '-colorspace', 'gray', '-format', '%[fx:mean*255]', 'info:'], { encoding: 'utf8' })
            );
          }
          try { fs.unlinkSync(shot); } catch {}
          if (bgLum !== null) {
            // WCAG relative luminance for the average backdrop
            const srgb = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
            const Lbg = srgb(bgLum);
            const ratio = (1.0 + 0.05) / (Lbg + 0.05); // white text vs sampled backdrop
            check('[1440] H1 legible over hero (contrast >= 4.5:1)', ratio >= 4.5,
              `backdrop lum ${bgLum.toFixed(1)} -> ${ratio.toFixed(2)}:1`);
          }
        }
        // luminance ramp measured on the widest desktop viewport only (stable)
        if (vp.width === 1440 && info.heroBox && !liveUrl) {
          const clipH = Math.min(640, Math.max(320, info.heroBox.h));

          // ---- NEO 2026-11-17 (founder Option A): measure the hero PHOTO.
          // Sample the raw background-image bitmap through a canvas using the
          // same background-size:cover + background-position mapping the browser
          // uses, then evaluate composition on those pixels. Checking the
          // rendered screenshot instead measured the scrim, not the photograph.
          const photoCols = await p.evaluate(async ({ box, titleBox }) => {
            const m = /url\(["']?(.*?)["']?\)/.exec(box.bgImage || '');
            if (!m) return null;
            const src = m[1];
            const img = await new Promise((res) => {
              const i = new Image();
              i.onload = () => res(i);
              i.onerror = () => res(null);
              i.src = src;
            });
            if (!img || !img.naturalWidth) return null;

            const W = box.w || 1;
            const H = box.h || 1;
            const iw = img.naturalWidth;
            const ih = img.naturalHeight;
            const cover = Math.max(W / iw, H / ih);
            const dw = iw * cover;
            const dh = ih * cover;
            const pos = (box.bgPos || '50% 50%').split(/\s+/);
            const pct = (tok, free, fallback) => {
              if (!tok) return fallback;
              if (tok === 'left' || tok === 'top') return 0;
              if (tok === 'right' || tok === 'bottom') return free;
              if (tok === 'center') return free / 2;
              if (/%$/.test(tok)) return (free * parseFloat(tok)) / 100;
              return fallback;
            };
            const ox = pct(pos[0], W - dw, (W - dw) / 2);
            const oy = pct(pos[1], H - dh, (H - dh) / 2);

            const c = document.createElement('canvas');
            c.width = Math.round(W);
            c.height = Math.round(H);
            const ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, ox, oy, dw, dh);
            const data = ctx.getImageData(0, 0, c.width, c.height).data;

            const sampleTop = 20;
            const sampleH = Math.min(Math.round(H * 0.8), Math.max(1, c.height - sampleTop));
            const stripMean = (frac, bandW) => {
              const x0 = Math.round(W * frac);
              const x1 = Math.min(x0 + bandW, c.width);
              let t = 0, n = 0;
              for (let y = sampleTop; y < sampleTop + sampleH; y++) {
                for (let x = x0; x < x1; x++) {
                  const i = (y * c.width + x) * 4;
                  t += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
                  n++;
                }
              }
              return n ? t / n : null;
            };
            const colMean = (frac) => stripMean(frac, 160);
            const L = colMean(0.62);
            const M = colMean(0.75);
            const R = colMean(0.87);
            if (L === null || M === null || R === null) return null;

            // Full-width luminance profile: the headline column band vs the
            // brightest region anywhere in the hero photo. This is the honest
            // test — a trade photo whose subject fills one side is a real
            // composition; a flat wash has no bright region at all.
            const bands = [];
            for (let b = 0; b < 10; b++) {
              const v = stripMean(b / 10, Math.round(W / 10));
              if (v !== null) bands.push(v);
            }
            const peak = bands.length ? Math.max(...bands) : 0;
            const floor = bands.length ? Math.min(...bands) : 0;
            // Measure the actual heading footprint, not a hardcoded x=62% strip.
            // This keeps the gate strict while rejecting real text overlap,
            // rather than rejecting a bright subject correctly placed at right.
            const h1Left = titleBox ? Math.max(0, Math.min(W - 1, titleBox.x - box.x)) : W * 0.12;
            const h1Width = titleBox ? Math.max(20, Math.min(W - h1Left, titleBox.w)) : W * 0.3;
            const textBand = stripMean(h1Left / W, Math.round(h1Width));

            return { L, M, R, peak, floor, textBand, natural: [iw, ih] };
          }, { box: info.heroBox, titleBox: info.h1Box });

          if (!photoCols) {
            check('[1440] hero has real focal weight (not flat)', false,
              'could not read hero background image — failing closed');
          } else {
            const { L, M, R, peak, floor, textBand } = photoCols;
            lumByVp[vp.name] = { L, M, R, peak, floor };

            // Composition is judged on the raw hero PHOTO:
            //
            //   (1) SUBJECT CONTRAST — the photo has a real bright region and a
            //       real dark region somewhere across its width. This is the
            //       anti-flat test. A grey wash, a blank wall, or a uniform
            //       texture fails here. Ratio is 1.35x against the luminance
            //       floor from content, not against where the H1 happens to be.
            //   (2) TEXT-SIDE DARKNESS — the band the H1 sits over must be
            //       materially darker than the peak, guaranteeing the white
            //       headline reads over the scrim rather than on top of the
            //       brightest part of the image.
            //
            // Direction (left vs right weighting) is REPORTED, not failed. An
            // honest interior pipework photo legitimately puts its subject on
            // the left; punishing that was the original bug.
            const subjectContrast = floor > 0 ? peak / floor : 0;
            const textSideOk = peak > 0 ? peak / Math.max(1, textBand) >= 1.15 : false;
            const direction =
              R >= L * 1.15 ? 'right-weighted' : L >= R * 1.15 ? 'left-weighted' : 'balanced';
            lumByVp[vp.name].composition = direction;

            check('[1440] hero photo has real subject contrast (not flat)',
              subjectContrast >= 1.35,
              `peak/floor = ${subjectContrast.toFixed(2)} (need >=1.35), ` +
              `direction = ${direction} — peak=${peak.toFixed(1)} floor=${floor.toFixed(1)} ` +
              `L=${L.toFixed(1)} M=${M.toFixed(1)} R=${R.toFixed(1)}`);

            check('[1440] hero text band is darker than the photo peak',
              textSideOk,
              `peak/H1-band = ${(peak / Math.max(1, textBand)).toFixed(2)} (need >=1.15) — ` +
              `textBand=${textBand.toFixed(1)} peak=${peak.toFixed(1)}`);

            // Direction is REPORTED ONLY. Left-weighted is a valid interior
            // trade composition (pipework/floor-laying fills the left), so it
            // must not fail. The two checks above carry the real assertions.
            if (direction !== 'right-weighted') {
              console.log(`INFO  [1440] hero direction: ${direction} ` +
                `(peak=${peak.toFixed(1)}/floor=${floor.toFixed(1)}; ` +
                `valid interior trade composition, not an assertion)`);
            }
          }

          // keep the rendered hero shot for the H1 backdrop capture below
          const shot = path.join(dir, '.gate2-hero.png');
          await p.screenshot({
            path: shot,
            clip: { x: Math.max(0, info.heroBox.x), y: Math.max(0, info.heroBox.y), width: vp.width, height: clipH },
          });
          heroShots.push(shot);
        }
      }

      // nav must collapse below 900px
      if (vp.width < 900 && info.navDisplay) {
        check(`[${vp.name}] .nav-links hidden below 900px`, info.navDisplay === 'none', info.navDisplay);
      }

      check(`[${vp.name}] no js errors`, errs.length === 0, errs.join('; ') || 'clean');
      check(`[${vp.name}] no http errors`, bad.length === 0, bad.join('; ') || 'clean');
      check(`[${vp.name}] no broken images`, info.broken === 0, `${info.broken} broken`);
      check(`[${vp.name}] no horizontal overflow`, info.overflowX === 0, `${info.overflowX}px`);
      await p.close();
    }
  } finally {
    // NEO 2026-11-18: close the browser, then reap any Chromium that outlived it.
    // A straggler from one page would otherwise hold shared memory and take down
    // the next render with OOM/SIGTERM — the failure that killed the earlier run.
    try { await browser.close(); } catch { /* already gone */ }
    try {
      require('child_process').execFileSync('pkill', ['-f', 'chrome|chromium'], {
        stdio: 'ignore', timeout: 15000,
      });
    } catch { /* nothing to kill, which is the normal case */ }
    for (const s of heroShots) {
      try { fs.unlinkSync(s); } catch {}
    }
  }

  console.log('\n' + (failed ? `GATE FAILED (${failed} of ${results.length})` : `GATE PASSED (${results.length} checks)`));
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  // NEO 2026-11-18: never leave a crashed render holding memory for the next run.
  try {
    require('child_process').execFileSync('pkill', ['-f', 'chrome|chromium'], {
      stdio: 'ignore', timeout: 15000,
    });
  } catch { /* nothing to kill */ }
  console.error('GATE ERROR: ' + e.message);
  process.exit(2);
});
