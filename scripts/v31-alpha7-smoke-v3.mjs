import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const root=process.cwd();
const assert=(c,m)=>{if(!c)throw new Error(m)};
const pkg=JSON.parse(await readFile('package.json','utf8'));
assert(['3.1.0-alpha.7','3.1.0-alpha.8','3.1.0-alpha.9','3.1.0-alpha.10','3.1.0-alpha.11','3.1.0-alpha.12','3.1.0-alpha.13','3.1.0-alpha.14','3.1.0-alpha.15','3.1.0-alpha.16','3.1.0-alpha.17','3.1.0-alpha.18','3.1.0-alpha.19'].includes(pkg.version),`V3.1 alpha7 版本错误：${pkg.version}`);
assert(['3.1-alpha7','3.1-alpha8','3.1-alpha9','3.1-alpha10','3.1-alpha11','3.1-alpha12','3.1-alpha13','3.1-alpha14','3.1-alpha15','3.1-alpha16','3.1-alpha17','3.1-alpha18','3.1-alpha19'].includes(pkg.v31SchemaVersion),`V3.1 alpha7 schema 版本错误：${pkg.v31SchemaVersion}`);
assert(pkg.v3StableVersion==='3.0.0','V3.0.0 稳定发布锁未保留');
const schemaText=await readFile('baselines/v3-schema-3.1-alpha7.json','utf8'),schema=JSON.parse(schemaText),digest=crypto.createHash('sha256').update(schemaText).digest('hex').slice(0,16);
assert(schema.productionBoard?.persistedInIssueJson===false&&schema.productionBoard?.persistedAsNewSidecarFields===false,'Alpha7 制作看板不得写入 issue.json 或新增 sidecar 运行时字段');
assert(schema.productionBoard?.localDeterministic===true&&schema.productionBoard?.directPageLocate===true,'Alpha7 制作看板必须本地确定性并支持页面定位');
assert(schema.pageProductionProfile?.stages?.join(',')==='missing,skeleton,content,enriched','Alpha7 页面制作阶段定义异常');
assert(schema.pageProductionProfile?.interpretation==='production-progress-only-not-release-readiness','Alpha7 页面制作画像不得解释为正式发布就绪');
assert(schema.planPageReconciliation?.detectsTitleMatchedStructureDrift===true&&schema.planPageReconciliation?.detectsUnplannedBodyPages===true,'Alpha7 计划—页面核对能力缺失');
assert(schema.statusSuggestions?.requiresExplicitConfirmation===true&&schema.statusSuggestions?.writesIssueStatus===false&&schema.statusSuggestions?.autoPublishes===false,'Alpha7 状态建议不得自动改正式状态或发布');
assert(schema.statusSuggestions?.interpretation==='editorial-sidecar-only-not-release-gate','Alpha7 状态建议不得替代正式门禁');
assert(schema.evidenceBinding?.verifiedParentOverlaySha256==='af4c52aa8844f48ebc8a4cc06aad13ef305f2795d1804bd5074fd36250df14a1','Alpha7 父基线未绑定到已验收 Alpha6');

const [studio,html,css]=await Promise.all(['src/studio/studio.js','src/studio/index.html','src/studio/studio.css'].map(f=>readFile(f,'utf8')));
for(const token of ['editorialPageProductionProfile','editorialProductionForEntry','editorialBoardAnalysis','renderEditorialBoard','locateEditorialProductionPage','applyEditorialStatusSuggestions'])assert(studio.includes(token),`Studio Alpha7 缺少 ${token}`);
for(const id of ['editorialBoardMetrics','editorialBoardFilters','editorialBoardList','editorialBoardOrphans','editorialApplyStatusSuggestions'])assert(html.includes(`id="${id}"`),`Studio Alpha7 UI 缺少 ${id}`);
assert(html.includes('制作看板'),'Studio Alpha7 制作看板入口缺失');
assert(css.includes('V3.1-alpha7 · editorial production board'),'Studio Alpha7 样式缺失');

