import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { V3_VERSION, exists, humanBytes, posix } from './lib-v3-production.mjs';

export const CACHE_POLICY = {
  documents: 'no-cache, max-age=0, must-revalidate',
  code: 'public, max-age=3600, must-revalidate',
  media: 'public, max-age=86400, must-revalidate',
  other: 'public, max-age=3600, must-revalidate'
};

export function cacheClass(file='') {
  const ext=path.extname(file).toLowerCase();
  if(['.html','.json'].includes(ext)) return 'documents';
  if(['.js','.css','.svg','.ico'].includes(ext)) return 'code';
  if(['.png','.jpg','.jpeg','.webp','.gif','.mp3','.m4a','.wav','.mp4','.webm','.mov'].includes(ext)) return 'media';
  return 'other';
}
export function cacheControlFor(file=''){ return CACHE_POLICY[cacheClass(file)]; }

export async function integrityManifest(dir,{issue=null}={}){
  const files=[];
  async function walk(current){
    for(const entry of (await readdir(current,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      const file=path.join(current,entry.name);
      if(entry.isDirectory()) await walk(file);
      else if(entry.isFile()){
        const rel=posix(path.relative(dir,file));
        if(rel==='integrity.json') continue;
        const bytes=await readFile(file); const info=await stat(file);
        files.push({path:rel,bytes:info.size,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),cacheClass:cacheClass(rel),cacheControl:cacheControlFor(rel)});
      }
    }
  }
  await walk(dir);
  const treeSha256=crypto.createHash('sha256').update(files.map(x=>`${x.path}:${x.sha256}:${x.bytes}`).join('\n')).digest('hex');
  return {version:V3_VERSION,issue,generatedAt:new Date().toISOString(),files,totalFiles:files.length,totalBytes:files.reduce((n,x)=>n+x.bytes,0),totalSize:humanBytes(files.reduce((n,x)=>n+x.bytes,0)),treeSha256};
}

export async function writeDeploymentArtifacts(dir,{issue=null}={}){
  const manifest=await integrityManifest(dir,{issue});
  await writeFile(path.join(dir,'integrity.json'),JSON.stringify(manifest,null,2)+'\n','utf8');
  return manifest;
}

export function nginxCacheSnippet(){
  return `# V3 ${V3_VERSION} cache policy\n# HTML/JSON 每次重验证，避免 issue.json 与 Reader 不一致。\nlocation ~* \\.(?:html|json)$ {\n    add_header Cache-Control "${CACHE_POLICY.documents}" always;\n}\n# Reader 代码短缓存；构建产物同时带 ?v=${V3_VERSION}。\nlocation ~* \\.(?:js|css|svg|ico)$ {\n    add_header Cache-Control "${CACHE_POLICY.code}" always;\n}\n# 媒体允许日缓存但必须重验证；正式替换媒体建议使用新文件名。\nlocation ~* \\.(?:png|jpe?g|webp|gif|mp3|m4a|wav|mp4|webm|mov)$ {\n    add_header Cache-Control "${CACHE_POLICY.media}" always;\n}\n`;
}

export async function verifyIntegrity(dir,manifestFile=path.join(dir,'integrity.json')){
  if(!(await exists(manifestFile))) return {ok:false,errors:['缺少 integrity.json'],checked:0};
  const manifest=JSON.parse(await readFile(manifestFile,'utf8')); const errors=[];
  for(const item of manifest.files||[]){
    const file=path.resolve(dir,item.path); if(file!==dir&&!file.startsWith(path.resolve(dir)+path.sep)){errors.push(`路径越界：${item.path}`);continue}
    if(!(await exists(file))){errors.push(`缺少文件：${item.path}`);continue}
    const bytes=await readFile(file); const sha=crypto.createHash('sha256').update(bytes).digest('hex');
    if(bytes.length!==item.bytes)errors.push(`大小变化：${item.path}`);
    if(sha!==item.sha256)errors.push(`SHA256 变化：${item.path}`);
  }
  return {ok:errors.length===0,errors,checked:(manifest.files||[]).length,manifest};
}
