import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { root } from './lib-v3-production.mjs';

const sandbox=path.join(root,'.tmp-v3-final-gates-smoke');
await rm(sandbox,{recursive:true,force:true});
await mkdir(sandbox,{recursive:true});
await writeFile(path.join(sandbox,'package.json'),JSON.stringify({name:'gate-smoke',version:'3.0.0',type:'module'},null,2));
const now=new Date();
const future=new Date(now.getTime()+60_000);
function sha(bytes){return crypto.createHash('sha256').update(bytes).digest('hex')}
async function json(rel,data){const file=path.join(sandbox,rel);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(data,null,2)+'\n')}
async function text(rel,data='x'){const file=path.join(sandbox,rel);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,data);return file}

const issue003={id:'003',engine:'v3',status:'ready',label:'第三期',pages:[{type:'cover',title:'封面',blocks:[]},{type:'article',title:'正文',blocks:[{type:'paragraph',text:'真实稿测试'}]},{type:'closing',title:'尾页',blocks:[]}],assetSource:'issues/003/assets'};
const issueBytes=Buffer.from(JSON.stringify(issue003,null,2)+'\n');
await text('issues/003/issue.json',issueBytes);
await mkdir(path.join(sandbox,'issues/003/assets'),{recursive:true});
for(const id of ['001','002']){await json(`issues/${id}/issue.json`,{id,engine:'v3',pages:[{type:'cover',title:'封面',blocks:[]}],assetSource:`${Number(id)}/assets`});await text(`${Number(id)}/assets/dummy.bin`,'media');}
await json('baselines/v3-rc1-media.json',{source:{commit:'smoke'},issues:{}});
await json('reports/v3-full-media-check.json',{version:'3.0.0',generatedAt:future.toISOString(),strict:true,summary:{errors:0},issues:[{id:'001',baseline:{},actual:{}},{id:'002',baseline:{},actual:{}}]});
await json('reports/v3-rc1-device-acceptance.json',{records:[]});
await json('reports/v3-rc1-third-issue-trial-003.json',{version:'3.0.0',issue:'003',checkedAt:future.toISOString(),confirmedRealMaterial:true,status:'passed',pageCount:3,issueSha256:sha(issueBytes)});
await json('reports/v3-rc1-deployment-rehearsal.json',{version:'3.0.0',status:'passed'});
await json('release-v3/003/integrity.json',{version:'3.0.0',issue:'003',treeSha256:'tree-A'});
await json('reports/v3-rc1-online-verification-003.json',{version:'3.0.0',issue:'003',base:'https://example.test/magazine',ok:true,localTreeSha256:'tree-A',remoteTreeSha256:'tree-A'});

const finalScript=path.join(root,'scripts/final-readiness-v3.mjs');
function run(){const r=spawnSync(process.execPath,[finalScript,'--issue','003'],{cwd:sandbox,encoding:'utf8',env:{...process.env,JINCHANG_MAGAZINE_ROOT:sandbox}});if(r.status!==0)throw new Error(r.stderr||r.stdout);return JSON.parse(requireRead(path.join(sandbox,'reports/v3-final-readiness.json')))}
function requireRead(file){return requireFs.readFileSync(file,'utf8')}
import * as requireFs from 'node:fs';
let report=run();
const by=id=>report.gates.find(x=>x.id===id);
if(by('historical-media')?.status!=='READY')throw new Error('媒体新鲜证据应 READY');
if(by('third-real')?.status!=='READY')throw new Error('第三期源稿匹配时应 READY');
if(by('online')?.status!=='READY')throw new Error('线上 tree 匹配时应 READY');

// Touch a historical media file after the report: the old media PASS must expire.
const mediaFile=path.join(sandbox,'1/assets/dummy.bin');await utimes(mediaFile,new Date(),new Date(future.getTime()+120_000));
report=run();if(report.gates.find(x=>x.id==='historical-media')?.status!=='PENDING')throw new Error('媒体变化后旧 PASS 未失效');

// Restore freshness for media evidence and change the issue source: third-real must expire.
await json('reports/v3-full-media-check.json',{version:'3.0.0',generatedAt:new Date(future.getTime()+180_000).toISOString(),strict:true,summary:{errors:0},issues:[{id:'001',baseline:{},actual:{}},{id:'002',baseline:{},actual:{}}]});
await text('issues/003/issue.json',Buffer.from(JSON.stringify({...issue003,subtitle:'changed'},null,2)+'\n'));
report=run();if(report.gates.find(x=>x.id==='third-real')?.status!=='PENDING')throw new Error('第三期源稿变化后旧 PASS 未失效');

// Change local release tree: the old HTTPS evidence must expire.
await json('release-v3/003/integrity.json',{version:'3.0.0',issue:'003',treeSha256:'tree-B'});
report=run();if(report.gates.find(x=>x.id==='online')?.status!=='PENDING')throw new Error('release tree 变化后旧线上 PASS 未失效');

await rm(sandbox,{recursive:true,force:true});
const gateScript=path.join(root,'scripts/final-gate-v3.mjs');
const gateRun=spawnSync(process.execPath,[gateScript,'media'],{cwd:root,encoding:'utf8'});if(gateRun.status!==0)throw new Error(gateRun.stderr||gateRun.stdout);
const hydration=JSON.parse(await readFile(path.join(root,'reports/v3-rc2-media-hydration.json'),'utf8'));
if(hydration.summary?.expected!==51)throw new Error(`final:gate media 应扫描 51 个历史媒体，实际 ${hydration.summary?.expected}`);
console.log('V3.0.0 final gate smoke 通过：媒体/实材/线上证据变化后旧 PASS 会自动失效，media gate dry-run 覆盖 51 个历史媒体。');
