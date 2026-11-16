// Wave 2 Nextdoor harvester (runs on DESKTOP-K4609AI under playwright-core).
// Paces 60-90s between fetches to stay clear of HTTP 429.
// Usage: node wave2.js [resume|fresh]
const fs = require('fs');
const path = require('path');

const PW = 'C:/Users/tauru/ambush/node_modules/playwright-core';
const { chromium } = require(PW);

const OUT = 'C:/Users/tauru/ambush/wave2-probe.json';
const LOG = 'C:/Users/tauru/ambush/wave2.log';

const TRADES = ['plasterers', 'roofers', 'builders', 'electricians', 'plumbers',
  'groundworkers', 'removals', 'landscapers', 'joiners'];

const TOWNS = [
  // completes Wave 1 coverage
  'Solihull', 'West Bromwich', 'Wednesbury', 'Tamworth', 'Sutton Coldfield',
  'Stourbridge', 'Halesowen', 'Brierley Hill', 'Willenhall', 'Bilston',
  // untested postcode areas
  'Derby', 'Leicester', 'Nottingham', 'Burton upon Trent', 'Loughborough',
  'Chesterfield', 'Mansfield', 'Lichfield', 'Cannock', 'Rugby',
];

function log(m) {
  const line = `[${new Date().toISOString()}] ${m}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
// 60-90s randomised pacing.
const pace = () => sleep(60000 + Math.floor(Math.random() * 30000));

function loadState() {
  try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { return { discovered: [], probed: [], queries: [] }; }
}

function saveState(s) {
  fs.writeFileSync(OUT, JSON.stringify(s, null, 1));
}

function extractEmail(text) {
  const re = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
  const hits = (text.match(re) || []).filter(e =>
    !/nextdoor\.com|example\.com|sentry|\.png$|\.jpg$/i.test(e));
  return [...new Set(hits.map(e => e.toLowerCase()))];
}

(async () => {
  let state = process.argv[2] === 'fresh' ? { discovered: [], probed: [], queries: [] } : loadState();

  // Seed from Wave 1: 36 pages were discovered but never read before the 429.
  try {
    const w1 = JSON.parse(fs.readFileSync('C:/Users/tauru/ambush/nextdoor-probe.json', 'utf8'));
    const readAlready = new Set((w1.probed || []).map(p => p.url));
    let seeded = 0;
    for (const d of (w1.discovered || [])) {
      if (!state.discovered.find(x => x.url === d.url)) {
        state.discovered.push({ url: d.url, town: d.town || null, trade: d.trade || null, found_via: 'wave1' });
        seeded++;
      }
    }
    // Mark wave-1 pages as already probed so they are not re-fetched.
    for (const p of (w1.probed || [])) {
      if (!state.probed.find(x => x.url === p.url)) {
        state.probed.push({ ...p, probed_at: p.probed_at || 'wave1' });
      }
    }
    log(`SEED wave1 discovered=${seeded} already_probed=${readAlready.size} total_discovered=${state.discovered.length}`);
    saveState(state);
  } catch (e) { log('SEED_SKIP ' + String(e.message).slice(0, 60)); }
  log(`START discovered=${state.discovered.length} probed=${state.probed.length}`);

  // Dedicated profile: avoids locking Rob's live Chrome session (66 procs observed).
  const userDataDir = 'C:/Users/tauru/ambush/chrome-wave2';
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: false,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-blink-features=AutomationControlled'],
    viewport: { width: 1366, height: 900 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  let fetches = 0, blocks = 0;

  // ---- Phase 1: discovery via Bing inside the real Chrome context ----
  for (const town of TOWNS) {
    for (const trade of TRADES) {
      const key = `${trade}|${town}`;
      if (state.queries.includes(key)) continue;

      const q = `site:nextdoor.co.uk/pages ${trade} ${town}`;
      try {
        // DuckDuckGo html endpoint first: works without a logged-in profile.
        let links = [];
        let engine = 'ddg';
        try {
          await page.goto('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q),
            { waitUntil: 'domcontentloaded', timeout: 45000 });
          await sleep(2200);
          const st = await page.evaluate(() => document.body ? document.body.innerText.slice(0,300) : '');
          if (/202|anomaly|rate limit|unusual traffic/i.test(st) && !/nextdoor/i.test(st)) {
            engine = 'ddg_blocked';
          }
          links = await page.evaluate(() => {
            const out = [];
            for (const a of document.querySelectorAll('a')) {
              let h = a.href || '';
              const m = h.match(/uddg=([^&]+)/);
              if (m) { try { h = decodeURIComponent(m[1]); } catch {} }
              if (h.includes('nextdoor.co.uk/pages/')) out.push(h);
            }
            return out.map(h => { try { const u = new URL(h); return 'https://nextdoor.co.uk' + u.pathname.replace(/\/$/, ''); } catch { return null; } }).filter(Boolean);
          });
        } catch (e) { engine = 'ddg_err'; }

        // Bing fallback (only useful with a warmed profile, harmless otherwise).
        if (links.length === 0) {
          try {
            await page.goto('https://www.bing.com/search?q=' + encodeURIComponent(q) + '&count=30',
              { waitUntil: 'domcontentloaded', timeout: 45000 });
            await sleep(2500);
            links = await page.evaluate(() =>
              [...document.querySelectorAll('a')].map(a => a.href)
                .filter(h => h.includes('nextdoor.co.uk/pages/'))
                .map(h => { try { const u = new URL(h); return 'https://nextdoor.co.uk' + u.pathname.replace(/\/$/, ''); } catch { return null; } })
                .filter(Boolean));
            if (links.length) engine = 'bing';
          } catch (e) {}
        }
        const uniq = [...new Set(links)];
        let added = 0;
        for (const u of uniq) {
          if (!state.discovered.find(d => d.url === u)) {
            state.discovered.push({ url: u, town, trade, found_via: engine });
            added++;
          }
        }
        state.queries.push(key);
        saveState(state);
        log(`DISC[${engine}] ${key} -> ${uniq.length} links, +${added} new (total ${state.discovered.length})`);
      } catch (e) {
        log(`DISC_ERR ${key} ${String(e.message).slice(0, 60)}`);
      }
      fetches++;
      if (fetches % 3 === 0) await pace();
      else await sleep(4000 + Math.floor(Math.random() * 3000));
    }
  }

  // ---- Phase 2: probe each discovered page for published email + logo ----
  const pending = state.discovered.filter(d => !state.probed.find(p => p.url === d.url));
  log(`PROBE phase: ${pending.length} pages pending`);

  for (const item of pending) {
    try {
      const resp = await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const status = resp ? resp.status() : 0;
      if (status === 429) {
        blocks++;
        log(`RATE_LIMIT at ${item.url} -- backing off 5min`);
        await sleep(300000);
        continue;
      }
      await sleep(2000);

      // Scroll to trigger lazy contact details.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(1500);

      const data = await page.evaluate(() => {
        const bodyText = document.body ? document.body.innerText : '';
        const imgs = [...document.querySelectorAll('img')]
          .map(i => i.currentSrc || i.src).filter(Boolean);
        const logo = imgs.find(s => /business_(logo|cover)|pages_avatar|business_gallery/i.test(s))
          || imgs.find(s => /nextdoor\.com\//i.test(s) && !/avatar-sample/i.test(s)) || null;
        const placeholder = imgs.some(s => /avatar-sample/i.test(s));
        const title = document.title;
        return { bodyText: bodyText.slice(0, 20000), logo, placeholder, title };
      });

      const rec = {
        url: item.url, town: item.town, trade: item.trade,
        title: data.title,
        emails: extractEmail(data.bodyText),
        logo: data.logo,
        placeholder_logo: data.placeholder,
        status,
        probed_at: new Date().toISOString(),
      };
      state.probed.push(rec);
      saveState(state);
      log(`PAGE ${status} ${item.url.split('/pages/')[1]} emails=${rec.emails.length} logo=${rec.logo ? (rec.placeholder ? 'PLACEHOLDER' : 'real') : 'none'}`);
    } catch (e) {
      log(`PAGE_ERR ${item.url} ${String(e.message).slice(0, 70)}`);
    }
    await pace();
  }

  log(`DONE discovered=${state.discovered.length} probed=${state.probed.length} rate_limited=${blocks}`);
  await ctx.close();
})().catch(e => { log('FATAL ' + e.message); process.exit(1); });
