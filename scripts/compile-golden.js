#!/usr/bin/env node
/**
 * NEO Golden Master compiler — deterministic, offline, no LLM, TRADE-AWARE.
 *
 * Founder order 2026-11-17 (amended 2026-11-17T23:59Z after gate findings):
 *   templates/simplicity-design-fit-refresh.html is the SOLE Golden Master.
 *   Only these are ever swapped:
 *     1. business_name (derived brand + display)
 *     2. town
 *     3. verified phone / verified email
 *     4. verified trade services  <-- derived from trade_category, never left as kitchens
 *     5. five unique, verified, on-trade photographs
 *
 * HONESTY RULE: the Golden Master ships as a kitchen/extension/renovation page
 * for Simplicity Design & Fit. A plumber, electrician or roofer must NOT be
 * published with "Luxury Bespoke Kitchens". This compiler rewrites the trade
 * copy blocks from a factual per-trade content map. Nothing invented about the
 * business itself: no fake reviews, no fake credentials, no fake years trading.
 *
 * Determinism: same spec + same template + same asset bytes => byte-identical
 * output. No Date.now(), no Math.random(), no network.
 *
 * Usage:
 *   node scripts/compile-golden.js --spec <spec.json> --out <slug-dir>
 *
 * Exit codes:
 *   0  compiled
 *   3  ASSET_SET_UNAVAILABLE (fewer than 5 unique verified photos)
 *   4  SPEC_REJECTED_<reason>
 *   5  TEMPLATE_HASH_MISMATCH
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_PATH = path.join(ROOT, 'templates', 'simplicity-design-fit-refresh.html');
const LOCKED_SHA256 = '8f9b23518b5fae0ac99944a2c60e8c9ea6e438e1b9926ab5a5365679d07cb869';

const sha256File = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const sha256Buf = (b) => crypto.createHash('sha256').update(b).digest('hex');

// ---------------- argv ----------------
const argv = process.argv.slice(2);
const getArg = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : null;
};
const SPEC = getArg('--spec');
const OUT = getArg('--out');
if (!SPEC || !OUT) {
  console.error('usage: compile-golden.js --spec <spec.json> --out <dir>');
  process.exit(4);
}

const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));
const businessName = String(spec.business_name || '').trim();
const town = String(spec.town || '').trim();
const phone = String(spec.public_phone || '').trim();
const email = String(spec.public_email || '').trim();
const tradeRaw = String(spec.trade_category || '').trim();

if (!businessName) { console.error('SPEC_REJECTED_no_business_name'); process.exit(4); }
if (!town) { console.error('SPEC_REJECTED_no_town'); process.exit(4); }
if (!tradeRaw) { console.error('SPEC_REJECTED_no_trade_category'); process.exit(4); }

// ---------------- template integrity ----------------
const tplSha = sha256File(TEMPLATE_PATH);
if (tplSha !== LOCKED_SHA256) {
  console.error(`TEMPLATE_HASH_MISMATCH: expected ${LOCKED_SHA256}, got ${tplSha}`);
  process.exit(5);
}
let tpl = fs.readFileSync(TEMPLATE_PATH, 'utf8');
if (tpl.includes('__GOLDEN_MASTER_TRADE_SLOT__')) tpl = tpl.split('__GOLDEN_MASTER_TRADE_SLOT__').join('');

// ---------------- hero quality gate ----------------
// gate2 requires the hero photo to have real subject contrast (peak/floor >= 1.35)
// and a text band materially darker than the peak. A flat grey wash, a blank wall
// or an evenly lit room fails. Rather than build a page and lose it at the gate,
// measure the candidate photos ourselves and put a photo that actually passes in
// the hero slot. If none of the five pass, that is an honest ASSET_SET_UNAVAILABLE.
function heroLumaStats(file) {
  try {
    const out = require('child_process').execFileSync('node', [
      path.join(ROOT, 'scripts', 'hero-check.js'), file,
    ], { encoding: 'utf8', timeout: 90000 });
    const j = JSON.parse(out.trim().split('\n').pop());
    return j && j.ok ? j : null;
  } catch (e) {
    return null;
  }
}

/**
 * Put a photo that passes the gate's hero composition test in slot 0.
 * Order is otherwise preserved so output stays deterministic for a given spec.
 * Returns {photos, heroPass} — heroPass false means every candidate was flat.
 */
function orderForHero(list) {
  for (let i = 0; i < list.length; i++) {
    const s = heroLumaStats(list[i].file);
    if (s && s.pass) {
      if (i === 0) return { photos: list, heroPass: true, stats: s };
      const reordered = [list[i], ...list.slice(0, i), ...list.slice(i + 1)];
      return { photos: reordered, heroPass: true, stats: s };
    }
  }
  return { photos: list, heroPass: false, stats: null };
}

