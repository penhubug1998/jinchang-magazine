import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const root=process.cwd();
const assert=(c,m)=>{if(!c)throw new Error(m)};
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const pkg=JSON.parse(await readFile('package.json','utf8'));
assert(['3.1.0-alpha.10','3.1.0-alpha.11','3.1.0-alpha.12','3.1.0-alpha.13','3.1.0-alpha.14','3.1.0-alpha.15','3.1.0-alpha.16','3.1.0-alpha.17','3.1.0-alpha.18','3.1.0-alpha.19'].includes(pkg.version),`V3.1 alpha10 回归不支持当前版本：${pkg.version}`);
assert(['3.1-alpha10','3.1-alpha11','3.1-alpha12','3.1-alpha13','3.1-alpha14','3.1-alpha15','3.1-alpha16','3.1-alpha17','3.1-alpha18','3.1-alpha19'].includes(pkg.v31SchemaVersion),`V3.1 alpha10 回归不支持当前 schema：${pkg.v31SchemaVersion}`);
assert(pkg.v3StableVersion==='3.0.0','V3.0.0 稳定发布锁未保留');
const schemaText=await readFile('baselines/v3-schema-3.1-alpha10.json','utf8'),schema=JSON.parse(schemaText),digest=sha(schemaText).slice(0,16);
assert(schema.handoffBaseline?.usesExistingSnapshotEngine===true&&schema.handoffBaseline?.requiresSavedIssueBeforeHandoff===true,'Alpha10 必须复用 snapshot 并要求交接前保存');
assert(schema.handoffBaseline?.baselineStoresIssueSha256===true&&schema.handoffBaseline?.snapshotReadApi==='read-only-current-issue-snapshot','Alpha10 基线必须绑定 issue SHA 与只读读取 API');
assert(schema.reviewDiff?.explicitReviewRequiredBeforeAcceptance===true&&schema.reviewDiff?.reviewInvalidatesWhenIssueFingerprintChanges===true,'Alpha10 必须显式核对且制作稿变化后失效');
assert(schema.handoffIsolation?.writesIssueJson===false&&schema.handoffIsolation?.writesIssueStatus===false&&schema.handoffIsolation?.writesFinalEvidence===false,'Alpha10 复核基线不得污染成刊或正式证据');
assert(schema.evidenceBinding?.verifiedParentOverlaySha256==='d9f0fd54790b50571f7583be2acf877e7da8323f9a350970d2aa58b77c519db6','Alpha10 父基线未绑定已验收 Alpha9');

const [studio,html,css,server,history]=await Promise.all(['src/studio/studio.js','src/studio/index.html','src/studio/studio.css','scripts/studio-v3.mjs','scripts/lib-v3-history.mjs'].map(f=>readFile(f,'utf8')));
for(const token of ['openReviewHandoffDiff','renderReviewHandoffDiff','markReviewHandoffDiffReviewed','reviewHandoffDiffReviewState','reviewIssueFingerprint'])assert(studio.includes(token),`Studio Alpha10 缺少 ${token}`);
for(const id of ['reviewHandoffDiffState','reviewHandoffDiffMetrics','reviewHandoffDiffList','reviewHandoffDiffConfirm'])assert(html.includes(`id="${id}"`),`Studio Alpha10 UI 缺少 ${id}`);
assert(html.includes('V3.1 alpha10 · 交接基线 / 复核差异')||html.includes('V3.1 alpha11 · 沉浸式工作区 / 双屏编辑')||html.includes('V3.1 alpha12 · 整期结构快速导入')||(html.includes('V3.1 alpha13 · 动态板块语义识别')||(html.includes('V3.1 alpha15 · 所见即所得工作区 / 制作中心瘦身')||(html.includes('V3.1 alpha16 · 媒体直编 / 多窗口同步 / 版面健康')||(html.includes('V3.1 alpha17 · Reader 最大化 / 页面控制台')||html.includes('V3.1 alpha18 · 交互修复 / 页面同步 / 移动增强'))))),'Studio Alpha10/Alpha11 标识缺失');
assert(css.includes('V3.1-alpha10 · handoff baseline / review diff'),'Studio Alpha10 样式缺失');
assert(server.includes('readSnapshotIssue')&&server.includes("seg[5]==='issue'"),'Studio Alpha10 只读快照 API 缺失');
assert(history.includes('V3_SNAPSHOT_ROOT')&&history.includes('readSnapshotIssue'),'Alpha10 snapshot 隔离/读取能力缺失');

const lock=JSON.parse(await readFile('baselines/v3.0-final-gate-lock-alpha10.json','utf8'));
assert(lock.stableVersion==='3.0.0','Alpha10 正式门禁锁稳定版本异常');
assert(lock.parentOverlaySha256==='d9f0fd54790b50571f7583be2acf877e7da8323f9a350970d2aa58b77c519db6','Alpha10 门禁锁父基线错误');
for(const [file,expected] of Object.entries(lock.files||{}))assert(sha(await readFile(file))===expected,`V3.0 正式门禁关键文件被 Alpha10 改动：${file}`);

