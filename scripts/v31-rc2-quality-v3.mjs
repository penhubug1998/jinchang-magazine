import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root, V3_VERSION } from './lib-v3-production.mjs';
const assert=(c,m)=>{if(!c)throw new Error(m)};
const report={version:V3_VERSION,generatedAt:new Date().toISOString(),status:'running',checks:{}};
for(const rel of ['src/studio/index.html','src/reader/index.html']){
 const s=await readFile(path.join(root,rel),'utf8');
 const ids=[...s.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 const duplicates=[...new Set(ids.filter((x,i)=>ids.indexOf(x)!==i))];
 const buttons=[...s.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
 const unlabeled=buttons.filter(m=>!m[2].replace(/<[^>]+>/g,'').trim()&&!/aria-label=|title=/.test(m[1])).length;
 const blankLinks=[...s.matchAll(/<a\b([^>]*)>/g)].filter(m=>/target="_blank"/.test(m[1])&&!/rel="[^"]*noopener/.test(m[1])).length;
 report.checks[rel]={ids:ids.length,duplicates,buttons:buttons.length,unlabeled,blankLinks};
 assert(!duplicates.length,`${rel} duplicate IDs: ${duplicates.join(',')}`);assert(unlabeled===0,`${rel} unlabeled buttons=${unlabeled}`);assert(blankLinks===0,`${rel} unsafe target=_blank links=${blankLinks}`);
}
for(const id of ['001','002']){
 const issue=JSON.parse(await readFile(path.join(root,'issues',id,'issue.json'),'utf8'));let media=0,missingAlt=0,missingCaption=0;
 for(const p of issue.pages||[])for(const b of p.blocks||[])if(['image','video'].includes(b.type)){media++;if(b.type==='image'&&!String(b.alt||'').trim())missingAlt++;if(!String(b.caption||'').trim())missingCaption++;}
 report.checks[`issue-${id}-media`]={media,missingAlt,missingCaption};assert(missingAlt===0,`${id} image alt missing`);assert(missingCaption===0,`${id} media caption missing`);
}
const prodSources=(await Promise.all(['src/studio/studio.js','src/reader/reader.js','src/reader/rich-text.js','src/reader/layout-engine.js'].map(async rel=>[rel,await readFile(path.join(root,rel),'utf8')])));
const stale=[];for(const [rel,s] of prodSources){for(const m of s.matchAll(/3\.1\.0-alpha\.26/g))stale.push(`${rel}:${m.index}`)}
report.checks.staleAlpha26={count:stale.length,locations:stale};assert(stale.length===0,`production source still contains alpha26 version evidence: ${stale.join(',')}`);
report.status='passed';report.openAutomatedFindings={P0:0,P1:0,P2:0,P3:0};await mkdir(path.join(root,'reports'),{recursive:true});await writeFile(path.join(root,'reports/v31-rc2-quality.json'),JSON.stringify(report,null,2)+'\n');
console.log('V3.1 RC2 Quality PASS：重复 ID、无标签按钮、不安全新窗口链接、媒体 ALT/Caption 与旧版本证据检查均通过。');
