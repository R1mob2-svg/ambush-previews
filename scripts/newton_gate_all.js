#!/usr/bin/env node
/* Real browser-backed Gate2 batch. No waiver, no synthetic success and no sends. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const root=path.resolve(__dirname,'..');
const folders=fs.readdirSync(root,{withFileTypes:true})
  .filter(x=>x.isDirectory()&&fs.existsSync(path.join(root,x.name,'index.html'))&&fs.existsSync(path.join(root,x.name,'asset-sources.json')))
  .map(x=>x.name).sort();
if(folders.length!==88) { console.error('REFUSING_SCOPE_MISMATCH',folders.length);process.exit(2); }
const outDir=path.join(root,'image-review','gate2-receipts');
fs.mkdirSync(outDir,{recursive:true});
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const receipts=[];
for(const [i,slug] of folders.entries()){
  const html=path.join(slug,'index.html');
  const output=spawnSync(process.execPath,['scripts/gate2.js',html],{
    cwd:root,encoding:'utf8',timeout:180000,maxBuffer:2_000_000
  });
  const log=String(output.stdout||'')+'\n'+String(output.stderr||'');
  const counts=/GATE (PASSED|FAILED) \((?:(\d+) of )?(\d+)(?: checks)?\)/.exec(log);
  const pass=output.status===0 && Boolean(counts&&counts[1]==='PASSED');
  const faults=log.split(/\r?\n/).filter(x=>/^FAIL\s|GATE ERROR|GATE FAILED|Error:|error:/i.test(x)).slice(0,60);
  const details={slug,source_commit:process.env.GITHUB_SHA||null,
    file_sha256:sha(path.join(root,html)),
    asset_manifest_sha256:sha(path.join(root,slug,'asset-sources.json')),
    gate2_status:pass?'PASS':'FAIL',
    gate2_checks:counts?Number(counts[3]):null,
    gate2_failed:counts?Number(counts[2]||0):null,
    process_exit:output.status,
    faults:pass?[]:faults,
    verified_desktop_mobile:pass,
    visual_human_signoff:false,
    newton_approved_at:null,
    run_id:process.env.GITHUB_RUN_ID||null,
    outbound_email:'HOLD'
  };
  receipts.push(details);
  fs.writeFileSync(path.join(outDir,slug+'.json'),JSON.stringify(details,null,2)+'\n');
  fs.writeFileSync(path.join(outDir,slug+'.log'),log);
  console.log('SITE',i+1,'/',folders.length,slug,pass?'PASS':'FAIL',counts?counts[0]:'NO_GATE_SUMMARY',faults.slice(0,3).join(' | '));
}
const passing=receipts.filter(x=>x.gate2_status==='PASS');
const summary={total:receipts.length,pass:passing.length,fail:receipts.length-passing.length,checks_seen:[...new Set(receipts.map(x=>x.gate2_checks))],external_email:'HOLD',source_commit:process.env.GITHUB_SHA||null,run_id:process.env.GITHUB_RUN_ID||null,sites:receipts};
fs.writeFileSync(path.join(root,'image-review','gate2-full-receipt.json'),JSON.stringify(summary,null,2)+'\n');
console.log('NEWTON_GATE2_RESULT',JSON.stringify({total:summary.total,passed:summary.pass,failed:summary.fail,run_id:summary.run_id}));
process.exit(summary.fail===0?0:1);
