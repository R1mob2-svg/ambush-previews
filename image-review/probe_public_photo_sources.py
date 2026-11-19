#!/usr/bin/env python3
import json, urllib.parse, urllib.request
tests=[
("Wikimedia API","https://commons.wikimedia.org/w/api.php?"+urllib.parse.urlencode({"action":"query","titles":"File:Wall_finishes_of_plastering.jpg","prop":"imageinfo","iiprop":"url|size|extmetadata","format":"json"})),
("Wikimedia image","https://commons.wikimedia.org/wiki/Special:Redirect/file/Wall_finishes_of_plastering.jpg?width=720"),
("Openverse","https://api.openverse.org/v1/images/?q=uk%20plasterer&page_size=1&license_type=commercial")
]
for name,url in tests:
 try:
  req=urllib.request.Request(url,headers={"User-Agent":"DigitalAmbushImageAudit/1.0 (research; license compliance)","Accept":"application/json,image/*"})
  with urllib.request.urlopen(req, timeout=22) as resp:
   data=resp.read(3500)
   print(name,"HTTP",resp.status,"type",resp.headers.get("Content-Type"),"bytes",len(data),"sample",data[:350].decode("utf-8","replace"))
 except Exception as e: print(name,"ERROR",type(e).__name__,str(e)[:300])
