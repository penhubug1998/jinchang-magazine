import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';

const root=process.cwd();const sandbox=path.join(root,'.tmp-v3-platform');
const assert=(c,m)=>{if(!c)throw new Error(m)};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function freePort(){return await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})}
function run(script,args=[]){const r=spawnSync(process.execPath,[path.join(sandbox,'scripts',script),...args],{cwd:sandbox,encoding:'utf8'});if(r.status!==0)throw new Error(`${script} failed\n${r.stdout}\n${r.stderr}`);return r.stdout}
await rm(sandbox,{recursive:true,force:true});await mkdir(path.join(sandbox,'scripts'),{recursive:true});await mkdir(path.join(sandbox,'src'),{recursive:true});await mkdir(path.join(sandbox,'issues','001'),{recursive:true});await mkdir(path.join(sandbox,'issues','002'),{recursive:true});
for(const f of ['lib-v3-production.mjs','lib-v3-history.mjs','lib-v3-import.mjs','lib-v3-catalog.mjs','lib-v3-publication.mjs','lib-v3-deploy.mjs','new-issue-v3.mjs','sync-assets-v3.mjs','audit-v3.mjs','studio-v3.mjs','catalog-v3.mjs'])await cp(path.join(root,'scripts',f),path.join(sandbox,'scripts',f));
await cp(path.join(root,'src','studio'),path.join(sandbox,'src','studio'),{recursive:true});
await cp(path.join(root,'src','reader'),path.join(sandbox,'src','reader'),{recursive:true});
await cp(path.join(root,'package.json'),path.join(sandbox,'package.json'));
await writeFile(path.join(sandbox,'issues','001','issue.json'),JSON.stringify({id:'001',label:'第一期',publication:'测试期刊',subtitle:'历史一期',engine:'legacy',legacyPath:'../../1/',status:'published'},null,2));
await writeFile(path.join(sandbox,'issues','002','issue.json'),JSON.stringify({id:'002',label:'第二期',publication:'测试期刊',subtitle:'历史二期',engine:'legacy',legacyPath:'../../2/',status:'published'},null,2));
run('new-issue-v3.mjs',['--subtitle','Alpha13 studio smoke']);
run('catalog-v3.mjs',['--include-drafts']);
const archive=await readFile(path.join(sandbox,'dist-v3','index.html'),'utf8');
assert(archive.includes('Alpha13 studio smoke'),'自动归档首页未包含新期刊');
assert(archive.includes('../1/'),'Legacy 首页链接未归一化为 ../1/');

