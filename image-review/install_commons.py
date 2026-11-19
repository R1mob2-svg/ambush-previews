#!/usr/bin/env python3
"""Apply *visually accepted* licensed trade photos on the isolated preview branch."""
import hashlib,html,json,re,shutil
from collections import defaultdict
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
R=ROOT/"image-review"
STAGE=R/"commons-staged"
manifest=json.loads((STAGE/"staging-manifest.json").read_text())
decision=json.loads((R/"commons-acceptance.json").read_text())
accepted=set(decision.get("approved",[]))
assert accepted and all(isinstance(i,int) for i in accepted)
rows=manifest["items"]
assert accepted <= set(range(len(rows)))
changed=defaultdict(list)
for i,row in enumerate(rows):
 if i not in accepted: continue
 slug=row["slug"];filename=row["filename"]
 assert re.fullmatch(r"[a-z0-9-]+",slug)
 assert re.fullmatch(r"[A-Za-z0-9_-]+\.(jpg|jpeg)",filename,re.I)
 site=ROOT/slug
 dest=site/"assets"/filename
 assert dest.is_file(),str(dest)
 stage=STAGE/row["staged_filename"]
 assert stage.is_file(),str(stage)
 digest=hashlib.sha256(stage.read_bytes()).hexdigest()
 assert digest==row["sha256"]
 shutil.copyfile(stage,dest)
 provpath=site/"asset-sources.json"
 prov=json.loads(provpath.read_text())
 entries=prov["assets"] if isinstance(prov.get("assets"),dict) else prov
 assert filename in entries
 old=entries[filename]
 oldsource=(old.get("source_url") or old.get("source") or "") if isinstance(old,dict) else str(old)
 entries[filename]={
  "role":old.get("role","supporting") if isinstance(old,dict) else "supporting",
  "sha256":digest,
  "source_url":row["source_url"],
  "source_title":row["source_title"],
  "license":row["license"],
  "license_url":row["license_url"],
  "author":row["artist"],
  "credit":row["credit"],
  "notes":"Licensed third-party illustrative photograph, cropped and resized; not evidence of this business's own completed jobs.",
 }
 provpath.write_text(json.dumps(prov,indent=2,ensure_ascii=False)+"\n")
 changed[slug].append(filename)
 print("REPLACED",slug,filename,digest[:18],row["license"],"old:",oldsource[-55:])
for slug in changed:
 site=ROOT/slug
 prov=json.loads((site/"asset-sources.json").read_text())
 entries=prov["assets"] if isinstance(prov.get("assets"),dict) else prov
 creds=[]
 for filename,entry in entries.items():
  if not isinstance(entry,dict):continue
  license=entry.get("license","")
  if license.upper().startswith(("CC BY","CC0")) or license.lower()=="public domain":
   source=entry.get("source_url","")
   if not source.startswith("https://"):continue
   name=entry.get("author") or entry.get("credit") or "Original photographer"
   license_url=entry.get("license_url","")
   source_link=f'<a href="{html.escape(source,quote=True)}">Source file</a>'
   license_link=f'<a href="{html.escape(license_url,quote=True)}">{html.escape(license)}</a>' if license_url.startswith("https://") else html.escape(license)
   creds.append(f'<li><strong>{html.escape(filename)}</strong>: {html.escape(re.sub("<[^>]+>","",name))}. {source_link}. {license_link}. Images may have been cropped or resized.</li>')
 credits='''<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
 <meta name="viewport" content="width=device-width,initial-scale=1">
 <meta name="robots" content="noindex,nofollow"><title>Image credits</title>
 <style>body{background:#0b1220;color:#e2e8f0;font:16px/1.6 system-ui,sans-serif;max-width:860px;margin:4rem auto;padding:0 1.5rem}a{color:#7dd3fc}li{margin:0 0 1.1rem}</style>
 </head><body><p><a href="./">Back to preview</a></p><h1>Image credits</h1>
 <p>Some photographs on this concept website are illustrative images showing the trade, not photographs of work performed by the business.</p>
 <ul>'''+''.join(creds)+'''</ul></body></html>'''
 (site/"image-credits.html").write_text(credits)
 page=site/"index.html"
 content=page.read_text()
 if 'href="./image-credits.html"' not in content:
  snippet='''<p style="font-size:0.75rem;opacity:0.75;margin-top:1rem"><a href="./image-credits.html" rel="license">Image credits and attribution</a></p>'''
  if "</footer>" in content:
   content=content.replace("</footer>",snippet+"\n</footer>",1)
  elif "</body>" in content:
   content=content.replace("</body>",snippet+"\n</body>",1)
  else:raise ValueError("No HTML body closing tag for "+slug)
  page.write_text(content)
 print("ATTRIBUTION_PAGE",slug,len(creds),"licensed source photo entries")
print("DONE",sum(map(len,changed.values())),"supporting assets",len(changed),"sites; NO external sends")
