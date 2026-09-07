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
const mockReplacement='const mock=`<script>window.__V3_APP_BASE_OVERRIDE__="/";window.confirm=()=>true;window.__LIVE_PUSH_COUNT__=0;';
const studioDocNeedle=`const injected=studioHtml.replace('<link rel="stylesheet" href="./studio.css">',\`<style>\${studioCss}</style>\`).replace('<script type="module" src="./studio.js"></script>',\`\${mock}<script type="module">\${studioJs}</script>\`);`;
const studioDocReplacement=`const injected=studioHtml.replace(/<link rel="stylesheet" href="\\.\\/studio\\.css(?:\\?[^\"]*)?">/,\`<style>\${studioCss}</style>\`).replace(/<script type="module" src="\\.\\/studio\\.js(?:\\?[^\"]*)?"><\\/script>/,\`\${mock}<script type="module">\${studioJs}</script>\`);`;

try{
  const source=await readFile(sourceFile,'utf8');
  for(const [needle,label] of [[loadNeedle,'module load block'],[readerDocNeedle,'Reader fixture tags'],[mockNeedle,'Studio mock prelude'],[studioDocNeedle,'Studio fixture tags']]){
    if(!source.includes(needle))throw new Error(`Alpha14 browser bootstrap contract drifted: ${label} not found`);
  }
  const patched=source.replace(loadNeedle,loadReplacement).replace(readerDocNeedle,readerDocReplacement).replace(mockNeedle,mockReplacement).replace(studioDocNeedle,studioDocReplacement);
  await writeFile(tmpFile,patched);
  const exitCode=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[tmpFile],{cwd:root,env:process.env,stdio:'inherit'});
    child.once('error',reject);child.once('exit',code=>resolve(code??1));
  });
  if(exitCode!==0)process.exitCode=exitCode;
}finally{
  await rm(tmpDir,{recursive:true,force:true}).catch(()=>{});
}
