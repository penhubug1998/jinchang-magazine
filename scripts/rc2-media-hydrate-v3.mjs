import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { V3_VERSION, exists, normalizeIssueId, parseArgs, posix, root } from './lib-v3-production.mjs';

const args=parseArgs();
const confirm=Boolean(args.confirm);
const repair=Boolean(args.repair);
const only=normalizeIssueId(args.issue||args.id||'');
const jobs=Math.max(1,Math.min(8,Number(args.jobs||3)||3));
const retries=Math.max(0,Math.min(5,Number(args.retries||2)||2));
const timeoutMs=Math.max(5000,Math.min(180000,Number(args.timeout||60000)||60000));
const baselineFile=path.resolve(root,String(args.baseline||'baselines/v3-rc1-media.json'));
const reportFile=path.resolve(root,String(args.report||'reports/v3-rc2-media-hydration.json'));
if(!(await exists(baselineFile))){console.error(`找不到媒体 baseline：${baselineFile}`);process.exit(2)}
const baseline=JSON.parse(await readFile(baselineFile,'utf8'));
const repo=String(baseline?.source?.repository||'').trim();
const commit=String(baseline?.source?.commit||'').trim();
if(!repo||!commit){console.error('媒体 baseline 缺少 source.repository / source.commit');process.exit(2)}
const defaultBase=`https://raw.githubusercontent.com/${repo}/${commit}/`;
const baseUrl=String(args['base-url']||defaultBase).replace(/\/?$/,'/');
const report={version:V3_VERSION,generatedAt:new Date().toISOString(),mode:confirm?'confirm':'dry-run',repair,jobs,retries,timeoutMs,source:{repository:repo,commit,baseUrl},summary:{expected:0,ready:0,missing:0,mismatched:0,downloaded:0,repaired:0,retried:0,errors:0},issues:[]};
function gitBlobSha1(bytes){return crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex')}
async function inspect(file,expected){
  if(!(await exists(file)))return {state:'missing'};
  const info=await stat(file);if(info.size!==expected.bytes)return {state:'mismatch',reason:`size ${info.size} != ${expected.bytes}`};
  const bytes=await readFile(file);const sha=gitBlobSha1(bytes);if(sha!==expected.gitBlobSha1)return {state:'mismatch',reason:`gitBlobSha1 ${sha} != ${expected.gitBlobSha1}`};
  return {state:'ready'};
}
async function fetchBytes(url){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{const r=await fetch(url,{redirect:'follow',cache:'no-store',signal:controller.signal});if(!r.ok)throw new Error(`HTTP ${r.status}`);return Buffer.from(await r.arrayBuffer())}
  finally{clearTimeout(timer)}
}
async function downloadVerified(url,target,expected){
  let last;
  for(let attempt=0;attempt<=retries;attempt++){
    try{
      const bytes=await fetchBytes(url);
      if(bytes.length!==expected.bytes)throw new Error(`下载大小 ${bytes.length} != ${expected.bytes}`);
      const sha=gitBlobSha1(bytes);if(sha!==expected.gitBlobSha1)throw new Error(`下载 SHA1 ${sha} != ${expected.gitBlobSha1}`);
      await mkdir(path.dirname(target),{recursive:true});
      const tmp=`${target}.v3-download-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      await writeFile(tmp,bytes);return {tmp,attempts:attempt+1};
    }catch(e){last=e;if(attempt<retries){report.summary.retried++;await new Promise(r=>setTimeout(r,500*(attempt+1)))}}
  }
  throw last;
}
async function installTmp(tmp,target,{repairing}){
  let backup=null;
  try{
    if(repairing&&await exists(target)){
      const backupRoot=path.join(root,'.v3-media-backups',new Date().toISOString().replace(/[:.]/g,'-'));
      backup=path.join(backupRoot,path.relative(root,target));await mkdir(path.dirname(backup),{recursive:true});await rename(target,backup);
    }
    await rename(tmp,target);
    return backup;
  }catch(e){
    await rm(tmp,{force:true}).catch(()=>{});
    if(backup&&await exists(backup)&&!(await exists(target)))await rename(backup,target).catch(()=>{});
    throw e;
  }
}
const tasks=[];
for(const [id,entry] of Object.entries(baseline.issues||{})){
  if(only&&id!==only)continue;
  const row={id,assetSource:entry.assetSource,expectedFiles:entry.fileCount,actions:[],errors:[]};report.issues.push(row);
  for(const item of entry.files||[]){
    report.summary.expected++;
    const target=path.resolve(root,entry.assetSource,item.path);const current=await inspect(target,item);
    const action={path:item.path,state:current.state,target:posix(path.relative(root,target)),bytes:item.bytes};row.actions.push(action);
    if(current.state==='ready'){report.summary.ready++;continue}
    if(current.state==='missing')report.summary.missing++;else{report.summary.mismatched++;action.reason=current.reason}
    if(!confirm){action.planned=current.state==='missing'?'download':repair?'repair':'blocked';continue}
    if(current.state==='mismatch'&&!repair){action.error='现有文件与 baseline 不一致；为避免覆盖，需显式追加 --repair --confirm';row.errors.push(action.error);report.summary.errors++;continue}
    tasks.push({id,entry,item,row,target,current,action});
  }
}
let done=0;
async function worker(){
  while(true){
    const task=tasks.shift();if(!task)return;
    const {entry,item,row,target,current,action}=task;const rel=posix(path.posix.join(entry.assetSource,item.path));const url=new URL(rel,baseUrl).href;
    try{
      const {tmp,attempts}=await downloadVerified(url,target,item);action.attempts=attempts;const backup=await installTmp(tmp,target,{repairing:current.state==='mismatch'});action.downloaded=true;if(backup)action.backup=posix(path.relative(root,backup));
      const post=await inspect(target,item);if(post.state!=='ready')throw new Error(`安装后校验失败：${post.reason||post.state}`);
      if(current.state==='mismatch')report.summary.repaired++;else report.summary.downloaded++;
      done++;console.log(`[${done}/${done+tasks.length}] ${current.state==='mismatch'?'修复':'下载'} ${rel}`);
    }catch(e){action.error=e.message;row.errors.push(`${item.path}: ${e.message}`);report.summary.errors++;done++;console.error(`[${done}/${done+tasks.length}] 失败 ${rel}: ${e.message}`)}
  }
}
if(confirm&&tasks.length)await Promise.all(Array.from({length:Math.min(jobs,tasks.length)},()=>worker()));
// Recompute ready count after confirmed actions so the report reflects final state.
if(confirm){
  let finalReady=0;
  for(const [id,entry] of Object.entries(baseline.issues||{})){
    if(only&&id!==only)continue;
    for(const item of entry.files||[]){if((await inspect(path.resolve(root,entry.assetSource,item.path),item)).state==='ready')finalReady++}
  }
  report.summary.ready=finalReady;
}
await mkdir(path.dirname(reportFile),{recursive:true});await writeFile(reportFile,JSON.stringify(report,null,2)+'\n','utf8');
console.log(`V3.0 历史媒体补全：expected=${report.summary.expected}, ready=${report.summary.ready}, missing=${report.summary.missing}, mismatched=${report.summary.mismatched}, downloaded=${report.summary.downloaded}, repaired=${report.summary.repaired}, retried=${report.summary.retried}, errors=${report.summary.errors}`);
if(!confirm)console.log(`当前为 dry-run；确认下载请追加 --confirm。默认并发 ${jobs}，可用 --jobs 1..8 调整。已有不一致文件必须 --repair --confirm；修复前原文件会备份到 .v3-media-backups/。`);
console.log(`报告：${posix(path.relative(root,reportFile))}`);if(confirm&&report.summary.errors)process.exit(1);
