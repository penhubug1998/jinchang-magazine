import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { narrationPageDigests, narrationSourceDigest } from './lib-v3-production.mjs';
import { V3_VERSION } from './lib-v3-production.mjs';

const root=process.cwd();
const assert=(c,m)=>{if(!c)throw new Error(m)};
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
assert(pkg.version===V3_VERSION,'Alpha12 基线：package 与统一版本源不一致');
assert(pkg.scripts['tts:baseline'],'缺少 tts:baseline 命令');
const reader=await readFile(path.join(root,'src','reader','reader.js'),'utf8');
assert(reader.includes('block.poster'),'Reader 未支持视频 poster');
assert(reader.includes('block.frameRatio')&&reader.includes('block.positionX'),'Reader 未支持图片画框/焦点');
const studio=await readFile(path.join(root,'src','studio','studio.js'),'utf8');
for(const token of ['imageAdjustDialog','cleanupUnusedMedia','deleteSelectedMedia','confirmTtsBaseline','generatePosterFromAsset','optimizeImageFile'])assert(studio.includes(token),`Studio 缺少 Alpha12 功能：${token}`);
const server=await readFile(path.join(root,'scripts','studio-v3.mjs'),'utf8');
for(const token of ["assets'&&seg[4]==='delete'","assets'&&seg[4]==='cleanup'","assets'&&seg[4]==='poster'","tts'&&seg[4]==='baseline'",'ASSET_IN_USE'])assert(server.includes(token),`Studio API 缺少 Alpha12 路由/保护：${token}`);
for(const id of ['001','002']){
  const issue=JSON.parse(await readFile(path.join(root,'issues',id,'issue.json'),'utf8'));
  const digests=narrationPageDigests(issue);assert(issue.features?.narration?.pageDigests?.length===issue.pages.length,`${id} 缺少 TTS 页级基线`);assert(issue.features.narration.sourceDigest===narrationSourceDigest(issue),`${id} 当前内容与 TTS 基线不一致`);assert(JSON.stringify(digests)===JSON.stringify(issue.features.narration.pageDigests),`${id} TTS 页级指纹不一致`);
  const changed=structuredClone(issue);changed.pages[1].title+='（变更）';assert(narrationSourceDigest(changed)!==issue.features.narration.sourceDigest,`${id} 文本变更未触发 TTS digest 变化`);
}
console.log('V3 alpha12 smoke 通过：图片焦点/视频封面、媒体引用保护、TTS 正文指纹与两期基线均正常。');
