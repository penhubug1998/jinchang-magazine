import { mkdir, mkdtemp, readFile, rm, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const root=process.cwd();
const assert=(c,m)=>{if(!c)throw new Error(m)};
const temp=await mkdtemp(path.join(os.tmpdir(),'jm-p109-gate-'));
const repo=path.join(temp,'repo');
try{
  await cp(root,repo,{recursive:true,filter:src=>!src.includes(`${path.sep}.git${path.sep}`)&&!src.includes(`${path.sep}reports${path.sep}`)&&!src.includes(`${path.sep}dist-v3${path.sep}`)&&!src.includes(`${path.sep}release-v3${path.sep}`)});
  const git=(args)=>spawnSync('git',args,{cwd:repo,encoding:'utf8'});
  assert(git(['init']).status===0,'git init failed');
  git(['config','user.email','p109@example.invalid']);git(['config','user.name','P1-09 Smoke']);
  git(['add','.']);assert(git(['commit','-m','fixture']).status===0,'fixture commit failed');
  const committedAt=String(git(['show','-s','--format=%cI','HEAD']).stdout||'').trim();
  const future=new Date(Date.parse(committedAt)+60_000).toISOString();
  await mkdir(path.join(repo,'reports'),{recursive:true});
  await writeFile(path.join(repo,'reports','p1-08-production-e2e-last.json'),JSON.stringify({version:'3.1.0',ok:true,completedAt:future,checkpoints:Array.from({length:26},(_,i)=>({name:`c${i+1}`,ok:true}))},null,2));
  const run=(strict=false)=>spawnSync(process.execPath,['scripts/p1-09-final-evidence-gate-v3.mjs',...(strict?['--strict']:[])],{cwd:repo,encoding:'utf8'});
  let r=run(false);assert(r.status===0,`non-strict gate failed\n${r.stdout}\n${r.stderr}`);
  let report=JSON.parse(await readFile(path.join(repo,'reports','p1-09-final-evidence-gate.json'),'utf8'));
  assert(report.status==='HOLD','missing external evidence must HOLD');
  assert(report.gates.find(x=>x.id==='current-e2e')?.status==='READY','fresh P1-08 E2E should be READY');
  assert(report.gates.find(x=>x.id==='mac-safari')?.status==='PENDING','missing Safari must remain PENDING');
  r=run(true);assert(r.status!==0,'strict gate must fail closed while external evidence missing');

  const stale=new Date(Date.parse(committedAt)-60_000).toISOString();
  await writeFile(path.join(repo,'reports','v31-final-media-receipt.json'),JSON.stringify({version:'3.1.0',generatedAt:stale,strict:true,files:51,bytes:122533642},null,2));
  await writeFile(path.join(repo,'reports','v3-rc1-device-acceptance.json'),JSON.stringify({version:'3.1.0',records:[
    {deviceType:'edge-desktop',version:'3.1.0',passed:true,recordedAt:stale,userAgent:'Mozilla/5.0 Edg/151.0',checks:{a:true},auto:{corePass:true}},
    {deviceType:'mac-safari',version:'3.1.0',passed:true,recordedAt:stale,userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X) Version/26.0 Safari/605.1.15',checks:{a:true},auto:{corePass:true}},
    {deviceType:'iphone-safari',version:'3.1.0',passed:true,recordedAt:stale,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) Version/26.0 Mobile/15E148 Safari/604.1',checks:{a:true},auto:{corePass:true}},
    {deviceType:'android-wechat',version:'3.1.0',passed:true,recordedAt:stale,userAgent:'Mozilla/5.0 (Linux; Android 16) MicroMessenger/8.0',checks:{a:true},auto:{corePass:true}}
  ]},null,2));
  await writeFile(path.join(repo,'reports','v31-final-production-receipt.json'),JSON.stringify({version:'3.1.0',generatedAt:stale,status:'passed',rollbackVerified:true,redeployVerified:true,httpsVerified:true,base:'https://example.invalid/'},null,2));
  r=run(false);assert(r.status===0,'stale-evidence non-strict gate failed');
  report=JSON.parse(await readFile(path.join(repo,'reports','p1-09-final-evidence-gate.json'),'utf8'));
  for(const id of ['media','edge-desktop','mac-safari','iphone-safari','android-wechat','production-https'])assert(report.gates.find(x=>x.id===id)?.status==='PENDING',`${id} stale evidence must be rejected`);

  const records=JSON.parse(await readFile(path.join(repo,'reports','v3-rc1-device-acceptance.json'),'utf8'));for(const row of records.records)row.recordedAt=future;await writeFile(path.join(repo,'reports','v3-rc1-device-acceptance.json'),JSON.stringify(records,null,2));
  await writeFile(path.join(repo,'reports','v31-final-media-receipt.json'),JSON.stringify({version:'3.1.0',generatedAt:future,strict:true,files:51,bytes:122533642},null,2));
  await writeFile(path.join(repo,'reports','v31-final-production-receipt.json'),JSON.stringify({version:'3.1.0',generatedAt:future,status:'passed',rollbackVerified:true,redeployVerified:true,httpsVerified:true,base:'https://example.invalid/'},null,2));
  r=run(true);assert(r.status===0,`fresh evidence strict gate failed\n${r.stdout}\n${r.stderr}`);
  report=JSON.parse(await readFile(path.join(repo,'reports','p1-09-final-evidence-gate.json'),'utf8'));
  assert(report.status==='READY_FOR_CURRENT_3_1_0_RELEASE'&&report.ready===report.total,'fresh current-version evidence should pass');
  console.log('P1-09 Final Evidence Gate smoke PASS：历史/过期证据被拒绝，当前 3.1.0 的 E2E、媒体、Edge、Safari、iPhone Safari、Android 微信和 HTTPS receipt 全部新鲜时才 READY。');
} finally { await rm(temp,{recursive:true,force:true}); }
