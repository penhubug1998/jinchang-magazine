import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { parseImportedBuffer, parseMarkdown, paginateImportedDocument } from './lib-v3-import.mjs';
import { V3_VERSION, narrationSourceDigest } from './lib-v3-production.mjs';
const root=process.cwd();const sandbox=path.join(root,'.tmp-v3-beta2-rehearsal');const assert=(c,m)=>{if(!c)throw new Error(m)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function run(script,args=[],expect=0){const r=spawnSync(process.execPath,[path.join(sandbox,'scripts',script),...args],{cwd:sandbox,encoding:'utf8'});if((r.status??1)!==expect)throw new Error(`${script} status=${r.status} expected=${expect}\n${r.stdout}\n${r.stderr}`);return r;}
async function digestDir(dir){const rows=[];async function walk(d){for(const e of (await readdir(d,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const f=path.join(d,e.name);if(e.isDirectory())await walk(f);else{const b=await readFile(f);rows.push(`${path.relative(dir,f).replaceAll('\\','/')}:${crypto.createHash('sha256').update(b).digest('hex')}`)}}}await walk(dir);return crypto.createHash('sha256').update(rows.join('\n')).digest('hex')}
async function freePort(){return await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})}

const rehearsal={version:V3_VERSION,generatedAt:new Date().toISOString(),status:'running',steps:{}};
await rm(sandbox,{recursive:true,force:true});await mkdir(sandbox,{recursive:true});
await cp(path.join(root,'scripts'),path.join(sandbox,'scripts'),{recursive:true});await cp(path.join(root,'src'),path.join(sandbox,'src'),{recursive:true});await cp(path.join(root,'package.json'),path.join(sandbox,'package.json'));await mkdir(path.join(sandbox,'issues'),{recursive:true});await mkdir(path.join(sandbox,'examples'),{recursive:true});
try{
  run('new-issue-v3.mjs',['--id','003','--subtitle','Beta2 真实生产演练','--sections','理论学习,健康生活']);
  const issueFile=path.join(sandbox,'issues','003','issue.json');let issue=JSON.parse(await readFile(issueFile,'utf8'));

  // 真实 DOCX 导入：Title / Heading / Quote / list。
  const tmp=await mkdtemp(path.join(os.tmpdir(),'beta2-docx-'));let docx;
  try{await mkdir(path.join(tmp,'word'),{recursive:true});const xml=`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>第三期理论学习专稿</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>学习要点</w:t></w:r></w:p><w:p><w:r><w:t>${'这是用于 Beta2 生产演练的 Word 正文。'.repeat(45)}</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Quote"/></w:pPr><w:r><w:t>坚持学习，守正创新。</w:t></w:r></w:p><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>第一项学习要求</w:t></w:r></w:p></w:body></w:document>`;await writeFile(path.join(tmp,'word','document.xml'),xml);const z=spawnSync('zip',['-qr',path.join(tmp,'source.docx'),'word'],{cwd:tmp,encoding:'utf8'});assert(z.status===0,'Beta2 rehearsal DOCX 生成失败');docx=await parseImportedBuffer(await readFile(path.join(tmp,'source.docx')),{filename:'source.docx'});}finally{await rm(tmp,{recursive:true,force:true})}
  const docPages=paginateImportedDocument(docx,{targetChars:720,section:'理论学习',pageType:'theory'}).pages;
  const md=parseMarkdown(`# 健康生活提示\n\n## 时令提醒\n\n${'秋季注意作息与饮水。'.repeat(55)}\n\n> 量力而行，循序渐进。\n\n- 合理作息\n- 适度运动`,{filename:'health.md'});
  const mdPages=paginateImportedDocument(md,{targetChars:720,section:'健康生活',pageType:'health'}).pages;
  assert(docPages.length>=2&&mdPages.length>=1,'Beta2 rehearsal 长文分页未生效');rehearsal.steps.import={docxPages:docPages.length,markdownPages:mdPages.length};
  const cover=issue.pages[0],toc=issue.pages[2],closing=issue.pages.at(-1);let content=[...docPages,...mdPages];
  content=content.map((p,i)=>({...p,navTitle:`${p.section}｜${i+1}`,title:p.title||`${p.section} ${i+1}`}));
  content.push({type:'article',navTitle:'图文页面',section:'综合',kicker:'图文',title:'媒体图文',blocks:[{type:'image',src:'assets/image/beta2.jpg',alt:'Beta2 测试图片',caption:'生产演练图片',frameRatio:'16:9',fit:'cover',positionX:50,positionY:50}]});
  content.push({type:'discipline',navTitle:'视频页面',section:'综合',kicker:'视频',title:'媒体视频',blocks:[{type:'video',src:'assets/video/beta2.mp4',poster:'assets/image/beta2.jpg',caption:'生产演练视频'}]});
  toc.blocks=[{type:'toc',items:content.map((p,i)=>({number:String(i+1).padStart(2,'0'),title:p.section||p.navTitle,subtitle:p.title,page:i+3}))}];
  issue.pages=[cover,toc,...content,closing];issue.status='ready';issue.publisher='Beta2 演练单位';issue.subtitle='Beta2 真实生产演练';issue.createdAt=new Date().toISOString();
  await writeFile(issueFile,JSON.stringify(issue,null,2)+'\n');rehearsal.steps.issue={pageCount:issue.pages.length};

  const assetRoot=path.join(sandbox,'issues','003','assets');const mediaBytes=Buffer.alloc(8192,7);const jpeg=Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]),Buffer.alloc(8188,9)]);const mp4=Buffer.concat([Buffer.from([0,0,0,24,0x66,0x74,0x79,0x70,0x69,0x73,0x6f,0x6d]),Buffer.alloc(8180,4)]);const mp3=Buffer.concat([Buffer.from('ID3'),Buffer.alloc(8189,5)]);
  await writeFile(path.join(assetRoot,'image','beta2.jpg'),jpeg);await writeFile(path.join(assetRoot,'video','beta2.mp4'),mp4);await writeFile(path.join(assetRoot,'music','bgm.mp3'),mp3);
  for(let i=1;i<=issue.pages.length;i++)await writeFile(path.join(assetRoot,'tts',`page-${String(i).padStart(2,'0')}.mp3`),mediaBytes);
  run('sync-assets-v3.mjs',['--issue','003']);run('tts-baseline-v3.mjs',['--issue','003']);run('full-media-check-v3.mjs',['--strict','--issue','003']);run('audit-v3.mjs',['--strict','--issue','003']);rehearsal.steps.gates={media:true,ttsBaseline:true,strictAudit:true};

  issue=JSON.parse(await readFile(issueFile,'utf8'));assert(issue.features.narration.sourceDigest===narrationSourceDigest(issue),'TTS baseline 未与生产稿一致');
  run('publish-v3.mjs',['--issue','003','--skip-browser']);run('deployment-readiness-v3.mjs',['--issue','003']);rehearsal.steps.release={published:true,deploymentReady:true};
  const releaseDir=path.join(sandbox,'release-v3','003');assert((await stat(path.join(releaseDir,'integrity.json'))).isFile(),'发布包缺少 integrity.json');assert((await stat(path.join(sandbox,'release-v3','nginx-cache-snippet.conf'))).isFile(),'发布根缺少缓存策略');
  const builtIndex=await readFile(path.join(sandbox,'dist-v3','003','index.html'),'utf8');assert(builtIndex.includes(`reader.css?v=${V3_VERSION}`)&&builtIndex.includes(`reader.js?v=${V3_VERSION}`),'Reader cache-bust 未进入实际构建');
  const goodRelease=await digestDir(releaseDir);

  // Safari/iOS 关键兼容：Studio 媒体路由必须支持 HTTP Range 206。
  const port=await freePort();const child=spawn(process.execPath,[path.join(sandbox,'scripts','studio-v3.mjs'),'--port',String(port)],{cwd:sandbox,stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);const base=`http://127.0.0.1:${port}`;
  try{let ready=false;for(let i=0;i<80;i++){try{const r=await fetch(`${base}/api/health`);if(r.ok){ready=true;break}}catch{}await sleep(40)}assert(ready,`Studio 未启动 ${logs}`);const rr=await fetch(`${base}/issue-assets/003/video/beta2.mp4`,{headers:{Range:'bytes=0-99'}});assert(rr.status===206,'音视频 Range 请求没有返回 206');assert(rr.headers.get('content-range')?.startsWith('bytes 0-99/'),'Content-Range 异常');assert((await rr.arrayBuffer()).byteLength===100,'Range 字节数量异常');rehearsal.steps.range={status:rr.status,contentRange:rr.headers.get('content-range')};}finally{child.kill('SIGTERM');await sleep(100)}

  // TTS 过期必须阻断，然后快照回滚可恢复。
  const snapOut=run('snapshot-v3.mjs',['--issue','003','--label','beta2-before-stale']).stdout;const snapId=snapOut.match(/V3 快照已创建：(.+)/)?.[1]?.trim();assert(snapId,'未取得 Beta2 快照 ID');issue=JSON.parse(await readFile(issueFile,'utf8'));issue.pages[2].title+='（正文已改）';await writeFile(issueFile,JSON.stringify(issue,null,2)+'\n');run('audit-v3.mjs',['--strict','--issue','003'],1);const staleReport=JSON.parse(await readFile(path.join(sandbox,'reports','v3-release-audit-003.json'),'utf8'));assert(staleReport.issues?.[0]?.blockers?.some(x=>x.code==='TTS_SOURCE_STALE'),'正文变化未触发 TTS stale 阻断');run('rollback-v3.mjs',['--issue','003','--snapshot',snapId]);run('audit-v3.mjs',['--strict','--issue','003']);rehearsal.steps.recovery={ttsStaleBlocked:true,rollbackAuditPassed:true};

  // 发布失败必须保留最后一份完整可部署 release。
  issue=JSON.parse(await readFile(issueFile,'utf8'));issue.status='draft';await writeFile(issueFile,JSON.stringify(issue,null,2)+'\n');run('publish-v3.mjs',['--issue','003','--skip-browser'],1);assert(await digestDir(releaseDir)===goodRelease,'失败发布破坏最后一份可部署包');run('deployment-readiness-v3.mjs',['--issue','003']);rehearsal.steps.failedPublish={previousReleasePreserved:true,deploymentStillReady:true};
  rehearsal.status='passed';await mkdir(path.join(root,'reports'),{recursive:true});await writeFile(path.join(root,'reports','v3-beta2-production-rehearsal.json'),JSON.stringify(rehearsal,null,2)+'\n','utf8');
  console.log(`V3 beta2 真实生产演练通过：DOCX/Markdown 导入→${rehearsal.steps.issue.pageCount}页→媒体/TTS→严格审计→发布→Range 206→TTS stale→回滚→失败发布恢复。`);
} finally { await rm(sandbox,{recursive:true,force:true}); }
