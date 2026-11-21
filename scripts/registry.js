#!/usr/bin/env node
/**
 * NEO global image registry — zero recycling across the whole board.
 *
 * Scans every built slug in the repo, extracts each image's declared origin
 * photo (asset-sources.json) and its actual sha256 bytes, and reports:
 *   - any origin photo used by 2+ prospects
 *   - any identical asset bytes on 2+ prospects
 *   - any declared sha256 that does not match the bytes on disk
 *
 * Writes scripts/global-registry.json as the canonical map that gate2.js
 * consumes via --registry, so a single build can be checked against all others.
 *
 * Usage: node scripts/registry.js [--json]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

const slugs = fs
  .readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !['scripts', '.git', 'node_modules'].includes(d.name))
  .map((d) => d.name)
  .filter((d) => fs.existsSync(path.join(root, d, 'index.html')));

const origins = {}; // origin -> [{slug, file}]
const hashes = {}; // slug -> [sha256]
const mismatches = [];
const missingProv = [];

for (const slug of slugs) {
  const dir = path.join(root, slug);
  const provPath = path.join(dir, 'asset-sources.json');
  const assetDir = path.join(dir, 'assets');
  const files = fs.existsSync(assetDir) ? fs.readdirSync(assetDir) : [];
  hashes[slug] = [];

  // Only treat assets as "sourced photography" if a real origin is declared.
  // Generated favicons and PENDING_AG placeholders are not stock photos and
  // must not be compared across sites.
  const declared = new Set();
  if (fs.existsSync(provPath)) {
    const p0 = JSON.parse(fs.readFileSync(provPath, 'utf8'));
    const f0 = { ...(p0.assets || {}) };
    for (const [k, v] of Object.entries(p0)) if (k !== 'assets') f0[k] = v;
    for (const [file, v] of Object.entries(f0)) {
      if (!/\.(jpe?g|png|webp)$/i.test(file)) continue;
      const origin = typeof v === 'string' ? v : v && (v.source_url || v.source);
      if (origin && origin !== 'PENDING_AG' && !String(origin).startsWith('generated:')) declared.add(file.toLowerCase());
    }
  }
  for (const f of files) {
    if (!/\.(jpe?g|png|webp)$/i.test(f)) continue;
    if (!declared.has(f.toLowerCase())) continue;
    hashes[slug].push(sha(path.join(assetDir, f)));
  }

  if (!fs.existsSync(provPath)) {
    if (files.length) missingProv.push(slug);
    continue;
  }
  const prov = JSON.parse(fs.readFileSync(provPath, 'utf8'));
  const flat = { ...(prov.assets || {}) };
  for (const [k, v] of Object.entries(prov)) if (k !== 'assets') flat[k] = v;

  for (const [file, v] of Object.entries(flat)) {
    if (!/\.(jpe?g|png|webp)$/i.test(file)) continue;
    const origin = typeof v === 'string' ? v : v && (v.source_url || v.source);
    if (!origin || origin === 'PENDING_AG' || String(origin).startsWith('generated:')) continue;
    (origins[origin] = origins[origin] || []).push({ slug, file });
    if (typeof v === 'object' && v.sha256) {
      const real = files.find((x) => x.toLowerCase() === file.toLowerCase());
      if (real && sha(path.join(assetDir, real)) !== v.sha256) {
        mismatches.push(`${slug}/${file} declared ${v.sha256.slice(0, 12)}… actual ${sha(path.join(assetDir, real)).slice(0, 12)}…`);
      }
    }
  }
}

const reused = Object.entries(origins).filter(([, users]) => new Set(users.map((u) => u.slug)).size > 1);

const byHash = {};
for (const [slug, hs] of Object.entries(hashes)) for (const h of hs) (byHash[h] = byHash[h] || []).push(slug);
const dupBytes = Object.entries(byHash).filter(([, s]) => new Set(s).size > 1);

if (process.argv.includes('--json')) {
  const out = { origins: Object.fromEntries(Object.entries(origins).map(([o, u]) => [o, [...new Set(u.map((x) => x.slug))]])), hashes };
  fs.writeFileSync(path.join(root, 'scripts', 'global-registry.json'), JSON.stringify(out, null, 2));
  console.log(`wrote scripts/global-registry.json — ${slugs.length} slugs, ${Object.keys(origins).length} distinct origin photos`);
  process.exit(0);
}

console.log(`scanned ${slugs.length} slugs\n`);

if (reused.length) {
  console.log(`FAIL  ${reused.length} origin photo(s) reused across different prospects:`);
  for (const [origin, users] of reused) {
    console.log(`      ${origin.split('/').pop()}`);
    for (const u of users) console.log(`        - ${u.slug}/${u.file}`);
  }
} else {
  console.log('PASS  no origin photo used by more than one prospect');
}

if (dupBytes.length) {
  console.log(`\nFAIL  ${dupBytes.length} asset file(s) with identical bytes on 2+ prospects:`);
  for (const [h, s] of dupBytes) console.log(`      ${h.slice(0, 12)}…  ${[...new Set(s)].join(', ')}`);
} else {
  console.log('PASS  no identical asset bytes shared between prospects');
}

if (mismatches.length) {
  console.log(`\nFAIL  ${mismatches.length} declared sha256 mismatch(es):`);
  for (const m of mismatches) console.log(`      ${m}`);
} else {
  console.log('PASS  every declared sha256 matches its file');
}

if (missingProv.length) {
  console.log(`\nFAIL  ${missingProv.length} slug(s) with assets but no asset-sources.json: ${missingProv.join(', ')}`);
} else {
  console.log('PASS  every slug with assets has a provenance file');
}

const bad = reused.length + dupBytes.length + mismatches.length + missingProv.length;
console.log('\n' + (bad ? `REGISTRY: ${bad} violation group(s)` : 'REGISTRY CLEAN'));
process.exit(bad ? 1 : 0);
