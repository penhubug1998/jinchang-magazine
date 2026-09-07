from pathlib import Path


def replace_once(path, old, new, label):
    p=Path(path); s=p.read_text()
    if old not in s:
        raise SystemExit(f'{label} drifted: {path}')
    p.write_text(s.replace(old,new,1))

# Reader shell: visible senior-mode entry, network status and an explicit senior card.
replace_once('src/reader/index.html',
'''  <div class="app" id="app">\n    <header class="topbar">''',
'''  <div class="app" id="app">\n    <div id="networkStatus" class="network-status" role="status" aria-live="polite" hidden><span id="networkStatusText"></span><button id="networkRetry" type="button">重试</button></div>\n    <header class="topbar">''','network status shell')
replace_once('src/reader/index.html',
'''        <button id="tocButton" type="button" title="目录"><svg aria-hidden="true"><use href="#i-list"></use></svg></button>''',
'''        <button id="seniorButton" class="senior-toggle" type="button" title="长辈模式" aria-pressed="false"><span class="senior-label">长辈</span></button>\n        <button id="tocButton" type="button" title="目录"><svg aria-hidden="true"><use href="#i-list"></use></svg></button>''','senior topbar entry')
replace_once('src/reader/index.html',
'''    <div class="font-list">\n      <button data-font="0.92" type="button">较小</button>\n      <button data-font="1" type="button">标准</button>\n      <button data-font="1.12" type="button">较大</button>\n      <button data-font="1.24" type="button">特大</button>\n    </div>\n  </dialog>''',
'''    <div class="font-list">\n      <button data-font="0.92" type="button">较小</button>\n      <button data-font="1" type="button">标准</button>\n      <button data-font="1.12" type="button">较大</button>\n      <button data-font="1.24" type="button">特大</button>\n    </div>\n    <div class="senior-mode-card">\n      <div><strong>长辈模式</strong><span>放大正文与操作区、增加行距和对比度，并减少手机翻页动画。</span></div>\n      <button id="seniorDialogButton" type="button" aria-pressed="false">开启长辈模式</button>\n    </div>\n  </dialog>''','senior font dialog')
replace_once('src/reader/index.html','3.1.0-ai-link-20260902-06','3.1.0-p1-06-20260907-01','reader css revision')
replace_once('src/reader/index.html','3.1.0-ai-link-20260902-06','3.1.0-p1-06-20260907-01','reader js revision')

