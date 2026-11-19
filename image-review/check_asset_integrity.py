#!/usr/bin/env python3
"""Deterministic image-integrity checks; visual quality is a separate approval gate."""
from pathlib import Path
from collections import Counter, defaultdict
import hashlib, json, re
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
sites=sorted(p.parent for p in ROOT.glob("*/index.html") if (p.parent/"asset-sources.json").exists())
plan=json.loads((ROOT/"image-review/asset-plan.json").read_text())["assets"]
assert len(sites)==88, f"Expected 88 prospect sites, got {len(sites)}"
issues=[]
refs=0
manifest_items=0
hero_sources={}
all_origins=defaultdict(list)
for folder in sites:
    html=(folder/"index.html").read_text()
    assets=json.loads((folder/"asset-sources.json").read_text())
    entries=assets["assets"] if isinstance(assets.get("assets"),dict) else assets
    heros=[name for name in entries if re.search("hero",name,re.I) and re.search(r"\.jpe?g$",name,re.I)]
    if len(heros)!=1:
        issues.append(f"{folder.name}: expected one hero in manifest, found {heros}")
    for name,value in entries.items():
        if not re.search(r"\.(?:jpe?g|png|webp)$",name,re.I): continue
        path=folder/"assets"/name
        # Legacy favicons and brand marks are often in the site root rather than /assets.
        if not path.is_file() and re.search("favicon|brand-mark",name,re.I):
            path=folder/name
        if not path.is_file():
            issues.append(f"{folder.name}: missing declared asset {name}")
            continue
        manifest_items+=1
        val=value if isinstance(value,dict) else {"source_url":str(value)}
        check=val.get("sha256")
        if check and hashlib.sha256(path.read_bytes()).hexdigest()!=check:
            issues.append(f"{folder.name}: hash mismatch {name}")
        if name in heros:
            origin=val.get("source_url","")
            if not origin.startswith("generated:runway:"):
                issues.append(f"{folder.name}: hero is not provenance-tracked replacement {name}")
            if origin in hero_sources:
                issues.append(f"{folder.name}: hero origin duplicates {hero_sources[origin]}")
            hero_sources[origin]=folder.name
        if not re.search("favicon|brand-mark",name,re.I):
            origin=val.get("source_url","")
            if origin: all_origins[origin].append(folder.name+"/"+name)
    # Reference check: local image paths in CSS, inline html or JS templates
    local=set(re.findall(r"(?:(?:\./|\.\./)?assets/[A-Za-z0-9_./-]+\.(?:jpe?g|png|webp))",html,re.I))
    for raw in local:
        refs+=1
        normalized=raw.lstrip("./")
        if normalized.startswith("assets/"):
            resolved=folder/normalized
        else:
            resolved=folder/normalized
        if not resolved.is_file():
            issues.append(f"{folder.name}: broken HTML/CSS image URL {raw}")
# Every planned installation must exist, match SHA and declare correct origin.
for item in plan:
    folder=ROOT/item["slug"]
    filename=item["filename"]
    f=folder/"assets"/filename
    if not f.is_file():
        issues.append("Missing planned asset "+str(f))
        continue
    obj=json.loads((folder/"asset-sources.json").read_text())
    entries=obj["assets"] if isinstance(obj.get("assets"),dict) else obj
    e=entries.get(filename,{})
    if not isinstance(e,dict) or e.get("source_url")!="generated:runway:"+item["task_id"]:
        issues.append("Planned asset not traceable: "+item["slug"]+"/"+filename)
# Commercial photo replacements have an independent visual acceptance and attribution gate.
licensed_installs=0
credited_sites=set()
for decision_rel,staging_rel in [
    ("commons-acceptance.json","commons-staged/staging-manifest.json"),
    ("commons-acceptance-2.json","commons-staged-2/staging-manifest.json"),
    ("commons-acceptance-3.json","commons-staged-3/staging-manifest.json"),
    ("commons-acceptance-4.json","commons-staged-4/staging-manifest.json"),
    ("unsplash-acceptance.json","unsplash-staged/staging-manifest.json"),
]:
    decision_path=ROOT/"image-review"/decision_rel
    staging_path=ROOT/"image-review"/staging_rel
    if not decision_path.exists(): continue
    if not staging_path.exists():
        issues.append("Accepted photo plan has no staged metadata: "+decision_rel)
        continue
    approved=json.loads(decision_path.read_text()).get("approved",[])
    staged=json.loads(staging_path.read_text()).get("items",[])
    for idx in approved:
        if idx<0 or idx>=len(staged):
            issues.append(f"Invalid photo acceptance index: {decision_rel}/{idx}")
            continue
        item=staged[idx]
        site=ROOT/item["slug"]
        filename=item["filename"]
        dest=site/"assets"/filename
        if not dest.is_file():
            issues.append("Missing accepted Commons photo "+str(dest))
            continue
        manifest=json.loads((site/"asset-sources.json").read_text())
        entries=manifest["assets"] if isinstance(manifest.get("assets"),dict) else manifest
        value=entries.get(filename,{})
        if not isinstance(value,dict):
            issues.append("Missing accepted photo provenance "+str(dest))
            continue
        digest=hashlib.sha256(dest.read_bytes()).hexdigest()
        if digest!=item.get("sha256") or value.get("sha256")!=digest or value.get("source_url")!=item.get("source_url"):
            issues.append("Accepted Commons provenance mismatch "+str(dest))
            continue
        if value.get("license")!=item.get("license"):
            issues.append("Accepted Commons license mismatch "+str(dest))
        credits=site/"image-credits.html"
        if not credits.is_file() or filename not in credits.read_text() or 'href="./image-credits.html"' not in (site/"index.html").read_text():
            issues.append("Accepted Commons photo missing visible credits page/link "+str(dest))
        credited_sites.add(item["slug"])
        licensed_installs+=1

shared={k:v for k,v in all_origins.items() if len({p.split("/")[0] for p in v})>1 and not k.startswith("generated:monogram")}
report={"sites":len(sites),"planned_installs":len(plan)+licensed_installs,"licensed_support_installs":licensed_installs,"credited_sites":len(credited_sites),"hero_origin_count":len(hero_sources),
"manifest_images":manifest_items,"html_local_asset_references":refs,"broken_or_invalid":issues,
"shared_photo_origins":shared,"static_asset_integrity_pass":len(issues)==0 and len(shared)==0,
"visual_approval":"NOT_PERFORMED","public_publish":"NOT_PERFORMED","prospect_outreach":"HOLD"}
out=ROOT/"image-review/integrity-report.json"
out.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n")
print(json.dumps({k:v for k,v in report.items() if k not in ["broken_or_invalid","shared_photo_origins"]},indent=2))
print("ISSUES",len(issues),"CROSS_SITE_DUPLICATES",len(shared))
for issue in issues[:60]: print("ISSUE",issue)
for key,val in list(shared.items())[:30]: print("REUSED_SOURCE",key,str(val))
if issues or shared: raise SystemExit(1)