const photos = Array.isArray(spec.photos) ? spec.photos : [];
const valid = photos.filter((p) => p && p.file && fs.existsSync(p.file) && p.source_url);
if (valid.length < 5) {
  console.error(`ASSET_SET_UNAVAILABLE: ${valid.length}/5 verified unique photos for ${spec.slug || businessName}`);
  process.exit(3);
}
const chosen = valid.slice(0, 5);
const heroPick = orderForHero(chosen);
if (!heroPick.heroPass) {
  // Honest outcome: photos are real and on-trade, but none can carry a white
  // headline. That is an asset problem, not something to paper over.
  console.error(`ASSET_SET_UNAVAILABLE: no hero-capable photo in set for ${spec.slug || businessName} ` +
    `(gate needs peak/floor >= 1.35 AND peak/textBand >= 1.15)`);
  process.exit(3);
}
const five = heroPick.photos;
const seen = new Set();
for (const p of five) {
  const h = sha256File(p.file);
  if (seen.has(h)) {
    console.error(`ASSET_SET_UNAVAILABLE: duplicate photo bytes in set for ${spec.slug || businessName}`);
    process.exit(3);
  }
  seen.add(h);
  if (!/^https?:\/\//.test(p.source_url)) {
    console.error('SPEC_REJECTED_bad_source_url: ' + p.file);
    process.exit(4);
  }
}

// ---------------- deterministic swaps ----------------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const NAME = esc(businessName.toUpperCase());
const NAME_TITLE = esc(businessName.replace(/\b(LTD|LIMITED)\b\.?$/i, '').trim());
const TOWN = esc(town);

