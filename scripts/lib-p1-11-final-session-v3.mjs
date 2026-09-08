import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { V3_VERSION, exists, root } from './lib-v3-production.mjs';
import { buildFinalAcceptanceReport, sourceIdentity } from './lib-p1-10-final-acceptance-v3.mjs';

export const FINAL_SESSION_FILE='reports/p1-11-final-acceptance-session.json';
export const FINAL_BUNDLE_FILE='reports/p1-11-final-evidence-bundle.json';
export const FINAL_BUNDLE_MANIFEST_FILE='reports/p1-11-final-evidence-manifest.json';

const readJson=async rel=>JSON.parse(await readFile(path.join(root,rel),'utf8'));
export const sha256Buffer=value=>crypto.createHash('sha256').update(value).digest('hex');
export const sha256Json=value=>sha256Buffer(Buffer.from(JSON.stringify(value)));
export const canonicalSessionId=(source,now=new Date())=>`fa-${now.toISOString().replace(/[-:.TZ]/g,'').slice(0,14)}-${String(source?.commit||'unknown').slice(0,12)}`;

export function sessionState(session,source){
  if(!session)return {status:'NOT_STARTED',sourceMatches:false,reason:'尚未开始 Final Acceptance Session'};
  const sourceMatches=Boolean(source?.commit&&session.source?.commit===source.commit);
  if(!sourceMatches)return {status:'STALE',sourceMatches:false,reason:'验收会话绑定的源码已变化；必须基于当前 commit 重新开始'};
  if(session.status==='SEALED')return {status:'SEALED',sourceMatches:true,reason:'会话已完成 8/8 并封存'};
  if(session.status==='ABORTED')return {status:'ABORTED',sourceMatches:true,reason:'会话已终止'};
  return {status:'ACTIVE',sourceMatches:true,reason:'验收会话已锁定当前源码'};
}

export async function readFinalSession(){
  if(!(await exists(path.join(root,FINAL_SESSION_FILE))))return null;
  return readJson(FINAL_SESSION_FILE);
}

export async function startFinalSession({issue='003',reset=false}={}){
  const source=sourceIdentity();
  if(!source.available)throw new Error('无法确认 Git HEAD，不能开始 Final Acceptance Session');
  const current=await readFinalSession();
  const currentState=sessionState(current,source);
  if(current&&currentState.status==='ACTIVE'&&!reset)return current;
  if(current&&currentState.status==='SEALED'&&!reset)throw new Error('Final Acceptance Session 已封存；如确需重新验收，请显式使用 --reset');
  if(current&&currentState.status==='STALE'&&!reset)throw new Error('现有 Final Acceptance Session 已因源码变化而过期；请使用 --reset 开始新的当前源码会话');
  const startedAt=new Date().toISOString();
  const session={stage:'P1-11',version:V3_VERSION,sessionId:canonicalSessionId(source,new Date(startedAt)),status:'ACTIVE',issue:String(issue),startedAt,updatedAt:startedAt,source,requirements:{gates:8,promotion:'8/8 READY',sourceLock:true,evidenceSha256:true},notes:['会话开始后不要再修改源码；任何新 commit 都会使本会话失效。','Safari / iPhone Safari / Android 微信必须使用真实环境提交。','证据包可在未完成时导出用于审阅，但只有 8/8 READY 才能 strict seal。']};
  await mkdir(path.join(root,'reports'),{recursive:true});
  await writeFile(path.join(root,FINAL_SESSION_FILE),JSON.stringify(session,null,2)+'\n');
  return session;
}

export async function buildSessionStatus(){
  const source=sourceIdentity(),session=await readFinalSession(),state=sessionState(session,source),acceptance=await buildFinalAcceptanceReport();
  const ready=acceptance.ready,total=acceptance.total;
  const canSeal=Boolean(state.status==='ACTIVE'&&state.sourceMatches&&acceptance.promotion?.allowed&&ready===total&&total===8);
  return {stage:'P1-11',version:V3_VERSION,generatedAt:new Date().toISOString(),session,state,source,acceptance:{status:acceptance.status,ready,total,gates:acceptance.gates},canSeal,next:state.status==='NOT_STARTED'?'开始 Final Acceptance Session':state.status==='STALE'?'重新开始当前源码会话':canSeal?'生成 strict 证据包并 seal':'继续完成未通过的真实环境 Gate'};
}

