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

console.log(`P1-15 CI consolidation smoke PASS · workflows=${files.join(', ')} · read-only · Actions v7`);
