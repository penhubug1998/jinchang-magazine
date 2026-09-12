import { mkdtemp, mkdir, cp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { V3_VERSION } from './lib-v3-production.mjs';

const root=process.cwd();
const assert=(c,m)=>{if(!c)throw new Error(m)};
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
assert(pkg.version===V3_VERSION,'Alpha14 基线：package 与统一版本源不一致');
const [studio,reader,index]=await Promise.all([
  readFile(path.join(root,'src/studio/studio.js'),'utf8'),
  readFile(path.join(root,'src/reader/reader.js'),'utf8'),
  readFile(path.join(root,'src/studio/index.html'),'utf8')
]);
assert(studio.includes('READER_PREVIEW_DEVICES'),'制作中心缺少多尺寸 Reader 预览配置');
assert(studio.includes("type:'issue'"),'制作中心没有向 Reader 推送编辑稿');
assert(studio.includes("data.type==='page'"),'制作中心没有接收 Reader 翻页联动');
assert(reader.includes('studioEmbed'),'Reader 缺少 Studio 嵌入模式');
assert(reader.includes('postStudio("ready"'),'Reader 没有向制作中心报告 ready');
assert(reader.includes('data.type === "issue"'),'Reader 没有接收实时 issue 数据');
assert(index.includes('PC · 1366×768')&&index.includes('手机 · 390×844'),'制作中心缺少多尺寸快速切换');

async function freePort(){return await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})}
const sandbox=await mkdtemp(path.join(os.tmpdir(),'alpha14-api-'));
const issue=JSON.parse(await readFile(path.join(root,'issues','002','issue.json'),'utf8'));
try{
  await mkdir(path.join(sandbox,'scripts'),{recursive:true});
  await mkdir(path.join(sandbox,'src'),{recursive:true});
  await mkdir(path.join(sandbox,'issues','002'),{recursive:true});
  const studioSupport=(await readdir(path.join(root,'scripts'))).filter(f=>/^lib-v3-.*\.mjs$/.test(f));
  for(const f of [...new Set([...studioSupport,'sync-assets-v3.mjs','studio-v3.mjs'])]) await cp(path.join(root,'scripts',f),path.join(sandbox,'scripts',f));
  await cp(path.join(root,'src','studio'),path.join(sandbox,'src','studio'),{recursive:true});
  await cp(path.join(root,'src','reader'),path.join(sandbox,'src','reader'),{recursive:true});
  await cp(path.join(root,'package.json'),path.join(sandbox,'package.json'));
  await writeFile(path.join(sandbox,'issues','002','issue.json'),JSON.stringify(issue,null,2));
  const port=await freePort(),base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,[path.join(sandbox,'scripts','studio-v3.mjs'),'--port',String(port)],{cwd:sandbox,stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  try{
    let ready=false;for(let i=0;i<80;i++){try{const r=await fetch(`${base}/api/health`);if(r.ok){const j=await r.json();assert(j.version===V3_VERSION,'Alpha14 API version mismatch');ready=true;break}}catch{}await sleep(40)}
    assert(ready,`Alpha14 Studio API failed to start: ${logs}`);
    const draft=structuredClone(issue);draft.pages[1].title='Alpha14 实时预览未保存标题';
    let r=await fetch(`${base}/api/issues/002/live-preview`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)});let j=await r.json();
    assert(r.ok&&j.pages===29&&j.preview==='/live-preview/002/','实时预览 POST 接口失败');
    r=await fetch(`${base}/live-preview/002/issue.json`);j=await r.json();assert(j.pages[1].title==='Alpha14 实时预览未保存标题','实时预览没有返回内存编辑稿');
    const disk=JSON.parse(await readFile(path.join(sandbox,'issues','002','issue.json'),'utf8'));assert(disk.pages[1].title!==draft.pages[1].title,'实时预览错误写入了磁盘 issue.json');
    for(const file of ['index.html','reader.css','reader.js']){r=await fetch(`${base}/live-preview/002/${file}`);assert(r.ok,`实时 Reader 缺少 ${file}`)}
    const bad={...draft,id:'999'};r=await fetch(`${base}/api/issues/002/live-preview`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(bad)});assert(r.status===400,'实时预览应拒绝 issue.id 不一致');
    console.log('V3 alpha14 smoke 通过：真实 Reader 实时预览 API、未保存稿内存隔离、多尺寸/双向联动代码结构正常。');
  }finally{child.kill('SIGTERM');await sleep(100)}
} finally { await rm(sandbox,{recursive:true,force:true}); }
