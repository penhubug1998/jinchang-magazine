import { normalizeRichText, renderRichText, richTextPlainText, createRichTextEditor, getRichTextRuntimeStatus, RICH_TEXT_ENGINE_INFO } from './rich-text.js';
import { buildPublishingPlan, flowFragmentFor, normalizePagePublishing, publishingBlockClass, publishingBlockStyle, pagePublishingStyle, LAYOUT_ENGINE_INFO } from './layout-engine.js';
const $ = (id) => document.getElementById(id);
const __V3_PRINT_MODE__ = (()=>{try{return new URL(location.href).searchParams.get("print")==="1"}catch{return false}})();
const printMode = __V3_PRINT_MODE__;
const mobileQuery = matchMedia("(max-width: 760px)");
const urlParams = new URLSearchParams(location.search);
const studioEmbed = window.__V3_STUDIO_EMBED__ === true || urlParams.get("studio") === "1" || urlParams.get("embed") === "1";
const acceptanceEmbed = urlParams.get("rc1Acceptance") === "1" && window.parent !== window;

// Beta2 compatibility helpers: modern Edge/Chrome + Safari/iOS fallback.
const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
async function requestElementFullscreen(el) {
  const fn = el?.requestFullscreen || el?.webkitRequestFullscreen;
  if (!fn) return false;
  let timer = 0;
  let settled = false;
  let resolveState;
  const waitForState = new Promise((resolve) => { resolveState = resolve; });
  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    document.removeEventListener("fullscreenchange", finish);
    document.removeEventListener("webkitfullscreenchange", finish);
    resolveState(Boolean(fullscreenElement()));
  };
  document.addEventListener("fullscreenchange", finish);
  document.addEventListener("webkitfullscreenchange", finish);
  timer = setTimeout(finish, 450);
  try {
    await fn.call(el);
    return Boolean(fullscreenElement()) || await waitForState;
  } catch {
    finish();
    return false;
  }
}
async function exitDocumentFullscreen() {
  const fn = document.exitFullscreen || document.webkitExitFullscreen;
  if (!fn) return false;
  try { await fn.call(document); return !fullscreenElement(); } catch { return false; }
}

const state = {
  issue: null,
  pageIndex: 0,
  fontScale: 1,
  turning: false,
  musicEnabled: false,
  musicPlaying: false,
  musicPausedForNarration: false,
  narrationMode: "idle",
  narrationPageIndex: -1,
  continuous: false,
  speechRate: 1,
  speechToken: 0,
  speechChunks: [],
  speechChunkIndex: 0,
  mobileImmersive: false,
  canvasMode: false,
  mobileStudioMode: false,
  canvasSelectedBlocks: new Set(),
  canvasSelectedBlockIds: new Set(),
  pointer: {
    active: false,
    dragging: false,
    sx: 0,
    sy: 0,
    x: 0,
    startedAt: 0,
    direction: 0,
    target: -1,
    raf: 0,
  },
  videoSession: null,
  videoOrigin: null,
  publishingPlan: null,
};

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
})[char]);
const storageKey = (suffix) => `jinchang-magazine:${state.issue?.id || "unknown"}:${suffix}`;
const padPage = (index) => String(index + 1).padStart(2, "0");
const isMobile = () => mobileQuery.matches;
function storageGet(key) {
  if (studioEmbed) return null;
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  if (studioEmbed) return;
  try { localStorage.setItem(key, value); } catch {}
}
function currentPageId(){ return state.issue?.pages?.[state.pageIndex]?.id || null; }
function findReaderPageIndexById(pageId){
  if (!pageId || !Array.isArray(state.issue?.pages)) return -1;
  return state.issue.pages.findIndex(page => page?.id === pageId);
}
function postStudio(type, detail = {}) {
  if (!studioEmbed || window.parent === window) return;
  try { window.parent.postMessage({ source:"v3-reader", type, issueId:state.issue?.id || null, pageIndex:state.pageIndex, pageId:currentPageId(), mobile:isMobile(), ...detail }, "*"); } catch {}
}
function postAcceptance(type, detail = {}) {
  if (!acceptanceEmbed) return;
  try { window.parent.postMessage({ source:"v3-reader", type, issueId:state.issue?.id || null, mobile:isMobile(), ...detail }, "*"); } catch {}
}

const clampPage = (index) => Math.max(0, Math.min(Number(index) || 0, Math.max(0, state.issue.pages.length - 1)));

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 1800);
}

function pageArt(type) {
  if (type !== "cover" && type !== "closing") return "";
  return `<div class="magazine-art" aria-hidden="true"><svg viewBox="0 0 420 155" focusable="false"><circle cx="328" cy="43" r="34" fill="#e7bd69"/><path d="M0 101Q78 67 152 104T300 88T420 72V155H0Z" fill="#3d1110" opacity=".65"/><path d="M0 128Q92 102 174 132T420 105V155H0Z" fill="#250b0a"/><g fill="none" stroke="#f6d89c" stroke-width="2"><path d="M72 53q9-8 18 0q9-8 18 0"/><path d="M132 35q7-6 14 0q7-6 14 0"/></g></svg></div>`;
}

function studioTextAttrs(field){return studioEmbed?` data-studio-edit-field="${field}" title="双击直接编辑文字"`:'';}

function renderBlockContent(block,ctx={}) {
  if (!block || typeof block !== "object") return "";
  switch (block.type) {
    case "textFlow": {
      const rich = flowFragmentFor(state.publishingPlan, block, ctx);
      const flowId = escapeHtml(block.flowId || block.flow?.id || "main");
      const diag = state.publishingPlan?.diagnostics?.find(x=>x.flowId===String(block.flowId||block.flow?.id||"main").replace(/[^a-zA-Z0-9_-]+/g,"-"));
      const overflow = diag?.type === "overflow" ? ` data-flow-overflow="true"` : "";
      return `<div class="publishing-flow-slot rich-text-block" data-flow-id="${flowId}"${overflow}>${renderRichText(rich)}</div>`;
    }
    case "pullQuote":
      return `<aside class="publishing-pull-quote">${block.label?`<span>${escapeHtml(block.label)}</span>`:""}<blockquote>${escapeHtml(block.text||"")}</blockquote>${block.attribution?`<cite>${escapeHtml(block.attribution)}</cite>`:""}</aside>`;
    case "sidebar":
      return `<aside class="publishing-sidebar">${block.title?`<h3>${escapeHtml(block.title)}</h3>`:""}<div>${escapeHtml(block.text||"").replace(/\n/g,"<br>")}</div></aside>`;
    case "sectionHeading":
      return `<div class="publishing-section-heading"><${[1,2,3,4].includes(Number(block.level))?`h${Number(block.level)}`:"h3"}${studioTextAttrs("text")}>${escapeHtml(block.text||block.title||"")}</${[1,2,3,4].includes(Number(block.level))?`h${Number(block.level)}`:"h3"}></div>`;
    case "paragraph": {
      const rich = normalizeRichText(block.richText, block.text || "");
      return `<div class="rich-text-block ${escapeHtml(block.style || "body")}" data-studio-richtext="true"${studioTextAttrs("text")}>${renderRichText(rich)}</div>`;
    }
    case "quote": {
      const rich = normalizeRichText(block.richText, block.text || "");
      return `<div class="quote">${block.title ? `<strong class="quote-title"${studioTextAttrs("title")}>${escapeHtml(block.title)}</strong>` : ""}<div class="rich-text-block quote-rich-text" data-studio-richtext="true"${studioTextAttrs("text")}>${renderRichText(rich)}</div></div>`;
    }
    case "chips":
      return `<div class="chips">${(block.items || []).map((item) => `<span class="chip ${escapeHtml(item.tone || "")}">${escapeHtml(item.text || "")}</span>`).join("")}</div>`;
    case "cardline":
      return `<div class="cardline ${block.tone === "green" ? "green" : ""}"><div class="badge">${escapeHtml(block.badge || "•")}</div><div><h3${studioTextAttrs("title")}>${escapeHtml(block.title || "")}</h3><p${studioTextAttrs("text")}>${escapeHtml(block.text || "")}</p></div></div>`;
    case "casePair":
      return `<div class="case-pair"><div class="case-box"><h4>案例</h4><p${studioTextAttrs("case")}>${escapeHtml(block.case || "")}</p></div><div class="case-box warn"><h4>警示</h4><p${studioTextAttrs("warning")}>${escapeHtml(block.warning || "")}</p></div></div>`;
    case "toc":
      return `<div class="toc-block">${(block.items || []).map((item) => `<button class="toc-jump" type="button" data-jump-page="${Number(item.page) - 1}"><b>${escapeHtml(item.number || "")}</b><span><strong>${escapeHtml(item.title || "")}</strong><small>${escapeHtml(item.subtitle || "")}</small></span></button>`).join("")}</div>`;
    case "articleLink":
      return `<button class="article-link" type="button" data-article-id="${escapeHtml(block.articleId || "")}">查看链接内容 <span>↗</span></button>`;
    case "video":
      return `<div class="media video-media"><div class="video-frame"><video src="${escapeHtml(block.src || "")}"${block.poster ? ` poster="${escapeHtml(block.poster)}"` : ""} controls playsinline webkit-playsinline preload="metadata" controlsList="nodownload"></video><button class="video-full-button" type="button" data-video-full title="全屏观看" aria-label="全屏观看视频">⛶</button></div>${block.caption ? `<div class="media-caption">${block.publishing?.captionLabel?`<b class="media-caption-label">${escapeHtml(block.publishing.captionLabel)}</b> `:""}${escapeHtml(block.caption)}</div>` : ""}</div>`;
    case "image": {
      const ratio = ["16:9","4:3","3:2","1:1"].includes(block.frameRatio) ? block.frameRatio : "auto";
      const fit = block.fit === "cover" ? "cover" : "contain";
      const px = Math.max(0, Math.min(100, Number(block.positionX ?? 50)));
      const py = Math.max(0, Math.min(100, Number(block.positionY ?? 50)));
      const ratioStyle = ratio === "auto" ? "" : `aspect-ratio:${ratio.replace(":", " / ")};`;
      return `<div class="media image-media"><div class="image-frame ${ratio === "auto" ? "auto" : "framed"}" style="${ratioStyle}"><img src="${escapeHtml(block.src || "")}" alt="${escapeHtml(block.alt || "")}" loading="lazy" style="object-fit:${fit};object-position:${px}% ${py}%"></div>${block.caption ? `<div class="media-caption">${block.publishing?.captionLabel?`<b class="media-caption-label">${escapeHtml(block.publishing.captionLabel)}</b> `:""}${escapeHtml(block.caption)}</div>` : ""}</div>`;
    }
    case "coverMeta":
      return `<div class="cover-meta"${studioTextAttrs("text")}>${escapeHtml(block.text || "")}</div>`;
    case "coverSections":
      return `<div class="cover-sections">${(block.items || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`;
    case "blessing":
      return `<div class="blessing"${studioTextAttrs("text")}>${escapeHtml(block.text || "")}</div>`;
    case "producer":
      return `<div class="producer"${studioTextAttrs("text")}>${escapeHtml(block.text || "")}</div>`;
    case "cards":
      return `<div class="content-cards">${(block.items || []).map((item) => `<div class="content-card"><h3>${escapeHtml(item.title || "")}</h3><p>${escapeHtml(item.text || "")}</p></div>`).join("")}</div>`;
    case "container": {
      const layout = ["single","two-equal","two-40-60","two-60-40","three-equal","media-left","media-right"].includes(block.layout) ? block.layout : "two-equal";
      const gap = ["sm","md","lg"].includes(block.gap) ? block.gap : "md";
      const align = ["start","center","stretch"].includes(block.align) ? block.align : "start";
      const mobile = block.mobile === "preserve" ? "preserve" : "stack";
      const columns = (block.columns || []).slice(0,3);
      return `<div class="layout-container layout-${layout} gap-${gap} align-${align} mobile-${mobile}">${columns.map((column,ci) => `<div class="layout-column" data-layout-column="${ci+1}">${(column.blocks || []).map((child,bi)=>renderBlock(child,{pageIndex:ctx.pageIndex,blockIndex:ctx.blockIndex,blockId:child?.id,columnIndex:ci,childIndex:bi})).join("")}</div>`).join("")}</div>`;
    }
    default:
      return "";
  }
}

