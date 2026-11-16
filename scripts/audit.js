#!/usr/bin/env node
/**
 * NEO board audit — runs gate2 (build 2) + global registry against every slug.
 * Produces scripts/AUDIT.json and a readable summary.
 *
 * Usage: node scripts/audit.js
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const npmBin = '/home/node/.openclaw/workspace/node_modules';

const slugs = fs
  .readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !['scripts', '.git', 'node_modules'].includes(d.name))
  .map((d) => d.name)
  .filter((d) => fs.existsSync(path.join(root, d, 'index.html')))
  .sort();

const out = [];
for (const slug of slugs) {
  let res = { slug, passed: false, checks: 0, failed: 0, failures: [], error: null };
  try {
    const txt = execFileSync('node', ['scripts/gate2.js', `${slug}/index.html`, '--registry', 'scripts/global-registry.json'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, NODE_PATH: npmBin },
      maxBuffer: 20 * 1024 * 1024,
    });
    const m = txt.match(/GATE PASSED \((\d+) checks\)/);
    res.passed = !!m;
    res.checks = m ? +m[1] : 0;
    res.failures = txt.split('\n').filter((l) => l.startsWith('FAIL')).map((l) => l.slice(6).trim());
  } catch (e) {
    const txt = (e.stdout || '') + (e.stderr || '');
    const m = txt.match(/GATE FAILED \((\d+) of (\d+)\)/);
    if (m) {
      res.failed = +m[1];
      res.checks = +m[2];
      res.failures = txt.split('\n').filter((l) => l.startsWith('FAIL')).map((l) => l.slice(6).trim());
    } else {
      res.error = (e.stderr || e.message || '').split('\n')[0].slice(0, 200);
    }
  }
  out.push(res);
  const tag = res.passed ? 'PASS' : res.error ? 'ERR ' : 'FAIL';
  console.log(`${tag}  ${slug}${res.passed ? ` (${res.checks} checks)` : res.failed ? ` (${res.failed} of ${res.checks})` : ''}`);
  for (const f of res.failures.slice(0, 6)) console.log(`        ${f}`);
}

fs.writeFileSync(path.join(root, 'scripts', 'AUDIT.json'), JSON.stringify({ generated: new Date().toISOString(), results: out }, null, 2));
const pass = out.filter((r) => r.passed).length;
console.log(`\n${pass}/${out.length} slugs GATE PASSED (build 2, ${out[0]?.checks || 0} checks each)`);