# Reader state and helpers.
replace_once('src/reader/reader.js','''  fontScale: 1,\n  turning: false,''','''  fontScale: 1,\n  seniorMode: false,\n  networkMode: "normal",\n  connectionType: "",\n  turning: false,''','reader state')
replace_once('src/reader/reader.js','''const isMobile = () => mobileQuery.matches;\nfunction storageGet(key) {''',r'''const isMobile = () => mobileQuery.matches;
const networkConnection = () => navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
const seniorFontBoost = () => state.seniorMode ? (isMobile() ? 1.16 : 1.10) : 1;
function currentNetworkMode() {
  if (navigator.onLine === false) return "offline";
  const connection=networkConnection(),effective=String(connection?.effectiveType||"").toLowerCase();
  if (connection?.saveData===true || effective==="slow-2g" || effective==="2g") return "constrained";
  return "normal";
}
function updateSeniorControls(){
  const top=$("seniorButton"),dialog=$("seniorDialogButton"),active=Boolean(state.seniorMode);
  if(top){top.classList.toggle("active",active);top.setAttribute("aria-pressed",active?"true":"false");top.title=active?"长辈模式已开启，点击恢复标准阅读":"开启长辈模式";const label=top.querySelector(".senior-label");if(label)label.textContent=active?"标准":"长辈";}
  if(dialog){dialog.classList.toggle("active",active);dialog.setAttribute("aria-pressed",active?"true":"false");dialog.textContent=active?"恢复标准模式":"开启长辈模式";}
}
function setSeniorMode(on,{silent=false,renderNow=true}={}){
  state.seniorMode=Boolean(on);document.body.classList.toggle("senior-mode",state.seniorMode);updateSeniorControls();
  if(state.issue&&renderNow)render({preserveScroll:true});else requestAnimationFrame(()=>{syncMobileGeometry();updateResponsiveTypography();updateOverflowHints();});
  if(state.issue)saveProgress();if(!silent)toast(state.seniorMode?"已开启长辈模式":"已恢复标准阅读");
}
function syncNetworkStatus({announce=false}={}){
  const previous=state.networkMode,mode=currentNetworkMode(),connection=networkConnection();state.networkMode=mode;state.connectionType=String(connection?.effectiveType||"");
  document.body.classList.toggle("network-offline",mode==="offline");document.body.classList.toggle("network-constrained",mode==="constrained");
  const box=$("networkStatus"),text=$("networkStatusText");if(box&&text){
    if(mode==="normal")box.hidden=true;else{box.hidden=false;box.dataset.mode=mode;text.textContent=mode==="offline"?"当前离线：已加载的文字仍可阅读，图片和音频将在联网后恢复。":`当前网络较慢${state.connectionType?`（${state.connectionType}）`:""}：已暂停自动音乐和视频预加载。`;}
  }
  if(announce&&previous!==mode){if(mode==="normal")toast("网络已恢复");else if(mode==="offline")toast("网络已断开，文字阅读可继续");else toast("已切换为弱网省流模式");}
  return mode;
}
const networkDelay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function fetchIssueWithRetry(){
  let lastError=null;syncNetworkStatus();const delays=state.networkMode==="constrained"?[0,900,2200]:[0,350,1000];
  for(let attempt=0;attempt<delays.length;attempt++){
    if(navigator.onLine===false)throw new Error("当前处于离线状态，请联网后点击重试");if(delays[attempt])await networkDelay(delays[attempt]);
    let timer=0,controller=null;try{
      if(typeof AbortController!=="undefined"){controller=new AbortController();timer=setTimeout(()=>controller.abort(),10000);}
      const response=await fetch("./issue.json",{cache:"no-store",...(controller?{signal:controller.signal}:{})});if(timer)clearTimeout(timer);
      if(!response.ok)throw new Error(`期刊数据加载失败：HTTP ${response.status}`);return await response.json();
    }catch(error){if(timer)clearTimeout(timer);lastError=error;syncNetworkStatus();}
  }
  throw new Error(lastError?.name==="AbortError"?"网络响应较慢，期刊数据多次加载超时，请点击重试":(lastError?.message||"期刊数据加载失败，请点击重试"));
}
function storageGet(key) {''','senior and network helpers')

replace_once('src/reader/reader.js','''`${(base * state.fontScale).toFixed(2)}px`''','''`${(base * state.fontScale * seniorFontBoost()).toFixed(2)}px`''','mobile senior typography')
replace_once('src/reader/reader.js','''`${(13.3 * scale * state.fontScale).toFixed(2)}px`''','''`${(13.3 * scale * state.fontScale * seniorFontBoost()).toFixed(2)}px`''','desktop senior typography')
replace_once('src/reader/reader.js','''function turnAnimationMode() {\n  const mode = String(state.issue?.features?.turnAnimation || "smooth");''','''function turnAnimationMode() {\n  if (state.seniorMode && isMobile()) return "none";\n  const mode = String(state.issue?.features?.turnAnimation || "smooth");''','senior reduced animation')

# Weak-network media recovery and image retry.
replace_once('src/reader/reader.js','''loading="lazy" style="object-fit:${fit};object-position:${px}% ${py}%"''','''loading="lazy" decoding="async" data-original-src="${escapeHtml(block.src || "")}" style="object-fit:${fit};object-position:${px}% ${py}%"''','async image decode')
replace_once('src/reader/reader.js','''style="object-fit:${fit};object-position:${px}% ${py}%"></div>${block.caption ?''','''style="object-fit:${fit};object-position:${px}% ${py}%"><button class="media-retry" type="button" data-media-retry hidden>重试图片</button></div>${block.caption ?''','image retry control')
replace_once('src/reader/reader.js','''  document.querySelectorAll("video").forEach((video) => {''',r'''  document.querySelectorAll(".image-frame img").forEach((img)=>{
    const frame=img.closest(".image-frame"),retry=frame?.querySelector("[data-media-retry]");if(!frame)return;
    const failed=()=>{frame.classList.add("media-load-error");if(retry)retry.hidden=false;};
    const loaded=()=>{frame.classList.remove("media-load-error");if(retry)retry.hidden=true;};
    img.addEventListener("error",failed);img.addEventListener("load",loaded);if(img.complete&&!img.naturalWidth)failed();
  });
  document.querySelectorAll("[data-media-retry]").forEach((button)=>button.addEventListener("click",()=>{
    const frame=button.closest(".image-frame"),img=frame?.querySelector("img"),src=img?.dataset.originalSrc||img?.getAttribute("src");if(!img||!src)return;if(navigator.onLine===false)return toast("当前仍处于离线状态");button.disabled=true;img.removeAttribute("src");requestAnimationFrame(()=>{img.setAttribute("src",src);button.disabled=false;});
  }));
  document.querySelectorAll("video").forEach((video) => {''','image recovery binding')
