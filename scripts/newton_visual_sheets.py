#!/usr/bin/env python3
from PIL import Image,ImageDraw,ImageOps
from pathlib import Path
import json,math
base=Path(__file__).resolve().parents[1]/"image-review"/"newton-visual-capture"
j=json.loads((base/"geometry.json").read_text())
assert len(j["rows"])==88
for kind in ("desktop","mobile"):
  cols=4 if kind=="desktop" else 5
  per_sheet=20
  w=355 if kind=="desktop" else 205
  h=255 if kind=="desktop" else 360
  for start in range(0,88,per_sheet):
    part=j["rows"][start:start+per_sheet]
    sheet=Image.new("RGB",(w*cols,h*math.ceil(len(part)/cols)),(18,22,28))
    draw=ImageDraw.Draw(sheet)
    for i,row in enumerate(part):
      x=(i%cols)*w;y=(i//cols)*h
      src=base/row["viewports"][kind]["screenshot"]
      with Image.open(src) as im:
        thumb=ImageOps.fit(im.convert("RGB"),(w-12,h-34),method=Image.Resampling.LANCZOS,centering=(0.5,0.12))
      sheet.paste(thumb,(x+6,y+6))
      label=row["slug"][:35]
      draw.text((x+7,y+h-23),label,fill=(245,245,245))
    target=base/f"{kind}-sheet-{start//per_sheet+1:02d}.jpg"
    sheet.save(target,quality=85,optimize=True)
    print("SHEET",target.relative_to(base.parent.parent))
