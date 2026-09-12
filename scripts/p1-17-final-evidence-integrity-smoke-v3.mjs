import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './lib-v3-production.mjs';
import { evidenceSha256, evidenceIntegrityStatus } from './lib-final-evidence-integrity-v3.mjs';
import { receiptEvidenceStatus } from './lib-p1-10-final-acceptance-v3.mjs';

const source={commit:'a'.repeat(40),committedAt:'2026-09-08T01:00:00.000Z',available:true};
const seal=row=>{const copy={...row};copy.evidenceSha256=evidenceSha256(copy);return copy};
const ready=seal({version:'3.1.0',generatedAt:'2026-09-08T02:00:00.000Z',sourceCommit:source.commit,sourceCommittedAt:source.committedAt,status:'passed'});

assert.equal(evidenceIntegrityStatus(ready).status,'READY');
assert.equal(receiptEvidenceStatus(ready,source,{kind:'test receipt'}).status,'READY');

const missing={...ready};delete missing.evidenceSha256;
assert.equal(evidenceIntegrityStatus(missing).status,'STALE');
assert.equal(receiptEvidenceStatus(missing,source,{kind:'test receipt'}).status,'STALE');

const tampered={...ready,status:'tampered'};
assert.equal(evidenceIntegrityStatus(tampered).status,'FAILED');
assert.equal(receiptEvidenceStatus(tampered,source,{kind:'test receipt'}).status,'FAILED');

const wrongCommit=seal({...ready,sourceCommit:'b'.repeat(40),evidenceSha256:undefined});
assert.equal(receiptEvidenceStatus(wrongCommit,source,{kind:'test receipt'}).status,'STALE');

const old=seal({...ready,generatedAt:'2026-09-07T23:00:00.000Z',evidenceSha256:undefined});
assert.equal(receiptEvidenceStatus(old,source,{kind:'test receipt'}).status,'STALE');

const media=await readFile(path.join(root,'scripts/v31-rc2-media-v3.mjs'),'utf8');
const prod=await readFile(path.join(root,'scripts/v31-final-production-receipt-v3.mjs'),'utf8');
const p109=await readFile(path.join(root,'scripts/p1-09-final-evidence-gate-v3.mjs'),'utf8');
assert(media.includes('receipt.evidenceSha256=evidenceSha256(receipt)'),'media receipt must seal evidenceSha256');
assert(prod.includes('report.evidenceSha256=evidenceSha256(report)'),'production receipt must seal evidenceSha256');
assert(p109.includes('evidenceIntegrityStatus(media)')&&p109.includes('media?.sourceCommit===source.commit'),'P1-09 media gate must verify commit + SHA');
assert(p109.includes('evidenceIntegrityStatus(row)')&&p109.includes('row.sourceCommit===source.commit'),'P1-09 device gate must verify commit + SHA');
assert(p109.includes('evidenceIntegrityStatus(prod)')&&p109.includes('prod?.sourceCommit===source.commit'),'P1-09 production gate must verify commit + SHA');

console.log('P1-17 Final evidence integrity smoke PASS · missing/tampered/wrong-commit/stale receipts fail closed · media/device/HTTPS use SHA-bound current-source evidence');