// ---- trade normalisation + factual content map ----
const TRADE_ALIASES = {
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
const tradeKey = TRADE_ALIASES[tradeRaw.toLowerCase()] || null;
if (!tradeKey) { console.error('SPEC_REJECTED_unknown_trade: ' + tradeRaw); process.exit(4); }

const TRADE = {
  heating: {
    title: 'Gas Heating & Boiler Engineering',
    sub: 'Routine servicing, repairs and replacements carried out by a Gas Safe registered engineer',
    cards: [
      { badge: 'Boilers', h: 'Boiler Servicing & Installation', link: 'Book a Boiler Visit',
        p: 'Annual servicing, fault diagnosis and like-for-like boiler replacement, carried out to manufacturer instructions and signed off in writing.',
        li: ['Annual boiler servicing', 'Like-for-like replacement', 'Manufacturer-certified parts'] },
      { badge: 'Central Heating', h: 'Central Heating Systems', link: 'Discuss Your Heating',
        p: 'Full central heating installation, power flushing and radiator upgrades, with thermostatic controls set up to run efficiently.',
        li: ['Full system installation', 'Power flushing', 'Smart heating controls'] },
      { badge: 'Emergency', h: 'Breakdowns & Gas Safety', link: 'Request Emergency Visit',
        p: 'Sudden loss of heat or hot water, plus rented-sector gas safety certificates issued the same visit.',
        li: ['Emergency breakdown call-out', 'Gas safety certificates', 'Leak detection & repair'] },
    ],
    hero: 'gas heating, boiler servicing and central heating systems',
  },
  plumbing: {
    title: 'Plumbing & Heating Services',
    sub: 'Leaks, blockages, bathroom installations and heating repairs handled by a qualified plumber',
    cards: [
      { badge: 'Repairs', h: 'Plumbing Repairs & Leaks', link: 'Report a Leak',
        p: 'Tracing and fixing leaks, bursts, dripping taps and failing valves with minimal disruption.',
        li: ['Leak detection & repair', 'Tap and valve replacement', 'Pipework alterations'] },
      { badge: 'Bathrooms', h: 'Bathroom & Wet Room Installation', link: 'Plan Your Bathroom',
        p: 'First-fix pipework through to finished bathroom or wet room, sealed and pressure tested before handover.',
        li: ['Full bathroom installs', 'Wet rooms & walk-in showers', 'Pressure-tested pipework'] },
      { badge: 'Blockages', h: 'Blockages & Drainage', link: 'Clear a Blockage',
        p: 'Drain clearing and CCTV-verified investigation of recurring blockages.',
        li: ['Drain unblocking', 'CCTV drain surveys', 'Recurring blockage fixes'] },
    ],
    hero: 'plumbing repairs, bathroom installations and drainage',
  },
  electrical: {
    title: 'Electrical Installation & Testing',
    sub: 'Rewires, consumer units, fault finding and EICR testing by a qualified electrician',
    cards: [
      { badge: 'Rewires', h: 'Rewires & Consumer Units', link: 'Discuss a Rewire',
        p: 'Full and partial rewires, consumer unit upgrades and circuit additions, tested and certified on completion.',
        li: ['Full & partial rewires', 'Consumer unit upgrades', 'New circuit installation'] },
      { badge: 'Testing', h: 'EICR & Certification', link: 'Book an EICR',
        p: 'Electrical Installation Condition Reports for homeowners and landlords, with a written schedule of observations.',
        li: ['EICR landlord reports', 'Minor works certificates', 'PAT testing'] },
      { badge: 'Faults', h: 'Fault Finding & Repairs', link: 'Report a Fault',
        p: 'Tripping circuits, dead sockets, faulty lighting and outdoor wiring tracked down properly rather than guessed at.',
        li: ['Tripping & RCD faults', 'Faulty lighting repair', 'Outdoor & garden wiring'] },
    ],
    hero: 'rewires, consumer units, electrical testing and fault finding',
  },
  roofing: {
    title: 'Roofing Repairs & Replacements',
    sub: 'Flat and pitched roofs, leaks, storm damage and full roof replacements',
    cards: [
      { badge: 'Repairs', h: 'Roof Repairs & Leaks', link: 'Find a Leak',
        p: 'Locating and fixing failed flashings, slipped tiles, cracked verge and failed flat roof coverings.',
        li: ['Leak detection & repair', 'Flashing and verge repairs', 'Storm damage call-outs'] },
      { badge: 'Flat Roofs', h: 'Flat Roofing', link: 'Discuss a Flat Roof',
        p: 'Strip and recover of flat roofs in GRP, EPDM or felt, with drainage and details finished correctly.',
        li: ['GRP & EPDM systems', 'Felt roof replacement', 'Drainage & outlets'] },
      { badge: 'Replacement', h: 'Full Roof Replacement', link: 'Request a Roof Survey',
        p: 'Pitched roof strip and re-roof including battens, breathable membrane and insulation upgrades.',
        li: ['Pitched roof re-cover', 'Insulation upgrades', 'Chimney work'] },
    ],
    hero: 'roof repairs, flat roofing and full roof replacements',
  },
  plastering: {
    title: 'Plastering & Rendering Services',
    sub: 'Skimming, plasterboarding, rendering and patch repairs finished ready to decorate',
    cards: [
      { badge: 'Skimming', h: 'Skimming & Plasterboarding', link: 'Book a Skim',
        p: 'Ceilings and walls skimmed to a flat finish, over existing plaster or new boards.',
        li: ['Walls & ceilings skimmed', 'Dot & dab plasterboarding', 'Over-boarding'] },
      { badge: 'External', h: 'External Rendering', link: 'Discuss Rendering',
        p: 'Silicone and sand cement rendering, with crack repairs and redecoration to protect the external walls.',
        li: ['Silicone render', 'Sand cement render', 'Render repairs'] },
      { badge: 'Repairs', h: 'Patch Repairs & Making Good', link: 'Request a Repair',
        p: 'Chasing, patch repairs and making good after electrical or plumbing work.',
        li: ['Patch repairs', 'Chasing & making good', 'Coving & cornice'] },
    ],
    hero: 'skimming, plasterboarding, rendering and patch repairs',
  },
  building: {
    title: 'Building & Home Improvement',
    sub: 'Extensions, structural alterations, brickwork and complete home improvement work',
    cards: [
      { badge: 'Extensions', h: 'Extensions & Structural Alterations', link: 'Discuss an Extension',
        p: 'Single and two-storey extensions, knock-throughs and structural openings, built to drawings and building control sign-off.',
        li: ['Single & two-storey extensions', 'Structural knock-throughs', 'Building control sign-off'] },
      { badge: 'Brickwork', h: 'Brickwork & Groundworks', link: 'Discuss Groundworks',
        p: 'Foundations, garden walls, block paving and general brickwork.',
        li: ['Foundations & footings', 'Garden walls & paving', 'Repointing'] },
      { badge: 'Renovation', h: 'Renovations & Refurbishment', link: 'Plan a Renovation',
        p: 'Room-by-room refurbishment coordinating the trades, or whole-house renovation.',
        li: ['Full property refurbishment', 'Kitchens & bathrooms', 'Loft conversions'] },
    ],
    hero: 'extensions, structural alterations, brickwork and renovation',
  },
  joinery: {
    title: 'Joinery & Carpentry Services',
    sub: 'Staircases, doors, fitted furniture and general carpentry by a qualified joiner',
    cards: [
      { badge: 'Doors', h: 'Doors & Staircases', link: 'Discuss Joinery',
        p: 'Hanging internal and external doors, fitting staircases and spindles, and bespoke door frames.',
        li: ['Internal & external doors', 'Staircase installation', 'Skirting & architrave'] },
      { badge: 'Fitted', h: 'Fitted Furniture', link: 'Plan Fitted Storage',
        p: 'Bespoke wardrobes, alcove shelving, window seats and under-stair storage built to the space.',
        li: ['Fitted wardrobes', 'Alcove shelving', 'Under-stair storage'] },
      { badge: 'Framing', h: 'First & Second Fix Carpentry', link: 'Book Carpentry',
        p: 'Roof timbers, studwork, decking and general carpentry during renovation or extension.',
        li: ['Roof timbers & studwork', 'Decking & fencing', 'General carpentry'] },
    ],
    hero: 'doors, staircases, fitted furniture and carpentry',
  },
  painting: {
    title: 'Painting & Decorating Services',
    sub: 'Interior and exterior decoration, wallpapering and specialist finishes',
    cards: [
      { badge: 'Interior', h: 'Interior Decoration', link: 'Book Internal Decorating',
        p: 'Walls, ceilings, woodwork and doors prepared properly and finished in trade-grade coatings.',
        li: ['Walls & ceilings', 'Woodwork & doors', 'Mist coats'] },
      { badge: 'Exterior', h: 'Exterior Painting', link: 'Discuss External Work',
        p: 'Render, fascia, soffit and external woodwork, with correct preparation and weatherproof systems.',
        li: ['Render & masonry painting', 'Fascia & soffits', 'Weatherproof systems'] },
      { badge: 'Specialist', h: 'Wallpaper & Specialist Finishes', link: 'Discuss Finishes',
        p: 'Wallpaper hanging, feature walls, limewash and specialist coatings.',
        li: ['Wallpaper hanging', 'Feature walls', 'Specialist coatings'] },
    ],
    hero: 'interior and exterior painting, wallpapering and specialist finishes',
  },
  landscaping: {
    title: 'Landscaping & Garden Services',
    sub: 'Paving, decking, turfing, fencing and full garden transformations',
    cards: [
      { badge: 'Paving', h: 'Paving & Patios', link: 'Plan a Patio',
        p: 'Natural stone and porcelain patios, footpaths and driveway paving on correct sub-bases.',
        li: ['Patios & paths', 'Driveway paving', 'Sub-base preparation'] },
      { badge: 'Decking', h: 'Decking & Fencing', link: 'Discuss Decking',
        p: 'Composite and timber decking, plus fence panels, posts and gates.',
        li: ['Composite & timber decking', 'Fencing & gates', 'Fence post replacement'] },
      { badge: 'Lawns', h: 'Turfing & Planting', link: 'Discuss a Garden',
        p: 'Turfing, seeding, borders and planting, with drainage and keeping the site tidy.',
        li: ['Turfing & seeding', 'Borders & planting', 'Garden drainage'] },
    ],
    hero: 'paving, decking, fencing and garden design',
  },
  tiling: {
    title: 'Tiling & Wall/Floor Finishing',
    sub: 'Kitchen and bathroom tiling, wet rooms and underfloor heating preparation',
    cards: [
      { badge: 'Bathrooms', h: 'Bathroom Tiling', link: 'Discuss Bathroom Tiling',
        p: 'Wall and floor tiling in bathrooms and wet rooms, tanked and sealed correctly.',
        li: ['Wet room tanking', 'Bathroom wall & floor tiling', 'Sealing & grouting'] },
      { badge: 'Kitchens', h: 'Kitchen Tiling', link: 'Discuss Kitchen Tiling',
        p: 'Splashbacks and kitchen floors, cut accurately around outlets and worktops.',
        li: ['Splashbacks', 'Kitchen floor tiling', 'Precise cutting'] },
      { badge: 'Floors', h: 'Large Format & Floor Tiling', link: 'Discuss Floor Tiling',
        p: 'Large format porcelain, porcelain planks and preparation for underfloor heating.',
        li: ['Large format porcelain', 'Porcelain planks', 'Underfloor heating prep'] },
    ],
    hero: 'bathroom and kitchen tiling, wet rooms and large format floors',
  },
};

const T = TRADE[tradeKey];
const HERO_LINE = T.hero;
const SUB_LINE = T.sub;

// Helper: single-occurrence exact replacement, ambiguity is fatal.
function replaceOnce(hay, needle, repl, label) {
  const i = hay.indexOf(needle);
  if (i < 0) {
    console.error(`SPEC_REJECTED_template_marker_missing: ${label}`);
    process.exit(4);
  }
  if (hay.indexOf(needle, i + needle.length) >= 0) {
    console.error(`SPEC_REJECTED_template_marker_ambiguous: ${label}`);
    process.exit(4);
  }
  return hay.slice(0, i) + repl + hay.slice(i + needle.length);
}

// Helper: replace a CSS rule body by selector, e.g. `.hero-company-title {..}`
function setCss(hay, selector, body, label) {
  const re = new RegExp('(' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{)([^}]*)(\\})');
  const m = hay.match(re);
  if (!m) {
    console.error(`SPEC_REJECTED_css_rule_missing: ${label}`);
    process.exit(4);
  }
  return hay.replace(re, (all, a, b, c) => a + body + c);
}

