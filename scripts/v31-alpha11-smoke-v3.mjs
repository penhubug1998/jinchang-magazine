import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import net from 'node:net';
import path from 'node:path';

const root=process.cwd();
const assert=(c,m)=>{if(!c)throw new Error(m)};
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const pkg=JSON.parse(await readFile('package.json','utf8'));
assert(['3.1.0-alpha.11','3.1.0-alpha.12','3.1.0-alpha.13','3.1.0-alpha.14','3.1.0-alpha.15','3.1.0-alpha.16','3.1.0-alpha.17','3.1.0-alpha.18','3.1.0-alpha.19'].includes(pkg.version),`Alpha11 版本错误：${pkg.version}`);
assert(['3.1-alpha11','3.1-alpha12','3.1-alpha13','3.1-alpha14','3.1-alpha15','3.1-alpha16','3.1-alpha17','3.1-alpha18','3.1-alpha19'].includes(pkg.v31SchemaVersion),`Alpha11 schema 版本错误：${pkg.v31SchemaVersion}`);
assert(pkg.v3StableVersion==='3.0.0','V3.0.0 稳定发布锁未保留');
const schemaText=await readFile('baselines/v3-schema-3.1-alpha11.json','utf8'),schema=JSON.parse(schemaText),digest=sha(schemaText).slice(0,16);
assert(schema.immersiveWorkspace?.route==='/workspace/'&&schema.immersiveWorkspace?.independentEditorAndPreviewScroll===true,'Alpha11 沉浸式工作区 schema 缺失');
assert(schema.pageInfoBlock?.insideContentCanvas===true&&schema.pageInfoBlock?.issueJsonRepresentationUnchanged===true,'Alpha11 页面信息块边界异常');
assert(schema.readerSync?.immediatePostMessageBeforePreviewPersistence===true&&schema.readerSync?.readerPageScrollPreservedOnIssueRefresh===true,'Alpha11 Reader 同步优化未绑定 schema');
assert(schema.compatibility?.issueJsonSchemaChanged===false&&schema.evidenceBoundary?.satisfiesV30FormalGate===false,'Alpha11 不得改变 issue schema 或正式发布门禁');
assert(schema.evidenceBinding?.verifiedParentFullSourceR1Sha256==='f465866e97bf5f067377392eb8e3a5ee85ac35bb669d780a79eaa522be5bc5c1','Alpha11 未绑定 Alpha10 Full Source R1 父基线');

const [html,css,studio,reader,server]=await Promise.all(['src/studio/index.html','src/studio/studio.css','src/studio/studio.js','src/reader/reader.js','scripts/studio-v3.mjs'].map(f=>readFile(f,'utf8')));
assert(html.includes('V3.1 alpha11 · 沉浸式工作区 / 双屏编辑')||html.includes('V3.1 alpha12 · 整期结构快速导入')||(html.includes('V3.1 alpha13 · 动态板块语义识别')||(html.includes('V3.1 alpha15 · 所见即所得工作区 / 制作中心瘦身')||(html.includes('V3.1 alpha16 · 媒体直编 / 多窗口同步 / 版面健康')||(html.includes('V3.1 alpha17 · Reader 最大化 / 页面控制台')||html.includes('V3.1 alpha18 · 交互修复 / 页面同步 / 移动增强'))))),'Alpha11 Studio 标识缺失');
for(const id of ['immersiveWorkspaceToolbar','workspaceBackBtn','workspacePagePicker','workspacePageDialog','enterWorkspaceBtn'])assert(html.includes(`id="${id}"`),`Alpha11 UI 缺少 ${id}`);
const canvasAt=html.indexOf('class="block-canvas"'),metaAt=html.indexOf('id="pageMetaCard"'),limitAt=html.indexOf('id="blockLimitNote"');
assert(canvasAt>=0&&metaAt>canvasAt&&limitAt>metaAt,'页面信息块没有进入内容块画布首部');
assert(css.includes('V3.1-alpha11 · 沉浸式工作区 / 双屏编辑')&&css.includes('body.workspace-mode #visualEditor'),'Alpha11 沉浸式工作区 CSS 缺失');
for(const token of ['WORKSPACE_MODE','workspaceRouteUrl','goToPage','openWorkspacePageDialog','scheduleReaderPreviewSync(delay=100)'])assert(studio.includes(token),`Alpha11 Studio 缺少 ${token}`);
assert(studio.indexOf("frame.contentWindow?.postMessage({source:'v3-studio',type:'issue'")<studio.indexOf('await api(`/api/issues/${encodeURIComponent(state.issue.id)}/live-preview`'),'Alpha11 应先即时 postMessage 再等待 live-preview 后台持久化');
assert(reader.includes('function pageScrollSnapshot()')&&reader.includes('render({ preserveScroll:true })'),'Reader 未保留页内滚动位置');
assert(server.includes("u.pathname==='/workspace'")&&server.includes("seg[0]==='workspace'&&seg.length>1"),'Studio server 未提供 workspace 路由/静态资源');

