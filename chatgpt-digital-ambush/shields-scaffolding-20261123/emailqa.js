const path=require('path');
const {chromium}=require('/home/node/.openclaw/workspace/node_modules/playwright');
const E='file://'+path.resolve('/tmp/ap-read/chatgpt-digital-ambush/shields-scaffolding-20261123/email-preview/index.html');
(async()=>{const b=await chromium.launch({headless:true});
const out={};let pass=true;const fails=[];
for(const [w,h] of [[360,800],[390,844],[680,900],[1024,900]]){
 const ctx=await b.newContext({viewport:{width:w,height:h}});const p=await ctx.newPage();const errs=[];
 p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
 await p.goto(E,{waitUntil:'networkidle',timeout:20000});
 const st=await p.evaluate(()=>{const imgs=[...document.images];return{overflow:document.documentElement.scrollWidth-innerWidth,imgs:imgs.length,broken:imgs.filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src),links:[...document.querySelectorAll('a[href]')].map(a=>a.href).length,wrap:!!document.querySelector('.wrap'),cta:!!document.querySelector('.cta')}});
 const ok=st.overflow<=2&&st.imgs>=1&&!st.broken.length&&st.links>=1&&st.cta&&errs.length===0;
 if(!ok){pass=false;fails.push({w,st,errs});}
 console.log(`email ${w}px overflow=${st.overflow} imgs=${st.imgs} broken=${st.broken.length} links=${st.links} cta=${st.cta} errs=${errs.length} => ${ok?'PASS':'FAIL'}`);
 if(w===680)await p.screenshot({path:'/home/node/.openclaw/workspace/neo-tmp/shields/email680.jpg',type:'jpeg',quality:80,fullPage:true});
 await ctx.close();
}
await b.close();console.log(fails.length?JSON.stringify(fails):'EMAIL_QA_ALL_PASS');process.exit(pass?0:1);
})();
