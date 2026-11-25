#!/usr/bin/env python3
"""
NEO verified photo pool builder.

Fills scripts/photo-pool.json with VERIFIED, on-trade Wikimedia Commons photos
that are NOT yet used by any prospect. This is what the overnight builder draws
from when assembling 5-photo sets for CRM leads.

Honesty rules baked in:
  - Only real Commons files that resolve via the API get in.
  - Every entry carries source_url, license, author, and the local file path.
  - Nothing is invented. If a query yields nothing, the pool stays small and the
    builder correctly reports ASSET_SET_UNAVAILABLE instead of faking 5 photos.
  - Rate-limit aware: 1s between API calls, backoff on 429.

Run: python3 scripts/build-photo-pool.py [--per-trade N]
"""
import json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POOL_PATH = os.path.join(ROOT, 'scripts', 'photo-pool.json')
CACHE = os.path.join(ROOT, 'scripts', 'photo-cache')
UA = 'NEO-DigitalAmbush/1.0 (https://geminx.ai; r1mob2@hotmail.com)'

# NEO 2026-11-25: honesty guards. `local_file` must be a real path relative to
# ROOT (portable across machines/checkouts). Absolute /tmp paths are disposable
# and must never be persisted; placeholder strings must never be persisted.
PLACEHOLDER_LOCAL_FILE = 'PERSISTENT_CACHE_BY_SOURCE_URL'


def bad_local_file(value):
    """Return a reason string if local_file is unusable, else None."""
    if not isinstance(value, str) or not value.strip():
        return 'missing'
    if PLACEHOLDER_LOCAL_FILE in value:
        return 'placeholder'
    if os.path.isabs(value):
        return 'absolute-path'
    if '..' in value.split('/'):
        return 'path-traversal'
    if not os.path.exists(os.path.join(ROOT, value)):
        return 'missing-on-disk'
    return None


def sanitize_pool(pool):
    """Drop entries whose local_file is a placeholder, absolute or unresolved."""
    kept, dropped = [], []
    for p in pool:
        reason = bad_local_file(p.get('local_file'))
        if reason:
            dropped.append({'source_url': p.get('source_url'), 'reason': reason})
        else:
            kept.append(p)
    return kept, dropped

# Trade -> Commons categories that reliably hold genuine on-trade photography.
# NEO 2026-11-18: widened after measuring the real bottleneck — 8 photos/trade is
# enough for exactly ONE page per trade, and the queue needs 109 pages. These
# categories are all genuine work-in-progress / installed-work photography, not
# stock lifestyle filler, and each file still has to resolve through the API and
# carry a licence before it is allowed into the pool.
TRADE_CATEGORIES = {
    'heating': [
        'Underfloor heating', 'Boiler rooms', 'Radiators', 'Central heating',
        'Boilers', 'Heating systems', 'Thermostats', 'Water heating',
        'Hot water cylinders', 'Heat pumps', 'Pipe insulation',
    ],
    'plumber': [
        'Plumbing', 'Water pipes', 'Plumbers', 'Sanitary installations',
        'Pipe fitting', 'Faucets', 'Sinks', 'Toilets',
        'Bathrooms under construction', 'Sewerage', 'Water supply', 'Pipework',
    ],
    'electrician': [
        'Electrical installations', 'Electricians', 'Consumer units',
        'Electrical wiring', 'Electrical cables', 'Distribution boards',
        'Light switches', 'Electrical sockets', 'Cable trays',
        'Electrical conduit', 'Circuit breakers',
    ],
    'roofer': [
        'Roofing', 'Roofers', 'Roof tiles', 'Roof construction',
        'Slate roofs', 'Roof flashing', 'Gutters', 'Chimneys',
        'Roof underlay', 'Thatched roofs',
    ],
    'builder': [
        'Building construction', 'Bricklaying', 'Scaffolding', 'Concrete construction',
        'Masonry', 'House construction', 'Building sites', 'Foundations (engineering)',
        'Cement', 'Construction workers', 'Timber framing',
    ],
    'plasterer': [
        'Plastering', 'Plasterers', 'Plaster', 'Stucco',
        'Wall finishing', 'Drywall', 'Render (masonry)',
    ],
    'joinery': [
        'Joinery', 'Carpenters', 'Woodworking', 'Carpentry',
        'Woodworking tools', 'Timber', 'Cabinet making', 'Wood joints',
        'Workshops (woodworking)',
    ],
    'painter': [
        'House painting', 'Painters (trade)', 'Painting (trade)', 'Paint rollers',
        'Paint brushes', 'Wall painting', 'Decorating',
    ],
    'landscaper': [
        'Landscaping', 'Garden construction', 'Paving', 'Garden walls',
        'Fencing', 'Turf', 'Garden design', 'Retaining walls',
        'Decking', 'Trees in gardens',
    ],
    'tiler': [
        'Tiling', 'Tilers', 'Tiles', 'Ceramic tiles',
        'Floor tiles', 'Wall tiles', 'Mosaic',
    ],
    'gas_engineer': [
        'Gas pipes', 'Gas installations', 'Gas meters', 'Gas boilers',
        'Gas fittings', 'Gas regulators',
    ],
}

