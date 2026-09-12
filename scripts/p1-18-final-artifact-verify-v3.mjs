import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { root, exists } from './lib-v3-production.mjs';
import { sourceIdentity } from './lib-p1-10-final-acceptance-v3.mjs';
import { FINAL_BUNDLE_MANIFEST_FILE } from './lib-p1-11-final-session-v3.mjs';
import { FINAL_RELEASE_FILE } from './lib-p1-12-finalization-v3.mjs';
import { verifyFinalReleaseObject } from './lib-p1-18-final-artifact-v3.mjs';

const releaseFile=path.join(root,FINAL_RELEASE_FILE);
const manifestFile=path.join(root,FINAL_BUNDLE_MANIFEST_FILE);
if(!(await exists(releaseFile))){console.error(`missing ${FINAL_RELEASE_FILE}`);process.exit(2)}
if(!(await exists(manifestFile))){console.error(`missing ${FINAL_BUNDLE_MANIFEST_FILE}`);process.exit(2)}
const [release,manifest]=await Promise.all([
  readFile(releaseFile,'utf8').then(JSON.parse),
  readFile(manifestFile,'utf8').then(JSON.parse)
]);
const source=sourceIdentity();
const errors=[];
if(!source.available)errors.push('current Git source identity unavailable');
if(release.stage!=='P1-12'||release.status!=='FINALIZED')errors.push('release receipt is not canonical P1-12 FINALIZED');
if(release.evidence?.ready!==8||release.evidence?.total!==8)errors.push('release receipt does not bind 8/8 evidence');
const verified=await verifyFinalReleaseObject(release,{sourceCommit:source.commit,bundleSha256:manifest.bundleSha256,manifestSha256:manifest.manifestSha256});
errors.push(...verified.errors);
if(errors.length){console.error(`P1-18 final artifact verify FAILED\n${errors.join('\n')}`);process.exit(1)}
console.log(`P1-18 final artifact verify PASS\nsource=${source.commit}\ntreeSha256=${verified.artifact.treeSha256}\nfiles=${verified.artifact.totalFiles}\nbytes=${verified.artifact.totalBytes}\nreleaseSha256=${verified.releaseSha256}`);
