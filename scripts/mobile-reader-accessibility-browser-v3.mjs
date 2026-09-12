import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root=process.cwd(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),assert=(condition,message)=>{if(!condition)throw new Error(message)};
let chromium=null;
for(const candidate of [process.env.CHROMIUM,'/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome','/usr/bin/google-chrome-stable'].filter(Boolean)){try{await access(candidate);chromium=candidate;break}catch{}}
if(!chromium){console.warn('P1-06 Reader 浏览器回归跳过：未找到 Chromium。');process.exit(0)}

const dist=path.join(root,'dist-v3','001');
const [html,css,readerJs,richTextJs,layoutEngineJs,issueJson]=await Promise.all([
  readFile(path.join(dist,'index.html'),'utf8'),readFile(path.join(dist,'reader.css'),'utf8'),readFile(path.join(dist,'reader.js'),'utf8'),
  readFile(path.join(dist,'rich-text.js'),'utf8'),readFile(path.join(dist,'layout-engine.js'),'utf8'),readFile(path.join(dist,'issue.json'),'utf8')
]);
const moduleDataUrl=source=>`data:text/javascript;base64,${Buffer.from(source,'utf8').toString('base64')}`;
const richUrl=moduleDataUrl(richTextJs);
const layoutSource=layoutEngineJs.replace(/from ['"]\.\/rich-text\.js(?:\?[^'"]*)?['"]/g,`from ${JSON.stringify(richUrl)}`);
const layoutUrl=moduleDataUrl(layoutSource);
const readerSource=readerJs
  .replace(/from ['"]\.\/rich-text\.js(?:\?[^'"]*)?['"]/g,`from ${JSON.stringify(richUrl)}`)
  .replace(/from ['"]\.\/layout-engine\.js(?:\?[^'"]*)?['"]/g,`from ${JSON.stringify(layoutUrl)}`);
const issue=JSON.parse(issueJson);
if(issue.features?.music)issue.features.music.defaultOn=false;
let imagePage=issue.pages.findIndex(page=>(page.blocks||[]).some(block=>block?.type==='image'));
if(imagePage<0){imagePage=Math.min(1,Math.max(0,issue.pages.length-1));issue.pages[imagePage].blocks ||= [];issue.pages[imagePage].blocks.push({type:'image',src:'data:image/png;base64,AA',alt:'弱网图片测试',caption:'弱网图片测试'});}
else{
  const block=issue.pages[imagePage].blocks.find(item=>item?.type==='image');block.src='data:image/png;base64,AA';
}
const safeIssue=JSON.stringify(issue).replaceAll('<','\\u003c');
const prelude=`<script>
window.__ISSUE_DATA__=${safeIssue};window.__V3_INITIAL_PAGE__=${imagePage+1};
window.__WEAK_CONN__={saveData:true,effectiveType:'2g',addEventListener(){},removeEventListener(){}};
try{Object.defineProperty(navigator,'connection',{value:window.__WEAK_CONN__,configurable:true})}catch{try{Object.defineProperty(Navigator.prototype,'connection',{get:()=>window.__WEAK_CONN__,configurable:true})}catch{}}
window.__setOnlineForP106=(value)=>{try{Object.defineProperty(navigator,'onLine',{value:Boolean(value),configurable:true});return navigator.onLine===Boolean(value)}catch{};try{Object.defineProperty(Navigator.prototype,'onLine',{get:()=>Boolean(value),configurable:true});return navigator.onLine===Boolean(value)}catch{};return navigator.onLine===Boolean(value)};
</script>`;
const fixture=html
  .replace(/<link rel="stylesheet" href="\.\/reader\.css(?:\?[^"]*)?">/,`<style>${css}</style>`)
  .replace(/<script type="module" src="\.\/reader\.js(?:\?[^"]*)?"><\/script>/,`${prelude}<script type="module">${readerSource.replaceAll('</script>','<\\/script>')}</script>`);

class CDP{
  constructor(url){this.url=url;this.id=0;this.pending=new Map();this.events=[]}
  async connect(){this.ws=new WebSocket(this.url);await new Promise((resolve,reject)=>{this.ws.onopen=resolve;this.ws.onerror=reject});this.ws.onmessage=event=>{const message=JSON.parse(event.data);if(!message.id){this.events.push(message);return}const waiter=this.pending.get(message.id);if(!waiter)return;this.pending.delete(message.id);message.error?waiter.reject(new Error(message.error.message)):waiter.resolve(message.result)}}
  send(method,params={}){const id=++this.id;this.ws.send(JSON.stringify({id,method,params}));return new Promise((resolve,reject)=>this.pending.set(id,{resolve,reject}))}
  close(){try{this.ws?.close()}catch{}}
}
async function waitForDevtoolsPort(dir,timeout=15000){
  const file=path.join(dir,'DevToolsActivePort'),started=Date.now();let lastError=null;
  while(Date.now()-started<timeout){try{const text=await readFile(file,'utf8'),[port,pathName]=text.trim().split(/\r?\n/);if(Number(port)>0&&pathName)return {port:Number(port),pathName};}catch(error){lastError=error}await sleep(80)}
  throw lastError||new Error('Chromium DevToolsActivePort 未生成');
}
async function waitJson(url,timeout=12000){const started=Date.now();let last=null;while(Date.now()-started<timeout){try{const response=await fetch(url);if(response.ok)return await response.json()}catch(error){last=error}await sleep(80)}throw last||new Error(`timeout ${url}`)}

