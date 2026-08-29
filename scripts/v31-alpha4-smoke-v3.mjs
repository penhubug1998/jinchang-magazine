import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const root=process.cwd();
const assert=(c,m)=>{if(!c)throw new Error(m)};
const pkg=JSON.parse(await readFile('package.json','utf8'));
assert(['3.1.0-alpha.4','3.1.0-alpha.5','3.1.0-alpha.6','3.1.0-alpha.7','3.1.0-alpha.8','3.1.0-alpha.9','3.1.0-alpha.10','3.1.0-alpha.11','3.1.0-alpha.12','3.1.0-alpha.13','3.1.0-alpha.14','3.1.0-alpha.15','3.1.0-alpha.16','3.1.0-alpha.17','3.1.0-alpha.18','3.1.0-alpha.19'].includes(pkg.version),`V3.1 alpha4 回归不支持当前版本：${pkg.version}`);
assert(['3.1-alpha4','3.1-alpha5','3.1-alpha6','3.1-alpha7','3.1-alpha8','3.1-alpha9','3.1-alpha10','3.1-alpha11','3.1-alpha12','3.1-alpha13','3.1-alpha14','3.1-alpha15','3.1-alpha16','3.1-alpha17','3.1-alpha18','3.1-alpha19'].includes(pkg.v31SchemaVersion),`V3.1 alpha4 回归不支持当前 schema：${pkg.v31SchemaVersion}`);
assert(pkg.v3StableVersion==='3.0.0','V3.0.0 稳定发布锁未保留');
const schema=JSON.parse(await readFile('baselines/v3-schema-3.1-alpha4.json','utf8'));
assert(schema.designAssetLibrary?.storedOutsideIssueJson===true,'Alpha4 我的样式必须存储在 issue.json 之外');
assert(schema.designAssetLibrary?.maxItems===60,'Alpha4 我的样式上限异常');
for(const scope of ['theme','page','block'])assert(schema.designAssetLibrary?.scopes?.includes(scope),`Alpha4 我的样式缺少 ${scope} 作用域`);
assert(schema.designGovernance?.sameTypeVariantDetection===true,'Alpha4 一致性分叉检测未声明');
assert(schema.designGovernance?.interpretation==='advisory-not-release-gate','Alpha4 一致性治理不得成为 V3.0 正式门禁替代物');
assert(schema.evidenceBinding?.developmentSmokeCannotSatisfyFinalGate===true,'Alpha4 开发 smoke 不得满足正式门禁');

const [studio,html,css,server]=await Promise.all(['src/studio/studio.js','src/studio/index.html','src/studio/studio.css','scripts/studio-v3.mjs'].map(f=>readFile(f,'utf8')));
for(const token of ['loadDesignAssets','saveCurrentDesignAsset','applyDesignAsset','deleteDesignAsset','analyzeDesignConsistency','renderDesignGovernance','locateDesignDivergence'])assert(studio.includes(token),`Studio Alpha4 缺少 ${token}`);
for(const id of ['designLibrarySection','designLibraryList','saveDesignAsset','designGovernance','designGovernanceMetrics','designGovernanceList'])assert(html.includes(`id="${id}"`),`Studio Alpha4 UI 缺少 ${id}`);
assert(css.includes('V3.1-alpha4 · design asset library'),'Studio Alpha4 样式缺失');
for(const token of ['/api/design-library','.v3-design-library','DESIGN_LIBRARY_KEYS','DESIGN_LIBRARY_LIMIT'])assert(server.includes(token),`Studio API Alpha4 缺少 ${token}`);

const lock=JSON.parse(await readFile('baselines/v3.0-final-gate-lock-alpha4.json','utf8'));
assert(lock.stableVersion==='3.0.0','Alpha4 正式门禁锁稳定版本异常');
assert(lock.parentOverlaySha256==='d89ccad9b88392c0f20755711cabfb1f78dd4cccc7c8e93b08e3087f7f1613b9','Alpha4 父基线 SHA256 未绑定到已验收 Alpha3');
for(const [file,expected] of Object.entries(lock.files||{})){
  const actual=crypto.createHash('sha256').update(await readFile(file)).digest('hex');
  assert(actual===expected,`V3.0 正式门禁关键文件被 Alpha4 改动：${file}`);
}

async function freePort(){return await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tmp=await mkdtemp(path.join(os.tmpdir(),'jinchang-v31a4-'));
const styleFile=path.join(tmp,'styles.json'),port=await freePort();
const child=spawn(process.execPath,['scripts/studio-v3.mjs','--host','127.0.0.1','--port',String(port)],{cwd:root,env:{...process.env,V3_DESIGN_LIBRARY_FILE:styleFile},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
const base=`http://127.0.0.1:${port}`;
try{
  let health=null;for(let i=0;i<100;i++){try{const r=await fetch(`${base}/api/health`);if(r.ok){health=await r.json();break}}catch{}await sleep(50)}
  assert(health?.ok&&['3.1.0-alpha.4','3.1.0-alpha.5','3.1.0-alpha.6','3.1.0-alpha.7','3.1.0-alpha.8','3.1.0-alpha.9','3.1.0-alpha.10','3.1.0-alpha.11','3.1.0-alpha.12','3.1.0-alpha.13','3.1.0-alpha.14','3.1.0-alpha.15','3.1.0-alpha.16','3.1.0-alpha.17','3.1.0-alpha.18','3.1.0-alpha.19'].includes(health.version),`Alpha4 Studio health 异常：${logs}`);
  let r=await fetch(`${base}/api/design-library`);let j=await r.json();assert(r.ok&&Array.isArray(j.styles)&&j.styles.length===0,'Alpha4 我的样式初始库异常');
  r=await fetch(`${base}/api/design-library`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'测试主题',scope:'theme',contextType:'theme',payload:{accent:'#315f4a',paper:'#fffaf0',text:'#3b2d26',muted:'#8a7566',fontBase:13.3,radius:12,spacing:10}})});j=await r.json();assert(r.status===201&&j.id&&j.scope==='theme','Alpha4 我的样式保存失败');const savedId=j.id;
  r=await fetch(`${base}/api/design-library`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'非法样式',scope:'page',payload:{background:'#ffffff',hacked:1}})});assert(r.status===400,'Alpha4 服务端必须拒绝未知样式字段');
  r=await fetch(`${base}/api/design-library`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'越界样式',scope:'block',payload:{fontSize:999}})});assert(r.status===400,'Alpha4 服务端必须拒绝越界样式数值');
  r=await fetch(`${base}/api/design-library`);j=await r.json();assert(j.styles.length===1&&j.styles[0].id===savedId,'Alpha4 我的样式读取异常');
  r=await fetch(`${base}/api/design-library/${encodeURIComponent(savedId)}`,{method:'DELETE'});assert(r.ok,'Alpha4 我的样式删除失败');
  r=await fetch(`${base}/api/design-library`);j=await r.json();assert(j.styles.length===0,'Alpha4 我的样式删除后仍残留');
}finally{child.kill('SIGTERM');await sleep(150);await rm(tmp,{recursive:true,force:true});}

const digest=crypto.createHash('sha256').update(JSON.stringify(schema)).digest('hex').slice(0,16);
console.log(`V3.1-alpha4 smoke 通过：跨期“我的样式”持久化/服务端边界、整刊一致性治理入口与 V3.0 证据绑定均正常。schema=${digest}`);
