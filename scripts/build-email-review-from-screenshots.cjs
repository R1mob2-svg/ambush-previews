#!/usr/bin/env node
"use strict";
/**
 * Digital Ambush native-website -> real-screenshot -> responsive HTML email.
 *
 * node scripts/capture-email-website.cjs https://r1mob2-svg.github.io/ambush-previews/<slug>/ <slug>/email-preview <site-html-Git-blob-SHA>
 * node scripts/build-email-review-from-screenshots.cjs <slug>/index.html <slug>/email-preview/screenshot-receipt.json <slug>/email-preview/brief.json
 * node scripts/validate-email-site-match.cjs <slug>/index.html <slug>/email-preview/index.html <slug>/email-preview/screenshot-receipt.json https://r1mob2-svg.github.io/ambush-previews/<slug>/
 *
 * Do not generate an email from AI mockup artwork, mShots, another website, or stale-site screenshots.
 * This script NEVER sends, contacts a mail provider or marks a job approved.
 */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const sha256=b=>crypto.createHash("sha256").update(b).digest("hex");
const blobSha=b=>crypto.createHash("sha1").update(Buffer.from("blob "+b.length+"\0")).update(b).digest("hex");
const esc=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const requireField=(v,label)=>{if(typeof v!=="string"||!v.trim())throw Error("MISSING_"+label);return v.trim()};
function build(sitePath,receiptPath,briefPath){
 const site=fs.readFileSync(sitePath),r=JSON.parse(fs.readFileSync(receiptPath,"utf8")),b=JSON.parse(fs.readFileSync(briefPath,"utf8"));
 const actual=blobSha(site);
 if(actual!==r.html_blob_sha)throw Error("HTML_SHA_MISMATCH");
 if(!/^https:\/\/r1mob2-svg\.github\.io\/ambush-previews\/[a-z0-9/_-]+\/$/.test(r.url))throw Error("UNTRUSTED_SITE_URL");
 if(r.send_allowed!==false)throw Error("RECEIPT_MUST_BE_UNSENT");
 if(!Array.isArray(r.checks)||r.checks.length<11||r.checks.some(x=>x.status!=="PASS"))throw Error("INCOMPLETE_11_WIDTH_VISUAL_QA");
 const name=requireField(b.businessName,"BUSINESS_NAME");
 const recipient=requireField(b.publicEmail,"PUBLIC_EMAIL");
 const phone=requireField(b.publicPhone,"PUBLIC_PHONE");
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))throw Error("INVALID_EMAIL");
 if(!/^\+?[0-9 ()-]{9,18}$/.test(phone))throw Error("INVALID_PHONE");
 const out=path.dirname(receiptPath);
 const wanted=["mobile390","tablet820","desktop1200"];
 const screenshots={};
 for(const label of wanted){
  const s=r.screenshots.find(x=>x.label===label);
  if(!s||!s.filename||s.filename.includes("/")||s.filename.includes(".."))throw Error("MISSING_OR_UNSAFE_SCREENSHOT_"+label);
  if(!s.filename.includes(actual.slice(0,12)))throw Error("STALE_SCREENSHOT_"+label);
  const d=fs.readFileSync(path.join(out,s.filename));
  if(d.length<4000||d[0]!==0xff||d[1]!==0xd8||d[2]!==0xff)throw Error("NOT_REAL_JPEG_"+label);
  if(sha256(d)!==s.sha256)throw Error("SCREENSHOT_HASH_MISMATCH_"+label);
  screenshots[label]={file:s.filename,url:r.url+"email-preview/"+encodeURIComponent(s.filename)};
 }
 const link=esc(r.url),company=esc(name);
 const screenshot=(label,klass,width,alt)=>'<img class="'+klass+'" src="'+esc(screenshots[label].url)+'" alt="'+esc(alt)+'" width="'+width+'" style="display:block;width:100%;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;" />';
 const photoAlt="Real browser screenshot of the "+name+" HTML website. This is the published website, not a separate AI concept.";
 const html=[
 '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
 '<meta name="robots" content="noindex,nofollow"><title>INTERNAL REVIEW | '+company+' website preview</title>',
 '<style>img{max-width:100%;height:auto}.shot-mobile,.shot-tablet{display:none!important;max-height:0!important;overflow:hidden!important;}',
 '@media only screen and (max-width:600px){.outer{width:100%!important}.pad{padding:22px!important}.shot-mobile{display:block!important;max-height:none!important}.shot-tablet,.shot-desktop{display:none!important;max-height:0!important}.button{display:block!important;text-align:center!important}.shot{width:100%!important;height:auto!important}}',
 '@media only screen and (min-width:601px) and (max-width:930px){.shot-tablet{display:block!important;max-height:none!important}.shot-mobile,.shot-desktop{display:none!important;max-height:0!important}}</style></head>',
 '<body style="margin:0;padding:0;background:#edf0ed;color:#15282a;font:15px/1.65 Arial,Helvetica,sans-serif">',
 '<div style="display:none;font-size:1px;max-height:0;overflow:hidden;opacity:0">Internal review only. Real published HTML screenshots for '+company+'. No email has been sent.</div>',
 '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:22px 8px">',
 '<table role="presentation" class="outer" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:#fff;border-collapse:collapse">',
 '<tr><td style="padding:17px 24px;background:#091a21;color:#e8a474;font-size:12px;font-weight:800;letter-spacing:1px">ENTREPRENUITY <span style="float:right;color:#d6dcda;letter-spacing:0">FOUNDER REVIEW · NOT SENT</span></td></tr>',
 '<tr><td style="background:#102730;padding:16px;"><a href="'+link+'" style="display:block;text-decoration:none;color:inherit" title="Open real HTML website preview">',
 screenshot("desktop1200","shot shot-desktop",600,photoAlt+" Desktop viewport 1200 pixels."),
 screenshot("tablet820","shot shot-tablet",600,photoAlt+" Tablet viewport 820 pixels."),
 screenshot("mobile390","shot shot-mobile",390,photoAlt+" Mobile viewport 390 pixels."),
 '<div style="padding:14px 15px;background:#071c23;color:#e9b183;text-align:center;font-size:13px;font-weight:bold">SEE THE ACTUAL HTML WEBSITE · TAP TO OPEN ↗</div>',
 '</a></td></tr>',
 '<tr><td class="pad" style="padding:30px 38px 24px"><div style="font-size:11px;letter-spacing:1px;color:#b46a44;font-weight:bold">PERSONALISED WEBSITE CONCEPT · INTERNAL DRAFT</div>',
 '<h1 style="font-size:28px;line-height:1.2;margin:12px 0 18px;color:#13262b">A fresh website idea for '+company+'</h1>',
 '<p style="font-size:15px;color:#405358;line-height:1.75">We put together a new homepage concept based on your publicly described services. The screenshot above is captured from the actual published HTML page, not from a separate mock-up image.</p>',
 '<p style="font-size:15px;color:#405358;line-height:1.75">The preview has service-specific photography, a clear mobile layout and contact buttons. These are proposed design ideas, not a claim that you commissioned a website.</p>',
 '<a class="button" href="'+link+'" style="display:inline-block;background:#e39a67;color:#0b1d22;font-weight:bold;padding:15px 23px;border-radius:9px;text-decoration:none">VIEW YOUR PERSONALISED WEBSITE ↗</a>',
 '</td></tr>',
 '<tr><td class="pad" style="padding:26px 38px;background:#0d2630;color:#f0f5f1">',
 '<div style="font-size:11px;color:#f3b987;text-transform:uppercase;letter-spacing:1px;font-weight:bold">Other Entreprenuity services</div>',
 '<h2 style="font-size:23px;line-height:1.2;margin:12px 0">Custom business apps and AI Agent in a Box</h2>',
 '<p style="font-size:14px;line-height:1.8;color:#e0e9e5">Alongside website design, we build custom business apps and AI assistants. Our AI Agent in a Box can include a branded owner app, customer records, a diary, job management and tailored workflows. These are Entreprenuity offerings, not services attributed to '+company+'.</p>',
 '</td></tr>',
 '<tr><td class="pad" style="padding:22px 38px;color:#4a5958;font-size:13px;line-height:1.7"><strong>INTERNAL ONLY · NOT SENT.</strong> This review is not a customer-ready send. Public email: '+esc(recipient)+'. Public phone: '+esc(phone)+'. External sending requires founder approval, compliance checks, approved Zoho sender, exact recipient and the secure Entreprenuity Studio customer-facing link.</td></tr>',
 '<tr><td style="padding:17px 24px;background:#091a21;color:#cad5d3;font-size:11px">Entreprenuity · ChatGPT Digital Ambush · frozen browser screenshot matched to GitHub HTML SHA '+actual.slice(0,12)+'</td></tr>',
 '</table></td></tr></table></body></html>'
 ].join("\n");
 fs.writeFileSync(path.join(out,"index.html"),html+"\n");
 const plain=["Subject: A website concept for "+name,"To: "+recipient+" (INTERNAL REVIEW ONLY, NOT SENT)","","A new mobile-ready homepage concept has been prepared for "+name+".","View the exact published HTML page: "+r.url,"","Entreprenuity also offers custom business apps and AI Agent in a Box, including an owner app.","","Nothing has been sent. A separate approved Zoho message and secure Studio link are required."].join("\n");
 fs.writeFileSync(path.join(out,"email.txt"),plain+"\n");
 console.log(JSON.stringify({status:"HTML_EMAIL_BUILT_NOT_SENT",website:r.url,site_sha:actual,images:wanted.map(x=>screenshots[x].file)}));
}
try{const [site,receipt,brief]=process.argv.slice(2);if(!site||!receipt||!brief)throw Error("Usage: node scripts/build-email-review-from-screenshots.cjs <site-index> <screenshot-receipt> <brief.json>");build(site,receipt,brief)}catch(e){console.error("EMAIL_BUILD_BLOCKED:",e.message);process.exitCode=1}