replace_once('src/reader/reader.js','''    video.dataset.v3PlayerBound = "1";''','''    video.dataset.v3PlayerBound = "1";\n    if(state.networkMode!=="normal")video.preload="none";''','weak network video preload')

# Persist senior preference and include Word tables in browser speech fallback.
replace_once('src/reader/reader.js','''  storageSet(storageKey("font"), String(state.fontScale));''','''  storageSet(storageKey("font"), String(state.fontScale));\n  storageSet(storageKey("senior"), state.seniorMode ? "1" : "0");''','persist senior mode')
replace_once('src/reader/reader.js','''    case "image": case "video":\n      return block.caption || "";''','''    case "table":\n      return [block.caption,...(block.rows||[]).flat()].filter(Boolean).join("，");\n    case "image": case "video":\n      return block.caption || "";''','table speech text')

# Do not autoplay media on constrained connections, but respect an explicit tap.
replace_once('src/reader/reader.js','''  if (state.musicEnabled) startMusic();''','''  if (state.musicEnabled && state.networkMode==="normal") startMusic();''','weak network music autostart')
replace_once('src/reader/reader.js','''async function startMusic() {\n  if (!state.musicEnabled || state.narrationMode !== "idle") return;''','''async function startMusic({manual=false}={}) {\n  if (!state.musicEnabled || state.narrationMode !== "idle") return;\n  if (!manual && state.networkMode!=="normal") return;''','manual weak network music')
replace_once('src/reader/reader.js','''    await startMusic();\n    toast("背景音乐已开启");''','''    await startMusic({manual:true});\n    toast("背景音乐已开启");''','explicit music tap')
replace_once('src/reader/reader.js','''    if (state.musicEnabled && $("bgm").paused && state.narrationMode === "idle") startMusic();''','''    if (state.networkMode==="normal" && state.musicEnabled && $("bgm").paused && state.narrationMode === "idle") startMusic();''','no gesture autostart on weak network')

# Retry issue.json on weak links and restore senior preference before the first render.
replace_once('src/reader/reader.js','''    const response = await fetch("./issue.json", { cache: "no-store" });\n    if (!response.ok) throw new Error(`期刊数据加载失败：HTTP ${response.status}`);\n    issue = await response.json();''','''    issue = await fetchIssueWithRetry();''','issue json retry')
replace_once('src/reader/reader.js','''  const savedRate = Number(storageGet(storageKey("rate")));''',r'''  const savedRate = Number(storageGet(storageKey("rate")));
  const savedSenior = storageGet(storageKey("senior"));let requestedSenior=null;
  try{const value=new URL(location.href).searchParams.get("senior");if(value==="1"||value==="0")requestedSenior=value==="1";}catch{}''','load senior preference')
replace_once('src/reader/reader.js','''  state.speechRate = Number.isFinite(savedRate) && savedRate > 0 ? savedRate : (issue.features?.narration?.rate || 1);\n  $("continuousRead").checked = state.continuous;''','''  state.speechRate = Number.isFinite(savedRate) && savedRate > 0 ? savedRate : (issue.features?.narration?.rate || 1);\n  setSeniorMode(requestedSenior==null?savedSenior==="1":requestedSenior,{silent:true,renderNow:false});\n  syncNetworkStatus();\n  $("continuousRead").checked = state.continuous;''','apply saved senior preference')

