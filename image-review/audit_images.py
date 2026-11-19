#!/usr/bin/env python3
"""Read-only source/image quality audit that writes reports and review contact sheets.

Refresh report after 88 distinct hero and 26 supporting replacement assets.
"""
from collections import Counter, defaultdict
from pathlib import Path
import hashlib, json, math, re
from PIL import Image, ImageOps, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"image-review"
SHEETS=OUT/"contact-sheets"
SHEETS.mkdir(exist_ok=True, parents=True)
def norm(v):
    if isinstance(v,str): return {"source":v}
    if isinstance(v,dict): return {"source":v.get("source_url") or v.get("source") or v.get("origin") or "", "sha256":v.get("sha256"), "role":v.get("role")}
    return {"source":""}
def trade_of(s):
    if "calligraphy" in s: return "calligraphy"
    if "classic-cars" in s: return "vehicle-spray"
    for name,patt in [("plastering",r"plaster|render"),("painting",r"paint|decor|spray"),("electrical",r"electric|electr|sparkes|lightwork|lizard"),("roofing",r"roof"),("plumbing",r"gas|heat|plumb|boiler|mechanical"),("joinery",r"join|carpent|wood|timber"),("landscaping",r"landscap|fenc")]:
        if re.search(patt,s): return name
    return "building"
def sha(b): return hashlib.sha256(b).hexdigest()
def dhash(im):
    g=ImageOps.grayscale(im).resize((9,8))
    px=list(g.getdata())
    return sum((1<<(r*8+c)) for r in range(8) for c in range(8) if px[r*9+c]>px[r*9+c+1])
records=[]
images_by_hash=defaultdict(list)
origins=defaultdict(list)
hero_cells=[]
support_cells=[]
suspect=re.compile(r"heel.abrasion|gipsmask|gene.wilder|cemetery|barbados|carosse|chaise.de.poste|china|chinois|mexicaine|art.project|portrait|advertisement|tram|bird.s.eye|iran|b[oó]brka|floral.tribute|medical|hospital|first.aid|theatre|ballet|skl[aá]rsk|filmacteur|un.tram|typography.of.advertisements",re.I)
for page in sorted(ROOT.glob("*/index.html")):
    slug=page.parent.name
    provenance=page.parent/"asset-sources.json"
    if not provenance.exists(): continue
    meta=json.loads(provenance.read_text())
    assets=meta.get("assets") if isinstance(meta.get("assets"),dict) else meta
    site={"slug":slug,"trade":trade_of(slug),"assets":[],"flags":[]}
    for filename,entry in assets.items():
        if not re.search(r"\.(?:jpe?g|png|webp)$",filename,re.I): continue
        if "favicon" in filename.lower() or "brand-mark" in filename.lower(): continue
        fp=page.parent/"assets"/filename
        src=norm(entry)
        kind="hero" if "hero" in filename.lower() else "support"
        obj={"filename":filename,"kind":kind,"source":src["source"],"sha_expected":src.get("sha256")}
        if not fp.is_file():
            obj["problem"]="MISSING_IMAGE"
            site["flags"].append("MISSING "+filename)
        else:
            payload=fp.read_bytes()
            digest=sha(payload)
            images_by_hash[digest].append(slug+"/"+filename)
            obj["sha256"]=digest
            obj["bytes"]=len(payload)
            if src.get("sha256") and src["sha256"].lower()!=digest:
                obj["problem"]="SHA_MISMATCH"
                site["flags"].append("HASH MISMATCH "+filename)
            try:
                with Image.open(fp) as raw:
                    im=ImageOps.exif_transpose(raw).convert("RGB")
                    obj["dimensions"]=list(im.size)
                    obj["dhash"]=format(dhash(im),"016x")
                    if im.width<560 or im.height<260: site["flags"].append("LOW_RES "+filename)
                    if kind=="hero" and im.width/im.height<1.5: site["flags"].append("NARROW_HERO "+filename)
                    if kind=="hero": hero_cells.append((slug+"/"+filename, im.copy()))
                    else: support_cells.append((slug+"/"+filename, im.copy()))
            except Exception as exc:
                site["flags"].append("UNREADABLE "+filename)
        if src["source"] and not src["source"].startswith("generated:"): origins[src["source"]].append(slug+"/"+filename)
        if suspect.search(src["source"]):
            obj["risk"]="OBVIOUSLY_IRRELEVANT_SOURCE"
            site["flags"].append("SOURCE_RISK "+filename)
        site["assets"].append(obj)
    records.append(site)
dupe_hashes={h:ps for h,ps in images_by_hash.items() if len({p.split("/")[0] for p in ps})>1}
dupe_sources={s:ps for s,ps in origins.items() if len({p.split("/")[0] for p in ps})>1}
def contact_sheets(cells,prefix):
    outputs=[]
    ncols,nrows=4,6
    w,h=308,205
    for idx in range(0,len(cells),ncols*nrows):
        sheet=Image.new("RGB",(w*ncols,h*nrows),(20,26,36))
        d=ImageDraw.Draw(sheet)
        part=cells[idx:idx+ncols*nrows]
        for k,(label,im) in enumerate(part):
            x=(k%ncols)*w
            y=(k//ncols)*h
            thumb=ImageOps.fit(im,(w-12,h-38),method=Image.Resampling.LANCZOS)
            sheet.paste(thumb,(x+6,y+6))
            shortened=label.replace("/assets/","/")[-49:]
            d.text((x+7,y+h-28),shortened,fill=(255,255,255))
        fn=f"{prefix}-{idx//(ncols*nrows)+1:02d}.jpg"
        sheet.save(SHEETS/fn,quality=83,optimize=True)
        outputs.append("image-review/contact-sheets/"+fn)
    return outputs
hero_sheets=contact_sheets(hero_cells,"hero")
support_sheets=contact_sheets(support_cells,"support")
report={"site_count":len(records),"total_assets":sum(len(x["assets"]) for x in records),
"heroes":len(hero_cells),"supporting":len(support_cells),
"source_risk_count":sum(1 for x in records for a in x["assets"] if a.get("risk")),
"sha_mismatch_count":sum(1 for x in records for a in x["assets"] if a.get("problem")=="SHA_MISMATCH"),
"cross_site_duplicate_byte_hashes":dupe_hashes,"cross_site_duplicate_source_origins":dupe_sources,
"hero_contact_sheets":hero_sheets,"support_contact_sheets":support_sheets,"sites":records,
"certification":"SOURCE_AND_PIXEL_INVENTORY_ONLY_NOT_A_HUMAN_VISUAL_QA_PASS"}
(OUT/"audit-report.json").write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n")
lines=["# Digital Ambush visual asset audit","","Review branch only, no outbound sends.",f"Sites: {len(records)} | Hero images: {len(hero_cells)} | Supporting images: {len(support_cells)}",f"Suspicious source titles: {report['source_risk_count']} | SHA mismatches: {report['sha_mismatch_count']}",f"Cross-company same-binary groups: {len(dupe_hashes)} | Same-origin groups: {len(dupe_sources)}","","## Source-risk cases"]
for site in records:
    risk=[a["filename"]+" <- "+a["source"] for a in site["assets"] if a.get("risk")]
    if risk:
        lines.append("### "+site["slug"])
        lines += ["- "+r for r in risk]
lines.append("\n## Contact sheets\n")
lines += ["- "+x for x in hero_sheets+support_sheets]
(OUT/"audit-report.md").write_text("\n".join(lines)+"\n")
print(json.dumps({k:v for k,v in report.items() if k not in {"sites","cross_site_duplicate_byte_hashes","cross_site_duplicate_source_origins"}},indent=2))
