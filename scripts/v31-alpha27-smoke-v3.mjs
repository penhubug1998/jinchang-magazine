import { readFile } from 'node:fs/promises';
import { collectReferencedAssets } from './lib-v3-production.mjs';

const assert=(condition,message)=>{if(!condition)throw new Error(message)};

const issue={
  id:'background-smoke',
  pages:[{
    design:{backgroundImage:'assets/images/paper background.webp',backgroundOverlay:.68,backgroundFit:'cover',backgroundPosition:'center'},
    blocks:[{type:'image',src:'assets/images/content.png'}]
  }]
};
const refs=collectReferencedAssets(issue);
assert(refs.some(row=>row.path==='images/paper background.webp'&&row.kind==='image'&&row.references.some(ref=>ref.field==='design.backgroundImage')),'page background must be part of the production asset graph');
assert(refs.some(row=>row.path==='images/content.png'&&row.references.some(ref=>ref.field==='src')),'ordinary image references must remain intact');

const [studio,reader,server,check,css]=await Promise.all(['src/studio/studio.js','src/reader/reader.js','scripts/studio-v3.mjs','scripts/check-v3.mjs','src/studio/studio.css'].map(file=>readFile(file,'utf8')));
for(const token of ['backgroundImage','backgroundOverlay','backgroundFit','backgroundPosition','useAsPageBackground','installStockBackground','pageBackgroundControlHtml','clearPageBackground'])assert(studio.includes(token),`Studio background-material contract missing ${token}`);
for(const token of ['safePageBackgroundAsset','hexWithAlpha','background-image:linear-gradient','schedulePostRender','postRenderFrame'])assert(reader.includes(token),`Reader background-material rendering missing ${token}`);
for(const source of [server,check])for(const token of ['validPageBackgroundAsset','design.backgroundImage','design.backgroundOverlay'])assert(source.includes(token),`Server validation missing ${token}`);
assert(css.includes('.design-page-background'),'Background-material design UI missing');

console.log('V3.1-alpha27 Smoke 通过：背景素材可发布、可追踪、可清理保护，且 Reader/Studio/服务端校验链路完整。');
