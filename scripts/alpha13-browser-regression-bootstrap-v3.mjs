import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root=process.cwd();
const sourceFile=path.join(root,'scripts','alpha13-browser-regression-v3.mjs');
const tmpDir=await mkdtemp(path.join(os.tmpdir(),'jinchang-alpha13-browser-bootstrap-'));
const tmpFile=path.join(tmpDir,'alpha13-browser-regression-v3.mjs');

const needle='const mock=`<script>window.confirm=()=>true;window.prompt=()=>"常用模板";';
const replacement='const mock=`<script>window.__V3_APP_BASE_OVERRIDE__="/";window.confirm=()=>true;window.prompt=()=>"常用模板";';

try{
  const source=await readFile(sourceFile,'utf8');
  if(!source.includes(needle))throw new Error('Alpha13 browser bootstrap contract drifted: mock prelude not found');
  const patched=source.replace(needle,replacement);
  await writeFile(tmpFile,patched);
  const exitCode=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[tmpFile],{cwd:root,env:process.env,stdio:'inherit'});
    child.once('error',reject);
    child.once('exit',code=>resolve(code??1));
  });
  if(exitCode!==0)process.exitCode=exitCode;
}finally{
  await rm(tmpDir,{recursive:true,force:true}).catch(()=>{});
}