const port=await freePort();const child=spawn(process.execPath,[path.join(sandbox,'scripts','studio-v3.mjs'),'--port',String(port)],{cwd:sandbox,stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
const base=`http://127.0.0.1:${port}`;
try{
  let ready=false;for(let i=0;i<50;i++){try{const r=await fetch(`${base}/api/health`);if(r.ok){ready=true;break}}catch{}await sleep(60)}assert(ready,`制作中心未启动：${logs}`);
  let issues=await (await fetch(`${base}/api/issues`)).json();assert(issues.some(x=>x.id==='003'),'制作中心未列出 003');
  let issue=await (await fetch(`${base}/api/issues/003`)).json();const original=issue.subtitle;
  const interim=structuredClone(issue);interim.pages[0].title='';let draftRes=await fetch(`${base}/api/issues/003/draft`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({issue:interim})});assert(draftRes.ok,`中间态草稿应允许保存：${await draftRes.text()}`);let draft=await (await fetch(`${base}/api/issues/003/draft`)).json();assert(draft.exists&&draft.issue.pages[0].title==='',`自动草稿恢复数据异常`);let formalInvalid=await fetch(`${base}/api/issues/003`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(interim)});assert(formalInvalid.status===400,'正式保存仍应拒绝缺少页面标题的中间态');await fetch(`${base}/api/issues/003/draft`,{method:'DELETE'});draft=await (await fetch(`${base}/api/issues/003/draft`)).json();assert(!draft.exists,'删除自动草稿失败');
  const auditRes=await fetch(`${base}/api/issues/003/audit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strict:false})});const auditText=await auditRes.text();assert(auditRes.ok,`审计 API 失败：${auditText}`);const auditPayload=JSON.parse(auditText);assert(auditPayload.audit?.warnings?.some(x=>x.location&&x.fix),'审计 API 未返回可定位修复建议');assert(auditPayload.htmlUrl?.includes('v3-release-audit-003.html'),'审计 API 未返回完整报告地址');
  const strictAuditRes=await fetch(`${base}/api/issues/003/audit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strict:true})});const strictText=await strictAuditRes.text();assert(strictAuditRes.ok,`严格审计 API 响应异常：${strictText}`);const strictPayload=JSON.parse(strictText);assert(strictPayload.audit?.blockers?.some(x=>x.code==='STATUS_NOT_READY'),'draft 严格审计应返回 STATUS_NOT_READY 阻断项');
  const invalid=structuredClone(issue);invalid.subtitle='X'.repeat(121);const invalidRes=await fetch(`${base}/api/issues/003`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(invalid)});assert(invalidRes.status===400,`超长主题应返回 400，实际 ${invalidRes.status}`);const invalidPayload=await invalidRes.json();assert(invalidPayload.code==='VALIDATION_ERROR','边界校验错误缺少 VALIDATION_ERROR code');
  const snap=await (await fetch(`${base}/api/issues/003/snapshot`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({label:'baseline'})})).json();assert(snap.id,'手工快照未创建');
  issue.subtitle='修改后的主题';
  let save=await fetch(`${base}/api/issues/003`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(issue)});assert(save.ok,`制作中心保存失败：${await save.text()}`);
  issue=await (await fetch(`${base}/api/issues/003`)).json();assert(issue.subtitle==='修改后的主题','保存后的主题未更新');
  const snaps=await (await fetch(`${base}/api/issues/003/snapshots`)).json();assert(snaps.length>=2,'自动保存快照未产生');
  const back=await fetch(`${base}/api/issues/003/rollback`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({snapshot:snap.id})});assert(back.ok,`回滚 API 失败：${await back.text()}`);
  issue=await (await fetch(`${base}/api/issues/003`)).json();assert(issue.subtitle===original,'回滚后主题未恢复');
  issue.status='published';let publishBase=await fetch(`${base}/api/issues/003`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(issue)});assert(publishBase.ok,'将测试刊标记 published 失败');issue=(await publishBase.json()).issue;issue.subtitle='已发布刊修订测试';let revisionSave=await fetch(`${base}/api/issues/003`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(issue)});assert(revisionSave.ok,'已发布刊修订保存失败');issue=(await revisionSave.json()).issue;assert(issue.revision?.pending===true,'已发布刊保存后未标记未发布修订');issues=await (await fetch(`${base}/api/issues`)).json();assert(issues.find(x=>x.id==='003')?.revisionPending===true,'期刊列表未暴露 revisionPending');const revisionAudit=await (await fetch(`${base}/api/issues/003/audit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strict:false})})).json();assert(revisionAudit.audit?.notes?.some(x=>x.code==='UNPUBLISHED_REVISION'),'审计未提示未发布修订');
  const studioHtml=await (await fetch(`${base}/`)).text();assert(studioHtml.includes('V3.1 自由创作期刊制作中心')||(studioHtml.includes('V3.1 alpha8 · 内部校审 / 问题闭环')||studioHtml.includes('V3.1 alpha9 · 校审轮次 / 交接签收')||studioHtml.includes('V3.1 alpha10 · 交接基线 / 复核差异')||studioHtml.includes('V3.1 alpha11 · 沉浸式工作区 / 双屏编辑')||studioHtml.includes('V3.1 alpha12 · 整期结构快速导入')||studioHtml.includes('V3.1 alpha13 · 动态板块语义识别')||(studioHtml.includes('V3.1 alpha15 · 所见即所得工作区 / 制作中心瘦身')||studioHtml.includes('V3.1 alpha16 · 媒体直编 / 多窗口同步 / 版面健康')||(studioHtml.includes('V3.1 alpha17 · Reader 最大化 / 页面控制台')||studioHtml.includes('V3.1 alpha18 · 交互修复 / 页面同步 / 移动增强')))),'制作中心 V3.1 alpha8 标识异常');
  console.log('V3 platform smoke 通过：自动草稿中间态、正式保存边界、未发布修订标记、审计、快照与安全回滚链路正常。');
}finally{child.kill('SIGTERM');await sleep(120);await rm(sandbox,{recursive:true,force:true})}
