import crypto from 'node:crypto';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { exists, normalizeIssueId, root } from './lib-v3-production.mjs';
import { PUBLICATION_OUTPUT_ROOT, publicationIssueFingerprint, publicationSourceIdentity } from './lib-v3-publication.mjs';
import { finalArtifactSnapshot } from './lib-p1-18-final-artifact-v3.mjs';

const posix=value=>String(value||'').replaceAll('\\','/');
const sha256Buffer=value=>crypto.createHash('sha256').update(value).digest('hex');
const jsonSha=value=>sha256Buffer(Buffer.from(JSON.stringify(value)));

export function finalDeliverySha256(delivery={}){
  const copy={...delivery};
  delete copy.deliverySha256;
  return jsonSha(copy);
}

async function readJson(file){return JSON.parse(await readFile(file,'utf8'));}
async function fileSha256(file){return sha256Buffer(await readFile(file));}

export function canonicalDeliveryOutput(kind,issueId,{rootDir=root,outputRoot=PUBLICATION_OUTPUT_ROOT}={}){
  const id=normalizeIssueId(issueId);
  const name=kind==='pdf'?`${id}-print.pdf`:kind==='archive'?`${id}-archive.zip`:'';
  if(!name)throw new Error(`Unsupported final delivery kind: ${kind}`);
  const absolute=path.join(outputRoot,id,name);
  return {absolute,path:posix(path.relative(rootDir,absolute))};
}

export async function verifyBoundPublicationOutput(entry,{kind,issueId,issueFingerprint,sourceCommit,rootDir=root,outputRoot=PUBLICATION_OUTPUT_ROOT}={}){
  const errors=[];
  const expected=canonicalDeliveryOutput(kind,issueId,{rootDir,outputRoot});
  if(!entry||typeof entry!=='object')return {ok:false,errors:[`${kind} publication evidence missing`],snapshot:null};
  if(entry.kind!==kind)errors.push(`${kind} kind mismatch`);
  if(entry.path!==expected.path)errors.push(`${kind} canonical path mismatch`);
  if(entry.issueFingerprint!==issueFingerprint)errors.push(`${kind} issue fingerprint mismatch`);
  if(entry.sourceAvailable!==true)errors.push(`${kind} source identity unavailable at generation`);
  if(entry.sourceClean!==true)errors.push(`${kind} generated from dirty tracked source`);
  if(!sourceCommit||entry.sourceCommit!==sourceCommit)errors.push(`${kind} source commit mismatch`);
  if(!/^[0-9a-f]{64}$/i.test(String(entry.sha256||'')))errors.push(`${kind} sha256 missing or invalid`);
  if(!Number.isInteger(entry.bytes)||entry.bytes<=0)errors.push(`${kind} byte count missing or invalid`);
  let actualBytes=null,actualSha=null;
  if(!(await exists(expected.absolute)))errors.push(`${kind} file missing: ${expected.path}`);
  else {
    const info=await stat(expected.absolute);actualBytes=info.size;actualSha=await fileSha256(expected.absolute);
    if(actualBytes!==entry.bytes)errors.push(`${kind} byte count mismatch`);
    if(actualSha!==entry.sha256)errors.push(`${kind} file sha256 mismatch`);
  }
  const generatedAt=String(entry.generatedAt||'');
  if(!generatedAt||Number.isNaN(Date.parse(generatedAt)))errors.push(`${kind} generatedAt missing or invalid`);
  const snapshot={kind,path:expected.path,bytes:actualBytes??entry.bytes,sha256:actualSha??entry.sha256,generatedAt,issueFingerprint,sourceCommit};
  return {ok:errors.length===0,errors,snapshot};
}

