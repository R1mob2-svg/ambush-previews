// Step A: does Nextdoor actually expose business emails + logos at scale?
// Search for many Nextdoor business pages, fetch each, and measure how many
// yield a real email address and a real logo URL. NO guessing.
const { chromium } = require('C:/Users/tauru/ambush/node_modules/playwright-core');
const fs = require('fs');

const PROFILE = 'C:\\Users\\tauru\\ambush\\chrome-profile';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Candidate discovery queries: Nextdoor business pages for WM trades.
const QUERIES = [
  'site:nextdoor.co.uk/pages plasterer Birmingham',
  'site:nextdoor.co.uk/pages roofer Walsall',
  'site:nextdoor.co.uk/pages builder Wolverhampton',
  'site:nextdoor.co.uk/pages electrician Dudley',
  'site:nextdoor.co.uk/pages plumber Coventry',
  'site:nextdoor.co.uk/pages landscaper Solihull',
  'site:nextdoor.co.uk/pages groundworks West Bromwich',
  'site:nextdoor.co.uk/pages removals Wednesbury',
];

const EMAIL_RX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const NOISE = /\.(png|jpe?g|gif|svg|webp|css|js|ico)$|sentry|wixpress|example\.com|@2x|nextdoor\.com|schema\.org|w3\.org/i;

function uniq(a) { return [...new Set(a)]; }

async function bing(page, q) {
  await page.goto('https://www.bing.com/search?q=' + encodeURIComponent(q) + '&cc=GB&count=30', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(1400);
  return page.$$eval('#b_results li.b_algo a[href]', els => els.map(e => e.href)).catch(() => []);
}

async function ddg(page, q) {
  await page.goto('https://duckduckgo.com/?q=' + encodeURIComponent(q) + '&kl=uk-en', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(1400);
  let h = await page.$$eval('a[data-testid="result-title-a"]', els => els.map(e => e.href)).catch(() => []);
  if (!h.length) h = await page.$$eval('article h2 a', els => els.map(e => e.href)).catch(() => []);
  return h;
}

(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false, channel: 'chrome', userAgent: UA, locale: 'en-GB',
    timezoneId: 'Europe/London', viewport: { width: 1400, height: 900 },
    args: ['--disable-blink-features=AutomationControlled', '--no-first-run'],
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  const found = [];
  const seen = new Set();

  for (let i = 0; i < QUERIES.length; i++) {
    const q = QUERIES[i];
    let engine = 'bing';
    let links = [];
    try { links = await bing(page, q); } catch (e) { links = []; }
    if (links.filter(l => /nextdoor\.co\.uk\/pages/i.test(l)).length < 3) {
      try { const d = await ddg(page, q); if (d.length) { links = links.concat(d); engine = 'bing+ddg'; } } catch {}
    }
    const pages = uniq(links.filter(l => /nextdoor\.co\.uk\/pages\//i.test(l)));
    console.log(`[${i + 1}] ${q}\n     engine=${engine} rawLinks=${links.length} nextdoorPages=${pages.length}`);
    for (const p of pages) {
      const key = p.split('?')[0].toLowerCase().replace(/\/$/, '');
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ url: key, query: q, engine });
      console.log('       + ' + key);
    }
    await page.waitForTimeout(2000 + Math.floor(Math.random() * 1500));
  }

  console.log(`\n=== distinct Nextdoor business pages discovered: ${found.length} ===`);

  // Now probe each page for a REAL email and a REAL logo.
  const probed = [];
  for (let j = 0; j < found.length; j++) {
    const f = found[j];
    const rec = { url: f.url, query: f.query, http: null, emails: [], logo: null, title: null };
    try {
      const resp = await page.goto(f.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      rec.http = resp ? resp.status() : null;
      await page.waitForTimeout(2200);
      const html = await page.content();
      rec.title = (await page.title().catch(() => '') || '').slice(0, 120);
      let m = (html.match(EMAIL_RX) || []).map(s => s.toLowerCase()).filter(s => !NOISE.test(s));
      // mailto: links are the strongest signal of a published address.
      const mailto = await page.$$eval('a[href^="mailto:"]', els => els.map(e => e.getAttribute('href'))).catch(() => []);
      m = m.concat(mailto.map(h => h.replace(/^mailto:/i, '').split('?')[0].toLowerCase()));
      rec.emails = uniq(m).slice(0, 8);
      const logos = await page.$$eval('img', els => els.map(e => e.src).filter(s => /logo|avatar|profile|business/i.test(s))).catch(() => []);
      rec.logo = logos.length ? logos[0] : null;
    } catch (e) {
      rec.error = String(e.message || e).slice(0, 120);
    }
    probed.push(rec);
    const flag = rec.emails.length ? 'EMAIL' : '-----';
    console.log(`[${j + 1}/${found.length}] http=${rec.http} ${flag} em=${rec.emails.length} logo=${rec.logo ? 'Y' : 'N'} ${rec.url}`);
    if (rec.emails.length) console.log('        -> ' + rec.emails.join(' '));
    await page.waitForTimeout(1200 + Math.floor(Math.random() * 1200));
  }

  fs.writeFileSync('C:\\Users\\tauru\\ambush\\nextdoor-probe.json', JSON.stringify({ discovered: found, probed }, null, 2));
  const withEmail = probed.filter(p => p.emails.length).length;
  console.log(`\nRESULT: ${withEmail}/${probed.length} Nextdoor pages exposed a real email`);
  await ctx.close();
})();
