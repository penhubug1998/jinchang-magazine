import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {parsePastedText} from './lib-v3-import.mjs';
import {createTestWorkspace,writePublicationFixture,startTestStudio,stopTestStudio,removeTestWorkspace} from './lib-v3-test-workspace.mjs';
const input=n=>'# 导入边界测试\n\n'+Array.from({length:n},(_,i)=>`第 ${i+1} 段，完整保留内容。`).join('\n\n');
assert.equal(parsePastedText(input(500),{format:'markdown'}).blocks.length,500);
assert.throws(()=>parsePastedText(input(501),{format:'markdown'}),error=>['IMPORT_BLOCK_LIMIT','IMPORT_BLOCK_LIMIT_EXCEEDED'].includes(error.code)&&error.message.includes('501')&&/拆分/.test(error.message));
const dir=await createTestWorkspace('import-safety');let studio;
try{
  await writePublicationFixture(dir);const file=path.join(dir,'issues/003/issue.json'),original=await readFile(file);
  studio=await startTestStudio(dir);
  const response=await fetch(studio.base+'/api/import/parse',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:input(501),format:'markdown'})});
  assert([400,413].includes(response.status),`unexpected HTTP ${response.status}`);const error=await response.json();assert(['IMPORT_BLOCK_LIMIT','IMPORT_BLOCK_LIMIT_EXCEEDED'].includes(error.code),`unexpected code ${error.code}`);assert.match(error.error,/拆分/);assert((await readFile(file)).equals(original));
  console.log('导入边界测试通过：500 段完整保留、501 段 fail-closed、API 返回可操作建议、源稿未修改。');
}finally{await stopTestStudio(studio);await removeTestWorkspace(dir)}
