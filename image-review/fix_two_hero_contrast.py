#!/usr/bin/env python3
"""Non-generative luminosity corrections for two actually failed, SHA-tracked heroes."""
from pathlib import Path
import hashlib, json, math
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
SITES=[
 ("a-snows-roofing-services-12131057","hero.jpg"),
 ("rm-frogley-fencing-and-landscaping-limited-35187792471036","hero.jpg"),
]
for slug,filename in SITES:
  site=ROOT/slug
  manifest=site/"asset-sources.json"
  entries=json.loads(manifest.read_text())
  assets=entries["assets"] if "assets" in entries else entries
  previous=assets[filename]
  if previous.get("contrast_review_adjusted") is True:
    print("ALREADY_CORRECTED",slug)
    continue
  dest=site/"assets"/filename
  with Image.open(dest) as original:
    img=original.convert("RGB")
    w,h=img.size
    pixels=img.load()
    # Subtle photographic vignette under left-aligned headline. Right-hand
    # subject retains natural tone and detail; no text or external image.
    for x in range(w):
      frac=x/max(1,w-1)
      if frac<0.44: mult=0.50
      elif frac<0.73: mult=0.50+0.50*(frac-0.44)/0.29
      else: mult=1.0
      for y in range(h):
        r,g,b=pixels[x,y]
        pixels[x,y]=(round(r*mult),round(g*mult),round(b*mult))
    img.save(dest,"JPEG",quality=91,optimize=True,progressive=True)
  digest=hashlib.sha256(dest.read_bytes()).hexdigest()
  previous["sha256"]=digest
  previous["contrast_review_adjusted"]=True
  previous["contrast_review_note"]="NEWTON: measured hero contrast correction after 1440px Gate2 failure; non-generative edit."
  manifest.write_text(json.dumps(entries,indent=2,ensure_ascii=False)+"\n")
  print("CORRECTED",slug,digest)