const userDataDir=await mkdtemp(path.join(os.tmpdir(),'jinchang-p106-reader-'));
const chrome=spawn(chromium,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--hide-scrollbars','--mute-audio','--remote-allow-origins=*','--remote-debugging-port=0',`--user-data-dir=${userDataDir}`,'--no-first-run','--no-default-browser-check','about:blank'],{stdio:'ignore',detached:true});
let cdp=null;
try{
  const {port}=await waitForDevtoolsPort(userDataDir);const tabs=await waitJson(`http://127.0.0.1:${port}/json/list`),tab=tabs.find(row=>row.type==='page')||tabs[0];if(!tab?.webSocketDebuggerUrl)throw new Error('Chromium page websocket unavailable');
  cdp=new CDP(tab.webSocketDebuggerUrl);await cdp.connect();await Promise.all([cdp.send('Page.enable'),cdp.send('Runtime.enable'),cdp.send('Network.enable')]);
  await cdp.send('Network.setUserAgentOverride',{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'});
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  const tree=await cdp.send('Page.getFrameTree');await cdp.send('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html:fixture});
  const evaluate=async expression=>{const result=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result?.value};
  const waitEval=async(expression,timeout=5000)=>{const started=Date.now();let last;while(Date.now()-started<timeout){try{last=await evaluate(expression);if(last)return last}catch{}await sleep(50)}throw new Error(`condition timeout: ${expression}; last=${JSON.stringify(last)}`)};
  await waitEval('window.__V3_READY__===true');await sleep(150);
  const initial=await evaluate(`(()=>{const s=window.__V3_STATE__,actions=[...document.querySelectorAll('.actions button')].map(x=>x.getBoundingClientRect());return {mode:s.networkMode,banner:!document.getElementById('networkStatus').hidden,hasLegacyControl:!!document.getElementById('seniorButton'),overflow:document.documentElement.scrollWidth>innerWidth+1,actions:actions.map(r=>({w:r.width,h:r.height,l:r.left,r:r.right}))};})()`);
  assert(initial.mode==='constrained'&&initial.banner,`2G mode failed ${JSON.stringify(initial)}`);assert(!initial.hasLegacyControl,`legacy accessibility control must be removed`);assert(!initial.overflow,`390px horizontal overflow ${JSON.stringify(initial)}`);assert(initial.actions.length===4&&initial.actions.every(r=>r.h>=43.5&&r.l>=-1&&r.r<=391),`390px action targets failed ${JSON.stringify(initial.actions)}`);
  await waitEval(`document.querySelector('.image-frame.media-load-error')&&document.querySelector('[data-media-retry]')&&!document.querySelector('[data-media-retry]').hidden`,4000);
  const imageRetry=await evaluate(`(()=>{const b=document.querySelector('[data-media-retry]'),r=b.getBoundingClientRect();return {visible:!b.hidden,h:r.height,text:b.textContent}})()`);assert(imageRetry.visible&&imageRetry.h>=39&&/重试图片/.test(imageRetry.text),`image retry failed ${JSON.stringify(imageRetry)}`);

  await cdp.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0,connectionType:'none'});await evaluate(`window.__setOnlineForP106(false);window.dispatchEvent(new Event('offline'))`);await sleep(100);
  const offline=await evaluate(`({mode:window.__V3_STATE__.networkMode,text:document.getElementById('networkStatusText').textContent,hidden:document.getElementById('networkStatus').hidden})`);assert(offline.mode==='offline'&&!offline.hidden&&offline.text.includes('当前离线'),`offline state failed ${JSON.stringify(offline)}`);
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:20,downloadThroughput:5_000_000,uploadThroughput:1_000_000,connectionType:'wifi'});await evaluate(`window.__WEAK_CONN__.saveData=false;window.__WEAK_CONN__.effectiveType='4g';window.__setOnlineForP106(true);window.dispatchEvent(new Event('online'))`);await sleep(140);
  const recovered=await evaluate(`({mode:window.__V3_STATE__.networkMode,hidden:document.getElementById('networkStatus').hidden})`);assert(recovered.mode==='normal'&&recovered.hidden,`network recovery failed ${JSON.stringify(recovered)}`);

  await cdp.send('Emulation.setDeviceMetricsOverride',{width:320,height:740,deviceScaleFactor:2,mobile:true});await evaluate(`window.dispatchEvent(new Event('resize'))`);await sleep(180);
  const small=await evaluate(`(()=>{const toolbar=document.querySelector('.toolbar').getBoundingClientRect(),actions=[...document.querySelectorAll('.actions button')].map(x=>x.getBoundingClientRect());return {w:innerWidth,h:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,toolbar:{l:toolbar.left,r:toolbar.right,b:toolbar.bottom,h:toolbar.height},actions:actions.map(r=>({l:r.left,r:r.right,h:r.height}))};})()`);
  assert(!small.overflow&&small.toolbar.l>=-1&&small.toolbar.r<=small.w+1&&small.toolbar.b<=small.h+1,`320px toolbar bounds failed ${JSON.stringify(small)}`);assert(small.actions.every(r=>r.l>=-1&&r.r<=small.w+1&&r.h>=43.5),`320px actions bounds failed ${JSON.stringify(small.actions)}`);
  console.log('P1-06 Reader browser PASS: 390/320 mobile bounds, four-control layout, 2G/offline/recovery state, and retryable image failures all work.');
}finally{
  cdp?.close();if(chrome?.pid)try{process.kill(-chrome.pid,'SIGTERM')}catch{try{chrome.kill('SIGTERM')}catch{}}await sleep(180);await rm(userDataDir,{recursive:true,force:true}).catch(()=>{});
}
