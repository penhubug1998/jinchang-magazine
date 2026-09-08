import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { mobilePageSnapshot, mobileTextTargets, mobileMediaTargets, primaryEditableField, isMobileStudioViewport, MOBILE_STUDIO_BREAKPOINT } from '../src/studio/mobile-studio.js';
const assert=(c,m)=>{if(!c)throw new Error(m)},sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pkg=JSON.parse(await readFile('package.json','utf8'));
assert(['3.1.0-alpha.26','3.1.0-beta.1','3.1.0-rc.1','3.1.0-rc.2','3.1.0'].includes(pkg.version),`version ${pkg.version}`);
assert(pkg.v31SchemaVersion==='3.1-alpha24',`Alpha26 must not mutate issue schema: ${pkg.v31SchemaVersion}`);
assert(MOBILE_STUDIO_BREAKPOINT===820&&isMobileStudioViewport(390)&&!isMobileStudioViewport(1024),'mobile viewport contract');
const page={title:'手机页',blocks:[{id:'b1',type:'paragraph',text:'正文'},{id:'b2',type:'image',src:'a.jpg'},{id:'b3',type:'quote',text:'引语',richText:{type:'doc',content:[]}}]};
const snap=mobilePageSnapshot(page,5,18);assert(snap.pageNumber===6&&snap.text===2&&snap.media===1&&snap.blocks===3,`snapshot ${JSON.stringify(snap)}`);assert(mobileTextTargets(page).length===2&&mobileMediaTargets(page).length===1&&primaryEditableField(page.blocks[0])==='text','mobile block classification');
const [html,css,studio,reader]=await Promise.all(['src/studio/index.html','src/studio/studio.css','src/studio/studio.js','src/reader/reader.js'].map(x=>readFile(x,'utf8')));
for(const token of ['studioVersionLabel','mobileStudioDock','mobileBottomSheet','data-mobile-tab="text"','data-mobile-tab="media"','data-mobile-tab="layout"','data-mobile-tab="page"'])assert(html.includes(token),`HTML token missing ${token}`);
for(const token of ['V3.1-alpha26 · Mobile Studio','mobile-studio-mode','mobile-bottom-sheet','mobile-workflow-grid'])assert(css.includes(token),`CSS token missing ${token}`);
for(const token of ['setMobileStudioMode','mobileEditBlockInReader','mobileSaveText','mobileApplyPreset','openPublicationCenter','openReviewWorkspace'])assert(studio.includes(token),`Studio mobile token missing ${token}`);
for(const token of ['mobileStudioMode','mobile-studio-mode','mobile-edit-block'])assert(reader.includes(token),`Reader mobile token missing ${token}`);
const port=4958,child=spawn(process.execPath,['scripts/studio-v3.mjs','--host','127.0.0.1','--port',String(port)],{stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
try{let health;for(let i=0;i<150;i++){try{const r=await fetch(`http://127.0.0.1:${port}/api/health`);if(r.ok){health=await r.json();break}}catch{}await sleep(40)}assert((health?.version===pkg.version),`health ${JSON.stringify(health)} ${logs}`);const workspace=await fetch(`http://127.0.0.1:${port}/workspace/?issue=001&page=1&mobile=1`);assert(workspace.ok&&(await workspace.text()).includes('mobileStudioDock'),'workspace mobile shell route failed');const module=await fetch(`http://127.0.0.1:${port}/mobile-studio.js`);assert(module.ok&&(await module.text()).includes('MOBILE_STUDIO_BREAKPOINT'),'mobile helper route failed');}
finally{child.kill('SIGTERM');await sleep(100)}
console.log('V3.1-alpha26 Smoke 通过：Reader-first 手机壳层、四入口 Bottom Sheet、文字/媒体分类、无 Schema 膨胀与移动端运行时路由成立。');