function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.unref();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})}
const port=await freePort(),tmp=await mkdtemp(path.join(os.tmpdir(),'jinchang-v31a10-')),logs=[];
const child=spawn(process.execPath,['scripts/studio-v3.mjs','--host','127.0.0.1','--port',String(port)],{cwd:root,env:{...process.env,V3_REVIEW_HANDOFF_DIR:path.join(tmp,'handoffs'),V3_REVIEW_WORKSPACE_DIR:path.join(tmp,'reviews'),V3_SNAPSHOT_ROOT:path.join(tmp,'snapshots')},stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>logs.push(d.toString()));child.stderr.on('data',d=>logs.push(d.toString()));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(url){for(let i=0;i<120;i++){try{const r=await fetch(url);if(r.ok)return r}catch{}await sleep(50)}throw new Error(`Studio 未就绪：${logs.join('')}`)}
try{
  const health=await (await wait(`http://127.0.0.1:${port}/api/health`)).json();assert(health.ok&&['3.1.0-alpha.10','3.1.0-alpha.11','3.1.0-alpha.12','3.1.0-alpha.13','3.1.0-alpha.14','3.1.0-alpha.15','3.1.0-alpha.16','3.1.0-alpha.17','3.1.0-alpha.18','3.1.0-alpha.19'].includes(health.version),`Alpha10 Studio health 异常：${JSON.stringify(health)}`);
  const issueRaw=await readFile('issues/001/issue.json','utf8'),beforeHash=sha(issueRaw),before=JSON.parse(issueRaw),beforeStatus=before.status;
  let r=await fetch(`http://127.0.0.1:${port}/api/issues/001/snapshot`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({label:'review-handoff-round-1'})}),snap=await r.json();assert(r.status===201&&snap.id&&snap.files?.some(x=>x.name==='issue.json'),'Alpha10 交接基线快照创建失败');
  const issueMeta=snap.files.find(x=>x.name==='issue.json');assert(issueMeta.sha256===beforeHash,'Alpha10 交接基线 SHA 未绑定当前 issue.json');
  r=await fetch(`http://127.0.0.1:${port}/api/issues/001/snapshots/${encodeURIComponent(snap.id)}/issue`);let j=await r.json();assert(r.ok&&j.manifest?.id===snap.id&&j.issue?.id==='001'&&j.issue.pages?.length===18,'Alpha10 只读快照 issue API 异常');
  r=await fetch(`http://127.0.0.1:${port}/api/issues/002/snapshots/${encodeURIComponent(snap.id)}/issue`);assert(r.status===404,'Alpha10 不得跨期读取其他期号快照');
  const now=new Date().toISOString(),valid={version:1,issueId:'001',handoffs:[{id:'alpha10-round-1',round:1,title:'第一轮内部校审交接',recipient:'复核编辑',role:'reviewer',status:'handed_off',note:'重点核对版本变化。',decisionNote:'',requiredItems:[],baselineSnapshot:{id:snap.id,createdAt:snap.createdAt,issueSha256:issueMeta.sha256},diffReviewedAt:now,diffReviewedFingerprint:'deadbeef',createdAt:now,updatedAt:now,handedOffAt:now,acceptedAt:null,returnedAt:null}]};
  r=await fetch(`http://127.0.0.1:${port}/api/issues/001/review-handoffs`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(valid)});j=await r.json();assert(r.ok&&j.handoffs[0].baselineSnapshot?.id===snap.id&&j.handoffs[0].diffReviewedFingerprint==='deadbeef','Alpha10 handoff baseline/diff 字段保存失败');
  const bads=[
    {...valid,handoffs:[{...valid.handoffs[0],baselineSnapshot:{...valid.handoffs[0].baselineSnapshot,id:'../escape'}}]},
    {...valid,handoffs:[{...valid.handoffs[0],diffReviewedFingerprint:'not-a-fingerprint'}]},
    {...valid,releaseReady:true},
    {...valid,issueId:'002'}
  ];
  for(const payload of bads){r=await fetch(`http://127.0.0.1:${port}/api/issues/001/review-handoffs`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});assert(r.status===400,'Alpha10 服务端边界未拒绝非法交接基线数据');}
  const afterRaw=await readFile('issues/001/issue.json','utf8'),afterHash=sha(afterRaw),after=JSON.parse(afterRaw);assert(afterHash===beforeHash&&after.status===beforeStatus,'Alpha10 快照/交接 sidecar 不应修改 issue.json 或 issue.status');
  r=await fetch(`http://127.0.0.1:${port}/api/issues/001/review-handoffs`,{method:'DELETE'});assert(r.ok,'Alpha10 测试 handoff sidecar 清理失败');
}finally{child.kill('SIGTERM');await sleep(200);await rm(tmp,{recursive:true,force:true}).catch(()=>{})}
console.log(`V3.1-alpha10 smoke 通过：交接基线快照、只读 snapshot issue API、差异核对字段边界、issue.json/issue.status 隔离及 V3.0 证据绑定均正常。schema=${digest}`);
