import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root } from './lib-v3-production.mjs';
import { integrityManifest, portableNameCompare, treeSha256ForFiles, verifyIntegrity } from './lib-v3-deploy.mjs';

const temp=await mkdtemp(path.join(os.tmpdir(),'jm-p120-portable-tree-'));
try{
  const names=['A.txt','z.txt','é.txt','中.txt','阿.txt'];
  for(const name of names)await writeFile(path.join(temp,name),`${name}\n`);
  await mkdir(path.join(temp,'目录'),{recursive:true});
  await writeFile(path.join(temp,'目录','β.json'),'{}\n');
  await writeFile(path.join(temp,'目录','中文.json'),'{}\n');

  const direct=await integrityManifest(temp,{issue:'999'});
  const topLevel=direct.files.filter(x=>!x.path.includes('/')).map(x=>x.path);
  const expected=[...names].sort(portableNameCompare);
  assert.deepEqual(topLevel,expected,'new manifest top-level order must use UTF-8 byte order');

  const childCode="import {integrityManifest} from './scripts/lib-v3-deploy.mjs';const m=await integrityManifest(process.argv[1],{issue:'999'});process.stdout.write(JSON.stringify({tree:m.treeSha256,paths:m.files.map(x=>x.path)}));";
  const runLocale=locale=>spawnSync(process.execPath,['--input-type=module','-e',childCode,temp],{cwd:root,encoding:'utf8',env:{...process.env,LANG:locale,LC_ALL:locale}});
  const c=runLocale('C');
  const zh=runLocale('zh_CN.UTF-8');
  assert.equal(c.status,0,`C locale manifest failed: ${c.stderr}`);
  assert.equal(zh.status,0,`zh_CN locale manifest failed: ${zh.stderr}`);
  const cData=JSON.parse(c.stdout),zhData=JSON.parse(zh.stdout);
  assert.deepEqual(zhData,cData,'tree hash and file order must be locale-independent');
  assert.equal(cData.tree,direct.treeSha256,'child and current process tree hashes must match');

  const legacyFiles=[...direct.files].reverse();
  const legacy={...direct,generatedAt:'2026-01-01T00:00:00.000Z',files:legacyFiles,treeSha256:treeSha256ForFiles(legacyFiles)};
  await writeFile(path.join(temp,'integrity.json'),JSON.stringify(legacy,null,2)+'\n');
  const verified=await verifyIntegrity(temp);
  assert.equal(verified.ok,true,`stored-order legacy manifest must remain verifiable: ${verified.errors.join('; ')}`);
  assert.equal(verified.calculatedTreeSha256,legacy.treeSha256);

  console.log(`P1-20 Portable Tree Order smoke PASS · locales=C/zh_CN.UTF-8 · files=${direct.totalFiles} · tree=${direct.treeSha256} · stored-order legacy manifest remains valid`);
} finally {
  await rm(temp,{recursive:true,force:true});
}
