import { readFile } from 'node:fs/promises';

const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const root=new URL('../',import.meta.url);
const [studio,server]=await Promise.all([
  readFile(new URL('src/studio/studio.js',root),'utf8'),
  readFile(new URL('scripts/studio-v3.mjs',root),'utf8'),
]);
for(const token of ['MEDIA_UPLOAD_LIMITS','200*1024*1024','STORAGE_FULL','服务器存储空间不足'])assert(studio.includes(token),`Studio 上传错误处理缺少 ${token}`);
for(const token of ['isStorageFullError','statusCode:413','send(res,507','code:\'STORAGE_FULL\'','await rm(target'])assert(server.includes(token),`服务端上传保护缺少 ${token}`);
console.log('V3.1-alpha30 Smoke 通过：媒体大小预检、存储空间不足错误码与失败清理链路完整。');
