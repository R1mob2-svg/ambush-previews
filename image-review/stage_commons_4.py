#!/usr/bin/env python3
"""Stage selected commercially licensed Commons photos for human QA; no site writes."""
import hashlib,html,io,json,re,time,urllib.parse,urllib.request
from pathlib import Path
from PIL import Image,ImageOps,ImageDraw
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"image-review"/"commons-staged-4"
OUT.mkdir(exist_ok=True,parents=True)
plan=json.loads((ROOT/"image-review"/"commons-replacements-round4.json").read_text())
existing=[]
for path in ROOT.glob("*/asset-sources.json"):
 prov=json.loads(path.read_text())
 for val in (prov.get("assets") or prov).values():
  src=(val.get("source_url") or val.get("source") or "") if isinstance(val,dict) else str(val)
  existing.append(urllib.parse.unquote(src).replace("_"," ").lower())
def get(url,cap=3000000):
 req=urllib.request.Request(url,headers={"User-Agent":"DigitalAmbushPhotoReview/1.0 (open-source commercial photo research; https://github.com/R1mob2-svg/ambush-previews)","Accept":"application/json,image/jpeg,*/*"})
 with urllib.request.urlopen(req,timeout=40) as response:
  return response.read(cap)
def plain(v):
 return re.sub(r"\s+"," ",re.sub(r"<[^>]*>","",html.unescape(v or ""))).strip()
rows=[];errors=[]
titles=list(dict.fromkeys("File:"+x["commons_file"] for x in plan["items"]))
for start in range(0,len(titles),15):
 params={"action":"query","titles":"|".join(titles[start:start+15]),"prop":"imageinfo","iiprop":"url|size|extmetadata","iiurlwidth":"1350","format":"json"}
 url="https://commons.wikimedia.org/w/api.php?"+urllib.parse.urlencode(params)
 j=json.loads(get(url,1000000))
 for p in j.get("query",{}).get("pages",{}).values():
  if p.get("missing") is not None or "imageinfo" not in p:
   errors.append(p.get("title","MISSING"));continue
  inf=p["imageinfo"][0];title=p["title"]
  ext=inf.get("extmetadata") or {}
  lic=plain((ext.get("LicenseShortName") or {}).get("value",""))
  low=lic.lower()
  if not ("public domain" in low or "cc0" in low or low.startswith("cc by ") or low.startswith("cc by-sa ")):
   errors.append(title+" NONCOMMERCIAL_OR_UNKNOWN_LICENSE "+lic);continue
  if inf.get("width",0)<650 or inf.get("height",0)<450:
   errors.append(title+" TOO_SMALL");continue
  imgurl=inf.get("thumburl") or inf.get("url")
  try:
   raw=get(imgurl,6000000)
   with Image.open(io.BytesIO(raw)) as original:
    photo=ImageOps.exif_transpose(original).convert("RGB")
    photo=ImageOps.fit(photo,(1200,760),Image.Resampling.LANCZOS,centering=(0.5,0.48))
  except Exception as exc:
   errors.append(title+" DOWNLOAD_ERROR "+str(exc)[:120]);continue
  found=[item for item in plan["items"] if "File:"+item["commons_file"].replace("_"," ")==title.replace("_"," ")]
  if not found: errors.append("UNMATCHED "+title);continue
  for item in found:
   source="https://commons.wikimedia.org/wiki/"+urllib.parse.quote(title.replace(" ","_"),safe=":/_()-.,")
   if any(title[5:].replace("_"," ").lower() in old for old in existing):
    errors.append(title+" ALREADY_USED");continue
   uid=str(len(rows)).zfill(2)
   staged=f"replacement-{uid}.jpg"
   path=OUT/staged
   photo.save(path,format="JPEG",quality=88,optimize=True)
   row={**item,"staged_filename":staged,"source_title":title,"source_url":source,
        "license":lic,"license_url":plain((ext.get("LicenseUrl") or {}).get("value","")),
        "artist":plain((ext.get("Artist") or {}).get("value",""))[:300],
        "credit":plain((ext.get("Credit") or {}).get("value",""))[:300],
        "sha256":hashlib.sha256(path.read_bytes()).hexdigest(),"size":[1200,760],"review_status":"PENDING_VISUAL_APPROVAL"}
   rows.append(row)
  time.sleep(0.2)
(OUT/"staging-manifest.json").write_text(json.dumps({"items":rows,"errors":errors},ensure_ascii=False,indent=2)+"\n")
w,h,cols=370,255,3
sheet=Image.new("RGB",(w*cols,h*((len(rows)+cols-1)//cols)),(18,24,31))
dr=ImageDraw.Draw(sheet)
for idx,row in enumerate(rows):
 x=(idx%cols)*w;y=(idx//cols)*h
 with Image.open(OUT/row["staged_filename"]) as im:
  img=ImageOps.fit(im.convert("RGB"),(w-8,h-69),method=Image.Resampling.LANCZOS)
  sheet.paste(img,(x+4,y+4))
 lines=[f"{idx}: {row['filename']} | {row['license']}",
        row["slug"][:51],
        row["source_title"].replace("File:","")[:50]]
 for j,line in enumerate(lines):dr.text((x+7,y+h-58+j*18),line,fill=(245,245,245))
if rows:sheet.save(OUT/"review-sheet.jpg",quality=87,optimize=True)
print(json.dumps({"staged":len(rows),"errors":errors,"files":[x['staged_filename'] for x in rows]},indent=2))
