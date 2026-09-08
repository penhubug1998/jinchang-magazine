import { spawnSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root, V3_VERSION } from './lib-v3-production.mjs';
const assert=(c,m)=>{if(!c)throw new Error(m)};const runs=[];
function execScript(script,args=[],timeout=240000){const r=spawnSync(process.execPath,[path.join(root,'scripts',script),...args],{cwd:root,encoding:'utf8',timeout,maxBuffer:32*1024*1024});if(r.status!==0)throw new Error(`${script} ${args.join(' ')} failed\n${r.stdout}\n${r.stderr}`);return r;}
function buildIssue(id){execScript('build-v3.mjs',['--issue',id]);}
function run(label,args,out){const r=execScript('browser-regression-v3.mjs',args);return readFile(path.join(root,out,'report.json'),'utf8').then(JSON.parse).then(rep=>{runs.push({label,args,uaProfile:rep.uaProfile,navigatorUserAgent:rep.navigatorUserAgent,viewports:rep.viewports.map(v=>({viewport:v.viewport,initialReadyMs:v.initialReadyMs}))});});}
// RC2 browser acceptance must be reproducible in a clean checkout. Do not
// depend on dist-v3 artifacts left behind by a previous local build.
buildIssue('001');
buildIssue('002');
await run('Chromium full 001',['--issue','001'],'.tmp-v3-browser-001');
await run('Chromium mobile 002',['--issue','002','--mobile-only'],'.tmp-v3-browser-002');
await run('Edge UA compatibility',['--issue','001','--desktop-only','--ua-profile','edge-win'],'.tmp-v3-browser-001-edge-win');
await run('iPhone Safari UA compatibility',['--issue','001','--mobile-only','--compat','--ua-profile','iphone-safari'],'.tmp-v3-browser-001-compat-iphone-safari');
for(const x of runs.flatMap(r=>r.viewports))assert(x.initialReadyMs<2500,`reader ready budget exceeded ${x.viewport} ${x.initialReadyMs}ms`);
const report={version:V3_VERSION,generatedAt:new Date().toISOString(),status:'passed',actualEngine:'Chromium',runs,externalRealBrowserRequired:['Microsoft Edge actual binary','macOS Safari','iPhone Safari'],note:'Edge/Safari rows are UA/compatibility emulation on Chromium and are intentionally not labeled as real-engine acceptance.'};
await mkdir(path.join(root,'reports'),{recursive:true});await writeFile(path.join(root,'reports/v31-rc2-browser.json'),JSON.stringify(report,null,2)+'\n');console.log('V3.1 RC2 Browser PASS：干净环境先构建 001/002，再执行 Chromium 实际引擎 + Edge/iPhone Safari UA 兼容模拟；真实 Edge/Safari 保留为 Final 外部 Gate。');
