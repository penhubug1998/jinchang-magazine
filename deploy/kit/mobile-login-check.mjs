// 临时诊断：手机尺寸下的真实登录页 + 制作中心新增界面（不进门禁）。
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, cp, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = [];
const check = (c, l, d = '') => { out.push(c); console.log(`  ${c ? '✓' : '✗'} ${l}${d ? ' — ' + d : ''}`); };
let chromium = null;
for (const c of [process.env.CHROMIUM, '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean)) {
  try { await access(c); chromium = c; break } catch { }
}
if (!chromium) { console.error('找不到 Chromium'); process.exit(2); }

const dir = await mkdtemp(path.join(process.cwd(), '.tmp-v3-mobile-login-'));
for (const name of ['scripts', 'src', 'baselines']) await cp(path.join(process.cwd(), name), path.join(dir, name), { recursive: true });
await cp('package.json', path.join(dir, 'package.json'));
await mkdir(path.join(dir, 'issues', '003'), { recursive: true });
await writeFile(path.join(dir, 'issues', '003', 'issue.json'), JSON.stringify({
  id: '003', label: '第三期', publication: '手机端检查', publisher: '本地', subtitle: '手机端检查', engine: 'v3', status: 'ready',
  theme: 'classic-red', features: {}, articles: {}, pages: [{ type: 'cover', navTitle: '封面', title: '手机端检查', kicker: '本地', blocks: [{ type: 'coverMeta', text: '手机端检查' }] }],
}, null, 2) + '\n', 'utf8');

const port = 4187;
const studio = spawn(process.execPath, ['scripts/studio-v3.mjs', '--host', '127.0.0.1', '--port', String(port)], {
  cwd: dir, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, JINCHANG_MAGAZINE_ROOT: dir, STUDIO_ADMIN_PASSWORD: 'MobileCheck123' },
});
let logs = ''; studio.stdout.on('data', d => logs += d); studio.stderr.on('data', d => logs += d);

