import { readFile } from 'node:fs/promises';

const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const root=new URL('../',import.meta.url);
const [reader,studio,server]=await Promise.all([
  readFile(new URL('src/reader/reader.js',root),'utf8'),
  readFile(new URL('src/studio/studio.js',root),'utf8'),
  readFile(new URL('scripts/studio-v3.mjs',root),'utf8'),
]);
for(const token of ['toolbarOccluded','toolbarOcclusionPx','toolbarCoverage'])assert(reader.includes(token),`Reader 缺少底部工具栏遮挡测量：${token}`);
for(const token of ['底部遮挡','预览底部可能被 Reader 工具栏遮挡','服务器空间','服务器存储空间不足'])assert(studio.includes(token),`制作中心缺少 ${token}`);
for(const token of ['statfs','STORAGE_WARNING_BYTES','STORAGE_CRITICAL_BYTES','publicationStorageStatus','服务器存储空间'])assert(server.includes(token),`发布前检查缺少 ${token}`);
console.log('V3.1-alpha33 Smoke 通过：底部工具栏遮挡提示、发布中心存储指标与发布前存储预检查契约完整。');
