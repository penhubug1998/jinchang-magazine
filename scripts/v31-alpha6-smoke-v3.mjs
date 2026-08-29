import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const root=process.cwd();
const assert=(c,m)=>{if(!c)throw new Error(m)};
const pkg=JSON.parse(await readFile('package.json','utf8'));
assert(['3.1.0-alpha.6','3.1.0-alpha.7','3.1.0-alpha.8','3.1.0-alpha.9','3.1.0-alpha.10','3.1.0-alpha.11','3.1.0-alpha.12','3.1.0-alpha.13','3.1.0-alpha.14','3.1.0-alpha.15','3.1.0-alpha.16','3.1.0-alpha.17','3.1.0-alpha.18','3.1.0-alpha.19'].includes(pkg.version),`V3.1 alpha6 版本错误：${pkg.version}`);
assert(['3.1-alpha6','3.1-alpha7','3.1-alpha8','3.1-alpha9','3.1-alpha10','3.1-alpha11','3.1-alpha12','3.1-alpha13','3.1-alpha14','3.1-alpha15','3.1-alpha16','3.1-alpha17','3.1-alpha18','3.1-alpha19'].includes(pkg.v31SchemaVersion),`V3.1 alpha6 schema 版本错误：${pkg.v31SchemaVersion}`);
assert(pkg.v3StableVersion==='3.0.0','V3.0.0 稳定发布锁未保留');
const schema=JSON.parse(await readFile('baselines/v3-schema-3.1-alpha6.json','utf8'));
assert(schema.editorialPlanning?.storedOutsideIssueJson===true,'Alpha6 整刊计划必须存储在 issue.json 之外');
assert(schema.editorialPlanning?.maxEntries===120&&schema.editorialPlanning?.maxPagesPerEntry===8,'Alpha6 整刊计划边界异常');
assert(schema.editorialPlanning?.storesBodyContent===false&&schema.editorialPlanning?.storesMediaBindings===false&&schema.editorialPlanning?.storesArticleBindings===false,'Alpha6 整刊计划不得保存正文/媒体/文章绑定');
assert(schema.batchSkeletonGeneration?.requiresExplicitConfirmation===true&&schema.batchSkeletonGeneration?.generatesOnlyMissingTargets===true,'Alpha6 批量页面骨架必须显式确认且只补缺失页');
assert(schema.batchSkeletonGeneration?.doesNotInjectEditorialIds===true&&schema.batchSkeletonGeneration?.doesNotAutoPublish===true,'Alpha6 编排信息不得注入成刊或自动发布');
assert(schema.editorialAdvice?.execution==='local-deterministic'&&schema.editorialAdvice?.autoMutation===false,'Alpha6 编排建议必须本地确定性且不自动修改');
assert(schema.editorialAdvice?.interpretation==='advisory-not-release-gate','Alpha6 编排建议不得替代正式门禁');
assert(schema.evidenceBinding?.developmentSmokeCannotSatisfyFinalGate===true,'Alpha6 开发 smoke 不得满足正式门禁');

const [studio,html,css,server]=await Promise.all(['src/studio/studio.js','src/studio/index.html','src/studio/studio.css','scripts/studio-v3.mjs'].map(f=>readFile(f,'utf8')));
for(const token of ['openEditorialPlan','loadEditorialPlan','saveEditorialPlan','analyzeEditorialPlan','editorialEntriesFromIssue','generateEditorialMissingPages','buildEditorialPage'])assert(studio.includes(token),`Studio Alpha6 缺少 ${token}`);
for(const id of ['editorialPlanBtn','editorialPlanDialog','editorialReferenceIssue','editorialPlanMetrics','editorialPlanInsights','editorialPlanList','editorialGeneratePages'])assert(html.includes(`id="${id}"`),`Studio Alpha6 UI 缺少 ${id}`);
assert(css.includes('V3.1-alpha6 · issue editorial planner'),'Studio Alpha6 样式缺失');
for(const token of ['editorial-plan','.v3-editorial-plans','sanitizeEditorialPlan','EDITORIAL_PLAN_LIMIT','V3_EDITORIAL_PLAN_DIR'])assert(server.includes(token),`Studio API Alpha6 缺少 ${token}`);

const lock=JSON.parse(await readFile('baselines/v3.0-final-gate-lock-alpha6.json','utf8'));
assert(lock.stableVersion==='3.0.0','Alpha6 正式门禁锁稳定版本异常');
assert(lock.parentOverlaySha256==='5345d592c55c39f7385747799534347e38afcb1f775264fdef653969677f81c5','Alpha6 父基线 SHA256 未绑定到已验收 Alpha5');
for(const [file,expected] of Object.entries(lock.files||{})){
  const actual=crypto.createHash('sha256').update(await readFile(file)).digest('hex');
  assert(actual===expected,`V3.0 正式门禁关键文件被 Alpha6 改动：${file}`);
}

