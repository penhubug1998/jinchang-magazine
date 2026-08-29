import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { root, V3_VERSION } from './lib-v3-production.mjs';
const assert=(c,m)=>{if(!c)throw new Error(m)};
const report={version:V3_VERSION,generatedAt:new Date().toISOString(),issues:{},status:'running'};
function run(script,args=[],timeout=180000){let last;for(let attempt=1;attempt<=3;attempt++){last=spawnSync(process.execPath,[path.join(root,'scripts',script),...args],{cwd:root,encoding:'utf8',timeout,maxBuffer:16*1024*1024});if(last.status===0)return {...last,attempt};if(!String(last.stderr||'').includes('DevTools websocket unavailable'))break;}throw new Error(`${script} ${args.join(' ')} failed\n${last?.stdout||''}\n${last?.stderr||''}`)}
for(const id of ['001','002']){
 const issue=JSON.parse(await readFile(path.join(root,'issues',id,'issue.json'),'utf8'));
 const placeholders=JSON.stringify(issue).match(/请填写|待补充|待完善|TODO|TBD|lorem ipsum/ig)||[];
 assert(placeholders.length===0,`${id} contains placeholders`);
 const blockCount=(issue.pages||[]).reduce((n,p)=>n+(p.blocks||[]).length,0);
 assert(blockCount>20,`${id} block count too low`);
 const browser=run('browser-regression-v3.mjs',['--issue',id,'--mobile-only']);
 report.issues[id]={label:issue.label,pages:issue.pages.length,blocks:blockCount,status:issue.status,mobileReader:'pass',browserAttempt:browser.attempt};
}
report.status='passed';
await mkdir(path.join(root,'reports'),{recursive:true});await writeFile(path.join(root,'reports','v31-rc1-real-content.json'),JSON.stringify(report,null,2)+'\n');
console.log('V3.1 RC1 真实内容验收通过：第一期、第二期真实 issue 数据无占位内容，390×844 Reader 均通过真实 Chromium 回归。');
