import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './lib-v3-production.mjs';
import { FINALIZATION_REQUIRED_VERSION, FINALIZATION_REQUIRED_SCHEMA, finalizationFingerprint } from './lib-p1-12-finalization-v3.mjs';

const assert=(c,m)=>{if(!c)throw new Error(m)};
assert(FINALIZATION_REQUIRED_VERSION==='3.1.0','finalization version must be current 3.1.0');
assert(FINALIZATION_REQUIRED_SCHEMA==='3.1-alpha24','schema freeze must remain alpha24');
const a={source:{commit:'a'.repeat(40)},session:{sessionId:'fa-test'},manifest:{bundleSha256:'b'.repeat(64),manifestSha256:'c'.repeat(64)},version:'3.1.0',schema:'3.1-alpha24'};
const b=structuredClone(a);b.session.sessionId='fa-other';
assert(/^[0-9a-f]{64}$/.test(finalizationFingerprint(a)),'finalization fingerprint must be SHA-256');
assert(finalizationFingerprint(a)!==finalizationFingerprint(b),'session change must change finalization fingerprint');

const legacy=await readFile(path.join(root,'scripts/v31-finalize-v3.mjs'),'utf8');
assert(legacy.includes("import('./p1-12-finalize-v3.mjs')"),'legacy v31 finalize must route to P1-12');
assert(!legacy.includes('v31-final-promotion-gate-v3.mjs'),'legacy RC2 promotion gate bypass must be removed');
assert(!legacy.includes("pkg.version='3.1.0'"),'finalization must not rewrite package version after session seal');
const finalizer=await readFile(path.join(root,'scripts/p1-12-finalize-v3.mjs'),'utf8');
for(const required of ['p1-10-final-package-guard-v3.mjs','p1-12-finalization-gate-v3.mjs','p1-11-final-evidence-verify-v3.mjs'])assert(finalizer.includes(required),`P1-12 finalizer missing ${required}`);
assert(!finalizer.includes("writeFile(pkgPath"),'P1-12 finalizer must not rewrite tracked package.json');
console.log('P1-12 Finalization Bypass Closure smoke PASS');
