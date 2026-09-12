import crypto from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './lib-v3-production.mjs';
import { buildFinalAcceptanceReport } from './lib-p1-10-final-acceptance-v3.mjs';

const strict=process.argv.includes('--strict');
const exportEvidence=process.argv.includes('--export');
const report=await buildFinalAcceptanceReport();
await mkdir(path.join(root,'reports'),{recursive:true});
const jsonFile=path.join(root,'reports/p1-10-final-acceptance.json');
await writeFile(jsonFile,JSON.stringify(report,null,2)+'\n');
const icon=status=>status==='READY'?'✅':status==='FAILED'?'❌':status==='STALE'?'♻️':status==='NOT_RUN'?'○':'⏳';
const md=['# P1-10 Final Acceptance','',`**${report.status}** · ${report.ready}/${report.total} READY`,'',`源码：${report.source.commit||'unavailable'} · ${report.source.committedAt||'unavailable'}`,'',...report.gates.map(x=>`${icon(x.status)} **${x.label}** · ${x.status}\n   ${x.detail}${x.status==='READY'?'':`\n   下一步：${x.action}`}`),'',`晋级：${report.promotion.allowed?'ALLOWED':'BLOCKED'} · ${report.promotion.required}`,''];
await writeFile(path.join(root,'reports/p1-10-final-acceptance.md'),md.join('\n'));
if(exportEvidence){
  const files=['reports/p1-10-final-acceptance.json','reports/p1-09-final-evidence-gate.json','reports/p1-08-production-e2e-last.json','reports/v31-final-media-receipt.json','reports/v3-rc1-device-acceptance.json','reports/v31-final-production-receipt.json'];
  const evidence=[];for(const rel of files){try{const data=await readFile(path.join(root,rel));evidence.push({path:rel,bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')});}catch{evidence.push({path:rel,missing:true});}}
  const manifest={stage:'P1-10',generatedAt:new Date().toISOString(),source:report.source,status:report.status,ready:report.ready,total:report.total,promotion:report.promotion,evidence};
  await writeFile(path.join(root,'reports/p1-10-final-evidence-export.json'),JSON.stringify(manifest,null,2)+'\n');
}
console.log(md.join('\n'));
if(strict&&!report.promotion.allowed)process.exit(1);
