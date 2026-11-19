#!/usr/bin/env python3
"""Curate licence-filtered Wikimedia photo choices. Does not touch website assets."""
import html, json, re, time, urllib.parse, urllib.request
from collections import defaultdict
from io import BytesIO
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"image-review"/"commons-candidates"
OUT.mkdir(parents=True,exist_ok=True)
QUERIES={
"plastering":["plasterer at work wall","plastering wall construction","wall skim plastering"],
"painting":["painter decorating walls","house painter painting wall"],
"roofing":["roofer roof repair","roofing work tiles slate"],
"joinery":["carpenter woodworking joinery","fitted timber carpentry"],
"plumbing":["plumber installing pipes","plumbing copper pipework","central heating radiator installation"],
"electrical":["electrician installing wiring","electrician electrical installation"],
"building":["bricklayer building wall","building masonry renovation"],
"landscaping":["garden patio paving work","landscaping gardening construction"],
"vehicle-spray":["car spray paint booth","car body paint refinishing"],
"calligraphy":["calligraphy artist pen paper","calligraphy tools ink"],
}
def req(url,max_bytes=3000000):
 r=urllib.request.Request(url,headers={"User-Agent":"DigitalAmbushReviewBot/1.0 (license source research; contact: https://github.com/R1mob2-svg/ambush-previews)","Accept":"application/json,image/jpeg,image/png,*/*"})
 with urllib.request.urlopen(r,timeout=25) as resp:
  return resp.read(max_bytes)
def plain(v):
 return re.sub(r"\s+"," ",re.sub("<[^>]*>","",html.unescape(v or ""))).strip()
seen=set()
rows=[]
notes=[]
for trade,queries in QUERIES.items():
 kept=0
 for q in queries:
  params={"action":"query","generator":"search","gsrsearch":q+" filetype:bitmap","gsrnamespace":"6","gsrlimit":"15","prop":"imageinfo","iiprop":"url|size|extmetadata","iiurlwidth":"640","format":"json"}
  url="https://commons.wikimedia.org/w/api.php?"+urllib.parse.urlencode(params)
  try:
   data=json.loads(req(url,400000))
  except Exception as exc:
   notes.append([trade,q,str(exc)[:200]])
   continue
  candidates=sorted((data.get("query") or {}).get("pages",{}).values(),key=lambda p:p.get("index",10000))
  for p in candidates:
   title=p.get("title","")
   if title in seen: continue
   info=(p.get("imageinfo") or [{}])[0]
   ext=info.get("extmetadata") or {}
   lic=plain(ext.get("LicenseShortName",{}).get("value",""))
   low=lic.lower()
   if not (("public domain" in low) or ("cc0" in low) or (low.startswith("cc by ")) or (low.startswith("cc by-sa "))) :continue
   if int(info.get("width") or 0)<700 or int(info.get("height") or 0)<500:continue
   mime=info.get("mime","")
   photo_url=info.get("thumburl") or info.get("url")
   if not photo_url or "svg" in photo_url.lower(): continue
   try:
    raw=req(photo_url,3_000_000)
    img=ImageOps.exif_transpose(Image.open(BytesIO(raw))).convert("RGB")
   except Exception as e:
    notes.append([trade,title,str(e)[:100]])
    continue
   seen.add(title)
   idx=len(rows)
   rows.append({"id":idx,"trade":trade,"search":q,"title":title,"source_url":"https://commons.wikimedia.org/wiki/"+urllib.parse.quote(title.replace(" ","_"),safe=":/_()-.,"),
                "download_url":info.get("url"),"thumbnail_url":photo_url,"license":lic,"license_url":plain(ext.get("LicenseUrl",{}).get("value","")),
                "artist":plain(ext.get("Artist",{}).get("value",""))[:250],"credit":plain(ext.get("Credit",{}).get("value",""))[:250],
                "width":info.get("width"),"height":info.get("height")})
   img.thumbnail((490,350))
   img.save(OUT/f"candidate-{idx:03d}.jpg",quality=82)
   kept+=1
   if kept>=14: break
  if kept>=14: break
  time.sleep(0.35)
 print(trade,kept,"candidates")
(OUT/"catalog.json").write_text(json.dumps({"candidates":rows,"notes":notes},indent=2,ensure_ascii=False)+"\n")
for trade in QUERIES:
 part=[x for x in rows if x["trade"]==trade]
 w,h,cols=350,245,3
 sheet=Image.new("RGB",(cols*w,((len(part)+cols-1)//cols)*h),(18,25,33))
 draw=ImageDraw.Draw(sheet)
 for k,entry in enumerate(part):
  x=(k%cols)*w;y=(k//cols)*h
  with Image.open(OUT/f"candidate-{entry['id']:03d}.jpg") as im:
   thumb=ImageOps.fit(im.convert("RGB"),(w-8,h-66),method=Image.Resampling.LANCZOS)
   sheet.paste(thumb,(x+4,y+4))
  draw.text((x+7,y+h-57),f"ID {entry['id']} | {entry['license']}",fill=(245,245,245))
  title=entry["title"].replace("File:","")
  draw.text((x+7,y+h-40),title[:47],fill=(245,245,245))
  draw.text((x+7,y+h-23),title[47:94],fill=(190,190,190))
 if part:sheet.save(OUT/f"{trade}-choices.jpg",quality=88,optimize=True)
for p in OUT.glob("candidate-*.jpg"): p.unlink()
print(json.dumps({"count":len(rows),"by_trade":{t:len([x for x in rows if x["trade"]==t]) for t in QUERIES},"notes":notes[:12]},indent=2))
