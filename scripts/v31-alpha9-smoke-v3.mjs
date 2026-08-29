import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const root=process.cwd();
const assert=(c,m)=>{if(!c)throw new Error(m)};
const pkg=JSON.parse(await readFile('package.json','utf8'));
assert(['3.1.0-alpha.9','3.1.0-alpha.10','3.1.0-alpha.11','3.1.0-alpha.12','3.1.0-alpha.13','3.1.0-alpha.14','3.1.0-alpha.15','3.1.0-alpha.16','3.1.0-alpha.17','3.1.0-alpha.18','3.1.0-alpha.19'].includes(pkg.version),`V3.1 alpha9 版本错误：${pkg.version}`);
assert(['3.1-alpha9','3.1-alpha10','3.1-alpha11','3.1-alpha12','3.1-alpha13','3.1-alpha14','3.1-alpha15','3.1-alpha16','3.1-alpha17','3.1-alpha18','3.1-alpha19'].includes(pkg.v31SchemaVersion),`V3.1 alpha9 schema 版本错误：${pkg.v31SchemaVersion}`);
assert(pkg.v3StableVersion==='3.0.0','V3.0.0 稳定发布锁未保留');
const schemaText=await readFile('baselines/v3-schema-3.1-alpha9.json','utf8'),schema=JSON.parse(schemaText),digest=crypto.createHash('sha256').update(schemaText).digest('hex').slice(0,16);
assert(schema.reviewHandoff?.storedOutsideIssueJson===true&&schema.reviewHandoff?.readerRuntimeDependency===false,'Alpha9 交接记录必须与 issue.json / Reader 隔离');
assert(schema.reviewHandoff?.statuses?.join(',')==='draft,handed_off,accepted,returned','Alpha9 交接状态定义异常');
assert(schema.reviewHandoff?.requiredItemsSnapshot===true&&schema.reviewHandoff?.acceptanceRequiresExplicitReviewedState===true,'Alpha9 必须快照未结问题且显式复核后才能签收');
assert(schema.reviewHandoff?.deletedOrHeldItemDoesNotCountAsResolved===true,'Alpha9 删除/暂缓问题不得自动视为解决');
assert(schema.handoffIsolation?.writesIssueJson===false&&schema.handoffIsolation?.writesIssueStatus===false&&schema.handoffIsolation?.autoPublishes===false&&schema.handoffIsolation?.writesFinalEvidence===false,'Alpha9 交接不得写成刊/发布/正式证据');
assert(schema.evidenceBinding?.verifiedParentOverlaySha256==='6b4d0458148544afb98001283226c03c9be85c0d1a262cfe2d6df4030fbae832','Alpha9 父基线未绑定到已验收 Alpha8');

const [studio,html,css,server]=await Promise.all(['src/studio/studio.js','src/studio/index.html','src/studio/studio.css','scripts/studio-v3.mjs'].map(f=>readFile(f,'utf8')));
for(const token of ['openReviewHandoffs','loadReviewHandoffs','saveReviewHandoffs','createReviewHandoff','reviewHandoffAnalysis','reviewHandoffEntryAnalysis','reviewHandoffSummaryText','updateReviewHandoffStatus'])assert(studio.includes(token),`Studio Alpha9 缺少 ${token}`);
for(const id of ['reviewHandoffBtn','reviewHandoffDialog','reviewHandoffMetrics','handoffRecipient','createReviewHandoff','reviewHandoffCurrent','reviewHandoffList','saveReviewHandoffs'])assert(html.includes(`id="${id}"`),`Studio Alpha9 UI 缺少 ${id}`);
assert((html.includes('V3.1 alpha9 · 校审轮次 / 交接签收')||html.includes('V3.1 alpha10 · 交接基线 / 复核差异')||html.includes('V3.1 alpha11 · 沉浸式工作区 / 双屏编辑')||html.includes('V3.1 alpha12 · 整期结构快速导入')||(html.includes('V3.1 alpha13 · 动态板块语义识别')||(html.includes('V3.1 alpha15 · 所见即所得工作区 / 制作中心瘦身')||(html.includes('V3.1 alpha16 · 媒体直编 / 多窗口同步 / 版面健康')||(html.includes('V3.1 alpha17 · Reader 最大化 / 页面控制台')||html.includes('V3.1 alpha18 · 交互修复 / 页面同步 / 移动增强')))))),'Studio Alpha9/Alpha10 标识缺失');
assert(css.includes('V3.1-alpha9 · review rounds / handoff acceptance'),'Studio Alpha9 样式缺失');
for(const token of ['review-handoffs','.v3-review-handoffs','sanitizeReviewHandoffs','REVIEW_HANDOFF_LIMIT','V3_REVIEW_HANDOFF_DIR'])assert(server.includes(token),`Studio API Alpha9 缺少 ${token}`);

const lock=JSON.parse(await readFile('baselines/v3.0-final-gate-lock-alpha9.json','utf8'));
assert(lock.stableVersion==='3.0.0','Alpha9 正式门禁锁稳定版本异常');
assert(lock.parentOverlaySha256==='6b4d0458148544afb98001283226c03c9be85c0d1a262cfe2d6df4030fbae832','Alpha9 门禁锁父基线错误');
for(const [file,expected] of Object.entries(lock.files||{})){
  const actual=crypto.createHash('sha256').update(await readFile(file)).digest('hex');
  assert(actual===expected,`V3.0 正式门禁关键文件被 Alpha9 改动：${file}`);
}