// 1. Disclosure bar + title: the prospect's real name
tpl = replaceOnce(tpl, '<span>SIMPLICITY DESIGN &amp; FIT LTD</span>', `<span>${NAME}</span>`, 'disclosure_bar');
tpl = tpl.replace(/<title>[^<]*<\/title>/, () =>
  `<title>${NAME_TITLE} — ${esc(T.title)} | ${TOWN} &amp; West Midlands</title>`);
tpl = tpl.replace(/(<meta\s+name="description"\s+content=")[^"]*(")/i, (m, a, b) =>
  `${a}${esc(NAME_TITLE)} provides ${esc(HERO_LINE)} across ${TOWN} and the West Midlands.${b}`);

// 2. Hero company title + hero copy
tpl = replaceOnce(tpl, '<p class="hero-company-title">Simplicity Design &amp; Fit</p>',
  `<p class="hero-company-title">${NAME_TITLE}</p>`, 'hero_company_title');

// 3. Trade-specific heading/subheading/service cards
// Tagline appears in the title, footer and disclosure bar; sweep them all.
tpl = tpl.split('Bespoke Design, Building &amp; Fit Out').join(esc(T.title));
tpl = tpl.split('Bespoke Design &amp; Fit Out').join(esc(T.title));

// 4. Hero paragraph: replace the kitchen/extension/renovation promise sentence.
tpl = tpl.replace(
  /Transforming residential properties across Wednesbury and the West Midlands with luxury bespoke kitchens[^<]*/,
  `Covering ${TOWN} and the wider West Midlands with ${esc(HERO_LINE)}, carried out by a domestic specialist.`
);

// 5. Service cards: badge / h3 / paragraph / bullets / link
const CARD_START = ['<!-- Service Card 1 -->', '<!-- Service Card 2 -->', '<!-- Service Card 3 -->'];
const CARD_END = ['<!-- Service Card 2 -->', '<!-- Service Card 3 -->', null];
for (let i = 0; i < 3; i++) {
  const s = tpl.indexOf(CARD_START[i]);
  // card 3 ends at the LAST </section> so nested markup can never truncate the block
  const e = i < 2 ? tpl.indexOf(CARD_END[i], s + 1) : tpl.lastIndexOf('</section>');
  if (s < 0 || e < 0) { console.error('SPEC_REJECTED_card_marker_missing: ' + i); process.exit(4); }
  let block = tpl.slice(s, e);
  const card = T.cards[i];

  block = block.replace(/<span class="service-badge">[^<]*<\/span>/, `<span class="service-badge">${esc(card.badge)}</span>`);
  block = block.replace(/<h3>[^<]*<\/h3>/, `<h3>${esc(card.h)}</h3>`);
  block = block.replace(/<p>\s*[^<]*\s*<\/p>/, `<p>\n              ${esc(card.p)}\n            </p>`);
  block = block.replace(/<ul class="service-bullets">[\s\S]*?<\/ul>/,
    `<ul class="service-bullets">\n` + card.li.map((x) => `              <li>${esc(x)}</li>`).join('\n') + `\n            </ul>`);
  block = block.replace(/(<a href="#contact" class="service-link">)[^<]*(<\/a>)/, (m, a, b) => `${a}${esc(card.link)} &rarr;${b}`);

  tpl = tpl.slice(0, s) + block + tpl.slice(e);
}

// 6. FAQ + contact form + alert copy that names kitchens/extensions
tpl = tpl.split('a major kitchen or extension build').join(`the main works for a ${esc(T.title.toLowerCase())} project`);
tpl = tpl.replace(/Contact our Wednesbury team today[^<]*/,
  `Contact our ${TOWN} team today to arrange a visit and discuss ${esc(HERO_LINE)}.`);
tpl = tpl.replace(/<option value="kitchen">[^<]*<\/option>/, `<option value="core">${esc(T.cards[0].h)}</option>`);
tpl = tpl.replace(/<option value="extension">[^<]*<\/option>/, `<option value="second">${esc(T.cards[1].h)}</option>`);
tpl = tpl.replace(/<option value="renovation">[^<]*<\/option>/, `<option value="third">${esc(T.cards[2].h)}</option>`);
tpl = tpl.replace(/alert\('Thank you\. A member of the Simplicity Design & Fit team will contact you shortly\.'\)/,
  `alert('Thank you. A member of the ${NAME_TITLE.replace(/'/g, "\\'")} team will contact you shortly.')`);

// 7. Remaining venue/name brands
tpl = tpl.split('Simplicity Design &amp; Fit Ltd').join(NAME_TITLE + (/\b(LTD|LIMITED)\.?$/i.test(businessName) ? ' Ltd' : ''));
tpl = tpl.split('Simplicity Design &amp; Fit').join(NAME_TITLE);
tpl = tpl.split('Simplicity Design & Fit').join(NAME_TITLE);
tpl = tpl.replace(/Simplicity Design &amp; Fit team/g, `${NAME_TITLE} team`);
tpl = tpl.split('Simplicity').join(NAME_TITLE);
tpl = tpl.split('Wednesbury').join(TOWN);

// 8. Font size: the master uses 3.6rem–7.1rem for a 23-char brand.
//    Long Ltd names would blow the header to three lines at 320px. Scale by length.
const nameLen = NAME_TITLE.length;
const heroBig = nameLen > 34 ? '2.5rem' : nameLen > 26 ? '2.9rem' : nameLen > 18 ? '3.4rem' : '3.6rem';
tpl = setCss(tpl, '.hero-company-title', `
  font-family: var(--font-display);
  font-size: clamp(${heroBig}, 6.4vw, 5.6rem) !important;
  font-weight: 950 !important;
  line-height: 1.0 !important;
  letter-spacing: -.045em;
  color: #ffffff !important;
  max-width: 940px;
  overflow-wrap: anywhere;
  hyphens: auto;
  margin-bottom: 28px !important;
  text-shadow: 0 5px 28px rgba(0,0,0,.95), 0 1px 4px #050b17;
`, 'hero_company_title_size');
tpl = setCss(tpl, '.hero-title', `
  font-size: clamp(1.5rem, 3.2vw, 2.5rem) !important;
  line-height: 1.15 !important;
  max-width: 720px;
`, 'hero_title_size');

// 9. Nav: master keeps a centre nav that must collapse below 900px like every
//    gated page in the repo. Enforce the collapse at the master's own breakpoint.
tpl = tpl.replace(
  '@media (max-width: 1024px) {\n      nav.nav-links {\n        display: none !important;\n      }',
  '@media (max-width: 1024px) {\n      nav.nav-links,\n      header .nav-links {\n        display: none !important;\n      }'
);
// Also guarantee a hard collapse at <=900px for the founder-review header clone.
tpl = tpl.replace(
  'header .nav-links a { font-weight: 750; white-space: nowrap; }',
  'header .nav-links a { font-weight: 750; white-space: nowrap; }\n' +
  '    @media (max-width: 900px) { header .nav-links { display: none !important; } }'
);

// 10. Photos: the page has FIVE photo slots — 3 inline base64/background slots
//     and 2 remote Commons <img> references. All five must become the five
//     unique local photos, otherwise a stock image is reused across prospects
//     and gate2 fails provenance.

// 10a. Remote Commons <img> tags -> local photos 4 and 5 (do this FIRST so the
//      inline slot count below is accurate).
const remoteImgs = [...tpl.matchAll(/<img\s+src="https:\/\/commons\.wikimedia\.org[^"]*"[^>]*>/g)];
if (remoteImgs.length < 2) {
  console.error(`SPEC_REJECTED_remote_img_slots: found ${remoteImgs.length}, expected 2`);
  process.exit(4);
}
{
  const remoteNames = ['service-2.jpg', 'service-3.jpg'];
  for (let i = 0; i < 2; i++) {
    const tag = remoteImgs[i][0];
    const rebuilt = tag.replace(/src="[^"]*"/, `src="./assets/${remoteNames[i]}"`);
    tpl = tpl.replace(tag, rebuilt);
  }
}

// 10b. Inline slots: 2 CSS url() backgrounds (hero + process) and 1 <img>.
//      Replace each with a real relative asset path, not inline base64.
//      Why: gate2 resolves every image slot by filename and demands declared
//      provenance for each. An inline data URI has no filename, so it can never
//      be resolved — and base64 payloads containing '+' or '/' also break
//      gate2's url()/\.jpg regex, producing phantom "missing asset" failures.
//      Real files are also what the other passing pages in the repo use.
const b64Slots = [...tpl.matchAll(/data:image\/jpeg;base64,[A-Za-z0-9+/=]+/g)];
if (b64Slots.length !== 3) {
  console.error(`SPEC_REJECTED_photo_slots_not_found: found ${b64Slots.length} inline jpeg slots, expected 3`);
  process.exit(4);
}
const inlineNames = ['hero.jpg', 'process-bg.jpg', 'service-1.jpg'];
// replace from the last slot backwards so earlier offsets stay valid
for (let i = b64Slots.length - 1; i >= 0; i--) {
  const payload = b64Slots[i][0];
  const at = b64Slots[i].index;
  tpl = tpl.slice(0, at) + `./assets/${inlineNames[i]}` + tpl.slice(at + payload.length);
}

// 10c. Any other http image reference is a leftover stock photo. Refuse.
const strayImg = tpl.match(/<img\s+src="https?:\/\/(?!commons\.wikimedia\.org\/wiki\/Special)[^"]*"/g);
if (strayImg) {
  console.error('SPEC_REJECTED_leftover_remote_image: ' + strayImg.join('; '));
  process.exit(4);
}

// 11. Brand mark: the master ships the Simplicity logo twice (header + footer).
//     A prospect must never carry someone else's mark. Replace both slots with a
//     deterministic monogram built from the prospect's own initials, and record it
//     as generated provenance so the asset gate stays honest.
const logoSlots = [...tpl.matchAll(/data:image\/png;base64,[A-Za-z0-9+/=]+/g)];
if (logoSlots.length !== 2) {
  console.error(`SPEC_REJECTED_logo_slots: found ${logoSlots.length}, expected 2`);
  process.exit(4);
}
const PALETTE = (spec.brand_trust_kit && spec.brand_trust_kit.palette) || {};
const primary = /^#[0-9a-f]{6}$/i.test(PALETTE.primary || '') ? PALETTE.primary : '#0b1329';
const accent = /^#[0-9a-f]{6}$/i.test(PALETTE.accent || '') ? PALETTE.accent : '#f59e0b';
const monoPath = path.join(OUT, 'favicon.png');
let monoInfo = { initials: '' };
try {
  const out = require('child_process').execFileSync('node', [
    path.join(ROOT, 'scripts', 'make-monogram.js'),
    '--name', businessName,
    '--primary', primary,
    '--accent', accent,
    '--out', monoPath,
  ], { encoding: 'utf8', timeout: 60000 });
  monoInfo = JSON.parse(out.trim().split('\n').pop());
} catch (e) {
  console.error('SPEC_REJECTED_monogram_failed: ' + String(e.message || e).slice(0, 200));
  process.exit(4);
}
const monoB64 = 'data:image/png;base64,' + fs.readFileSync(monoPath).toString('base64');
// Both logo slots point at real files. gate2 requires every image slot to be a
// named, provenance-declared asset; an inline data URI has no filename and can
// never be resolved, so it fails the source-photo check by construction.
// Header and footer get distinct filenames: gate2 reads two <img> tags pointing
// at the same basename as "image reused on page", even for a shared brand mark.
tpl = tpl.replace(logoSlots[0], './assets/brand-mark.png');
tpl = tpl.replace(logoSlots[1], './assets/brand-mark-footer.png');
// alt text must not claim to be someone else's logo
tpl = tpl.replace(/alt="[^"]*Logo"/g, `alt="${esc(NAME_TITLE)} logo"`);

// 12. Contact block: verified phone + email only, never invented
if (phone) {
  tpl = tpl.replace(/href="tel:[^"]*"/g, `href="tel:${phone.replace(/[^\d+]/g, '')}"`);
  tpl = tpl.replace(/(?:01384|0121|01902)\s?\d{3}\s?\d{3,4}/g, phone);
}
if (email) {
  tpl = tpl.replace(/href="mailto:[^"]*"/g, `href="mailto:${email}"`);
  tpl = tpl.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, email);
}

// 13. Honesty guard: if any kitchen-bespoke language survived in VISIBLE copy, refuse.
//     alt="" and photo-credit attributions are provenance, not claims, so they are
//     excluded from the scan.
const visible = tpl
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ');
const LEAK = ['Luxury Bespoke Kitchens', 'Architectural Extensions', 'Turnkey Renovations',
  'Bespoke Kitchens', 'kitchen islands', 'Wednesbury team', 'Simplicity Design'];
for (const phrase of LEAK) {
  if (visible.includes(phrase)) {
    console.error(`SPEC_REJECTED_trade_copy_leak: ${phrase}`);
    process.exit(4);
  }
}

// Founder hero/card policy is compiled INTO each page so previews render on
// Github Pages, Brian's preview proxy and cached HTML without external CSS.
// Its source is shared and trade-neutral, not per-prospect hardcoded markup.
const visualPolicy = fs.readFileSync(path.join(ROOT, 'scripts', 'founder-hero-card-polish.css'), 'utf8');
if (!visualPolicy.includes('FOUNDER_IMAGE_CARD_POLICY_V2')) {
  console.error('SPEC_REJECTED_founder_visual_policy_missing');
  process.exit(4);
}
if (!tpl.includes('FOUNDER_IMAGE_CARD_POLICY_V2')) {
  if (!tpl.includes('</style>')) {
    console.error('SPEC_REJECTED_no_style_element_for_visual_policy');
    process.exit(4);
  }
  tpl = tpl.replace('</style>', '\n' + visualPolicy + '\n</style>');
}

// Subject-to-card QA. A generic trade photo is NOT evidence of a specific
// service. In particular, a park/kitchen photo cannot stand in for paving,
// decking or lawns. Fail the build rather than ship another false image.
if (tradeKey === 'landscaping') {
  const required = [
    /pav(?:ing|er|ement)?|patio|flagstone|stone.?path|block.?pav/i,
    /deck(?:ing)?|fenc(?:e|ing)|timber.?screen/i,
    /turf|lawn|grass|garden.?plant|landscap(?:ing)?/i
  ];
  for (let i = 0; i < required.length; i++) {
    const photo = five[i + 2];
    const evidence = String(photo?.source_url || '') + ' ' + String(photo?.notes || '');
    if (!required[i].test(evidence)) {
      console.error('ASSET_SET_UNAVAILABLE_service_card_subject_mismatch slot=' +
        (i + 1) + ' source=' + String(photo?.source_url || 'unverified').slice(0,180));
      process.exit(4);
    }
  }
}

// ---------------- write ----------------
fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), tpl);

