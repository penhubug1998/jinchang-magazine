import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { root } from './lib-v3-production.mjs';
import { finalizationContext, finalizationFingerprint, summarizeFinalization } from './lib-p1-12-finalization-v3.mjs';

const strict=process.argv.includes('--strict');
const context=await finalizationContext();
const report={...context,fingerprint:finalizationFingerprint(context),generatedAt:new Date().toISOString(),status:context.ready?'READY_FOR_FINALIZATION':'BLOCKED'};
await mkdir(path.join(root,'reports'),{recursive:true});
await writeFile(path.join(root,'reports/p1-12-finalization-gate.json'),JSON.stringify(report,null,2)+'\n');
console.log(`# P1-12 Finalization Gate\n\n${summarizeFinalization(context)}\n\nVersion: ${context.version}\nSchema: ${context.schema}\nSource: ${context.source?.commit||'unavailable'}\nSession: ${context.sessionStatus.status}${context.session?.sessionId?` · ${context.session.sessionId}`:''}\nEvidence: ${context.manifest?.ready??0}/${context.manifest?.total??8}\nTracked source clean: ${context.clean.ok?'YES':'NO'}\n`);
if(strict&&!context.ready)process.exit(1);
