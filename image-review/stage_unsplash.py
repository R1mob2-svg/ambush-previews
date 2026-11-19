#!/usr/bin/env python3
"""Stage personally sourced free-use Unsplash trade photographs for visual QA."""
import hashlib,io,json,urllib.parse,urllib.request
from pathlib import Path
from PIL import Image,ImageOps,ImageDraw
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"image-review"/"unsplash-staged"
OUT.mkdir(parents=True,exist_ok=True)
plan=json.loads((ROOT/"image-review"/"unsplash-plan.json").read_text())
rows=[];errors=[]
for idx,item in enumerate(plan["items"]):
 url=item["photo_url"]
 assert url.startswith("https://images.unsplash.com/photo-")
 assert item["source_url"].startswith("https://unsplash.com/photos/")
 try:
  request=urllib.request.Request(url,headers={"User-Agent":"DigitalAmbushPhotoReview/1.0","Accept":"image/jpeg,image/webp,*/*"})
  with urllib.request.urlopen(request,timeout=40) as resp:raw=resp.read(6_000_000)
  with Image.open(io.BytesIO(raw)) as original:
   im=ImageOps.exif_transpose(original).convert("RGB")
   assert im.width>=800 and im.height>=500,im.size
   im=ImageOps.fit(im,(1200,760),Image.Resampling.LANCZOS,centering=(0.5,0.5))
  fn=f"unsplash-{idx:02d}.jpg"
  path=OUT/fn
  im.save(path,"JPEG",quality=88,optimize=True,progressive=True)
  row={**item,"staged_filename":fn,"source_title":item["service"],"license":"Unsplash License","license_url":"https://unsplash.com/license","artist":item["photographer"],"sha256":hashlib.sha256(path.read_bytes()).hexdigest(),"size":[1200,760],"review_status":"PENDING_VISUAL_APPROVAL"}
  rows.append(row)
 except Exception as e:errors.append({"idx":idx,"slug":item["slug"],"error":str(e)[:250]})
(OUT/"staging-manifest.json").write_text(json.dumps({"items":rows,"errors":errors},indent=2)+"\n")
w,h,cols=370,250,2
sheet=Image.new("RGB",(w*cols,h*((len(rows)+cols-1)//cols)),(18,24,31))
d=ImageDraw.Draw(sheet)
for k,row in enumerate(rows):
 x=(k%cols)*w;y=(k//cols)*h
 with Image.open(OUT/row["staged_filename"]) as im:
  sheet.paste(ImageOps.fit(im,(w-8,h-66)),(x+4,y+4))
 for j,line in enumerate([f"{k} {row['service']} | Unsplash",row["slug"][:52],row["photographer"]]):
  d.text((x+7,y+h-55+j*17),line,fill=(243,243,243))
if rows:sheet.save(OUT/"review-sheet.jpg",quality=86,optimize=True)
print(json.dumps({"staged":len(rows),"errors":errors},indent=2))
