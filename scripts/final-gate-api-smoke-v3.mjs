import { spawn } from 'node:child_process';
import path from 'node:path';
import { root, V3_VERSION } from './lib-v3-production.mjs';
const port=43100+Math.floor(Math.random()*500);
const child=spawn(process.execPath,[path.join(root,'scripts/studio-v3.mjs'),'--port',String(port)],{cwd:root,stdio:['ignore','pipe','pipe']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(p){const r=await fetch(`http://127.0.0.1:${port}${p}`,{cache:'no-store'});if(!r.ok)throw new Error(`${p} HTTP ${r.status}`);return r.json()}
try{
  let health=null;for(let i=0;i<80;i++){try{health=await get('/api/health');break}catch{}await sleep(80)}if(!health)throw new Error('Studio 启动超时');
  if(health.version!==V3_VERSION)throw new Error(`health version ${health.version}`);
  const status=await get('/api/final/status?issue=003');
  if(!status.report||status.report.total!==6||!Array.isArray(status.report.gates))throw new Error('final status API 结构异常');
  const doctor=await get('/api/final/doctor?issue=003');
  if(!doctor.report||!('recommendedNext' in doctor.report))throw new Error('final doctor API 结构异常');
  console.log(`V3.0.0 final gate API smoke 通过：6 项门禁与 doctor 可由 Studio 读取，当前 ${status.report.ready}/${status.report.total} READY。`);
}finally{child.kill('SIGTERM');await sleep(150)}
