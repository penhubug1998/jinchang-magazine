import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { root } from './lib-v3-production.mjs';
import { finalArtifactSnapshot, finalReleaseSha256, verifyFinalReleaseObject } from './lib-p1-18-final-artifact-v3.mjs';

const temp=await mkdtemp(path.join(os.tmpdir(),'jm-p118-artifact-'));
try{
  const artifactDir=path.join(temp,'dist-v3');
  await mkdir(path.join(artifactDir,'001'),{recursive:true});
  await writeFile(path.join(artifactDir,'index.html'),'<html>final</html>');
  await writeFile(path.join(artifactDir,'001','issue.json'),'{"id":"001"}\n');
  const artifact=await finalArtifactSnapshot(artifactDir);
  assert.equal(artifact.totalFiles,2);
  assert.ok(artifact.totalBytes>0);
  assert.match(artifact.treeSha256,/^[0-9a-f]{64}$/);

  const sourceCommit='a'.repeat(40),bundleSha256='b'.repeat(64),manifestSha256='c'.repeat(64);
  const release={stage:'P1-12',version:'3.1.0',schema:'3.1-alpha24',status:'FINALIZED',source:{commit:sourceCommit},evidence:{ready:8,total:8,bundleSha256,manifestSha256},artifact,fingerprint:'d'.repeat(64)};
  release.releaseSha256=finalReleaseSha256(release);
  let verified=await verifyFinalReleaseObject(release,{artifactDir,sourceCommit,bundleSha256,manifestSha256});
  assert.equal(verified.ok,true,verified.errors.join('; '));

  await writeFile(path.join(artifactDir,'index.html'),'<html>tampered</html>');
  verified=await verifyFinalReleaseObject(release,{artifactDir,sourceCommit,bundleSha256,manifestSha256});
  assert.equal(verified.ok,false);
  assert.ok(verified.errors.some(x=>x.includes('treeSha256')||x.includes('byte count')),'artifact mutation must be detected');

  await writeFile(path.join(artifactDir,'index.html'),'<html>final</html>');
  const tamperedRelease={...release,status:'EDITED'};
  verified=await verifyFinalReleaseObject(tamperedRelease,{artifactDir,sourceCommit,bundleSha256,manifestSha256});
  assert.equal(verified.ok,false);
  assert.ok(verified.errors.includes('releaseSha256 mismatch'),'release receipt mutation must be detected');

  verified=await verifyFinalReleaseObject(release,{artifactDir,sourceCommit:'e'.repeat(40),bundleSha256,manifestSha256});
  assert.equal(verified.ok,false);
  assert.ok(verified.errors.includes('final release source commit mismatch'),'wrong source commit must be detected');

  const finalizer=await readFile(path.join(root,'scripts/p1-12-finalize-v3.mjs'),'utf8');
  assert.ok(finalizer.includes('finalArtifactSnapshot()'),'P1-12 finalizer must snapshot final dist-v3 artifact');
  assert.ok(finalizer.includes('release.releaseSha256=finalReleaseSha256(release)'),'P1-12 finalizer must seal canonical release receipt');
  assert.ok(finalizer.includes("run('p1-18-final-artifact-verify-v3.mjs')"),'P1-12 finalizer must re-verify final artifact after writing receipt');
  console.log(`P1-18 Final Artifact Binding smoke PASS · tree=${artifact.treeSha256} · release=${release.releaseSha256} · artifact/release/source mutations fail closed`);
} finally {
  await rm(temp,{recursive:true,force:true});
}