def api(params):
    url = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.load(r)
        except Exception as e:
            if '429' in str(e) or '403' in str(e):
                wait = 5 * (attempt + 1)
                print(f'  rate limited, sleeping {wait}s', flush=True)
                time.sleep(wait)
            else:
                print(f'  api error: {e}', flush=True)
                time.sleep(2)
    return None

def category_files(cat, limit=60):
    d = api({'action': 'query', 'list': 'categorymembers', 'cmtitle': 'Category:' + cat,
             'cmtype': 'file', 'cmlimit': limit, 'format': 'json'})
    if not d:
        return []
    return [m['title'] for m in d.get('query', {}).get('categorymembers', [])]

def file_info(title):
    d = api({'action': 'query', 'titles': title, 'prop': 'imageinfo',
             'iiprop': 'url|size|extmetadata', 'iiurlwidth': 1600, 'format': 'json'})
    if not d:
        return None
    pages = d.get('query', {}).get('pages', {})
    page = list(pages.values())[0] if pages else None
    if not page or 'imageinfo' not in page:
        return None
    ii = page['imageinfo'][0]
    meta = ii.get('extmetadata', {})
    lic = (meta.get('LicenseShortName', {}) or {}).get('value', '')
    author = re.sub('<[^>]+>', '', (meta.get('Artist', {}) or {}).get('value', '') or '').strip()
    return {
        'title': title,
        'url': ii.get('thumburl') or ii.get('url'),
        'orig': ii.get('url'),
        'width': ii.get('width'),
        'height': ii.get('height'),
        'license': lic,
        'author': author,
        'page': 'https://commons.wikimedia.org/wiki/' + urllib.parse.quote(title.replace(' ', '_')),
    }

def download(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 20000:
        return True
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                data = r.read()
            if len(data) < 20000:
                return False
            with open(dest, 'wb') as f:
                f.write(data)
            return True
        except Exception as e:
            if '429' in str(e):
                time.sleep(5 * (attempt + 1))
            else:
                time.sleep(2)
    return False

def main():
    per_trade = 40
    if '--per-trade' in sys.argv:
        per_trade = int(sys.argv[sys.argv.index('--per-trade') + 1])
    os.makedirs(CACHE, exist_ok=True)

    # existing pool: keep it, never re-download
    pool = []
    if os.path.exists(POOL_PATH):
        try:
            pool = json.load(open(POOL_PATH))
        except Exception:
            pool = []
    pool, dropped = sanitize_pool(pool)
    if dropped:
        print(f'PRUNED {len(dropped)} unsafe pool entries:', flush=True)
        for d in dropped:
            print(f'  - {d["reason"]}: {d["source_url"]}', flush=True)
    have = {(p['source_url']) for p in pool}
    print(f'pool already has {len(pool)} entries', flush=True)

    added = 0
    for trade, cats in TRADE_CATEGORIES.items():
        got = 0
        for cat in cats:
            if got >= per_trade:
                break
            files = category_files(cat)
            print(f'{trade}/{cat}: {len(files)} files', flush=True)
            for title in files:
                if got >= per_trade:
                    break
                if not re.search(r'\.(jpe?g|png)$', title, re.I):
                    continue
                if re.search(r'(logo|icon|map|diagram|drawing|plan|patent|poster|stamp|coat of arms|\.svg)', title, re.I):
                    continue
                info = file_info(title)
                time.sleep(1.0)
                if not info or not info['width'] or info['width'] < 1000:
                    continue
                if not re.search(r'(CC|Public domain|PDM|GFDL)', info['license'], re.I):
                    continue
                if info['page'] in have:
                    continue
                slug = re.sub(r'[^a-z0-9]+', '-', title.lower())[:90].strip('-')
                dest = os.path.join(CACHE, f'{trade}-{slug}.jpg')
                if not download(info['url'], dest):
                    continue
                rel = os.path.relpath(dest, ROOT)
                reason = bad_local_file(rel)
                if reason:
                    print(f'  REJECT {trade}: {title[:60]} local_file={rel} ({reason})', flush=True)
                    continue
                entry = {
                    'trade': trade,
                    'local_file': rel,
                    'source_url': info['page'],
                    'license': info['license'],
                    'author': info['author'] or 'Wikimedia Commons contributor',
                    'notes': f'Commons: {title}',
                }
                pool.append(entry)
                have.add(info['page'])
                added += 1
                got += 1
                print(f'  + {trade}: {title[:70]} [{info["license"]}]', flush=True)

    # Final guard: never persist an unsafe entry, even if one slipped through.
    pool, dropped_final = sanitize_pool(pool)
    if dropped_final:
        print(f'FINAL_PRUNE {len(dropped_final)} unsafe entries', flush=True)
    json.dump(pool, open(POOL_PATH, 'w'), indent=1)
    print(f'DONE. pool={len(pool)} (+{added} this run)', flush=True)

if __name__ == '__main__':
    main()
