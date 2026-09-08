import crypto from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './lib-v3-production.mjs';
import { buildFinalAcceptanceReport, sourceIdentity } from './lib-p1-10-final-acceptance-v3.mjs';
import { FINAL_BUNDLE_FILE, FINAL_BUNDLE_MANIFEST_FILE, readFinalSession, sessionState, verifyBundleObjects } from './lib-p1-11-final-session-v3.mjs';

const report=await buildFinalAcceptanceReport();
if(!report.promotion.allowed){
  const missing=report.gates.filter(x=>x.status!=='READY').map(x=>`${x.label}=${x.status}`).join('；');
  console.error(`Final packaging forbidden: ${report.ready}/${report.total} READY. ${missing}`);
  process.exit(1);
}
const source=sourceIdentity(),session=await readFinalSession(),state=sessionState(session,source);
if(state.status!=='SEALED'){
  console.error(`Final packaging forbidden: P1-11 Final Acceptance Session is ${state.status}. Run final:v31:session:seal after 8/8 READY.`);
  process.exit(1);
}
let bundle,manifest;
try{bundle=JSON.parse(await readFile(path.join(root,FINAL_BUNDLE_FILE),'utf8'));manifest=JSON.parse(await readFile(path.join(root,FINAL_BUNDLE_MANIFEST_FILE),'utf8'));}
catch{console.error('Final packaging forbidden: sealed P1-11 evidence bundle/manifest missing.');process.exit(1)}
const verified=verifyBundleObjects(bundle,manifest);
if(!verified.ok||manifest.strict!==true||manifest.sourceCommit!==source.commit||manifest.sessionId!==session.sessionId||session.bundleSha256!==manifest.bundleSha256||session.manifestSha256!==manifest.manifestSha256){
  console.error(`Final packaging forbidden: P1-11 evidence bundle verification failed. ${verified.errors.join('；')}`);
  process.exit(1);
}
await mkdir(path.join(root,'reports'),{recursive:true});
const gateBytes=Buffer.from(JSON.stringify(report));
const guard={stage:'P1-11',version:report.version,generatedAt:new Date().toISOString(),source:report.source,sessionId:session.sessionId,sessionStatus:session.status,acceptance:'8/8 READY',gateSha256:crypto.createHash('sha256').update(gateBytes).digest('hex'),bundleSha256:manifest.bundleSha256,manifestSha256:manifest.manifestSha256,promotionAllowed:true};
await writeFile(path.join(root,'reports/p1-11-final-package-guard.json'),JSON.stringify(guard,null,2)+'\n');
await writeFile(path.join(root,'reports/p1-10-final-package-guard.json'),JSON.stringify({...guard,compatibilityAlias:'p1-10-final-package-guard.json'},null,2)+'\n');
console.log(`P1-11 Final package guard PASS · 8/8 READY · SEALED ${session.sessionId} · ${report.source.commit}`);
