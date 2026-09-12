import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { issueTemplateCatalog, createIssueTemplate } from '../src/studio/issue-templates.js';
import { collectReferencedAssets, stripAssetsPrefix } from './lib-v3-production.mjs';

const root=process.cwd();
const sandbox=await mkdtemp(path.join(root,'.tmp-v3-default-templates-'));
let server;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try {
  for(const dir of ['src','scripts','baselines'])await cp(path.join(root,dir),path.join(sandbox,dir),{recursive:true});
  await cp(path.join(root,'package.json'),path.join(sandbox,'package.json'));
  await mkdir(path.join(sandbox,'issues'));
  await mkdir(path.join(sandbox,'examples'));
  const catalog=issueTemplateCatalog();
  assert.equal(catalog.length,3);
  assert.throws(()=>createIssueTemplate('invalid',{}),/未知整刊模板/);
  const metadata={subtitle:'测试主题',publication:'测试刊物',publisher:'测试单位',label:'测试期'};
  const first=createIssueTemplate(catalog[0].id,metadata);
  first.pages[0].title='修改副本';first.design.tokens.accent='#000000';
  const second=createIssueTemplate(catalog[0].id,metadata);
  assert.equal(second.pages[0].title,metadata.subtitle);
  assert.notEqual(second.design.tokens.accent,'#000000');
  const run=(file,args=[])=>{const r=spawnSync(process.execPath,[path.join(sandbox,'scripts',file),...args],{cwd:sandbox,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);};
  // The real CLI creates self-contained issues; the real checker and builder consume them.
  for(const t of catalog){
    const id=`sample-${t.id}`;
    run('new-issue-v3.mjs',['--id',id,'--template',t.id,'--subtitle',t.name,'--publisher','模板演示单位','--publication','电子期刊','--label','模板预览']);
    const issue=JSON.parse(await readFile(path.join(sandbox,'issues',id,'issue.json'),'utf8'));
    assert.equal(issue.pages.length,8);assert.equal(issue.status,'draft');
    assert.equal(issue.pages[0].type,'cover');assert.equal(issue.pages.at(-1).type,'closing');
    assert.equal(issue.features.music,undefined);assert.equal(issue.features.narration.pattern,undefined);
    for(const entry of issue.pages[1].blocks[0].items)assert.equal(issue.pages[entry.page-1].section,entry.title);
    const refs=collectReferencedAssets(issue);assert(refs.length>0);
    for(const ref of refs)await readFile(path.join(sandbox,issue.assetSource,stripAssetsPrefix(ref.path)));
    run('check-v3.mjs',['--issue',id]);run('build-v3.mjs',['--issue',id]);
    for(const ref of refs)await readFile(path.join(sandbox,'dist-v3',id,'assets',stripAssetsPrefix(ref.path)));
    const auditRun=spawnSync(process.execPath,['scripts/audit-v3.mjs','--issue',id,'--strict'],{cwd:sandbox,encoding:'utf8',env:{...process.env,V3_STRICT_RELEASE:'1'}});
    assert.equal(auditRun.status,1,'unfinished template must fail strict publication checks');
    const audit=JSON.parse(await readFile(path.join(sandbox,'reports',`v3-release-audit-${id}.json`),'utf8')).issues[0];
    const pendingPages=new Set(audit.blockers.filter(x=>x.code==='PLACEHOLDER_CONTENT').map(x=>x.location?.page));
    for(const page of [3,4,5,6,7,8])assert(pendingPages.has(page),`${id} page ${page}: placeholder must be locatable before publishing`);
  }
  // Check server validation, new template route, real creation, and save compatibility.
  let logs='';
  const net=await import('node:net');
  const port=await new Promise(resolve=>{const probe=net.createServer();probe.listen(0,'127.0.0.1',()=>{const p=probe.address().port;probe.close(()=>resolve(p));});});
  server=spawn(process.execPath,['scripts/studio-v3.mjs','--host','127.0.0.1','--port',String(port)],{cwd:sandbox,env:{...process.env,STUDIO_ADMIN_PASSWORD:''},stdio:['ignore','pipe','pipe']});
  server.stdout.on('data',x=>logs+=x);server.stderr.on('data',x=>logs+=x);
  const base=`http://127.0.0.1:${port}`;
  let ready=false;for(let n=0;n<100;n++){try{ready=(await fetch(`${base}/api/health`)).ok;}catch{}if(ready)break;await sleep(50);}assert(ready,logs);
  assert.equal((await(await fetch(`${base}/api/issue-templates`)).json()).templates.length,3);
  const create=body=>fetch(`${base}/api/issues`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await create({subtitle:'无效模板',templateId:'missing'})).status,400);
  assert.equal((await create({subtitle:'互斥选择',templateId:catalog[0].id,cloneFrom:'sample-unit-red'})).status,400);
  for(const t of catalog){
    const response=await create({subtitle:'接口创建 · '+t.name,templateId:t.id});
    assert.equal(response.status,201,await response.clone().text());
    const {issue:summary}=await response.json();
    const issue=await(await fetch(`${base}/api/issues/${summary.id}`)).json();assert.equal(issue.pages.length,8);
    const source=await(await fetch(`${base}/api/issues/${summary.id}/source-status`)).json();
    const save=await fetch(`${base}/api/issues/${summary.id}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({issue,sourceFingerprint:source.fingerprint})});
    assert.equal(save.status,200,await save.text());
  }
  const standard=await create({subtitle:'标准模板兼容'});assert.equal(standard.status,201);
  const cloned=await create({subtitle:'复制旧刊兼容',cloneFrom:'sample-unit-red'});assert.equal(cloned.status,201);
  console.log('默认模板测试通过：3 套 × 8 页、目录跳转、独立副本、本地资源、构建、API 创建/保存、无效选择、标准模板与旧刊复制兼容。');
  if(process.argv.includes('--keep'))console.log(`保留预览工作区：${sandbox}`);
} finally {
  if(server&&server.exitCode===null){server.kill();await new Promise(resolve=>server.once('exit',resolve));}
  if(!process.argv.includes('--keep'))await rm(sandbox,{recursive:true,force:true});
}
