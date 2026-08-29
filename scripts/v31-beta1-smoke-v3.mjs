import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const assert=(c,m)=>{if(!c)throw new Error(m)};const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pkg=JSON.parse(await readFile('package.json','utf8'));
assert(pkg.version==='3.1.0-beta.1',`version=${pkg.version}`);assert(pkg.v31SchemaVersion==='3.1-alpha24',`schema=${pkg.v31SchemaVersion}`);assert(pkg.v3StableVersion==='3.0.0','stable version changed');
const [studio,server,audit,pub]=await Promise.all([readFile('src/studio/studio.js','utf8'),readFile('scripts/studio-v3.mjs','utf8'),readFile('scripts/audit-v3.mjs','utf8'),readFile('scripts/lib-v3-publication.mjs','utf8')]);
for(const token of ["fallbackValidId = (value,kind=null)","padStart(6,'0')","const identityRepair = ensureIssueIdentity(state.issue)"])assert(studio.includes(token),`studio missing ${token}`);
assert(server.includes('real nested Studio modules')&&server.indexOf('await exists(staticFile)')<server.indexOf("seg[0]==='workspace'&&seg.length>1"),'nested static route priority missing');
for(const type of ['textFlow','pullQuote','sidebar','sectionHeading'])assert(audit.includes(`'${type}'`),`audit missing ${type}`);
assert(pub.includes('version:V3_VERSION'),'publication evidence version is not dynamic');
const port=5186,child=spawn(process.execPath,['scripts/studio-v3.mjs','--host','127.0.0.1','--port',String(port)],{stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
try{let health;for(let i=0;i<120;i++){try{const r=await fetch(`http://127.0.0.1:${port}/api/health`);if(r.ok){health=await r.json();break}}catch{}await sleep(40)}assert(health?.version==='3.1.0-beta.1',`health ${JSON.stringify(health)} ${logs}`);for(const url of ['/workspace/viewport.js','/workspace/inspector.js','/core/identity.js','/core/command-bus.js']){const r=await fetch(`http://127.0.0.1:${port}${url}`);assert(r.ok,`${url} ${r.status}`);const text=await r.text();assert(text.includes('export'),`${url} did not return module source`);}console.log('V3.1-beta1 Smoke 通过：Beta 版本、嵌套模块路由、Stable ID 保存归一化、Alpha23 审计兼容和发布证据版本均已收口。');}
finally{child.kill('SIGTERM');await sleep(120)}
