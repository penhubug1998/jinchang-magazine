import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { V3_VERSION } from './lib-v3-production.mjs';

const root=process.cwd(); const sandbox=path.join(root,'.tmp-v3-beta1-recovery');
const assert=(c,m)=>{if(!c)throw new Error(m)};
function run(script,args=[],expect=0){const r=spawnSync(process.execPath,[path.join(sandbox,'scripts',script),...args],{cwd:sandbox,encoding:'utf8'});if((r.status??1)!==expect)throw new Error(`${script} status=${r.status} expected=${expect}\n${r.stdout}\n${r.stderr}`);return r;}
async function digestDir(dir){const rows=[];async function walk(d){for(const e of (await readdir(d,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const f=path.join(d,e.name);if(e.isDirectory())await walk(f);else{const b=await readFile(f);rows.push(`${path.relative(dir,f).replaceAll('\\','/')}:${crypto.createHash('sha256').update(b).digest('hex')}`)}}}await walk(dir);return crypto.createHash('sha256').update(rows.join('\n')).digest('hex')}

await rm(sandbox,{recursive:true,force:true});await mkdir(sandbox,{recursive:true});
await cp(path.join(root,'scripts'),path.join(sandbox,'scripts'),{recursive:true});
await cp(path.join(root,'src'),path.join(sandbox,'src'),{recursive:true});
await cp(path.join(root,'package.json'),path.join(sandbox,'package.json'));
await mkdir(path.join(sandbox,'issues'),{recursive:true});await mkdir(path.join(sandbox,'examples'),{recursive:true});
try{
  run('new-issue-v3.mjs',['--subtitle','Beta1 发布恢复测试']);
  const issueFile=path.join(sandbox,'issues','001','issue.json'); let issue=JSON.parse(await readFile(issueFile,'utf8'));
  const formalize=(v)=>typeof v==='string'?v.replaceAll('请填写','Beta1').replaceAll('待编辑','正式内容').replaceAll('待补充','正式内容'):Array.isArray(v)?v.map(formalize):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,formalize(x)])):v;
  issue=formalize(issue);issue.status='ready';issue.publisher='Beta1 测试单位';issue.subtitle='Beta1 发布恢复测试';
  await writeFile(issueFile,JSON.stringify(issue,null,2)+'\n');
  const assetRoot=path.join(sandbox,'issues','001','assets');const bytes=Buffer.alloc(8192,7);
  await writeFile(path.join(assetRoot,'music','bgm.mp3'),bytes);
  for(let i=1;i<=issue.pages.length;i++)await writeFile(path.join(assetRoot,'tts',`page-${String(i).padStart(2,'0')}.mp3`),bytes);
  run('sync-assets-v3.mjs',['--issue','001']);run('tts-baseline-v3.mjs',['--issue','001']);run('audit-v3.mjs',['--strict','--issue','001']);

  run('build-v3.mjs');const firstBuild=await digestDir(path.join(sandbox,'dist-v3','001'));run('build-v3.mjs');const secondBuild=await digestDir(path.join(sandbox,'dist-v3','001'));assert(firstBuild===secondBuild,'同一源数据连续构建结果不一致');

  const snapOut=run('snapshot-v3.mjs',['--issue','001','--label','beta1-baseline']).stdout;const snapId=snapOut.match(/V3 快照已创建：(.+)/)?.[1]?.trim();assert(snapId,'未能读取快照 ID');
  const original=JSON.parse(await readFile(issueFile,'utf8'));const changed=structuredClone(original);changed.subtitle='故意修改后再回滚';await writeFile(issueFile,JSON.stringify(changed,null,2)+'\n');run('rollback-v3.mjs',['--issue','001','--snapshot',snapId]);const restored=JSON.parse(await readFile(issueFile,'utf8'));assert(restored.subtitle===original.subtitle,'指定快照回滚未恢复源数据');
  const snapDirs=await readdir(path.join(sandbox,'.v3-snapshots','001'));assert(snapDirs.length>=2,'回滚前未自动建立安全快照');

  run('publish-v3.mjs',['--issue','001','--skip-browser']);const releaseDir=path.join(sandbox,'release-v3','001');let releaseMeta=JSON.parse(await readFile(path.join(releaseDir,'release.json'),'utf8'));assert(releaseMeta.version===V3_VERSION,`发布包版本 ${releaseMeta.version} 与运行时 ${V3_VERSION} 不一致`);assert((await stat(path.join(sandbox,'release-v3','deploy-manifest.json'))).isFile(),'部署 manifest 未生成');const firstRelease=await digestDir(releaseDir);

  // 第二次成功发布验证已有 target 与根级 manifest 的安全替换。
  issue=JSON.parse(await readFile(issueFile,'utf8'));issue.subtitle='Beta1 第二次发布';await writeFile(issueFile,JSON.stringify(issue,null,2)+'\n');run('publish-v3.mjs',['--issue','001','--skip-browser']);releaseMeta=JSON.parse(await readFile(path.join(releaseDir,'release.json'),'utf8'));assert(releaseMeta.subtitle==='Beta1 第二次发布','第二次发布未替换为新版本');const goodRelease=await digestDir(releaseDir);assert(goodRelease!==firstRelease,'第二次成功发布未更新 release 内容');

  // 失败发布必须保留上一份可用 release。状态检查在 staging 前失败。
  issue=JSON.parse(await readFile(issueFile,'utf8'));issue.status='draft';await writeFile(issueFile,JSON.stringify(issue,null,2)+'\n');const failed=run('publish-v3.mjs',['--issue','001','--skip-browser'],1);const failedAudit=JSON.parse(await readFile(path.join(sandbox,'reports','v3-release-audit-001.json'),'utf8'));assert(failedAudit.issues[0].blockers.some(x=>x.code==='STATUS_NOT_READY'),'失败原因不是预期的发布状态门禁');const afterFailed=await digestDir(releaseDir);assert(afterFailed===goodRelease,'失败发布破坏了上一份 release 目录');
  assert(!(await readdir(path.join(sandbox,'release-v3'))).some(x=>x.includes('.staging-')||x.includes('.previous-')),'发布失败后残留 staging/previous 目录');
  console.log('V3 beta1 恢复专项通过：重复构建一致、快照安全回滚、连续成功发布、失败发布保留上一发布包，且无 staging 残留。');
} finally { await rm(sandbox,{recursive:true,force:true}); }
