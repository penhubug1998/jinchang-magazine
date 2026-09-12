import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { root } from './lib-v3-production.mjs';
import { FINAL_RELEASE_FILE, finalizationContext, finalizationFingerprint } from './lib-p1-12-finalization-v3.mjs';
import { finalArtifactSnapshot, finalReleaseSha256 } from './lib-p1-18-final-artifact-v3.mjs';
import { finalDeliverySnapshot } from './lib-p1-21-final-delivery-v3.mjs';

if(!process.argv.includes('--confirm')){console.error('P1-12 Final 封版需要显式 --confirm');process.exit(2)}
const run=(script,args=[])=>{const r=spawnSync(process.execPath,[path.join(root,'scripts',script),...args],{cwd:root,stdio:'inherit'});if(r.status!==0)process.exit(r.status??1)};

// One hard path only: current-source 8/8 + SEALED Session + strict evidence bundle.
run('p1-10-final-package-guard-v3.mjs');
run('p1-12-finalization-gate-v3.mjs',['--strict']);
run('p1-11-final-evidence-verify-v3.mjs');

// Build/check are allowed because their outputs live in ignored derived-output directories.
// They must never rewrite package.json or any tracked source after acceptance is sealed.
run('check-v3.mjs');
run('build-v3.mjs');

// Re-check the immutable acceptance chain after build so finalization cannot rely on a pre-build snapshot.
run('p1-11-final-evidence-verify-v3.mjs');
run('p1-10-final-package-guard-v3.mjs');
const context=await finalizationContext();
if(!context.ready){console.error(`P1-12 finalization context changed after build: ${context.failed.join(', ')}`);process.exit(1)}
const artifact=await finalArtifactSnapshot();
// P1-21: PDF and Archive must already have been regenerated from this exact,
// clean source commit and current issue source.  Finalization never reuses an
// older output merely because its filename still exists.
const delivery=await finalDeliverySnapshot(context.session?.issue,{sourceCommit:context.source.commit,webArtifact:artifact});

const finalizedAt=new Date().toISOString();
const release={
  stage:'P1-12',version:context.version,schema:context.schema,status:'FINALIZED',finalizedAt,
  source:{commit:context.source.commit,committedAt:context.source.committedAt,branch:context.source.branch},
  session:{id:context.session.sessionId,status:context.session.status,sealedAt:context.session.sealedAt||null,issue:context.session.issue||null},
  evidence:{ready:8,total:8,bundleSha256:context.manifest.bundleSha256,manifestSha256:context.manifest.manifestSha256},
  artifact,
  delivery,
  fingerprint:finalizationFingerprint(context),
  sourceMutation:'none',
  releaseMetadata:context.pkg,
  gate:'reports/p1-12-finalization-gate.json',
  packageGuard:'reports/p1-11-final-package-guard.json',
  note:'P1-12/P1-21 Finalization 不修改跟踪源码；最终回执绑定当前 Git commit、SEALED Session、strict evidence bundle，以及同一干净源码生成的 Web tree、Print PDF 与 Archive ZIP。'
};
release.releaseSha256=finalReleaseSha256(release);
await mkdir(path.dirname(path.join(root,FINAL_RELEASE_FILE)),{recursive:true});
await writeFile(path.join(root,FINAL_RELEASE_FILE),JSON.stringify(release,null,2)+'\n');
// Compatibility receipt points back to the canonical signed receipt; it is not a second canonical signature surface.
await writeFile(path.join(root,'reports/v31-final-release.json'),JSON.stringify({...release,compatibilityAlias:'v31-final-release.json',canonicalReleaseSha256:release.releaseSha256},null,2)+'\n');
run('p1-18-final-artifact-verify-v3.mjs');
run('p1-21-final-delivery-verify-v3.mjs');
console.log(`P1-12 Finalization PASS · ${context.source.commit}\nSession ${context.session.sessionId}\nEvidence ${context.manifest.bundleSha256}\nWeb ${delivery.web.treeSha256}\nPDF ${delivery.pdf.sha256}\nArchive ${delivery.archive.sha256}\nDelivery ${delivery.deliverySha256}\nRelease ${release.releaseSha256}`);