# Bind controls and network-change recovery.
replace_once('src/reader/reader.js','''  $("fontButton").addEventListener("click", () => $("fontDialog").showModal());''','''  $("fontButton").addEventListener("click", () => $("fontDialog").showModal());\n  $("seniorButton").addEventListener("click",()=>setSeniorMode(!state.seniorMode));\n  $("seniorDialogButton").addEventListener("click",()=>setSeniorMode(!state.seniorMode));\n  $("networkRetry").addEventListener("click",()=>{syncNetworkStatus();if(navigator.onLine===false)return toast("当前仍未联网");if(!state.issue)return location.reload();document.querySelectorAll(".media-load-error [data-media-retry]").forEach(button=>button.click());toast("正在重试未加载资源");});''','reader senior/network controls')
replace_once('src/reader/reader.js','''  mobileQuery.addEventListener("change", () => {\n    stopNarration();\n    if (!isMobile() && state.mobileImmersive) setMobileImmersive(false);\n    render();\n  });''',r'''  mobileQuery.addEventListener("change", () => {
    stopNarration();
    if (!isMobile() && state.mobileImmersive) setMobileImmersive(false);
    render();
  });
  const handleNetworkChange=()=>{const previous=state.networkMode;syncNetworkStatus({announce:true});if(previous!=="normal"&&state.networkMode==="normal")document.querySelectorAll(".media-load-error [data-media-retry]").forEach(button=>button.click());};
  addEventListener("online",handleNetworkChange);addEventListener("offline",handleNetworkChange);networkConnection()?.addEventListener?.("change",handleNetworkChange);''','network change recovery')
replace_once('src/reader/reader.js','''bind();\nloadIssue().catch((error) => {''','''syncNetworkStatus();\nbind();\nloadIssue().catch((error) => {''','initial network state')
replace_once('src/reader/reader.js','''  $("stage").innerHTML = `<div class="spread"><article class="page"><div class="page-scroll"><h2>无法加载期刊</h2><p>${escapeHtml(error.message)}</p></div></article></div>`;\n  console.error(error);''','''  $("stage").innerHTML = `<div class="spread"><article class="page"><div class="page-scroll load-failure"><h2>无法加载期刊</h2><p>${escapeHtml(error.message)}</p><button id="loadRetryButton" type="button">重新加载</button></div></article></div>`;\n  $("loadRetryButton")?.addEventListener("click",()=>{if(navigator.onLine===false)return toast("当前仍未联网");location.reload();});\n  console.error(error);''','load failure recovery')