function clampNumber(value,min,max,fallback){ const n=Number(value); return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback; }
function safeHex(value,fallback=''){ return /^#[0-9a-fA-F]{6}$/.test(String(value||'')) ? String(value) : fallback; }
function designStyle(design={}) {
  if(!design||typeof design!=='object') return '';
  const out=[];
  const fontSize=clampNumber(design.fontSize,10,48,null); if(fontSize!=null) out.push(`font-size:${fontSize}px`);
  const weights=new Set(['400','500','600','700','800']); if(weights.has(String(design.fontWeight))) out.push(`font-weight:${design.fontWeight}`);
  const color=safeHex(design.color); if(color) out.push(`color:${color}`);
  const background=safeHex(design.background); if(background) out.push(`background:${background}`);
  const padding=clampNumber(design.padding,0,48,null); if(padding!=null) out.push(`padding:${padding}px`);
  const margin=clampNumber(design.margin,0,48,null); if(margin!=null) out.push(`margin:${margin}px 0`);
  const radius=clampNumber(design.radius,0,40,null); if(radius!=null) out.push(`border-radius:${radius}px`);
  const borderWidth=clampNumber(design.borderWidth,0,6,null), borderColor=safeHex(design.borderColor); if(borderWidth!=null&&borderWidth>0) out.push(`border:${borderWidth}px solid ${borderColor||'currentColor'}`);
  const align=new Set(['left','center','right','justify']); if(align.has(design.textAlign)) out.push(`text-align:${design.textAlign}`);
  const width=clampNumber(design.width,25,100,null); if(width!=null) out.push(`width:${width}%`); const self=new Set(['left','center','right']); if(self.has(design.alignSelf)){if(design.alignSelf==='center')out.push('margin-left:auto','margin-right:auto');else if(design.alignSelf==='right')out.push('margin-left:auto','margin-right:0');else out.push('margin-left:0','margin-right:auto');}
  const shadows={sm:'0 4px 10px rgba(55,35,20,.12)',md:'0 9px 22px rgba(55,35,20,.16)',lg:'0 16px 34px rgba(55,35,20,.2)'}; if(shadows[design.shadow]) out.push(`box-shadow:${shadows[design.shadow]}`);
  return out.join(';');
}
function designTargetAttrs(ctx={}){if(!studioEmbed||!Number.isInteger(ctx.blockIndex))return '';const parts=[`data-design-page="${Number.isInteger(ctx.pageIndex)?ctx.pageIndex:state.pageIndex}"`,`data-design-block="${ctx.blockIndex}"`];if(ctx.blockId)parts.push(`data-block-id="${escapeHtml(ctx.blockId)}"`);if(Number.isInteger(ctx.columnIndex))parts.push(`data-design-column="${ctx.columnIndex}"`);if(Number.isInteger(ctx.childIndex))parts.push(`data-design-child="${ctx.childIndex}"`);return ` ${parts.join(' ')}`;}
function renderBlock(block,ctx={}){ const inner=renderBlockContent(block,ctx); if(!inner) return ''; const baseStyle=designStyle(block?.design),pubStyle=publishingBlockStyle(block),style=[baseStyle,pubStyle].filter(Boolean).join(';'),pubClass=publishingBlockClass(block),target=studioEmbed?' studio-design-target':'',typeAttr=studioEmbed?` data-studio-block-type="${escapeHtml(block?.type||'')}"`:''; if(style||studioEmbed||pubClass)return `<div class="styled-block${target}${pubClass?` ${pubClass}`:''}"${designTargetAttrs(ctx)}${typeAttr}${style?` style="${escapeHtml(style)}"`:''}>${inner}</div>`; return inner; }
function applyIssueDesign(issue){
  const t=issue?.design?.tokens||{}; const root=document.documentElement.style;
  root.setProperty('--paper','#fffaf0');root.setProperty('--reader-canvas','#1f1a17');root.setProperty('--ink','#3b2d26');root.setProperty('--red','#8d1f1c');root.setProperty('--design-muted','#8a7566');root.setProperty('--page-font-base','13.3px');root.setProperty('--design-radius','12px');root.setProperty('--design-spacing','10px');document.documentElement.dataset.v3Texture='paper';
  const paper=safeHex(t.paper); if(paper) root.setProperty('--paper',paper);
  const canvas=safeHex(t.canvas); if(canvas) root.setProperty('--reader-canvas',canvas);
  const texture=new Set(['paper','linen','grid','plain']).has(String(t.texture))?String(t.texture):'paper';document.documentElement.dataset.v3Texture=texture;
  const ink=safeHex(t.text); if(ink) root.setProperty('--ink',ink);
  const accent=safeHex(t.accent); if(accent) root.setProperty('--red',accent);
  const muted=safeHex(t.muted); if(muted) root.setProperty('--design-muted',muted);
  const base=clampNumber(t.fontBase,11,18,null); if(base!=null) root.setProperty('--page-font-base',`${base}px`);
  const radius=clampNumber(t.radius,0,24,null); if(radius!=null) root.setProperty('--design-radius',`${radius}px`);
  const spacing=clampNumber(t.spacing,4,24,null); if(spacing!=null) root.setProperty('--design-spacing',`${spacing}px`);
}
function pageDesignStyle(page){
  const d=page?.design||{}, out=[]; const bg=safeHex(d.background), color=safeHex(d.color), accent=safeHex(d.accent);
  if(bg) out.push(`background:${bg}`); if(color) out.push(`color:${color}`); if(accent) out.push(`--red:${accent}`);
  return out.join(';');
}
function pageScrollDesignStyle(page){ const d=page?.design||{},out=[]; const padding=clampNumber(d.padding,0,12,null),width=clampNumber(d.contentWidth,60,100,null); if(padding!=null)out.push(`padding:${padding}%`); if(width!=null&&width<100)out.push(`width:${width}%;margin-left:auto;margin-right:auto`); return out.join(';'); }

function renderPage(page, index = -1) {
  if (!page) return `<article class="page blank" data-page-index="-1"></article>`;
  const type = page.type || "article";
  const legacyBody = (page.body || []).map((text) => `<p class="body">${escapeHtml(text)}</p>`).join("");
  const body = legacyBody + (page.blocks || []).map((block,bi)=>renderBlock(block,{pageIndex:index,blockIndex:bi,blockId:block?.id})).join("");
  const publishing = normalizePagePublishing(page);
  const contentStyle = pagePublishingStyle(page);
  const current = index === state.pageIndex;
  const pageNo = index >= 0 ? `<span class="pageno">${padPage(index)}</span>` : "";
  const pStyle=pageDesignStyle(page), scrollStyle=pageScrollDesignStyle(page);
  return `<article class="page ${escapeHtml(type)}${current ? " is-current" : ""}" data-page-type="${escapeHtml(type)}" data-page-index="${index}" data-page-id="${escapeHtml(page.id || '')}"${current?' aria-current="page"':''}${pStyle?` style="${escapeHtml(pStyle)}"`:""}><div class="texture" aria-hidden="true"></div><div class="page-scroll"${scrollStyle?` style="${escapeHtml(scrollStyle)}"`:""}>
    ${page.kicker ? `<div class="eyebrow">${escapeHtml(page.kicker)}</div>` : ""}
    ${type === "cover" ? `<h1>${escapeHtml(page.title || state.issue.label)}</h1>` : `<h2>${escapeHtml(page.title || "未命名页面")}</h2>`}
    ${page.subtitle ? `<h3>${escapeHtml(page.subtitle)}</h3>` : ""}
    <div class="publishing-content columns-${publishing.columns}${publishing.balanceColumns?' is-balanced':''}"${contentStyle?` style="${escapeHtml(contentStyle)}"`:""}>${body}</div>
  </div>${pageArt(type)}${pageNo}</article>`;
}

function spreadNumberForPage(index) {
  const page = clampPage(index);
  return page === 0 ? 0 : Math.ceil(page / 2);
}

function maxSpreadNumber() {
  return Math.ceil((state.issue.pages.length - 1) / 2);
}

function primaryPageForSpread(spreadNumber) {
  if (spreadNumber <= 0) return 0;
  return Math.min(spreadNumber * 2, state.issue.pages.length - 1);
}

function spreadAt(index) {
  if (isMobile()) return [{ page: state.issue.pages[clampPage(index)], index: clampPage(index) }];
  const spread = spreadNumberForPage(index);
  if (spread === 0) return [{ page: null, index: -1 }, { page: state.issue.pages[0], index: 0 }];
  const leftIndex = spread * 2 - 1;
  const rightIndex = spread * 2;
  return [
    { page: state.issue.pages[leftIndex] || null, index: leftIndex < state.issue.pages.length ? leftIndex : -1 },
    { page: state.issue.pages[rightIndex] || null, index: rightIndex < state.issue.pages.length ? rightIndex : -1 },
  ];
}

function spreadHtml(index) {
  const entries = spreadAt(index);
  return `<div class="spread" data-current-page="${clampPage(index)}" data-spread="${spreadNumberForPage(index)}">${entries.map((entry) => renderPage(entry.page, entry.index)).join("")}</div>`;
}

function viewportSize() {
  const vv = window.visualViewport;
  return {
    width: Math.max(1, vv?.width || document.documentElement.clientWidth || innerWidth),
    height: Math.max(1, vv?.height || document.documentElement.clientHeight || innerHeight),
  };
}

function syncMobileGeometry() {
  if (!isMobile()) {
    document.documentElement.style.removeProperty("--mobile-vvh");
    document.documentElement.style.removeProperty("--mobile-page-w");
    document.documentElement.style.removeProperty("--mobile-page-h");
    return;
  }
  const vp = viewportSize();
  document.documentElement.style.setProperty("--mobile-vvh", `${vp.height.toFixed(1)}px`);
  const topH = document.querySelector(".topbar")?.getBoundingClientRect().height || 74;
  const toolbarH = document.querySelector(".toolbar")?.getBoundingClientRect().height || 60;
  const reserve = state.mobileImmersive ? topH + toolbarH + 15 : topH + toolbarH + 28;
  const availableHeight = Math.max(320, vp.height - reserve);
  const availableWidth = Math.max(260, vp.width - (state.mobileImmersive ? 6 : 12));
  const width = Math.max(250, Math.min(440, availableWidth, availableHeight / 1.42));
  document.documentElement.style.setProperty("--mobile-page-w", `${width.toFixed(1)}px`);
  document.documentElement.style.setProperty("--mobile-page-h", `${(width * 1.42).toFixed(1)}px`);
}

function updateResponsiveTypography() {
  syncMobileGeometry();
  const stage = $("stage");
  if (!stage) return;
  const rect = stage.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  if (isMobile()) {
    const widthFactor = Math.max(.92, Math.min(1.10, rect.width / 390));
    const base = Math.max(14.0, Math.min(15.4, 14.5 * widthFactor));
    document.documentElement.style.setProperty("--page-font-base", `${(base * state.fontScale).toFixed(2)}px`);
  } else {
    const pageWidth = rect.width / 2;
    const scale = Math.max(.78, Math.min(1.24, Math.min(pageWidth / 460, rect.height / 650)));
    document.documentElement.style.setProperty("--page-font-base", `${(13.3 * scale * state.fontScale).toFixed(2)}px`);
  }
}

function updateOverflowHints() {
  if (!isMobile()) return;
  requestAnimationFrame(() => {
    document.querySelectorAll("#stage .page").forEach((page) => {
      const scroller = page.querySelector(".page-scroll");
      if (!scroller) return;
      const overflow = scroller.scrollHeight > scroller.clientHeight + 3;
      page.classList.toggle("has-overflow", overflow);
      const updateEnd = () => page.classList.toggle("scrolled-end", !overflow || scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4);
      updateEnd();
      if (overflow && !scroller.dataset.overflowBound) {
        scroller.dataset.overflowBound = "1";
        scroller.addEventListener("scroll", updateEnd, { passive: true });
      }
    });
  });
}

function bindPageActions() {
  document.querySelectorAll("[data-jump-page]").forEach((button) => button.addEventListener("click", () => {
    stopNarration();
    state.pageIndex = clampPage(Number(button.dataset.jumpPage));
    render();
  }));
  document.querySelectorAll("[data-article-id]").forEach((button) => button.addEventListener("click", () => openArticle(button.dataset.articleId)));
  document.querySelectorAll("[data-video-full]").forEach((button) => button.addEventListener("click", () => openVideoFullscreen(button)));
  document.querySelectorAll("video").forEach((video) => {
    if (video.dataset.v3PlayerBound === "1") return;
    video.dataset.v3PlayerBound = "1";
    video.addEventListener("webkitendfullscreen", () => {
      if (state.videoSession?.video === video) finishVideoSession();
    });
    video.addEventListener("error", () => {
      if (state.videoSession?.video === video) toast("视频加载失败，请检查媒体文件或网络");
    });
  });
}

function updateUi() {
  const total = state.issue.pages.length;
  const current = state.issue.pages[state.pageIndex];
  $("pageLabel").textContent = current?.navTitle || current?.title || `第 ${state.pageIndex + 1} 页`;
  $("pageCount").textContent = `${state.pageIndex + 1} / ${total}`;
  $("progressBar").style.width = `${((state.pageIndex + 1) / total) * 100}%`;
  const spread = spreadNumberForPage(state.pageIndex);
  const atStart = isMobile() ? state.pageIndex === 0 : spread === 0;
  const atEnd = isMobile() ? state.pageIndex >= total - 1 : spread >= maxSpreadNumber();
  [$("prevButton"), $("prevBottom")].forEach((el) => { el.disabled = atStart || state.turning; });
  [$("nextButton"), $("nextBottom")].forEach((el) => { el.disabled = atEnd || state.turning; });
  document.querySelectorAll("[data-font]").forEach((button) => button.classList.toggle("current", Number(button.dataset.font) === state.fontScale));
  configureIssueLinks();
  buildToc();
  saveProgress();
  syncUrl();
  postStudio("page", { total, visiblePageIndexes: spreadAt(state.pageIndex).map((entry) => entry.index).filter((index) => index >= 0), spread: spreadNumberForPage(state.pageIndex) });
}

function ensureStudioMediaToolbar(){let bar=$('studioMediaToolbar');if(bar)return bar;bar=document.createElement('div');bar.id='studioMediaToolbar';bar.className='studio-media-toolbar';bar.hidden=true;document.body.appendChild(bar);bar.addEventListener('pointerdown',e=>e.preventDefault());bar.addEventListener('click',e=>{const b=e.target.closest('[data-media-action]');if(!b)return;const i=Number(bar.dataset.blockIndex);if(!Number.isInteger(i))return;postStudio('canvas-media',{blockIndex:i,blockId:bar.dataset.blockId||null,action:b.dataset.mediaAction});});return bar;}
function updateStudioMediaToolbar(){const bar=ensureStudioMediaToolbar();if(!studioEmbed||!state.canvasMode){bar.hidden=true;return;}const target=studioTopTargets().find(el=>el.classList.contains('studio-canvas-selected'));const type=target?.dataset.studioBlockType||'';const index=Number(target?.dataset.designBlock);if(!target||!['image','video'].includes(type)||!Number.isInteger(index)){bar.hidden=true;return;}bar.dataset.blockIndex=String(index);bar.dataset.blockId=target?.dataset.blockId||'';bar.dataset.blockType=type;bar.innerHTML=type==='image'?'<b>图片</b><button type="button" data-media-action="replace">替换</button><button type="button" data-media-action="adjust">裁切 / 焦点</button><button type="button" data-media-action="fit">完整 / 填满</button><button type="button" data-media-action="ratio">切换比例</button>':'<b>视频</b><button type="button" data-media-action="replace">替换视频</button><button type="button" data-media-action="poster">更换封面</button>';bar.hidden=false;}
function reportStudioVisualMetrics(){if(!studioEmbed||!state.issue)return;requestAnimationFrame(()=>{const pages=[...document.querySelectorAll('#stage .page[data-page-index]')].map(page=>{const pageIndex=Number(page.dataset.pageIndex),scroller=page.querySelector('.page-scroll');if(!Number.isInteger(pageIndex)||pageIndex<0||!scroller)return null;const sr=scroller.getBoundingClientRect(),children=[...scroller.children].filter(x=>!x.classList.contains('texture')),last=children.at(-1),lr=last?.getBoundingClientRect();const contentBottom=lr?Math.max(0,lr.bottom-sr.top+scroller.scrollTop):0;const fillRatio=Math.max(0,Math.min(1.5,contentBottom/Math.max(1,scroller.clientHeight)));return {pageIndex,pageId:page.dataset.pageId||state.issue?.pages?.[pageIndex]?.id||null,fillRatio:Number(fillRatio.toFixed(3)),overflow:scroller.scrollHeight>scroller.clientHeight+3,scrollHeight:scroller.scrollHeight,clientHeight:scroller.clientHeight,blockCount:page.querySelectorAll('.studio-design-target[data-design-block]').length};}).filter(Boolean);postStudio('visual-metrics',{pages,at:Date.now()});});}
function studioTopTargets(){return [...document.querySelectorAll('#stage .studio-design-target[data-design-block]')].filter(el=>el.dataset.designColumn==null&&el.dataset.designChild==null&&Number(el.dataset.designPage)===state.pageIndex);}
function clearStudioCanvasGuides(){document.querySelectorAll('.studio-canvas-guide').forEach(x=>x.remove());}
function studioCanvasGuide(kind,pos){let line=document.querySelector(`.studio-canvas-guide.${kind}`);if(!line){line=document.createElement('i');line.className=`studio-canvas-guide ${kind}`;document.body.appendChild(line);}if(kind==='vertical')line.style.left=`${pos}px`;else line.style.top=`${pos}px`;}
function syncStudioCanvasTargets(){document.body.classList.toggle('studio-canvas-mode',Boolean(studioEmbed&&state.canvasMode));for(const el of studioTopTargets()){const i=Number(el.dataset.designBlock),id=el.dataset.blockId||'';el.classList.toggle('studio-canvas-selected',state.canvasSelectedBlockIds.has(id)||state.canvasSelectedBlocks.has(i));}updateStudioMediaToolbar();}
let activeRichTextEditor=null;
let activeRichTextMeta=null;
let activeRichTextNode=null;
let richTextSyncTimer=0;
function studioTextToolbar(show=true){const bar=$("studioTextToolbar");if(!bar)return;bar.hidden=!show;bar.classList.toggle('rich-active',Boolean(show&&activeRichTextEditor));if(!show)hideRichBubble();}
function richEditorRuntime(){return activeRichTextEditor?.richTextRuntime||activeRichTextEditor?.mode||getRichTextRuntimeStatus().mode||'fallback';}
function updateRichEngineBadge(){const badge=$("richEngineBadge");if(!badge)return;const mode=richEditorRuntime();badge.dataset.runtime=mode;badge.textContent=mode==='tiptap'?'Tiptap Core · 本地 · JSON':'离线结构化 · JSON';}
function richSelectionInfo(editor){
  if(!editor)return {empty:true};
  try{const sel=editor.state?.selection;if(sel&&Number.isFinite(sel.from)&&Number.isFinite(sel.to))return {empty:sel.empty,from:sel.from,to:sel.to};}catch{}
  const selection=getSelection();if(!selection?.rangeCount)return {empty:true};const range=selection.getRangeAt(0),root=activeRichTextNode;if(root&&(!root.contains(range.commonAncestorContainer)&&range.commonAncestorContainer!==root))return {empty:true};return {empty:selection.isCollapsed,range};
}
function hideRichBubble(){const bubble=$("studioRichBubble");if(bubble)bubble.hidden=true;}
function positionRichBubble(editor){const bubble=$("studioRichBubble");if(!bubble||!editor){hideRichBubble();return;}const info=richSelectionInfo(editor);if(info.empty){hideRichBubble();return;}let rect=null;try{if(info.range)rect=info.range.getBoundingClientRect();else{const a=editor.view.coordsAtPos(info.from),b=editor.view.coordsAtPos(info.to);rect={left:Math.min(a.left,b.left),right:Math.max(a.right,b.right),top:Math.min(a.top,b.top),bottom:Math.max(a.bottom,b.bottom),width:Math.max(1,Math.max(a.right,b.right)-Math.min(a.left,b.left))};}}catch{}if(!rect||(!rect.width&&rect.left===rect.right)){hideRichBubble();return;}const x=Math.max(54,Math.min(innerWidth-54,(rect.left+rect.right)/2)),y=Math.max(54,rect.top-8);bubble.style.left=`${x}px`;bubble.style.top=`${y}px`;bubble.hidden=false;for(const b of bubble.querySelectorAll('[data-rich-bubble-command]')){const c=b.dataset.richBubbleCommand;b.classList.toggle('active',(c==='bold'&&editor.isActive('bold'))||(c==='italic'&&editor.isActive('italic'))||(c==='underline'&&editor.isActive('underline')));}}
function canRichHistory(editor,kind){try{const can=editor?.can?.();if(typeof can?.[kind]==='function')return Boolean(can[kind]());const chain=can?.chain?.().focus?.();if(typeof chain?.[kind]==='function')return Boolean(chain[kind]().run());}catch{}return true;}
function syncRichToolbarState(){const e=activeRichTextEditor,bar=$("studioTextToolbar");if(!e||!bar){hideRichBubble();return;}for(const b of bar.querySelectorAll('[data-rich-command]')){const c=b.dataset.richCommand;const active=(c==='bold'&&e.isActive('bold'))||(c==='italic'&&e.isActive('italic'))||(c==='underline'&&e.isActive('underline'))||(c==='quote'&&e.isActive('blockquote'))||(c==='bulletList'&&e.isActive('bulletList'))||(c==='orderedList'&&e.isActive('orderedList'));b.classList.toggle('active',active);if(c==='undo')b.disabled=!canRichHistory(e,'undo');if(c==='redo')b.disabled=!canRichHistory(e,'redo');}const block=bar.querySelector('[data-rich-block]');if(block){if(e.isActive('heading',{level:1}))block.value='h1';else if(e.isActive('heading',{level:2}))block.value='h2';else if(e.isActive('heading',{level:3}))block.value='h3';else block.value='p';}const align=bar.querySelector('[data-rich-align]');if(align){align.value=['center','right','justify'].find(a=>e.isActive({textAlign:a}))||'left';}const size=bar.querySelector('[data-rich-size]');if(size){const v=e.getAttributes('textStyle')?.fontSize;size.value=v||'';}updateRichEngineBadge();positionRichBubble(e);}
function postRichTextSnapshot(doc,final=false){if(!activeRichTextMeta)return;clearTimeout(richTextSyncTimer);const send=()=>postStudio('canvas-richtext-edit',{...activeRichTextMeta,richText:doc,plainText:richTextPlainText(doc),final});if(final)send();else richTextSyncTimer=setTimeout(send,180);}
function destroyRichTextEditor({hide=true}={}){clearTimeout(richTextSyncTimer);hideRichBubble();if(activeRichTextEditor){try{postRichTextSnapshot(activeRichTextEditor.getJSON(),true);}catch{}try{activeRichTextEditor.destroy();}catch{}}activeRichTextEditor=null;activeRichTextMeta=null;activeRichTextNode=null;if(hide)studioTextToolbar(false);}
function richEditorUiHasFocus(node){const active=document.activeElement;return Boolean(node?.contains(active)||$("studioTextToolbar")?.contains(active)||$("studioRichBubble")?.contains(active));}
async function beginStudioRichTextEdit(node,blockIndex,blockId=null){if(!studioEmbed||!(state.canvasMode||state.mobileStudioMode)||!node)return false;const block=state.issue?.pages?.[state.pageIndex]?.blocks?.[blockIndex];if(!block||!['paragraph','quote'].includes(block.type))return false;postStudio('canvas-select',{blockIndex,blockId,additive:false});destroyRichTextEditor({hide:false});node.classList.add('studio-inline-editing','studio-richtext-editing');activeRichTextMeta={blockIndex,blockId,field:'text',sessionId:`rt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`};activeRichTextNode=node;studioTextToolbar(true);try{activeRichTextEditor=await createRichTextEditor({element:node,content:normalizeRichText(block.richText,block.text||''),onUpdate:doc=>{postRichTextSnapshot(doc,false);syncRichToolbarState();},onSelectionUpdate:syncRichToolbarState,onBlur:doc=>{postRichTextSnapshot(doc,true);setTimeout(()=>{if(activeRichTextEditor&&!richEditorUiHasFocus(node)){node.classList.remove('studio-inline-editing','studio-richtext-editing');node.removeAttribute('data-rich-runtime');destroyRichTextEditor();}},100);}});node.dataset.richRuntime=richEditorRuntime();activeRichTextEditor.commands.focus('end');syncRichToolbarState();return true;}catch(error){console.warn('Rich text editor initialization failed',error);activeRichTextEditor=null;activeRichTextMeta=null;activeRichTextNode=null;node.classList.remove('studio-richtext-editing');node.removeAttribute('data-rich-runtime');studioTextToolbar(false);return false;}}
function beginStudioInlineEdit(node,blockIndex,blockId=null){if(!studioEmbed||!(state.canvasMode||state.mobileStudioMode)||!node)return;const field=node.dataset.studioEditField;if(!field)return;if(node.dataset.studioRichtext==='true'){beginStudioRichTextEdit(node,blockIndex,blockId).then(ok=>{if(!ok)beginStudioNativeTextEdit(node,blockIndex,blockId,{resetRichText:true});});return;}beginStudioNativeTextEdit(node,blockIndex,blockId);}
function beginStudioNativeTextEdit(node,blockIndex,blockId=null,{resetRichText=false}={}){const field=node.dataset.studioEditField;if(!field)return;postStudio('canvas-select',{blockIndex,blockId,additive:false});node.dataset.studioOriginal=node.textContent||'';node.setAttribute('contenteditable','true');node.setAttribute('spellcheck','true');node.classList.add('studio-inline-editing');studioTextToolbar(false);node.focus({preventScroll:true});const range=document.createRange();range.selectNodeContents(node);range.collapse(false);const sel=getSelection();sel.removeAllRanges();sel.addRange(range);const commit=()=>{node.removeEventListener('blur',commit);node.removeAttribute('contenteditable');node.classList.remove('studio-inline-editing');const value=(node.innerText??node.textContent??'').trimEnd();postStudio('canvas-text-edit',{blockIndex,blockId,field,value,resetRichText});};node.addEventListener('blur',commit,{once:true});node.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();node.textContent=node.dataset.studioOriginal||'';node.blur();}else if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();node.blur();}};}
function runRichCommand(ed,c){if(!ed)return false;const ch=ed.chain().focus();if(c==='undo')ch.undo().run();else if(c==='redo')ch.redo().run();else if(c==='bold')ch.toggleBold().run();else if(c==='italic')ch.toggleItalic().run();else if(c==='underline')ch.toggleUnderline().run();else if(c==='quote')ch.toggleBlockquote().run();else if(c==='bulletList')ch.toggleBulletList().run();else if(c==='orderedList')ch.toggleOrderedList().run();else if(c==='link'){const current=ed.getAttributes('link')?.href||'';const href=prompt('链接地址',current||'https://');if(href===null)return false;if(!href.trim())ch.unsetLink().run();else ch.extendMarkRange('link').setLink({href:href.trim()}).run();}else if(c==='highlight'){const color=prompt('高亮颜色（HEX）','#fff1a8');if(color)ch.toggleHighlight({color}).run();else return false;}else if(c==='clear')ch.unsetAllMarks().clearNodes().run();else return false;syncRichToolbarState();return true;}
function bindStudioTextToolbar(){const bar=$("studioTextToolbar"),bubble=$("studioRichBubble");if(!bar||bar.dataset.bound)return;bar.dataset.bound='1';bar.addEventListener('pointerdown',e=>{if(e.target.closest('button'))e.preventDefault();});bar.addEventListener('click',e=>{const b=e.target.closest('[data-rich-command]');if(!b||!activeRichTextEditor)return;runRichCommand(activeRichTextEditor,b.dataset.richCommand);});bar.addEventListener('change',e=>{const ed=activeRichTextEditor;if(!ed)return;const ch=ed.chain().focus();if(e.target.matches('[data-rich-block]')){const v=e.target.value;if(v==='p')ch.setParagraph().run();else ch.toggleHeading({level:Number(v.slice(1))}).run();}else if(e.target.matches('[data-rich-align]'))ch.setTextAlign(e.target.value).run();else if(e.target.matches('[data-rich-size]')){const v=e.target.value;v?ch.setFontSize(v).run():ch.unsetFontSize().run();}else if(e.target.matches('[data-rich-color]'))ch.setColor(e.target.value).run();syncRichToolbarState();});if(bubble&&!bubble.dataset.bound){bubble.dataset.bound='1';bubble.addEventListener('pointerdown',e=>e.preventDefault());bubble.addEventListener('click',e=>{const b=e.target.closest('[data-rich-bubble-command]');if(!b||!activeRichTextEditor)return;runRichCommand(activeRichTextEditor,b.dataset.richBubbleCommand);});}window.addEventListener('resize',()=>positionRichBubble(activeRichTextEditor),{passive:true});window.addEventListener('scroll',()=>positionRichBubble(activeRichTextEditor),{passive:true,capture:true});}
window.__V3_RICH_TEXT_ENGINE__={info:RICH_TEXT_ENGINE_INFO,get active(){return Boolean(activeRichTextEditor)},get runtime(){return getRichTextRuntimeStatus()},normalizeRichText,richTextPlainText};
window.__V3_LAYOUT_ENGINE__={info:LAYOUT_ENGINE_INFO,get plan(){return state.publishingPlan},rebuild(){state.publishingPlan=buildPublishingPlan(state.issue||{});return state.publishingPlan;}};
function bindStudioCanvasDirectEditing(){if(!studioEmbed||!state.canvasMode)return;for(const el of studioTopTargets()){
    const index=Number(el.dataset.designBlock),blockId=el.dataset.blockId||null;if(!Number.isInteger(index))continue;
    let grip=el.querySelector(':scope > .studio-canvas-grip');if(!grip){grip=document.createElement('span');grip.className='studio-canvas-grip';grip.textContent='⋮⋮';grip.title='拖动排序';el.prepend(grip);}
    let resize=el.querySelector(':scope > .studio-canvas-resize');if(!resize){resize=document.createElement('span');resize.className='studio-canvas-resize';resize.textContent='↔';resize.title='拖动调整宽度';el.append(resize);}
    grip.onpointerdown=ev=>{ev.preventDefault();ev.stopPropagation();postStudio('canvas-select',{blockIndex:index,blockId,additive:ev.metaKey||ev.ctrlKey});const sx=ev.clientX,sy=ev.clientY;const rect=el.getBoundingClientRect();el.classList.add('studio-canvas-dragging');grip.setPointerCapture?.(ev.pointerId);let dx=0,dy=0;const move=e=>{dx=e.clientX-sx;dy=e.clientY-sy;el.style.transform=`translate(${dx}px,${dy}px)`;const pr=el.closest('.page')?.getBoundingClientRect()||document.documentElement.getBoundingClientRect();const cx=rect.left+rect.width/2+dx;if(Math.abs(cx-(pr.left+pr.width/2))<16)studioCanvasGuide('vertical',pr.left+pr.width/2);else clearStudioCanvasGuides();studioCanvasGuide('horizontal',rect.top+rect.height/2+dy);};const up=e=>{grip.removeEventListener('pointermove',move);grip.removeEventListener('pointerup',up);grip.removeEventListener('pointercancel',up);el.classList.remove('studio-canvas-dragging');el.style.transform='';clearStudioCanvasGuides();const targets=studioTopTargets().filter(x=>x!==el),cy=rect.top+rect.height/2+dy;let to=index,best=Infinity;for(const t of targets){const r=t.getBoundingClientRect(),dist=Math.abs(cy-(r.top+r.height/2));if(dist<best){best=dist;to=Number(t.dataset.designBlock);}}if(Number.isInteger(to)&&to!==index)postStudio('canvas-reorder',{blockIndex:index,blockId,toIndex:to});if(Math.abs(dx)>28){const pr=el.closest('.page')?.getBoundingClientRect();if(pr){const center=rect.left+rect.width/2+dx;const rel=(center-pr.left)/Math.max(1,pr.width);postStudio('canvas-align',{blockIndex:index,blockId,align:rel<.42?'left':rel>.58?'right':'center'});}}};grip.addEventListener('pointermove',move);grip.addEventListener('pointerup',up);grip.addEventListener('pointercancel',up);};
    resize.onpointerdown=ev=>{ev.preventDefault();ev.stopPropagation();postStudio('canvas-select',{blockIndex:index,blockId,additive:ev.metaKey||ev.ctrlKey});const sx=ev.clientX,rect=el.getBoundingClientRect(),parent=el.parentElement?.getBoundingClientRect()||rect;resize.setPointerCapture?.(ev.pointerId);const move=e=>{let width=Math.max(25,Math.min(100,(rect.width+(e.clientX-sx))/Math.max(1,parent.width)*100));for(const snap of [25,33,50,66,80,100])if(Math.abs(width-snap)<3.5)width=snap;el.style.width=`${width}%`;el.dataset.canvasWidth=String(Math.round(width));};const up=e=>{resize.removeEventListener('pointermove',move);resize.removeEventListener('pointerup',up);resize.removeEventListener('pointercancel',up);const width=Number(el.dataset.canvasWidth)||Math.round(rect.width/Math.max(1,parent.width)*100);delete el.dataset.canvasWidth;postStudio('canvas-resize',{blockIndex:index,blockId,width});};resize.addEventListener('pointermove',move);resize.addEventListener('pointerup',up);resize.addEventListener('pointercancel',up);};
  }syncStudioCanvasTargets();}
