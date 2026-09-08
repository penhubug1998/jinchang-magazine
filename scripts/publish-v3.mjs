import { cp, mkdir, readFile, rename, rm, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { buildArchiveHtml, catalogHref } from './lib-v3-catalog.mjs';
import { snapshotIssue } from './lib-v3-history.mjs';
import { V3_VERSION, exists, forceReleaseEnabled, normalizeIssueId, parseArgs, readJson, root, writeJson } from './lib-v3-production.mjs';
import { CACHE_POLICY, nginxCacheSnippet, writeDeploymentArtifacts } from './lib-v3-deploy.mjs';

const args = parseArgs();
const id = normalizeIssueId(args.issue || args.id || args._[0] || '');
const force = forceReleaseEnabled();
// Public URLs use a stable two-digit path (/01/, /02/, /03/) even though
// source and release directories retain their three-digit issue ids.
const publicIssuePath = (value) => {
  const number = Number(String(value || '').trim());
  return Number.isInteger(number) && number > 0 ? String(number).padStart(2, '0') : String(value || '').trim();
};
if (!id) { console.error('用法：npm run publish:v3 -- --issue 003 [--skip-browser] [--mark-published]'); process.exit(2); }
const issueFile = path.join(root, 'issues', id, 'issue.json');
if (!(await exists(issueFile))) { console.error(`找不到 issues/${id}`); process.exit(1); }
let issue = await readJson(issueFile);
if (issue.engine !== 'v3') { console.error(`${id} 不是 V3 期刊，发布器已停止。`); process.exit(1); }
if (!force && !['ready','published'].includes(String(issue.status || 'draft'))) { console.error(`发布器要求 status=ready 或 published，当前为 ${issue.status || 'unknown'}；draft/review 请继续使用 Studio 预览或归档导出。`); process.exit(1); }

function run(label, script, scriptArgs=[]) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(process.execPath,[path.join(root,'scripts',script),...scriptArgs],{cwd:root,stdio:'inherit'});
  if(result.status!==0) process.exit(result.status ?? 1);
}
// Never turn real content/media/TTS blockers into a warning.  Browser device
// checks are advisory for routine publishing and are handled separately.
const checkArgs=force?['--issue',id,'--skip-browser']:['--issue',id,'--strict','--skip-browser'];
if(force)console.warn('直接发布模式：跳过发布前阻断检查，仅保留构建、产物写入和运行时错误检查。');
run('发布前完整门禁','release-check-v3.mjs',checkArgs);

const snapshot = await snapshotIssue(id, 'pre-publish');
// Publish only the selected issue. A release of one issue must not rebuild
// every preview and temporarily invalidate the other issue readers.
run('生成最新构建','build-v3.mjs',['--issue',id]);
const built = path.join(root,'dist-v3',id);
if (!(await exists(path.join(built,'index.html')))) { console.error(`构建产物不存在：dist-v3/${id}`); process.exit(1); }

const releaseRoot = path.join(root,String(args.output || 'release-v3'));
const target = path.join(releaseRoot,id);
const swapToken = `${process.pid}-${Date.now()}`;
const staging = path.join(releaseRoot,`.${id}.staging-${swapToken}`);
const previous = path.join(releaseRoot,`.${id}.previous-${swapToken}`);
await mkdir(releaseRoot,{recursive:true});
await rm(staging,{recursive:true,force:true});
await rm(previous,{recursive:true,force:true});
await cp(built,staging,{recursive:true});

const releasedAt=new Date().toISOString();
const markPublished = Boolean(args['mark-published']);
const effectiveIssue = markPublished
  ? {
      ...issue,
      status:'published',
      publishedAt:releasedAt,
      ...(issue.revision?.pending
        ? {revision:{...issue.revision,pending:false,publishedAt:releasedAt,releaseSnapshot:snapshot.id}}
        : {})
    }
  : issue;
if (markPublished) {
  // 发布包必须和最终要落盘的状态一致，避免 release.json 写 published、issue.json 却仍是 ready。
  await writeJson(path.join(staging,'issue.json'),effectiveIssue);
}

async function treeStats(dir){
  let files=0,bytes=0;
  async function walk(d){
    for(const e of await readdir(d,{withFileTypes:true})){
      const f=path.join(d,e.name);
      if(e.isDirectory()) await walk(f); else if(e.isFile()){ const s=await stat(f); files++; bytes+=s.size; }
    }
  }
  await walk(dir); return {files,bytes};
}
const issueBytes=Buffer.from(`${JSON.stringify(effectiveIssue,null,2)}\n`,'utf8');
const digest=crypto.createHash('sha256').update(issueBytes).digest('hex');
const stats=await treeStats(staging);
const releaseMeta={version:V3_VERSION,issue:id,label:effectiveIssue.label,subtitle:effectiveIssue.subtitle||'',sourceStatus:effectiveIssue.status,releasedAt,snapshot:snapshot.id,issueSha256:digest,files:stats.files,bytes:stats.bytes};
await writeJson(path.join(staging,'release.json'),releaseMeta);
const integrity=await writeDeploymentArtifacts(staging,{issue:id});

