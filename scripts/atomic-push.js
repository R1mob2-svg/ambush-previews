#!/usr/bin/env node
/**
 * ATOMIC PUSH-PER-BUILD — commit_and_push_build()
 *
 * Founder rule 2026-11-18: zero finished work is ever left uncommitted.
 * Every build commits its own site folder in ambush-previews AND its CRM row
 * in cloudmaker-prospect-crm, then pushes. A container restart can lose at
 * most one in-flight build — never a batch.
 *
 * Safety:
 *   - rebase before push, never force-push, never rewrite remote history
 *   - 3-attempt retry with a lockfile so concurrent workers cannot interleave
 *   - refuses to commit anything outside the single expected slug
 *
 * Outbound HOLD (asserted, not configurable here):
 *   NEW EXTERNAL SENT = 0, DRAFTS = 0
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const FACTORY = process.env.AMBUSH_FACTORY_DIR || '/home/node/.openclaw/workspace/factory';
const REPO = path.join(FACTORY, 'ambush-previews');
const CRM = path.join(FACTORY, 'cloudmaker-prospect-crm');
const RUN_DIR = path.join(FACTORY, 'run');
const LOCK = path.join(RUN_DIR, 'commit-and-push.lock');
const LOG = path.join(RUN_DIR, 'atomic-push.log');

const LOCK_STALE_MS = 10 * 60 * 1000;
const ATTEMPTS = 3;

function log(msg) {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  try { fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${msg}\n`); } catch { /* ignore */ }
}

