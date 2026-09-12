import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
const workflowDir=path.join(root,'.github','workflows');
const files=(await readdir(workflowDir)).filter(x=>/\.ya?ml$/i.test(x)).sort();
const assert=(condition,message)=>{if(!condition)throw new Error(message)};

const retired=[
  'p1-02-03-studio-flow.yml',
  'p1-10-final-acceptance.yml',
  'p1-11-final-session.yml',
  'p1-12-finalization.yml',
  'p1-13-dependency-security.yml',
  'p1-14-actions-runtime.yml'
];
for(const name of retired) assert(!files.includes(name),`retired stage workflow returned: ${name}`);
assert(files.includes('v3-check.yml'),'v3-check.yml missing');
assert(files.includes('v31-final-ci.yml'),'v31-final-ci.yml missing');

for(const file of files){
  const source=await readFile(path.join(workflowDir,file),'utf8');
  assert(!/contents:\s*write/i.test(source),`${file} must not grant contents: write`);
  assert(!/\bgit\s+(push|commit|rm)\b/i.test(source),`${file} contains source-mutating git command`);
  assert(!/actions\/(checkout|setup-node|upload-artifact)@v4\b/i.test(source),`${file} contains deprecated Node 20-backed Action major`);
}

const finalCi=await readFile(path.join(workflowDir,'v31-final-ci.yml'),'utf8');
for(const token of [
  'permissions:\n  contents: read',
  'actions/checkout@v7',
  'actions/setup-node@v7',
  'actions/upload-artifact@v7',
  'npm audit --audit-level=moderate',
  'npm run test:p1-13',
  'npm run test:p1-12',
  'npm run test:p1-08',
  'npm run final:v31:acceptance:status',
  "['media','edge-desktop','mac-safari','iphone-safari','android-wechat','production-https']"
]) assert(finalCi.includes(token),`v31-final-ci missing required contract: ${token}`);

// Browser-suite policy guard (see RETIRED-BROWSER-SUITES.md).
// The gate is deliberately narrow. Keep its suite list identical to
// `verify:gate` so the definition cannot drift between the two places, and
// keep it small so a new suite has to be argued for rather than added.
const v3Check=await readFile(path.join(workflowDir,'v3-check.yml'),'utf8');
const workflowSuites=(v3Check.match(/suites="([^"]+)"/)||[])[1]?.split(/\s+/)||[];
const packageJson=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const gateSuites=(String(packageJson.scripts?.['verify:gate']||'').match(/test:[A-Za-z0-9:_-]*browser[A-Za-z0-9:_-]*/g)||[]);
assert(workflowSuites.length>=4,`the gate must keep a browser layer, found ${workflowSuites.length} suites`);
assert(workflowSuites.length<=13,`the gate must stay narrow; ${workflowSuites.length} browser suites in v3-check.yml`);
assert(new Set(workflowSuites).size===workflowSuites.length,'v3-check.yml lists a browser suite twice');
for(const suite of workflowSuites) assert(suite in (packageJson.scripts||{}),`v3-check.yml runs unknown script ${suite}`);
assert(JSON.stringify([...workflowSuites].sort())===JSON.stringify([...new Set(gateSuites)].sort()),
  `v3-check.yml browser suites drifted from verify:gate:\n  workflow: ${[...workflowSuites].sort().join(' ')}\n  verify:gate: ${[...new Set(gateSuites)].sort().join(' ')}`);

console.log(`P1-15 CI consolidation smoke PASS · workflows=${files.join(', ')} · read-only · Actions v7 · gate suites=${workflowSuites.length}`);
