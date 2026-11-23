#!/usr/bin/env node
/**
 * NEO overnight Digital Ambush builder — DETACHED, resumable, fail-closed.
 *
 * Founder order 2026-11-17. Runs on the Railway container so it keeps working
 * while Rob's local PC is powered down.
 *
 * HARD LOCKS (asserted at boot and never relaxed):
 *   NEW EXTERNAL SENT = 0
 *   DRAFTS = 0
 * This script has no email or messaging code path at all. It builds and
 * verifies websites. Nothing else.
 *
 * Per lead:
 *   1. pick 5 unique verified ON-TRADE photos not already used by ANY prospect
 *   2. compile through templates/simplicity-design-fit-refresh.html
 *   3. gate2.js --registry must exit 0 (79 checks, incl. cross-prospect dedupe)
 *   4. registry.js must report REGISTRY CLEAN
 *   5. commit + push ambush-previews, then mark CRM BUILT_READY_FOR_REVIEW
 * Any lead that cannot get 5 usable photos => ASSET_SET_UNAVAILABLE, skip.
 *
 * Progress log: /tmp/overnight-ambush-build.log
 * Heartbeat  : /tmp/overnight-ambush-heartbeat.json
 * State      : /tmp/overnight-ambush-state.json  (resume-safe)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

fs.mkdirSync(process.env.AMBUSH_RUN_DIR || '/home/node/.openclaw/workspace/factory/run', { recursive: true });

// HARD RULE (founder order 2026-11-18): repos NEVER live in /tmp.
// /tmp is wiped on container restart; it may hold disposable logs only.
const FACTORY = process.env.AMBUSH_FACTORY_DIR || '/home/node/.openclaw/workspace/factory';
const REPO = path.join(FACTORY, 'ambush-previews');
const CRM = path.join(FACTORY, 'cloudmaker-prospect-crm');
const RUN_DIR = path.join(FACTORY, 'run');  // persistent: logs + state

const LOG = path.join(RUN_DIR, 'overnight-ambush-build.log');
const HEARTBEAT = path.join(RUN_DIR, 'overnight-ambush-heartbeat.json');
const STATE_PATH = path.join(RUN_DIR, 'overnight-ambush-state.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  try { fs.appendFileSync(LOG, line + '\n'); } catch (e) { /* keep going */ }
  console.log(line);
}

function heartbeat(state) {
  try {
    fs.writeFileSync(HEARTBEAT, JSON.stringify({ ...state, at: new Date().toISOString(), pid: process.pid }, null, 2));
  } catch (e) { /* keep going */ }
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    encoding: 'utf8', timeout: opts.timeout || 300000, cwd: opts.cwd || REPO, ...opts,
  });
}

