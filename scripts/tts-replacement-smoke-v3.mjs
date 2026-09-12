import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdtemp,stat,rename,rm,readdir} from 'node:fs/promises';

const source=await readFile(new URL('./studio-v3.mjs',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('async function replaceTtsFile('),source.indexOf('async function generateTtsForIssue('));
const dir=await mkdtemp(path.join(os.tmpdir(),'tts-replacement-'));
try{
  for(const mode of ['failure','empty','success']){
    const target=path.join(dir,'page-01.mp3');await writeFile(target,'old audio');
    const context=vm.createContext({path,randomUUID,stat,rename,rm,Error,target,
      generateTtsFile:async(bin,file)=>{await writeFile(file,mode==='empty'?'':'new audio');if(mode==='failure')throw Error('offline');}});
    vm.runInContext(fn,context);
    const result=vm.runInContext("replaceTtsFile('edge-tts',target,'text',{})",context);
    if(mode==='success')await result;else await assert.rejects(result);
    assert.equal(await readFile(target,'utf8'),mode==='success'?'new audio':'old audio');
    assert.deepEqual(await readdir(dir),['page-01.mp3']);
  }
  const reader=await readFile(new URL('../src/reader/reader.js',import.meta.url),'utf8');
  const code=reader.slice(reader.indexOf('function narrationPath('),reader.indexOf('\nfunction speechTextOfBlock('));
  const state={issue:{features:{narration:{pattern:'assets/tts/page-{page}.mp3',generatedAt:'first'}}}};
  const context=vm.createContext({state,URL,location:{href:'https://example.test/03/'},padPage:i=>String(i+1).padStart(2,'0')});
  vm.runInContext(code,context);const first=vm.runInContext('narrationPath(0)',context);
  state.issue.features.narration.generatedAt='second';const second=vm.runInContext('narrationPath(0)',context);
  assert.notEqual(first,second);assert.equal(new URL(second).pathname,'/03/assets/tts/page-01.mp3');
  console.log('朗读替换回归通过：失败及空文件保留旧音频，成功替换，无临时残留，生成版本刷新缓存。');
}finally{await rm(dir,{recursive:true,force:true});}
