import crypto from 'node:crypto';
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { V3_VERSION, root, exists } from './lib-v3-production.mjs';
const assert=(c,m)=>{if(!c)throw new Error(m)};
const files=['reports/v31-final-media-receipt.json','reports/v3-rc1-device-acceptance.json','reports/v31-final-production-receipt.json','reports/v31-final-promotion-gate.json','reports/v31-final-promotion-gate.md'];
const backup=new Map();for(const f of files){const p=path.join(root,f);backup.set(f,await exists(p)?await readFile(p):null)}
const restore=async()=>{for(const [f,b] of backup){const p=path.join(root,f);if(b==null)await rm(p,{force:true});else{await mkdir(path.dirname(p),{recursive:true});await writeFile(p,b)}}};
const run=(script,args=[])=>spawnSync(process.execPath,[path.join(root,'scripts',script),...args],{cwd:root,encoding:'utf8',timeout:30000});
try{
  await rm(path.join(root,'reports/v31-final-media-receipt.json'),{force:true});await rm(path.join(root,'reports/v3-rc1-device-acceptance.json'),{force:true});await rm(path.join(root,'reports/v31-final-production-receipt.json'),{force:true});
  let r=run('v31-final-promotion-gate-v3.mjs');assert(r.status===0&&r.stdout.includes('HOLD'),'缺证据时应 HOLD');
  r=run('v31-final-promotion-gate-v3.mjs',['--strict']);assert(r.status!==0,'缺证据 strict 必须失败');
  const baseline=await readFile(path.join(root,'baselines/v3-rc1-media.json'));const baselineSha256=crypto.createHash('sha256').update(baseline).digest('hex');
  await writeFile(path.join(root,'reports/v31-final-media-receipt.json'),JSON.stringify({version:V3_VERSION,strict:true,files:51,bytes:122533642,baselineSha256,generatedAt:new Date().toISOString()},null,2));
  const checks={readerVisible:true,navigation:true,toc:true,font:true,narration:true,music:true,video:true,fullscreen:true,resume:true};
  const records=[
    {deviceType:'edge-desktop',deviceName:'Desktop Edge actual',version:V3_VERSION,passed:true,recordedAt:new Date().toISOString(),userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0 Safari/537.36 Edg/151.0',checks,auto:{corePass:true}},
    {deviceType:'mac-safari',deviceName:'Mac Safari actual',version:V3_VERSION,passed:true,recordedAt:new Date().toISOString(),userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15',checks,auto:{corePass:true}},
    {deviceType:'iphone-safari',deviceName:'iPhone Safari actual',version:V3_VERSION,passed:true,recordedAt:new Date().toISOString(),userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',checks:{...checks,orientation:true},auto:{corePass:true}}
  ];
  await writeFile(path.join(root,'reports/v3-rc1-device-acceptance.json'),JSON.stringify({version:V3_VERSION,records},null,2));
  await writeFile(path.join(root,'reports/v31-final-production-receipt.json'),JSON.stringify({version:V3_VERSION,status:'passed',base:'https://www.jilv.online/jinchang-magazine',rollbackVerified:true,redeployVerified:true,httpsVerified:true,treeSha256:'a'.repeat(64)},null,2));
  r=run('v31-final-promotion-gate-v3.mjs',['--strict']);assert(r.status===0&&r.stdout.includes('READY_FOR_V3_1_0_FINAL'),'完整真实格式 receipt 应通过 Final Gate');
  records[0].userAgent='Mozilla/5.0 (Windows NT 10.0) Chrome/151 Safari/537.36';await writeFile(path.join(root,'reports/v3-rc1-device-acceptance.json'),JSON.stringify({version:V3_VERSION,records},null,2));
  r=run('v31-final-promotion-gate-v3.mjs',['--strict']);assert(r.status!==0,'Chrome UA 不得伪装 Edge actual binary');
  console.log('V3.1 Final Promotion Smoke PASS：缺证据 HOLD、版本绑定、媒体 baseline hash、Edge/Safari UA、防伪 receipt、正式 HTTPS receipt 均生效。');
}finally{await restore()}