# CSS: senior mode, larger hit targets, high-readability spacing and weak-network feedback.
p=Path('src/reader/reader.css');s=p.read_text();marker='/* ===== P1-06 · Senior mobile Reader + weak-network recovery ===== */'
if marker in s: raise SystemExit('P1-06 CSS already applied')
s=s.replace('grid-template-columns:repeat(4,minmax(0,1fr));width:100%;gap:5px','grid-template-columns:repeat(5,minmax(0,1fr));width:100%;gap:5px',1)
s += r'''

/* ===== P1-06 · Senior mobile Reader + weak-network recovery ===== */
.network-status{position:fixed;left:50%;bottom:92px;transform:translateX(-50%);z-index:220;width:min(620px,calc(100% - 24px));display:flex;align-items:center;justify-content:center;gap:10px;padding:9px 12px;border:1px solid rgba(255,255,255,.2);border-radius:14px;background:rgba(65,49,35,.94);color:#fff7e8;box-shadow:0 10px 28px rgba(0,0,0,.26);font-family:"Microsoft YaHei","PingFang SC",sans-serif;font-size:13px;line-height:1.45}.network-status[hidden]{display:none}.network-status[data-mode="offline"]{background:rgba(112,34,29,.96)}.network-status button{flex:0 0 auto;min-height:36px;border:1px solid rgba(255,255,255,.38);border-radius:9px;background:#fff7e8;color:#6f231f;padding:0 11px;font-weight:700}.senior-toggle{font-family:"Microsoft YaHei","PingFang SC",sans-serif;font-weight:700}.senior-toggle.active{background:rgba(238,197,108,.24)!important;border-color:rgba(255,224,154,.58)!important;color:#ffe9ae!important}.senior-label{font-size:12px;letter-spacing:.04em}.senior-mode-card{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:14px;padding:13px;border:1px solid #dfc8ad;border-radius:13px;background:#fffdf8}.senior-mode-card>div{display:grid;gap:4px}.senior-mode-card strong{font-size:16px;color:#6f2420}.senior-mode-card span{font-size:13px;line-height:1.6;color:#6f5a4b}.senior-mode-card button{min-height:44px;border:1px solid #b98964;border-radius:10px;background:#fff;color:#7e1c19;padding:0 14px;white-space:nowrap;font-weight:700}.senior-mode-card button.active{background:#8e1c1c;color:#fff7e8;border-color:#8e1c1c}.media-retry{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:4;min-height:40px;border:1px solid rgba(255,255,255,.65);border-radius:10px;background:rgba(55,42,34,.9);color:#fff7e8;padding:0 14px;font-weight:700}.media-retry[hidden]{display:none}.image-frame{position:relative}.image-frame.media-load-error{min-height:120px;background:linear-gradient(135deg,#eee3d4,#f8f2e9)}.image-frame.media-load-error img{opacity:.12}.image-frame.media-load-error::after{content:"图片暂未加载";position:absolute;left:50%;top:calc(50% + 34px);transform:translateX(-50%);color:#725e50;font-size:12px;white-space:nowrap}.load-failure{display:grid;align-content:center;justify-items:start;gap:10px}.load-failure p{text-indent:0!important}.load-failure button{min-height:46px;border:0;border-radius:11px;background:#8e1c1c;color:#fff7e8;padding:0 18px;font-weight:700}
body.senior-mode .page{line-height:1.86}body.senior-mode .page p,body.senior-mode .rich-text-block p{line-height:1.94;text-align:left}body.senior-mode .page p.small{font-size:1em;line-height:1.88}body.senior-mode .page p.xsmall{font-size:.96em;line-height:1.84}body.senior-mode .page p.lead{line-height:1.92}body.senior-mode .page h2{line-height:1.4;margin-bottom:15px}body.senior-mode .page h3{line-height:1.62}body.senior-mode .quote{line-height:1.86;padding:14px 16px}body.senior-mode .cardline p,body.senior-mode .case-box p{font-size:.96em;line-height:1.78;text-align:left}body.senior-mode .toc-jump{min-height:58px;padding:12px 14px}body.senior-mode .toc-jump strong{font-size:1.08em}body.senior-mode .toc-jump small{font-size:.93em;line-height:1.55}body.senior-mode .article-link{min-height:44px;font-size:.98em;align-items:center}body.senior-mode .media-caption{font-size:.92em;line-height:1.62;color:#5f5147}body.senior-mode .table-block table{font-size:1em;line-height:1.72}body.senior-mode .table-block th,body.senior-mode .table-block td{padding:11px 13px}body.senior-mode dialog{font-family:"Microsoft YaHei","PingFang SC",sans-serif}body.senior-mode .dialog-head button,body.senior-mode .font-list button,body.senior-mode .toc-list button,body.senior-mode .dialog-actions button{min-height:46px;font-size:15px}body.senior-mode .article-body p{font-size:16px;line-height:1.95;text-align:left}body.senior-mode .issue-link b{font-size:16px}body.senior-mode .issue-link small{font-size:13px;line-height:1.6}.studio-embed #seniorButton,.studio-embed #networkStatus{display:none!important}
@media(max-width:760px){
  .actions{grid-template-columns:repeat(5,minmax(0,1fr))}.actions button{min-height:44px;height:44px}.actions #seniorButton{font-size:11.5px}.network-status{bottom:84px;width:calc(100% - 18px);font-size:12.5px;padding:8px 10px}.network-status button{min-height:38px}.senior-mode-card{align-items:stretch;flex-direction:column}.senior-mode-card button{width:100%;min-height:48px;font-size:15px}
  body.senior-mode .app{padding-bottom:calc(84px + env(safe-area-inset-bottom))}body.senior-mode .toolbar{height:64px;bottom:max(10px,env(safe-area-inset-bottom));grid-template-columns:58px minmax(0,1fr) 58px}body.senior-mode .toolbar button{height:52px;min-width:48px;font-size:31px}body.senior-mode .progress-meta{font-size:12px}body.senior-mode .page-scroll{padding:6% 6.2% max(11%,44px)}body.senior-mode .page.has-overflow::after{content:"上滑继续阅读";bottom:10px;padding:5px 10px;font-size:11px}body.senior-mode .table-scroll{scrollbar-width:auto}body.senior-mode .table-block table{min-width:560px}body.senior-mode .video-full-button{width:48px;height:48px}
}
@media(max-width:360px){.actions .senior-label{font-size:10.5px}.network-status{align-items:stretch;flex-direction:column}.network-status button{width:100%}}
'''
p.write_text(s)
print('P1-06 senior mobile Reader patch applied')