async function waitJson(url, timeout = 20000) { const st = Date.now(); while (Date.now() - st < timeout) { try { const r = await fetch(url); if (r.ok) return await r.json() } catch { } await sleep(100) } throw new Error('timeout ' + url) }
class CDP {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); }
  async connect() { this.ws = new WebSocket(this.url); await new Promise((r, j) => { this.ws.onopen = r; this.ws.onerror = j }); this.ws.onmessage = e => { const m = JSON.parse(e.data); if (!m.id) return; const p = this.pending.get(m.id); if (!p) return; this.pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result) } }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject })) }
  close() { try { this.ws?.close() } catch { } }
}
let chrome, cdp, userDataDir;
try {
  await waitJson(`http://127.0.0.1:${port}/api/health`);
  userDataDir = await mkdtemp(path.join(os.tmpdir(), 'jinchang-mobile-'));
  const debugPort = 13900 + Math.floor(Math.random() * 80);
  chrome = spawn(chromium, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${userDataDir}`, 'about:blank'], { stdio: 'ignore' });
  const tab = await waitJson(`http://127.0.0.1:${debugPort}/json/list`).then(rows => rows.find(x => x.type === 'page'));
  cdp = new CDP(tab.webSocketDebuggerUrl); await cdp.connect();
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable'), cdp.send('Network.enable')]);
  const ev = async expr => { const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value };
  const setVp = (w, h) => cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });

  console.log('手机端真实界面检查：');
  for (const vp of [{ w: 390, h: 844 }, { w: 360, h: 640 }, { w: 320, h: 568 }]) {
    await setVp(vp.w, vp.h);
    await cdp.send('Network.clearBrowserCookies');   // 否则上一轮登录后 /login 会直接跳回制作中心
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/login` });
    for (let i = 0; i < 100; i++) { if (await ev('!!document.querySelector("#tabForgot")').catch(() => false)) break; await sleep(60) }
    await sleep(150);
    const m = await ev(`(()=>{const de=document.documentElement;const r=el=>{const b=el.getBoundingClientRect();return {w:Math.round(b.width),h:Math.round(b.height),r:Math.round(b.right),l:Math.round(b.left)}};const tabs=[...document.querySelectorAll('.login-tab')];const inputs=[...document.querySelectorAll('#paneLogin input')];return {overflow:de.scrollWidth-de.clientWidth,tabs:tabs.map(t=>({t:t.textContent.trim(),...r(t)})),inputs:inputs.map(i=>({...r(i),font:getComputedStyle(i).fontSize})),card:r(document.querySelector('.login-card')),note:document.querySelector('.login-note').textContent.trim().slice(0,20)}})()`);
    check(m.overflow <= 1, `${vp.w}×${vp.h} 登录页无横向溢出`, `overflow=${m.overflow}`);
    check(m.tabs.length === 3 && m.tabs.every(t => t.h >= 38 && t.w > 0), `${vp.w}×${vp.h} 三个页签可见且不过小`, JSON.stringify(m.tabs.map(t => `${t.t}:${t.w}x${t.h}`)));
    check(m.tabs.every(t => t.r <= vp.w + 1 && t.l >= -1), `${vp.w}×${vp.h} 页签没有超出视口`);
    check(m.inputs.every(i => i.h >= 44 && parseFloat(i.font) >= 16), `${vp.w}×${vp.h} 输入框 ≥44px 且字号 ≥16px（iOS 不缩放）`, JSON.stringify(m.inputs.map(i => `${i.h}/${i.font}`)));

    // 忘记密码面板
    await ev(`document.getElementById('tabForgot').click()`);
    await sleep(120);
    const f = await ev(`(()=>{const de=document.documentElement;const pane=document.getElementById('paneForgot');const r=el=>{const b=el.getBoundingClientRect();return {w:Math.round(b.width),h:Math.round(b.height),b:Math.round(b.bottom)}};return {hidden:pane.hidden,overflow:de.scrollWidth-de.clientWidth,buttons:[...pane.querySelectorAll('button')].map(b=>({t:b.textContent.trim(),...r(b)})),inputs:[...pane.querySelectorAll('input')].map(i=>({...r(i),font:getComputedStyle(i).fontSize}))}})()`);
    check(!f.hidden && f.overflow <= 1, `${vp.w}×${vp.h} 忘记密码面板可打开且无溢出`, `overflow=${f.overflow}`);
    check(f.buttons.every(b => b.h >= 44) && f.inputs.every(i => i.h >= 44 && parseFloat(i.font) >= 16), `${vp.w}×${vp.h} 重置面板控件尺寸/字号合格`, JSON.stringify(f.buttons.map(b => `${b.h}`)));

    // 真实登录 → 制作中心
    await ev(`document.getElementById('tabLogin').click()`);
    await sleep(80);
    await ev(`(()=>{document.getElementById('adminUsername').value='admin';document.getElementById('adminPassword').value='MobileCheck123';document.getElementById('adminLoginForm').dispatchEvent(new Event('submit',{cancelable:true}))})()`);
    let ready = false;
    for (let i = 0; i < 150; i++) { if (await ev('window.__V3_STUDIO_READY__===true').catch(() => false)) { ready = true; break } await sleep(80) }
    check(ready, `${vp.w}×${vp.h} 手机端登录后进入制作中心`, ready ? '' : logs.slice(-160));

    // 用户管理（含新的重置申请区块）
    await ev(`document.getElementById('userAdminBtn').click()`);
    await sleep(500);
    const admin = await ev(`(()=>{const d=document.getElementById('userAdminDialog');const de=document.documentElement;const r=el=>{const b=el.getBoundingClientRect();return {w:Math.round(b.width),h:Math.round(b.height),r:Math.round(b.right),b:Math.round(b.bottom)}};return {open:d.open,card:r(d),overflow:de.scrollWidth-de.clientWidth,reset:!!document.getElementById('userResetList'),resetBtns:[...document.querySelectorAll('#userResetList button')].map(r),close:[...d.querySelectorAll('button')].map(b=>({t:b.textContent.trim(),...r(b)})).slice(0,3)}})()`);
    check(admin.open && admin.card.r <= vp.w + 1 && admin.overflow <= 1, `${vp.w}×${vp.h} 用户管理对话框不溢出`, `overflow=${admin.overflow} card=${admin.card.w}`);
    check(admin.reset, `${vp.w}×${vp.h} 忘记密码申请区块存在`);
    await ev(`document.getElementById('userAdminDialog').close()`);

    // 发布中心（含危险操作区）
    await ev(`document.getElementById('publicationCenterDialog').showModal()`);
    await sleep(900);
    const pub = await ev(`(()=>{const d=document.getElementById('publicationCenterDialog');const de=document.documentElement;const r=el=>{const b=el.getBoundingClientRect();return {w:Math.round(b.width),h:Math.round(b.height),r:Math.round(b.right),b:Math.round(b.bottom)}};const del=document.getElementById('publicationDeleteBtn'),inp=document.getElementById('publicationDeleteConfirm');return {open:d?.open,overflow:de.scrollWidth-de.clientWidth,del:del?r(del):null,inp:inp?{...r(inp),font:getComputedStyle(inp).fontSize}:null,section:!!document.getElementById('publicationDangerSection')}})()`);
    check(pub.section && pub.del && pub.del.h >= 40, `${vp.w}×${vp.h} 删除期刊按钮存在且 ≥40px`, JSON.stringify(pub.del));
    check(pub.inp && pub.inp.h >= 40 && parseFloat(pub.inp.font) >= 16, `${vp.w}×${vp.h} 期号确认输入框 ≥40px 且字号 ≥16px`, JSON.stringify(pub.inp));
    check(pub.overflow <= 1, `${vp.w}×${vp.h} 发布中心无横向溢出`, `overflow=${pub.overflow}`);
    await ev(`document.getElementById('publicationCenterDialog')?.close()`);

    // 其余主要对话框：只要在手机尺寸下溢出或输入字号 <16px 就报出来
    const dialogs = [
      ['设计器', `window.__V3_STUDIO__.openDesignDialog('theme')`, 'designDialog'],
      ['版式实验室', `window.__V3_STUDIO__.openLayoutLab()`, 'layoutLabDialog'],
      ['整页模板', `window.__V3_STUDIO__.openPageTemplateDialog('add')`, 'pageTemplateDialog'],
      ['媒体库', `window.__V3_STUDIO__.openMediaDialog()`, 'mediaDialog'],
      ['内容计划', `window.__V3_STUDIO__.openEditorialPlan()`, 'editorialPlanDialog'],
      ['我的空间', `document.getElementById('mySpaceBtn').click()`, 'mySpaceDialog'],
    ];
    for (const [label, open, id] of dialogs) {
      const opened = await ev(`(()=>{try{${open};return true}catch(e){return String(e.message||e)}})()`);
      await sleep(420);
      const r = await ev(`(()=>{const d=document.getElementById('${id}');if(!d)return {missing:true};const de=document.documentElement;const vis=el=>{const cs=getComputedStyle(el),b=el.getBoundingClientRect();return cs.display!=='none'&&cs.visibility!=='hidden'&&b.width>0&&b.height>0};const fields=[...d.querySelectorAll('input,textarea,select')].filter(vis);const small=fields.filter(el=>parseFloat(getComputedStyle(el).fontSize)<16).map(el=>({id:el.id||el.name||el.className,w:Math.round(el.getBoundingClientRect().width),font:getComputedStyle(el).fontSize}));const box=d.getBoundingClientRect();return {open:d.open,overflow:de.scrollWidth-de.clientWidth,box:{l:Math.round(box.left),r:Math.round(box.right),w:Math.round(box.width)},fields:fields.length,small}})()`);
      if (r.missing || !r.open) { console.log(`  · ${vp.w}×${vp.h} ${label}：手机壳层里不可达，跳过（${String(opened).slice(0, 30)}）`); await ev(`document.getElementById('${id}')?.close()`); await sleep(80); continue; }
      check(r.overflow <= 1 && r.box.l >= -1 && r.box.r <= vp.w + 1, `${vp.w}×${vp.h} ${label}不溢出`, JSON.stringify(r.box));
      check(r.small.length === 0, `${vp.w}×${vp.h} ${label}输入框字号均 ≥16px`, JSON.stringify(r.small).slice(0, 160));
      await ev(`document.getElementById('${id}')?.close()`);
      await sleep(120);
    }
    console.log(`  —— ${vp.w}×${vp.h} 完成 ——`);
  }
  const failed = out.filter(x => !x).length;
  console.log(`\n结果：${out.length - failed}/${out.length} 项通过`);
  process.exitCode = failed ? 1 : 0;
} finally {
  cdp?.close(); chrome?.kill();
  studio.kill();
  await rm(dir, { recursive: true, force: true }).catch(() => { });
}