function decorateStudioCanvasTargets(){if(!studioEmbed)return;syncStudioCanvasTargets();bindStudioCanvasDirectEditing();}

function pageScrollSnapshot(){const out={};document.querySelectorAll('#stage .page[data-page-index] .page-scroll').forEach(el=>{const page=el.closest('.page'),idx=page?.dataset.pageIndex;if(idx!=null&&idx!=='-1')out[idx]=el.scrollTop;});return out;}
function restorePageScroll(snapshot={}){document.querySelectorAll('#stage .page[data-page-index] .page-scroll').forEach(el=>{const idx=el.closest('.page')?.dataset.pageIndex;if(idx!=null&&Object.prototype.hasOwnProperty.call(snapshot,idx))el.scrollTop=Number(snapshot[idx])||0;});}
function render({ preserveScroll=false } = {}) {
  if (state.videoSession) void closeVideoFullscreen();
  const savedScroll=preserveScroll?pageScrollSnapshot():null;
  state.pageIndex = clampPage(state.pageIndex);
  $("stage").innerHTML = spreadHtml(state.pageIndex);
  bindPageActions();
  updateUi();
  requestAnimationFrame(() => {
    if(savedScroll)restorePageScroll(savedScroll);
    updateResponsiveTypography();
    updateOverflowHints();
    decorateStudioCanvasTargets();
    reportStudioVisualMetrics();
    postStudio("page", { total:state.issue?.pages?.length || 0 });
  });
}

