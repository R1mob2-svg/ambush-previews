import json, os, hashlib, re
from PIL import Image

def get_sha256(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()

def crop_hero_right(src_path, dest_path, target_w=1440, target_h=720, focus_x=0.75, focus_y=0.45):
    im = Image.open(src_path).convert('RGB')
    orig_w, orig_h = im.size
    
    target_aspect = target_w / target_h
    orig_aspect = orig_w / orig_h
    
    if orig_aspect > target_aspect:
        # Image is wider than needed, crop width
        crop_h = orig_h
        crop_w = int(orig_h * target_aspect)
        # Position crop so focus_x is around the right 75% of the frame
        center_x = int(orig_w * focus_x)
        left = max(0, min(center_x - int(crop_w * 0.70), orig_w - crop_w))
        top = 0
    else:
        # Image is taller than needed, crop height
        crop_w = orig_w
        crop_h = int(orig_w / target_aspect)
        center_y = int(orig_h * focus_y)
        top = max(0, min(center_y - int(crop_h * 0.5), orig_h - crop_h))
        left = 0
        
    cropped = im.crop((left, top, left + crop_w, top + crop_h))
    resized = cropped.resize((target_w, target_h), Image.Resampling.LANCZOS)
    resized.save(dest_path, 'JPEG', quality=88)
    print(f"Cropped {src_path} -> {dest_path} ({target_w}x{target_h})")

def crop_service(src_path, dest_path, target_w=1200, target_h=900):
    im = Image.open(src_path).convert('RGB')
    orig_w, orig_h = im.size
    target_aspect = target_w / target_h
    orig_aspect = orig_w / orig_h
    
    if orig_aspect > target_aspect:
        crop_h = orig_h
        crop_w = int(orig_h * target_aspect)
        left = (orig_w - crop_w) // 2
        top = 0
    else:
        crop_w = orig_w
        crop_h = int(orig_w / target_aspect)
        left = 0
        top = (orig_h - crop_h) // 2
        
    cropped = im.crop((left, top, left + crop_w, top + crop_h))
    resized = cropped.resize((target_w, target_h), Image.Resampling.LANCZOS)
    resized.save(dest_path, 'JPEG', quality=88)
    print(f"Cropped service {src_path} -> {dest_path} ({target_w}x{target_h})")

# 1. Update CSS in bl-holliday, heat-zone, dbritain
for slug in ['bl-holliday-roofing-20261116', 'heat-zone-20261116', 'dbritain-home-improvements-20261116']:
    p = f'{slug}/index.html'
    if os.path.exists(p):
        with open(p, 'r', encoding='utf-8') as f:
            html = f.read()
        html = re.sub(r'(\.hero-bg\{[^}]*background-position:)[^;]+;', r'\1 100% 30%;', html)
        with open(p, 'w', encoding='utf-8') as f:
            f.write(html)
        print(f"Updated {slug} CSS hero-bg to 100% 30%")

# 2. Re-assign Heat Zone to 100% unique photography
# Hero: underfloor_heating_pd.jpg (Public domain underfloor heating installation)
crop_hero_right('pool_downloads/underfloor_heating_pd.jpg', 'heat-zone-20261116/assets/hero.jpg', focus_x=0.80)
# Service-1: thermostatic_radiator_valve.jpg
crop_service('pool_downloads/thermostatic_radiator_valve.jpg', 'heat-zone-20261116/assets/service-1.jpg')
# Service-2: underfloor_manifold_de.jpg
crop_service('pool_downloads/underfloor_manifold_de.jpg', 'heat-zone-20261116/assets/service-2.jpg')

hz_prov = {
  "slug": "heat-zone-20261116",
  "prospect_id": "WM-LTD-20261116-0010",
  "business_name": "HEAT ZONE LIMITED",
  "assets": {
    "hero.jpg": {
      "role": "hero",
      "dimensions": "1440x720",
      "sha256": get_sha256("heat-zone-20261116/assets/hero.jpg"),
      "source_url": "https://commons.wikimedia.org/wiki/File:Public_domain_image_-_underfloor_heating_installation.JPG",
      "license": "CC0 / Public Domain",
      "notes": "Underfloor heating pipe installation and structural floor loops, right weighted."
    },
    "service-1.jpg": {
      "role": "service-1",
      "dimensions": "1200x900",
      "sha256": get_sha256("heat-zone-20261116/assets/service-1.jpg"),
      "source_url": "https://commons.wikimedia.org/wiki/File:Thermostatic_Radiator_Valve.jpg",
      "license": "CC BY-SA 3.0",
      "notes": "Thermostatic radiator control valve and central heating system balancing."
    },
    "service-2.jpg": {
      "role": "service-2",
      "dimensions": "1200x900",
      "sha256": get_sha256("heat-zone-20261116/assets/service-2.jpg"),
      "source_url": "https://commons.wikimedia.org/wiki/File:Heizkreisverteiler.jpg",
      "license": "CC BY-SA 3.0",
      "notes": "Precision manifold distribution circuits and flow meters."
    },
    "favicon.png": "generated:monogram"
  }
}
with open('heat-zone-20261116/asset-sources.json', 'w', encoding='utf-8') as f:
    json.dump(hz_prov, f, indent=2)
print("Saved heat-zone asset-sources.json")

# 3. Re-assign D Britain to 100% unique photography
# Hero: bathroom_faucet.jpg (Modern tap and basin installation)
crop_hero_right('test_assets/bathroom_faucet.jpg', 'dbritain-home-improvements-20261116/assets/hero.jpg', focus_x=0.75)
# Service-1: plumber_two_wrenches.jpg
crop_service('pool_downloads/plumber_two_wrenches.jpg', 'dbritain-home-improvements-20261116/assets/service-1.jpg')
# Service-2: cast_dwv.jpg
crop_service('test_assets/cast_dwv.jpg', 'dbritain-home-improvements-20261116/assets/service-2.jpg')

db_prov = {
  "slug": "dbritain-home-improvements-20261116",
  "prospect_id": "WM-LTD-20261116-0011",
  "business_name": "D BRITAIN HOME IMPROVEMENTS LIMITED",
  "assets": {
    "hero.jpg": {
      "role": "hero",
      "dimensions": "1440x720",
      "sha256": get_sha256("dbritain-home-improvements-20261116/assets/hero.jpg"),
      "source_url": "https://commons.wikimedia.org/wiki/File:Bathroom_faucet_installation.jpg",
      "license": "CC BY-SA 4.0",
      "notes": "Chrome ceramic disc basin mixer tap and sanitary plumbing installation."
    },
    "service-1.jpg": {
      "role": "service-1",
      "dimensions": "1200x900",
      "sha256": get_sha256("dbritain-home-improvements-20261116/assets/service-1.jpg"),
      "source_url": "https://commons.wikimedia.org/wiki/File:Plumber_uses_two_wrenches_to_tighten_a_fitting.jpg",
      "license": "CC BY-SA 2.0",
      "notes": "Plumber using dual Stillson wrenches to securely tighten pipe fittings."
    },
    "service-2.jpg": {
      "role": "service-2",
      "dimensions": "1200x900",
      "sha256": get_sha256("dbritain-home-improvements-20261116/assets/service-2.jpg"),
      "source_url": "https://commons.wikimedia.org/wiki/File:Cast-iron_plumbing_pipe.jpg",
      "license": "CC0 / Public Domain",
      "notes": "Heavy-duty domestic drainage and waste pipework installation."
    },
    "favicon.png": "generated:monogram"
  }
}
with open('dbritain-home-improvements-20261116/asset-sources.json', 'w', encoding='utf-8') as f:
    json.dump(db_prov, f, indent=2)
print("Saved dbritain asset-sources.json")

# 4. Check bl-holliday hero
crop_hero_right('test_assets/roof_repair_work.jpg', 'bl-holliday-roofing-20261116/assets/hero.jpg', focus_x=0.82)
bl_prov = json.load(open('bl-holliday-roofing-20261116/asset-sources.json'))
bl_prov['assets']['hero.jpg']['sha256'] = get_sha256('bl-holliday-roofing-20261116/assets/hero.jpg')
with open('bl-holliday-roofing-20261116/asset-sources.json', 'w') as f:
    json.dump(bl_prov, f, indent=2)
print("Saved bl-holliday asset-sources.json")
