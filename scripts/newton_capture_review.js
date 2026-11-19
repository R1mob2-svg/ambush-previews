#!/usr/bin/env node
"use strict";
const fs=require("node:fs");
const path=require("node:path");
const {chromium}=require("playwright");
(async()=>{
 const root=path.resolve(__dirname,"..");
 const out=path.join(root,"image-review","newton-visual-capture");
 fs.mkdirSync(out,{recursive:true});
 const slugs=fs.readdirSync(root,{withFileTypes:true}).filter(x=>x.isDirectory()&&fs.existsSync(path.join(root,x.name,"index.html"))&&fs.existsSync(path.join(root,x.name,"asset-sources.json"))).map(x=>x.name).sort();
 if(slugs.length!==88) throw Error("SCOPE_MISMATCH: "+slugs.length);
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const rows=[];
 for(const [i,slug] of slugs.entries()){
   const row={slug,viewports:{}};
   for(const vp of [{id:"desktop",width:1280,height:820},{id:"mobile",width:390,height:844}]){
     const page=await browser.newPage({viewport:{width:vp.width,height:vp.height},reducedMotion:"reduce"});
     const errors=[];page.on("pageerror",e=>errors.push(String(e).slice(0,160)));
     await page.goto("file://"+path.join(root,slug,"index.html"),{waitUntil:"load",timeout:60000});
     await page.waitForTimeout(110);
     const metrics=await page.evaluate(()=>({
       horizontalOverflowPx:Math.max(0,document.documentElement.scrollWidth-innerWidth),
       brokenImages:Array.from(document.images).filter(x=>!x.complete||x.naturalWidth<=0).length,
       heroRect:(()=>{const el=document.querySelector(".hero-section,.hero-bg");if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()
     }));
     const file=vp.id+"-"+String(i+1).padStart(2,"0")+".jpg";
     await page.screenshot({path:path.join(out,file),type:"jpeg",quality:75,fullPage:false,animations:"disabled"});
     row.viewports[vp.id]={...metrics,jsErrors:errors,screenshot:file,width:vp.width,height:vp.height};
     await page.close();
   }
   rows.push(row);
   console.log("CAPTURE",i+1,"/",slugs.length,slug);
 }
 await browser.close();
 const report={source_commit:process.env.GITHUB_SHA||null,preview_count:rows.length,viewport_count:176,outreach:"HOLD",editorial_signoff:"PENDING_MANUAL_SHEET_REVIEW",rows};
 fs.writeFileSync(path.join(out,"geometry.json"),JSON.stringify(report,null,2)+"\n");
 const failures=rows.flatMap(r=>Object.entries(r.viewports).filter(([k,v])=>v.horizontalOverflowPx>0||v.brokenImages>0||v.jsErrors.length).map(([k,v])=>({slug:r.slug,viewport:k,...v})));
 console.log("SCREEN_SUMMARY",JSON.stringify({sites:rows.length,viewports:176,geometryProblems:failures.length,examples:failures.slice(0,8)}));
 if(failures.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(2)});