export async function evidenceFileEntry(rel){
  const abs=path.join(root,rel);
  if(!(await exists(abs)))return {path:rel,present:false,bytes:0,sha256:null,data:null};
  const raw=await readFile(abs);let data=null;try{data=JSON.parse(raw.toString('utf8'))}catch{}
  return {path:rel,present:true,bytes:raw.length,sha256:sha256Buffer(raw),data};
}

export async function buildEvidenceBundle({strict=false}={}){
  const status=await buildSessionStatus();
  if(strict&&!status.canSeal)throw new Error(`Strict evidence bundle requires ACTIVE current-source session and 8/8 READY; current ${status.acceptance.ready}/${status.acceptance.total}`);
  const evidencePaths=[FINAL_SESSION_FILE,'reports/p1-08-production-e2e-last.json','reports/p1-09-final-evidence-gate.json','reports/v31-final-media-receipt.json','reports/v3-rc1-device-acceptance.json','reports/v31-final-production-receipt.json','reports/p1-10-final-acceptance.json'];
  const files=[];for(const rel of evidencePaths)files.push(await evidenceFileEntry(rel));
  const generatedAt=new Date().toISOString();
  const bundle={stage:'P1-11',version:V3_VERSION,generatedAt,strict,source:status.source,session:status.session,acceptance:status.acceptance,files};
  bundle.bundleSha256=sha256Json(bundle);
  const manifest={stage:'P1-11',version:V3_VERSION,generatedAt,strict,sessionId:status.session?.sessionId||null,sourceCommit:status.source?.commit||null,ready:status.acceptance.ready,total:status.acceptance.total,bundleSha256:bundle.bundleSha256,files:files.map(x=>({path:x.path,present:x.present,bytes:x.bytes,sha256:x.sha256}))};
  manifest.manifestSha256=sha256Json(manifest);
  await mkdir(path.join(root,'reports'),{recursive:true});
  await writeFile(path.join(root,FINAL_BUNDLE_FILE),JSON.stringify(bundle,null,2)+'\n');
  await writeFile(path.join(root,FINAL_BUNDLE_MANIFEST_FILE),JSON.stringify(manifest,null,2)+'\n');
  return {bundle,manifest};
}

export function verifyBundleObjects(bundle,manifest){
  if(!bundle||!manifest)return {ok:false,errors:['bundle 或 manifest 缺失']};
  const errors=[];
  const bundleCopy={...bundle};delete bundleCopy.bundleSha256;const bundleSha=sha256Json(bundleCopy);
  if(bundleSha!==bundle.bundleSha256)errors.push('bundleSha256 不匹配');
  const manifestCopy={...manifest};delete manifestCopy.manifestSha256;const manifestSha=sha256Json(manifestCopy);
  if(manifestSha!==manifest.manifestSha256)errors.push('manifestSha256 不匹配');
  if(manifest.bundleSha256!==bundle.bundleSha256)errors.push('manifest 引用的 bundleSha256 不匹配');
  if(manifest.sourceCommit!==bundle.source?.commit)errors.push('sourceCommit 不一致');
  if(manifest.sessionId!==(bundle.session?.sessionId||null))errors.push('sessionId 不一致');
  const byPath=new Map((bundle.files||[]).map(x=>[x.path,x]));
  for(const row of manifest.files||[]){const source=byPath.get(row.path);if(!source){errors.push(`manifest 文件缺失：${row.path}`);continue;}if(source.present!==row.present||source.bytes!==row.bytes||source.sha256!==row.sha256)errors.push(`文件元数据不一致：${row.path}`);}
  return {ok:errors.length===0,errors,bundleSha256:bundleSha,manifestSha256:manifestSha};
}

export async function sealFinalSession(){
  const status=await buildSessionStatus();
  if(!status.canSeal)throw new Error(`Final Acceptance Session 尚不能 seal：${status.acceptance.ready}/${status.acceptance.total} READY · ${status.state.status}`);
  const {manifest}=await buildEvidenceBundle({strict:true});
  const session={...status.session,status:'SEALED',sealedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),finalReady:status.acceptance.ready,finalTotal:status.acceptance.total,bundleSha256:manifest.bundleSha256,manifestSha256:manifest.manifestSha256};
  await writeFile(path.join(root,FINAL_SESSION_FILE),JSON.stringify(session,null,2)+'\n');
  return session;
}
