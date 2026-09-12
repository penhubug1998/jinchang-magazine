import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { buildPublicationStatus } from './lib-v3-publication.mjs';

const root=process.cwd();
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const pickPort=()=>43000+Math.floor(Math.random()*700);
const outputRoot=await mkdtemp(path.join(os.tmpdir(),'v3-publication-loop-'));
const port=pickPort();
let studio,logs='';

async function waitForHealth(){
  for(let attempt=0;attempt<140;attempt++){
    try{if((await fetch(`http://127.0.0.1:${port}/api/health`)).ok)return;}catch{}
    await wait(80);
  }
  throw new Error(`Studio test server did not start\n${logs}`);
}

try{
  const direct=buildPublicationStatus({id:'smoke',status:'draft',pages:[{title:'待编辑',navTitle:'待编辑',blocks:[{type:'paragraph',text:'请填写正文'}]}]},{blockers:[{severity:'blocker',location:{page:1},message:'占位内容'}],warnings:[]},{});
  assert(direct.forceRelease&&direct.canPublish&&direct.completion.pendingPages.length===0,'direct release must not lock publication on advisory findings');

  studio=spawn(process.execPath,['scripts/studio-v3.mjs','--host','127.0.0.1','--port',String(port)],{cwd:root,env:{...process.env,V3_PUBLICATION_OUTPUT_ROOT:outputRoot},stdio:['ignore','pipe','pipe']});
  studio.stdout.on('data',chunk=>{logs+=String(chunk)});studio.stderr.on('data',chunk=>{logs+=String(chunk)});
  await waitForHealth();
  const statusResponse=await fetch(`http://127.0.0.1:${port}/api/issues/001/publication/status?refresh=0`),status=await statusResponse.json();
  assert(statusResponse.ok&&status.auditMode==='force'&&status.forceRelease===true,'publication status must use direct release mode');
  assert(status.exportCapabilities?.archive?.engine==='node-native-zip','archive capability must not depend on system zip');

  const response=await fetch(`http://127.0.0.1:${port}/api/issues/001/publication/archive`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  const archive=await response.json();
  assert(response.ok&&archive.ok&&archive.output?.url,'archive endpoint did not create an output');
  const zip=await fetch(`http://127.0.0.1:${port}${archive.output.url}`),header=Buffer.from(await zip.arrayBuffer()).subarray(0,4).toString('hex');
  assert(zip.ok&&header==='504b0304','archive output is not a valid ZIP local header');
  console.log('Publication release-loop smoke 通过：直接发布模式、提示项展示、内置 ZIP 归档实际生成。');
}finally{
  try{studio?.kill('SIGTERM');}catch{}
  await wait(160);
  await rm(outputRoot,{recursive:true,force:true});
}
