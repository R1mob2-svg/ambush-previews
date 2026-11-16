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
    print(f"Hero cropped: {src_path} -> {dest_path}")

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
    print(f"Service cropped: {src_path} -> {dest_path}")

# ==========================================
# 1. Row 8: ASSG PLUMBING AND HEATING SERVICES LTD (assg-plumbing-and-heating-services-0013)
# ==========================================
assg_assets = "assg-plumbing-and-heating-services-0013/assets"
os.makedirs(assg_assets, exist_ok=True)
crop_hero_right("pool_downloads/radiator_replacement_01.jpg", f"{assg_assets}/hero.jpg", focus_x=0.78)
crop_service("pool_downloads/copper_water_pipes_clean.jpg", f"{assg_assets}/service-1.jpg")
crop_service("pool_downloads/stillson_wrench.jpg", f"{assg_assets}/service-2.jpg")

assg_prov = {
  "slug": "assg-plumbing-and-heating-services-0013",
  "prospect_id": "WM-LTD-20261116-0013",
  "business_name": "ASSG PLUMBING AND HEATING SERVICES LTD",
  "assets": {
    "hero.jpg": {
      "role": "hero",
      "dimensions": "1440x720",
      "sha256": get_sha256(f"{assg_assets}/hero.jpg"),
      "source_url": "https://commons.wikimedia.org/wiki/File:Replacement_of_a_central_heating_radiator,_Hillegersberg,_Rotterdam_(2022)_01.jpg",
      "license": "CC BY-SA 4.0",
      "notes": "Heating technician replacing domestic central heating radiator and pipe fittings."
    },
    "service-1.jpg": {
      "role": "service-1",
      "dimensions": "1200x900",
      "sha256": get_sha256(f"{assg_assets}/service-1.jpg"),
      "source_url": "https://commons.wikimedia.org/wiki/File:Copper_water_pipes.jpg",
      "license": "CC BY-SA 3.0",
      "notes": "Domestic copper pipe installation with precision soldered joints."
    },
    "service-2.jpg": {
      "role": "service-2",
      "dimensions": "1200x900",
      "sha256": get_sha256(f"{assg_assets}/service-2.jpg"),
      "source_url": "https://commons.wikimedia.org/wiki/File:Stillson_Pipe_Wrench_of_Stephen_and_Elmer_Braun.jpg",
      "license": "CC0 / Public Domain",
      "notes": "Heavy-duty Stillson plumbing wrench for precision pipe fitting and repairs."
    },
    "favicon.png": "generated:monogram"
  }
}
with open("assg-plumbing-and-heating-services-0013/asset-sources.json", "w", encoding="utf-8") as f:
    json.dump(assg_prov, f, indent=2)

# ==========================================
# 2. Row 9: BK GAS AND PLUMBING LTD (bk-gas-and-plumbing-0014)
# ==========================================
bk_assets = "bk-gas-and-plumbing-0014/assets"
os.makedirs(bk_assets, exist_ok=True)
crop_hero_right("pool_downloads/gas_pipe_construction.jpg", f"{bk_assets}/hero.jpg", focus_x=0.80)
crop_service("pool_downloads/pex_tools_fittings.jpg", f"{bk_assets}/service-1.jpg")
crop_service("pool_downloads/pipe_clamp_steel.jpg", f"{bk_assets}/service-2.jpg")

bk_prov = {
  "slug": "bk-gas-and-plumbing-0014",
  "prospect_id": "WM-LTD-20261116-0014",
  "business_name": "BK GAS AND PLUMBING LTD",
  "assets": {
    "hero.jpg": {
      "role": "hero",
      "dimensions": "1440x720",
      "sha256": get_sha256(f"{bk_assets}/hero.jpg"),
      "source_url": "https://commons.wikimedia.org/wiki/File:Gas_Pipe_Installation_In_A_Construction_Site.jpg",
      "license": "CC BY-SA 4.0",
      "notes": "Certified gas line pipework installation and pressure safety checks."
    },
    "service-1.jpg": {
      "role": "service-1",
      "dimensions": "1200x900",
      "sha256": get_sha256(f"{bk_assets}/service-1.jpg"),
      "source_url": "https://commons.wikimedia.org/wiki/File:PEX_installation_tools_and_fittings.jpg",
      "license": "CC BY-SA 3.0",
      "notes": "Modern multi-layer barrier pipe crimping and precision plumbing fittings."
    },
    "service-2.jpg": {
      "role": "service-2",
      "dimensions": "1200x900",
      "sha256": get_sha256(f"{bk_assets}/service-2.jpg"),
      "source_url": "https://commons.wikimedia.org/wiki/File:Pipe_clamp_1.jpg",
      "license": "CC0 / Public Domain",
      "notes": "Structural steel pipe anchoring and vibration-damped bracket mounting."
    },
    "favicon.png": "generated:monogram"
  }
}
with open("bk-gas-and-plumbing-0014/asset-sources.json", "w", encoding="utf-8") as f:
    json.dump(bk_prov, f, indent=2)

# ==========================================
# 3. Row 10: HOBBS & HODGETTS LIMITED (hobbs-hodgetts-0015)
# ==========================================
hh_assets = "hobbs-hodgetts-0015/assets"
os.makedirs(hh_assets, exist_ok=True)
crop_hero_right("pool_downloads/modcon_boiler_system.jpg", f"{hh_assets}/hero.jpg", focus_x=0.75)
crop_service("pool_downloads/radiator_replacement_03.jpg", f"{hh_assets}/service-1.jpg")
crop_service("test_assets/plumber_wrench_hero.jpg", f"{hh_assets}/service-2.jpg")

hh_prov = {
  "slug": "hobbs-hodgetts-0015",
  "prospect_id": "WM-LTD-20261116-0015",
  "business_name": "HOBBS & HODGETTS LIMITED",
  "assets": {
    "hero.jpg": {
      "role": "hero",
      "dimensions": "1440x720",
      "sha256": get_sha256(f"{hh_assets}/hero.jpg"),
      "source_url": "https://commons.wikimedia.org/wiki/File:ModCon_boiler_system.jpg",
      "license": "CC BY-SA 3.0",
      "notes": "High efficiency condensing boiler and multi-zone heating distribution system."
    },
    "service-1.jpg": {
      "role": "service-1",
      "dimensions": "1200x900",
      "sha256": get_sha256(f"{hh_assets}/service-1.jpg"),
      "source_url": "https://commons.wikimedia.org/wiki/File:Replacement_of_a_central_heating_radiator,_Hillegersberg,_Rotterdam_(2022)_03.jpg",
      "license": "CC BY-SA 4.0",
      "notes": "Radiator pipe connection and system pressure regulation valves."
    },
    "service-2.jpg": {
      "role": "service-2",
      "dimensions": "1200x900",
      "sha256": get_sha256(f"{hh_assets}/service-2.jpg"),
      "source_url": "https://commons.wikimedia.org/wiki/File:Plumber_wrench_tools.jpg",
      "license": "CC0 / Public Domain",
      "notes": "Professional plumbing and pipe assembly wrench kit."
    },
    "favicon.png": "generated:monogram"
  }
}
with open("hobbs-hodgetts-0015/asset-sources.json", "w", encoding="utf-8") as f:
    json.dump(hh_prov, f, indent=2)

print("Rows 8, 9, 10 assets locked successfully!")