async function freePort(){return await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tmp=await mkdtemp(path.join(os.tmpdir(),'jinchang-v31a6-')),planDir=path.join(tmp,'plans'),port=await freePort();
const beforeIssue=crypto.createHash('sha256').update(await readFile('issues/001/issue.json')).digest('hex');
const child=spawn(process.execPath,['scripts/studio-v3.mjs','--host','127.0.0.1','--port',String(port)],{cwd:root,env:{...process.env,V3_EDITORIAL_PLAN_DIR:planDir},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);const base=`http://127.0.0.1:${port}`;
try{
  let health=null;for(let i=0;i<120;i++){try{const r=await fetch(`${base}/api/health`);if(r.ok){health=await r.json();break}}catch{}await sleep(50)}
  assert(health?.ok&&['3.1.0-alpha.6','3.1.0-alpha.7','3.1.0-alpha.8','3.1.0-alpha.9','3.1.0-alpha.10','3.1.0-alpha.11','3.1.0-alpha.12','3.1.0-alpha.13','3.1.0-alpha.14','3.1.0-alpha.15','3.1.0-alpha.16','3.1.0-alpha.17','3.1.0-alpha.18','3.1.0-alpha.19'].includes(health.version),`Alpha6 Studio health 异常：${logs}`);
  let r=await fetch(`${base}/api/editorial-plan/001`),j=await r.json();assert(r.ok&&j.issueId==='001'&&Array.isArray(j.entries)&&j.entries.length===0,'Alpha6 整刊计划初始状态异常');
  const valid={issueId:'001',title:'第三期制作计划',entries:[{title:'理论学习专题',section:'理论学习',pageType:'theory',pages:2,layoutPreset:'two-balanced',status:'planned',notes:'等待最终稿'},{title:'夏季健康提示',section:'时令养生',pageType:'health',pages:1,layoutPreset:'single-focus',status:'hold',notes:''}]};
  r=await fetch(`${base}/api/editorial-plan/001`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(valid)});j=await r.json();assert(r.ok&&j.entries.length===2&&j.entries[0].id&&j.entries[0].pages===2,'Alpha6 整刊计划保存失败');
  assert(!JSON.stringify(j).includes('assets/')&&!JSON.stringify(j).includes('articleId'),'Alpha6 整刊计划意外携带媒体或文章绑定');
  r=await fetch(`${base}/api/editorial-plan/001`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...valid,entries:[{...valid.entries[0],content:'不应保存正文'}]})});assert(r.status===400,'Alpha6 服务端必须拒绝正文等未知计划字段');
  r=await fetch(`${base}/api/editorial-plan/001`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...valid,entries:[{...valid.entries[0],pages:9}]})});assert(r.status===400,'Alpha6 服务端必须拒绝单项超过 8 页');
  r=await fetch(`${base}/api/editorial-plan/001`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...valid,entries:[{...valid.entries[0],pageType:'cover'}]})});assert(r.status===400,'Alpha6 服务端必须拒绝结构页类型作为计划稿件');
  r=await fetch(`${base}/api/editorial-plan/001`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...valid,issueId:'002'})});assert(r.status===400,'Alpha6 服务端必须拒绝跨期 issueId 污染');
  r=await fetch(`${base}/api/editorial-plan/001`);j=await r.json();assert(j.entries.length===2&&j.title==='第三期制作计划','Alpha6 整刊计划读取异常');
  r=await fetch(`${base}/api/editorial-plan/001`,{method:'DELETE'});assert(r.ok,'Alpha6 整刊计划删除失败');
  r=await fetch(`${base}/api/editorial-plan/001`);j=await r.json();assert(j.entries.length===0,'Alpha6 整刊计划删除后仍残留');
}finally{child.kill('SIGTERM');await sleep(180);await rm(tmp,{recursive:true,force:true});}
const afterIssue=crypto.createHash('sha256').update(await readFile('issues/001/issue.json')).digest('hex');assert(beforeIssue===afterIssue,'Alpha6 整刊计划 API 不得修改 issue.json');
const digest=crypto.createHash('sha256').update(JSON.stringify(schema)).digest('hex').slice(0,16);
console.log(`V3.1-alpha6 smoke 通过：整刊计划 sidecar/服务端边界、参考与批量骨架入口、本地编排建议、issue.json 隔离及 V3.0 证据绑定均正常。schema=${digest}`);