function animateMove(direction) {
  if (state.turning) return;
  const currentSpread = spreadNumberForPage(state.pageIndex);
  const targetSpread = currentSpread + direction;
  if (isMobile()) {
    const target = clampPage(state.pageIndex + direction);
    if (target === state.pageIndex) return;
    stopNarration();
    if (turnAnimationMode() === "none" || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      state.pageIndex = target;
      render();
      return;
    }
    animateMobileButtonMove(direction, target);
    return;
  }
  if (targetSpread < 0 || targetSpread > maxSpreadNumber()) return;
  const target = primaryPageForSpread(targetSpread);
  stopNarration();
  const mode = turnAnimationMode();
  if (!state.issue.features?.flipAnimation || mode === "none" || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    state.pageIndex = target;
    render();
    return;
  }

  state.turning = true;
  const stage = $("stage");
  // A two-sided 3D sheet can expose the back face upside-down or mirrored
  // on some GPU/Safari compositors. Render the destination first and slide
  // the old spread away instead: it keeps the book direction but never shows
  // reversed text, and it avoids a second full render after the animation.
  stage.innerHTML = `${spreadHtml(target)}<div class="spread-turn-overlay mode-${mode} ${direction > 0 ? "forward" : "backward"}">${spreadHtml(state.pageIndex)}</div>`;
  const overlay = stage.querySelector(".spread-turn-overlay");
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    overlay?.remove();
    state.pageIndex = target;
    state.turning = false;
    const spread = stage.querySelector(":scope > .spread");
    if (spread) {
      spread.dataset.currentPage = String(target);
      spread.dataset.spread = String(spreadNumberForPage(target));
    }
    stage.querySelectorAll(".page.is-current").forEach((page) => {
      page.classList.remove("is-current");
      page.removeAttribute("aria-current");
    });
    stage.querySelectorAll(`.page[data-page-index="${target}"]`).forEach((page) => {
      page.classList.add("is-current");
      page.setAttribute("aria-current", "page");
    });
    bindPageActions();
    updateUi();
    requestAnimationFrame(() => {
      updateResponsiveTypography();
      updateOverflowHints();
      decorateStudioCanvasTargets();
      reportStudioVisualMetrics();
    });
  };
  overlay?.addEventListener("transitionend", (event) => {
    if (event.target === overlay && event.propertyName === "transform") settle();
  });
  requestAnimationFrame(() => requestAnimationFrame(() => overlay?.classList.add("go")));
  setTimeout(settle, mode === "three-d" ? 510 : mode === "fade" ? 300 : 460);
}

