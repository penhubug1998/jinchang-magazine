import crypto from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './lib-v3-production.mjs';
import { buildFinalAcceptanceReport } from './lib-p1-10-final-acceptance-v3.mjs';

const report=await buildFinalAcceptanceReport();
if(!report.promotion.allowed){
  const missing=report.gates.filter(x=>x.status!=='READY').map(x=>`${x.label}=${x.status}`).join('；');
  console.error(`Final packaging forbidden: ${report.ready}/${report.total} READY. ${missing}`);
  process.exit(1);
}
await mkdir(path.join(root,'reports'),{recursive:true});
const gateBytes=Buffer.from(JSON.stringify(report));
const manifest={stage:'P1-10',version:report.version,generatedAt:new Date().toISOString(),source:report.source,acceptance:'8/8 READY',gateSha256:crypto.createHash('sha256').update(gateBytes).digest('hex'),promotionAllowed:true};
await writeFile(path.join(root,'reports/p1-10-final-package-guard.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`P1-10 Final package guard PASS · 8/8 READY · ${report.source.commit}`);
