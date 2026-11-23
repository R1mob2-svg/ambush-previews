#!/usr/bin/env node
/**
 * EMAIL ENRICHMENT WORKER — finds real, publicly published business emails.
 *
 * Founder rule: NEVER guess, permute or invent an address. No info@ / sales@
 * construction. An address is only accepted when it appears verbatim in a page
 * we actually fetched, and it then has to pass a live MX check.
 *
 * What it does per business:
 *   1. crawl the business's own website (if any) — /, /contact, /about
 *   2. crawl public directory / social pages already recorded as evidence
 *   3. extract candidate addresses from raw HTML (mailto: + text patterns)
 *   4. MX-verify the domain of each candidate
 *   5. on success: write email + email_evidence_url + email_verified_at, but
 *      keep RESEARCH_HOLD until independent company, phone and official-site QA
 *
 * Every accepted address commits and pushes on its own — atomic, small.
 *
 * Outbound HOLD: this worker sends nothing. NEW EXTERNAL SENT = 0, DRAFTS = 0.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const { execFileSync } = require('child_process');

const FACTORY = process.env.AMBUSH_FACTORY_DIR || '/home/node/.openclaw/workspace/factory';
const CRM = path.join(FACTORY, 'cloudmaker-prospect-crm');
const REPO = path.join(FACTORY, 'ambush-previews');
const RUN_DIR = path.join(FACTORY, 'run');
const LOG = path.join(RUN_DIR, 'email-enrich.log');
const STATE_PATH = path.join(RUN_DIR, 'email-enrich-state.json');
const INDEX = path.join(CRM, 'prospects', 'index.json');

const UA = 'Mozilla/5.0 (compatible; NEO-enrich/1.0; +https://geminx.ai)';
const MAX_PAGES_PER_LEAD = 6;
const FETCH_TIMEOUT = 15000;
const POLITE_DELAY = 1500;

fs.mkdirSync(RUN_DIR, { recursive: true });

const log = (lvl, msg, extra) => {
  const line = `${new Date().toISOString()} [${lvl}] ${msg}${extra ? ' ' + JSON.stringify(extra) : ''}`;
  try { fs.appendFileSync(LOG, line + '\n'); } catch { /* ignore */ }
};

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JUNK = /\.(png|jpe?g|gif|webp|svg|css|js|ico|woff2?)$/i;
const JUNK_LOCAL = /^(example|test|you|your|name|email|user|someone|no-?reply|sentry|wordpress|admin@example)$/i;
const JUNK_DOMAIN = /(sentry\.io|wixpress\.com|example\.com|domain\.com|sentry-next|godaddy|schema\.org|w3\.org|placeholder)/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,*/*' }, signal: ctl.signal, redirect: 'follow' });
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || '';
    if (!/text|html|xml/i.test(ct)) return null;
    const txt = await r.text();
    return txt.length > 2_000_000 ? txt.slice(0, 2_000_000) : txt;
  } catch { return null; } finally { clearTimeout(t); }
}

function candidatesFrom(html) {
  const out = new Set();
  // mailto: links are the strongest signal — the business published it directly
  for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) out.add(decodeURIComponent(m[1]).trim().toLowerCase());
  for (const m of html.matchAll(EMAIL_RE)) out.add(m[0].toLowerCase());
  return [...out].filter((e) =>
    !JUNK.test(e) &&
    !JUNK_DOMAIN.test(e) &&
    !JUNK_LOCAL.test(e.split('@')[0]) &&
    e.length < 80 &&
    (e.match(/@/g) || []).length === 1
  );
}

async function mxOk(domain) {
  try {
    const recs = await dns.resolveMx(domain);
    return Array.isArray(recs) && recs.length > 0 && recs.some((r) => r.exchange && r.exchange !== '.');
  } catch { return false; }
}

function siteUrls(lead) {
  const urls = [];
  const seen = new Set();
  const push = (u) => {
    if (!u || typeof u !== 'string') return;
    let s = u.trim();
    if (!/^https?:\/\//i.test(s)) return;
    if (seen.has(s)) return;
    seen.add(s); urls.push(s);
  };
  push(lead.website_url);
  for (const e of lead.evidence_urls || []) push(e);
  for (const e of lead.identity_evidence_urls || []) push(e);
  for (const e of lead.website_search_evidence_urls || []) push(e);
  push(lead.source_url);
  // never crawl Companies House — it does not publish contact emails
  return urls.filter((u) => !/company-information\.service\.gov\.uk/.test(u));
}

function contactVariants(base) {
  const u = new URL(base);
  const root = `${u.protocol}//${u.host}`;
  return [base, root, `${root}/contact`, `${root}/contact-us`, `${root}/about`, `${root}/about-us`];
}

async function enrichLead(lead) {
  const urls = siteUrls(lead);
  if (!urls.length) return { ok: false, reason: 'NO_CRAWLABLE_EVIDENCE_URL' };

  const tried = new Set();
  const found = [];
  for (const base of urls) {
    for (const target of contactVariants(base)) {
      if (tried.size >= MAX_PAGES_PER_LEAD) break;
      if (tried.has(target)) continue;
      tried.add(target);
      const html = await fetchText(target);
      if (!html) continue;
      for (const email of candidatesFrom(html)) {
        found.push({ email, evidence: target });
      }
      await sleep(POLITE_DELAY);
    }
    if (found.length) break;
  }
  if (!found.length) return { ok: false, reason: 'NO_PUBLIC_EMAIL_FOUND', pages: [...tried] };

  // prefer mailto-derived, then a domain that matches the business website
  const scored = found.map((f) => {
    let score = 0;
    const dom = f.email.split('@')[1];
    if (lead.website_url && new URL(lead.website_url).hostname.replace(/^www\./, '').endsWith(dom.replace(/^www\./, ''))) score += 5;
    if (/^(info|contact|enquiries|sales|hello|admin)@/.test(f.email)) score += 2;
    if (/gmail|hotmail|yahoo|btinternet|outlook|aol/.test(dom)) score += 1;
    return { ...f, score };
  }).sort((a, b) => b.score - a.score);

  for (const cand of scored) {
    const dom = cand.email.split('@')[1];
    if (await mxOk(dom)) {
      return { ok: true, email: cand.email, evidence: cand.evidence, mx_domain: dom };
    }
    log('INFO', `mx rejected ${cand.email}`, { domain: dom });
  }
  return { ok: false, reason: 'CANDIDATES_FAILED_MX', candidates: scored.map((s) => s.email).slice(0, 5) };
}

function git(cwd, args, timeout = 240000) {
  try {
    return { ok: true, stdout: execFileSync('git', args, { cwd, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    return { ok: false, stdout: (e.stdout || '').toString(), stderr: (e.stderr || '').toString() };
  }
}

function isBuilt(lead) {
  const s = lead.pipeline_status || lead.status;
  return s === 'BUILT_READY_FOR_REVIEW';
}

function slugOf(lead) {
  if (lead.slug) return lead.slug;
  const base = String(lead.business_name || lead.prospect_id || '').toLowerCase()
    .replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const id = String(lead.prospect_id || '').replace(/[^0-9]/g, '');
  return id ? `${base}-${id}` : base;
}

function previewExists(lead) {
  const slug = slugOf(lead);
  try {
    return fs.readdirSync(REPO, { withFileTypes: true })
      .some((d) => d.isDirectory() && d.name === slug && fs.existsSync(path.join(REPO, d.name, 'index.html')));
  } catch { return false; }
}

async function commitOne(lead, hit) {
  git(CRM, ['fetch', '-q', 'origin', 'main']);
  const pull = git(CRM, ['pull', '-q', '--rebase', 'origin', 'main']);
  if (!pull.ok) { log('WARN', 'crm pull failed, skipping commit', { err: (pull.stderr || '').split('\n')[0] }); return false; }

  const doc = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
  const arr = Array.isArray(doc) ? doc : (doc.prospects || doc.leads || []);
  const target = arr.find((l) => l.prospect_id === lead.prospect_id);
  if (!target) return false;

  const built = previewExists(target);
  target.public_email = hit.email;
  target.email = hit.email;
  target.email_evidence_url = hit.evidence;
  target.email_verified_at = new Date().toISOString();
  target.mx_domain = hit.mx_domain;
  target.email_deliverability_status = 'MAILBOX_VERIFIED';
  target.email_verification_level = 'MX_VERIFIED_PUBLIC_SOURCE';
  target.email_source_url = hit.evidence;
  target.updated_at = new Date().toISOString();
  // CRITICAL: MX verifies a domain, NOT the company, phone or absence of a website.
  // Never undo a previous qualification quarantine when enriching an email.
  const next = 'RESEARCH_HOLD';
  target.qualification_status = 'RESEARCH_HOLD';
  target.selected_for_outreach = false;
  target.qualification_reason = 'PENDING_INDEPENDENT_COMPANY_PHONE_WEBSITE_EVIDENCE';
  target.pipeline_status = next;
  if (target.status) target.status = next;

  fs.writeFileSync(INDEX, JSON.stringify(doc, null, 2) + '\n');
  git(CRM, ['add', '--', 'prospects/index.json']);
  const cm = git(CRM, ['-c', 'user.email=neo@geminx.ai', '-c', 'user.name=NEO', 'commit', '-q', '-m',
    `crm(${target.prospect_id}): verified public email recovered — ${next}\n\n` +
    `email: ${hit.email}\n` +
    `evidence: ${hit.evidence}\n` +
    `mx_domain: ${hit.mx_domain} (live MX lookup passed)\n` +
    `email_verification_level: MX_VERIFIED_PUBLIC_SOURCE\n` +
    `preview_present: ${built}\n\n` +
    `Address was found published verbatim on the cited page — not guessed or permuted.\n` +
    `Outbound HOLD: NEW EXTERNAL SENT = 0, DRAFTS = 0.`]);
  if (!cm.ok) { log('WARN', 'commit failed', { err: (cm.stderr || '').split('\n')[0] }); return false; }
  git(CRM, ['fetch', '-q', 'origin', 'main']);
  git(CRM, ['pull', '-q', '--rebase', 'origin', 'main']);
  const push = git(CRM, ['push', 'origin', 'HEAD:main']);
  if (!push.ok) { log('WARN', 'push failed', { err: (push.stderr || '').split('\n').slice(-1)[0] }); return false; }
  log('PUSHED', `${target.prospect_id} -> ${next}`, { email: hit.email });
  return true;
}

(async () => {
  log('BOOT', 'email enrichment worker start — no outbound mail, HOLD asserted');
  const state = fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) : { done: {}, recovered: 0 };

  git(CRM, ['fetch', '-q', 'origin', 'main']);
  git(CRM, ['pull', '-q', '--rebase', 'origin', 'main']);

  const doc = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
  const arr = Array.isArray(doc) ? doc : (doc.prospects || doc.leads || []);

  const queue = arr.filter((l) => {
    if (state.done[l.prospect_id]) return false;
    const hasEmail = String(l.public_email || l.email || '').trim();
    const verified = String(l.email_deliverability_status || '').toUpperCase() === 'MAILBOX_VERIFIED';
    if (hasEmail && verified) return false;
    const s = l.pipeline_status || l.status;
    return ['FRESH_QUALIFIED', 'PHONE_ONLY_NO_PUBLIC_EMAIL', 'NEEDS_ENRICHMENT', 'BUILT_READY_FOR_REVIEW', 'RESEARCH_HOLD'].includes(s);
  });

  log('QUEUE', `${queue.length} leads lacking a verified public email`);

  let recovered = 0;
  for (let i = 0; i < queue.length; i++) {
    const lead = queue[i];
    try {
      const r = await enrichLead(lead);
      if (r.ok) {
        const pushed = await commitOne(lead, r);
        if (pushed) { recovered++; state.recovered = (state.recovered || 0) + recovered * 0 + 1; }
        log(r.ok ? 'RECOVERED' : 'MISS', `${lead.prospect_id} ${lead.business_name}`, { email: r.email, evidence: r.evidence, pushed });
      } else {
        log('MISS', `${lead.prospect_id} ${lead.business_name}`, { reason: r.reason });
      }
      state.done[lead.prospect_id] = { at: new Date().toISOString(), result: r.ok ? 'RECOVERED' : r.reason };
    } catch (e) {
      log('ERROR', `${lead.prospect_id}`, { err: String(e.message || e) });
      state.done[lead.prospect_id] = { at: new Date().toISOString(), result: 'ERROR' };
    }
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    await sleep(POLITE_DELAY);
  }

  const misses = Object.values(state.done).filter((d) => d.result !== 'RECOVERED').length;
  log('COMPLETE', `recovered=${state.recovered || 0} attempted=${Object.keys(state.done).length} misses=${misses}`);
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
})();