const lock=JSON.parse(await readFile('baselines/v3.0-final-gate-lock-alpha7.json','utf8'));
assert(lock.stableVersion==='3.0.0','Alpha7 正式门禁锁稳定版本异常');
assert(lock.parentOverlaySha256==='af4c52aa8844f48ebc8a4cc06aad13ef305f2795d1804bd5074fd36250df14a1','Alpha7 门禁锁父基线错误');
for(const [file,expected] of Object.entries(lock.files||{})){
  const actual=crypto.createHash('sha256').update(await readFile(file)).digest('hex');
  assert(actual===expected,`V3.0 正式门禁关键文件被 Alpha7 改动：${file}`);
}

function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.unref();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})}
const port=await freePort(),tmp=await mkdtemp(path.join(os.tmpdir(),'jinchang-v31a7-')),logs=[];
const child=spawn(process.execPath,['scripts/studio-v3.mjs','--host','127.0.0.1','--port',String(port)],{cwd:root,env:{...process.env,V3_EDITORIAL_PLAN_DIR:path.join(tmp,'plans')},stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>logs.push(d.toString()));child.stderr.on('data',d=>logs.push(d.toString()));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(url){for(let i=0;i<100;i++){try{const r=await fetch(url);if(r.ok)return r}catch{}await sleep(50)}throw new Error(`Studio 未就绪：${logs.join('')}`)}
try{
  const health=await (await wait(`http://127.0.0.1:${port}/api/health`)).json();assert(health.ok&&['3.1.0-alpha.7','3.1.0-alpha.8','3.1.0-alpha.9','3.1.0-alpha.10','3.1.0-alpha.11','3.1.0-alpha.12','3.1.0-alpha.13','3.1.0-alpha.14','3.1.0-alpha.15','3.1.0-alpha.16','3.1.0-alpha.17','3.1.0-alpha.18','3.1.0-alpha.19'].includes(health.version),`Alpha7 Studio health 异常：${JSON.stringify(health)}`);
  const before=await (await fetch(`http://127.0.0.1:${port}/api/issues/001`)).json(),beforeStatus=before.status,beforeHash=crypto.createHash('sha256').update(JSON.stringify(before)).digest('hex');
  const valid={version:1,issueId:'001',title:'Alpha7 制作闭环测试',entries:[{id:'alpha7-entry',title:'制作看板测试稿',section:'测试栏目',pageType:'article',pages:1,layoutPreset:'single-focus',status:'planned',notes:'仅 sidecar'}]};
  let r=await fetch(`http://127.0.0.1:${port}/api/editorial-plan/001`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(valid)});assert(r.ok,'Alpha7 继续复用 Alpha6 sidecar 保存失败');
  const saved=await r.json();assert(saved.entries?.[0]?.status==='planned','Alpha7 sidecar 状态保存异常');
  r=await fetch(`http://127.0.0.1:${port}/api/editorial-plan/001`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...valid,entries:[{...valid.entries[0],releaseReady:true}]})});assert(r.status===400,'Alpha7 服务端仍必须拒绝伪造 releaseReady 字段');
  const after=await (await fetch(`http://127.0.0.1:${port}/api/issues/001`)).json(),afterHash=crypto.createHash('sha256').update(JSON.stringify(after)).digest('hex');
  assert(after.status===beforeStatus&&afterHash===beforeHash,'Alpha7 sidecar 操作不应修改 issue.json 或 issue.status');
  r=await fetch(`http://127.0.0.1:${port}/api/editorial-plan/001`,{method:'DELETE'});assert(r.ok,'Alpha7 测试 sidecar 清理失败');
}finally{child.kill('SIGTERM');await sleep(150);await rm(tmp,{recursive:true,force:true}).catch(()=>{})}
console.log(`V3.1-alpha7 smoke 通过：制作看板派生画像、计划—页面漂移/孤页核对、显式状态建议、issue.status 隔离及 V3.0 证据绑定均正常。schema=${digest}`);
