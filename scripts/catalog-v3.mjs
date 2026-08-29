import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildArchiveHtml, catalogHref } from './lib-v3-catalog.mjs';
import { parseArgs, root } from './lib-v3-production.mjs';
const args=parseArgs();
const output=path.join(root,String(args.output||'dist-v3'));
const includeDrafts=Boolean(args['include-drafts']);
const issuesDir=path.join(root,'issues');
const entries=await readdir(issuesDir,{withFileTypes:true});
const catalog=[];
for(const entry of entries){
  if(!entry.isDirectory()) continue;
  const file=path.join(issuesDir,entry.name,'issue.json');
  const issue=JSON.parse(await readFile(file,'utf8'));
  const visible=issue.engine==='legacy' || includeDrafts || ['published','ready'].includes(issue.status);
  if(!visible) continue;
  catalog.push({id:issue.id,label:issue.label,publication:issue.publication,subtitle:issue.subtitle||'',engine:issue.engine,status:issue.status,href:catalogHref(issue),legacyPath:issue.legacyPath||null,pageCount:Array.isArray(issue.pages)?issue.pages.length:null});
}
catalog.sort((a,b)=>b.id.localeCompare(a.id,'zh-CN'));
await mkdir(output,{recursive:true});
await writeFile(path.join(output,'catalog.json'),`${JSON.stringify(catalog,null,2)}\n`,'utf8');
await writeFile(path.join(output,'index.html'),buildArchiveHtml(catalog),'utf8');
console.log(`V3 归档首页已生成：${path.relative(root,output)}/index.html（${catalog.length} 期）`);
