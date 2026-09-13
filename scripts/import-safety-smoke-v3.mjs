import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
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
  // 无法解码的替换字符（U+FFFD）必须在发布前审计里露面。
  // 2026-09-13 第三期有 2 个 U+FFFD 上线：它看着像乱码方块，但删掉相邻文字去不掉，
  // 编辑器也不知道它是坏字符。审计必须替编辑把它指出来。
  const issue=JSON.parse(await readFile(file,'utf8'));
  const target=(issue.pages||[]).flatMap(p=>p.blocks||[]).find(b=>typeof b.text==='string'&&b.text.length>10);
  assert(target,'测试固件里找不到可写的文本块');
  target.text=`这段文字里有一个\uFFFD无法解码的字符。${target.text}`;
  await writeFile(file,JSON.stringify(issue,null,2)+'\n');
  const status=await (await fetch(studio.base+'/api/issues/003/publication/status?refresh=1')).json();
  const findings=status?.audit?.findings||[];
  const codes=findings.map(f=>f.code);
  assert(codes.includes('TEXT_REPLACEMENT_CHAR'),`发布前审计没有指出替换字符：${codes.join(', ')||'（没有任何问题）'}`);
  const finding=findings.find(f=>f.code==='TEXT_REPLACEMENT_CHAR');
  assert(/\uFFFD/.test(String(finding.message)),`替换字符提示没有给出原文：${finding.message}`);
  console.log('导入边界测试通过：500 段完整保留、501 段 fail-closed、API 返回可操作建议、源稿未修改、无法解码字符会被发布审计指出。');
}finally{await stopTestStudio(studio);await removeTestWorkspace(dir)}
