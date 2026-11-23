#!/usr/bin/env node
"use strict";
// Digital Ambush: screenshot the EXACT deployed native homepage, never an AI concept.
// Run: node scripts/capture-email-website.cjs <live-https-url> <output-dir> <expected-git-blob-sha>
// No TinyFish, paid browser services, GitHub Actions, or sending.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const blobSha=b=>crypto.createHash("sha1").update(Buffer.from("blob "+b.length+"\0")).update(b).digest("hex");
const hash=b=>crypto.createHash("sha256").update(b).digest("hex");
function guard(raw) {
 const u=new URL(raw);
 if(u.protocol!=="https:"||u.hostname!=="r1mob2-svg.github.io"||!u.pathname.startsWith("/ambush-previews/")||u.username||u.password)
  throw Error("UNTRUSTED_PREVIEW_URL");
 return u.href;
}
async function checkImages(page){
 return page.evaluate(async()=>{
  await document.fonts.ready;
  const u=[...document.images].map(x=>x.currentSrc||x.src);
  for(const el of document.querySelectorAll("*")){
   const bg=getComputedStyle(el).backgroundImage;
   for(const m of bg.matchAll(/url\(["']?([^"')]+)["']?\)/g))try{u.push(new URL(m[1],location.href).href)}catch{}
  }
  const urls=[...new Set(u.filter(Boolean))],failed=[];
  await Promise.all(urls.map(async src=>{try{const im=new Image();im.src=src;await im.decode();if(!im.naturalWidth)throw Error("zero")}catch{failed.push(src)}}));
  const missing=[...document.querySelectorAll('a[href^="#"]')].map(x=>x.getAttribute("href").slice(1)).filter(x=>x&&!document.getElementById(x));
  return{count:urls.length,failed,missing};
 });
}
async function run(){
 if(process.argv.includes("--self-test")){
  if(blobSha(Buffer.from("hello"))!=="b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0")throw Error("blob algorithm broken");
  try{guard("http://127.0.0.1/");throw Error("url guard broken")}catch(e){if(!String(e).includes("UNTRUSTED"))throw e}
  console.log("PASS source hash and URL guard");return;
 }
 const [urlArg,outArg,expected]=process.argv.slice(2);
 if(!urlArg||!outArg||!/^[a-f0-9]{40}$/.test(expected||""))throw Error("Usage: capture-email-website.cjs https-url out-folder expected-blob-sha");
 const url=guard(urlArg),out=path.resolve(outArg);
 const response=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(25000)});
 if(response.status!==200||!String(response.headers.get("content-type")).includes("text/html"))throw Error("PUBLIC_HTML_NOT_LIVE_"+response.status);
 const html=Buffer.from(await response.arrayBuffer()),actual=blobSha(html);
 if(actual!==expected)throw Error("PUBLIC_HTML_STALE_EXPECTED_"+expected+"_ACTUAL_"+actual);
 if(!/<html\b/i.test(html.toString())||html.length<1200)throw Error("EMPTY_HTML");
 const chromium=require("playwright").chromium, opts={headless:true};
 if(process.env.CHROMIUM_PATH)opts.executablePath=process.env.CHROMIUM_PATH;
 else if(fs.existsSync("/usr/bin/chromium"))opts.executablePath="/usr/bin/chromium";
 const browser=await chromium.launch(opts);
 const devices=[["phone320",320,800],["mobile390",390,844],["phone430",430,932],["tablet768",768,1024],["tablet820",820,1180],["desktop1024",1024,768],["desktop1200",1200,850],["desktop1280",1280,800],["desktop1440",1440,900],["wide1920",1920,1080],["wide2560",2560,1440],["ultrawide3440",3440,1440]];
 const capture=new Set(["mobile390","tablet820","desktop1200"]),receipt={schema:"digital-ambush.real-html-capture.v1",url,html_blob_sha:expected,at:new Date().toISOString(),checks:[],screenshots:[],send_allowed:false};
 const files=[];
 try {
  fs.mkdirSync(out,{recursive:true});
  for(const [label,width,height] of devices){
   const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
   const page=await context.newPage(),errors=[];
   page.on("response",r=>{if(r.status()>=400&&r.url().startsWith(url))errors.push(r.url()+":"+r.status())});
   const nav=await page.goto(url,{waitUntil:"networkidle",timeout:35000});
   if(!nav||nav.status()!==200)throw Error("BAD_PUBLIC_PAGE_"+label);
   const assets=await checkImages(page);
   if(!assets.count||assets.failed.length||assets.missing.length)throw Error("IMAGE_OR_ANCHOR_ERROR_"+label+":"+JSON.stringify(assets).slice(0,400));
   const state=await page.evaluate(()=>{
    const hero=document.querySelector("[data-hero-copy]")||document.querySelector(".hero-copy")||document.querySelector(".hero__copy")||document.querySelector(".hero .inner");
    const header=document.querySelector("[data-content-edge]")||document.querySelector(".hero-shell")||document.querySelector("header .topbar")||document.querySelector("header .inner")||document.querySelector(".shell");
    const heroLeft=hero?.getBoundingClientRect().left,headerLeft=header?.getBoundingClientRect().left;
    return {overflow:document.documentElement.scrollWidth-innerWidth,body:(document.body.innerText||"").length,h1:!!document.querySelector("h1"),
     hero_alignment_measured:Number.isFinite(heroLeft)&&Number.isFinite(headerLeft),
     hero_left_edge_delta_px:Number.isFinite(heroLeft)&&Number.isFinite(headerLeft)?Math.round(Math.abs(heroLeft-headerLeft)*100)/100:null};
   });
   if(!state.hero_alignment_measured)throw Error("HERO_LEFT_ALIGNMENT_UNMEASURABLE_"+label);
   if(state.hero_left_edge_delta_px>20)throw Error("HERO_LEFT_ALIGNMENT_FAILED_"+label+"_DELTA_"+state.hero_left_edge_delta_px);
   if(state.overflow>2||state.body<300||!state.h1||errors.length)throw Error("RENDER_FAILED_"+label+":"+JSON.stringify(state));
   if(width<=430){
    const b=page.locator("[aria-controls][aria-expanded]").first();
    if(await b.count()){await b.click();if(await b.getAttribute("aria-expanded")!=="true")throw Error("MOBILE_MENU_FAILED_"+label);await b.click()}
   }
   receipt.checks.push({label,width,height,decoded_photos:assets.count,hero_left_edge_delta_px:state.hero_left_edge_delta_px,status:"PASS"});
   if(capture.has(label)){
    const name="homepage-"+expected.slice(0,12)+"-"+label+".jpg",filepath=path.join(out,name);
    await page.screenshot({path:filepath,type:"jpeg",quality:83,animations:"disabled"});
    const data=fs.readFileSync(filepath);
    if(data.length<4000)throw Error("CAPTURE_EMPTY_"+label);
    receipt.screenshots.push({label,width,height,filename:name,bytes:data.length,sha256:hash(data)});
    files.push(filepath);
   }
   await context.close();
  }
  fs.writeFileSync(path.join(out,"screenshot-receipt.json"),JSON.stringify(receipt,null,2)+"\n");
  console.log(JSON.stringify({status:"PASS",receipt},null,2));
 }catch(e){
  files.forEach(f=>{try{fs.rmSync(f)}catch{}});
  fs.writeFileSync(path.join(out,"screenshot-failure.json"),JSON.stringify({...receipt,blocker:String(e.message)},null,2)+"\n");
  throw e;
 }finally{await browser.close()}
}
run().catch(e=>{console.error("SCREENSHOT_GATE_FAILED:",e.message);process.exitCode=1});
