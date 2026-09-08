import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const root=process.cwd();
const assert=(c,m)=>{if(!c)throw new Error(m)};
const pkg=JSON.parse(await readFile('package.json','utf8'));
assert(['3.1.0-alpha.8','3.1.0-alpha.9','3.1.0-alpha.10','3.1.0-alpha.11','3.1.0-alpha.12','3.1.0-alpha.13','3.1.0-alpha.14','3.1.0-alpha.15','3.1.0-alpha.16','3.1.0-alpha.17','3.1.0-alpha.18','3.1.0-alpha.19','3.1.0'].includes(pkg.version),`V3.1 alpha8 版本错误：${pkg.version}`);
assert(['3.1-alpha8','3.1-alpha9','3.1-alpha10','3.1-alpha11','3.1-alpha12','3.1-alpha13','3.1-alpha14','3.1-alpha15','3.1-alpha16','3.1-alpha17','3.1-alpha18','3.1-alpha19','3.1-alpha24'].includes(pkg.v31SchemaVersion),`V3.1 alpha8 schema 版本错误：${pkg.v31SchemaVersion}`);
assert(pkg.v3StableVersion==='3.0.0','V3.0.0 稳定发布锁未保留');
const schemaText=await readFile('baselines/v3-schema-3.1-alpha8.json','utf8'),schema=JSON.parse(schemaText),digest=crypto.createHash('sha256').update(schemaText).digest('hex').slice(0,16);
assert(schema.internalReviewWorkspace?.storedOutsideIssueJson===true&&schema.internalReviewWorkspace?.readerRuntimeDependency===false,'Alpha8 内部校审必须与 issue.json / Reader 隔离');
assert(schema.internalReviewWorkspace?.statuses?.join(',')==='open,reviewed,hold','Alpha8 校审状态定义异常');
assert(schema.auditBridge?.existingAuditFindingsReadOnly===true&&schema.auditBridge?.canPromoteFindingToManualReview===true,'Alpha8 自动审计桥接能力缺失');
assert(schema.auditBridge?.automaticFindingPersistence===false&&schema.auditBridge?.strictAuditGateSemanticsUnchanged===true,'Alpha8 不得自动持久化审计 finding 或改变严格审计语义');
assert(schema.reviewIsolation?.writesIssueJson===false&&schema.reviewIsolation?.writesIssueStatus===false&&schema.reviewIsolation?.autoPublishes===false&&schema.reviewIsolation?.writesFinalEvidence===false,'Alpha8 校审不得写成刊/发布/正式证据');
assert(schema.reviewIsolation?.interpretation==='editorial-sidecar-only-not-release-gate','Alpha8 内部校审不得替代正式门禁');
assert(schema.evidenceBinding?.verifiedParentOverlaySha256==='110906fa3ef3360b93afbcc7cb5d88e0c0bd4f54a2494bf035158ea50a5a4569','Alpha8 父基线未绑定到已验收 Alpha7');

const [studio,html,css,server]=await Promise.all(['src/studio/studio.js','src/studio/index.html','src/studio/studio.css','scripts/studio-v3.mjs'].map(f=>readFile(f,'utf8')));
for(const token of ['openReviewWorkspace','loadReviewWorkspace','saveReviewWorkspace','reviewWorkspaceAnalysis','importAuditReviewFinding','runReviewAudit','reviewAuditKey','locateReviewItem'])assert(studio.includes(token),`Studio Alpha8 缺少 ${token}`);
for(const id of ['reviewWorkspaceFromAudit','reviewWorkspaceDialog','reviewWorkspaceMetrics','reviewAuditFindings','reviewWorkspaceList','reviewRunAudit','reviewAddManual','reviewSaveWorkspace'])assert(html.includes(`id="${id}"`),`Studio Alpha8 UI 缺少 ${id}`);
assert(html.includes('id="studioVersionLabel"')&&html.includes('runtime version is resolved from /api/health'),'Studio runtime version marker missing');
assert(css.includes('V3.1-alpha8 · internal editorial review workspace'),'Studio Alpha8 样式缺失');
for(const token of ['review-workspace','.v3-review-workspaces','sanitizeReviewWorkspace','REVIEW_WORKSPACE_LIMIT','V3_REVIEW_WORKSPACE_DIR'])assert(server.includes(token),`Studio API Alpha8 缺少 ${token}`);

const lock=JSON.parse(await readFile('baselines/v3.0-final-gate-lock-alpha8.json','utf8'));
assert(lock.stableVersion==='3.0.0','Alpha8 正式门禁锁稳定版本异常');
assert(lock.parentOverlaySha256==='110906fa3ef3360b93afbcc7cb5d88e0c0bd4f54a2494bf035158ea50a5a4569','Alpha8 门禁锁父基线错误');
for(const [file,expected] of Object.entries(lock.files||{})){
  const actual=crypto.createHash('sha256').update(await readFile(file)).digest('hex');
  assert(actual===expected,`V3.0 正式门禁关键文件被 Alpha8 改动：${file}`);
}

