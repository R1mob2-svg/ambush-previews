#!/usr/bin/env node
'use strict';
/**
 * Digital Ambush: one-candidate, evidence-first public website + contact audit.
 * READ ONLY. Never sends emails, mutates CRM, logs into a site, or bypasses bot checks.
 *
 * node scripts/factory/prospect-chromium-audit.cjs <lead.json> <receipt-dir>
 * exits 0 = sufficient scoped evidence for HUMAN/AUTOMATION revalidation,
 * exits 1 = EXCLUDE/HOLD, exits 2 = tooling failure. A 0 is NOT send approval.
 * Uses the existing Playwright dependency; no TinyFish/GH Actions/new service.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),dns=require('node:dns/promises');
const {isIP}=require('node:net');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const digits=v=>String(v||'').replace(/\D/g,'');
const text=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const stop=/^(ltd|limited|llp|plc|the|and|services|service|company|co|uk)$/i;
const businessTokens=s=>String(s||'').toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>2&&!stop.test(x));
const sameBusiness=(hay,name)=>businessTokens(name).filter(x=>text(hay).includes(x)).length>=Math.min(2,businessTokens(name).length);
const blockedHost=h=>!h||isIP(h)||h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||
 h.endsWith('.internal')||h.endsWith('.onion')||h.endsWith('.test')||h.endsWith('.invalid')||
 h.endsWith('.example')||h.endsWith('.railway.internal')||h.indexOf('.')<0;
const directories=/(?:^|\.)(?:bing\.com|google\.[a-z.]+|yahoo\.com|facebook\.com|instagram\.com|linkedin\.com|yell\.com|checkatrade\.com|trustatrader\.com|mybuilder\.com|freeindex\.co\.uk|companieshouse\.gov\.uk|service\.gov\.uk|gov\.uk|x\.com|twitter\.com|youtube\.com|nextdoor\.co\.uk)$/i;
function safeUrl(raw){
 try{const u=new URL(String(raw||'').trim());
  if(u.protocol!=='https:'||u.username||u.password||u.port||blockedHost(u.hostname))return null;
  return u.href;
 }catch{return null;}
}
function sourceUrls(lead){
 const raw=[lead.email_source_url,lead.email_evidence_url,lead.source_url,
   lead.identity_evidence_url,...(Array.isArray(lead.evidence_urls)?lead.evidence_urls:[]),
   ...(Array.isArray(lead.website_search_evidence_urls)?lead.website_search_evidence_urls:
       String(lead.website_search_evidence_urls||'').split(/\s*;\s*/))];
 return [...new Set(raw.map(safeUrl).filter(Boolean))].slice(0,8);
}
function candidateProblems(l){
 const reasons=[];
 if(!/^\d{8}$/.test(String(l.company_number||'')))reasons.push('COMPANY_NUMBER_REQUIRED');
 if(!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(l.public_email||l.email||'')))reasons.push('PUBLIC_EMAIL_REQUIRED');
 if(digits(l.public_phone||l.phone).length<10)reasons.push('BUSINESS_PHONE_REQUIRED');
 if(!l.business_name||businessTokens(l.business_name).length===0)reasons.push('BUSINESS_IDENTITY_REQUIRED');
 const w=String(l.website_status||'').toUpperCase();
 if(l.website_url||/HAS_ACTIVE_WEBSITE|HAS_WEBSITE|EXISTING_SITE/.test(w))reasons.push('WEBSITE_ALREADY_LISTED');
 return reasons;
}
function searchQueries(l){
 const name='"'+String(l.business_name||'').replace(/["\n]/g,'').slice(0,90)+'"';
 const pc=String(l.address||l.location||'').match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i)?.[0]||'';
 return [name+' '+pc+' official website',name+' "'+digits(l.public_phone||l.phone).slice(-9)+'" website',
    name+' "'+String(l.public_email||l.email||'').toLowerCase()+'" website'].map(x=>x.trim());
}
function decodeBing(raw){
 try{const u=new URL(raw);if(!/(\.|^)bing\.com$/i.test(u.hostname))return raw;
  const v=u.searchParams.get('u')||'';
  if(v.startsWith('a1'))return Buffer.from(v.slice(2),'base64url').toString('utf8');
 }catch{}
 return raw;
}
async function main(lead,out,dependencies={}){
 const fsapi=dependencies.fs||fs,dir=path.resolve(out),clock=dependencies.clock||(()=>new Date().toISOString());
 fsapi.mkdirSync(dir,{recursive:true});
 const receipt={schema:'digital-ambush.chromium-prospect-audit.v1',prospect_id:String(lead.prospect_id||'').slice(0,100),
  company:String(lead.business_name||'').slice(0,120),at:clock(),lead_sha256:hash(JSON.stringify(lead)),
  searches:[],visited:[],screenshots:[],discovered_sites:[],checks:[],status:'RESEARCH_HOLD',
  outbound_allowed:false,build_allowed:false,limitations:['Website absence is scoped, never universal proof']};
 const check=(name,pass,details)=>receipt.checks.push({name,pass:!!pass,details:details||null});
 const save=()=>fsapi.writeFileSync(path.join(dir,'prospect-browser-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 const fail=(status,reason)=>{receipt.status=status;receipt.reason=reason;save();return receipt;};
 const reasons=candidateProblems(lead);
 if(reasons.length){receipt.checks=reasons.map(x=>({name:x,pass:false}));return fail(
  reasons.includes('WEBSITE_ALREADY_LISTED')?'EXCLUDED_EXISTING_SITE':'RESEARCH_HOLD','BASE_QUALIFICATION_FAILED');}
 const {chromium}=dependencies.playwright||require('playwright');
 let browser;
 const shots=async(page,slot)=>{
   const name=String(slot).replace(/[^a-z0-9_-]/gi,'').slice(0,55)+'.jpg';
   const bytes=await page.screenshot({type:'jpeg',quality:67,animations:'disabled',timeout:8000});
   if(bytes.length<1500)throw Error('SCREENSHOT_EMPTY');
   fsapi.writeFileSync(path.join(dir,name),bytes);
   receipt.screenshots.push({file:name,sha256:hash(bytes),bytes:bytes.length});
 };
 const nav=async(page,url,slot)=>{
  const valid=safeUrl(url);if(!valid)return {ok:false,reason:'UNSAFE_URL'};
  let response;
  try{response=await page.goto(valid,{waitUntil:'domcontentloaded',timeout:19000});}
  catch{return {ok:false,reason:'NAVIGATION_FAILED'};}
  if(!response||response.status()>=400)return {ok:false,reason:'HTTP_'+(response?.status()||0)};
  const landed=safeUrl(page.url());
  if(!landed)return {ok:false,reason:'UNSAFE_REDIRECT'};
  const content=await page.locator('body').innerText({timeout:4500}).catch(()=>'');
  if(content.length<80||/captcha|verify you are human|unusual traffic|access denied/i.test(content.slice(0,600)))
   return {ok:false,reason:'BLOCKED_OR_UNREADABLE'};
  await shots(page,slot).catch(()=>{receipt.limitations.push('Screenshot not captured: '+slot);});
  return {ok:true,url:landed,content:content.slice(0,160000)};
 };
 try{
  const options={headless:true,args:['--disable-dev-shm-usage']};
  if(process.env.CHROMIUM_PATH)options.executablePath=process.env.CHROMIUM_PATH;
  else if(fs.existsSync('/usr/bin/chromium'))options.executablePath='/usr/bin/chromium';
  browser=await chromium.launch(options);
  const context=await browser.newContext({viewport:{width:1280,height:800},locale:'en-GB',acceptDownloads:false});
  // No auth, form sends, CAPTCHA circumvention, private addresses or third-party tracking.
  await context.route('**/*',route=>{
   const req=route.request(),u=safeUrl(req.url());
   if(!u||['websocket','eventsource'].includes(req.resourceType()))return route.abort();
   return route.continue();
  });
  const page=await context.newPage();
  const companyNo=String(lead.company_number);
  const gov='https://find-and-update.company-information.service.gov.uk/company/'+companyNo;
  const reg=await nav(page,gov,'companies-house');
  receipt.visited.push({url:gov,status:reg.reason||'OK',source:'official_registry'});
  const legal=reg.ok && text(reg.content).includes(text(companyNo)) &&
    sameBusiness(reg.content,lead.business_name)&&/\bactive\b/i.test(reg.content);
  check('verified_active_uk_company',legal,reg.reason||null);
  if(!legal)return fail('RESEARCH_HOLD','UK_COMPANY_VERIFICATION_UNAVAILABLE');
  let emailEvidence=false,phoneEvidence=false;
  const email=String(lead.public_email||lead.email).toLowerCase().trim();
  const phone=digits(lead.public_phone||lead.phone),local=phone.startsWith('44')?'0'+phone.slice(2):phone;
  const docs=sourceUrls(lead).filter(x=>x!==gov);
  for(const [i,url] of docs.entries()){
   const pageResult=await nav(page,url,'evidence-'+i);
   const item={url,status:pageResult.reason||'OK',company_matched:false,email:false,phone:false};
   if(pageResult.ok){
    const matched=sameBusiness(pageResult.content,lead.business_name)||
       (text(pageResult.content).includes(text(companyNo))&&text(pageResult.content).includes(text(lead.business_name)));
    item.company_matched=matched;
    item.email=matched&&pageResult.content.toLowerCase().includes(email);
    item.phone=matched&&(digits(pageResult.content).includes(local)||digits(pageResult.content).includes(phone));
    emailEvidence ||= item.email;
    phoneEvidence ||= item.phone;
    // Links to likely official websites in public directories trigger a HOLD or exclusion.
    const hrefs=await page.locator('a[href]').evaluateAll(els=>els.slice(0,200).map(a=>({
     url:a.href,title:(a.innerText||a.textContent||'').trim().slice(0,110)}))).catch(()=>[]);
    for(const link of hrefs){
     const checked=safeUrl(link.url);if(!checked)continue;
     const host=new URL(checked).hostname;
     if(directories.test(host)||new URL(url).hostname===host)continue;
     if(matched&&(/website|visit site|official site/i.test(link.title)||sameBusiness(link.title,lead.business_name)))
       receipt.discovered_sites.push({url:checked,source:url,signal:'business_listing_link'});
    }
   }
   receipt.visited.push(item);
  }
  check('email_published_and_business_matched',emailEvidence);
  check('telephone_published_and_business_matched',phoneEvidence);
  if(!emailEvidence||!phoneEvidence)return fail('RESEARCH_HOLD','MISSING_MATCHED_PUBLIC_CONTACT_EVIDENCE');
  const mx=await dns.resolveMx(email.split('@')[1]).catch(()=>[]);
  const mxValid=mx.some(x=>x.exchange&&x.exchange!=='.');
  check('email_domain_has_live_mx',mxValid);
  if(!mxValid)return fail('RESEARCH_HOLD','EMAIL_DOMAIN_MX_UNAVAILABLE');
  let searchPasses=0;
  for(const [i,q] of searchQueries(lead).entries()){
   const link='https://www.bing.com/search?q='+encodeURIComponent(q)+'&cc=GB';
   const view=await nav(page,link,'search-'+i);
   const entry={query:q,url:link,status:view.reason||'OK',organic_count:0};
   if(view.ok){
    const results=await page.locator('li.b_algo').evaluateAll(els=>els.slice(0,15).map(el=>({
     title:el.querySelector('h2')?.textContent?.trim()||'',
     url:el.querySelector('h2 a')?.href||'',
     snippet:el.innerText.slice(0,500)
    }))).catch(()=>[]);
    entry.organic_count=results.length;
    if(results.length)searchPasses++;
    for(const result of results){
     const url=safeUrl(decodeBing(result.url));if(!url)continue;
     const host=new URL(url).hostname;
     if(directories.test(host))continue;
     if(sameBusiness(result.title+' '+result.snippet,lead.business_name)||
       result.snippet.includes(local.slice(-9))||result.snippet.toLowerCase().includes(email))
       receipt.discovered_sites.push({url,source:link,signal:'search_business_match',title:result.title.slice(0,130)});
    }
   }
   receipt.searches.push(entry);
  }
  // Zero valid searches is a tooling failure, NOT proof of no website.
  if(searchPasses<2)return fail('RESEARCH_HOLD','WEBSITE_SEARCH_EVIDENCE_INCOMPLETE');
  const unique=[...new Map(receipt.discovered_sites.map(x=>[new URL(x.url).hostname,x])).values()];
  receipt.discovered_sites=unique;
  for(const [i,site] of unique.slice(0,8).entries()){
   const live=await nav(page,site.url,'site-candidate-'+i);
   site.status=live.reason||'OK';
   if(live.ok){
    site.business_matched=sameBusiness(live.content,lead.business_name);
    site.phone_matched=digits(live.content).includes(local.slice(-9));
    site.email_matched=live.content.toLowerCase().includes(email);
    if(site.business_matched&&(site.phone_matched||site.email_matched))
     return fail('EXCLUDED_EXISTING_SITE','OFFICIAL_SITE_VERIFIED_BY_BRANDED_PUBLIC_CONTENT');
   }
  }
  if(unique.length)return fail('RESEARCH_HOLD','POSSIBLE_OFFICIAL_SITE_REQUIRES_MANUAL_REVIEW');
  receipt.status='SCOPED_WEBSITE_SEARCH_CLEAR';
  receipt.outbound_allowed=false;receipt.build_allowed=false;
  receipt.reason='PASS_BASE_EVIDENCE_ONLY; independent legal, DNC and send gates still required';
  receipt.search_scope='3 targeted Bing public results queries + supplied listing/contact evidence';
  save();return receipt;
 }catch(e){
  return fail('RESEARCH_HOLD','BROWSER_AUDIT_UNAVAILABLE_'+String(e.code||'ERROR').replace(/[^A-Z0-9_]/gi,'').slice(0,40));
 }finally{if(browser)await browser.close().catch(()=>{});}
}
module.exports={main,candidateProblems,safeUrl,sourceUrls,searchQueries};
if(require.main===module){
 const [input,out]=process.argv.slice(2);
 if(!input||!out){console.error('Usage: node scripts/factory/prospect-chromium-audit.cjs <lead.json> <receipt-dir>');process.exit(2);}
 let lead;try{lead=JSON.parse(fs.readFileSync(input,'utf8'));}catch{console.error('Invalid lead JSON');process.exit(2);}
 main(lead,out).then(receipt=>{
  console.log(JSON.stringify({status:receipt.status,id:receipt.prospect_id,reason:receipt.reason,
   checks:receipt.checks,screenshots:receipt.screenshots,receipt_path:path.resolve(out,'prospect-browser-receipt.json')}));
  process.exitCode=receipt.status==='SCOPED_WEBSITE_SEARCH_CLEAR'?0:1;
 }).catch(e=>{console.error('Audit failed '+String(e.code||'UNKNOWN'));process.exitCode=2;});
}
