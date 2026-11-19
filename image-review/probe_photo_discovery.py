#!/usr/bin/env python3
import json,urllib.parse,urllib.request
agents=["Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36","DigitalAmbushPhotoReview/1.0"]
tests=[
("Unsplash public search JSON","https://unsplash.com/napi/search/photos?"+urllib.parse.urlencode({"query":"professional plumber","per_page":3})),
("Unsplash public search HTML","https://unsplash.com/s/photos/plumber"),
("Unsplash public search JSON 2","https://unsplash.com/napi/search/photos?"+urllib.parse.urlencode({"query":"roofer roof repair","per_page":3})),
("Pexels public search HTML","https://www.pexels.com/search/plumber/")
]
for label,url in tests:
 for ua in agents[:1]:
  try:
   request=urllib.request.Request(url,headers={"User-Agent":ua,"Accept":"application/json,text/html,*/*"})
   with urllib.request.urlopen(request,timeout=25) as resp:
    body=resp.read(180000)
    result={"name":label,"code":resp.status,"content_type":resp.headers.get("Content-Type"),"bytes":len(body)}
    try:
     j=json.loads(body)
     result["keys"]=list(j)[:15] if isinstance(j,dict) else type(j).__name__
     photos=j.get("results",[]) if isinstance(j,dict) else []
     result["sample"]=[{k:p.get(k) for k in ["id","slug","premium","premium_url","alt_description","description"]} for p in photos[:2]]
    except Exception:
     import re
     result["image_urls"]=len(set(re.findall(r"https?:[^\\\"' ]+images\\.unsplash\\.com[^\\\"' ]*",body.decode("utf-8","ignore"))))
     result["sample"]=body[:350].decode("utf-8","replace")
    print(json.dumps(result,ensure_ascii=False))
  except Exception as exc:
   print(json.dumps({"name":label,"error":str(exc)[:300]}))