function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.unref();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})}
const port=await freePort(),tmp=await mkdtemp(path.join(os.tmpdir(),'jinchang-v31a8-')),logs=[];
const child=spawn(process.execPath,['scripts/studio-v3.mjs','--host','127.0.0.1','--port',String(port)],{cwd:root,env:{...process.env,V3_REVIEW_WORKSPACE_DIR:path.join(tmp,'reviews')},stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>logs.push(d.toString()));child.stderr.on('data',d=>logs.push(d.toString()));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(url){for(let i=0;i<120;i++){try{const r=await fetch(url);if(r.ok)return r}catch{}await sleep(50)}throw new Error(`Studio 未就绪：${logs.join('')}`)}
try{
  const health=await (await wait(`http://127.0.0.1:${port}/api/health`)).json();assert(health.ok&&(health?.version===pkg.version),`Alpha8 Studio health 异常：${JSON.stringify(health)}`);
  const issueRaw=await readFile('issues/001/issue.json','utf8'),beforeHash=crypto.createHash('sha256').update(issueRaw).digest('hex'),before=JSON.parse(issueRaw),beforeStatus=before.status;
  let r=await fetch(`http://127.0.0.1:${port}/api/issues/001/review-workspace`),j=await r.json();assert(r.ok&&j.issueId==='001'&&Array.isArray(j.items)&&j.items.length===0,'Alpha8 内部校审初始状态异常');
  const valid={version:1,issueId:'001',items:[{id:'alpha8-audit',title:'图片替代文字待复核',category:'accessibility',severity:'important',status:'open',page:3,note:'来自自动审计，等待人工确认。',source:'audit',auditKey:'warning|IMAGE_ALT_MISSING|page|3|blocks',auditCode:'IMAGE_ALT_MISSING',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:'alpha8-manual',title:'标题措辞人工复核',category:'人工校审',severity:'normal',status:'reviewed',page:4,note:'已与原稿核对。',source:'manual',auditKey:'',auditCode:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}]};
  r=await fetch(`http://127.0.0.1:${port}/api/issues/001/review-workspace`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(valid)});j=await r.json();assert(r.ok&&j.items.length===2&&j.items[0].status==='open'&&j.items[1].status==='reviewed','Alpha8 内部校审保存失败');
  r=await fetch(`http://127.0.0.1:${port}/api/issues/001/review-workspace`);j=await r.json();assert(j.items.length===2&&j.items[0].source==='audit','Alpha8 内部校审读取异常');
  r=await fetch(`http://127.0.0.1:${port}/api/issues/001/review-workspace`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...valid,items:[{...valid.items[0],releaseReady:true}]})});assert(r.status===400,'Alpha8 服务端必须拒绝伪造 releaseReady 字段');
  r=await fetch(`http://127.0.0.1:${port}/api/issues/001/review-workspace`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...valid,items:[{...valid.items[0],content:'不应进入校审 sidecar'}]})});assert(r.status===400,'Alpha8 服务端必须拒绝正文 content 字段');
  r=await fetch(`http://127.0.0.1:${port}/api/issues/001/review-workspace`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...valid,items:[{...valid.items[0],page:201}]})});assert(r.status===400,'Alpha8 服务端必须拒绝越界页码');
  r=await fetch(`http://127.0.0.1:${port}/api/issues/001/review-workspace`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...valid,issueId:'002'})});assert(r.status===400,'Alpha8 服务端必须拒绝跨期 issueId 污染');
  r=await fetch(`http://127.0.0.1:${port}/api/issues/001/audit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strict:false})});j=await r.json();assert(r.ok&&j.audit&&Array.isArray(j.audit.warnings),'Alpha8 复用现有自动审计失败');
  const afterRaw=await readFile('issues/001/issue.json','utf8'),afterHash=crypto.createHash('sha256').update(afterRaw).digest('hex'),after=JSON.parse(afterRaw);assert(afterHash===beforeHash&&after.status===beforeStatus,'Alpha8 校审 sidecar / 日常审计不应修改 issue.json 或 issue.status');
  r=await fetch(`http://127.0.0.1:${port}/api/issues/001/review-workspace`,{method:'DELETE'});assert(r.ok,'Alpha8 测试校审 sidecar 清理失败');
}finally{child.kill('SIGTERM');await sleep(180);await rm(tmp,{recursive:true,force:true}).catch(()=>{})}
console.log(`V3.1-alpha8 smoke 通过：内部校审 sidecar/服务端边界、自动审计只读桥接、人工问题闭环、issue.json/issue.status 隔离及 V3.0 证据绑定均正常。schema=${digest}`);
