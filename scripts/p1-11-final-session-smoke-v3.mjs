import { canonicalSessionId, sessionState, sha256Json, verifyBundleObjects, evidenceFileEntry, verifyEvidenceFiles } from './lib-p1-11-final-session-v3.mjs';

const assert=(c,m)=>{if(!c)throw new Error(m)};
const source={commit:'a'.repeat(40),committedAt:'2026-09-08T00:00:00Z',available:true};
const active={stage:'P1-11',version:'3.1.0',sessionId:canonicalSessionId(source,new Date('2026-09-08T01:02:03Z')),status:'ACTIVE',source};
assert(active.sessionId==='fa-20260908010203-aaaaaaaaaaaa','session id must bind timestamp + commit');
assert(sessionState(active,source).status==='ACTIVE','same source session should be ACTIVE');
assert(sessionState(active,{...source,commit:'b'.repeat(40)}).status==='STALE','source drift must stale the session');
assert(sessionState({...active,status:'SEALED'},source).status==='SEALED','sealed session should remain sealed on same source');

const bundle={stage:'P1-11',version:'3.1.0',generatedAt:'2026-09-08T01:02:04Z',strict:false,source,session:active,acceptance:{ready:2,total:8},files:[{path:'reports/example.json',present:true,bytes:2,sha256:'c'.repeat(64),data:{}}]};
bundle.bundleSha256=sha256Json(bundle);
const manifest={stage:'P1-11',version:'3.1.0',generatedAt:bundle.generatedAt,strict:false,sessionId:active.sessionId,sourceCommit:source.commit,ready:2,total:8,bundleSha256:bundle.bundleSha256,files:bundle.files.map(x=>({path:x.path,present:x.present,bytes:x.bytes,sha256:x.sha256}))};
manifest.manifestSha256=sha256Json(manifest);
assert(verifyBundleObjects(bundle,manifest).ok,'fresh bundle should verify');
const tampered=structuredClone(bundle);tampered.acceptance.ready=8;assert(!verifyBundleObjects(tampered,manifest).ok,'tampered bundle must fail verification');
const badManifest=structuredClone(manifest);badManifest.sourceCommit='d'.repeat(40);assert(!verifyBundleObjects(bundle,badManifest).ok,'tampered manifest must fail verification');

const packageEntry=await evidenceFileEntry('package.json');
const diskManifest={files:[{path:packageEntry.path,present:packageEntry.present,bytes:packageEntry.bytes,sha256:packageEntry.sha256}]};
assert((await verifyEvidenceFiles(diskManifest)).ok,'current package.json evidence should verify');
const wrongDisk={files:[{...diskManifest.files[0],sha256:'0'.repeat(64)}]};
assert(!(await verifyEvidenceFiles(wrongDisk)).ok,'wrong on-disk hash must fail');
console.log('P1-11 Final Acceptance Session smoke PASS');