function move(direction) { animateMove(direction); }

function turnAnimationMode() {
  const mode = String(state.issue?.features?.turnAnimation || "smooth");
  return ["smooth", "slide", "fade", "three-d", "none"].includes(mode) ? mode : "smooth";
}

function animateMobileButtonMove(direction, target) {
  const mode = turnAnimationMode();
  const stage = $("stage");
  stopNarration();
  state.turning = true;
  stage.innerHTML = `<div class="spread">${renderPage(state.issue.pages[target], target)}</div><div class="swipe-layer mode-${mode} ${direction > 0 ? "forward" : "backward"}">${renderPage(state.issue.pages[state.pageIndex], state.pageIndex)}</div>`;
  const overlay = stage.querySelector(".swipe-layer");
  const duration = mode === "three-d" ? 420 : mode === "fade" ? 240 : 300;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!overlay) return;
    overlay.style.transition = `transform ${duration}ms cubic-bezier(.22,.61,.36,1), opacity ${Math.min(duration,260)}ms ease`;
    if (mode === "fade") { overlay.style.opacity = "0"; return; }
    if (mode === "three-d") { overlay.style.transform = `rotateY(${direction > 0 ? -86 : 86}deg)`; overlay.style.opacity = "0"; return; }
    overlay.style.transform = `translate3d(${direction > 0 ? -104 : 104}%,0,0)`;
    overlay.style.opacity = mode === "slide" ? ".08" : ".18";
  }));
  setTimeout(() => { state.pageIndex = target; state.turning = false; render(); }, duration + 30);
}

function buildToc() {
  $("tocList").innerHTML = state.issue.pages.map((page, index) => `<button type="button" data-page="${index}" class="${index === state.pageIndex ? "current" : ""}">${String(index + 1).padStart(2,"0")} · ${escapeHtml(page.navTitle || page.title || "未命名页面")}</button>`).join("");
  $("tocList").querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => {
    stopNarration();
    state.pageIndex = clampPage(Number(button.dataset.page));
    $("tocDialog").close();
    render();
  }));
}

function issuePathFor(issueId) {
  const currentId = String(state.issue?.id || "").replace(/\D/g, "") || "003";
  const path = location.pathname || "";
  const segments = path.split("/").filter(Boolean);
  const currentSegment = segments.at(-1) || currentId;
  const width = /^\d+$/.test(currentSegment) ? currentSegment.length : currentId.length;
  const displayId = String(issueId).replace(/\D/g, "").padStart(width, "0");
  return String(issueId) === String(state.issue?.id) ? "./" : `../${displayId}/`;
}

function configureIssueLinks() {
  const currentId = String(state.issue?.id || "");
  document.querySelectorAll("[data-issue-id]").forEach((link) => {
    const id = String(link.dataset.issueId || "");
    link.href = issuePathFor(id);
    link.classList.toggle("current", id === currentId);
    link.setAttribute("aria-current", id === currentId ? "page" : "false");
  });
}

function openIssueDialog() {
  configureIssueLinks();
  $("issueDialog")?.showModal();
}

function toggleReadShortcut() {
  if (state.narrationMode === "idle") {
    startNarration();
    return;
  }
  if (state.narrationMode === "audio") {
    const audio = $("narration");
    if (audio.paused) {
      audio.play().then(() => updateReadStatus(`正在朗读第 ${state.narrationPageIndex + 1} 页 · 自然语音`, true)).catch(() => {});
    } else {
      audio.pause();
      updateReadStatus("朗读已暂停，再次点击继续。", true);
    }
    return;
  }
  if (state.narrationMode === "speech" && "speechSynthesis" in window) {
    if (speechSynthesis.paused) {
      speechSynthesis.resume();
      updateReadStatus(`正在朗读第 ${state.narrationPageIndex + 1} 页 · 浏览器语音`, true);
    } else {
      speechSynthesis.pause();
      updateReadStatus("朗读已暂停，再次点击继续。", true);
    }
  }
}

