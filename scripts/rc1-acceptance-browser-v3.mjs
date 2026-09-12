import { assetTagPattern } from './lib-v3-browser-page.mjs';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, '.tmp-v3-rc1-acceptance-browser');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const candidates = [
  process.env.CHROMIUM,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].filter(Boolean);

let chromium = null;
for (const candidate of candidates) {
  try {
    await access(candidate);
    chromium = candidate;
    break;
  } catch {}
}
if (!chromium) {
  console.warn('Safari 验收台浏览器回归跳过：未找到 Chromium。');
  process.exit(0);
}
if (spawnSync('sh', ['-lc', 'command -v xvfb-run'], { encoding: 'utf8' }).status !== 0) {
  console.warn('Safari 验收台浏览器回归跳过：未找到 xvfb-run。');
  process.exit(0);
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const [html, css, js, readerHtml, readerCss, readerJs, issueRaw, pkgRaw] = await Promise.all([
  readFile(path.join(root, 'src/studio/rc1-acceptance.html'), 'utf8'),
  readFile(path.join(root, 'src/studio/rc1-acceptance.css'), 'utf8'),
  readFile(path.join(root, 'src/studio/rc1-acceptance.js'), 'utf8'),
  readFile(path.join(root, 'src/reader/index.html'), 'utf8'),
  readFile(path.join(root, 'src/reader/reader.css'), 'utf8'),
  readFile(path.join(root, 'src/reader/reader.js'), 'utf8'),
  readFile(path.join(root, 'issues/002/issue.json'), 'utf8'),
  readFile(path.join(root, 'package.json'), 'utf8'),
]);

const issue = JSON.parse(issueRaw);
const version = JSON.parse(pkgRaw).version;
const safeIssue = JSON.stringify(issue).replaceAll('<', '\\u003c');
const readerDoc = readerHtml
  .replace(assetTagPattern('link','reader.css'), `<style>${readerCss}</style>`)
  .replace(
    '<script type="module" src="./reader.js"></script>',
    `<script>window.__ISSUE_DATA__=${safeIssue};window.fetch=async()=>new Response(JSON.stringify(window.__ISSUE_DATA__),{status:200,headers:{'Content-Type':'application/json'}})</script><script type="module">${readerJs}</script>`,
  );

const mock = `<script>
try{Object.defineProperty(window,'localStorage',{value:{setItem(){},removeItem(){}}})}catch{}
window.__RC_RECORDS__=[];
window.fetch=async(input,opts={})=>{
  const p=new URL(String(input),'http://rc.test').pathname;
  const json=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{'Content-Type':'application/json'}});
  if(p==='/api/health')return json({ok:true,version:${JSON.stringify(version)}});
  if(p==='/api/rc/probe')return json({version:${JSON.stringify(version)},issue:'002',pages:29,assetSource:'2/assets',mediaAvailable:false,video:'assets/video/demo.mp4',videoAvailable:false,reader:'/live-preview/002/'});
  if(p==='/api/rc/acceptance'&&opts.method==='POST'){
    const x=JSON.parse(opts.body);x.key=x.deviceType+':'+x.deviceName;window.__RC_RECORDS__=[x];
    return json({version:${JSON.stringify(version)},records:window.__RC_RECORDS__});
  }
  if(p==='/api/rc/acceptance')return json({version:${JSON.stringify(version)},records:window.__RC_RECORDS__});
  return json({error:'mock '+p},404);
};
</script>`;
const doc = html
  .replace(assetTagPattern('link','rc1-acceptance.css'), `<style>${css}</style>`)
  .replace('<script src="./rc1-acceptance.js" type="module"></script>', `${mock}<script type="module">${js}</script>`);

const debugPort = 10080 + Math.floor(Math.random() * 100);
const userData = await mkdtemp(path.join(os.tmpdir(), 'rc-acceptance-chrome-'));
const chrome = spawn('xvfb-run', [
  '-a', chromium,
  '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars',
  '--remote-allow-origins=*', '--no-proxy-server',
  `--remote-debugging-port=${debugPort}`, '--remote-debugging-address=127.0.0.1',
  `--user-data-dir=${userData}`, '--no-first-run', 'about:blank',
], { stdio: 'ignore', detached: true });

async function waitJson(url) {
  for (let i = 0; i < 100; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await sleep(80);
  }
  throw new Error('Chromium DevTools timeout');
}

class CDP {
  constructor(url) {
    this.url = url;
    this.id = 0;
    this.pending = new Map();
  }
  async connect() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  close() {
    try { this.ws?.close(); } catch {}
  }
}

let cdp;
try {
  const tabs = await waitJson(`http://127.0.0.1:${debugPort}/json/list`);
  const tab = tabs.find((item) => item.type === 'page') || tabs[0];
  cdp = new CDP(tab.webSocketDebuggerUrl);
  await cdp.connect();
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable')]);
  const evaluate = async (expression) => {
    const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const tree = await cdp.send('Page.getFrameTree');

  for (const [key, width, height, mobile] of [
    ['phone-390', 390, 844, true],
    ['desktop-1366', 1366, 768, false],
  ]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await cdp.send('Page.setDocumentContent', { frameId: tree.frameTree.frame.id, html: doc });
    for (let i = 0; i < 100; i += 1) {
      if (await evaluate("document.querySelector('#probeSummary')?.textContent.includes('29 页')").catch(() => false)) break;
      if (i === 99) throw new Error(`${key}: probe 未就绪`);
      await sleep(40);
    }
    await evaluate(`document.getElementById('reader').srcdoc=${JSON.stringify(readerDoc)}`);
    for (let i = 0; i < 100; i += 1) {
      if (await evaluate("document.getElementById('reader')?.contentWindow?.__V3_READY__===true").catch(() => false)) break;
      if (i === 99) throw new Error(`${key}: Reader 未就绪`);
      await sleep(40);
    }
    const metrics = await evaluate(`({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,failed:[...document.querySelectorAll('#autoChecks .fail')].length})`);
    assert(metrics.sw <= metrics.cw + 1, `${key}: 验收台横向越界 ${metrics.sw}>${metrics.cw}`);
    assert(metrics.failed === 0, `${key}: 自动探测出现 fail`);
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path.join(outDir, `${key}.png`), Buffer.from(screenshot.data, 'base64'));
  }

  await evaluate(`(()=>{document.getElementById('deviceType').value='other';document.getElementById('deviceName').value='V3.0 acceptance browser regression';document.querySelectorAll('[data-check]').forEach(x=>x.checked=true);document.getElementById('submit').click()})()`);
  for (let i = 0; i < 80; i += 1) {
    if (await evaluate("document.getElementById('saveState').textContent.includes('已通过')").catch(() => false)) break;
    if (i === 79) throw new Error('验收结果提交没有变为已通过');
    await sleep(40);
  }
  assert(await evaluate('window.__RC_RECORDS__[0]?.passed===true'), '验收结果未保存');
  await writeFile(path.join(outDir, 'report.json'), JSON.stringify({ version, viewports: ['390x844', '1366x768'], readerLoaded: true, submitPassed: true }, null, 2) + '\n');
  console.log(`V3 ${version} Safari 验收台浏览器回归通过：390/1366 边界、Reader 展示、自动探测和结果提交 UI 正常。`);
} finally {
  cdp?.close();
  try { process.kill(-chrome.pid, 'SIGTERM'); } catch {}
  await sleep(250);
  await rm(userData, { recursive: true, force: true }).catch(() => {});
}
