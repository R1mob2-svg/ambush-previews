#!/usr/bin/env python3
"""Apply preview-only, provenance-tracked visual improvements. Never sends outreach."""
import hashlib, io, json, os, pathlib, re, urllib.request
from PIL import Image, ImageOps
ROOT = pathlib.Path(__file__).resolve().parents[1]
plan = json.loads((ROOT / "image-review/asset-plan.json").read_text())
for item in plan["assets"]:
    slug, filename = item["slug"], item["filename"]
    if not slug.replace("-", "").replace("_", "").isalnum() or not re.fullmatch(r"[A-Za-z0-9_-]+\.(?:jpg|jpeg)", filename):
        raise ValueError("Unsafe asset path")
    url = item["download_url"]
    if not url.startswith("https://dnznrvs05pmza.cloudfront.net/"):
        raise ValueError("Unexpected asset source")
    path = ROOT / slug / "assets" / filename
    if not path.is_file():
        raise FileNotFoundError(path)
    req = urllib.request.Request(url, headers={"User-Agent": "DigitalAmbushVisualReview/1.0"})
    with urllib.request.urlopen(req, timeout=90) as resp:
        data = resp.read(15_000_000)
    with Image.open(io.BytesIO(data)) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        if im.width < 1000 or im.height < 450:
            raise ValueError(f"Image too small: {im.size}")
        im.save(path, format="JPEG", quality=88, optimize=True, progressive=True)
    imgbytes = path.read_bytes()
    digest = hashlib.sha256(imgbytes).hexdigest()
    provenance_path = ROOT / slug / "asset-sources.json"
    provenance = json.loads(provenance_path.read_text())
    entry = {"role": "hero" if "hero" in filename.lower() else "supporting",
             "sha256": digest,
             "source_url": "generated:runway:" + item["task_id"],
             "license": "AI_GENERATED_COMMERCIAL_USE",
             "notes": "Illustrative AI-generated trade scene; not a photograph of the customer's actual work"}
    if "assets" in provenance:
        provenance["assets"][filename] = entry
    else:
        provenance[filename] = entry
    provenance_path.write_text(json.dumps(provenance, indent=2, ensure_ascii=False) + "\n")
    print(f"UPDATED {slug}/assets/{filename} {im.width}x{im.height} sha256={digest}")
