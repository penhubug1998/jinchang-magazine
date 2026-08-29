import { spawn, spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const issueArgIndex = process.argv.findIndex((x) => x === "--issue" || x === "--id");
const issueId = issueArgIndex >= 0 ? String(process.argv[issueArgIndex + 1] || "002").padStart(3, "0") : "002";
const distIssue = path.join(root, "dist-v3", issueId);
const compatMode = process.argv.includes("--compat");
const uaArgIndex = process.argv.findIndex((x) => x === '--ua-profile');
const uaProfile = uaArgIndex >= 0 ? String(process.argv[uaArgIndex + 1] || '').trim() : '';
const UA_PROFILES = {
  'edge-win': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0',
  'iphone-safari': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'
};
if (uaProfile && !UA_PROFILES[uaProfile]) throw new Error(`Unknown UA profile: ${uaProfile}`);
const outDir = path.join(root, `.tmp-v3-browser-${issueId}${compatMode ? "-compat" : ""}${uaProfile ? `-${uaProfile}` : ''}`);
const candidates = [process.env.CHROMIUM, "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"].filter(Boolean);
let chromium = null;
for (const candidate of candidates) {
  try { await access(candidate); chromium = candidate; break; } catch {}
}
if (!chromium) {
  console.warn("V3 浏览器回归跳过：未找到 Chromium。静态 smoke test 仍可执行。");
  process.exit(0);
}
const xvfb = spawnSync("sh", ["-lc", "command -v xvfb-run"], { encoding: "utf8" });
if (xvfb.status !== 0 || !xvfb.stdout.trim()) {
  console.warn("V3 浏览器回归跳过：未找到 xvfb-run。静态 smoke test 仍可执行。");
  process.exit(0);
}

const [indexHtml, readerCss, readerJs, richTextJs, layoutEngineJs, issueJson] = await Promise.all([
  readFile(path.join(distIssue, "index.html"), "utf8"),
  readFile(path.join(distIssue, "reader.css"), "utf8"),
  readFile(path.join(distIssue, "reader.js"), "utf8"),
  readFile(path.join(distIssue, "rich-text.js"), "utf8"),
  readFile(path.join(distIssue, "layout-engine.js"), "utf8"),
  readFile(path.join(distIssue, "issue.json"), "utf8"),
]);

// Browser regression uses Page.setDocumentContent because some managed Chromium
// environments block loopback navigation. Preserve the real ESM module graph by
// rewriting local Reader imports to self-contained data: modules instead of
// inlining reader.js with unresolved relative imports against about:blank.
const moduleDataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`;
const richTextModuleUrl = moduleDataUrl(richTextJs);
const layoutEngineModuleSource = layoutEngineJs.replace(/from ['"]\.\/rich-text\.js(?:\?[^'"]*)?['"]/g, `from ${JSON.stringify(richTextModuleUrl)}`);
const layoutEngineModuleUrl = moduleDataUrl(layoutEngineModuleSource);
const readerModuleSource = readerJs
  .replace(/from ['"]\.\/rich-text\.js(?:\?[^'"]*)?['"]/g, `from ${JSON.stringify(richTextModuleUrl)}`)
  .replace(/from ['"]\.\/layout-engine\.js(?:\?[^'"]*)?['"]/g, `from ${JSON.stringify(layoutEngineModuleUrl)}`);
const issue = JSON.parse(issueJson);
const matrixMode = process.argv.includes("--matrix") || issue.testing?.blockMatrix === true;
const v31LayoutMode = issue.testing?.v31LayoutMatrix === true;
const v31DemoDataUri = v31LayoutMode ? `data:image/svg+xml;base64,${Buffer.from(await readFile(path.join(root,'examples/v31-layout-matrix/assets/image/demo.svg'),'utf8')).toString('base64')}` : null;
const pageCount = issue.pages.length;
const articlePage = issue.pages.findIndex((p) => (p.blocks || []).some((b) => b.type === "articleLink"));
const videoPage = issue.pages.findIndex((p) => (p.blocks || []).some((b) => b.type === "video"));
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const debugPort = 9400 + Math.floor(Math.random() * 300);
const userDataDir = await mkdtemp(path.join(os.tmpdir(), "jinchang-v3-chrome-"));
const chrome = spawn("xvfb-run", ["-a", chromium,
  "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars", "--mute-audio", "--remote-allow-origins=*", "--no-proxy-server",
  `--remote-debugging-port=${debugPort}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${userDataDir}`,
  "--no-first-run", "--no-default-browser-check", "about:blank",
], { stdio: "ignore", detached: true });

async function waitForJson(url, timeout = 8000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch (error) { lastError = error; }
    await sleep(100);
  }
  throw lastError || new Error(`timeout: ${url}`);
}

class CDP {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.listeners = new Map(); }
  async connect() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id) {
        const waiter = this.pending.get(msg.id);
        if (!waiter) return;
        this.pending.delete(msg.id);
        msg.error ? waiter.reject(new Error(msg.error.message)) : waiter.resolve(msg.result);
        return;
      }
      for (const fn of this.listeners.get(msg.method) || []) fn(msg.params);
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }
  close() { try { this.ws?.close(); } catch {} }
}

let cdp = null;
try {
  const tabs = await waitForJson(`http://127.0.0.1:${debugPort}/json/list`);
  const tab = tabs.find((entry) => entry.type === "page") || tabs[0];
  if (!tab?.webSocketDebuggerUrl) throw new Error("Chromium DevTools websocket unavailable");
  cdp = new CDP(tab.webSocketDebuggerUrl);
  await cdp.connect();
  await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable"), cdp.send("Log.enable"), cdp.send("Network.enable")]);
  if (uaProfile) await cdp.send('Network.setUserAgentOverride', { userAgent: UA_PROFILES[uaProfile] });

  const runtimeErrors = [];
  cdp.on("Runtime.exceptionThrown", (params) => runtimeErrors.push(params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || "runtime exception"));

  async function evaluate(expression) {
    const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime.evaluate failed");
    return result.result?.value;
  }

  async function waitForEval(expression, timeout = 2600, interval = 40) {
    const started = Date.now();
    let last = false;
    while (Date.now() - started < timeout) {
      try { last = await evaluate(expression); if (last) return last; } catch {}
      await sleep(interval);
    }
    throw new Error(`browser condition timeout: ${expression} (last=${JSON.stringify(last)})`);
  }

  async function frameId() {
    const tree = await cdp.send("Page.getFrameTree");
    return tree.frameTree.frame.id;
  }

  function buildInjectedHtml(pageNumber) {
    const injectedIssue = structuredClone(issue);
    if (v31LayoutMode && v31DemoDataUri) {
      const rewrite = (block) => {
        if (!block || typeof block !== 'object') return;
        if (block.type === 'image' && block.src === 'assets/image/demo.svg') block.src = v31DemoDataUri;
        if (block.type === 'container') for (const col of block.columns || []) for (const child of col.blocks || []) rewrite(child);
      };
      for (const page of injectedIssue.pages || []) for (const block of page.blocks || []) rewrite(block);
    }
    // Browser regression tests UI/interaction. Disable media autoplay because no repository assets are copied into this overlay workspace.
    if (injectedIssue.features?.music) injectedIssue.features.music.defaultOn = false;
    const safeIssue = JSON.stringify(injectedIssue).replaceAll("<", "\\u003c");
    const compatPrelude = compatMode ? `<script>try{Object.defineProperty(window,'visualViewport',{value:undefined,configurable:true})}catch{};try{Object.defineProperty(document.documentElement,'requestFullscreen',{value:undefined,configurable:true})}catch{};try{Object.defineProperty(document,'exitFullscreen',{value:undefined,configurable:true})}catch{};try{Object.defineProperty(document,'fullscreenEnabled',{value:false,configurable:true})}catch{};</script>` : '';
    return indexHtml
      .replace(/<link rel="stylesheet" href="\.\/reader\.css(?:\?[^"]*)?">/, `<style>${readerCss}</style>`)
      .replace(/<script type="module" src="\.\/reader\.js(?:\?[^"]*)?"><\/script>/, `${compatPrelude}<script>window.__ISSUE_DATA__=${safeIssue};window.__V3_INITIAL_PAGE__=${pageNumber};</script><script type="module">${readerModuleSource}</script>`);
  }

  async function setPage(pageNumber = 1) {
    const id = await frameId();
    await cdp.send("Page.setDocumentContent", { frameId: id, html: buildInjectedHtml(pageNumber) });
    const started = Date.now();
    while (Date.now() - started < 6000) {
      try {
        if (await evaluate("document.readyState === 'complete' && window.__V3_READY__ === true")) return Date.now() - started;
      } catch {}
      await sleep(60);
    }
    const diagnostics = await evaluate(`({ready:document.readyState,text:document.body?.innerText?.slice(0,400),hasState:typeof window.__V3_STATE__,scripts:document.scripts.length})`).catch(() => null);
    throw new Error(`V3 reader did not become ready: ${JSON.stringify(diagnostics)}`);
  }

  async function screenshot(name) {
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
    await writeFile(path.join(outDir, name), Buffer.from(data, "base64"));
  }

  async function metrics() {
    return await evaluate(`(() => {
      const rect = (el) => { const r=el?.getBoundingClientRect(); return r ? {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom} : null; };
      const pages=[...document.querySelectorAll('#stage > .spread > .page')];
      return {
        ready:window.__V3_READY__===true,
        pageCountText:document.getElementById('pageCount')?.textContent,
        pageLabel:document.getElementById('pageLabel')?.textContent,
        pageIndexes:pages.map(p=>Number(p.dataset.pageIndex)),
        pageTypes:pages.map(p=>p.classList.contains('blank')?'blank':p.dataset.pageType),
        stage:rect(document.getElementById('stage')),topbar:rect(document.querySelector('.topbar')),toolbar:rect(document.querySelector('.toolbar')),
        horizontalOverflow:document.documentElement.scrollWidth>innerWidth+2||document.body.scrollWidth>innerWidth+2,
        verticalOverflow:document.documentElement.scrollHeight>innerHeight+2,
        viewport:{width:innerWidth,height:innerHeight},fontBase:getComputedStyle(document.documentElement).getPropertyValue('--page-font-base').trim(),
        overflowHints:document.querySelectorAll('.page.has-overflow').length,
      };
    })()`);
  }

  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const allViewports = [
    { name: "iphone-390x844", width: 390, height: 844, mobile: true, touch: true },
    { name: "android-412x915", width: 412, height: 915, mobile: true, touch: true },
    { name: "ipad-820x1180", width: 820, height: 1180, mobile: true, touch: true },
    { name: "desktop-1366x768", width: 1366, height: 768, mobile: false, touch: false },
    { name: "desktop-1920x1080", width: 1920, height: 1080, mobile: false, touch: false },
  ];
  // Full publication preflight always runs the complete five-viewport matrix.
  // Beta production rehearsal can request a focused post-release phone proof so
  // the already-completed full matrix is not redundantly executed a second time.
  const viewports = process.argv.includes("--mobile-only") ? allViewports.filter(v => v.name === "iphone-390x844") : process.argv.includes("--desktop-only") ? allViewports.filter(v => v.name === "desktop-1366x768") : allViewports;

  const results = [];
  for (const viewport of viewports) {
    runtimeErrors.length = 0;
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile });
    await cdp.send("Emulation.setTouchEmulationEnabled", viewport.touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
    const initialReadyMs = await setPage(1);
    let m = await metrics();
    // Device emulation can deliver the media-query transition a frame after __V3_READY__.
    // Wait for the expected one-page/two-slot structure instead of racing the responsive render.
    const responsiveStarted = Date.now();
    while (Date.now() - responsiveStarted < 1800) {
      const expectedSlots = viewport.width <= 760 ? 1 : 2;
      if (m.pageIndexes.length === expectedSlots) break;
      await sleep(40);
      m = await metrics();
    }
    assert(m.ready, `${viewport.name}: reader not ready`);
    assert(!m.horizontalOverflow, `${viewport.name}: horizontal overflow`);
    if (viewport.width <= 760) {
      assert(m.pageIndexes.length === 1 && m.pageIndexes[0] === 0, `${viewport.name}: mobile cover structure incorrect (${m.pageIndexes})`);
      assert(m.stage.width <= viewport.width - 4, `${viewport.name}: stage wider than viewport`);
      assert(m.stage.bottom <= m.toolbar.y + 2, `${viewport.name}: stage overlaps bottom toolbar`);
      if (compatMode && viewport.name === "iphone-390x844") {
        await evaluate("document.getElementById('fullButton').click()");
        await sleep(80);
        assert(await evaluate("document.body.classList.contains('mobile-immersive')"), `${viewport.name}: Safari-like no-Fullscreen fallback did not enter immersive mode`);
        await evaluate("document.getElementById('fullButton').click()");
        await sleep(40);
      }
    } else {
      assert(m.pageIndexes.length === 2, `${viewport.name}: desktop must show two book slots`);
      assert(m.pageIndexes[0] === -1 && m.pageIndexes[1] === 0, `${viewport.name}: first spread must be blank + cover (${m.pageIndexes})`);
      assert(m.stage.width >= viewport.width - 150, `${viewport.name}: desktop stage artificially narrow (${m.stage.width})`);
    }
    await screenshot(`${viewport.name}-cover.png`);

    if (v31LayoutMode) {
      const expectedLayouts=["single","two-equal","two-40-60","two-60-40","three-equal","media-left","media-right"];
      if (viewport.name === "desktop-1366x768") {
        for (let pageIndex=1; pageIndex<=expectedLayouts.length; pageIndex++) {
          await setPage(pageIndex + 1);
          const layout=expectedLayouts[pageIndex-1];
          const info=await evaluate(`(() => { const el=document.querySelector('.page[data-page-index="${pageIndex}"] .layout-container.layout-${layout}'); if(!el)return null; const cs=getComputedStyle(el); return {columns:el.children.length,display:cs.display,template:cs.gridTemplateColumns}; })()`);
          assert(info && info.display==='grid',`V3.1 ${layout}: 容器未按 grid 渲染`);
          const expectedColumns=layout==='single'?1:layout==='three-equal'?3:2;
          assert(info.columns===expectedColumns,`V3.1 ${layout}: 列数 ${info.columns} != ${expectedColumns}`);
        }
        await setPage(6);
        await screenshot(`${viewport.name}-v31-layout.png`);
        await setPage(1);
      }
      if (viewport.width <= 760) {
        await setPage(3);
        const stacked=await evaluate(`(() => { const el=document.querySelector('.page[data-page-index="2"] .layout-container'); if(!el)return null; return getComputedStyle(el).gridTemplateColumns.split(' ').length; })()`);
        assert(stacked===1,`${viewport.name}: V3.1 mobile stack 未折叠为单栏 (${stacked})`);
        if (viewport.name === 'iphone-390x844') await screenshot(`${viewport.name}-v31-layout.png`);
        await setPage(1);
      }
    }

    if (matrixMode && viewport.name === "desktop-1366x768") {
      const selectors = {
        paragraph:"p", quote:".quote", chips:".chips", cardline:".cardline", casePair:".case-pair", toc:".toc-block",
        articleLink:".article-link", video:"video", image:".image-media img", coverMeta:".cover-meta", coverSections:".cover-sections",
        blessing:".blessing", producer:".producer", cards:".content-cards"
      };
      for (let pageIndex=0; pageIndex<issue.pages.length; pageIndex++) {
        await setPage(pageIndex + 1);
        for (const block of issue.pages[pageIndex].blocks || []) {
          const selector = selectors[block.type];
          assert(selector, `matrix: no selector mapped for ${block.type}`);
          const found = await evaluate(`Boolean(document.querySelector('.page[data-page-index="${pageIndex}"] ${selector}'))`);
          assert(found, `matrix: ${block.type} 未在第 ${pageIndex+1} 页渲染`);
        }
      }
      const allPageTypes=[...new Set(issue.pages.map(p=>p.type))];
      assert(allPageTypes.length===9,`matrix: 页面类型覆盖不足 ${allPageTypes}`);
      await setPage(1);
    }

    if (viewport.width <= 760) {
      await evaluate(`(() => {
        const s=document.getElementById('stage'),r=s.getBoundingClientRect(),target=s.querySelector('.page-scroll')||s;
        const fire=(node,type,x,y)=>node.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:77,pointerType:'touch',clientX:x,clientY:y,buttons:type==='pointerup'?0:1}));
        const y=r.top+r.height*.5;
        fire(target,'pointerdown',r.left+r.width*.82,y);
        // After the first horizontal move the reader replaces the stage DOM with a swipe layer.
        // Pointer capture means subsequent real events are delivered to the stage; mirror that here.
        fire(s,'pointermove',r.left+r.width*.28,y);
        fire(s,'pointerup',r.left+r.width*.25,y);
      })()`);
      await waitForEval(`window.__V3_STATE__?.turning === false && document.getElementById('pageCount')?.textContent === ${JSON.stringify(`2 / ${pageCount}`)}`, 2600);
      const afterSwipe = await metrics();
      assert(afterSwipe.pageCountText === `2 / ${pageCount}`, `${viewport.name}: drag swipe did not advance (${afterSwipe.pageCountText})`);
    } else {
      await evaluate("document.getElementById('nextBottom').click()");
      await waitForEval(`window.__V3_STATE__?.turning === false && document.getElementById('pageCount')?.textContent === ${JSON.stringify(`3 / ${pageCount}`)}`, 2600);
      const next = await metrics();
      assert(next.pageCountText === `3 / ${pageCount}`, `${viewport.name}: next spread should focus page 3 (${next.pageCountText})`);
      assert(next.pageIndexes[0] === 1 && next.pageIndexes[1] === 2, `${viewport.name}: second spread should be indexes 1 + 2 (${next.pageIndexes})`);
      await evaluate("document.getElementById('prevBottom').click()");
      await waitForEval(`window.__V3_STATE__?.turning === false && document.getElementById('pageCount')?.textContent === ${JSON.stringify(`1 / ${pageCount}`)}`, 2600);
      const prev = await metrics();
      assert(prev.pageCountText === `1 / ${pageCount}`, `${viewport.name}: reverse flip did not return to cover`);
    }

    if (articlePage >= 0) {
      await setPage(articlePage + 1);
      await evaluate("document.querySelector('[data-article-id]')?.click()");
      await sleep(50);
      assert(await evaluate("document.getElementById('articleDialog').open === true"), `${viewport.name}: article dialog failed`);
      assert(await evaluate("Boolean(document.querySelector('#articleDialog a[href]'))"), `${viewport.name}: article link missing`);
      await evaluate("document.getElementById('articleDialog').close()");
    }

    await evaluate("document.getElementById('tocButton').click()");
    assert(await evaluate("document.getElementById('tocDialog').open === true"), `${viewport.name}: TOC dialog failed`);
    assert(await evaluate(`document.querySelectorAll('#tocList button').length === ${pageCount}`), `${viewport.name}: TOC count is not ${pageCount}`);
    await evaluate("document.getElementById('tocDialog').close()");

    await evaluate("document.getElementById('fontButton').click();document.querySelector('[data-font=\"1.24\"]').click()");
    await sleep(60);
    assert(await evaluate("Math.abs(window.__V3_STATE__.fontScale-1.24)<.001"), `${viewport.name}: font scale state failed`);

    if (videoPage >= 0) {
      await setPage(videoPage + 1);
      assert(await evaluate("document.querySelector('video')?.preload === 'metadata'"), `${viewport.name}: video preload is not metadata`);
      assert(await evaluate("Boolean(document.querySelector('[data-video-full]'))"), `${viewport.name}: custom video fullscreen button missing`);
      await evaluate("document.querySelector('[data-video-full]').click()");
      await sleep(40);
      assert(await evaluate("document.getElementById('videoFullscreenOverlay').classList.contains('open')"), `${viewport.name}: video fullscreen overlay failed`);
      await evaluate("document.getElementById('videoFullscreenClose').click()");
      await screenshot(`${viewport.name}-video-page.png`);
    }

    results.push({ viewport: viewport.name, initialReadyMs, cover: m, runtimeErrors: [...runtimeErrors] });
  }

  const seriousErrors = results.flatMap((result) => result.runtimeErrors.map((text) => `${result.viewport}: ${text}`));
  if (seriousErrors.length) throw new Error(`浏览器运行时错误：\n${seriousErrors.join("\n")}`);

  const navigatorUserAgent = await evaluate('navigator.userAgent');
  await writeFile(path.join(outDir, "report.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), issue: issueId, pageCount, matrixMode, v31LayoutMode, compatMode, uaProfile: uaProfile || 'chromium-default', navigatorUserAgent, articlePage: articlePage >= 0 ? articlePage + 1 : null, videoPage: videoPage >= 0 ? videoPage + 1 : null, viewports: results }, null, 2)}\n`, "utf8");
  console.log(`V3 浏览器回归通过：${issueId} · ${viewports.map((v) => v.name).join("、")}。截图与报告：${path.relative(root, outDir)}`);
} finally {
  cdp?.close();
  try { process.kill(-chrome.pid, "SIGTERM"); } catch {}
  await sleep(300);
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
}
