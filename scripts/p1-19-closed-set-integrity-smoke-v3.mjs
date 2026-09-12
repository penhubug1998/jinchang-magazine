import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { verifyIntegrity, writeDeploymentArtifacts } from './lib-v3-deploy.mjs';

const temp=await mkdtemp(path.join(os.tmpdir(),'jm-p119-integrity-'));
try{
  await writeFile(path.join(temp,'index.html'),'<html>ok</html>');
  await writeFile(path.join(temp,'reader.js'),'console.log("ok")\n');
  const manifest=await writeDeploymentArtifacts(temp,{issue:'999'});
  assert.equal(manifest.totalFiles,2);
  let result=await verifyIntegrity(temp);
  assert.equal(result.ok,true,result.errors.join('; '));
  assert.equal(result.actualFiles,2);
  assert.equal(result.calculatedTreeSha256,manifest.treeSha256);

  await writeFile(path.join(temp,'injected.js'),'alert(1)\n');
  result=await verifyIntegrity(temp);
  assert.equal(result.ok,false);
  assert.ok(result.errors.includes('未登记额外文件：injected.js'),'extra file must fail closed');
  await rm(path.join(temp,'injected.js'));

  const manifestFile=path.join(temp,'integrity.json');
  const original=JSON.parse(await readFile(manifestFile,'utf8'));
  const badTree={...original,treeSha256:'0'.repeat(64)};
  await writeFile(manifestFile,JSON.stringify(badTree,null,2)+'\n');
  result=await verifyIntegrity(temp);
  assert.equal(result.ok,false);
  assert.ok(result.errors.includes('manifest treeSha256 自校验失败'),'tampered treeSha256 must be rejected');

  const badTotals={...original,totalFiles:999,totalBytes:1};
  await writeFile(manifestFile,JSON.stringify(badTotals,null,2)+'\n');
  result=await verifyIntegrity(temp);
  assert.equal(result.ok,false);
  assert.ok(result.errors.some(x=>x.startsWith('manifest totalFiles 不一致')),'tampered totalFiles must be rejected');
  assert.ok(result.errors.some(x=>x.startsWith('manifest totalBytes 不一致')),'tampered totalBytes must be rejected');

  const duplicate={...original,files:[...original.files,original.files[0]],totalFiles:original.files.length+1,totalBytes:original.totalBytes+original.files[0].bytes};
  await writeFile(manifestFile,JSON.stringify(duplicate,null,2)+'\n');
  result=await verifyIntegrity(temp);
  assert.equal(result.ok,false);
  assert.ok(result.errors.some(x=>x.startsWith('manifest 重复文件：')),'duplicate manifest paths must be rejected');

  await writeFile(manifestFile,JSON.stringify(original,null,2)+'\n');
  await writeFile(path.join(temp,'index.html'),'<html>modified</html>');
  result=await verifyIntegrity(temp);
  assert.equal(result.ok,false);
  assert.ok(result.errors.some(x=>x.includes('index.html')),'modified listed file must still be rejected');

  console.log(`P1-19 Closed-set Integrity smoke PASS · files=${manifest.totalFiles} · tree=${manifest.treeSha256} · extra/tree/totals/duplicate/content mutations fail closed`);
} finally {
  await rm(temp,{recursive:true,force:true});
}
