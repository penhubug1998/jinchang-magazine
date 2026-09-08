import crypto from 'node:crypto';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { root, V3_VERSION, V31_SCHEMA_VERSION, exists } from './lib-v3-production.mjs';
import { sourceIdentity } from './lib-p1-10-final-acceptance-v3.mjs';
import { FINAL_BUNDLE_FILE, FINAL_BUNDLE_MANIFEST_FILE, readFinalSession, sessionState, verifyBundleObjects, verifyEvidenceFiles } from './lib-p1-11-final-session-v3.mjs';

export const FINAL_RELEASE_FILE='reports/p1-12-final-release.json';
export const FINALIZATION_REQUIRED_VERSION='3.1.0';
export const FINALIZATION_REQUIRED_SCHEMA='3.1-alpha24';

export function commandResult(command,args=[]){
  const r=spawnSync(command,args,{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
  return {ok:r.status===0,status:r.status,stdout:String(r.stdout||''),stderr:String(r.stderr||''),output:[r.stdout,r.stderr].filter(Boolean).join('\n').trim()};
}

export function trackedSourceClean(){
  const work=commandResult('git',['diff','--quiet','--ignore-submodules','--']);
  const index=commandResult('git',['diff','--cached','--quiet','--ignore-submodules','--']);
  return {ok:work.ok&&index.ok,worktreeClean:work.ok,indexClean:index.ok};
}

export async function packageMetadata(){return JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));}

export async function finalizationContext(){
  const source=sourceIdentity();
  const pkg=await packageMetadata();
  const clean=trackedSourceClean();
  const session=await readFinalSession();
  const sessionStatus=sessionState(session,source);
  let bundle=null,manifest=null,internal={ok:false,errors:['strict evidence bundle/manifest missing']},disk={ok:false,errors:['strict evidence bundle/manifest missing']};
  if(await exists(path.join(root,FINAL_BUNDLE_FILE))&&await exists(path.join(root,FINAL_BUNDLE_MANIFEST_FILE))){
    try{
      bundle=JSON.parse(await readFile(path.join(root,FINAL_BUNDLE_FILE),'utf8'));
      manifest=JSON.parse(await readFile(path.join(root,FINAL_BUNDLE_MANIFEST_FILE),'utf8'));
      internal=verifyBundleObjects(bundle,manifest);disk=await verifyEvidenceFiles(manifest);
    }catch(error){internal={ok:false,errors:[error.message||String(error)]};disk={ok:false,errors:[]};}
  }
  const checks={
    sourceAvailable:Boolean(source.available),
    version:pkg.version===FINALIZATION_REQUIRED_VERSION&&V3_VERSION===FINALIZATION_REQUIRED_VERSION,
    schema:pkg.v31SchemaVersion===FINALIZATION_REQUIRED_SCHEMA&&V31_SCHEMA_VERSION===FINALIZATION_REQUIRED_SCHEMA,
    trackedSourceClean:clean.ok,
    sessionSealed:sessionStatus.status==='SEALED',
    sessionSource:sessionStatus.status==='SEALED'&&session?.source?.commit===source.commit,
    strictBundle:Boolean(bundle&&manifest?.strict===true),
    bundleInternal:internal.ok,
    evidenceFiles:disk.ok,
    bundleSource:Boolean(manifest?.sourceCommit&&manifest.sourceCommit===source.commit),
    bundleSession:Boolean(session?.sessionId&&manifest?.sessionId===session.sessionId&&bundle?.session?.sessionId===session.sessionId&&bundle?.session?.status==='SEALED'),
    acceptance:Boolean(manifest?.ready===8&&manifest?.total===8&&bundle?.acceptance?.ready===8&&bundle?.acceptance?.total===8)
  };
  const failed=Object.entries(checks).filter(([,ok])=>!ok).map(([key])=>key);
  return {stage:'P1-12',version:V3_VERSION,schema:V31_SCHEMA_VERSION,source,pkg:{version:pkg.version,v31Release:pkg.v31Release||null,v31ReleasedAt:pkg.v31ReleasedAt||null,v31SchemaVersion:pkg.v31SchemaVersion||null},clean,session,sessionStatus,bundle,manifest,internal,disk,checks,ready:failed.length===0,failed};
}

export function finalizationFingerprint(context){
  const payload={sourceCommit:context.source?.commit||null,sessionId:context.session?.sessionId||null,bundleSha256:context.manifest?.bundleSha256||null,manifestSha256:context.manifest?.manifestSha256||null,version:context.version,schema:context.schema};
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function summarizeFinalization(context){
  if(context.ready)return `READY · ${context.source.commit} · ${context.session.sessionId}`;
  return `BLOCKED · ${context.failed.join(', ')}`;
}
