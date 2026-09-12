import crypto from 'node:crypto';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { root, exists } from './lib-v3-production.mjs';
import { integrityManifest } from './lib-v3-deploy.mjs';

export const FINAL_ARTIFACT_DIR='dist-v3';

export function finalReleaseSha256(release={}){
  const copy={...release};
  delete copy.releaseSha256;
  return crypto.createHash('sha256').update(JSON.stringify(copy)).digest('hex');
}

export async function finalArtifactSnapshot(dir=path.join(root,FINAL_ARTIFACT_DIR)){
  if(!(await exists(dir)))throw new Error(`Final artifact directory missing: ${path.relative(root,dir)}`);
  const manifest=await integrityManifest(dir);
  return {
    path:path.relative(root,dir)||FINAL_ARTIFACT_DIR,
    totalFiles:manifest.totalFiles,
    totalBytes:manifest.totalBytes,
    treeSha256:manifest.treeSha256
  };
}

export async function verifyFinalReleaseObject(release,{artifactDir=path.join(root,FINAL_ARTIFACT_DIR),sourceCommit=null,bundleSha256=null,manifestSha256=null}={}){
  const errors=[];
  if(!release||typeof release!=='object')return {ok:false,errors:['final release receipt missing']};
  const actualReleaseSha=String(release.releaseSha256||'');
  if(!/^[0-9a-f]{64}$/i.test(actualReleaseSha))errors.push('releaseSha256 missing or invalid');
  else if(finalReleaseSha256(release)!==actualReleaseSha)errors.push('releaseSha256 mismatch');
  if(sourceCommit&&release.source?.commit!==sourceCommit)errors.push('final release source commit mismatch');
  if(bundleSha256&&release.evidence?.bundleSha256!==bundleSha256)errors.push('final release bundleSha256 mismatch');
  if(manifestSha256&&release.evidence?.manifestSha256!==manifestSha256)errors.push('final release manifestSha256 mismatch');
  let artifact=null;
  try{
    artifact=await finalArtifactSnapshot(artifactDir);
    if(!release.artifact)errors.push('final release artifact binding missing');
    else {
      if(release.artifact.path!==artifact.path)errors.push('final artifact path mismatch');
      if(release.artifact.totalFiles!==artifact.totalFiles)errors.push('final artifact file count mismatch');
      if(release.artifact.totalBytes!==artifact.totalBytes)errors.push('final artifact byte count mismatch');
      if(release.artifact.treeSha256!==artifact.treeSha256)errors.push('final artifact treeSha256 mismatch');
    }
  }catch(error){errors.push(error.message||String(error));}
  return {ok:errors.length===0,errors,artifact,releaseSha256:actualReleaseSha};
}

export async function readFinalRelease(rel='reports/p1-12-final-release.json'){
  const file=path.join(root,rel);
  if(!(await exists(file)))return null;
  return JSON.parse(await readFile(file,'utf8'));
}
