import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root=process.cwd();
const sourceFile=path.join(root,'scripts','alpha14-browser-regression-v3.mjs');
const tmpDir=await mkdtemp(path.join(os.tmpdir(),'jinchang-alpha14-browser-bootstrap-'));
const tmpFile=path.join(tmpDir,'alpha14-browser-regression-v3.mjs');

const loadNeedle=`const [studioHtml,studioCss,studioJs,readerHtml,readerCss,readerJs,issueRaw]=await Promise.all([
  readFile(path.join(root,'src/studio/index.html'),'utf8'),readFile(path.join(root,'src/studio/studio.css'),'utf8'),readFile(path.join(root,'src/studio/studio.js'),'utf8'),
  readFile(path.join(root,'src/reader/index.html'),'utf8'),readFile(path.join(root,'src/reader/reader.css'),'utf8'),readFile(path.join(root,'src/reader/reader.js'),'utf8'),readFile(path.join(root,'issues/002/issue.json'),'utf8')
]);`;
const loadReplacement=`const [studioHtml,studioCss,studioJsRaw,readerHtml,readerCss,readerJsRaw,presetJs,richTextJs,layoutEngineJs,issueRaw]=await Promise.all([
  readFile(path.join(root,'src/studio/index.html'),'utf8'),readFile(path.join(root,'src/studio/studio.css'),'utf8'),readFile(path.join(root,'src/studio/studio.js'),'utf8'),
  readFile(path.join(root,'src/reader/index.html'),'utf8'),readFile(path.join(root,'src/reader/reader.css'),'utf8'),readFile(path.join(root,'src/reader/reader.js'),'utf8'),
  readFile(path.join(root,'src/studio/design-presets.js'),'utf8'),readFile(path.join(root,'src/reader/rich-text.js'),'utf8'),readFile(path.join(root,'src/reader/layout-engine.js'),'utf8'),readFile(path.join(root,'issues/002/issue.json'),'utf8')
]);
const moduleData=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const presetUrl=moduleData(presetJs),richTextUrl=moduleData(richTextJs);
const layoutEngineUrl=moduleData(layoutEngineJs.replace(/from\\s*['\"]\\.\\/rich-text\\.js['\"]/,\`from '\${richTextUrl}'\`));
const studioJs=studioJsRaw.replace(/from\\s*['\"]\\.\\/design-presets\\.js['\"]/,\`from '\${presetUrl}'\`);
const readerJs=readerJsRaw.replace(/from\\s*['\"]\\.\\/rich-text\\.js['\"]/,\`from '\${richTextUrl}'\`).replace(/from\\s*['\"]\\.\\/layout-engine\\.js['\"]/,\`from '\${layoutEngineUrl}'\`);
if(/from\\s*['\"]\\.\\/design-presets\\.js['\"]/.test(studioJs))throw new Error('Alpha14 fixture failed to rewrite Studio design-presets module');
if(/from\\s*['\"]\\.\\/(?:rich-text|layout-engine)\\.js['\"]/.test(readerJs))throw new Error('Alpha14 fixture failed to rewrite Reader modules');`;
const readerDocNeedle=`const readerDoc=readerHtml.replace('<link rel="stylesheet" href="./reader.css">',\`<style>\${readerCss}</style>\`).replace('<script type="module" src="./reader.js"></script>',\`<script>window.__V3_STUDIO_EMBED__=true;window.__ISSUE_DATA__=\${safeIssue};</script><script type="module">\${readerJs}</script>\`);`;
const readerDocReplacement=`const readerDoc=readerHtml.replace(/<link rel="stylesheet" href="\\.\\/reader\\.css(?:\\?[^\"]*)?">/,\`<style>\${readerCss}</style>\`).replace(/<script type="module" src="\\.\\/reader\\.js(?:\\?[^\"]*)?"><\\/script>/,\`<script>window.__V3_STUDIO_EMBED__=true;window.__ISSUE_DATA__=\${safeIssue};</script><script type="module">\${readerJs}</script>\`);`;
const mockNeedle='const mock=`<script>window.confirm=()=>true;window.__LIVE_PUSH_COUNT__=0;';
const mockReplacement='const mock=`<script>window.__V3_APP_BASE_OVERRIDE__="/";window.__V3_FORCE_WORKSPACE__=true;window.confirm=()=>true;window.__LIVE_PUSH_COUNT__=0;';
const studioDocNeedle=`const injected=studioHtml.replace('<link rel="stylesheet" href="./studio.css">',\`<style>\${studioCss}</style>\`).replace('<script type="module" src="./studio.js"></script>',\`\${mock}<script type="module">\${studioJs}</script>\`);`;
const studioDocReplacement=`const injected=studioHtml.replace(/<link rel="stylesheet" href="\\.\\/studio\\.css(?:\\?[^\"]*)?">/,\`<style>\${studioCss}</style>\`).replace(/<script type="module" src="\\.\\/studio\\.js(?:\\?[^\"]*)?"><\\/script>/,\`\${mock}<script type="module">\${studioJs}</script>\`);`;
const devicesNeedle=`const devices=[['desktop-1366',1366,768,false,2],['desktop-1920',1920,1080,false,2],['tablet-820',820,1180,false,2],['phone-390',390,844,true,1],['phone-412',412,915,true,1]],report=[];`;
const devicesReplacement=`const devices=[['desktop-1366',1366,768,false,1],['desktop-1920',1920,1080,false,1],['tablet-820',820,1180,false,1],['phone-390',390,844,true,1],['phone-412',412,915,true,1]],report=[];`;
const deviceSwitchNeedle=`await ev(\`(()=>{const s=document.getElementById('readerPreviewDevice');s.value='\${key}';s.dispatchEvent(new Event('change',{bubbles:true}));})()\`);await sleep(80);const m=await ev(`;
const deviceSwitchReplacement=`await ev(\`(()=>{const s=document.getElementById('readerPreviewDevice');s.value='\${key}';s.dispatchEvent(new Event('change',{bubbles:true}));const f=document.getElementById('builtPreviewFrame');f.style.width='\${w}px';f.style.height='\${h}px';f.setAttribute('width','\${w}');f.setAttribute('height','\${h}');})()\`);await sleep(100);const m=await ev(`;
const deviceMetricsNeedle=`return {w:cw.innerWidth,h:cw.innerHeight,mobile:cw.matchMedia('(max-width:760px)').matches,pages:cd.querySelectorAll('#stage .spread > .page').length,label:document.getElementById('readerLayoutBadge').textContent,scale:document.getElementById('readerDevice').dataset.scale}`;
const deviceMetricsReplacement=`return {deviceW:parseFloat(document.getElementById('readerDevice').style.width)||0,deviceH:parseFloat(document.getElementById('readerDevice').style.height)||0,frameW:f.getBoundingClientRect().width,frameH:f.getBoundingClientRect().height,w:cw.innerWidth,h:cw.innerHeight,mobile:cw.matchMedia('(max-width:760px)').matches,pages:cd.querySelectorAll('#stage .spread > .page').length,label:document.getElementById('readerLayoutBadge').textContent,scale:document.getElementById('readerDevice').dataset.scale}`;
const deviceAssertNeedle=`assert(Math.abs(m.w-w)<=1&&Math.abs(m.h-h)<=1,\`\${key}: iframe \${m.w}×\${m.h} != \${w}×\${h}\`);`;
const deviceAssertReplacement=`assert(Math.abs(m.deviceW-w)<=1&&Math.abs(m.deviceH-h)<=1,\`\${key}: device frame \${m.deviceW}×\${m.deviceH} != \${w}×\${h}\`);assert(m.frameW>0&&m.frameH>0,\`\${key}: visible Reader iframe did not establish layout viewport\`);assert(Math.abs(m.w-w)<=1&&Math.abs(m.h-h)<=1,\`\${key}: Reader viewport \${m.w}×\${m.h} != \${w}×\${h}\`);`;
const pageSyncNeedle=`await ev(\`(()=>{const s=document.getElementById('readerPreviewDevice');s.value='phone-390';s.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.page-item[data-page-index="4"]').click()})()\`);await sleep(100);assert(await ev("document.getElementById('builtPreviewFrame').contentWindow.__V3_STATE__.pageIndex===4"),'制作中心页码没有同步到 Reader');`;
const pageSyncReplacement=`await ev(\`(()=>{const s=document.getElementById('readerPreviewDevice');s.value='phone-390';s.dispatchEvent(new Event('change',{bubbles:true}));return window.__V3_STUDIO__.goToPage(4)})()\`);let pageSynced=false;for(let i=0;i<100;i++){pageSynced=await ev("window.__V3_STUDIO__.state.page===4 && document.getElementById('builtPreviewFrame').contentWindow.__V3_STATE__.pageIndex===4").catch(()=>false);if(pageSynced)break;await sleep(25)}if(!pageSynced){const diag=await ev(\`(()=>{const s=window.__V3_STUDIO__.state,f=document.getElementById('builtPreviewFrame'),r=f?.contentWindow?.__V3_STATE__;return {studioPage:s.page,readerPage:r?.pageIndex??null,readerReady:s.readerPreviewReady,pending:s.readerPendingPageRequest?{target:s.readerPendingPageRequest.target,attempts:s.readerPendingPageRequest.attempts,observedMismatch:s.readerPendingPageRequest.observedMismatch}:null,requested:f?.dataset?.requestedPageIndex||null,rendered:f?.dataset?.renderedPageIndex||null,syncState:f?.dataset?.pageSyncState||null,frameIssue:f?.dataset?.issueId||null,frameSrc:f?.getAttribute('src')||null}})()\`);throw new Error('制作中心页码没有通过 request/ack 同步到 Reader: '+JSON.stringify(diag))}`;
const successNeedle=`console.log('Alpha14 真实 Reader 浏览器回归通过：五档 iframe viewport、PC双页/手机单页、未保存实时联动、双向翻页与放大预览均正常。');`;
const successReplacement=`console.log('Alpha14 真实 Reader 浏览器回归通过：五档设备 viewport、Studio 单页聚焦、桌面/手机断点、未保存实时联动、双向翻页与放大预览均正常。');`;

