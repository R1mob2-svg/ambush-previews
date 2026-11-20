"use strict";
// Reproducible Founder preview visual compiler. This NEVER sends email or
// claims visual verification; it updates only existing published HTML.
const escapeHtml = s => String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const textOnly = s => String(s||"").replace(/<br\b[^>]*>/gi," ").replace(/<[^>]*>/g," ")
  .replace(/&amp;/g,"&").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();
function serviceNames(html) {
 return [...html.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)]
 .map(m=>textOnly(m[1]))
 .filter(s=>s&&!/^(Let's Build|Let's Get|Contact|You call|We quote|We turn|We tidy|How far|Our process|Get in touch)/i.test(s))
 .slice(0,3);
}
function generateHeading(company,services,location) {
 const source=(company+" "+services.join(" ")).toLowerCase();
 let label="";
 if(/plaster|skim|render/.test(source)) label="Plastering & Rendering";
 else if(/patio|paving|landscap|decking|fenc/.test(source)) label="Paving, Patios & Landscaping";
 else if(/roof/.test(source)) label="Roofing & Roof Repairs";
 else if(/electri/.test(source)) label="Electrical Installations & Repairs";
 else if(/plumb|gas|heat|boiler/.test(source)) label="Plumbing & Heating Services";
 else if(/joinery|carpent|woodwork/.test(source)) label="Joinery & Carpentry";
 else if(/paint|decorat/.test(source)) label="Painting & Decorating";
 else if(/build|brickwork|extension|renovat/.test(source)) label="Building & Renovation Services";
 else label=services.slice(0,2).join(" · ");
 if(!label)return null;
 return escapeHtml(label)+"<br><span>in "+escapeHtml(location)+".</span>";
}
function transform(html,path) {
 const original=String(html||"");
 if(original.includes("data-founder-v3"))return {html:original,changed:false,why:"already_applied"};
 if(!/<\/html>/i.test(original)||!/<\/head>/i.test(original))return {html:original,changed:false,why:"not_full_html"};
 let s=original;
 const bento=s.includes('class="hero-section"');
 const simpler=s.includes('class="hero-bg"');
 let css="";
 if(bento){
   const match=s.match(/url\(['"](\.\/assets\/hero\.(?:jpe?g|webp|png))['"]\)/i);
   if(!match)return {html:original,changed:false,why:"hero_asset_missing"};
   css='<style data-founder-v3-asset>.hero-section{background-image:linear-gradient(90deg,rgba(6,13,26,.83) 0%,rgba(6,13,26,.62) 29%,rgba(6,13,26,.26) 62%,rgba(6,13,26,.02) 100%),url("'+match[1]+'")!important}</style>';
 }
 if(simpler)css='<style data-founder-v3-asset>.hero .hero-bg{background-size:140% auto!important;background-position:right 42%!important}@media(max-width:640px){.hero .hero-bg{background-size:cover!important;background-position:72% center!important}}</style>';
 s=s.replace(/<\/head>/i,'<link href="../founder-visual-v3.css?v=20261120-3" rel="stylesheet" data-founder-v3="true">\n'+css+'\n</head>');
 let originalGeneric=false, correctedClaims=false, correctedPhone=false;
 const heading=s.match(/<h1\b[^>]*class=["']hero-title["'][^>]*>([\s\S]*?)<\/h1>/i);
 const services=serviceNames(s);
 const company=textOnly(s.match(/class=["']hero-company-title["'][^>]*>([\s\S]*?)<\/p>/i)?.[1]||"");
 if(heading&&/Bespoke\s+Design,?\s+Building\s+&\s+Fit\s+Out/i.test(textOnly(heading[1]))&&services.length){
   originalGeneric=true;
   const place=textOnly(heading[1]).match(/in\s+([a-z\s-]+)\.?$/i)?.[1]?.trim()||"the West Midlands";
   const updated=generateHeading(company,services,place);
   if(updated)s=s.replace(heading[0],heading[0].replace(heading[1],updated));
   const badge=s.match(/<div class=["']hero-eyebrow-badge["'][^>]*>([\s\S]*?)<\/div>/i);
   if(badge)s=s.replace(badge[0],badge[0].replace(badge[1],"\n "+escapeHtml(services.slice(0,2).join(" · ").toUpperCase())+"\n"));
   const edits=[
     ["Full 3D Architectural Planning",services[0]],
     ["Building Regs &amp; Certified Steel",services[1]||services[0]],
     ["Full 3D Scope &amp; Architectural Planning",services[0]]
   ];
   for(const [old,next] of edits){if(s.includes(old)){s=s.replaceAll(old,escapeHtml(next));correctedClaims=true}}
   s=s.replaceAll("Let's Build Something Exceptional Together",escapeHtml("Discuss Your "+services[0]+" Project"));
 }
 const fake="0121&nbsp;556&nbsp;7820";
 const href=s.match(/<a\b[^>]*class=["'][^"']*btn-header-phone[^"']*["'][^>]*href=["']tel:([+\d]+)["']/i)?.[1]
    ||s.match(/<a\b[^>]*href=["']tel:([+\d]+)["'][^>]*class=["'][^"']*btn-header-phone/i)?.[1];
 if(href&&href.replace(/\D/g,"")!=="01215567820"&&href.replace(/\D/g,"").length>=10&&s.includes(fake)){
   const d=href.replace(/\D/g,"").replace(/^44(?=7)/,"0");
   const pretty=d.replace(/^(\d{5})(\d{6})$/,"$1 $2");
   s=s.replaceAll(fake,escapeHtml(pretty));correctedPhone=true;
 }
 return {html:s,changed:s!==original,why:"applied",isBento:bento,isSimple:simpler,
   correctedHeroCopy:originalGeneric,correctedClaims,correctedPhone,services};
}
module.exports={transform,serviceNames,generateHeading};