// Alpha10 Full Source R1 parent archive must still be exactly the accepted deployment parent.
const parent=path.resolve(root,'..','jinchang-magazine-v3.1-alpha10-full-source-r1.zip');
try{assert(sha(await readFile(parent))==='f465866e97bf5f067377392eb8e3a5ee85ac35bb669d780a79eaa522be5bc5c1','Alpha10 Full Source R1 父包 SHA 不一致');}catch(e){if(e.code!=='ENOENT')throw e;}

const lock=JSON.parse(await readFile('baselines/v3.0-final-gate-lock-alpha11.json','utf8'));
assert(lock.stableVersion==='3.0.0'&&lock.parentFullSourceR1Sha256==='f465866e97bf5f067377392eb8e3a5ee85ac35bb669d780a79eaa522be5bc5c1','Alpha11 正式门禁锁父基线异常');
for(const [file,expected] of Object.entries(lock.files||{}))assert(sha(await readFile(file))===expected,`V3.0 正式门禁关键文件被 Alpha11 改动：${file}`);

function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.unref();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})}
const port=await freePort(),logs=[];
const child=spawn(process.execPath,['scripts/studio-v3.mjs','--host','127.0.0.1','--port',String(port)],{cwd:root,stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>logs.push(d.toString()));child.stderr.on('data',d=>logs.push(d.toString()));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(url){for(let i=0;i<120;i++){try{const r=await fetch(url);if(r.ok)return r}catch{}await sleep(50)}throw new Error(`Studio 未就绪：${logs.join('')}`)}
try{
  const health=await (await wait(`http://127.0.0.1:${port}/api/health`)).json();assert(health.ok&&['3.1.0-alpha.11','3.1.0-alpha.12','3.1.0-alpha.13','3.1.0-alpha.14','3.1.0-alpha.15','3.1.0-alpha.16','3.1.0-alpha.17','3.1.0-alpha.18','3.1.0-alpha.19'].includes(health.version),`Alpha11 health 异常：${JSON.stringify(health)}`);
  const issues=await (await fetch(`http://127.0.0.1:${port}/api/issues`)).json();assert(issues.find(x=>x.id==='001')?.pageCount===18&&issues.find(x=>x.id==='002')?.pageCount===29,'Alpha11 必须保留第一期18页/第二期29页');
  let r=await fetch(`http://127.0.0.1:${port}/workspace/?issue=001&page=3`);const ws=await r.text();assert(r.ok&&ws.includes('immersiveWorkspaceToolbar')&&(ws.includes('alpha11')||ws.includes('alpha12')||(ws.includes('alpha13')||ws.includes('alpha14')||(ws.includes('alpha15')||(ws.includes('alpha16')||(ws.includes('alpha17')||ws.includes('alpha18')))))),'Workspace HTML 路由异常');
  for(const asset of ['studio.css','studio.js','design-presets.js']){r=await fetch(`http://127.0.0.1:${port}/workspace/${asset}`);assert(r.ok&&Number(r.headers.get('content-length')||1)>0,`Workspace 静态资源失败：${asset}`);}
}finally{child.kill('SIGTERM');await sleep(200)}
console.log(`V3.1-alpha11 smoke 通过：独立 workspace 路由、页面信息块内嵌、Reader 即时同步/滚动保持、001/002 内容与 V3.0 证据绑定正常。schema=${digest}`);
