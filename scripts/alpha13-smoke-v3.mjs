import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { parseMarkdown, parsePlainText, parseImportedBuffer, paginateImportedDocument } from './lib-v3-import.mjs';
import { V3_VERSION } from './lib-v3-production.mjs';

const assert=(c,m)=>{if(!c)throw new Error(m)};
const md=`# 秋季学习专刊\n\n## 学习提示\n\n这是第一段正文，用于测试 Markdown 正文识别。\n\n> 这是需要突出显示的一段重要提示。\n\n- 坚持学习\n- 注意安全\n\n1. 第一项要求\n2. 第二项要求`;
const doc=parseMarkdown(md,{filename:'demo.md'});
assert(doc.title==='秋季学习专刊','Markdown 一级标题识别失败');
assert(doc.blocks.some(x=>x.type==='quote'),'Markdown 引用未识别');
assert(doc.blocks.filter(x=>x.type==='cardline').length===4,'Markdown 列表未转换为结构化卡片');
assert(doc.blocks.some(x=>x.type==='paragraph'&&x.style==='subhead'),'Markdown 二级标题未识别');

const txt=parsePlainText(`通知标题\n\n这是正文第一段。\n\n> 这是引用。\n\n1. 第一项\n2. 第二项`,{filename:'demo.txt'});
assert(txt.title==='通知标题','TXT 标题推断失败');
assert(txt.blocks.some(x=>x.type==='quote'),'TXT 引用识别失败');

const longDoc={title:'长文章',blocks:Array.from({length:10},(_,i)=>({type:'paragraph',style:'body',text:`第${i+1}段。`+'这是一段用于分页压力测试的正文。'.repeat(28)}))};
const pagination=paginateImportedDocument(longDoc,{targetChars:650,section:'理论学习',pageType:'theory'});
assert(pagination.pages.length>1,'长文章未自动分页');
assert(pagination.pages.every(x=>x.section==='理论学习'&&x.type==='theory'),'分页页面元数据丢失');
assert(pagination.pages.every(x=>x.blocks.length<=80),'分页产生超限 block');

const tmp=await mkdtemp(path.join(os.tmpdir(),'alpha13-docx-'));
try{
  await mkdir(path.join(tmp,'word'),{recursive:true});
  const xml=`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Word 导入测试</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>第一部分</w:t></w:r></w:p><w:p><w:r><w:t>这是 DOCX 正文。</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Quote"/></w:pPr><w:r><w:t>这是引用。</w:t></w:r></w:p><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>列表项目</w:t></w:r></w:p></w:body></w:document>`;
  await writeFile(path.join(tmp,'word','document.xml'),xml);
  const zip=spawnSync('zip',['-qr',path.join(tmp,'demo.docx'),'word'],{cwd:tmp,encoding:'utf8'});assert(zip.status===0,`测试 DOCX 生成失败 ${zip.stderr}`);
  const {readFile}=await import('node:fs/promises');const parsed=await parseImportedBuffer(await readFile(path.join(tmp,'demo.docx')),{filename:'demo.docx'});
  assert(parsed.title==='Word 导入测试','DOCX 标题解析失败');
  assert(parsed.blocks.some(x=>x.style==='subhead'),'DOCX Heading 解析失败');
  assert(parsed.blocks.some(x=>x.type==='quote'),'DOCX Quote 解析失败');
  assert(parsed.blocks.some(x=>x.type==='cardline'),'DOCX list 解析失败');
} finally { await rm(tmp,{recursive:true,force:true}); }

console.log(`V3 alpha13 smoke 通过：Word/Markdown/TXT 解析、标题/引用/列表识别及长文章 ${pagination.pages.length} 页分页建议正常。`);

