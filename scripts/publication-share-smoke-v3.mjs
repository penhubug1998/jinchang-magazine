import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { exists, root } from './lib-v3-production.mjs';

const pickPort=()=>41000+Math.floor(Math.random()*800);
const publicRoot=await mkdtemp(path.join(os.tmpdir(),'v3-public-share-'));
const staticPort=pickPort(),studioPort=pickPort();
const evidenceFile=path.join(root,'outputs-v3','003','publication-evidence.json');
const reportFile=path.join(root,'reports','v3-public-deployment-003.json');
const originalEvidence=await exists(evidenceFile)?await readFile(evidenceFile):null;
const originalReport=await exists(reportFile)?await readFile(reportFile):null;
const staticServer=http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,`http://${req.headers.host}`).pathname),raw=pathname.replace(/^\/+/,'');let file=path.resolve(publicRoot,raw||'index.html');if(pathname.endsWith('/'))file=path.join(file,'index.html');if(file!==publicRoot&&!file.startsWith(publicRoot+path.sep)){res.writeHead(403);return res.end();}const data=await readFile(file);res.writeHead(200,{'Content-Type':file.endsWith('.json')?'application/json':'text/html'});res.end(data);}catch{res.writeHead(404);res.end('not found');}});
const waitFor=async(fn,limit=100)=>{for(let i=0;i<limit;i++){if(await fn())return;await new Promise(r=>setTimeout(r,80));}throw new Error('测试服务启动超时');};
const post=async(url)=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const data=await r.json();return {r,data};};
let studio;
try{
  await new Promise((resolve,reject)=>staticServer.listen(staticPort,'127.0.0.1',err=>err?reject(err):resolve()));
  studio=spawn(process.execPath,['scripts/studio-v3.mjs','--host','127.0.0.1','--port',String(studioPort)],{cwd:root,env:{...process.env,V3_PUBLIC_MAGAZINE_ROOT:publicRoot,V3_PUBLIC_MAGAZINE_BASE_URL:`http://127.0.0.1:${staticPort}`},stdio:['ignore','pipe','pipe']});
  let logs='';studio.stdout.on('data',x=>{logs+=x.toString();});studio.stderr.on('data',x=>{logs+=x.toString();});
  await waitFor(async()=>{try{return (await fetch(`http://127.0.0.1:${studioPort}/api/health`)).ok;}catch{return false;}});
  const {r,data}=await post(`http://127.0.0.1:${studioPort}/api/issues/003/publication/deploy`);
  if(r.status!==200||!data.ok||!data.deployment?.verification?.ok)throw new Error(`公开部署校验失败：HTTP ${r.status} ${JSON.stringify(data)}\n${logs}`);
  const page=await (await fetch(data.deployment.url)).text(),catalog=JSON.parse(await (await fetch(`http://127.0.0.1:${staticPort}/catalog.json`)).text());
  if(!page.includes('reader.js')||!catalog.some(x=>x.id==='003'&&x.href==='./03/'))throw new Error('公开 Reader 或归档链接未生成');
  console.log('V3 发布完成/分享链路自测通过：正式包 → 公开部署 → 在线校验 → 归档链接。');
}finally{
  try{studio?.kill('SIGTERM');}catch{}
  await new Promise(r=>setTimeout(r,120));try{staticServer.close();}catch{}
  if(originalEvidence)await writeFile(evidenceFile,originalEvidence);else await rm(evidenceFile,{force:true});
  if(originalReport)await writeFile(reportFile,originalReport);else await rm(reportFile,{force:true});
  await rm(publicRoot,{recursive:true,force:true});
}
