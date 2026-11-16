import json, os, re

sites = ['walsall-plumbing-and-gas-20261116', 'bl-holliday-roofing-20261116', 'heat-zone-20261116', 'dbritain-home-improvements-20261116']

for site in sites:
    html = open(f'{site}/index.html', encoding='utf-8').read()
    prov_file = f'{site}/asset-sources.json'
    prov_data = json.load(open(prov_file, encoding='utf-8'))
    assets = prov_data.get('assets', prov_data)
    
    srcs = re.findall(r'<img[^>]+src=["\']([^"\']+)["\']', html)
    bgs = re.findall(r'url\(["\']?([^"\')]+\.(?:jpg|jpeg|png|webp))["\']?\)', html, re.I)
    
    used_files = set([os.path.basename(s).lower() for s in srcs + bgs])
    sources_used = {}
    for f in used_files:
        val = assets.get(f, {})
        u = val.get('source_url', val) if isinstance(val, dict) else val
        sources_used.setdefault(u, []).append(f)
    
    print(f'=== {site} ===')
    for src, flist in sources_used.items():
        if len(flist) > 1:
            print(f'  PAGE-INTERNAL DUPLICATION: {src} -> {flist}')
        else:
            print(f'  ok: {flist[0]} -> {str(src)[:60]}')