function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.unref();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})}
const port=await freePort(),tmp=await mkdtemp(path.join(os.tmpdir(),'jinchang-v31a9-')),logs=[];
const child=spawn(process.execPath,['scripts/studio-v3.mjs','--host','127.0.0.1','--port',String(port)],{cwd:root,env:{...process.env,V3_REVIEW_HANDOFF_DIR:path.join(tmp,'handoffs'),V3_REVIEW_WORKSPACE_DIR:path.join(tmp,'reviews')},stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>logs.push(d.toString()));child.stderr.on('data',d=>logs.push(d.toString()));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(url){for(let i=0;i<120;i++){try{const r=await fetch(url);if(r.ok)return r}catch{}await sleep(50)}throw new Error(`Studio 未就绪：${logs.join('')}`)}
try{
  const health=await (await wait(`http://127.0.0.1:${port}/api/health`)).json();assert(health.ok&&['3.1.0-alpha.9','3.1.0-alpha.10','3.1.0-alpha.11','3.1.0-alpha.12','3.1.0-alpha.13','3.1.0-alpha.14','3.1.0-alpha.15','3.1.0-alpha.16','3.1.0-alpha.17','3.1.0-alpha.18','3.1.0-alpha.19'].includes(health.version),`Alpha9 Studio health 异常：${JSON.stringify(health)}`);
  const issueRaw=await readFile('issues/001/issue.json','utf8'),beforeHash=crypto.createHash('sha256').update(issueRaw).digest('hex'),before=JSON.parse(issueRaw),beforeStatus=before.status;
  let r=await fetch(`http://127.0.0.1:${port}/api/issues/001/review-handoffs`),j=await r.json();assert(r.ok&&j.issueId==='001'&&Array.isArray(j.handoffs)&&j.handoffs.length===0,'Alpha9 交接记录初始状态异常');
  const now=new Date().toISOString(),valid={version:1,issueId:'001',handoffs:[{id:'alpha9-round-1',round:1,title:'第一轮内部校审交接',recipient:'复核编辑',role:'reviewer',status:'handed_off',note:'重点检查图片说明。',decisionNote:'',requiredItems:[{id:'review-a',title:'图片替代文字待复核',page:3,severity:'important'},{id:'review-b',title:'标题来源待复核',page:5,severity:'normal'}],createdAt:now,updatedAt:now,handedOffAt:now,acceptedAt:null,returnedAt:null}]};
  r=await fetch(`http://127.0.0.1:${port}/api/issues/001/review-handoffs`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(valid)});j=await r.json();assert(r.ok&&j.handoffs.length===1&&j.handoffs[0].requiredItems.length===2&&j.handoffs[0].status==='handed_off','Alpha9 交接记录保存失败');
  r=await fetch(`http://127.0.0.1:${port}/api/issues/001/review-handoffs`);j=await r.json();assert(j.handoffs[0].recipient==='复核编辑'&&j.handoffs[0].round===1,'Alpha9 交接记录读取异常');
  r=await fetch(`http://127.0.0.1:${port}/api/issues/001/review-handoffs`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...valid,releaseReady:true})});assert(r.status===400,'Alpha9 服务端必须拒绝伪造 releaseReady 字段');
  r=await fetch(`http://127.0.0.1:${port}/api/issues/001/review-handoffs`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...valid,issueStatus:'published'})});assert(r.status===400,'Alpha9 服务端必须拒绝 issueStatus 字段');
  r=await fetch(`http://127.0.0.1:${port}/api/issues/001/review-handoffs`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...valid,handoffs:[{...valid.handoffs[0],requiredItems:[{id:'bad',title:'越界页码',page:201,severity:'normal'}]}]})});assert(r.status===400,'Alpha9 服务端必须拒绝快照越界页码');
  r=await fetch(`http://127.0.0.1:${port}/api/issues/001/review-handoffs`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...valid,handoffs:[valid.handoffs[0],{...valid.handoffs[0],id:'alpha9-round-2'}]})});assert(r.status===400,'Alpha9 服务端必须拒绝重复交接轮次');
  r=await fetch(`http://127.0.0.1:${port}/api/issues/001/review-handoffs`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...valid,issueId:'002'})});assert(r.status===400,'Alpha9 服务端必须拒绝跨期 issueId 污染');
  const afterRaw=await readFile('issues/001/issue.json','utf8'),afterHash=crypto.createHash('sha256').update(afterRaw).digest('hex'),after=JSON.parse(afterRaw);assert(afterHash===beforeHash&&after.status===beforeStatus,'Alpha9 交接 sidecar 不应修改 issue.json 或 issue.status');
  r=await fetch(`http://127.0.0.1:${port}/api/issues/001/review-handoffs`,{method:'DELETE'});assert(r.ok,'Alpha9 测试交接 sidecar 清理失败');
}finally{child.kill('SIGTERM');await sleep(180);await rm(tmp,{recursive:true,force:true}).catch(()=>{})}
console.log(`V3.1-alpha9 smoke 通过：校审交接 sidecar/服务端边界、未结问题快照、issue.json/issue.status 隔离及 V3.0 证据绑定均正常。schema=${digest}`);
