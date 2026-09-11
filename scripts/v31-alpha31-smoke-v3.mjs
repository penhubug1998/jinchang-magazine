import { readFile } from 'node:fs/promises';

const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const root=new URL('../',import.meta.url);
const [audit,studio]=await Promise.all([
  readFile(new URL('scripts/audit-v3.mjs',root),'utf8'),
  readFile(new URL('src/studio/studio.js',root),'utf8'),
]);
for(const token of ['PAGE_EFFECTIVELY_EMPTY','hasMeaningfulBlockContent','walkBlocks','ARTICLE_NOT_PLACED','suggestedSplitAfter'])assert(audit.includes(token),`发布审计缺少 ${token}`);
for(const token of ['可直接在制作中心选择内容块后拆页','publicationFindingRow'])assert(studio.includes(token),`制作中心缺少 ${token}`);
console.log('V3.1-alpha31 Smoke 通过：空白页、嵌套文章链接、未纳入文章和拆分页建议已接入发布前巡检。');