function openArticle(id) {
  const article = state.issue.articles?.[id];
  if (!article) return toast("链接内容未配置");
  $("articleTitle").textContent = article.title || "链接内容";
  $("articleBody").innerHTML = `${article.subtitle ? `<div class="meta">${escapeHtml(article.subtitle)}</div>` : ""}${(article.paras || []).map((p) => `<p>${escapeHtml(p)}</p>`).join("")}${article.sourceNote ? `<div class="source-note">${escapeHtml(article.sourceNote)}</div>` : ""}${article.url ? `<a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">打开原文 ↗</a>` : ""}`;
  $("articleDialog").showModal();
}

function syncUrl() {
  if (studioEmbed) return;
  if (!["http:", "https:", "file:"].includes(location.protocol)) return;
  try {
    const url = new URL(location.href);
    url.searchParams.set("page", String(state.pageIndex + 1));
    history.replaceState(null, "", url);
  } catch {}
}

function saveProgress() {
  if (!state.issue) return;
  storageSet(storageKey("page"), String(state.pageIndex));
  storageSet(storageKey("font"), String(state.fontScale));
  storageSet(storageKey("continuous"), state.continuous ? "1" : "0");
  storageSet(storageKey("rate"), String(state.speechRate));
  storageSet(storageKey("music-enabled"), state.musicEnabled ? "1" : "0");
}

function narrationPath(index) {
  const pattern = state.issue.features?.narration?.pattern;
  return pattern ? pattern.replace("{page}", padPage(index)) : null;
}

function speechTextOfBlock(block = {}) {
  switch (block.type) {
    case "paragraph": case "heading": case "textFlow": case "sectionHeading":
    case "blessing": case "producer": case "coverMeta":
      return block.text || block.title || "";
    case "quote": case "sidebar": case "cardline": case "pullQuote":
      return [block.label, block.title, block.text, block.attribution].filter(Boolean).join("。 ");
    case "chips":
      return (block.items || []).map((item) => item?.text || item).filter(Boolean).join("，");
    case "casePair":
      return [block.case, block.warning, block.left?.text, block.right?.text].filter(Boolean).join("。 ");
    case "cards":
      return (block.items || []).flatMap((item) => [item?.title, item?.text, item?.body]).filter(Boolean).join("。 ");
    case "coverSections":
      return (block.items || []).filter(Boolean).join("，");
    case "image": case "video":
      return block.caption || "";
    case "articleLink": {
      const article = state.issue?.articles?.[block.articleId] || {};
      return [block.title, article.title, article.subtitle, ...(article.paras || [])].filter(Boolean).join("。 ");
    }
    case "container":
      return (block.columns || []).flatMap((column) => (column.blocks || []).map(speechTextOfBlock)).filter(Boolean).join("。 ");
    default:
      return "";
  }
}

function pageSpeechText(index) {
  const page = state.issue.pages[index];
  const pieces = [page?.kicker, page?.title, page?.subtitle];
  for (const text of page?.body || []) pieces.push(text);
  for (const block of page?.blocks || []) pieces.push(speechTextOfBlock(block));
  return pieces.filter(Boolean).join("。 ").replace(/\s+/g, " ").trim();
}

function splitSpeechText(text, maxLength = 130) {
  const sentences = text.match(/[^。！？；.!?]+[。！？；.!?]?/g) || [text];
  const chunks = [];
  let buffer = "";
  for (const raw of sentences) {
    const part = raw.trim();
    if (!part) continue;
    if (buffer && (buffer + part).length > maxLength) {
      chunks.push(buffer);
      buffer = part;
    } else buffer += part;
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}

function pickChineseVoice() {
  const voices = speechSynthesis.getVoices?.() || [];
  const chinese = voices.filter((voice) => /^zh([_-]|$)/i.test(voice.lang || ""));
  const preferred = /(Natural|Premium|Enhanced|Xiaoxiao|Ting|Meijia|Sinji|Microsoft)/i;
  return chinese.find((voice) => preferred.test(voice.name || "")) || chinese.find((voice) => /zh[-_]CN/i.test(voice.lang || "")) || chinese[0] || null;
}

function updateReadStatus(text, active = false) {
  $("readStatus").textContent = text;
  $("readButton").classList.toggle("active", active);
  $("readButton").setAttribute("aria-pressed", active ? "true" : "false");
}

function pauseMusicForNarration() {
  const music = $("bgm");
  if (state.musicEnabled && !music.paused) {
    state.musicPausedForNarration = true;
    music.pause();
    state.musicPlaying = false;
  }
}

async function resumeMusicAfterNarration() {
  if (!state.musicPausedForNarration || !state.musicEnabled) {
    state.musicPausedForNarration = false;
    return;
  }
  state.musicPausedForNarration = false;
  try {
    await $("bgm").play();
    state.musicPlaying = true;
  } catch {}
}

function clearNarrationMedia() {
  const audio = $("narration");
  audio.pause();
  audio.removeAttribute("src");
  try { audio.load(); } catch {}
  try { speechSynthesis.cancel(); } catch {}
  state.speechToken += 1;
  state.speechChunks = [];
  state.speechChunkIndex = 0;
}

function stopNarration({ keepStatus = false, resumeMusic = true } = {}) {
  clearNarrationMedia();
  state.narrationMode = "idle";
  state.narrationPageIndex = -1;
  if (!keepStatus) updateReadStatus("已停止朗读。", false);
  if (resumeMusic) resumeMusicAfterNarration();
}

function speakNextChunk(token) {
  if (token !== state.speechToken || state.narrationMode !== "speech") return;
  if (state.speechChunkIndex >= state.speechChunks.length) {
    narrationEnded();
    return;
  }
  const utterance = new SpeechSynthesisUtterance(state.speechChunks[state.speechChunkIndex]);
  utterance.lang = "zh-CN";
  utterance.rate = state.speechRate;
  utterance.pitch = .98;
  const voice = pickChineseVoice();
  if (voice) utterance.voice = voice;
  utterance.onend = () => {
    if (token !== state.speechToken) return;
    state.speechChunkIndex += 1;
    speakNextChunk(token);
  };
  utterance.onerror = (event) => {
    if (["canceled", "interrupted"].includes(event.error)) return;
    state.narrationMode = "idle";
    state.narrationPageIndex = -1;
    updateReadStatus("浏览器语音朗读失败。", false);
    resumeMusicAfterNarration();
  };
  speechSynthesis.speak(utterance);
}

function speakFallback(index) {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    state.narrationMode = "idle";
    state.narrationPageIndex = -1;
    updateReadStatus("当前浏览器不支持语音朗读。", false);
    resumeMusicAfterNarration();
    return;
  }
  const text = pageSpeechText(index);
  if (!text) {
    updateReadStatus("当前页没有可朗读文字。", false);
    resumeMusicAfterNarration();
    return;
  }
  state.narrationMode = "speech";
  state.narrationPageIndex = index;
  state.speechChunks = splitSpeechText(text);
  state.speechChunkIndex = 0;
  const token = ++state.speechToken;
  updateReadStatus(`正在使用浏览器语音朗读第 ${index + 1} 页…`, true);
  speechSynthesis.cancel();
  speakNextChunk(token);
}

function startNarration(index = state.pageIndex) {
  const target = clampPage(index);
  stopNarration({ keepStatus: true, resumeMusic: false });
  pauseMusicForNarration();
  state.narrationPageIndex = target;
  const file = narrationPath(target);
  if (!file) return speakFallback(target);
  const audio = $("narration");
  audio.src = file;
  audio.playbackRate = state.speechRate;
  state.narrationMode = "audio";
  updateReadStatus(`正在加载第 ${target + 1} 页自然语音…`, true);
  const promise = audio.play();
  if (promise?.then) promise.then(() => updateReadStatus(`正在朗读第 ${target + 1} 页 · 自然语音`, true)).catch(() => speakFallback(target));
}

function narrationEnded() {
  const justRead = state.narrationPageIndex;
  clearNarrationMedia();
  state.narrationMode = "idle";
  if (state.continuous && justRead >= 0 && justRead < state.issue.pages.length - 1) {
    const nextPhysicalPage = justRead + 1;
    state.pageIndex = nextPhysicalPage;
    render();
    setTimeout(() => startNarration(nextPhysicalPage), 180);
    return;
  }
  state.narrationPageIndex = -1;
  updateReadStatus("当前朗读已结束。", false);
  resumeMusicAfterNarration();
}

function updateMusicButton() {
  $("musicButton").classList.toggle("active", state.musicEnabled);
  $("musicButton").setAttribute("aria-pressed", state.musicEnabled ? "true" : "false");
  $("musicButton").title = state.musicEnabled ? "背景音乐：开，点击关闭" : "背景音乐：关，点击开启";
}

async function startMusic() {
  if (!state.musicEnabled || state.narrationMode !== "idle") return;
  try {
    await $("bgm").play();
    state.musicPlaying = true;
  } catch {
    state.musicPlaying = false;
  }
}

function configureMedia() {
  const music = state.issue.features?.music;
  $("musicButton").hidden = !music?.src;
  $("bgm").pause();
  if (music?.src) $("bgm").src = music.src;
  else { $("bgm").removeAttribute("src"); try { $("bgm").load(); } catch {} }
  const savedMusic = storageGet(storageKey("music-enabled"));
  state.musicEnabled = studioEmbed ? false : (savedMusic == null ? music?.defaultOn === true : savedMusic === "1");
  updateMusicButton();
  $("fullButton").hidden = state.issue.features?.fullscreen === false;
  if (state.musicEnabled) startMusic();
}

async function toggleMusic() {
  if (!$("bgm").src) return;
  state.musicEnabled = !state.musicEnabled;
  if (!state.musicEnabled) {
    $("bgm").pause();
    state.musicPlaying = false;
    toast("背景音乐已关闭");
  } else {
    await startMusic();
    toast("背景音乐已开启");
  }
  updateMusicButton();
  saveProgress();
}

function setMobileImmersive(on) {
  state.mobileImmersive = Boolean(on);
  document.body.classList.toggle("mobile-immersive", state.mobileImmersive);
  $("fullButton").classList.toggle("active", state.mobileImmersive || Boolean(fullscreenElement()));
  $("fullButton").setAttribute("aria-pressed", state.mobileImmersive || fullscreenElement() ? "true" : "false");
  postAcceptance("mobile-immersive", { active: state.mobileImmersive });
  scrollTo(0, 0);
  requestAnimationFrame(() => {
    syncMobileGeometry();
    updateResponsiveTypography();
    updateOverflowHints();
  });
}