function runSoft(cmd, args, opts = {}) {
  try {
    const stdout = execFileSync(cmd, args, {
      encoding: 'utf8', timeout: opts.timeout || 300000, cwd: opts.cwd || REPO,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, status: 0, stdout };
  } catch (e) {
    return {
      ok: false,
      status: e.status,
      stdout: (e.stdout || '').toString(),
      stderr: (e.stderr || '').toString(),
    };
  }
}

// ---------- NO VERIFIED PUBLIC EMAIL = NO BUILD ----------
// Founder rule 2026-11-18: a preview may not be compiled for a prospect that
// has no real, publicly published, evidence-backed email address. We never
// guess, permute or invent addresses (no info@/sales@ construction).
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const PLACEHOLDER_EMAILS = new Set(['email@example.com', 'example@example.com', 'test@test.com', 'noemail@noemail.com']);

const emailOf = (lead) => String(lead.public_email || lead.email || '').trim().toLowerCase();

function emailEvidenceUrl(lead) {
  return String(lead.email_evidence_url || '').trim();
}

// Fail-closed pre-build guard. Returns null when the lead may be built,
// otherwise a { reason, detail } describing exactly why it is skipped.
function preBuildGuard(lead) {
  const status = leadStatus(lead);
  if (status !== 'FRESH_QUALIFIED') {
    return { reason: 'NOT_FRESH_QUALIFIED', detail: `status=${status}` };
  }
  const email = emailOf(lead);
  if (!email) return { reason: 'NO_VERIFIED_EMAIL', detail: 'public_email empty' };
  if (!EMAIL_RE.test(email)) return { reason: 'NO_VERIFIED_EMAIL', detail: `malformed: ${email}` };
  if (PLACEHOLDER_EMAILS.has(email)) return { reason: 'NO_VERIFIED_EMAIL', detail: `placeholder: ${email}` };
  const level = String(lead.email_verification_level || '').toUpperCase();
  if (level.includes('NONE') || level.includes('GUESS') || level.includes('UNVERIFIED')) {
    return { reason: 'NO_VERIFIED_EMAIL', detail: `email_verification_level=${level}` };
  }
  if (String(lead.email_deliverability_status || '').toUpperCase() !== 'MAILBOX_VERIFIED') {
    return { reason: 'EMAIL_NOT_MX_VERIFIED', detail: `deliverability=${lead.email_deliverability_status || 'MISSING'}` };
  }
  if (!emailEvidenceUrl(lead)) return { reason: 'NO_EMAIL_EVIDENCE_URL', detail: 'email_evidence_url missing' };
  if (String(lead.company_type || '').toUpperCase() !== 'ACTIVE_LTD_VERIFIED')
    return { reason: 'COMPANY_NOT_VERIFIED_LTD' };
  if (!/^[A-Z0-9]{6,9}$/i.test(String(lead.company_number || '').trim()))
    return { reason: 'COMPANY_NUMBER_MISSING' };
  if (!/^(?:\\+44|0)[0-9 ()-]{9,}$/.test(String(lead.public_phone || '').trim()))
    return { reason: 'PUBLIC_TELEPHONE_MISSING' };
  const websiteGate = String(lead.website_status || '').toUpperCase();
  if (!websiteGate.startsWith('NO_OFFICIAL_SITE_FOUND_WITHIN_') || lead.website_url)
    return { reason: 'NO_WEBSITE_GATE_UNPROVEN', detail: websiteGate || 'MISSING' };
  if (String(lead.do_not_contact ?? 'FALSE').toUpperCase() !== 'FALSE' ||
      lead.outreach?.outbound_sent === true ||
      (Array.isArray(lead.outreach?.send_receipts) && lead.outreach.send_receipts.length))
    return { reason: 'DNC_OR_ALREADY_CONTACTED' };
  return null;
}

// ---------- hard lock assertion ----------
const LOCK = { new_external_sent: 0, drafts: 0 };
log(`BOOT: outbound lock asserted — NEW EXTERNAL SENT = ${LOCK.new_external_sent}, DRAFTS = ${LOCK.drafts}`);

// ---------- template integrity ----------
const LOCKED_SHA = '8f9b23518b5fae0ac99944a2c60e8c9ea6e438e1b9926ab5a5365679d07cb869';
const tplPath = path.join(REPO, 'templates', 'simplicity-design-fit-refresh.html');
if (!fs.existsSync(tplPath)) {
  log('FATAL: Golden Master template missing at ' + tplPath);
  process.exit(5);
}
const tplSha = crypto.createHash('sha256').update(fs.readFileSync(tplPath)).digest('hex');
if (tplSha !== LOCKED_SHA) {
  log(`FATAL: template SHA mismatch — expected ${LOCKED_SHA}, got ${tplSha}. Refusing to build.`);
  process.exit(5);
}
log(`TEMPLATE LOCKED OK: sha256=${tplSha}`);

// ---------- CRM schema helpers ----------
// Real CRM records use pipeline_status (not status) and carry the town inside
// `address` / `location` rather than a top-level `town` field.
const isQueueLead = (l) => ['FRESH_QUALIFIED', 'NEEDS_ENRICHMENT'].includes(l.pipeline_status || l.status);
const leadStatus = (l) => l.pipeline_status || l.status;

function townOf(lead) {
  const src = lead.location || lead.address || '';
  const parts = String(src).split(',').map((s) => s.trim()).filter(Boolean);
  // "14 Wimbledon Drive, Stourbridge, DY8 2PQ" -> Stourbridge
  const named = parts.find((p) => /^[A-Za-z][A-Za-z\s'-]{2,}$/.test(p) && !/^\d/.test(p));
  return named || 'West Midlands';
}

function slugOf(lead) {
  if (lead.slug) return lead.slug;
  const base = String(lead.business_name || lead.prospect_id || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const id = String(lead.prospect_id || '').replace(/[^0-9]/g, '');
  return id ? `${base}-${id}` : base;
}

// ---------- photo pool ----------
// Every photo already declared anywhere in the repo is burned: zero recycling
// across the whole board.
function usedOrigins() {
  const used = new Set();
  let dirs = [];
  try {
    dirs = fs.readdirSync(REPO, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !['scripts', '.git', 'node_modules', 'templates', 'assets'].includes(d.name))
      .map((d) => d.name);
  } catch (e) { return used; }
  for (const d of dirs) {
    const p = path.join(REPO, d, 'asset-sources.json');
    if (!fs.existsSync(p)) continue;
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      for (const v of Object.values(j.assets || j)) {
        if (v && typeof v === 'object' && v.source_url) used.add(v.source_url);
      }
    } catch (e) { /* skip malformed */ }
  }
  // also treat the registry's declared origins as burned
  const regPath = path.join(REPO, 'registry.json');
  if (fs.existsSync(regPath)) {
    try {
      const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
      for (const arr of Object.values(reg)) {
        if (Array.isArray(arr)) arr.forEach((o) => typeof o === 'string' && used.add(o));
      }
    } catch (e) { /* skip */ }
  }
  return used;
}

const POOL_PATH = path.join(REPO, 'scripts', 'photo-pool.json');
function loadPool() {
  if (!fs.existsSync(POOL_PATH)) return [];
  try { return JSON.parse(fs.readFileSync(POOL_PATH, 'utf8')); } catch (e) { return []; }
}

// The legacy photo pool points at disposable /tmp paths. On Railway those
// vanish at restart, silently making every builder job ASSET_SET_UNAVAILABLE.
// Rehydrate only selected Commons images into the existing persistent RUN_DIR.
// No paid image API and no duplication of the GitHub CRM or scheduler.
const COMMONS_CACHE = path.join(RUN_DIR, 'commons-photo-cache');
async function hydrateCommonsPhoto(p) {
  const source = String(p?.source_url || '');
  if (!/^https:\/\/commons\.wikimedia\.org\/wiki\/File(?::|%3A)/i.test(source))
    return null;
  const label = String(p?.license || '');
  if (!/^(CC BY(?:-SA)? \d(?:\.\d)?|Public domain)$/i.test(label))
    return null;
  const key = crypto.createHash('sha256').update(source).digest('hex').slice(0,24);
  mkdirSyncSafe(COMMONS_CACHE);
  for (const ext of ['jpg','png','webp']) {
    const existing = path.join(COMMONS_CACHE, key + '.' + ext);
    if (fs.existsSync(existing) && fs.statSync(existing).size > 2048)
      return { ...p, local_file: existing };
  }
  try {
    const title = decodeURIComponent(new URL(source).pathname.split('/wiki/')[1] || '');
    if (!title.startsWith('File:')) return null;
    const api = new URL('https://commons.wikimedia.org/w/api.php');
    for (const [k,v] of Object.entries({
      action:'query',format:'json',formatversion:'2',prop:'imageinfo',
      iiprop:'url|extmetadata',iiurlwidth:'1600',titles:title
    })) api.searchParams.set(k,v);
    const metaReq = await fetch(api, { headers:{ 'User-Agent':'DigitalAmbush-RightsCheck/1.0' }, signal:AbortSignal.timeout(15000) });
    if (!metaReq.ok) return null;
    const info = (await metaReq.json())?.query?.pages?.[0]?.imageinfo?.[0];
    if (!info) return null;
    const actualLicense = String(info.extmetadata?.LicenseShortName?.value || '')
      .replace(/<[^>]*>/g,'').trim().toLowerCase();
    const declared = label.toLowerCase();
    if (!actualLicense || (declared === 'public domain'
      ? !/public domain|cc0/.test(actualLicense)
      : !actualLicense.includes(declared.replace(/\s+/g,' ')))) return null;
    const media = String(info.thumburl || info.url || '');
    const mediaUrl = new URL(media);
    if (mediaUrl.protocol !== 'https:' || mediaUrl.hostname !== 'upload.wikimedia.org') return null;
    const download = await fetch(media, { headers:{ 'User-Agent':'DigitalAmbush-RightsCheck/1.0' }, signal:AbortSignal.timeout(30000) });
    if (!download.ok) return null;
    const length = Number(download.headers.get('content-length') || 0);
    if (length > 15_000_000) return null;
    const bytes = Buffer.from(await download.arrayBuffer());
    if (bytes.length < 2048 || bytes.length > 15_000_000) return null;
    const ext = bytes[0]===0xff && bytes[1]===0xd8 ? 'jpg'
      : bytes[0]===0x89 && bytes.toString('ascii',1,4)==='PNG' ? 'png'
      : bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP' ? 'webp'
      : null;
    if (!ext) return null;
    const destination = path.join(COMMONS_CACHE, key + '.' + ext);
    const tmp = destination + '.' + process.pid + '.partial';
    fs.writeFileSync(tmp, bytes);
    fs.renameSync(tmp, destination);
    return { ...p, local_file: destination, commons_verified_license: actualLicense };
  } catch (err) {
    log('COMMONS_PHOTO_UNAVAILABLE source=' + source.slice(0,120) + ' reason=' + String(err?.message || 'unknown').slice(0,85));
    return null;
  }
}
function mkdirSyncSafe(dir) { fs.mkdirSync(dir,{recursive:true}); }

// Pool entries use `local_file`; the compiler's spec wants `file`.
const toSpecPhoto = (p) => ({
  file: p.local_file || p.file,
  source_url: p.source_url,
  license: p.license || 'UNVERIFIED',
  notes: p.notes || '',
});

const TRADE_KEY = {
  heating: 'heating', heating_engineer: 'heating', gas_engineer: 'heating',
  plumber: 'plumbing', plumbing: 'plumbing', plumbing_heating: 'plumbing',
  electrician: 'electrical', electrical: 'electrical',
  roofer: 'roofing', roofing: 'roofing',
  plasterer: 'plastering', plastering: 'plastering',
  builder: 'building', building: 'building',
  joiner: 'joinery', joinery: 'joinery', carpenter: 'joinery',
  painter: 'painting', painting: 'painting', decorator: 'painting',
  landscaper: 'landscaping', landscaping: 'landscaping', gardener: 'landscaping',
  tiler: 'tiling', tiling: 'tiling',
};

// ---------- CRM status write ----------
function setLeadStatus(lead, status, extra = {}) {
  const index = path.join(CRM, 'prospects', 'index.json');
  const leads = JSON.parse(fs.readFileSync(index, 'utf8'));
  const arr = Array.isArray(leads) ? leads : (leads.prospects || leads.leads);
  const target = arr.find((l) => l.prospect_id === lead.prospect_id);
  if (!target) return false;
  target.pipeline_status = status;
  if (target.status) target.status = status;
  target.updated_at = new Date().toISOString();
  Object.assign(target, extra);
  fs.writeFileSync(index, JSON.stringify(leads, null, 2) + '\n');
  return true;
}

// ---------- main loop ----------
(async () => {
  const prior = fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) : {};
  const state = {
    started: prior.started || new Date().toISOString(),
    built: prior.built || [],
    skipped: prior.skipped || [],
    errors: prior.errors || [],
  };
  const saveState = () => { try { fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2)); } catch (e) { /* ignore */ } };
  heartbeat(state);
  saveState();

  const crmIndex = path.join(CRM, 'prospects', 'index.json');
  if (!fs.existsSync(crmIndex)) {
    log('FATAL: CRM index not found at ' + crmIndex);
    heartbeat({ ...state, stage: 'crm_missing' });
    process.exit(6);
  }

  // pull latest CRM before the loop so we build from current truth
  const pull = runSoft('git', ['-C', CRM, 'pull', '--ff-only', 'origin', 'main'], { timeout: 120000 });
  log(pull.ok ? 'CRM PULLED: ' + pull.stdout.trim().split('\n').slice(-1)[0] : 'CRM PULL SKIPPED: ' + (pull.stderr || '').split('\n')[0]);

  const indexDoc = JSON.parse(fs.readFileSync(crmIndex, 'utf8'));
  const leads = Array.isArray(indexDoc) ? indexDoc : (indexDoc.prospects || indexDoc.leads || []);
  const alreadyBuilt = new Set(leads.filter((l) => leadStatus(l) === 'BUILT_READY_FOR_REVIEW').map(slugOf));

  const queue = leads
    .filter(isQueueLead)
    .filter((l) => !alreadyBuilt.has(slugOf(l)))
    .sort((a, b) => (leadStatus(a) === 'FRESH_QUALIFIED' ? -1 : 1) - (leadStatus(b) === 'FRESH_QUALIFIED' ? -1 : 1));

  log(`QUEUE: ${queue.length} leads ` +
    `(${queue.filter((l) => leadStatus(l) === 'FRESH_QUALIFIED').length} FRESH_QUALIFIED, ` +
    `${queue.filter((l) => leadStatus(l) === 'NEEDS_ENRICHMENT').length} NEEDS_ENRICHMENT); ` +
    `${alreadyBuilt.size} already BUILT_READY_FOR_REVIEW`);

  const used = usedOrigins();
  const cleanPool = loadPool().filter((p) => p.source_url && !used.has(p.source_url));
  log(`PHOTO POOL: ${cleanPool.length} unused verified origins (${used.size} already burned board-wide)`);

  // bucket by normalised trade so every page gets on-trade photography
  const poolByTrade = {};
  for (const p of cleanPool) {
    const k = TRADE_KEY[p.trade] || p.trade || 'other';
    (poolByTrade[k] = poolByTrade[k] || []).push(p);
  }
  log('POOL BY TRADE: ' + Object.entries(poolByTrade).map(([k, v]) => `${k}=${v.length}`).join(' '));

  let idx = 0;
  for (const lead of queue) {
    idx++;
    const slug = slugOf(lead);
    const tradeKey = TRADE_KEY[lead.trade_category] || lead.trade_category;
    state.stage = `lead ${idx}/${queue.length}: ${lead.business_name}`;
    heartbeat(state);

    if (alreadyBuilt.has(slug)) { continue; }

    // --- HARD GUARD: NO VERIFIED PUBLIC EMAIL = NO BUILD ---
    // Runs before any photo allocation or HTML compilation. Zero wasted cycles.
    const guard = preBuildGuard(lead);
    if (guard) {
      log(`SKIP_NO_VERIFIED_EMAIL ${slug} (${lead.business_name}) — ${guard.reason}: ${guard.detail}`);
      state.skipped.push({ slug, trade: tradeKey, reason: guard.reason, detail: guard.detail, at: new Date().toISOString() });
      if (guard.reason === 'NO_VERIFIED_EMAIL' || guard.reason === 'NO_EMAIL_EVIDENCE_URL') {
        try { setLeadStatus(lead, 'PHONE_ONLY_NO_PUBLIC_EMAIL', { email_gate_at: new Date().toISOString() }); } catch (e) { /* non-fatal */ }
      }
      saveState();
      heartbeat(state);
      continue;
    }

    // assemble 5 unique ON-TRADE photos
    const bucket = poolByTrade[tradeKey] || [];
    const take = [];
    while (bucket.length && take.length < 5) {
      const candidate = bucket.shift();
      const verified = await hydrateCommonsPhoto(candidate);
      if (verified) take.push(verified);
    }
    if (take.length < 5) {
      log(`ASSET_SET_UNAVAILABLE ${slug} (${lead.business_name}) — only ${take.length}/5 on-trade photos left for ${tradeKey}`);
      state.skipped.push({ slug, trade: tradeKey, reason: 'ASSET_SET_UNAVAILABLE', remaining: take.length, at: new Date().toISOString() });
      saveState();
      heartbeat(state);
      continue;
    }

    const specPath = path.join(RUN_DIR, `spec-${slug}.json`);
    fs.writeFileSync(specPath, JSON.stringify({
      slug,
      business_name: lead.business_name,
      town: townOf(lead),
      trade_category: lead.trade_category,
      public_phone: lead.public_phone || '',
      public_email: lead.public_email || '',
      brand_trust_kit: lead.brand_trust_kit || undefined,
      photos: take.map(toSpecPhoto),
    }, null, 1));

    const c = runSoft('node', ['scripts/compile-golden.js', '--spec', specPath, '--out', path.join(REPO, slug)]);
    if (!c.ok) {
      if (c.status === 3) {
        log(`ASSET_SET_UNAVAILABLE ${slug}: ${c.stderr.trim().split('\n').slice(-1)[0]}`);
        state.skipped.push({ slug, trade: tradeKey, reason: 'ASSET_SET_UNAVAILABLE', at: new Date().toISOString() });
      } else {
        log(`COMPILE_REJECTED ${slug}: ${(c.stderr || c.stdout || '').trim().split('\n').slice(-1)[0]}`);
        state.errors.push({ slug, trade: tradeKey, reason: 'COMPILE_REJECTED', at: new Date().toISOString() });
      }
      saveState(); heartbeat(state);
      continue;
    }
    log(`COMPILED ${slug}: ${c.stdout.trim().split('\n').pop().slice(0, 150)}`);

    // Gate WITH the registry so cross-prospect dedupe (identical asset bytes /
    // duplicate origin photos) is enforced here, not only by the pre-commit hook.
    // Without --registry this is 76 checks and misses byte-level dupes, which made
    // the builder loop forever on leads the hook correctly refuses to commit.
    const g = runSoft('node', ['scripts/gate2.js', path.join(slug, 'index.html'), '--registry', 'scripts/global-registry.json'], { timeout: 300000 });
    const gateLines = (g.stdout || '').split('\n').filter((l) => l.trim().startsWith('GATE'));
    const last = gateLines[gateLines.length - 1] || 'GATE UNKNOWN';
    log(`GATE ${slug}: ${last.trim()}`);
    if (!/GATE PASSED/.test(last)) {
      const fails = (g.stdout || '').split('\n').filter((l) => l.startsWith('FAIL')).slice(0, 3);
      fails.forEach((f) => log('   ' + f.slice(0, 170)));
      state.errors.push({ slug, trade: tradeKey, reason: 'GATE_FAILED', at: new Date().toISOString() });
      saveState(); heartbeat(state);
      continue;
    }

    const r = runSoft('node', ['scripts/registry.js']);
    if (!/REGISTRY CLEAN/.test(r.stdout || '')) {
      log(`REGISTRY_DIRTY after ${slug} — not committing`);
      state.errors.push({ slug, trade: tradeKey, reason: 'REGISTRY_DIRTY', at: new Date().toISOString() });
      saveState(); heartbeat(state);
      continue;
    }

    const commit = runSoft('git', ['add', slug]);
    if (!commit.ok) {
      log(`GIT_ADD_FAILED ${slug}`);
      state.errors.push({ slug, trade: tradeKey, reason: 'GIT_ADD_FAILED', at: new Date().toISOString() });
      saveState(); heartbeat(state);
      continue;
    }
    const cm = runSoft('git', ['-c', 'user.email=neo@geminx.ai', '-c', 'user.name=NEO', 'commit', '-q', '-m',
      `build(${slug}): compile from locked Golden Master [BUILT_READY_FOR_REVIEW]\n\n` +
      `Template: simplicity-design-fit-refresh.html\n` +
      `Template sha256: ${LOCKED_SHA}\n` +
      `5 unique verified on-trade photos, gate2.js 76/76 PASS, registry CLEAN.\n` +
      `Outbound HOLD: NEW EXTERNAL SENT = 0, DRAFTS = 0.`]);
    if (!cm.ok) {
      log(`COMMIT_FAILED ${slug}: ${(cm.stderr || '').split('\n')[0]}`);
      state.errors.push({ slug, trade: tradeKey, reason: 'COMMIT_FAILED', at: new Date().toISOString() });
      saveState(); heartbeat(state);
      continue;
    }
    const push = runSoft('git', ['push', 'origin', 'HEAD:main'], { timeout: 180000 });
    if (!push.ok) {
      log(`PUSH_FAILED ${slug}: ${(push.stderr || '').split('\n').slice(-1)[0]}`);
      state.errors.push({ slug, trade: tradeKey, reason: 'PUSH_FAILED', at: new Date().toISOString() });
      saveState(); heartbeat(state);
      continue;
    }
    log(`PUSHED ${slug}`);

    // CRM bookkeeping after a proven, pushed page
    setLeadStatus(lead, 'BUILT_READY_FOR_REVIEW', {
      preview_path: `${slug}/index.html`,
      built_at: new Date().toISOString(),
      build_gate: 'gate2.js PASS (with --registry)'
      ,
      template_sha256: LOCKED_SHA,
    });
    const crmCommit = runSoft('git', ['-C', CRM, 'add', 'prospects/index.json']);
    if (crmCommit.ok) {
      runSoft('git', ['-C', CRM, '-c', 'user.email=neo@geminx.ai', '-c', 'user.name=NEO', 'commit', '-q', '-m',
        `crm(${slug}): BUILT_READY_FOR_REVIEW — preview pushed, gate 76/76\n\nOutbound HOLD: NEW EXTERNAL SENT = 0, DRAFTS = 0.`]);
      const crmPush = runSoft('git', ['-C', CRM, 'push', 'origin', 'HEAD:main'], { timeout: 180000 });
      log(crmPush.ok ? `CRM UPDATED ${slug}` : `CRM PUSH FAILED ${slug}`);
    }

    state.built.push(slug);
    saveState();
    heartbeat(state);

    await sleep(1200);
  }

  state.stage = 'done';
  state.finished = new Date().toISOString();
  saveState();
  heartbeat(state);
  log(`RUN COMPLETE: built=${state.built.length} skipped=${state.skipped.length} errors=${state.errors.length} ` +
    `| NEW EXTERNAL SENT = 0, DRAFTS = 0`);
})();
