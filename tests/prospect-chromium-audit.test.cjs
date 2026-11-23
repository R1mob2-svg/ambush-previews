'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {candidateProblems,safeUrl,sourceUrls,searchQueries,main}=require('../scripts/factory/prospect-chromium-audit.cjs');
const valid=()=>({prospect_id:'TEST-LTD-1',company_number:'12345678',
 business_name:'Example Roofing Services Limited',
 public_email:'contact@example-roofing.co.uk',public_phone:'0121 555 0110',
 website_status:'NO_OFFICIAL_SITE_FOUND_WITHIN_SEARCH_SCOPE',
 email_source_url:'https://example.org/public-trade-list',address:'Wednesbury, WS10 8NX'});
test('do not qualify a company with no phone, email or Companies House number',()=>{
 const p=valid();delete p.company_number;delete p.public_email;delete p.public_phone;
 assert.deepEqual(candidateProblems(p),[
  'COMPANY_NUMBER_REQUIRED','PUBLIC_EMAIL_REQUIRED','BUSINESS_PHONE_REQUIRED']);
});
test('listed official site is an exclusion even with otherwise complete contact fields',()=>{
 const p=valid();p.website_url='https://example-roofing.co.uk/';
 assert.ok(candidateProblems(p).includes('WEBSITE_ALREADY_LISTED'));
 const a=valid();a.website_status='HAS_ACTIVE_WEBSITE';
 assert.ok(candidateProblems(a).includes('WEBSITE_ALREADY_LISTED'));
});
test('disallow internal hosts, IP addresses, insecure links and secrets in URLs',()=>{
 for(const value of ['http://example.org','https://127.0.0.1/',
  'https://localhost/','https://company.internal','https://a:b@example.org/',
  'https://192.168.1.1/','https://[::1]/','https://demo.test'])
  assert.equal(safeUrl(value),null,value);
 assert.equal(safeUrl('https://example.org/public-listing'),'https://example.org/public-listing');
});
test('browser search scope includes business, postcode, telephone and public email',()=>{
 const q=searchQueries(valid());
 assert.equal(q.length,3);
 assert.ok(q[0].includes('WS10 8NX'));
 assert.ok(q[1].includes('5550110'));
 assert.ok(q[2].includes('contact@example-roofing.co.uk'));
});
test('raw evidence strings are not automatically treated as URLs',()=>{
 const p=valid();
 p.website_search_evidence_urls='DNS ENOTFOUND example.co.uk ; https://example.org/list';
 assert.deepEqual(sourceUrls(p),[
  'https://example.org/public-trade-list','https://example.org/list']);
});
test('base qualification failure saves durable HOLD receipt without opening Chromium',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ambush-chromium-proof-'));
 const p=valid();delete p.public_phone;
 try{
  const r=await main(p,dir,{playwright:{chromium:{launch(){throw Error('BROWSER_MUST_NOT_OPEN');}}}});
  assert.equal(r.status,'RESEARCH_HOLD');assert.equal(r.outbound_allowed,false);
  assert.equal(r.build_allowed,false);assert.equal(r.reason,'BASE_QUALIFICATION_FAILED');
  const receipt=JSON.parse(fs.readFileSync(path.join(dir,'prospect-browser-receipt.json'),'utf8'));
  assert.equal(receipt.status,'RESEARCH_HOLD');assert.equal(receipt.checks[0].name,'BUSINESS_PHONE_REQUIRED');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('email-only source and enrichment may never bypass qualification',()=>{
 const sourcer=fs.readFileSync(new URL('../scripts/factory/source-verified-trades.js',import.meta.url),'utf8');
 const enricher=fs.readFileSync(new URL('../scripts/factory/email-enrich.js',import.meta.url),'utf8');
 assert.match(sourcer,/pipeline_status: 'RESEARCH_HOLD'/);
 assert.match(sourcer,/EXISTING_OFFICIAL_WEBSITE_FOUND/);
 assert.match(enricher,/const next = 'RESEARCH_HOLD'/);
 assert.doesNotMatch(sourcer,/pipeline_status: 'FRESH_QUALIFIED'/);
});
