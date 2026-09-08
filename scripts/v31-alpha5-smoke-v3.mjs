import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const root=process.cwd();
const assert=(c,m)=>{if(!c)throw new Error(m)};
const pkg=JSON.parse(await readFile('package.json','utf8'));
assert(['3.1.0-alpha.5','3.1.0-alpha.6','3.1.0-alpha.7','3.1.0-alpha.8','3.1.0-alpha.9','3.1.0-alpha.10','3.1.0-alpha.11','3.1.0-alpha.12','3.1.0-alpha.13','3.1.0-alpha.14','3.1.0-alpha.15','3.1.0-alpha.16','3.1.0-alpha.17','3.1.0-alpha.18','3.1.0-alpha.19','3.1.0'].includes(pkg.version),`V3.1 alpha5 版本错误：${pkg.version}`);
assert(['3.1-alpha5','3.1-alpha6','3.1-alpha7','3.1-alpha8','3.1-alpha9','3.1-alpha10','3.1-alpha11','3.1-alpha12','3.1-alpha13','3.1-alpha14','3.1-alpha15','3.1-alpha16','3.1-alpha17','3.1-alpha18','3.1-alpha19','3.1-alpha24'].includes(pkg.v31SchemaVersion),`V3.1 schema 版本错误：${pkg.v31SchemaVersion}`);
assert(pkg.v3StableVersion==='3.0.0','V3.0.0 稳定发布锁未保留');
const schema=JSON.parse(await readFile('baselines/v3-schema-3.1-alpha5.json','utf8'));
assert(schema.layoutAssetLibrary?.storedOutsideIssueJson===true,'Alpha5 版式资产必须存储在 issue.json 之外');
assert(schema.layoutAssetLibrary?.maxItems===40,'Alpha5 我的版式上限异常');
assert(schema.layoutAssetLibrary?.storesContent===false&&schema.layoutAssetLibrary?.storesMediaBindings===false,'Alpha5 版式资产不得保存正文或媒体绑定');
assert(schema.oneClickLayout?.preservesCurrentContent===true&&schema.oneClickLayout?.preservesCurrentMediaBindings===true,'Alpha5 一键套版必须保留当前内容与媒体');
assert(schema.oneClickLayout?.builtInPresets?.length===6,'Alpha5 内置版式数量异常');
assert(schema.smartLayoutSuggestions?.execution==='local-deterministic'&&schema.smartLayoutSuggestions?.autoMutation===false,'Alpha5 智能建议必须本地、确定性且不得自动修改');
assert(schema.smartLayoutSuggestions?.interpretation==='advisory-not-release-gate','Alpha5 智能建议不得替代正式门禁');
assert(schema.pageTemplateAssets?.nestedMediaBindingsSanitized===true,'Alpha5 整页模板必须递归清理媒体绑定');
assert(schema.evidenceBinding?.developmentSmokeCannotSatisfyFinalGate===true,'Alpha5 开发 smoke 不得满足正式门禁');

const [studio,html,css,server]=await Promise.all(['src/studio/studio.js','src/studio/index.html','src/studio/studio.css','scripts/studio-v3.mjs'].map(f=>readFile(f,'utf8')));
for(const token of ['LAYOUT_PRESETS','flattenLayoutContent','buildLayoutFromPreset','layoutBlueprintFromPage','buildFromLayoutBlueprint','analyzeLayoutSuggestions','saveCurrentLayoutAsset','applyLayoutAsset'])assert(studio.includes(token),`Studio Alpha5 缺少 ${token}`);
for(const id of ['layoutLabBtn','layoutLabDialog','layoutSuggestionList','layoutPresetList','layoutAssetList','saveLayoutAsset'])assert(html.includes(`id="${id}"`),`Studio Alpha5 UI 缺少 ${id}`);
assert(css.includes('V3.1-alpha5 · page layout library'),'Studio Alpha5 样式缺失');
for(const token of ['/api/layout-library','.v3-layout-library','sanitizeLayoutBlueprint','LAYOUT_LIBRARY_LIMIT','V3_TEMPLATE_LIBRARY_FILE'])assert(server.includes(token),`Studio API Alpha5 缺少 ${token}`);

const lock=JSON.parse(await readFile('baselines/v3.0-final-gate-lock-alpha5.json','utf8'));
assert(lock.stableVersion==='3.0.0','Alpha5 正式门禁锁稳定版本异常');
assert(lock.parentOverlaySha256==='f12c39a09aa2a0a0b1410ab37f586cd5a6660985f15c1a6404e20029c75a0c07','Alpha5 父基线 SHA256 未绑定到已验收 Alpha4');
for(const [file,expected] of Object.entries(lock.files||{})){
  const actual=crypto.createHash('sha256').update(await readFile(file)).digest('hex');
  assert(actual===expected,`V3.0 正式门禁关键文件被 Alpha5 改动：${file}`);
}

