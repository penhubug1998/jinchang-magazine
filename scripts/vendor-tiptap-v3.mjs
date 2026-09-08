import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const root=process.cwd();
const out=path.join(root,'src','reader','vendor','tiptap-runtime.js');
const manifestFile=path.join(root,'src','reader','vendor','tiptap-runtime.manifest.json');
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const version=pkg.richTextEngine?.version;
if(!version){console.error('package.json 缺少 richTextEngine.version，拒绝生成无法绑定版本的 Tiptap vendor。');process.exit(2)}
let esbuild;
try{esbuild=await import('esbuild');}catch{
  console.error('缺少 esbuild / Tiptap 本地依赖。请先在可联网环境执行 npm install，再运行 npm run vendor:tiptap。');
  process.exit(2);
}
const require=createRequire(import.meta.url);
for(const dep of ['@tiptap/core','@tiptap/starter-kit','@tiptap/extension-text-style','@tiptap/extension-highlight','@tiptap/extension-text-align']){
  try{require.resolve(dep);}catch{console.error(`缺少 ${dep}。请先执行 npm install。`);process.exit(2);}
}
const entry=`
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
export { Editor, StarterKit, TextStyleKit, Highlight, TextAlign };
export const TIPTAP_VENDOR_READY = true;
export const TIPTAP_VERSION = ${JSON.stringify(version)};
`;
await mkdir(path.dirname(out),{recursive:true});
await esbuild.build({stdin:{contents:entry,resolveDir:root,sourcefile:'tiptap-runtime-entry.js'},outfile:out,bundle:true,format:'esm',platform:'browser',target:['es2022'],minify:true,legalComments:'eof',treeShaking:true,charset:'utf8'});
const bytes=await readFile(out);const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
await writeFile(manifestFile,JSON.stringify({version,generatedAt:new Date().toISOString(),bytes:bytes.length,sha256,source:'npm packages bundled by esbuild',externalRuntime:false},null,2)+'\n');
console.log(`Tiptap 本地 vendor 已生成：${path.relative(root,out)} (${bytes.length} bytes)`);
console.log(`SHA-256 ${sha256}`);