async function toggleFullscreen() {
  if (!isMobile()) {
    if (!fullscreenElement()) {
      const ok = await requestElementFullscreen(document.documentElement);
      if (!ok) toast("当前浏览器不支持页面全屏或拒绝了请求");
    } else await exitDocumentFullscreen();
    return;
  }
  if (!fullscreenElement()) {
    const ok = await requestElementFullscreen(document.documentElement);
    if (!ok) setMobileImmersive(true);
  } else {
    await exitDocumentFullscreen();
    setMobileImmersive(false);
  }
}

function videoNativeFullscreenCapable(video) {
  if (typeof video?.webkitEnterFullscreen !== "function") return false;
  const ua = navigator.userAgent || "";
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios;
}

function captureVideoState(video) {
  return {
    currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
    paused: video.paused,
    muted: video.muted,
    volume: video.volume,
    playbackRate: video.playbackRate,
  };
}

function restoreVideoState(video, snapshot) {
  if (!video || !snapshot) return;
  try { video.currentTime = snapshot.currentTime; } catch {}
  try { video.muted = snapshot.muted; video.volume = snapshot.volume; video.playbackRate = snapshot.playbackRate; } catch {}
  if (!snapshot.paused) video.play().catch(() => {});
}

function setVideoOverlayOpen(open) {
  const overlay = $("videoFullscreenOverlay");
  if (!overlay) return;
  overlay.classList.toggle("open", open);
  overlay.setAttribute("aria-hidden", open ? "false" : "true");
  document.body.classList.toggle("video-fullscreen-active", open);
}

function finishVideoSession({ restore = true } = {}) {
  const session = state.videoSession;
  if (!session) return;
  const { video, placeholder, returnFocus } = session;
  if (session.mode === "fallback" && video && placeholder?.parentNode && video.parentNode === $("videoFullscreenSlot")) placeholder.replaceWith(video);
  else if (session.mode === "fallback" && video && state.videoOrigin?.isConnected) state.videoOrigin.insertBefore(video, state.videoOrigin.firstChild);
  if (restore) restoreVideoState(video, session.snapshot);
  video?.removeAttribute("data-v3-player-mode");
  state.videoSession = null;
  state.videoOrigin = null;
  setVideoOverlayOpen(false);
  postAcceptance("video-fullscreen", { active: false, mode: session.mode });
  try { returnFocus?.focus({ preventScroll: true }); } catch {}
}

async function openVideoFullscreen(button) {
  if (state.videoSession) await closeVideoFullscreen();
  const frame = button.closest(".video-frame");
  const video = frame?.querySelector("video");
  if (!frame || !video) return;
  const session = { video, frame, snapshot: captureVideoState(video), returnFocus: button, mode: "pending", placeholder: null };
  state.videoSession = session;
  state.videoOrigin = frame;
  video.setAttribute("data-v3-player-mode", "pending");

  // iPhone Safari owns native video fullscreen. Do not move the element first:
  // doing so breaks the native controller and loses the current playback point.
  if (videoNativeFullscreenCapable(video)) {
    try { video.webkitEnterFullscreen(); session.mode = "native"; video.setAttribute("data-v3-player-mode", "native"); postAcceptance("video-fullscreen", { active: true, mode: "native" }); return; } catch {}
  }

  // Prefer the browser's real fullscreen implementation on desktop Safari/Edge.
  if (await requestElementFullscreen(video)) {
    session.mode = "standard";
    video.setAttribute("data-v3-player-mode", "standard");
    postAcceptance("video-fullscreen", { active: true, mode: "standard" });
    return;
  }

  // Last-resort in-document player: preserve the exact DOM position and
  // playback state, so closing/turning pages cannot orphan the video node.
  session.mode = "fallback";
  session.placeholder = document.createComment("v3-video-origin");
  frame.insertBefore(session.placeholder, video);
  $("videoFullscreenSlot").appendChild(video);
  video.setAttribute("data-v3-player-mode", "fallback");
  setVideoOverlayOpen(true);
  postAcceptance("video-fullscreen", { active: true, mode: "fallback" });
}

async function closeVideoFullscreen() {
  const session = state.videoSession;
  if (!session) { setVideoOverlayOpen(false); return; }
  if (session.mode === "standard" && fullscreenElement() === session.video) {
    await exitDocumentFullscreen();
    if (state.videoSession === session) finishVideoSession();
    return;
  }
  if (session.mode === "native") {
    try { session.video.pause(); } catch {}
  }
  finishVideoSession();
}

function onVideoFullscreenChange() {
  const session = state.videoSession;
  if (!session || session.mode !== "standard") return;
  if (fullscreenElement() !== session.video) finishVideoSession();
}

function prepareMobileSwipe(direction, target) {
  const stage = $("stage");
  const currentPage = state.issue.pages[state.pageIndex];
  const targetPage = state.issue.pages[target];
  stage.innerHTML = `<div class="spread">${renderPage(targetPage, target)}</div><div class="swipe-layer mode-${turnAnimationMode()} ${direction > 0 ? "forward" : "backward"}">${renderPage(currentPage, state.pageIndex)}</div>`;
}

function resetPointer() {
  const pointer = state.pointer;
  pointer.active = false;
  pointer.dragging = false;
  pointer.direction = 0;
  pointer.target = -1;
  if (pointer.raf) cancelAnimationFrame(pointer.raf);
  pointer.raf = 0;
}

function handlePointerDown(event) {
  if (!isMobile() || state.turning || event.target.closest("button,a,video,select,input")) return;
  const pointer = state.pointer;
  pointer.active = true;
  pointer.sx = pointer.x = event.clientX;
  pointer.sy = event.clientY;
  pointer.startedAt = performance.now();
  try { $("stage").setPointerCapture(event.pointerId); } catch {}
}

function handlePointerMove(event) {
  const pointer = state.pointer;
  if (!isMobile() || !pointer.active || state.turning) return;
  pointer.x = event.clientX;
  const dx = pointer.x - pointer.sx;
  const dy = event.clientY - pointer.sy;
  if (!pointer.dragging) {
    if (Math.abs(dx) < 8) return;
    if (Math.abs(dy) > Math.abs(dx)) {
      resetPointer();
      return;
    }
    pointer.direction = dx < 0 ? 1 : -1;
    pointer.target = state.pageIndex + pointer.direction;
    if (pointer.target < 0 || pointer.target >= state.issue.pages.length) {
      resetPointer();
      return;
    }
    pointer.dragging = true;
    prepareMobileSwipe(pointer.direction, pointer.target);
  }
  event.preventDefault();
  const width = $("stage").getBoundingClientRect().width || 1;
  const progress = Math.min(1, Math.abs(dx) / width);
  if (pointer.raf) cancelAnimationFrame(pointer.raf);
  pointer.raf = requestAnimationFrame(() => {
    const overlay = $("stage").querySelector(".swipe-layer");
    if (!overlay) return;
    const mode = turnAnimationMode();
    const offset = (pointer.direction > 0 ? -1 : 1) * progress * 100;
    if (mode === "fade") overlay.style.transform = "translate3d(0,0,0)";
    else if (mode === "three-d") overlay.style.transform = `rotateY(${(pointer.direction > 0 ? -1 : 1) * progress * 86}deg)`;
    else overlay.style.transform = `translate3d(${offset}%,0,0)`;
    overlay.style.opacity = String(1 - progress * (mode === "fade" || mode === "three-d" ? 1 : .16));
  });
}

function finishSwipe(commit, progress = 0) {
  const pointer = state.pointer;
  const overlay = $("stage").querySelector(".swipe-layer");
  if (!overlay) {
    resetPointer();
    render();
    return;
  }
  const target = pointer.target;
  const duration = commit ? Math.max(130, Math.round((1 - progress) * 280)) : Math.max(110, Math.round(progress * 190));
  overlay.style.transition = `transform ${duration}ms cubic-bezier(.22,.61,.36,1), opacity ${duration}ms ease`;
  const mode = turnAnimationMode();
  if (mode === "fade") {
    overlay.style.transform = "translate3d(0,0,0)";
    overlay.style.opacity = commit ? "0" : "1";
  } else if (mode === "three-d") {
    const angle = pointer.direction > 0 ? -86 : 86;
    overlay.style.transform = commit ? `rotateY(${angle}deg)` : "rotateY(0deg)";
    overlay.style.opacity = commit ? "0" : "1";
  } else {
    const offset = pointer.direction > 0 ? -100 : 100;
    overlay.style.transform = commit ? `translate3d(${offset}%,0,0)` : "translate3d(0,0,0)";
    overlay.style.opacity = commit ? (mode === "slide" ? ".08" : ".18") : "1";
  }
  state.turning = true;
  setTimeout(() => {
    if (commit) {
      stopNarration();
      state.pageIndex = target;
    }
    state.turning = false;
    resetPointer();
    render();
  }, duration + 24);
}

function handlePointerUp(event) {
  const pointer = state.pointer;
  if (!isMobile() || !pointer.active) return;
  const dx = event.clientX - pointer.sx;
  const dy = event.clientY - pointer.sy;
  const dt = Math.max(1, performance.now() - pointer.startedAt);
  const velocity = Math.abs(dx) / dt;
  const width = $("stage").getBoundingClientRect().width || 1;
  if (pointer.dragging && pointer.target >= 0) {
    const progress = Math.min(1, Math.abs(dx) / width);
    finishSwipe(progress > .22 || velocity > .5, progress);
  } else {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && !event.target.closest("button,a,video,select,input")) {
      const rect = $("stage").getBoundingClientRect();
      const x = event.clientX - rect.left;
      if (x > rect.width * .68) move(1);
      else if (x < rect.width * .32) move(-1);
    }
    resetPointer();
  }
}

