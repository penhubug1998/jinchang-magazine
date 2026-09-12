import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createTestWorkspace,writePublicationFixture,startTestStudio,stopTestStudio,removeTestWorkspace} from './lib-v3-test-workspace.mjs';
const dir=await createTestWorkspace('pdf-export');let studio;
try{
  const issue=await writePublicationFixture(dir);studio=await startTestStudio(dir,{V3_STRICT_RELEASE:'1'});
  const status=await(await fetch(studio.base+'/api/issues/003/publication/status')).json();assert(status.exportCapabilities?.pdf?.available,'PDF 验收需要可执行 Chrome / Edge / Chromium，或配置 CHROMIUM');
  const exportPdf=async()=>{const response=await fetch(studio.base+'/api/issues/003/publication/pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});return {response,result:await response.json()}};
  const created=await exportPdf();assert(created.response.ok,JSON.stringify(created.result));
  const bytes=Buffer.from(await(await fetch(studio.base+created.result.output.url)).arrayBuffer());assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert(bytes.length>1000);
  const file=path.join(dir,created.result.output.path);
  issue.pages[2].blocks=[{type:'paragraph',text:'排版溢出检测。'.repeat(1000)}];await writeFile(path.join(dir,'issues/003/issue.json'),JSON.stringify(issue,null,2));
  const overflow=await exportPdf();assert.equal(overflow.result.code,'PDF_CONTENT_OVERFLOW',JSON.stringify(overflow.result));assert.match(overflow.result.error,/3/);
  assert((await readFile(file)).equals(bytes),'失败导出不得破坏上次成功 PDF');
  console.log('PDF 验收通过：浏览器自动发现、真实四页图文 PDF、超长内容明确阻断、失败保留上次导出。');
  if(process.argv.includes('--keep'))console.log(`PDF 验收文件：${file}`);
}finally{await stopTestStudio(studio);if(!process.argv.includes('--keep'))await removeTestWorkspace(dir)}