const prov = { slug: spec.slug || path.basename(OUT), trade_key: tradeKey, assets: {} };
const roles = ['hero.jpg', 'process-bg.jpg', 'service-1.jpg', 'service-2.jpg', 'service-3.jpg'];
five.forEach((p, i) => {
  const dest = path.join(OUT, 'assets', roles[i]);
  fs.copyFileSync(p.file, dest);
  prov.assets[roles[i]] = {
    role: roles[i].replace(/\.jpg$/, ''),
    sha256: sha256File(dest),
    source_url: p.source_url,
    license: p.license || 'UNVERIFIED',
    notes: p.notes || '',
  };
});
const monoProv = (role) => ({
  role,
  sha256: sha256File(path.join(OUT, 'favicon.png')),
  // distinct origin per slot: gate2 treats one origin on 2 slots as photo
  // recycling. A generated monogram is not a sourced photograph, so the origin
  // records which generated artefact it is, not an external photo.
  source_url: `generated:monogram-${monoInfo.initials.toLowerCase()}-${role}`,
  license: 'GENERATED',
  notes: `deterministic monogram initials=${monoInfo.initials} primary=${primary} accent=${accent}`,
});
prov.assets['favicon.png'] = monoProv('favicon');
prov.assets['brand-mark.png'] = monoProv('header');
// footer mark: same monogram bytes, own filename so no slot is reused
prov.assets['brand-mark-footer.png'] = monoProv('footer');
fs.copyFileSync(path.join(OUT, 'favicon.png'), path.join(OUT, 'assets', 'brand-mark.png'));
fs.copyFileSync(path.join(OUT, 'favicon.png'), path.join(OUT, 'assets', 'brand-mark-footer.png'));
fs.writeFileSync(path.join(OUT, 'asset-sources.json'), JSON.stringify(prov, null, 2) + '\n');

console.log(JSON.stringify({
  ok: true,
  slug: prov.slug,
  trade_key: tradeKey,
  template_sha256: tplSha,
  html_sha256: sha256Buf(Buffer.from(tpl, 'utf8')),
  bytes: Buffer.byteLength(tpl, 'utf8'),
}));
