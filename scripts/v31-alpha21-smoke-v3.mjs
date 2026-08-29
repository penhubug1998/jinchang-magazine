import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolveViewportScale, nearestZoomStep } from '../src/studio/workspace/viewport.js';
import { inspectorKind, blockInspectorSummary } from '../src/studio/workspace/inspector.js';
const assert=(c,m)=>{if(!c)throw new Error(m)},sleep=ms=>new Promise(r=>setTimeout(r,ms)),sha=x=>createHash('sha256').update(x).digest('hex');
const pkg=JSON.parse(await readFile('package.json','utf8'));
assert(['3.1.0-alpha.21','3.1.0-alpha.22','3.1.0-alpha.22.1','3.1.0-alpha.23','3.1.0-alpha.24','3.1.0-alpha.25','3.1.0-alpha.26','3.1.0-beta.1','3.1.0-rc.1','3.1.0-rc.2'].includes(pkg.version),`version ${pkg.version}`);
assert(['3.1-alpha21','3.1-alpha22','3.1-alpha22.1','3.1-alpha23','3.1-alpha24'].includes(pkg.v31SchemaVersion),`schema ${pkg.v31SchemaVersion}`);
assert(pkg.v3StableVersion==='3.0.0','stable version changed');
const schema=JSON.parse(await readFile('baselines/v3-schema-3.1-alpha21.json','utf8'));
assert(schema.workspace?.canvasWorkspace2&&schema.workspace?.contextInspector,'workspace contract missing');
assert(schema.workspace?.zoomModes?.includes('fit-page')&&schema.workspace.zoomModes.includes('fit-width')&&schema.workspace.zoomModes.includes('manual'),'zoom modes missing');
assert(schema.selection?.stableBlockIdCanonical&&schema.selection?.selectionSurvivesReorder,'stable selection contract missing');
assert(schema.readerBridge?.pageIdPreferredResolution&&schema.readerBridge?.visualMetricsCarryPageId,'pageId bridge contract missing');
const lock=JSON.parse(await readFile('baselines/v3.0-final-gate-lock-alpha21.json','utf8'));for(const [file,digest] of Object.entries(lock.files))assert(sha(await readFile(file))===digest,`V3.0 gate lock changed: ${file}`);

assert(Math.abs(resolveViewportScale({mode:'manual',zoomPercent:125,areaWidth:1000,areaHeight:800,deviceWidth:1366,deviceHeight:768})-1.25)<1e-9,'manual zoom failed');
const fitPage=resolveViewportScale({mode:'fit-page',areaWidth:1000,areaHeight:600,deviceWidth:1366,deviceHeight:768,padding:24});
const fitWidth=resolveViewportScale({mode:'fit-width',areaWidth:1000,areaHeight:600,deviceWidth:1366,deviceHeight:768,padding:24});
assert(fitPage>0&&fitWidth>=fitPage,'fit scale failed');
assert(nearestZoomStep(100,1)===125&&nearestZoomStep(100,-1)===75,'zoom step failed');
assert(inspectorKind([])==='page','page inspector failed');
assert(inspectorKind([{type:'paragraph'}])==='text','text inspector failed');
assert(inspectorKind([{type:'image'}])==='media','media inspector failed');
assert(inspectorKind([{type:'container'}])==='layout','layout inspector failed');
assert(inspectorKind([{type:'paragraph'},{type:'image'}])==='multi','multi inspector failed');
const summary=blockInspectorSummary({id:'block_x',type:'paragraph',design:{width:77,fontSize:18,textAlign:'justify'}});
assert(summary.id==='block_x'&&summary.width===77&&summary.fontSize===18&&summary.textAlign==='justify','inspector summary failed');

const [html,studio,reader,css]=await Promise.all(['src/studio/index.html','src/studio/studio.js','src/reader/reader.js','src/studio/studio.css'].map(x=>readFile(x,'utf8')));
for(const token of ['readerZoomOut','readerZoomLabel','readerFitWidth','contextInspector','contextInspectorBody'])assert(html.includes(token),`HTML missing ${token}`);
for(const token of ["./workspace/viewport.js","./workspace/inspector.js",'selectedBlockIds','setBlockSelectionByIds','renderContextInspector','setReaderZoom','resolveReaderPageIndex'])assert(studio.includes(token),`Studio missing ${token}`);
assert(studio.includes("pageId:currentPage()?.id||null")&&studio.includes("type:'page',pageIndex:safe,pageId"),'Studio pageId bridge missing');
assert(reader.includes('data-page-id=')&&reader.includes('findReaderPageIndexById')&&reader.includes('pageId:currentPageId()'),'Reader pageId bridge missing');
assert(reader.includes('pageId:page.dataset.pageId'),'visual metrics pageId missing');
assert(css.includes('context-inspector')&&css.includes('manual-zoom'),'Canvas Workspace CSS missing');

const port=4231,child=spawn(process.execPath,['scripts/studio-v3.mjs','--host','127.0.0.1','--port',String(port)],{stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
try{
 let health;for(let i=0;i<120;i++){try{const r=await fetch(`http://127.0.0.1:${port}/api/health`);if(r.ok){health=await r.json();break}}catch{}await sleep(40)}
 assert(['3.1.0-alpha.21','3.1.0-alpha.22','3.1.0-alpha.22.1','3.1.0-alpha.23','3.1.0-alpha.24','3.1.0-alpha.25','3.1.0-alpha.26','3.1.0-beta.1','3.1.0-rc.1','3.1.0-rc.2'].includes(health?.version),`health ${JSON.stringify(health)} ${logs}`);
 const issue=await(await fetch(`http://127.0.0.1:${port}/api/issues/001`)).json();assert(issue.pages?.length===18,'legacy issue read failed');
 assert((await fetch(`http://127.0.0.1:${port}/workspace/?issue=001&page=1`)).ok,'workspace route failed');
}finally{child.kill('SIGTERM');await sleep(100)}
console.log('V3.1-alpha21 smoke 通过：Canvas Workspace 2.0、Context Inspector、Zoom/Fit、稳定 Block 选择与 Page ID bridge 正常。');
