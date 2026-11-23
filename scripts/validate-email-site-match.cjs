#!/usr/bin/env node
"use strict";
/**
 * Email visual parity gate. Run AFTER capture-email-website.cjs and GitHub asset upload.
 * Usage: node scripts/validate-email-site-match.cjs <local-site-index.html> <local-email-index.html> <screenshot-receipt.json> <published-site-url>
 * Fails closed: real browser screenshots of the same GitHub-revision website only.
 */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const sha=(d)=>crypto.createHash("sha256").update(d).digest("hex");
const gitBlob=(d)=>crypto.createHash("sha1").update(Buffer.from("blob "+d.length+"\0")).update(d).digest("hex");
function assert(cond,code){if(!cond)throw Error(code)}
function main(){
 const [siteFile,emailFile,receiptFile,rawUrl]=process.argv.slice(2);
 assert(siteFile&&emailFile&&receiptFile&&rawUrl,"USAGE: site.html email.html receipt.json public-url");
 const u=new URL(rawUrl);
 assert(u.protocol==="https:"&&u.hostname==="r1mob2-svg.github.io"&&u.pathname.startsWith("/ambush-previews/"),"URL_NOT_GITHUB_PAGES");
 const siteData=fs.readFileSync(siteFile),email=fs.readFileSync(emailFile,"utf8");
 const receipt=JSON.parse(fs.readFileSync(receiptFile,"utf8"));
 assert(receipt.url===u.href,"SCREENSHOT_WEBSITE_URL_MISMATCH");
 assert(receipt.html_blob_sha===gitBlob(siteData),"SCREENSHOT_WEBSITE_SHA_MISMATCH");
 assert(/<html\b/i.test(siteData.toString())&&/<h1\b/i.test(siteData.toString()),"WEBSITE_NOT_SEMANTIC_HTML");
 assert(!/concept-thumbnail|s\.wordpress\.com\/mshots|images\.unsplash\.com|screenshot\.guru|placeholder\.com/i.test(email),"EMAIL_HERO_NOT_FROZEN_SITE_SCREENSHOT");
 assert(!/<iframe\b|<script\b/i.test(email),"UNSAFE_EMAIL_MARKUP");
 assert(email.includes(u.href),"EMAIL_DOES_NOT_LINK_EXACT_WEBSITE");
 assert(/width\s*:\s*100%/i.test(email)&&/height\s*:\s*auto/i.test(email),"EMAIL_NOT_RESPONSIVE");
 // NEO 2026-11-23: the "Agent in a box" / "owner app" wording contradicted the currently founder-approved
 // doctrine Doctrine/DIGITAL_AMBUSH_DARK_EMAIL_APP_SHOWCASE_20261122.md ("Imagine running your business from one app",
 // one-app section, no giant illustrated menu). Gate now enforces the doctrine-compliant offer, not stale wording.
 assert(/one app/i.test(email)&&/business app/i.test(email)&&/AI assistant/i.test(email)&&/quotes?\s*&(amp;)?\s*invoices/i.test(email),"EMAIL_MISSING_ENTREPRENUITY_ONE_APP_OFFER");
 assert(/NOT SENT|NO PROSPECT EMAIL HAS BEEN SENT|INTERNAL REVIEW|UNSENT|NOT SEND-READY/i.test(email),"EMAIL_SEND_STATUS_UNCLEAR");
 const shots=receipt.screenshots||[];
 const expectedLabels=["mobile390","tablet820","desktop1200"];
 for(const label of expectedLabels){
  const shot=shots.find(x=>x.label===label);
  assert(shot,"MISSING_FROZEN_SCREENSHOT_"+label);
  assert(shot.filename.includes(receipt.html_blob_sha.slice(0,12)),"SCREENSHOT_FILENAME_SHA_MISMATCH_"+label);
  assert(!shot.filename.includes("..")&&!shot.filename.includes("/"),"UNSAFE_SCREENSHOT_PATH");
  const file=path.join(path.dirname(receiptFile),shot.filename),d=fs.readFileSync(file);
  assert(d.length>4000&&d[0]===255&&d[1]===216&&d[2]===255,"SCREENSHOT_NOT_REAL_JPEG_"+label);
  assert(sha(d)===shot.sha256,"SCREENSHOT_BYTES_HASH_MISMATCH_"+label);
  assert(email.includes(shot.filename),"EMAIL_DOES_NOT_EMBED_SCREENSHOT_"+label);
 }
 assert(/<img\b[^>]+alt=["'][^"']{10,}/i.test(email),"EMAIL_SCREENSHOT_ALT_MISSING");
 console.log(JSON.stringify({status:"PASS",site_git_blob_sha:receipt.html_blob_sha,site_url:u.href,email_screenshots:expectedLabels},null,2));
}
try{main()}catch(e){console.error("EMAIL_VISUAL_PARITY_FAILED:",e.message);process.exitCode=1}
