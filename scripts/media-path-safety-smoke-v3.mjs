import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { stripAssetsPrefix } from './lib-v3-production.mjs';

const source=await readFile(new URL('./studio-v3.mjs',import.meta.url),'utf8');
const match=source.match(/function safeAssetRelative\(input=''\) \{[\s\S]*?\n\}/);
if(!match)throw new Error('未找到 safeAssetRelative 实现');
const safeAssetRelative=new Function('stripAssetsPrefix','path',`${match[0]}; return safeAssetRelative;`)(stripAssetsPrefix,path);
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const accepted=new Map([
  ['banner..final.png','banner..final.png'],
  ['assets/image/banner..final.png','image/banner..final.png'],
  ['image/a...b.png','image/a...b.png'],
  ['image/version.2..final.webp','image/version.2..final.webp'],
]);
for(const [input,expected] of accepted){
  let actual;try{actual=safeAssetRelative(input)}catch(error){throw new Error(`合法媒体路径被误拒绝 ${input}: ${error.message}`)}
  assert(actual===expected,`合法媒体路径归一化错误 ${input}: ${actual} != ${expected}`);
}
const rejected=['../escape.png','assets/../escape.png','image/../escape.png','image/./escape.png','..\\escape.png','image\\..\\escape.png','/etc/passwd','C:\\escape.png','C:/escape.png',''];
for(const input of rejected){
  let failed=false;try{safeAssetRelative(input)}catch{failed=true}
  assert(failed,`危险媒体路径未被拒绝：${input}`);
}
console.log('P0 媒体路径安全回归通过：合法连续点号文件名可用，绝对路径/点路径段/目录穿越继续拒绝。');
