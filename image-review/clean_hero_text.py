#!/usr/bin/env python3
"""Remove accidental generated letters from hero text zones, never change business copy."""
import hashlib, io, json
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
AFFECTED={
"adams-gas-and-electric-services-12131022",
"ali-plumbing-and-heating-services-ltd-35187792471007",
"cheek-electrical-20261116",
"hallows-electrical-services-ltd-12131031",
"heat-zone-20261116",
"hobbs-hodgetts-0015",
"joshua-mcdougal-plastering-bedworth-12131089",
"mcd-painting-and-decorating-limited-35187792471024",
"mj-electrical-services-12131061",
"perton-plumbing-and-heating-12131055",
"plumbing-heating-solutions-midlands-ltd-12131003",
"rso-developments-0019",
"sparkes-electrical-solutions-ltd-202611170004",
"uk-calligraphy-and-painting-art-academy-35187792471025",
"walsall-plumbing-and-gas-20261116"
}
plan=json.loads((ROOT/"image-review/asset-plan.json").read_text())
for item in plan["assets"]:
    if item["slug"] not in AFFECTED: continue
    filename=item["filename"]
    site=ROOT/item["slug"]
    path=site/"assets"/filename
    with Image.open(path) as im:
        im=im.convert("RGB")
        w,h=im.size
        mask=Image.new("L",(w,1))
        a=mask.load()
        for x in range(w):
            frac=x/w
            opacity=255 if frac<=0.43 else (0 if frac>=0.66 else round(255*(0.66-frac)/0.23))
            a[x,0]=max(0,min(255,opacity))
        mask=mask.resize((w,h))
        dark=Image.new("RGB",(w,h),(11,19,26))
        clean=Image.composite(dark,im,mask)
        clean.save(path,"JPEG",quality=88,optimize=True,progressive=True)
    digest=hashlib.sha256(path.read_bytes()).hexdigest()
    manifest=site/"asset-sources.json"
    prov=json.loads(manifest.read_text())
    entries=prov["assets"] if "assets" in prov else prov
    entry=entries[filename]
    if not isinstance(entry,dict): raise ValueError("Unexpected provenance shape "+str(manifest))
    entry["sha256"]=digest
    entry["notes"]="Illustrative AI-generated trade image; not the customer's actual work. Accidental lettering concealed within the dark left hero title zone."
    manifest.write_text(json.dumps(prov,indent=2,ensure_ascii=False)+"\n")
    print("TEXT-ZONE-CLEANED",item["slug"],filename,digest)
print("CLEANED",len(AFFECTED))
