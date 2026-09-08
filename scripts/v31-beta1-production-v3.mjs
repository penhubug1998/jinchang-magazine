// V3.1 Beta1 production rehearsal delegates to the current P1-08 end-to-end
// production acceptance so the historical RC verification chain cannot keep
// stale assumptions. Preserve the historical report filename as a compatibility
// receipt because v31-rc2-gate-v3.mjs still consumes that contract.
import { copyFile } from 'node:fs/promises';
import path from 'node:path';

await import('./p1-08-production-e2e-v3.mjs');

const root=process.cwd();
await copyFile(
  path.join(root,'reports','p1-08-production-e2e-last.json'),
  path.join(root,'reports','v31-beta1-production-last.json')
);
console.log('V3.1 Beta1 compatibility receipt refreshed from P1-08 production E2E.');