// Studio API integration: import parsing, local templates and section skeletons.
const net=await import('node:net');
const {spawn}=await import('node:child_process');
async function freePort(){return await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})}
const root=process.cwd();const sandbox=path.join(root,'.tmp-v3-alpha13-api');
const {cp}=await import('node:fs/promises');
await rm(sandbox,{recursive:true,force:true});await mkdir(path.join(sandbox,'scripts'),{recursive:true});await mkdir(path.join(sandbox,'src'),{recursive:true});await mkdir(path.join(sandbox,'issues','001'),{recursive:true});await mkdir(path.join(sandbox,'issues','002'),{recursive:true});
for(const f of ['lib-v3-production.mjs','lib-v3-history.mjs','lib-v3-import.mjs','lib-v3-publication.mjs','lib-v3-catalog.mjs','lib-v3-deploy.mjs','sync-assets-v3.mjs','studio-v3.mjs'])await cp(path.join(root,'scripts',f),path.join(sandbox,'scripts',f));
await cp(path.join(root,'src','studio'),path.join(sandbox,'src','studio'),{recursive:true});
await cp(path.join(root,'src','reader'),path.join(sandbox,'src','reader'),{recursive:true});
await cp(path.join(root,'package.json'),path.join(sandbox,'package.json'));
const sourceIssue={id:'001',label:'第一期',publication:'测试',publisher:'测试单位',subtitle:'历史内容',engine:'v3',status:'published',assetSource:'issues/001/assets',pages:[{type:'cover',navTitle:'封面',title:'封面',blocks:[]},{type:'theory',navTitle:'理论学习',title:'旧标题不得复制',section:'理论学习',kicker:'学习栏目',blocks:[{type:'paragraph',style:'body',text:'旧正文不得复制'},{type:'image',src:'assets/image/old.png',alt:'old'}]},{type:'closing',navTitle:'尾页',title:'尾页',blocks:[]}],articles:{}};
const targetIssue={id:'002',label:'第二期',publication:'测试',publisher:'测试单位',subtitle:'当前内容',engine:'v3',status:'draft',assetSource:'issues/002/assets',pages:[{type:'cover',navTitle:'封面',title:'封面',blocks:[]},{type:'article',navTitle:'正文',title:'正文',blocks:[{type:'paragraph',style:'body',text:'当前正文'}]},{type:'closing',navTitle:'尾页',title:'尾页',blocks:[]}],articles:{}};
await writeFile(path.join(sandbox,'issues','001','issue.json'),JSON.stringify(sourceIssue,null,2));await writeFile(path.join(sandbox,'issues','002','issue.json'),JSON.stringify(targetIssue,null,2));
const apiPort=await freePort();const child=spawn(process.execPath,[path.join(sandbox,'scripts','studio-v3.mjs'),'--port',String(apiPort)],{cwd:sandbox,stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);const base=`http://127.0.0.1:${apiPort}`;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
  let ready=false;for(let i=0;i<60;i++){try{const r=await fetch(`${base}/api/health`);if(r.ok){const j=await r.json();assert(j.version===V3_VERSION,'Alpha13 API version mismatch');ready=true;break}}catch{}await sleep(40)}assert(ready,`Alpha13 Studio API failed to start: ${logs}`);
  let r=await fetch(`${base}/api/import/parse`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:md,format:'markdown',section:'理论学习',pageType:'theory',targetChars:520})});let j=await r.json();assert(r.ok&&j.document.title==='秋季学习专刊'&&j.pagination.pages.length>=1,'Paste import API failed');assert(j.pagination.pages.every(p=>p.type==='theory'&&p.section==='理论学习'),'Import metadata options were not applied');
  r=await fetch(`${base}/api/import/parse?filename=${encodeURIComponent('batch.txt')}&pageType=article&section=${encodeURIComponent('综合资讯')}&targetChars=520`,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent('batch.txt')},body:Buffer.from('批量文章标题\n\n正文第一段。\n\n正文第二段。')});j=await r.json();assert(r.ok&&j.document.title==='批量文章标题'&&j.pagination.pages[0].section==='综合资讯','File import API failed');
  const templatePage={type:'article',navTitle:'我的模板',title:'我的模板',section:'模板栏目',blocks:[{type:'paragraph',style:'body',text:'模板正文'},{type:'image',src:'assets/image/should-clear.png',alt:'图'},{type:'articleLink',articleId:'old'}]};
  r=await fetch(`${base}/api/templates`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'常用文章模板',page:templatePage})});j=await r.json();assert(r.status===201&&j.id,'Save user template failed');const templateId=j.id;r=await fetch(`${base}/api/templates`);j=await r.json();assert(j.templates.length===1&&j.templates[0].page.blocks.find(x=>x.type==='image').src===''&&j.templates[0].page.blocks.find(x=>x.type==='articleLink').articleId==='','Template sanitization failed');
  r=await fetch(`${base}/api/issues/002/skeleton?source=001`);j=await r.json();assert(r.ok&&j.pages.length===1&&j.pages[0].section==='理论学习','Skeleton API failed');assert(!JSON.stringify(j.pages).includes('旧正文不得复制')&&!JSON.stringify(j.pages).includes('old.png'),'Skeleton leaked old content/media');
  r=await fetch(`${base}/api/templates/${encodeURIComponent(templateId)}`,{method:'DELETE'});assert(r.ok,'Delete user template failed');
  console.log('V3 alpha13 API smoke 通过：粘贴/文件导入、我的模板和栏目骨架接口均正常。');
} finally {child.kill('SIGTERM');await sleep(100);await rm(sandbox,{recursive:true,force:true});}
