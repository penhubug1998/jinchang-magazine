import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { finalDeliverySnapshot, verifyFinalDeliveryObject } from './lib-p1-21-final-delivery-v3.mjs';

const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const clone=value=>structuredClone(value);
const tmp=await mkdtemp(path.join(os.tmpdir(),'jm-p121-delivery-'));
const rootDir=path.join(tmp,'project'),outputRoot=path.join(rootDir,'outputs-v3'),id='003';
const sourceCommit='a'.repeat(40),issue={id,engine:'v3',status:'published',label:'P1-21 fixture',pages:[{id:'p1',title:'封面',blocks:[{type:'paragraph',text:'final'}]}]};
const issueFingerprint=sha(Buffer.from(JSON.stringify(issue)));
const webArtifact={path:'dist-v3',totalFiles:9,totalBytes:54321,treeSha256:'b'.repeat(64)};
const pdfPath=path.join(outputRoot,id,`${id}-print.pdf`),archivePath=path.join(outputRoot,id,`${id}-archive.zip`);
const pdfBytes=Buffer.from('%PDF-1.7\nP1-21 fixture\n'),archiveBytes=Buffer.from('PK\u0003\u0004P1-21 archive fixture');

function entry(kind,bytes,generatedAt){
  const file=kind==='pdf'?pdfPath:archivePath;
  return {kind,generatedAt,path:path.relative(rootDir,file).replaceAll('\\','/'),bytes:bytes.length,sha256:sha(bytes),issueFingerprint,sourceAvailable:true,sourceCommit,sourceClean:true};
}

try{
  await mkdir(path.join(rootDir,'issues',id),{recursive:true});
  await mkdir(path.join(outputRoot,id),{recursive:true});
  await writeFile(path.join(rootDir,'issues',id,'issue.json'),JSON.stringify(issue,null,2)+'\n');
  await writeFile(pdfPath,pdfBytes);await writeFile(archivePath,archiveBytes);
  const evidence={version:'3.1.0',issue:id,outputs:{pdf:entry('pdf',pdfBytes,'2026-09-08T03:00:00.000Z'),archive:entry('archive',archiveBytes,'2026-09-08T03:01:00.000Z')}};
  const delivery=await finalDeliverySnapshot(id,{rootDir,outputRoot,sourceCommit,evidence,issue,webArtifact});
  const release={stage:'P1-12',status:'FINALIZED',source:{commit:sourceCommit},session:{issue:id},artifact:webArtifact,delivery};
  let verified=await verifyFinalDeliveryObject(release,{rootDir,outputRoot,sourceCommit,evidence,issue,webArtifact});
  assert(verified.ok,`valid delivery rejected: ${verified.errors.join('; ')}`);

  await writeFile(pdfPath,Buffer.from('%PDF-1.7\nTAMPER\n'));
  verified=await verifyFinalDeliveryObject(release,{rootDir,outputRoot,sourceCommit,evidence,issue,webArtifact});
  assert(!verified.ok&&verified.errors.some(x=>x.includes('pdf file sha256 mismatch')||x.includes('pdf byte count mismatch')),'tampered PDF did not fail closed');
  await writeFile(pdfPath,pdfBytes);

  await writeFile(archivePath,Buffer.from('PK\u0003\u0004TAMPER'));
  verified=await verifyFinalDeliveryObject(release,{rootDir,outputRoot,sourceCommit,evidence,issue,webArtifact});
  assert(!verified.ok&&verified.errors.some(x=>x.includes('archive file sha256 mismatch')||x.includes('archive byte count mismatch')),'tampered Archive did not fail closed');
  await writeFile(archivePath,archiveBytes);

  const oldSource=clone(evidence);oldSource.outputs.pdf.sourceCommit='c'.repeat(40);
  await finalDeliverySnapshot(id,{rootDir,outputRoot,sourceCommit,evidence:oldSource,issue,webArtifact}).then(()=>{throw new Error('old PDF source commit passed')},()=>{});

  const dirty=clone(evidence);dirty.outputs.archive.sourceClean=false;
  await finalDeliverySnapshot(id,{rootDir,outputRoot,sourceCommit,evidence:dirty,issue,webArtifact}).then(()=>{throw new Error('dirty Archive source passed')},()=>{});

  const changedIssue={...issue,subtitle:'changed after delivery'};
  await finalDeliverySnapshot(id,{rootDir,outputRoot,sourceCommit,evidence,issue:changedIssue,webArtifact}).then(()=>{throw new Error('changed issue passed')},()=>{});

  const wrongOrder=clone(evidence);wrongOrder.outputs.archive.generatedAt='2026-09-08T02:59:00.000Z';
  await finalDeliverySnapshot(id,{rootDir,outputRoot,sourceCommit,evidence:wrongOrder,issue,webArtifact}).then(()=>{throw new Error('Archive older than PDF passed')},()=>{});

  const receiptTamper=clone(release);receiptTamper.delivery.pdf.sha256='d'.repeat(64);
  verified=await verifyFinalDeliveryObject(receiptTamper,{rootDir,outputRoot,sourceCommit,evidence,issue,webArtifact});
  assert(!verified.ok&&verified.errors.some(x=>x.includes('deliverySha256 mismatch')),'tampered delivery receipt did not fail closed');

  const wrongReleaseSource=clone(release);wrongReleaseSource.source.commit='e'.repeat(40);
  verified=await verifyFinalDeliveryObject(wrongReleaseSource,{rootDir,outputRoot,sourceCommit,evidence,issue,webArtifact});
  assert(!verified.ok&&verified.errors.some(x=>x.includes('release source commit mismatch')),'wrong release source did not fail closed');

  console.log(`P1-21 Final Delivery Bundle smoke PASS · issue=${id} · web=${webArtifact.treeSha256} · pdf=${evidence.outputs.pdf.sha256} · archive=${evidence.outputs.archive.sha256} · delivery=${delivery.deliverySha256} · mutations fail closed`);
}finally{await rm(tmp,{recursive:true,force:true});}
