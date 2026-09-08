import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root } from './lib-v3-production.mjs';

const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const guard=await readFile(path.join(root,'scripts/final-release-v3.mjs'),'utf8');
const legacy=await readFile(path.join(root,'scripts/final-release-v30-v3.mjs'),'utf8');
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));

for(const command of ['final:release','final:seal'])assert(String(pkg.scripts?.[command]||'').includes('final-release-v3.mjs'),`${command} must stay routed through the generic guard`);
assert(guard.includes('final:v31'),'generic final guard must direct operators to final:v31');
assert(guard.includes('final-release-v30-v3.mjs'),'generic final guard must preserve an explicit V3.0 historical path');
assert(!guard.includes("writeFile("),'generic final guard must not write release artifacts');
assert(legacy.includes("release:'V3.0.0'")&&legacy.includes('V3.0.0-PACKAGE.json'),'versioned V3.0 implementation was not preserved');

for(const args of [['--confirm'],['--seal','--confirm']]){
  const run=spawnSync(process.execPath,[path.join(root,'scripts/final-release-v3.mjs'),...args],{cwd:root,encoding:'utf8'});
  assert(run.status===64,`ambiguous legacy final command must fail with exit 64, got ${run.status}`);
  const text=`${run.stdout||''}\n${run.stderr||''}`;
  assert(text.includes('final:v31'),'blocked legacy command must explain the V3.1 final entry');
  assert(text.includes('已退役'),'blocked legacy command must explicitly say the alias is retired');
}

console.log('P1-16 legacy final command guard smoke PASS · final:release/final:seal fail closed · V3.0 implementation preserved under versioned script');
