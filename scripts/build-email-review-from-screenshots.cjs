#!/usr/bin/env node
"use strict";
/**
 * Digital Ambush image-first NATIVE website -> frozen real browser screenshot -> HERO-FIRST email.
 * Source of truth: global-agent-brain/Doctrine/DIGITAL_AMBUSH_DARK_EMAIL_APP_SHOWCASE_20261122.md
 * No banner/copy above website screenshot. One real hero visible per viewport, mobile fallback.
 * Reads current existing capture receipt, never sends, never invokes image providers.
 *
 * node scripts/build-email-review-from-screenshots.cjs \
 *   <slug>/index.html <slug>/email-preview/screenshot-receipt.json <slug>/email-preview/brief.json
 */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const sha256=b=>crypto.createHash("sha256").update(b).digest("hex");
const blobSha=b=>crypto.createHash("sha1").update(Buffer.from("blob "+b.length+"\0")).update(b).digest("hex");
const esc=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const need=(v,name)=>{if(typeof v!=="string"||!v.trim())throw Error("MISSING_"+name);return v.trim()};
function build(sitePath,receiptPath,briefPath){
 const site=fs.readFileSync(sitePath),r=JSON.parse(fs.readFileSync(receiptPath,"utf8")),b=JSON.parse(fs.readFileSync(briefPath,"utf8"));
 const actual=blobSha(site);
 if(actual!==r.html_blob_sha)throw Error("HTML_SHA_MISMATCH");
 if(!/^https:\/\/r1mob2-svg\.github\.io\/ambush-previews\/[a-z0-9/_-]+\/$/.test(r.url))throw Error("UNTRUSTED_SITE_URL");
 if(r.send_allowed!==false)throw Error("RECEIPT_MUST_BE_UNSENT");
 if(!Array.isArray(r.checks)||r.checks.length<11||r.checks.some(x=>x.status!=="PASS"))throw Error("INCOMPLETE_11_WIDTH_VISUAL_QA");
 const company=need(b.businessName,"BUSINESS_NAME");
 const recipient=need(b.publicEmail,"PUBLIC_EMAIL");
 const phone=need(b.publicPhone,"PUBLIC_PHONE");
 const personal=need(b.personalisedOpening,"EVIDENCE_BOUND_PERSONALISED_OPENING");
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))throw Error("INVALID_PUBLIC_EMAIL");
 if(!/^\+?[0-9 ()-]{9,18}$/.test(phone))throw Error("INVALID_PUBLIC_PHONE");
 if(personal.length>340||/lorem|placeholder|as an ai|your amazing/i.test(personal))throw Error("UNRELIABLE_PERSONALISED_COPY");
 const dir=path.dirname(receiptPath),labels=["mobile390","tablet820","desktop1200"],screen={};
 for(const label of labels){
  const meta=r.screenshots?.find(x=>x.label===label);
  if(!meta||!meta.filename||meta.filename.includes("/")||meta.filename.includes(".."))throw Error("MISSING_REAL_HERO_SCREENSHOT_"+label);
  if(!meta.filename.includes(actual.slice(0,12)))throw Error("SCREENSHOT_WRONG_SITE_REVISION_"+label);
  const bytes=fs.readFileSync(path.join(dir,meta.filename));
  if(bytes.length<4000||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw Error("INVALID_JPEG_"+label);
  if(sha256(bytes)!==meta.sha256)throw Error("SCREENSHOT_HASH_MISMATCH_"+label);
  // Screenshots are written into the receipt directory (the slug, not email-preview/). Resolve the public
  // URL from the receipt location so the generated hero image never 404s.
  // NEO 2026-11-23 fix: r.url already ends with the site folder. Prepending relDir produced
  // <site>/<site>/email-preview/... and every hero image 404'd in the published email.
  // Public GitHub Pages path mirrors <site>/email-preview/, regardless of the local output dir form.
  const sitePath=new URL(r.url).pathname.replace(/\/?$/,"/");
  const publicBase=new URL(r.url).origin+sitePath+"email-preview/";
  screen[label]={name:meta.filename,url:publicBase+encodeURIComponent(meta.filename)};
 }
 const link=esc(r.url),brand=esc(company),opening=esc(personal);
 function image(label,cls,width,alt,visible){
  return '<img class="shot '+cls+'" src="'+esc(screen[label].url)+'" alt="'+esc(alt)+'" width="'+width+'" style="display:'+(visible?'block':'none')+';max-height:'+(visible?'none':'0')+';overflow:hidden;width:100%;max-width:100%;height:auto;border:0;outline:none;text-decoration:none" />';
 }
 const html=[
 '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
 '<meta name="robots" content="noindex,nofollow"><title>'+brand+' | website preview</title>',
 '<style>html,body{margin:0!important;padding:0!important;background:#0b1b22!important}body,td,p,a{font-family:Arial,Helvetica,sans-serif}img{max-width:100%;height:auto;border:0}',
 '.shot-mobile{display:block!important;max-height:none!important}.shot-tablet,.shot-desktop{display:none!important;max-height:0!important;overflow:hidden!important}',
 '@media only screen and (min-width:600px){.shot-mobile{display:none!important;max-height:0!important;overflow:hidden!important}.shot-desktop{display:block!important;max-height:none!important}.outer{max-width:580px!important}}',
 '@media only screen and (min-width:600px) and (max-width:950px){.shot-desktop{display:none!important;max-height:0!important}.shot-tablet{display:block!important;max-height:none!important}}',
 '@media only screen and (max-width:599px){.outer{width:100%!important;max-width:100%!important}.pad{padding:22px 20px!important}.heading{font-size:25px!important}.button{display:block!important;text-align:center!important}.shot{width:100%!important;height:auto!important}}</style></head>',
 '<body style="margin:0;padding:0;background:#0b1b22;color:#edf4f1">',
 '<div style="display:none;font-size:1px;max-height:0;overflow:hidden;opacity:0;mso-hide:all">We have put together a live website preview for '+brand+'.</div>',
 '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0b1b22"><tr><td align="center" style="padding:0">',
 '<table role="presentation" class="outer" width="580" cellpadding="0" cellspacing="0" border="0" bgcolor="#112731" style="width:580px;max-width:100%;background:#112731;border-collapse:collapse">',
 // First visible pixel must be real screenshot; NO header, banner, greeting or whitespace row above.
 '<tr><td style="padding:0;background:#0a1a20"><a href="'+link+'" style="display:block;text-decoration:none" title="Open the actual working HTML website">',
 image("mobile390","shot-mobile",390,"Real published HTML website hero for "+company+", captured at mobile 390px",true),
 image("tablet820","shot-tablet",820,"Real published HTML website hero for "+company+", captured at tablet 820px",false),
 image("desktop1200","shot-desktop",1200,"Real published HTML website hero for "+company+", captured at desktop 1200px",false),
 '</a></td></tr>',
 '<tr><td class="pad" style="padding:21px 27px 25px;background:#112731"><h1 class="heading" style="font-size:27px;line-height:1.18;color:#fff;margin:0 0 12px">We built a website idea <span style="color:#f1ae7b">for '+brand+'.</span></h1>',
 '<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#e0e9e7">'+opening+'</p>',
 '<p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#e0e9e7">The picture above is a <strong style="color:#fff">real screenshot of your working HTML preview</strong>. Tap it or use the button to explore the site.</p>',
 '<a class="button" href="'+link+'" style="display:inline-block;background:#f0af7c;color:#10242b;text-decoration:none;border-radius:7px;font-weight:bold;font-size:15px;padding:15px 22px">VIEW YOUR WEBSITE ↗</a></td></tr>',
 '<tr><td class="pad" style="padding:23px 27px;background:#0b2029;border-top:2px solid #dc9363">',
 '<h2 class="heading" style="font-size:25px;color:#fff;line-height:1.2;margin:0 0 12px">Imagine running your business <span style="color:#f1ae7b">from one app.</span></h2>',
 '<p style="margin:0 0 15px;color:#e0e9e7;font-size:14px;line-height:1.68">We also build <strong style="color:#fff">custom business apps and AI assistants</strong> to put the everyday admin in one place.</p>',
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#17323c" style="background:#17323c"><tr><td style="padding:14px 16px;font-size:13px;line-height:2;color:#fff">',
 '<strong style="color:#f3b58b">✉</strong> Email &amp; enquiries &nbsp; · &nbsp; <strong style="color:#f3b58b">▣</strong> Jobs &amp; diary<br>',
 '<strong style="color:#f3b58b">◉</strong> Staff &amp; customers &nbsp; · &nbsp; <strong style="color:#f3b58b">▤</strong> Quotes &amp; invoices<br>',
 '<strong style="color:#f3b58b">✦</strong> AI assistant &amp; follow-ups</td></tr></table>',
 '<p style="margin:13px 0 0;color:#c6d6d5;font-size:13px;line-height:1.67">Features and integrations are designed around the business and agreed during setup.</p></td></tr>',
 '<tr><td class="pad" style="padding:23px 27px 27px;background:#112731;border-top:1px solid #38545b">',
 '<p style="font-size:14px;line-height:1.65;color:#e4ece9;margin:0 0 15px"><strong style="color:#fff">Have a look at your website first.</strong> If you like it, we can discuss what would help your business.</p>',
 '<a class="button" href="'+link+'" style="display:inline-block;background:#f0af7c;color:#10242b;text-decoration:none;border-radius:7px;font-size:14px;font-weight:bold;padding:14px 19px">OPEN WEBSITE PREVIEW ↗</a>',
 '<p style="font-size:13px;color:#cfdbdb;margin:19px 0 0">Kind regards,<br><strong style="color:#fff">Entreprenuity Web Design</strong></p></td></tr>',
 '<tr><td style="padding:14px 20px;background:#0a1920;color:#9db2b5;font-size:10px;line-height:1.5">Internal founder review only. No prospect email has been sent. Live website SHA '+actual.slice(0,12)+'. Custom app capabilities are optional; final outreach requires separately approved sender, recipient, secure Studio URL and legal checks.</td></tr>',
 '</table></td></tr></table></body></html>'
 ].join("\n");
 const output=path.join(dir,"index.html");
 fs.writeFileSync(output,html+"\n");
 const plain=["Subject: A website preview for "+company,"Public company email: "+recipient+" (DRAFT ONLY, NOT SENT)","",""+personal,"","Open the working website: "+r.url,"","Imagine running your business from one app: email, diary/jobs, customers/staff, quotes and invoices, and AI help with follow-ups.","","Entreprenuity Web Design","Internal founder review only. No customer send authorised."].join("\n");
 fs.writeFileSync(path.join(dir,"email.txt"),plain+"\n");
 console.log(JSON.stringify({state:"HERO_FIRST_HTML_EMAIL_DRAFT_WRITTEN",email:output,siteSha:actual,visibleScreenPerViewport:1,firstVisible:"REAL_SITE_HERO",customerSend:0}));
}
try{
 const [site,receipt,brief]=process.argv.slice(2);
 if(!site||!receipt||!brief)throw Error("Usage: node scripts/build-email-review-from-screenshots.cjs <site> <screenshot-receipt.json> <brief.json>");
 build(site,receipt,brief);
}catch(e){console.error("EMAIL_BUILD_BLOCKED:",e.message);process.exitCode=1}