async function loadIssue() {
  let issue = window.__ISSUE_DATA__ || null;
  if (!issue) {
    const response = await fetch("./issue.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`期刊数据加载失败：HTTP ${response.status}`);
    issue = await response.json();
  }
  if (!Array.isArray(issue.pages) || issue.pages.length === 0) throw new Error("期刊没有可显示页面");
  state.issue = issue;
  state.publishingPlan = buildPublishingPlan(issue);
  applyIssueDesign(issue);
  if (studioEmbed) {
    document.body.classList.add("studio-embed");
    $("homeLink")?.addEventListener("click", (event) => event.preventDefault(), { once:true });
  }
  $("brandTitle").textContent = issue.publication || "离退休干部电子期刊";
  $("brandMeta").textContent = [issue.label, issue.subtitle].filter(Boolean).join(" · ");
  document.title = `${issue.publication || "离退休干部电子期刊"}｜${issue.label || issue.id}`;
  if (issue.legacyPath) $("homeLink").title = `V3 迁移预览；旧版仍位于 ${issue.legacyPath}`;
  const injectedPage = Number(window.__V3_INITIAL_PAGE__);
  let urlPage = NaN;
  try { urlPage = Number(new URL(location.href).searchParams.get("page")); } catch {}
  const savedPage = Number(storageGet(storageKey("page")));
  const savedFont = Number(storageGet(storageKey("font")));
  const savedRate = Number(storageGet(storageKey("rate")));
  state.pageIndex = Number.isFinite(injectedPage) && injectedPage > 0 ? clampPage(injectedPage - 1) : (Number.isFinite(urlPage) && urlPage > 0 ? clampPage(urlPage - 1) : (Number.isFinite(savedPage) ? clampPage(savedPage) : 0));
  state.fontScale = Number.isFinite(savedFont) && savedFont > 0 ? savedFont : 1;
  state.continuous = storageGet(storageKey("continuous")) === "1" || issue.features?.narration?.continuousDefault === true;
  state.speechRate = Number.isFinite(savedRate) && savedRate > 0 ? savedRate : (issue.features?.narration?.rate || 1);
  $("continuousRead").checked = state.continuous;
  $("speechRate").value = String(state.speechRate);
  configureMedia();
  if (printMode) {
    document.body.classList.add("print-mode");
    $("stage").innerHTML = `<div class="print-publication">${issue.pages.map((page,index)=>`<section class="print-sheet">${renderPage(page,index)}</section>`).join("")}</div>`;
  } else render();
  window.__V3_READY__ = true;
  window.__V3_STATE__ = state;
  postStudio("ready", { total:issue.pages.length });
}

function bind() {
  $("prevButton").addEventListener("click", () => move(-1));
  $("prevBottom").addEventListener("click", () => move(-1));
  $("nextButton").addEventListener("click", () => move(1));
  $("nextBottom").addEventListener("click", () => move(1));
  $("tocButton").addEventListener("click", () => $("tocDialog").showModal());
  $("bottomTocButton").addEventListener("click", () => $("tocDialog").showModal());
  $("homeButton").addEventListener("click", () => { stopNarration(); state.pageIndex = 0; render(); });
  $("issueSwitchButton").addEventListener("click", openIssueDialog);
  $("fontButton").addEventListener("click", () => $("fontDialog").showModal());
  $("readButton").addEventListener("click", (event) => event.shiftKey ? $("readDialog").showModal() : toggleReadShortcut());
  $("musicButton").addEventListener("click", toggleMusic);
  $("fullButton").addEventListener("click", toggleFullscreen);
  $("readStart").addEventListener("click", () => startNarration());
  $("readStop").addEventListener("click", () => stopNarration());
  $("continuousRead").addEventListener("change", (event) => { state.continuous = event.target.checked; saveProgress(); });
  $("speechRate").addEventListener("change", (event) => {
    state.speechRate = Number(event.target.value) || 1;
    saveProgress();
    if (state.narrationMode !== "idle" && state.narrationPageIndex >= 0) startNarration(state.narrationPageIndex);
  });
  $("narration").addEventListener("ended", narrationEnded);
  $("narration").addEventListener("error", () => { if (state.narrationMode === "audio" && state.narrationPageIndex >= 0) speakFallback(state.narrationPageIndex); });
  $("narration").addEventListener("playing", () => { if (state.narrationMode === "audio") updateReadStatus(`正在朗读第 ${state.narrationPageIndex + 1} 页 · 自然语音`, true); });
  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => $(button.dataset.close).close()));
  document.querySelectorAll("[data-font]").forEach((button) => button.addEventListener("click", () => {
    state.fontScale = Number(button.dataset.font) || 1;
    $("fontDialog").close();
    render();
  }));
  addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeVideoFullscreen();
      if (state.mobileImmersive && !fullscreenElement()) setMobileImmersive(false);
      return;
    }
    if (event.target.matches("input,select,button,a")) return;
    if (event.key === "ArrowLeft" || event.key === "PageUp") move(-1);
    if (event.key === "ArrowRight" || event.key === "PageDown") move(1);
  });
  mobileQuery.addEventListener("change", () => {
    stopNarration();
    if (!isMobile() && state.mobileImmersive) setMobileImmersive(false);
    render();
  });
  $("stage").addEventListener("pointerdown", handlePointerDown);
  $("stage").addEventListener("pointermove", handlePointerMove, { passive: false });
  $("stage").addEventListener("pointerup", handlePointerUp);
  $("stage").addEventListener("pointercancel", () => {
    if (state.pointer.dragging) finishSwipe(false, 0);
    else resetPointer();
  });
  $("videoFullscreenClose").addEventListener("click", closeVideoFullscreen);
  $("videoFullscreenOverlay").addEventListener("click", (event) => { if (event.target === $("videoFullscreenOverlay")) closeVideoFullscreen(); });
  const onFullscreenChange = () => {
    const active = Boolean(fullscreenElement());
    if (isMobile()) setMobileImmersive(active);
    else {
      $("fullButton").classList.toggle("active", active);
      $("fullButton").setAttribute("aria-pressed", active ? "true" : "false");
      requestAnimationFrame(updateResponsiveTypography);
    }
  };
  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onFullscreenChange);
  document.addEventListener("fullscreenchange", onVideoFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onVideoFullscreenChange);
  let resizeRaf = 0;
  const handleViewportChange = () => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      syncMobileGeometry();
      updateResponsiveTypography();
      updateOverflowHints();
      reportStudioVisualMetrics();
    });
  };
  addEventListener("resize", handleViewportChange, { passive: true });
  addEventListener("orientationchange", () => setTimeout(handleViewportChange, 160));
  window.visualViewport?.addEventListener("resize", handleViewportChange, { passive: true });
  ["pointerdown", "touchstart", "keydown"].forEach((type) => document.addEventListener(type, () => {
    if (state.musicEnabled && $("bgm").paused && state.narrationMode === "idle") startMusic();
  }, { once: true, capture: true }));
  addEventListener("pagehide", () => { $("bgm").pause(); stopNarration({ keepStatus: true, resumeMusic: false }); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopNarration({ keepStatus: true }); });
}

if (studioEmbed) {
  addEventListener("message", (event) => {
    const data = event.data || {};
    if (data.source !== "v3-studio") return;
    if (data.type === "issue" && data.issue && Array.isArray(data.issue.pages) && data.issue.pages.length) {
      const current = Number.isFinite(Number(data.pageIndex)) ? Number(data.pageIndex) : state.pageIndex;
      stopNarration({ keepStatus:true, resumeMusic:false });
      state.issue = data.issue;
      state.publishingPlan = buildPublishingPlan(state.issue);
      applyIssueDesign(state.issue);
      state.pageIndex = clampPage(current);
      $("brandTitle").textContent = state.issue.publication || "离退休干部电子期刊";
      $("brandMeta").textContent = [state.issue.label, state.issue.subtitle].filter(Boolean).join(" · ");
      configureMedia();
      render({ preserveScroll:true });
      postStudio("synced", { token:data.token || null, total:state.issue.pages.length });
      return;
    }
    if (data.type === "canvas-mode") {
      state.canvasMode = Boolean(data.enabled);
      state.canvasSelectedBlocks = new Set((data.selectedBlocks || []).map(Number).filter(Number.isInteger));
      state.canvasSelectedBlockIds = new Set((data.selectedBlockIds || []).map(String).filter(Boolean));
      if (Number.isFinite(Number(data.pageIndex)) && Number(data.pageIndex) !== state.pageIndex) state.pageIndex = clampPage(Number(data.pageIndex));
      syncStudioCanvasTargets(); bindStudioCanvasDirectEditing();
      return;
    }
    if (data.type === "mobile-studio-mode") {
      state.mobileStudioMode = Boolean(data.enabled);
      document.body.classList.toggle("studio-mobile-edit-mode", state.mobileStudioMode);
      if (state.mobileStudioMode && state.canvasMode) { state.canvasMode = false; syncStudioCanvasTargets(); }
      return;
    }
    if (data.type === "mobile-edit-block") {
      const blocks=state.issue?.pages?.[state.pageIndex]?.blocks||[];
      let index=Number(data.blockIndex);
      if(data.blockId){const byId=blocks.findIndex(block=>block?.id===data.blockId);if(byId>=0)index=byId;}
      if(!Number.isInteger(index)||index<0||index>=blocks.length)return;
      const target=studioTopTargets().find(el=>Number(el.dataset.designBlock)===index&&(data.blockId?el.dataset.blockId===data.blockId:true));
      const text=target?.querySelector?.('[data-studio-edit-field]')||target?.matches?.('[data-studio-edit-field]')&&target;
      if(!target||!text)return;
      target.scrollIntoView({behavior:'smooth',block:'center'});
      setTimeout(()=>beginStudioInlineEdit(text,index,data.blockId||target.dataset.blockId||null),140);
      return;
    }
    if (data.type === "page") {
      const byId = findReaderPageIndexById(data.pageId);
      const next = clampPage(byId >= 0 ? byId : Number(data.pageIndex));
      if (next !== state.pageIndex) { stopNarration(); state.pageIndex = next; render(); }
      else postStudio("page", { total:state.issue?.pages?.length || 0 });
      requestAnimationFrame(()=>postStudio("page-ack", { pageIndex:state.pageIndex, pageId:currentPageId(), requestId:data.requestId || null, total:state.issue?.pages?.length || 0 }));
    }
  });
}

if (studioEmbed) {
  bindStudioTextToolbar();
  document.addEventListener('dblclick',event=>{if(!(state.canvasMode||state.mobileStudioMode))return;const text=event.target.closest('[data-studio-edit-field]');const target=text?.closest('.studio-design-target[data-design-block]');if(!text||!target||target.dataset.designColumn!=null||target.dataset.designChild!=null)return;event.preventDefault();event.stopPropagation();beginStudioInlineEdit(text,Number(target.dataset.designBlock),target.dataset.blockId||null);},true);
  document.addEventListener("click", (event) => {
    if (event.target.closest("button,a,video,input,select,textarea,.studio-canvas-grip,.studio-canvas-resize")) return;
    const target=event.target.closest(".studio-design-target[data-design-block]");
    if(!target)return;
    event.preventDefault();event.stopPropagation();
    const detail={pageIndex:Number(target.dataset.designPage),blockIndex:Number(target.dataset.designBlock),blockId:target.dataset.blockId||null};
    if((state.canvasMode||state.mobileStudioMode) && target.dataset.designColumn==null && target.dataset.designChild==null){postStudio('canvas-select',{...detail,additive:state.canvasMode&&(event.metaKey||event.ctrlKey)});return;}
    if(target.dataset.designColumn!=null)detail.columnIndex=Number(target.dataset.designColumn);
    if(target.dataset.designChild!=null)detail.childIndex=Number(target.dataset.designChild);
    postStudio("design-target",detail);
  }, true);
}

bind();
loadIssue().catch((error) => {
  $("stage").innerHTML = `<div class="spread"><article class="page"><div class="page-scroll"><h2>无法加载期刊</h2><p>${escapeHtml(error.message)}</p></div></article></div>`;
  console.error(error);
});