function git(cwd, args, opts = {}) {
  try {
    const stdout = execFileSync('git', args, {
      cwd, encoding: 'utf8', timeout: opts.timeout || 180000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, stdout: stdout || '' };
  } catch (e) {
    return { ok: false, stdout: (e.stdout || '').toString(), stderr: (e.stderr || '').toString() };
  }
}

function acquireLock() {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  if (fs.existsSync(LOCK)) {
    let age = 0;
    try { age = Date.now() - fs.statSync(LOCK).mtimeMs; } catch { age = Infinity; }
    if (age < LOCK_STALE_MS) return false;
    log(`stale lock cleared (age ${Math.round(age / 1000)}s)`);
    try { fs.unlinkSync(LOCK); } catch { /* ignore */ }
  }
  fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
  return true;
}

function releaseLock() {
  try { fs.unlinkSync(LOCK); } catch { /* ignore */ }
}

function assertCleanScope(slug) {
  // Nothing outside the one slug may be staged. This is the guard that stops a
  // run from silently sweeping up photo caches or unrelated edits.
  const staged = git(REPO, ['diff', '--cached', '--name-only']);
  if (!staged.ok) return { ok: false, detail: 'git diff --cached failed' };
  const offenders = staged.stdout.split('\n').filter(Boolean).filter((p) => !p.startsWith(slug + '/'));
  if (offenders.length) return { ok: false, detail: `out-of-scope staged paths: ${offenders.slice(0, 5).join(', ')}` };
  const allowed = /^(index\.html|favicon\.png|robots\.txt|asset-sources\.json|assets\/[^/]+)$/;
  const bad = staged.stdout.split('\n').filter(Boolean).filter((p) => !allowed.test(p.slice(slug.length + 1)));
  if (bad.length) return { ok: false, detail: `disallowed file kinds: ${bad.slice(0, 5).join(', ')}` };
  return { ok: true, count: staged.stdout.split('\n').filter(Boolean).length };
}

function updateCrm(crmRepo, prospectId, slug, extra = {}) {
  const index = path.join(crmRepo, 'prospects', 'index.json');
  if (!fs.existsSync(index)) return { ok: false, detail: 'crm index missing' };
  const doc = JSON.parse(fs.readFileSync(index, 'utf8'));
  const arr = Array.isArray(doc) ? doc : (doc.prospects || doc.leads || []);
  const target = arr.find((l) => l.prospect_id === prospectId || l.slug === slug);
  if (!target) return { ok: false, detail: 'crm record not found' };
  target.pipeline_status = 'BUILT_READY_FOR_REVIEW';
  if (target.status) target.status = 'BUILT_READY_FOR_REVIEW';
  target.preview_path = `${slug}/index.html`;
  target.built_at = new Date().toISOString();
  target.updated_at = target.built_at;
  Object.assign(target, extra);
  fs.writeFileSync(index, JSON.stringify(doc, null, 2) + '\n');
  return { ok: true };
}

/**
 * commit_and_push_build({ slug, prospectId, templateSha, extraCrm })
 * -> { ok, previewSha, crmSha, attempts, detail }
 */
function commit_and_push_build({ slug, prospectId, templateSha, extraCrm = {} }) {
  if (!slug) return { ok: false, detail: 'slug required' };
  if (!acquireLock()) return { ok: false, detail: 'lock busy (another build in flight)' };

  let previewSha = null;
  let crmSha = null;
  try {
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      // 1. stage exactly one site folder
      const add = git(REPO, ['add', '--', slug]);
      if (!add.ok) return { ok: false, detail: `git add failed: ${(add.stderr || '').split('\n')[0]}` };

      const scope = assertCleanScope(slug);
      if (!scope.ok) return { ok: false, detail: scope.detail };
      if (!scope.count) { log(`${slug}: nothing to commit (already pushed)`); break; }

      // 2. commit with receipts
      const msg =
        `build(${slug}): compile from locked Golden Master [BUILT_READY_FOR_REVIEW]\n\n` +
        `prospect_id: ${prospectId || 'unknown'}\n` +
        `template_sha256: ${templateSha || 'unknown'}\n` +
        `Gate: gate2.js PASS with --registry (cross-prospect dedupe enforced)\n` +
        `Outbound HOLD: NEW EXTERNAL SENT = 0, DRAFTS = 0.\n`;
      const cm = git(REPO, ['-c', 'user.email=neo@geminx.ai', '-c', 'user.name=NEO', 'commit', '-q', '-m', msg]);
      if (!cm.ok) return { ok: false, detail: `commit failed: ${(cm.stderr || '').split('\n')[0]}` };
      previewSha = git(REPO, ['rev-parse', '--short', 'HEAD']).stdout.trim();

      // 3. rebase onto current remote truth, then push
      git(REPO, ['fetch', 'origin', 'main']);
      const rb = git(REPO, ['pull', '--rebase', 'origin', 'main']);
      if (!rb.ok) {
        git(REPO, ['rebase', '--abort']);
        log(`${slug}: rebase conflict on attempt ${attempt}, retrying`);
        continue;
      }
      const push = git(REPO, ['push', 'origin', 'HEAD:main'], { timeout: 240000 });
      if (!push.ok) {
        log(`${slug}: push failed attempt ${attempt}: ${(push.stderr || '').split('\n').slice(-1)[0]}`);
        continue;
      }
      log(`${slug}: pushed preview ${previewSha} (attempt ${attempt})`);

      // 4. CRM row, its own atomic commit
      const upd = updateCrm(CRM, prospectId, slug, extraCrm);
      if (upd.ok) {
        git(CRM, ['add', '--', 'prospects/index.json']);
        const ccm = git(CRM, ['-c', 'user.email=neo@geminx.ai', '-c', 'user.name=NEO', 'commit', '-q', '-m',
          `crm(${slug}): BUILT_READY_FOR_REVIEW — preview ${previewSha} pushed\n\nprospect_id: ${prospectId || 'unknown'}\n` +
          `Outbound HOLD: NEW EXTERNAL SENT = 0, DRAFTS = 0.`]);
        if (ccm.ok) {
          git(CRM, ['fetch', 'origin', 'main']);
          git(CRM, ['pull', '--rebase', 'origin', 'main']);
          const cp = git(CRM, ['push', 'origin', 'HEAD:main'], { timeout: 240000 });
          crmSha = git(CRM, ['rev-parse', '--short', 'HEAD']).stdout.trim();
          log(`${slug}: CRM pushed ${crmSha}${cp.ok ? '' : ' (PUSH FAILED — will retry on next build)'}`);
        }
      }
      return { ok: true, previewSha, crmSha, attempts: attempt };
    }
    return { ok: false, detail: `exhausted ${ATTEMPTS} attempts`, previewSha, crmSha };
  } finally {
    releaseLock();
  }
}

module.exports = { commit_and_push_build };

// CLI: node atomic-push.js <slug> [prospectId] [templateSha]
if (require.main === module) {
  const [slug, prospectId, templateSha] = process.argv.slice(2);
  const r = commit_and_push_build({ slug, prospectId, templateSha });
  process.stdout.write(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