// Beta1: 先完整构建 staging，再原子替换正式发布目录。复制/写入失败时旧发布包保持不动。
const hadPrevious = await exists(target);
try {
  if (hadPrevious) await rename(target, previous);
  await rename(staging, target);
  if (hadPrevious) await rm(previous,{recursive:true,force:true});
} catch (error) {
  await rm(staging,{recursive:true,force:true}).catch(()=>{});
  if (hadPrevious && await exists(previous) && !(await exists(target))) await rename(previous,target).catch(()=>{});
  throw error;
}

const issueEntries=await readdir(path.join(root,'issues'),{withFileTypes:true});
const catalog=[];
for(const entry of issueEntries){
  if(!entry.isDirectory()) continue;
  const x=await readJson(path.join(root,'issues',entry.name,'issue.json'));
  const catalogStatus = x.id===id ? effectiveIssue.status : x.status;
  if(x.engine==='legacy' && catalogStatus==='published') catalog.push({id:x.id,label:x.label,publication:x.publication,subtitle:x.subtitle||'',engine:x.engine,status:catalogStatus,href:catalogHref(x),legacyPath:x.legacyPath||null,pageCount:null});
  else if(x.engine==='v3' && (catalogStatus==='published' || x.id===id)) catalog.push({id:x.id,label:x.label,publication:x.publication,subtitle:x.subtitle||'',engine:x.engine,status:catalogStatus,href:`./${publicIssuePath(x.id)}/`,legacyPath:x.legacyPath||null,pageCount:Array.isArray(x.pages)?x.pages.length:null});
}
catalog.sort((a,b)=>b.id.localeCompare(a.id,'zh-CN'));
async function atomicWriteFile(file, content) {
  const token = `${process.pid}-${Date.now()}`;
  const temp = `${file}.tmp-${token}`;
  const backup = `${file}.previous-${token}`;
  const hadFile = await exists(file);
  await writeFile(temp,content,'utf8');
  try {
    if (hadFile) await rename(file,backup);
    await rename(temp,file);
    if (hadFile) await rm(backup,{force:true});
  } catch (error) {
    await rm(temp,{force:true}).catch(()=>{});
    if (hadFile && await exists(backup) && !(await exists(file))) await rename(backup,file).catch(()=>{});
    throw error;
  }
}
async function atomicWriteJson(file, value) {
  await atomicWriteFile(file,`${JSON.stringify(value,null,2)}\n`);
}
await atomicWriteFile(path.join(releaseRoot,'index.html'),buildArchiveHtml(catalog,{subtitle:'正式发布包 · 自动生成归档首页'}));
await atomicWriteJson(path.join(releaseRoot,'catalog.json'),catalog);
await atomicWriteJson(path.join(releaseRoot,'deploy-manifest.json'),{
  version:V3_VERSION,generatedAt:releasedAt,issue:id,
  source:`release-v3/${id}/`,suggestedTarget:`${publicIssuePath(id)}/`,
  integrity:`${id}/integrity.json`,treeSha256:integrity.treeSha256,
  cachePolicy:CACHE_POLICY,cacheSnippet:'nginx-cache-snippet.conf',
  safeMode:true,note:'默认仅生成发布包，不自动覆盖现有线上期刊目录。部署前请人工确认目标路径。'
});
await atomicWriteFile(path.join(releaseRoot,'nginx-cache-snippet.conf'),nginxCacheSnippet());

if (markPublished) {
  await writeFile(issueFile,`${JSON.stringify(effectiveIssue,null,2)}\n`,'utf8');
  await snapshotIssue(id,'marked-published');
  console.log(`源数据已显式标记为 published，并同步清理已打包修订状态：${id}`);
}
console.log(`\nV3 发布包已生成：${path.relative(root,target)}`);
console.log(`- 发布快照：${snapshot.id}`);
console.log(`- 文件：${stats.files}`);
console.log(`- 体积：${(stats.bytes/1024/1024).toFixed(2)} MB`);
console.log(`- 归档首页：${path.relative(root,path.join(releaseRoot,'index.html'))}`);
console.log('- 安全策略：未自动覆盖现有 /1/、/2/ 或服务器目录。');
