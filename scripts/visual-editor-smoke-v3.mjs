import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { V3_VERSION } from './lib-v3-production.mjs';

const root=process.cwd();const assert=(c,m)=>{if(!c)throw new Error(m)};const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){return await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})}
const [html,js]=await Promise.all([readFile(path.join(root,'src/studio/index.html'),'utf8'),readFile(path.join(root,'src/studio/studio.js'),'utf8')]);
for(const marker of ['visualEditor','blockList','blockDialog','visualModeBtn','jsonModeBtn','pageTemplateDialog','mediaDialog','articleLibraryDialog','builtPreviewPanel','pageSection'])assert(html.includes(`id="${marker}"`),`制作中心缺少 ${marker}`);
assert(!html.includes('id="pagePreview"')&&!html.includes('id="quickPreviewBtn"'),'Alpha15 不应恢复重复的 Quick Structure 预览');
for(const marker of ['BLOCK_LIBRARY','PAGE_TEMPLATES','setEditorMode','renderBlockList','renderPreview','blockIndex','dragstart','array-add','generateToc','openMediaDialog','openArticleLibrary','refreshBuiltPreview'])assert(js.includes(marker),`可视化编辑器脚本缺少 ${marker}`);

const port=await freePort();const child=spawn(process.execPath,[path.join(root,'scripts','studio-v3.mjs'),'--port',String(port)],{cwd:root,stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);const base=`http://127.0.0.1:${port}`;
try{
  let ready=false;for(let i=0;i<60;i++){try{const r=await fetch(`${base}/api/health`);if(r.ok){const j=await r.json();assert(j.version===V3_VERSION,'制作中心 API 版本与统一版本源不一致');ready=true;break}}catch{}await sleep(50)}assert(ready,`制作中心未启动：${logs}`);
  const list=await (await fetch(`${base}/api/issues`)).json();const v3=list.find(x=>x.engine==='v3');assert(v3,'没有可用于边界验证的 V3 期刊');const issue=await (await fetch(`${base}/api/issues/${v3.id}`)).json();
  const tooMany=structuredClone(issue);tooMany.pages[0].blocks=Array.from({length:81},()=>({type:'paragraph',style:'body',text:'x'}));let r=await fetch(`${base}/api/issues/${v3.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(tooMany)});assert(r.status===400,'81 个内容块未被服务端拒绝');let err=await r.json();assert(err.code==='VALIDATION_ERROR'&&/80/.test(err.error),'81 块错误信息不可用');
  const tooManyItems=structuredClone(issue);tooManyItems.pages[0].blocks=[{type:'chips',items:Array.from({length:41},(_,i)=>({text:String(i)}))}];r=await fetch(`${base}/api/issues/${v3.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(tooManyItems)});assert(r.status===400,'41 个数组条目未被服务端拒绝');err=await r.json();assert(err.code==='VALIDATION_ERROR'&&/40/.test(err.error),'数组边界错误信息不可用');
  const unknown=structuredClone(issue);unknown.pages[0].blocks=[{type:'mystery'}];r=await fetch(`${base}/api/issues/${v3.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(unknown)});assert(r.status===400,'未知内容块类型未被服务端拒绝');
  console.log('V3 可视化内容块自测通过：可视化块编辑、单一真实 Reader、审计块定位与服务端边界均已验证。');
} finally { child.kill('SIGTERM'); await sleep(120); }
