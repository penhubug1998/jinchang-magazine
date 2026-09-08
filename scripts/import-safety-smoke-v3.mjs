import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {parsePastedText} from './lib-v3-import.mjs';
import {createTestWorkspace,writePublicationFixture,startTestStudio,stopTestStudio,removeTestWorkspace} from './lib-v3-test-workspace.mjs';
const input=n=>'# 导入边界测试\n\n'+Array.from({length:n},(_,i)=>`第 ${i+1} 段，完整保留内容。`).join('\n\n');
assert.equal(parsePastedText(input(500),{format:'markdown'}).blocks.length,500);
assert.throws(()=>parsePastedText(input(501),{format:'markdown'}),error=>error.code==='IMPORT_BLOCK_LIMIT'&&error.message.includes('501'));
const dir=await createTestWorkspace('import-safety');let studio;
try{
  await writePublicationFixture(dir);const file=path.join(dir,'issues/003/issue.json'),original=await readFile(file);
  studio=await startTestStudio(dir);
  const response=await fetch(studio.base+'/api/import/parse',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:input(501),format:'markdown'})});
  assert.equal(response.status,400);const error=await response.json();assert.equal(error.code,'IMPORT_BLOCK_LIMIT');assert.match(error.error,/拆成多个文件/);assert((await readFile(file)).equals(original));
  console.log('导入边界测试通过：500 段完整保留、501 段明确报错、API 返回可操作建议、源稿未修改。');
}finally{await stopTestStudio(studio);await removeTestWorkspace(dir)}