try{
  const source=await readFile(sourceFile,'utf8');
  for(const [needle,label] of [[loadNeedle,'module load block'],[readerDocNeedle,'Reader fixture tags'],[mockNeedle,'Studio mock prelude'],[studioDocNeedle,'Studio fixture tags'],[devicesNeedle,'Studio single-page device matrix'],[deviceSwitchNeedle,'device switch fixture'],[deviceMetricsNeedle,'device metrics fixture'],[deviceAssertNeedle,'device viewport assertion'],[pageSyncNeedle,'reliable page sync fixture'],[successNeedle,'success contract text']]){
    if(!source.includes(needle))throw new Error(`Alpha14 browser bootstrap contract drifted: ${label} not found`);
  }
  const patched=source.replace(loadNeedle,loadReplacement).replace(readerDocNeedle,readerDocReplacement).replace(mockNeedle,mockReplacement).replace(studioDocNeedle,studioDocReplacement).replace(devicesNeedle,devicesReplacement).replace(deviceSwitchNeedle,deviceSwitchReplacement).replace(deviceMetricsNeedle,deviceMetricsReplacement).replace(deviceAssertNeedle,deviceAssertReplacement).replace(pageSyncNeedle,pageSyncReplacement).replace(successNeedle,successReplacement);
  await writeFile(tmpFile,patched);
  const exitCode=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[tmpFile],{cwd:root,env:process.env,stdio:'inherit'});
    child.once('error',reject);child.once('exit',code=>resolve(code??1));
  });
  if(exitCode!==0)process.exitCode=exitCode;
}finally{
  await rm(tmpDir,{recursive:true,force:true}).catch(()=>{});
}