export async function finalDeliverySnapshot(issueId,{rootDir=root,outputRoot=PUBLICATION_OUTPUT_ROOT,sourceCommit=null,evidence=null,issue=null,webArtifact=null}={}){
  const id=normalizeIssueId(issueId);
  if(!id)throw new Error('Final delivery requires a valid issue id');
  if(!issue){const issueFile=path.join(rootDir,'issues',id,'issue.json');if(!(await exists(issueFile)))throw new Error(`Final delivery issue missing: issues/${id}/issue.json`);issue=await readJson(issueFile);}
  if(String(issue.id)!==id)throw new Error(`Final delivery issue id mismatch: ${issue.id} != ${id}`);
  const issueFingerprint=publicationIssueFingerprint(issue);
  if(!sourceCommit){const source=publicationSourceIdentity(rootDir);sourceCommit=source.commit;}
  if(!sourceCommit)throw new Error('Final delivery source commit unavailable');
  if(!evidence){const evidenceFile=path.join(outputRoot,id,'publication-evidence.json');if(!(await exists(evidenceFile)))throw new Error(`Final delivery publication evidence missing: ${posix(path.relative(rootDir,evidenceFile))}`);evidence=await readJson(evidenceFile);}
  if(String(evidence.issue)!==id)throw new Error(`Final delivery evidence issue mismatch: ${evidence.issue} != ${id}`);
  const pdf=await verifyBoundPublicationOutput(evidence.outputs?.pdf,{kind:'pdf',issueId:id,issueFingerprint,sourceCommit,rootDir,outputRoot});
  const archive=await verifyBoundPublicationOutput(evidence.outputs?.archive,{kind:'archive',issueId:id,issueFingerprint,sourceCommit,rootDir,outputRoot});
  const errors=[...pdf.errors,...archive.errors];
  const pdfAt=Date.parse(pdf.snapshot?.generatedAt||''),archiveAt=Date.parse(archive.snapshot?.generatedAt||'');
  if(Number.isFinite(pdfAt)&&Number.isFinite(archiveAt)&&archiveAt<pdfAt)errors.push('archive was generated before the current PDF; regenerate Archive ZIP after PDF');
  if(errors.length)throw new Error(`Final delivery outputs invalid: ${errors.join('；')}`);
  const web=webArtifact||await finalArtifactSnapshot(path.join(rootDir,'dist-v3'));
  const delivery={stage:'P1-21',issue:id,issueFingerprint,sourceCommit,web,pdf:pdf.snapshot,archive:archive.snapshot};
  delivery.deliverySha256=finalDeliverySha256(delivery);
  return delivery;
}

export async function verifyFinalDeliveryObject(release,{rootDir=root,outputRoot=PUBLICATION_OUTPUT_ROOT,sourceCommit=null,evidence=null,issue=null,webArtifact=null}={}){
  const errors=[];
  if(!release||typeof release!=='object')return {ok:false,errors:['final release receipt missing'],delivery:null};
  const issueId=normalizeIssueId(release.session?.issue||release.delivery?.issue||'');
  const expectedCommit=sourceCommit||release.source?.commit||null;
  if(!issueId)errors.push('final delivery issue id missing');
  if(!release.delivery)errors.push('final delivery binding missing');
  else if(!/^[0-9a-f]{64}$/i.test(String(release.delivery.deliverySha256||'')))errors.push('deliverySha256 missing or invalid');
  else if(finalDeliverySha256(release.delivery)!==release.delivery.deliverySha256)errors.push('deliverySha256 mismatch');
  if(expectedCommit&&release.source?.commit!==expectedCommit)errors.push('final delivery release source commit mismatch');
  let actual=null;
  if(issueId&&expectedCommit){
    try{actual=await finalDeliverySnapshot(issueId,{rootDir,outputRoot,sourceCommit:expectedCommit,evidence,issue,webArtifact});}
    catch(error){errors.push(error.message||String(error));}
  }
  if(actual&&release.delivery){
    if(release.delivery.deliverySha256!==actual.deliverySha256)errors.push('final delivery bundle no longer matches current Web/PDF/Archive');
    if(release.artifact?.treeSha256!==actual.web?.treeSha256)errors.push('P1-18 artifact and P1-21 web binding disagree');
  }
  return {ok:errors.length===0,errors,delivery:actual};
}
