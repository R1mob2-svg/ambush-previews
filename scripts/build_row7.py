import json, os, hashlib
from PIL import Image

def get_sha256(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()

def crop_hero_right(src_path, dest_path, target_w=1440, target_h=720, focus_x=0.75, focus_y=0.5):
    im = Image.open(src_path).convert('RGB')
    orig_w, orig_h = im.size
    target_aspect = target_w / target_h
    orig_aspect = orig_w / orig_h
    
    if orig_aspect > target_aspect:
        crop_h = orig_h
        crop_w = int(orig_h * target_aspect)
        center_x = int(orig_w * focus_x)
        left = max(0, min(center_x - int(crop_w * 0.70), orig_w - crop_w))
        top = 0
    else:
        crop_w = orig_w
        crop_h = int(orig_w / target_aspect)
        center_y = int(orig_h * focus_y)
        top = max(0, min(center_y - int(crop_h * 0.5), orig_h - crop_h))
        left = 0
        
    cropped = im.crop((left, top, left + crop_w, top + crop_h))
    resized = cropped.resize((target_w, target_h), Image.Resampling.LANCZOS)
    resized.save(dest_path, 'JPEG', quality=88)
    print(f"Hero cropped: {src_path} -> {dest_path} ({target_w}x{target_h})")

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
    print(f"Service cropped: {src_path} -> {dest_path} ({target_w}x{target_h})")

dest_dir = "stm-plumbing-heating-uk-0012/assets"
os.makedirs(dest_dir, exist_ok=True)

# Hero: Plumber 01.jpg (authentic plumber working on water connection, right-weighted)
crop_hero_right("pool_downloads/plumber_01.jpg", f"{dest_dir}/hero.jpg", focus_x=0.80)

# Service 1: Propane torch soldering copper pipe
crop_service("pool_downloads/propane_torch_soldering.jpg", f"{dest_dir}/service-1.jpg")

# Service 2: Wall mounted boiler in kitchen
crop_service("pool_downloads/wall_mounted_boiler.jpg", f"{dest_dir}/service-2.jpg")

prov = {
  "slug": "stm-plumbing-heating-uk-0012",
  "prospect_id": "WM-LTD-20261116-0012",
  "business_name": "STM PLUMBING & HEATING (UK) LIMITED",
  "assets": {
    "hero.jpg": {
      "role": "hero",
      "dimensions": "1440x720",
      "sha256": get_sha256(f"{dest_dir}/hero.jpg"),
      "source_url": "https://commons.wikimedia.org/wiki/File:Plumber_01.jpg",
      "license": "CC BY-SA 4.0",
      "notes": "Authentic professional plumber carrying out domestic water connection work. Right-weighted trade action."
    },
    "service-1.jpg": {
      "role": "service-1",
      "dimensions": "1200x900",
      "sha256": get_sha256(f"{dest_dir}/service-1.jpg"),
      "source_url": "https://commons.wikimedia.org/wiki/File:Propane_torch_soldering_copper_pipe.jpg",
      "license": "CC BY-SA 3.0",
      "notes": "Precision propane torch soldering on domestic copper water line."
    },
    "service-2.jpg": {
      "role": "service-2",
      "dimensions": "1200x900",
      "sha256": get_sha256(f"{dest_dir}/service-2.jpg"),
      "source_url": "https://commons.wikimedia.org/wiki/File:Wall_mounted_boiler_in_kitchen.jpg",
      "license": "CC BY-SA 4.0",
      "notes": "Domestic wall-mounted heating boiler system in residential installation."
    },
    "favicon.png": "generated:monogram"
  }
}

with open("stm-plumbing-heating-uk-0012/asset-sources.json", "w", encoding="utf-8") as f:
    json.dump(prov, f, indent=2)

print("Row 7 (stm-plumbing-heating-uk-0012) assets generated and asset-sources.json locked!")