async function freePort(){return await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tmp=await mkdtemp(path.join(os.tmpdir(),'jinchang-v31a5-'));
const layoutFile=path.join(tmp,'layouts.json'),templateFile=path.join(tmp,'templates.json'),designFile=path.join(tmp,'styles.json'),port=await freePort();
const child=spawn(process.execPath,['scripts/studio-v3.mjs','--host','127.0.0.1','--port',String(port)],{cwd:root,env:{...process.env,V3_LAYOUT_LIBRARY_FILE:layoutFile,V3_TEMPLATE_LIBRARY_FILE:templateFile,V3_DESIGN_LIBRARY_FILE:designFile},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);const base=`http://127.0.0.1:${port}`;
try{
  let health=null;for(let i=0;i<120;i++){try{const r=await fetch(`${base}/api/health`);if(r.ok){health=await r.json();break}}catch{}await sleep(50)}
  assert(health?.ok&&(health?.version===pkg.version),`Alpha5 Studio health 异常：${logs}`);
  let r=await fetch(`${base}/api/layout-library`),j=await r.json();assert(r.ok&&Array.isArray(j.layouts)&&j.layouts.length===0,'Alpha5 我的版式初始库异常');
  const valid={name:'双栏测试版式',contextType:'article',previewPreset:'two-balanced',blueprint:{pageDesign:{background:'#fffaf0',padding:4,contentWidth:90},nodes:[{kind:'slot'},{kind:'container',layout:'two-equal',gap:'md',align:'start',mobile:'stack',columns:[{nodes:[{kind:'slot'}]},{nodes:[{kind:'slot'}]}]}],slotCount:3}};
  r=await fetch(`${base}/api/layout-library`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(valid)});j=await r.json();assert(r.status===201&&j.id&&j.blueprint?.slotCount===3,'Alpha5 我的版式保存失败');const savedId=j.id;
  assert(!JSON.stringify(j).includes('正文内容')&&!JSON.stringify(j).includes('assets/'),'Alpha5 版式资产意外携带内容或媒体');
  r=await fetch(`${base}/api/layout-library`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...valid,name:'非法正文槽位',blueprint:{nodes:[{kind:'slot',text:'不应保存'}]}})});assert(r.status===400,'Alpha5 服务端必须拒绝版式槽位携带正文');
  r=await fetch(`${base}/api/layout-library`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...valid,name:'非法嵌套',blueprint:{nodes:[{kind:'container',layout:'two-equal',columns:[{nodes:[{kind:'container',layout:'single',columns:[{nodes:[{kind:'slot'}]}]}]},{nodes:[{kind:'slot'}]}]}]}})});assert(r.status===400,'Alpha5 服务端必须拒绝容器嵌套容器');
  r=await fetch(`${base}/api/layout-library`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...valid,name:'越界页面样式',blueprint:{nodes:[{kind:'slot'}],pageDesign:{contentWidth:10}}})});assert(r.status===400,'Alpha5 服务端必须拒绝越界页面样式');
  r=await fetch(`${base}/api/layout-library`);j=await r.json();assert(j.layouts.length===1&&j.layouts[0].id===savedId,'Alpha5 我的版式读取异常');
  r=await fetch(`${base}/api/layout-library/${encodeURIComponent(savedId)}`,{method:'DELETE'});assert(r.ok,'Alpha5 我的版式删除失败');

  const templatePage={type:'article',navTitle:'图文模板',title:'图文模板',kicker:'测试',section:'测试',design:{background:'#fffaf0',padding:3,contentWidth:92},blocks:[{type:'container',layout:'media-left',gap:'lg',align:'center',mobile:'stack',columns:[{blocks:[{type:'image',src:'assets/image/private.jpg',alt:'旧图',caption:'旧图'}]},{blocks:[{type:'video',src:'assets/video/private.mp4',poster:'assets/image/poster.jpg',caption:'旧视频'},{type:'articleLink',articleId:'private-article',label:'查看原文'}]}]}]};
  r=await fetch(`${base}/api/templates`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'递归媒体清理测试',page:templatePage})});j=await r.json();assert(r.status===201,'Alpha5 我的模板保存失败');const c=j.page.blocks[0];assert(j.page.design?.contentWidth===92,'Alpha5 我的模板未保留页面样式');assert(c.columns[0].blocks[0].src===''&&c.columns[1].blocks[0].src===''&&c.columns[1].blocks[0].poster===''&&c.columns[1].blocks[1].articleId==='','Alpha5 我的模板未递归清理媒体/文章绑定');
}finally{child.kill('SIGTERM');await sleep(180);await rm(tmp,{recursive:true,force:true});}

const digest=crypto.createHash('sha256').update(JSON.stringify(schema)).digest('hex').slice(0,16);
console.log(`V3.1-alpha5 smoke 通过：整页模板递归清理、内容保留式一键套版、跨期版式资产服务端边界、本地智能建议与 V3.0 证据绑定均正常。schema=${digest}`);
