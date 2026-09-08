import { DESIGN_PRESETS, DESIGN_PRESET_GROUPS } from './design-presets.js';
let STUDIO_CORE = null;
let WORKSPACE_VIEWPORT = null, WORKSPACE_INSPECTOR = null, SMART_LAYOUT_RECOMMENDER = null;
let PUBLICATION_CENTER = null, MOBILE_STUDIO = null;
// The core studio must never wait for optional enhancements before loading an
// issue.  Every module below has a local fallback, so load them in the
// background instead of using top-level await: a slow/cached module used to
// leave the whole admin shell visible but with an empty issue list.
void Promise.allSettled([
  import('./core/index.js'),
  import('./workspace/viewport.js'),
  import('./workspace/inspector.js'),
  import('./layout-recommender.js'),
  import('./publication-center.js'),
  import('./mobile-studio.js')
]).then(([core, viewport, inspector, recommender, publication, mobile]) => {
  STUDIO_CORE = core.status === 'fulfilled' ? core.value : null;
  WORKSPACE_VIEWPORT = viewport.status === 'fulfilled' ? viewport.value : null;
  WORKSPACE_INSPECTOR = inspector.status === 'fulfilled' ? inspector.value : null;
  SMART_LAYOUT_RECOMMENDER = recommender.status === 'fulfilled' ? recommender.value : null;
  PUBLICATION_CENTER = publication.status === 'fulfilled' ? publication.value : null;
  MOBILE_STUDIO = mobile.status === 'fulfilled' ? mobile.value : null;
});
const fallbackHash = value => { let h=0x811c9dc5; for(const ch of String(value||'')){h^=ch.charCodeAt(0);h=Math.imul(h,0x01000193);} return (h>>>0).toString(36); };
const fallbackValidId = (value,kind=null) => typeof value==='string' && /^(?:page|block)_[a-z0-9][a-z0-9_-]{5,63}$/i.test(value) && (!kind || value.startsWith(`${kind}_`));
function fallbackEnsureIssueIdentity(issue){const stats={assignedPages:0,assignedBlocks:0,repairedDuplicatePages:0,repairedDuplicateBlocks:0,changed:false};if(!Array.isArray(issue?.pages))return stats;const pages=new Set(),blocks=new Set(),issueId=String(issue.id||'issue');const uid=(prefix,seed,seen)=>{let base=`${prefix}_${fallbackHash(seed).padStart(6,'0')}`,id=base,n=2;while(seen.has(id))id=`${base}_${n++}`;seen.add(id);return id};const walk=(rows,pageId,path)=>{(rows||[]).forEach((b,bi)=>{if(!b||typeof b!=='object')return;const old=typeof b.id==='string'?b.id:'';if(fallbackValidId(old,'block')&&!blocks.has(old))blocks.add(old);else{if(old)stats.repairedDuplicateBlocks++;b.id=uid('block',`${issueId}|${pageId}|${path}${bi}|${b.type||'block'}`,blocks);stats.assignedBlocks++;}if(b.type==='container')(b.columns||[]).forEach((c,ci)=>walk(c?.blocks,pageId,`${path}${bi}.c${ci}.`));});};issue.pages.forEach((page,pi)=>{if(!page||typeof page!=='object')return;const old=typeof page.id==='string'?page.id:'';if(fallbackValidId(old,'page')&&!pages.has(old))pages.add(old);else{if(old)stats.repairedDuplicatePages++;page.id=uid('page',`${issueId}|page|${pi}|${page.type||'article'}`,pages);stats.assignedPages++;}walk(page.blocks,page.id,`p${pi}.b`);});stats.changed=Boolean(stats.assignedPages||stats.assignedBlocks||stats.repairedDuplicatePages||stats.repairedDuplicateBlocks);return stats;}
const ensureIssueIdentity = STUDIO_CORE?.ensureIssueIdentity || fallbackEnsureIssueIdentity;
const findPageIndexById = STUDIO_CORE?.findPageIndexById || ((issue,id)=>fallbackValidId(id,'page')&&Array.isArray(issue?.pages)?issue.pages.findIndex(page=>String(page?.id||'')===String(id)):-1);
const findBlockIndexById = STUDIO_CORE?.findBlockIndexById || ((page,id)=>fallbackValidId(id,'block')&&Array.isArray(page?.blocks)?page.blocks.findIndex(block=>block?.id===id):-1);
const clearPageIdentity = STUDIO_CORE?.clearPageIdentity || (page=>{if(!page)return page;delete page.id;const walk=rows=>(rows||[]).forEach(b=>{if(!b||typeof b!=='object')return;delete b.id;if(b.type==='container')(b.columns||[]).forEach(c=>walk(c?.blocks));});walk(page.blocks);return page;});
const createStableId = STUDIO_CORE?.createStableId || (prefix=>`${String(prefix||'id').replace(/[^A-Za-z0-9._:-]/g,'')}_${Date.now().toString(36)}${Math.random().toString(36).slice(2,10)}`.slice(0,96));
const ensureBlockIdentity = STUDIO_CORE?.ensureBlockIdentity || (block=>{if(!block||typeof block!=='object')return block;if(!fallbackValidId(block.id,'block'))block.id=createStableId('block');if(block.type==='container')(block.columns||[]).forEach(c=>(c?.blocks||[]).forEach(ensureBlockIdentity));return block;});
const regenerateBlockIdentity = STUDIO_CORE?.regenerateBlockIdentity || (block=>{if(!block||typeof block!=='object')return block;block.id=createStableId('block');if(block.type==='container')(block.columns||[]).forEach(c=>(c?.blocks||[]).forEach(regenerateBlockIdentity));return block;});
const createCommandBus = STUDIO_CORE?.createCommandBus || (({getState,beforeDispatch,afterDispatch,onError}={})=>{const handlers=new Map(),listeners=new Set();let sequence=0;return {register(type,fn){handlers.set(type,fn);return()=>handlers.delete(type)},has:type=>handlers.has(type),list:()=>[...handlers.keys()],commands:()=>[...handlers.keys()],subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},dispatch(type,payload={},meta={}){const handler=handlers.get(type);if(!handler)throw new Error(`Unknown Studio command: ${type}`);const command={id:`cmd-${++sequence}`,type,payload,meta,at:Date.now()};try{beforeDispatch?.(command,getState?.());const result=handler(payload,getState?.(),command);command.result=result;afterDispatch?.(command,getState?.());for(const fn of listeners)fn(command);return result}catch(error){onError?.(error,command,getState?.());throw error}},get sequence(){return sequence}}});
const ZOOM_STEPS = WORKSPACE_VIEWPORT?.ZOOM_STEPS || [25,33,50,67,75,100,125,150,200];
const clampReaderZoom = WORKSPACE_VIEWPORT?.clampZoom || (value=>Math.max(25,Math.min(200,Math.round(Number(value)||100))));
const nearestReaderZoomStep = WORKSPACE_VIEWPORT?.nearestZoomStep || ((value,direction=0)=>{const z=clampReaderZoom(value);if(direction>0)return ZOOM_STEPS.find(x=>x>z)??ZOOM_STEPS.at(-1);if(direction<0)return [...ZOOM_STEPS].reverse().find(x=>x<z)??ZOOM_STEPS[0];return ZOOM_STEPS.reduce((a,b)=>Math.abs(b-z)<Math.abs(a-z)?b:a,ZOOM_STEPS[0]);});
const resolveViewportScale = WORKSPACE_VIEWPORT?.resolveViewportScale || (({mode='fit-page',zoomPercent=100,areaWidth=1,areaHeight=1,deviceWidth=1,deviceHeight=1,padding=24}={})=>{const width=Math.max(1,areaWidth-padding)/Math.max(1,deviceWidth),page=Math.min(width,Math.max(1,areaHeight-padding)/Math.max(1,deviceHeight));return mode==='manual'?clampReaderZoom(zoomPercent)/100:mode==='fit-width'?Math.max(.08,Math.min(2,width)):Math.max(.08,Math.min(2,page));});
const readerZoomLabelText = WORKSPACE_VIEWPORT?.zoomLabel || ((mode,z,scale)=>mode==='manual'?`${clampReaderZoom(z)}%`:mode==='fit-width'?`适合宽度 · ${Math.round(scale*100)}%`:`适合页面 · ${Math.round(scale*100)}%`);
const inspectorKind = WORKSPACE_INSPECTOR?.inspectorKind || (blocks=>!blocks?.length?'page':blocks.length>1?'multi':['image','video'].includes(blocks[0]?.type)?'media':blocks[0]?.type==='container'?'layout':'text');
const blockInspectorSummary = WORKSPACE_INSPECTOR?.blockInspectorSummary || (block=>({id:block?.id||'',type:block?.type||'block',width:Number(block?.design?.width||100),alignSelf:block?.design?.alignSelf||'left',textAlign:block?.design?.textAlign||'left',fontSize:Number(block?.design?.fontSize||0),fontWeight:String(block?.design?.fontWeight||'400'),margin:Number(block?.design?.margin||0),padding:Number(block?.design?.padding||0)}));
const MOBILE_STUDIO_BREAKPOINT = MOBILE_STUDIO?.MOBILE_STUDIO_BREAKPOINT || 820;
const mobileTextTargets = MOBILE_STUDIO?.mobileTextTargets || (page=>(page?.blocks||[]).map((block,index)=>({block,index})).filter(({block})=>['paragraph','quote','textFlow','sectionHeading'].includes(block?.type)||['text','title','case','warning'].some(k=>typeof block?.[k]==='string'&&block[k].trim())));
const mobileMediaTargets = MOBILE_STUDIO?.mobileMediaTargets || (page=>(page?.blocks||[]).map((block,index)=>({block,index})).filter(({block})=>['image','video'].includes(block?.type)));
const primaryEditableField = MOBILE_STUDIO?.primaryEditableField || (block=>['text','title','case','warning'].find(k=>typeof block?.[k]==='string')||null);
const mobilePageSnapshot = MOBILE_STUDIO?.mobilePageSnapshot || ((page,index,total)=>({pageNumber:index+1,total,title:page?.navTitle||page?.title||`页面 ${index+1}`,section:page?.section||'未归类',type:page?.type||'article',blocks:page?.blocks?.length||0,text:mobileTextTargets(page).length,media:mobileMediaTargets(page).length}));

const $ = (s) => document.querySelector(s);
const ROUTE_PATH = window.location.pathname || '/';
const WORKSPACE_MODE = window.__V3_FORCE_WORKSPACE__ === true || /\/workspace\/?$/i.test(ROUTE_PATH) || new URLSearchParams(window.location.search).get('workspace') === '1';
const APP_BASE = window.__V3_APP_BASE_OVERRIDE__ || (() => {
  let pathname = ROUTE_PATH;
  if (/\/workspace\/?$/i.test(pathname)) pathname = pathname.replace(/workspace\/?$/i, '');
  if (pathname.endsWith('/')) return pathname;
  const last = pathname.split('/').pop() || '';
  if (!last.includes('.')) return `${pathname}/`;
  const slash = pathname.lastIndexOf('/');
  return pathname.slice(0, slash + 1) || '/';
})();
const INITIAL_ROUTE = (()=>{const q=new URLSearchParams(window.location.search);return {issue:q.get('issue')||'',page:Math.max(1,Number(q.get('page')||1)||1),layout:q.get('layout')||'',device:q.get('device')||'',editor:q.get('editor')||'',canvas:q.get('canvas')==='1',handoff:q.get('handoff')==='1',mobile:q.get('mobile')==='1',selection:(q.get('selection')||'').split(',').map(Number).filter(Number.isInteger)};})();
const PEER_SESSION_ID = `studio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
const appUrl = (url='') => {
  const raw = String(url || '');
  if (/^(?:https?:|data:|blob:|about:)/i.test(raw)) return raw;
  const clean = raw.replace(/^\/+/, '');
  return `${APP_BASE}${clean}`;
};
const READER_EMBED_REVISION = 'reader-table-editor-20260908';
function readerRuntimeCacheKey(){return `${state.runtimeVersion||'live'}-${READER_EMBED_REVISION}`;}

const state = { runtimeVersion:'', issues: [], issue: null, originalIssue: null, sourceStatus:null, sourceFingerprint:'', sourceObservedFingerprint:'', sourceConflict:null, page: 0, dirty: false, audit: null, auditStale: false, auditFilter: 'all', editorMode: 'visual', dragIndex: null, pageSearch: '', pageTemplateMode: 'add', mediaTarget: null, mediaAssets: null, mediaFilter: 'all', mediaIntent:'asset', mediaSelected: null, imageAdjustBlock: null, previewMode: 'built', builtPreviewStale: true, readerPreviewReady:false, readerPreviewDevice:'desktop-1366', readerPreviewTimer:0, readerPreviewToken:0, readerSyncInFlight:false, readerSyncQueued:false, readerSyncQueuedReload:false, managerPreviewReady:false, managerPreviewIssueId:'', previewFrameReloadSeq:0, issueLoadToken:0, issueLoadingId:'', issueLoadPromise:null, designPreviewFrame:0, inlinePreviewFrame:0, workspaceAuditFrame:0, uiRefreshFrame:0, fieldStatsFrame:0, readerPreviewExpanded:false, articleId: null, metaExpanded: false, pageMetaExpanded: false, selectedPages: new Set(), undoStack: [], redoStack: [], historyCurrent: null, historyLastAt: 0, historyGroup: '', draftTimer: 0, draftSaving: false, draftSavedAt: null, importTab:'paste', importResults:[], importSkeletonMode:'append', userTemplates:[], sidebarCollapsed:false, pagesPanelCollapsed:false, blockCanvasCollapsed:false, quickFormatCollapsed:false, workspaceSplit:25, workspaceLayout:'preview', fastTrackRunning:false, designClipboard:null,designUndoStack:[],designRedoStack:[],designHistoryKey:'',designHistoryAt:0,designPresetPreviewId:'',designAssets:[],designAssetsLoaded:false,designDivergences:[],layoutAssets:[],layoutAssetsLoaded:false,layoutSuggestions:[],editorialPlan:null,editorialPlanLoadedFor:'',editorialPlanDirty:false,editorialPlanSavedAt:null,editorialBoardFilter:'all',reviewWorkspace:null,reviewWorkspaceLoadedFor:'',reviewWorkspaceDirty:false,reviewWorkspaceFilter:'all',reviewHandoffs:null,reviewHandoffsLoadedFor:'',reviewHandoffsDirty:false,reviewHandoffDiffTargetId:'',reviewHandoffDiffBase:null,reviewHandoffDiffLoading:false, selectedBlocks:new Set(), lastSelectedBlock:null, canvasMode:false, workspaceMode:WORKSPACE_MODE, routeApplied:false, visualMetrics:null, peerChannel:null, peerIssueId:'', peers:new Map(), remoteSavedIssue:null, remoteSavedAt:0, readerPageRequestSeq:0, readerPendingPageRequest:null, readerPageVerifyTimer:0, readerFullscreenFallback:false, selectedBlockIds:new Set(), readerZoomMode:'fit-page', readerZoomPercent:100, readerActualScale:1, contextInspectorOpen:true, publicationStatus:null, publicationBusy:'', publicationLastError:null, publicationQrUrl:'', mobileStudioActive:false, mobileSheetTab:'', mobileSheetOpen:false, publicationSnapshots:[], publicationWorkflow:null, studioEntry:'content' };
const cloneData = value => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
state.readerTargetPage = 0;
state.aiConfig = null;
state.aiConfigLoaded = false;
state.readerToolbarCollapsed = false;
state.readerViewportResizeObserver = null;
state.readerFitFrame = 0;
state.managerPageRequestSeq = 0;
state.managerPendingPageRequest = null;
state.managerPageVerifyTimer = 0;
state.publicationStatusPromise = null;
const inlineInputHistory = new WeakMap();
const inlineInputSeen = new WeakSet();
const commandBus = createCommandBus({ getState:()=>state, onError:(error,ctx)=>console.error('[StudioCommand]',ctx.type,error) });
const LIMITS = { blocksPerPage: 80, totalBlockNodesPerPage: 160, arrayItems: 40, jsonChars: 600000, pages: 200 };
const BLOCK_LIBRARY = [
  ['paragraph','正文段落','普通正文、导语或小字号文字'],['quote','引言 / 提示','突出显示的重要引语或提醒'],['cardline','编号卡片','案例步骤、注意事项、要点说明'],
  ['casePair','案例 + 警示','左右/上下成对展示案例与警示'],['chips','标签组','简短关键词、提示标签'],['toc','目录','可跳转到具体页的目录条目'],
  ['image','图片','图片、替代文字与图注'],['video','视频','视频资源与说明文字'],['table','表格','Word 表格或手工二维表格，可横向滚动'],['articleLink','文章链接','引用 issue.articles 中的外部文章'],
  ['coverMeta','封面副信息','封面期号等辅助文字'],['coverSections','封面栏目','封面栏目标签组'],['blessing','祝福语','尾页重点祝福文字'],
  ['producer','制作单位','尾页制作单位'],['cards','通用卡片组','多组标题与正文'],['container','布局容器','双栏、三栏、图文混排；手机端可自动堆叠'],
  ['textFlow','跨页文本流','正文从当前页自动流向后续同 flowId 页面'],['pullQuote','Pull Quote','出版级跨栏重点引语'],['sidebar','Sidebar','出版级侧栏/补充说明'],['sectionHeading','跨栏标题','多栏页面中跨越全部栏的分节标题']
];
const BLOCK_NAMES = Object.fromEntries(BLOCK_LIBRARY.map(([id,name]) => [id,name]));
const PAGE_TEMPLATES = [
  ['article','通用文章','正文 + 引言，适合卷首语和一般栏目'],['news','时政资讯','导语 + 紧凑正文，适合资讯类页面'],['theory','理论学习','导语 + 正文，强调学习层级'],
  ['safety','反诈 / 安全','提示 + 三组要点卡片'],['discipline','警示教育','引言 + 案例/警示成对结构'],['health','养生知识','正文 + 绿色注意事项'],
  ['image','图文页面','正文 + 图片资源'],['video','视频页面','正文 + 视频资源'],['layout-two','双栏专题','5:5 双栏容器，适合并列观点'],['layout-media','图文专题','左图右文容器，手机自动堆叠'],['layout-three','三栏速览','三栏要点容器，适合短内容'],['closing','尾刊寄语','正文 + 祝福语 + 制作单位']
];
const PAGE_TEMPLATE_NAMES = Object.fromEntries(PAGE_TEMPLATES.map(([id,name])=>[id,name]));
const CURATED_STOCK_ASSETS = [
  ['cover-red-dawn','丹霞封面','红金渐层与日出，适合主刊封面'],
  ['cover-gold-cloud','鎏金云纹','庄重的金色云纹，适合封面或章节扉页'],
  ['cover-green-hills','青山长卷','清新山水留白，适合养生与生活栏目'],
  ['cover-blue-notes','蓝笺简报','克制蓝色网格，适合资讯与数据栏目'],
  ['divider-gold-cloud','金云分隔','横向云纹分隔，可用于章节过渡'],
  ['divider-green-leaf','青叶分隔','横向叶片分隔，可用于生活与健康内容'],
  ['quote-ribbon-red','朱印引语','红色引语横幅，适合重点摘录'],
  ['quote-ribbon-green','青墨提示','绿色提示横幅，适合注意事项与方法卡'],
  ['paper-linen','素笺肌理','浅色纸张肌理，可作为全宽背景图']
].map(([stockId,name,description])=>({stockId,path:`stock:${stockId}`,name,description,kind:'image',source:'内置素材',size:'SVG',width:1200,height:stockId.startsWith('divider')?180:800,stock:true}));
const LAYOUT_PRESETS = [
  {id:'single-focus',name:'单栏聚焦',desc:'保持阅读节奏，适合 1–3 个重点内容块。'},
  {id:'lead-two',name:'首屏重点 + 双栏',desc:'首个内容块全宽突出，其余内容自动进入双栏。'},
  {id:'two-balanced',name:'均衡双栏',desc:'按内容顺序均分为两栏，适合长文与并列观点。'},
  {id:'media-left',name:'左图右文',desc:'优先把首个图片/视频放左侧，其余内容排在右侧。'},
  {id:'media-right',name:'左文右图',desc:'优先把首个图片/视频放右侧，其余内容排在左侧。'},
  {id:'three-brief',name:'三栏速览',desc:'将短内容均衡分配到三栏，适合要点、卡片和简讯。'}
];
const LAYOUT_PRESET_MAP = Object.fromEntries(LAYOUT_PRESETS.map(x=>[x.id,x]));

const api = async (url, options = {}) => {
  const r = await fetch(appUrl(url), { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const text = await r.text(); let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  // A service restart clears the in-memory admin session.  An already-open
  // studio tab must not remain on a dead shell while every data request is
  // rejected with AUTH_REQUIRED; send it back through the login route once.
  if (r.status === 401 && data?.code === 'AUTH_REQUIRED' && !window.__V3_AUTH_REDIRECTING__) {
    window.__V3_AUTH_REDIRECTING__ = true;
    location.replace(appUrl('/'));
  }
  if (!r.ok && options.allowError !== true) { const error=new Error(data.error || `${r.status} ${r.statusText}`); error.code=data.code||''; error.status=r.status; error.payload=data; throw error; }
  return data;
};
async function logoutAdmin(){const button=$('#adminLogoutBtn');if(button){button.disabled=true;button.textContent='退出中…';}try{await api('/api/auth/logout',{method:'POST'});location.replace(appUrl('/'));}catch(error){if(button){button.disabled=false;button.textContent='退出';}toast(`退出失败：${error.message||'请稍后重试'}`,3000);}}
const stripAssetPrefix = (src='') => String(src||'').split(/[?#]/)[0].replace(/^\.\//,'').replace(/^assets\//,'');
function issueAssetUrl(src='') { if (!state.issue?.id || !src || /^(https?:|data:|blob:)/i.test(src)) return src; return appUrl(`/issue-assets/${encodeURIComponent(state.issue.id)}/${stripAssetPrefix(src).split('/').map(encodeURIComponent).join('/')}`); }
async function uploadAsset(file,kind) {
  const r=await fetch(appUrl(`/api/issues/${encodeURIComponent(state.issue.id)}/assets/upload?kind=${encodeURIComponent(kind)}`),{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(file.name)},body:file});
  const text=await r.text(); let data={}; try{data=text?JSON.parse(text):{}}catch{data={error:text}} if(!r.ok)throw new Error(data.error||`${r.status} ${r.statusText}`); return data;
}
function toast(t, ms = 1800) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), ms); }
function requireIssue(message='请先从左侧选择一期期刊'){if(state.issue)return true;toast(message,2600);return false;}
function bindClickFeedback(){
  document.addEventListener('click',e=>{
    const button=e.target.closest?.('button');
    if(!button||button.disabled||button.dataset.feedback==='off')return;
    button.classList.remove('is-clicking');
    void button.offsetWidth;
    button.classList.add('is-clicking');
    clearTimeout(button.__clickFeedbackTimer);
    button.__clickFeedbackTimer=setTimeout(()=>button.classList.remove('is-clicking'),260);
  },true);
}
function escText(x) { return String(x ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function fmtTime(x) { try { return new Date(x).toLocaleString(); } catch { return String(x || ''); } }
function clone(x) { return JSON.parse(JSON.stringify(x)); }
function currentPage() { return state.issue?.pages?.[state.page] || null; }
function findBlockLocation(blocks=[], data={}, path={}) {
  const blockId=String(data.blockId||'');
  const requestedRoot=Number(data.blockIndex), requestedColumn=Number(data.columnIndex), requestedChild=Number(data.childIndex);
  for(let i=0;i<blocks.length;i++){
    const block=blocks[i], location={block,blockIndex:path.blockIndex??i,columnIndex:path.columnIndex,childIndex:path.childIndex??(path.columnIndex!=null?i:undefined)};
    const id=String(block?.id||'');
    if((blockId&&id===blockId)||(!blockId&&Number.isInteger(requestedRoot)&&(location.blockIndex===requestedRoot)&&((Number.isInteger(requestedColumn)&&location.columnIndex===requestedColumn&&Number.isInteger(requestedChild)&&location.childIndex===requestedChild)||(!Number.isInteger(requestedColumn)&&location.columnIndex==null))))return location;
    if(block?.type==='container'){
      for(let ci=0;ci<(block.columns||[]).length;ci++){
        const nested=findBlockLocation(block.columns[ci]?.blocks||[],data,{blockIndex:path.blockIndex??i,columnIndex:ci,childIndex:undefined});
        if(nested)return nested;
      }
    }
  }
  return null;
}
function resolveBlockLocation(data={}) { return findBlockLocation(currentPage()?.blocks||[],data); }
function findBlockByIdDeep(blocks=[],blockId=''){const location=findBlockLocation(blocks,{blockId});return location?.block||null;}
function resolveTopBlockIndex(data={}) { return resolveBlockLocation(data)?.blockIndex??-1; }
function countText(id, countId, max) { const input = $('#'+id), note = $('#'+countId); const value = input.value || '', over = value.length > max; note.textContent = `${value.length} / ${max}`; input.classList.toggle('field-over', over); note.classList.toggle('over-limit', over); }
function updateJsonStats() { const raw = $('#pageBlocks').value || ''; let blocks = '?'; try { const parsed = JSON.parse(raw || '[]'); blocks = Array.isArray(parsed) ? parsed.length : '?'; $('#pageBlocks').removeAttribute('aria-invalid'); } catch { $('#pageBlocks').setAttribute('aria-invalid','true'); } $('#jsonStats').textContent = `${blocks} blocks · ${raw.length} chars`; }
function updateFieldStats() { if (!state.issue) return; countText('metaSubtitle','subtitleCount',120); countText('pageNav','pageNavCount',120); countText('pageSection','pageSectionCount',120); countText('pageKicker','pageKickerCount',120); countText('pageTitle','pageTitleCount',120); updateJsonStats(); }
function statusLabel(status='') { return ({draft:'草稿',review:'校审中',ready:'待发布',published:'已发布'})[status] || status || '未设置'; }
function isReleaseableIssueStatus(status='') { return ['ready','published'].includes(String(status||'draft')); }
function updateMetaSummary() {
  if (!state.issue) return;
  const x=state.issue, pages=Array.isArray(x.pages)?x.pages.length:0;
  $('#metaSummaryTitle').textContent = `${x.label || x.id} · ${x.subtitle || '未填写本期主题'}`;
  $('#metaSummaryText').textContent = `${x.id} · ${statusLabel(x.status)} · ${pages} 页 · ${x.publisher || '未填写发布单位'}`;
}
function renderSourceStatus(){
  $('#sourceConflictBanner')?.classList.toggle('hidden',!state.sourceConflict);
  const title=$('#sourceStatusTitle'),text=$('#sourceStatusText'),exportLink=$('#sourceExportBtn');if(!title||!text||!exportLink)return;
  const source=state.sourceStatus;
  exportLink.href=state.issue?appUrl(`/api/issues/${encodeURIComponent(state.issue.id)}/source-export`):'#';
  exportLink.setAttribute('aria-disabled',state.issue?'false':'true');
  if(!state.issue){title.textContent='尚未选择期刊';text.textContent='选择一期期刊后显示服务器制作源状态。';return;}
  if(!source){title.textContent='服务器制作源状态暂不可用';text.textContent='当前期刊仍可编辑；下次保存前请确认网络连接正常。';return;}
  const snapshot=source.latestSnapshot?.createdAt?`最近快照 ${fmtTime(source.latestSnapshot.createdAt)}`:'尚未建立手动快照';
  if(state.sourceConflict){title.textContent='检测到并发保存冲突 · 已锁定保存';text.textContent=`本地稿未丢失；编辑基线 ${String(state.sourceFingerprint||'').slice(0,12)||'—'}，服务器最新 ${String(state.sourceObservedFingerprint||source.fingerprint||'').slice(0,12)||'—'}。请重新打开本期并人工合并；刷新服务器状态不会解除锁定。`;return;}
  title.textContent=`服务器制作源 · 已保护`;
  text.textContent=`保存前自动创建快照；编辑基线 ${String(state.sourceFingerprint||'').slice(0,12)||'—'} · 服务器观察 ${String(state.sourceObservedFingerprint||source.fingerprint||'').slice(0,12)||'—'} · ${snapshot} · 保留 ${Number(source.snapshotCount||0)} 个快照。`;
}
async function refreshSourceStatus({quiet=false,adoptBaseline=false}={}){
  const id=state.issue?.id;if(!id)return null;
  try{const source=await api(`/api/issues/${encodeURIComponent(id)}/source-status`);if(state.issue?.id!==id)return null;state.sourceStatus=source;state.sourceObservedFingerprint=String(source?.fingerprint||'');if(adoptBaseline&&!state.dirty&&!state.sourceConflict)state.sourceFingerprint=state.sourceObservedFingerprint;renderSourceStatus();return source;}
  catch(error){if(!quiet)toast(`读取服务器制作源失败：${error.message}`,3000);return null;}
}
function setMetaExpanded(expanded,{remember=true}={}) {
  state.metaExpanded=Boolean(expanded); const card=$('#metaCard'); if(!card)return;
  card.classList.toggle('is-collapsed',!state.metaExpanded); $('#metaToggle')?.setAttribute('aria-expanded',String(state.metaExpanded));
  $('#metaToggleText').textContent=state.metaExpanded?'收起':'展开';
  if(remember)try{localStorage.setItem('v3StudioMetaExpanded',state.metaExpanded?'1':'0')}catch{}
}
function updatePageMetaSummary() {
  const p=currentPage(); if(!p)return;
  $('#pageMetaSummaryTitle').textContent = p.title || p.navTitle || `第 ${state.page+1} 页`;
  const bits=[p.type||'article',p.section||'未归类',p.kicker||'无眉题'].filter(Boolean);
  $('#pageMetaSummaryText').textContent = `${p.navTitle || '无导航标题'} · ${bits.join(' · ')}`;
}
function setPageMetaExpanded(expanded,{remember=true}={}) {
  state.pageMetaExpanded=Boolean(expanded); const card=$('#pageMetaCard'); if(!card)return;
  card.classList.toggle('is-collapsed',!state.pageMetaExpanded); $('#pageMetaToggle')?.setAttribute('aria-expanded',String(state.pageMetaExpanded));
  $('#pageMetaToggleText').textContent=state.pageMetaExpanded?'收起':'展开';
  if(remember)try{localStorage.setItem('v3StudioPageMetaExpanded',state.pageMetaExpanded?'1':'0')}catch{}
}
function setSidebarCollapsed(collapsed,{remember=true}={}) {
  state.sidebarCollapsed=Boolean(collapsed)&&window.innerWidth>900;
  document.body.classList.toggle('sidebar-collapsed',state.sidebarCollapsed);
  const b=$('#sidebarToggle'); if(b){b.textContent=state.sidebarCollapsed?'›':'‹';b.title=state.sidebarCollapsed?'展开期刊导航':'收束期刊导航';b.setAttribute('aria-label',b.title);}
  if(remember)try{localStorage.setItem('v3StudioSidebarCollapsed',state.sidebarCollapsed?'1':'0')}catch{}
  requestAnimationFrame(fitReaderPreview);
}
function setPagesPanelCollapsed(collapsed,{remember=true}={}) {
  state.pagesPanelCollapsed=Boolean(collapsed);
  document.body.classList.toggle('pages-panel-collapsed',state.pagesPanelCollapsed);
  const b=$('#pagesPanelToggle'); if(b){const open=!state.pagesPanelCollapsed;b.innerHTML=`<span class="rail-toggle-icon" aria-hidden="true">${open?'‹':'›'}</span><span class="rail-toggle-label">${open?'收束页面':'展开页面'}</span>`;b.title=open?'收束页面导航':'展开页面导航';b.setAttribute('aria-label',b.title);b.setAttribute('aria-expanded',String(open));}
  if(remember)try{localStorage.setItem('v3StudioPagesCollapsed',state.pagesPanelCollapsed?'1':'0')}catch{}
  requestAnimationFrame(fitReaderPreview);
}
function setBlockCanvasCollapsed(collapsed,{remember=true}={}) {
  state.blockCanvasCollapsed=Boolean(collapsed)&&WORKSPACE_MODE;
  document.body.classList.toggle('block-canvas-collapsed',state.blockCanvasCollapsed);
  const b=$('#blockCanvasToggle');if(b){const open=!state.blockCanvasCollapsed;b.textContent=open?'收束内容':'展开内容';b.title=open?'收束内容块编辑列':'展开内容块编辑列';b.setAttribute('aria-label',b.title);b.setAttribute('aria-expanded',String(open));}
  if(remember)try{localStorage.setItem('v3StudioBlockCanvasCollapsed',state.blockCanvasCollapsed?'1':'0')}catch{}
  requestAnimationFrame(fitReaderPreview);
}
function setQuickFormatCollapsed(collapsed,{remember=true}={}) {
  state.quickFormatCollapsed=Boolean(collapsed)&&WORKSPACE_MODE;
  const bar=$('#quickFormatBar');bar?.classList.toggle('is-collapsed',state.quickFormatCollapsed);
  const b=$('#quickFormatToggle');if(b){const open=!state.quickFormatCollapsed;b.textContent=open?'收束格式':'展开格式';b.title=open?'收束低频格式控件':'展开低频格式控件';b.setAttribute('aria-label',b.title);b.setAttribute('aria-expanded',String(open));}
  if(remember)try{localStorage.setItem('v3StudioQuickFormatCollapsed',state.quickFormatCollapsed?'1':'0')}catch{}
}
function setWorkspaceSplit(percent,{remember=true,preset='custom'}={}) {
  const value=Math.max(20,Math.min(70,Math.round(Number(percent)||50)));
  state.workspaceSplit=value; state.workspaceLayout=preset;
  document.documentElement.style.setProperty('--studio-editor-share',`${value}%`);document.documentElement.style.setProperty('--studio-editor-fr',`${value}fr`);document.documentElement.style.setProperty('--studio-preview-fr',`${100-value}fr`);
  const grid=$('#visualEditor'); grid?.classList.remove('layout-preview-max');
  const label=$('#workspaceSplitLabel'); if(label)label.textContent=`${value}% / ${100-value}%`;
  document.querySelectorAll('#workspaceLayoutToolbar [data-layout]').forEach(b=>b.classList.toggle('active',b.dataset.layout===preset || (preset==='custom'&&b.dataset.layout==='balanced'&&value===50))); const view=$('#workspaceViewSelect');if(view&&['edit','balanced','preview'].includes(preset))view.value=preset;
  if(remember)try{localStorage.setItem('v3StudioWorkspaceSplit',String(value));localStorage.setItem('v3StudioWorkspaceLayout',preset)}catch{}
  requestAnimationFrame(fitReaderPreview);
}
function setWorkspaceLayoutPreset(mode,{remember=true}={}) {
  const grid=$('#visualEditor'); if(!grid)return;
  if(mode==='preview-max'){
    state.workspaceLayout=mode;grid.classList.add('layout-preview-max');
    document.querySelectorAll('#workspaceLayoutToolbar [data-layout]').forEach(b=>b.classList.toggle('active',b.dataset.layout===mode));
    $('#workspaceSplitLabel').textContent='预览最大化';const view=$('#workspaceViewSelect');if(view)view.value='preview-max';
    if(remember)try{localStorage.setItem('v3StudioWorkspaceLayout',mode)}catch{}
    requestAnimationFrame(fitReaderPreview);return;
  }
  const value=mode==='edit'?30:mode==='preview'?25:50; setWorkspaceSplit(value,{remember,preset:mode});
}
function restoreWorkspacePreferences(){
  let sidebar=false,savedPages=null,blockCanvas=false,quickFormat=false,layout=INITIAL_ROUTE.layout||'preview',split=25;
  try{sidebar=localStorage.getItem('v3StudioSidebarCollapsed')==='1';savedPages=localStorage.getItem('v3StudioPagesCollapsed');blockCanvas=localStorage.getItem('v3StudioBlockCanvasCollapsed')==='1';quickFormat=localStorage.getItem('v3StudioQuickFormatCollapsed')==='1';if(!INITIAL_ROUTE.layout)layout=localStorage.getItem('v3StudioWorkspaceLayout')||'preview';if(!INITIAL_ROUTE.layout)split=Number(localStorage.getItem('v3StudioWorkspaceSplit')||25);}catch{}
  setSidebarCollapsed(sidebar,{remember:false});setPagesPanelCollapsed(savedPages==null?!WORKSPACE_MODE:savedPages==='1',{remember:false});
  setBlockCanvasCollapsed(blockCanvas,{remember:false});setQuickFormatCollapsed(quickFormat,{remember:false});
  if(INITIAL_ROUTE.layout)split=layout==='edit'?30:layout==='preview'?25:50;if(layout==='preview-max')setWorkspaceLayoutPreset('preview-max',{remember:false});else setWorkspaceSplit(split,{remember:false,preset:['edit','balanced','preview'].includes(layout)?layout:'preview'});
  if(INITIAL_ROUTE.device)applyReaderPreviewDevice(INITIAL_ROUTE.device);if(INITIAL_ROUTE.canvas)setCanvasMode(true,{silent:true});if(INITIAL_ROUTE.selection.length)setBlockSelection(INITIAL_ROUTE.selection);
}
function issuesEqual(a,b) { try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; } }
function resetHistory() { state.undoStack=[]; state.redoStack=[]; state.historyCurrent=cloneData(state.issue); state.historyLastAt=0; state.historyGroup=''; clearDesignHistory(); updateStateBadges(); }
function captureHistory(group='edit',{force=false}={}) {
  if (!state.issue) return;
  const next=cloneData(state.issue); if (!state.historyCurrent) { state.historyCurrent=next; return; }
  if (issuesEqual(state.historyCurrent,next)) return;
  const now=Date.now(), grouped=!force && state.historyGroup===group && now-state.historyLastAt<650;
  if (!grouped) { state.undoStack.push(cloneData(state.historyCurrent)); if(state.undoStack.length>60)state.undoStack.shift(); state.redoStack=[]; }
  state.historyCurrent=next; state.historyLastAt=now; state.historyGroup=group;
}
function updateDraftBadge(text=null,visible=null) { const el=$('#draftBadge'); if(!el)return; if(text)el.textContent=text; if(visible!=null)el.classList.toggle('hidden',!visible); }
async function saveDraftNow() {
  if(!state.issue||!state.dirty||state.draftSaving)return false; state.draftSaving=true;
  try { const r=await api(`/api/issues/${encodeURIComponent(state.issue.id)}/draft`,{method:'PUT',body:JSON.stringify({issue:state.issue})}); state.draftSavedAt=r.savedAt||new Date().toISOString(); updateDraftBadge(`草稿已自动保存 ${new Date(state.draftSavedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`,true);broadcastPeer('draft',{savedAt:state.draftSavedAt}); return true; }
  catch(e){ updateDraftBadge('自动草稿保存失败',true); return false; }
  finally{state.draftSaving=false;}
}
function scheduleDraftSave(){clearTimeout(state.draftTimer);if(!state.issue||!state.dirty)return;state.draftTimer=setTimeout(()=>saveDraftNow(),850);updateDraftBadge('自动草稿待保存',true);}
async function deleteDraft(){if(!state.issue)return;clearTimeout(state.draftTimer);try{await api(`/api/issues/${encodeURIComponent(state.issue.id)}/draft`,{method:'DELETE',body:'{}'});}catch{}state.draftSavedAt=null;updateDraftBadge('',false);}
function scheduleWorkspaceAuditRefresh(){
  if(state.workspaceAuditFrame)return;
  const refresh=()=>{state.workspaceAuditFrame=0;renderWorkspaceAudit();};
  if(typeof requestAnimationFrame!=='function'){refresh();return;}
  state.workspaceAuditFrame=requestAnimationFrame(refresh);
}
function updateStateBadges() {
  const guide=$('#productionGuideState');if(guide&&state.issue)guide.textContent=`${statusLabel(state.issue.status)} · ${state.issue.pages.length} 页${state.dirty?' · 有未保存修改':''}`;
  const dirty = $('#dirtyBadge'); const publishedBase=state.originalIssue?.status==='published'; const revisionPending=Boolean(state.issue?.revision?.pending);
  if(state.dirty){dirty.textContent=publishedBase?'已发布稿 · 有未保存修订':'有未保存修改';dirty.className=`state-badge ${publishedBase?'revision':'dirty'}`;}
  else if(revisionPending){dirty.textContent='已保存 · 未发布修订';dirty.className='state-badge revision';}
  else {dirty.textContent='已保存';dirty.className='state-badge clean';}
  const undo=$('#undoBtn'),redo=$('#redoBtn'),discard=$('#discardBtn'); if(undo)undo.disabled=!state.undoStack.length; if(redo)redo.disabled=!state.redoStack.length; if(discard)discard.disabled=!state.dirty;
  scheduleWorkspaceUiRefresh();
  const audit = $('#auditFreshness'); if (!state.audit) { audit.textContent = '尚未审计'; audit.className = 'state-badge neutral'; } else if (state.auditStale || state.dirty) { audit.textContent = '审计已过期'; audit.className = 'state-badge stale'; } else { audit.textContent = `审计：${String(state.audit.readiness || '').toUpperCase()}`; audit.className = `state-badge ${state.audit.readiness === 'ready' ? 'clean' : state.audit.readiness === 'blocked' ? 'dirty' : 'stale'}`; }
  scheduleWorkspaceAuditRefresh();
}
function scheduleWorkspaceUiRefresh(){if(state.uiRefreshFrame)return;if(typeof requestAnimationFrame!=='function')return updateWorkspaceToolbar();state.uiRefreshFrame=requestAnimationFrame(()=>{state.uiRefreshFrame=0;updateWorkspaceToolbar();});}
function scheduleFieldStatsRefresh(){if(state.fieldStatsFrame)return;if(typeof requestAnimationFrame!=='function')return updateFieldStats();state.fieldStatsFrame=requestAnimationFrame(()=>{state.fieldStatsFrame=0;updateFieldStats();});}
function markDirty({ preview = true, readerSync = true, historyGroup='edit', forceHistory=false, recordHistory=true, assumeDirty=false, ensureIdentity=true } = {}) { if(ensureIdentity)ensureIssueIdentity(state.issue); if(!String(historyGroup).startsWith('design'))clearDesignHistory(); if(recordHistory)captureHistory(historyGroup,{force:forceHistory}); state.dirty = assumeDirty?true:!issuesEqual(state.issue,state.originalIssue); state.builtPreviewStale = true; if (state.audit) state.auditStale = true; updateStateBadges(); scheduleFieldStatsRefresh(); updateBuiltPreviewState(); scheduleDraftSave(); if(readerSync)scheduleReaderPreviewSync(); if (preview) renderPreview(); }
function beginInlineInputHistory(element,group='inline-edit'){
  if(!element||inlineInputHistory.has(element))return;
  inlineInputHistory.set(element,{group,snapshot:cloneData(state.historyCurrent||state.issue)});
}
function scheduleInlinePreview(){
  if(state.inlinePreviewFrame)return;
  const render=()=>{state.inlinePreviewFrame=0;renderPreview({syncReader:false});scheduleReaderPreviewSync(260);};
  if(typeof requestAnimationFrame!=='function'){render();return;}
  state.inlinePreviewFrame=requestAnimationFrame(render);
}
function markInlineInputDirty(element,{group='inline-edit',preview=true}={}){
  beginInlineInputHistory(element,group);
  markDirty({preview:false,readerSync:false,historyGroup:group,recordHistory:false,assumeDirty:true,ensureIdentity:false});
  if(preview)scheduleInlinePreview();
}
function finalizeInlineInput(element,{syncJson=false,preview=true}={}){
  const pending=element?inlineInputHistory.get(element):null;
  if(!pending)return;
  inlineInputHistory.delete(element);
  const changed=!issuesEqual(pending.snapshot,state.issue);
  if(changed){state.undoStack.push(pending.snapshot);if(state.undoStack.length>60)state.undoStack.shift();state.redoStack=[];state.historyCurrent=cloneData(state.issue);state.historyLastAt=Date.now();state.historyGroup=pending.group;}
  state.dirty=!issuesEqual(state.issue,state.originalIssue);
  if(syncJson)syncJsonFromPage();
  updateStateBadges();
  scheduleFieldStatsRefresh();
  if(preview)scheduleReaderPreviewSync(60);
}
function applyHistorySnapshot(snapshot,{fromUndo=false}={}) { if(!snapshot)return; state.issue=cloneData(snapshot); state.page=Math.max(0,Math.min(state.page,(state.issue.pages||[]).length-1)); state.selectedPages.clear(); state.historyCurrent=cloneData(state.issue); state.dirty=!issuesEqual(state.issue,state.originalIssue); state.auditStale=Boolean(state.audit); renderIssue({preserveHistory:true,preserveDraft:true}); scheduleDraftSave(); toast(fromUndo?'已撤销一步':'已重做一步'); }
function undoHistory(){ if(!state.undoStack.length)return; const current=cloneData(state.issue),prev=state.undoStack.pop(); state.redoStack.push(current); applyHistorySnapshot(prev,{fromUndo:true}); updateStateBadges(); }
function redoHistory(){ if(!state.redoStack.length)return; const current=cloneData(state.issue),next=state.redoStack.pop(); state.undoStack.push(current); applyHistorySnapshot(next,{fromUndo:false}); updateStateBadges(); }
function updateWorkspaceToolbar(){
  updateTocNotice();
  document.body.classList.toggle('workspace-mode',WORKSPACE_MODE);
  $('#productionGuide')?.classList.toggle('hidden',WORKSPACE_MODE);
  const p=currentPage(),total=state.issue?.pages?.length||0;
  if($('#workspacePageLabel'))$('#workspacePageLabel').textContent=state.issue?`第 ${state.page+1} / ${total} 页`:'未选择页面';
  if($('#workspacePageTitle'))$('#workspacePageTitle').textContent=p?.navTitle||p?.title||'页面';
  if($('#workspacePrevPage'))$('#workspacePrevPage').disabled=!state.issue||state.page<=0;
  if($('#workspaceNextPage'))$('#workspaceNextPage').disabled=!state.issue||state.page>=total-1;
  if($('#workspaceSaveState')){$('#workspaceSaveState').textContent=state.dirty?'未保存':'已保存';$('#workspaceSaveState').title=state.dirty?'当前修改尚未保存到制作源，线上内容尚未更新。':'修改已保存到制作源；保存不会自动更新线上版本，请在发布中心发布。';$('#workspaceSaveState').classList.toggle('dirty',state.dirty);}
  renderWorkspaceMediaStatus();
  if($('#workspaceUndoBtn'))$('#workspaceUndoBtn').disabled=!state.undoStack.length;
  if($('#workspaceRedoBtn'))$('#workspaceRedoBtn').disabled=!state.redoStack.length;
  const animationMode=['smooth','slide','fade','three-d','none'].includes(state.issue?.features?.turnAnimation)?state.issue.features.turnAnimation:'smooth',animation=$('#workspaceReaderAnimation'),animationButton=$('#readerAnimationButton'),animationLabels={smooth:'平滑',slide:'滑动',fade:'淡入',"three-d":'3D 翻转',none:'无动效'};if(animation)animation.value=animationMode;if(animationButton)animationButton.textContent=`动效 · ${animationLabels[animationMode]||'平滑'}`;
  updatePeerIndicator();updateVisualHealth();
  updateManagerDashboard();
  updateStudioEntryUi();
}
function updateAuditEntry(){
  const count=$('#auditEntryCount');
  if(!count)return;
  if(!state.issue){count.textContent='未选择';return;}
  if(!state.audit){count.textContent='未检查';return;}
  const blockers=Number(state.audit.blockers?.length||0),tips=Number(state.audit.warnings?.length||0)+Number(state.audit.notes?.length||0);
  count.textContent=blockers?`${blockers} 阻断`:tips?`${tips} 提示`:'通过';
  count.classList.toggle('blocked',blockers>0);
  count.classList.toggle('ready',!blockers&&!tips);
}
function updateStudioEntryUi(){
  const active=['content','media','design','publish'].includes(state.studioEntry)?state.studioEntry:'content';
  document.querySelectorAll('[data-studio-entry]').forEach(button=>{
    const on=button.dataset.studioEntry===active;
    button.classList.toggle('active',on);
    if(on)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  });
  updateAuditEntry();
}
function setStudioEntry(entry,{focus=true}={}){
  const next=['content','media','design','publish'].includes(entry)?entry:'content';
  state.studioEntry=next;updateStudioEntryUi();
  if(next==='content'){
    if(focus&&state.issue){
      const target=WORKSPACE_MODE?$('#builtPreviewPanel'):$('#pageEditor');
      target?.scrollIntoView({behavior:'smooth',block:'nearest'});
    }
    return;
  }
  if(!requireIssue('请先选择一期期刊，再使用此功能')){state.studioEntry='content';updateStudioEntryUi();return;}
  if(next==='media')void openMediaDialog(null);
  else if(next==='design')openContextDesign();
  else if(next==='publish')openPublicationCenter();
}
function workspaceFilteredPageIndices(query=''){const q=String(query||'').trim().toLowerCase(),pages=state.issue?.pages||[],out=[];pages.forEach((p,i)=>{const hay=`${p.navTitle||''} ${p.title||''} ${p.section||''} ${p.type||''}`.toLowerCase();if(!q||hay.includes(q))out.push(i);});return out;}
function renderWorkspacePageList(query=''){
  const box=$('#workspacePageList');if(!box||!state.issue)return;const q=String(query||'').trim().toLowerCase();
  const pages=state.issue.pages||[];const rows=[];pages.forEach((p,i)=>{const hay=`${p.navTitle||''} ${p.title||''} ${p.section||''} ${p.type||''}`.toLowerCase();if(q&&!hay.includes(q))return;rows.push(`<div class="workspace-page-row"><input type="checkbox" data-workspace-page-select="${i}" ${state.selectedPages.has(i)?'checked':''} aria-label="选择第 ${i+1} 页"><button type="button" data-workspace-page="${i}" class="${i===state.page?'active':''}"><span>${String(i+1).padStart(2,'0')}</span><b>${escText(p.navTitle||p.title||`第 ${i+1} 页`)}</b><small>${escText(p.section||p.type||'article')}</small></button></div>`)});box.innerHTML=rows.join('')||'<div class="workspace-page-empty">没有匹配页面</div>';$('#workspacePageDialogMeta').textContent=`${state.issue.label||state.issue.id} · ${pages.length} 页`;const selected=$('#workspaceSelectedPageCount');if(selected)selected.textContent=state.selectedPages.size?`已选 ${state.selectedPages.size} 页`:'未选择页面';
}
function openWorkspacePageDialog(){if(!requireIssue())return;$('#workspacePageSearch').value='';renderWorkspacePageList();$('#workspacePageDialog').showModal();}
function goToPage(index,{fromReader=false}={}){
  if(!state.issue)return false;const next=Math.max(0,Math.min(state.issue.pages.length-1,Number(index)));if(!Number.isInteger(next)||next===state.page){syncReaderPreviewPage({reliable:true});return true;}if(!commitPage()){if(fromReader)syncReaderPreviewPage({reliable:true});return false;}
  state.page=next;state.readerTargetPage=next;state.selectedBlocks.clear();state.selectedBlockIds.clear();state.lastSelectedBlock=null;updateActivePageRows();renderPage({syncReader:false});if(state.readerPreviewDevice==='adaptive')refreshAdaptiveReaderDevice();syncWorkspaceRoute();updateWorkspaceToolbar();syncReaderPreviewPage({reliable:true,reload:false});
  requestAnimationFrame(()=>{const canvas=$('.block-canvas');if(canvas)canvas.scrollTop=0;document.querySelector(`.page-item[data-page-index="${next}"]`)?.scrollIntoView({block:'nearest'});});broadcastPeer('presence');return true;
}

function runtimeVersionLabel(version=''){
  const v=String(version||'').trim();
  const rc=v.match(/^3\.1\.0-rc\.(\d+)$/i); if(rc)return `V3.1 RC${rc[1]} · Release Candidate`;
  const beta=v.match(/^3\.1\.0-beta\.(.+)$/i); if(beta)return `V3.1 Beta ${beta[1]} · Production Validation`;
  const alpha=v.match(/^3\.1\.0-alpha\.(.+)$/i); if(alpha)return `V3.1 Alpha ${alpha[1]}`;
  return v?`V${v}`:'V3.1';
}
function updateRuntimeVersionUi(){const el=$('#studioVersionLabel');if(el)el.textContent=runtimeVersionLabel(state.runtimeVersion);document.documentElement.dataset.runtimeVersion=state.runtimeVersion||'';}
async function loadRuntimeVersion(){if(state.runtimeVersion)return state.runtimeVersion;try{const health=await api('/api/health');state.runtimeVersion=String(health?.version||'');updateRuntimeVersionUi();return state.runtimeVersion;}catch{updateRuntimeVersionUi();return '';}}

async function loadIssues(selectId) {
  const runtimePromise=loadRuntimeVersion().catch(()=>''),issuesPromise=api('/api/issues');
  state.issues = await issuesPromise; const list = $('#issueList'); list.innerHTML = '';
  state.issues.forEach(x => { const b = document.createElement('button'); b.dataset.issueId=String(x.id); b.className = 'issue-item' + (x.id === state.issue?.id ? ' active' : ''); b.title = `${x.label || x.id} · ${x.subtitle || x.status || ''}`; const pageMeta=Number.isFinite(x.pageCount)?`${x.pageCount} 页 · `:''; const revision=x.revisionPending?' · 未发布修订':''; b.innerHTML = `<b>${escText(x.label || x.id)}</b><span>${escText(x.subtitle || x.status || '')}</span><em>${escText(`${pageMeta}${statusLabel(x.status)}${revision} · ${x.engine === 'v3' ? 'V3 可编辑' : '旧版'}`)}</em>`; b.onclick = () => { void openIssue(x.id); }; list.appendChild(b); });
  renderCloneOptions(); const target=selectId||((WORKSPACE_MODE||INITIAL_ROUTE.issue)?INITIAL_ROUTE.issue:''); if(target&&(selectId||state.issue?.id!==target)) await openIssue(target);
  // “我的样式”只会在打开设计器时读取，避免管理端首次进入额外请求和重绘。
  void runtimePromise;
}
function deferStudioTask(task){const run=()=>Promise.resolve().then(task).catch(()=>{});if(typeof window.requestIdleCallback==='function')window.requestIdleCallback(run,{timeout:900});else setTimeout(run,0);}
function setIssueLoading(issueId=''){
  state.issueLoadingId=String(issueId||'');
  document.querySelectorAll('.issue-item').forEach(button=>{
    const active=Boolean(state.issueLoadingId)&&button.dataset.issueId===state.issueLoadingId;
    button.classList.toggle('is-loading',active);
    button.classList.toggle('is-blocked',Boolean(state.issueLoadingId)&&!active);
    button.disabled=Boolean(state.issueLoadingId);
    button.setAttribute('aria-busy',active?'true':'false');
  });
}
function askDraftRecovery(draft) {
  return new Promise(resolve=>{ const dialog=$('#draftRecoveryDialog'); const saved=draft?.savedAt?fmtTime(draft.savedAt):'未知时间'; const diff=summarizeIssueDiff(state.originalIssue,draft?.issue||{}); const m=diff.metrics;
    $('#draftRecoveryText').textContent=`检测到 ${saved} 自动保存的未提交草稿。你可以恢复继续编辑，也可以丢弃并使用最近正式保存版本。`;
    $('#draftRecoverySummary').innerHTML=`<div><span>元数据</span><b>${m.meta}</b></div><div><span>页面</span><b>${m.pages}</b></div><div><span>内容</span><b>${m.blocks}</b></div><div><span>文章</span><b>${m.articles}</b></div>`;
    const done=()=>{dialog.removeEventListener('close',done);resolve(dialog.returnValue||'skip');};dialog.addEventListener('close',done);dialog.showModal();
  });
}
async function openIssue(id,{skipDraftRecovery=false}={}) {
  const issueId=String(id||'');if(!issueId)return false;
  if(state.saving){toast('正在保存，请稍后切换期刊');return false;}
  if(state.issueLoadingId===issueId)return state.issueLoadPromise||false;
  const token=++state.issueLoadToken;
  const run=(async()=>{setIssueLoading(issueId);try{
    if (state.dirty) { const saved=await saveDraftNow(); if (!confirm(saved?'当前有未保存修改，已自动保存为恢复草稿。仍要切换期刊吗？':'自动草稿尚未保存成功。建议取消并下载当前修改备份；仍要切换期刊吗？')) return false; }
    const issueRequest=api(`/api/issues/${encodeURIComponent(issueId)}`); const draftRequest=api(`/api/issues/${encodeURIComponent(issueId)}/draft`).catch(()=>null); const sourceRequest=api(`/api/issues/${encodeURIComponent(issueId)}/source-status`).catch(()=>null); const [diskIssue,draft,sourceStatus]=await Promise.all([issueRequest,draftRequest,sourceRequest]); if(token!==state.issueLoadToken)return false;
    const normalizedIssue=cloneData(diskIssue); const identityMigration=ensureIssueIdentity(normalizedIssue); state.issue=cloneData(normalizedIssue); state.originalIssue=cloneData(normalizedIssue); state.sourceStatus=sourceStatus; state.sourceFingerprint=String(sourceStatus?.fingerprint||''); state.sourceObservedFingerprint=state.sourceFingerprint; state.sourceConflict=null; state.identityMigrationPending=identityMigration.changed; state.page=0; state.dirty=false; state.audit=null; state.auditStale=false; state.publicationStatus=null; state.publicationStatusPromise=null; state.publicationWorkflow=null; state.editorMode='visual'; state.pageSearch=''; state.mediaAssets=null; state.builtPreviewStale=true; state.readerPreviewReady=false; state.managerPreviewReady=false; state.managerPreviewIssueId=''; state.articleId=null; state.selectedPages.clear(); state.selectedBlocks.clear(); state.selectedBlockIds.clear(); state.lastSelectedBlock=null; state.editorialPlan=null; state.editorialPlanLoadedFor=''; state.editorialPlanDirty=false; state.editorialPlanSavedAt=null; state.reviewWorkspace=null; state.reviewWorkspaceLoadedFor=''; state.reviewWorkspaceDirty=false; state.reviewWorkspaceFilter='all'; state.reviewHandoffs=null; state.reviewHandoffsLoadedFor=''; state.reviewHandoffsDirty=false; state.reviewHandoffDiffTargetId=''; state.reviewHandoffDiffBase=null; state.reviewHandoffDiffLoading=false; state.visualMetrics=null; $('#pageSearch').value=''; updateDraftBadge('',false);
    renderWorkspaceMediaStatus();
    if(draft?.exists&&draft.issue){ensureIssueIdentity(draft.issue);} if(!skipDraftRecovery&&draft?.exists&&draft.issue&&!issuesEqual(draft.issue,normalizedIssue)){
      const action=INITIAL_ROUTE.handoff?'recover':await askDraftRecovery(draft);
      if(action==='recover'){state.issue=cloneData(draft.issue);state.dirty=true;state.draftSavedAt=draft.savedAt||null;updateDraftBadge(`${INITIAL_ROUTE.handoff?'已继承新窗口草稿':'已恢复草稿'} · ${draft.savedAt?fmtTime(draft.savedAt):''}`,true);}
      else if(action==='discard'){try{await api(`/api/issues/${encodeURIComponent(issueId)}/draft`,{method:'DELETE',body:'{}'});}catch{}updateDraftBadge('',false);}
    }
    if(!state.routeApplied && INITIAL_ROUTE.issue===issueId){state.page=Math.max(0,Math.min((state.issue.pages||[]).length-1,INITIAL_ROUTE.page-1));state.routeApplied=true;}
    state.readerTargetPage=state.page;
    if(WORKSPACE_MODE&&INITIAL_ROUTE.editor==='json')state.editorMode='json';if(WORKSPACE_MODE&&INITIAL_ROUTE.canvas)state.canvasMode=true;if(WORKSPACE_MODE&&INITIAL_ROUTE.selection.length){state.selectedBlocks=new Set(INITIAL_ROUTE.selection);state.lastSelectedBlock=INITIAL_ROUTE.selection.at(-1)??null;}
    clearReaderPageRequest(); clearManagerPageRequest();
    renderIssue(); initPeerChannel(issueId); syncWorkspaceRoute(); updateWorkspaceToolbar(); resetHistory(); if(state.dirty){state.undoStack.push(cloneData(state.originalIssue));state.historyCurrent=cloneData(state.issue);updateStateBadges();}
    deferStudioTask(()=>loadSnapshots(state.issue.id)); [...document.querySelectorAll('.issue-item')].forEach((b,i) => b.classList.toggle('active', state.issues[i]?.id === issueId)); updateStateBadges(); return true;
  }catch(error){if(token===state.issueLoadToken)toast(`打开期刊失败：${error?.message||'请稍后重试'}`,3600);return false;}finally{if(token===state.issueLoadToken){state.issueLoadPromise=null;setIssueLoading('');}}})();
  state.issueLoadPromise=run;return run;
}
function renderIssue({preserveHistory=false,preserveDraft=false}={}) {
  const x = state.issue; if (!x) return; $('#emptyState').classList.add('hidden'); $('#editor').classList.remove('hidden'); $('#currentTitle').textContent = `${x.label || x.id} · ${x.subtitle || ''}`;
  $('#metaId').value = x.id || ''; $('#metaLabel').value = x.label || ''; $('#metaSubtitle').value = x.subtitle || ''; $('#metaStatus').value = x.status || 'draft'; $('#metaPublisher').value = x.publisher || ''; $('#metaTurnAnimation').value=['smooth','slide','fade','three-d','none'].includes(x.features?.turnAnimation)?x.features.turnAnimation:(x.features?.flipAnimation===false?'none':'smooth');
  $('#auditCard').classList.add('hidden'); setPreviewMode('built'); updateBuiltPreviewState(); renderPages(); renderPage(); setEditorMode(state.editorMode==='json'?'json':'visual', { commit:false }); updateFieldStats(); updateStateBadges(); updateMetaSummary(); renderSourceStatus(); let expanded=false; try{expanded=localStorage.getItem('v3StudioMetaExpanded')==='1'}catch{} setMetaExpanded(expanded,{remember:false}); let pageExpanded=false; try{pageExpanded=localStorage.getItem('v3StudioPageMetaExpanded')==='1'}catch{} setPageMetaExpanded(pageExpanded,{remember:false});
  if(!preserveHistory)resetHistory(); if(!preserveDraft&&!state.dirty)updateDraftBadge('',false);
}
function syncMeta() { const x = state.issue; x.label = $('#metaLabel').value.trim(); x.subtitle = $('#metaSubtitle').value.trim(); x.status = $('#metaStatus').value; x.publisher = $('#metaPublisher').value.trim(); x.features={...(x.features||{}),turnAnimation:$('#metaTurnAnimation').value}; }
function syncPageMeta() {
  const p=currentPage();if(!p)return;
  for(const [key,id] of Object.entries({navTitle:'pageNav',type:'pageType',section:'pageSection',kicker:'pageKicker',title:'pageTitle'})){
    const value=$('#'+id).value.trim();
    // Merely visiting a page must not add empty optional fields during an async save.
    if(String(p[key]??'')!==value)p[key]=value;
  }
}
function syncJsonFromPage() { const p = currentPage(); if (!p) return; $('#pageBlocks').value = JSON.stringify(p.blocks || [], null, 2); updateJsonStats(); }
function syncJsonToPage({ notify = true } = {}) {
  const p = currentPage(); if (!p) return false; const raw = $('#pageBlocks').value || '[]';
  if (raw.length > LIMITS.jsonChars) { if (notify) toast('内容块 JSON 超过 600KB，请拆分页面', 2600); $('#pageBlocks').setAttribute('aria-invalid','true'); return false; }
  try { const blocks = JSON.parse(raw); if (!Array.isArray(blocks)) throw new Error('内容块必须是数组'); if (blocks.length > LIMITS.blocksPerPage) throw new Error(`单页最多 ${LIMITS.blocksPerPage} 个内容块`); const totalNodes=blocks.reduce((sum,b)=>sum+countBlockNodes(b),0); if(totalNodes>LIMITS.totalBlockNodesPerPage)throw new Error(`单页递归内容块总数最多 ${LIMITS.totalBlockNodesPerPage} 个，请拆分页面`); p.blocks = blocks; for(const block of p.blocks)ensureBlockIdentity(block); $('#pageBlocks').removeAttribute('aria-invalid'); updateJsonStats(); return true; }
  catch (e) { if (notify) toast(`内容块 JSON 无法应用：${e.message}`, 2600); $('#pageBlocks').setAttribute('aria-invalid','true'); return false; }
}
function commitPage() { const p = currentPage(); if (!p) return true; syncPageMeta(); if (state.editorMode === 'json' && !syncJsonToPage()) { $('#pageBlocks').focus(); return false; } return true; }
function filteredPageIndices() {
  const q=state.pageSearch.trim().toLowerCase(),pages=state.issue?.pages||[],out=[];
  pages.forEach((p,i)=>{const hay=`${p.navTitle||''} ${p.title||''} ${p.kicker||''} ${p.section||''} ${p.type||''}`.toLowerCase();if(!q||hay.includes(q))out.push(i);});return out;
}
function updateBatchPageBar(){const n=state.selectedPages.size;$('#batchPageBar')?.classList.toggle('hidden',!n);if($('#batchPageCount'))$('#batchPageCount').textContent=`已选 ${n} 页`;const shown=filteredPageIndices();const allShown=shown.length>0&&shown.every(i=>state.selectedPages.has(i));if($('#selectFilteredPages'))$('#selectFilteredPages').textContent=allShown?'取消选择筛选结果':'选择筛选结果';}
function renderPages() {
  const list = $('#pageList'); list.innerHTML = ''; const pages = state.issue.pages || []; $('#pageTotal').textContent = `${pages.length} 页`;
  const shown=filteredPageIndices();
  for(const i of shown){const p=pages[i];const row=document.createElement('div');row.className='page-row'+(state.selectedPages.has(i)?' selected':'');row.dataset.pageIndex=String(i);const check=document.createElement('input');check.type='checkbox';check.className='page-select';check.checked=state.selectedPages.has(i);check.title=`选择第 ${i+1} 页`;check.setAttribute('aria-label',`选择第 ${i+1} 页 ${p.navTitle||p.title||''}`);check.onchange=()=>{check.checked?state.selectedPages.add(i):state.selectedPages.delete(i);renderPages();};const b=document.createElement('button');b.className='page-item'+(i===state.page?' active':'');b.dataset.pageIndex=String(i);b.dataset.pageId=p.id||'';b.title=`第 ${i+1} 页 · ${p.navTitle||p.title||''}`;b.innerHTML=`<span class="n">${String(i+1).padStart(2,'0')}</span><span><b>${escText(p.navTitle||p.title||`页面 ${i+1}`)}</b><small>${escText(p.section?`${p.section} · ${p.type||'article'}`:(p.type||'article'))}</small></span>`;b.onclick=()=>goToPage(i);row.append(check,b);list.appendChild(row);}
  if(!shown.length)list.innerHTML='<div class="page-filter-empty">没有匹配页面。清空筛选可查看全部页面。</div>'; updateBatchPageBar();
}
function updateActivePageRows(){
  const current=String(state.page);
  document.querySelectorAll('#pageList .page-item[data-page-index]').forEach(button=>button.classList.toggle('active',button.dataset.pageIndex===current));
  document.querySelectorAll('#workspacePageList [data-workspace-page]').forEach(button=>button.classList.toggle('active',button.dataset.workspacePage===current));
}
function updateCurrentPageListEntry(){
  const p=currentPage(),index=String(state.page);if(!p)return;
  const button=$(`#pageList .page-item[data-page-index="${index}"]`);
  if(button){button.title=`第 ${state.page+1} 页 · ${p.navTitle||p.title||''}`;const title=button.querySelector('b'),meta=button.querySelector('small');if(title)title.textContent=p.navTitle||p.title||`页面 ${state.page+1}`;if(meta)meta.textContent=p.section?`${p.section} · ${p.type||'article'}`:(p.type||'article');}
  const workspaceButton=$(`#workspacePageList [data-workspace-page="${index}"]`);if(workspaceButton){const title=workspaceButton.querySelector('b'),meta=workspaceButton.querySelector('small');if(title)title.textContent=p.navTitle||p.title||`第 ${state.page+1} 页`;if(meta)meta.textContent=p.section||p.type||'article';}
}
function renderPage({syncReader=true}={}) {
  const p = currentPage(); if (!p) return; $('#pageHeading').textContent = `第 ${state.page+1} 页 · ${p.navTitle || p.title || ''}`; $('#pageNav').value = p.navTitle || ''; $('#pageType').value = p.type || 'article'; $('#pageSection').value = p.section || ''; $('#pageKicker').value = p.kicker || ''; $('#pageTitle').value = p.title || ''; if (!Array.isArray(p.blocks)) p.blocks = [];
  syncJsonFromPage(); renderBlockList(); renderPreview({syncReader}); updateFieldStats(); updatePageMetaSummary(); updateWorkspaceToolbar(); renderMobileStudio(); requestAnimationFrame(syncCanvasSelectionToReader);
}
function workspaceRouteUrl({issue=state.issue?.id||INITIAL_ROUTE.issue,page=state.page+1,workspace=WORKSPACE_MODE,inherit=false,handoff=false}={}){
  const q=new URLSearchParams(); if(issue)q.set('issue',issue); if(page)q.set('page',String(page));
  if(workspace&&INITIAL_ROUTE.mobile)q.set('mobile','1');
  if(inherit&&workspace){q.set('layout',state.workspaceLayout||'preview');q.set('device',state.readerPreviewDevice||'desktop-1366');q.set('editor',state.editorMode||'visual');if(state.canvasMode)q.set('canvas','1');const selected=validSelectedBlockIndices();if(selected.length)q.set('selection',selected.join(','));}
  if(handoff&&workspace)q.set('handoff','1');
  return `${APP_BASE}${workspace?'workspace/':''}${q.toString()?`?${q}`:''}`;
}
function syncWorkspaceRoute(){if(!WORKSPACE_MODE||!state.issue)return;history.replaceState(null,'',workspaceRouteUrl());}
function updatePeerIndicator(){const el=$('#workspacePeerState');if(!el)return;const count=state.peers?.size||0;el.classList.toggle('has-peer',count>0&&!state.remoteSavedIssue);el.classList.toggle('remote-pending',Boolean(state.remoteSavedIssue));el.textContent=state.remoteSavedIssue?'其他窗口已保存':count?`联动 ${count+1} 窗口`:'单窗口';}
function closePeerChannel(){try{state.peerChannel?.close?.()}catch{}state.peerChannel=null;state.peerIssueId='';state.peers=new Map();state.remoteSavedIssue=null;updatePeerIndicator();}
function broadcastPeer(type,payload={}){const ch=state.peerChannel;if(!ch||!state.issue)return;try{ch.postMessage({source:'v3-studio-peer',session:PEER_SESSION_ID,issueId:state.issue.id,type,page:state.page,dirty:state.dirty,at:Date.now(),...payload});}catch{}}
function applyRemoteSavedIssue(issue,{quiet=false}={}){if(!issue||issue.id!==state.issue?.id)return false;const keepPage=state.page;state.issue=cloneData(issue);state.originalIssue=cloneData(issue);state.page=Math.max(0,Math.min(keepPage,(state.issue.pages||[]).length-1));state.dirty=false;state.remoteSavedIssue=null;state.auditStale=Boolean(state.audit);resetHistory();renderIssue({preserveHistory:true,preserveDraft:true});syncWorkspaceRoute();updatePeerIndicator();if(!quiet)toast('已载入其他窗口保存的最新版本');return true;}
function handlePeerMessage(data){if(!data||data.source!=='v3-studio-peer'||data.session===PEER_SESSION_ID||data.issueId!==state.issue?.id)return;state.peers.set(data.session,{page:Number(data.page)||0,at:Number(data.at)||Date.now(),dirty:Boolean(data.dirty)});updatePeerIndicator();if(data.type==='hello')broadcastPeer('hello-ack');if(data.type==='saved'&&data.issue){if(state.dirty){state.remoteSavedIssue=cloneData(data.issue);state.remoteSavedAt=Number(data.at)||Date.now();updatePeerIndicator();toast('其他窗口已保存新版本；当前窗口有未保存修改，未自动覆盖',3600);}else applyRemoteSavedIssue(data.issue,{quiet:true});} }
function initPeerChannel(issueId){closePeerChannel();if(!issueId||typeof BroadcastChannel!=='function')return;try{const ch=new BroadcastChannel(`jinchang-magazine-v31-${issueId}`);state.peerChannel=ch;state.peerIssueId=issueId;ch.onmessage=e=>handlePeerMessage(e.data);broadcastPeer('hello');updatePeerIndicator();}catch{closePeerChannel();}}
function currentVisualMetric(){const rows=Array.isArray(state.visualMetrics?.pages)?state.visualMetrics.pages:[],pageId=currentPage()?.id||null;return (pageId?rows.find(x=>x.pageId===pageId):null)||rows.find(x=>Number(x.pageIndex)===state.page)||null;}
function visualHealthInfo(metric=currentVisualMetric()){const blocks=(currentPage()?.blocks||[]).length;if(!metric)return {state:'unknown',label:'版面 --',advice:'等待真实 Reader 完成当前页测量。',mode:'standard',fill:0,blocks,overflow:false};const fill=Math.max(0,Math.min(1,Number(metric.fillRatio)||0)),overflow=Boolean(metric.overflow);if(overflow||fill>.96||blocks>12)return {state:'dense',label:`版面 ${Math.round(fill*100)}% · 偏密`,advice:'当前页接近或超过可用高度。建议收紧段落/块间距，必要时重新分页。',mode:'compact',fill,blocks,overflow};if(fill<.38&&blocks<=3&&!['cover','toc','closing'].includes(currentPage()?.type))return {state:'warn',label:`版面 ${Math.round(fill*100)}% · 留白多`,advice:'当前页内容占用偏低。可适当放宽间距；如果只有少量短块，建议与相邻同栏目页面重新平衡。',mode:'relaxed',fill,blocks,overflow};return {state:'good',label:`版面 ${Math.round(fill*100)}% · 正常`,advice:'当前页内容高度与密度处于正常范围。',mode:'standard',fill,blocks,overflow};}
function updateVisualHealth(){const b=$('#visualHealthBtn'),x=visualHealthInfo();if(b){b.textContent=x.label;b.className=`visual-health-badge ${x.state==='good'?'good':x.state==='dense'?'dense':x.state==='warn'?'warn':''}`;}if($('#visualHealthDialog')?.open){const m=$('#visualHealthMetrics');m.innerHTML=`<div><span>内容占用</span><b>${Math.round(x.fill*100)}%</b></div><div><span>内容块</span><b>${x.blocks}</b></div><div><span>溢出</span><b>${x.overflow?'是':'否'}</b></div><div><span>建议间距</span><b>${x.mode==='compact'?'紧凑':x.mode==='relaxed'?'宽松':'标准'}</b></div>`;$('#visualHealthAdvice').innerHTML=`<strong>${x.label}</strong>${escText(x.advice)}`;$('#visualHealthBalance').disabled=x.state==='unknown';}if(WORKSPACE_MODE&&!validSelectedBlockIndices().length)renderContextInspector();else if(!WORKSPACE_MODE)updateManagerDashboard();}
function openVisualHealth(){updateVisualHealth();$('#visualHealthDialog')?.showModal();}
function mobileStudioViewportActive(){const force=new URLSearchParams(location.search).get('mobile')==='1';return Boolean(WORKSPACE_MODE&&(force||window.innerWidth<=MOBILE_STUDIO_BREAKPOINT));}
function mobileStudioReaderMessage(type,payload={}){const frame=$('#builtPreviewFrame');if(!frame?.contentWindow)return false;try{frame.contentWindow.postMessage({source:'v3-studio',type,...payload,pageIndex:state.page,pageId:currentPage()?.id||null},'*');return true}catch{return false}}
function setMobileStudioMode(force=null){const active=force==null?mobileStudioViewportActive():Boolean(force&&WORKSPACE_MODE);state.mobileStudioActive=active;document.body.classList.toggle('mobile-studio-mode',active);if(!active){closeMobileSheet({silent:true});mobileStudioReaderMessage('mobile-studio-mode',{enabled:false});requestAnimationFrame(fitReaderPreview);return false;}const device=window.innerWidth>=405?'phone-412':'phone-390';applyReaderPreviewDevice(device,{remember:false});setReaderZoom('fit-page',100,{remember:false});mobileStudioReaderMessage('mobile-studio-mode',{enabled:true});renderMobileStudio();requestAnimationFrame(()=>requestAnimationFrame(fitReaderPreview));return true;}
function mobileBlockTitle(block,index){return `${BLOCK_NAMES[block?.type]||block?.type||'内容块'} · ${String(index+1).padStart(2,'0')}`;}
function mobileTextCard({block,index}){const selected=state.selectedBlockIds.has(block.id),field=primaryEditableField(block),rich=Boolean(block.richText),value=field?String(block[field]||''):'';const summary=(blockSummary(block)||value||'暂无文字').replace(/\s+/g,' ').slice(0,90);return `<article class="mobile-target-card ${selected?'is-selected':''}" data-mobile-block-id="${escText(block.id||'')}"><div class="mobile-target-head"><div><strong>${escText(mobileBlockTitle(block,index))}</strong><small>${escText(summary)}</small></div><button type="button" data-mobile-select-block="${escText(block.id||'')}">${selected?'已选':'定位'}</button></div>${rich?`<div class="mobile-richtext-note">结构化富文本已启用。为避免破坏局部粗体、链接、颜色和列表，请直接在 Reader 中编辑。</div>`:(field?`<textarea data-mobile-quick-text="${escText(block.id||'')}" data-mobile-field="${escText(field)}" maxlength="12000">${escText(value)}</textarea>`:'')}<div class="mobile-target-actions"><button type="button" class="primary" data-mobile-edit-reader="${escText(block.id||'')}">在 Reader 编辑</button>${!rich&&field?`<button type="button" data-mobile-save-text="${escText(block.id||'')}">保存文字</button>`:''}</div></article>`;}
function renderMobileTextSheet(){const rows=mobileTextTargets(currentPage());return `<section class="mobile-sheet-section"><div class="mobile-section-label"><b>文字内容</b><span>${rows.length} 个可编辑块</span></div><div class="mobile-target-list">${rows.length?rows.map(mobileTextCard).join(''):'<div class="mobile-richtext-note">当前页没有可直接编辑的文字块。可在桌面端添加内容块。</div>'}</div></section>`;}
function renderMobileMediaSheet(){const rows=mobileMediaTargets(currentPage());return `<section class="mobile-sheet-section"><div class="mobile-section-label"><b>素材与背景</b><span>${rows.length} 个媒体块</span></div><div class="mobile-sheet-actions mobile-material-actions"><button type="button" class="primary" data-mobile-material="background">精选背景</button><button type="button" data-mobile-material="upload">上传素材</button></div><div class="mobile-richtext-note">手机端可替换已有媒体、设当前页背景；复杂拖拽和批量编排请使用桌面工作台。</div><div class="mobile-target-list">${rows.length?rows.map(({block,index})=>{const selected=state.selectedBlockIds.has(block.id),src=block.src||block.poster||'未选择媒体';return `<article class="mobile-target-card ${selected?'is-selected':''}"><div class="mobile-target-head"><div><strong>${escText(mobileBlockTitle(block,index))}</strong><small>${escText(src)}</small></div><button type="button" data-mobile-select-block="${escText(block.id||'')}">${selected?'已选':'定位'}</button></div><div class="mobile-target-actions"><button type="button" class="primary" data-mobile-replace-media="${escText(block.id||'')}">替换${block.type==='video'?'视频':'图片'}</button>${block.type==='image'?`<button type="button" data-mobile-adjust-image="${escText(block.id||'')}">裁切 / 焦点</button>`:`<button type="button" data-mobile-poster-video="${escText(block.id||'')}">更换封面</button>`}</div></article>`}).join(''):'<div class="mobile-richtext-note">当前页没有图片或视频。可用“精选背景”或“上传素材”开始；新增复杂媒体建议在桌面端完成。</div>'}</div></section>`;}
function renderMobileLayoutSheet(){state.layoutSuggestions=analyzeLayoutSuggestions(currentPage());const best=state.layoutSuggestions[0],page=currentPage(),pub=page?.publishing||{};return `<section class="mobile-sheet-section"><div class="mobile-section-label"><b>智能建议</b><span>基于当前内容指纹</span></div>${best?`<article class="mobile-recommendation-card"><strong>${escText(best.name)}</strong><p>${escText(best.reason||best.desc||'根据正文、媒体与页面密度推荐。')}</p><div class="mobile-recommendation-meta"><span>${best.recommendedPages||1} 页</span><span>${best.columns||1} 栏</span><span>${escText(best.readerMode||'标准阅读')}</span></div><button type="button" class="primary" data-mobile-apply-recommendation="${escText(best.recommendationId||'')}">一键应用推荐</button></article>`:'<div class="mobile-richtext-note">内容不足，暂时没有明确推荐。</div>'}</section><section class="mobile-sheet-section"><div class="mobile-section-label"><b>轻量版式</b><span>手机只做受约束调整</span></div><div class="mobile-preset-grid"><button type="button" data-mobile-layout-preset="single-focus"><b>单页聚焦</b><small>正文优先，减少装饰</small></button><button type="button" data-mobile-layout-preset="media-right"><b>左文右图</b><small>适合长文配图</small></button><button type="button" data-mobile-layout-preset="two-balanced"><b>均衡双栏</b><small>桌面出版双栏，手机自动单栏</small></button><button type="button" data-mobile-layout-preset="three-brief"><b>三栏速览</b><small>要点密集页面</small></button></div></section><section class="mobile-sheet-section"><div class="mobile-section-label"><b>出版参数</b><span>当前 ${Number(pub.columns||1)} 栏</span></div><div class="mobile-sheet-actions"><button type="button" data-mobile-columns="1">单栏</button><button type="button" data-mobile-columns="2">双栏</button><button type="button" data-mobile-columns="3">三栏</button><button type="button" data-mobile-balance>${pub.balanceColumns===false?'开启':'关闭'}栏平衡</button></div><div class="mobile-richtext-note">移动 Reader 会自动回退单栏；这些参数主要控制桌面 Web Reader 与 Print PDF。</div></section>`;}
function publicationMobileState(){const st=state.publicationStatus||{},findings=state.audit?flattenFindings(state.audit):[],blockers=findings.filter(x=>x.severity==='blocker').length;return {blockers,open:findings.length,canPublish:Boolean(st.canPublish)};}
function renderMobilePageSheet(){const page=currentPage(),snap=mobilePageSnapshot(page,state.page,state.issue?.pages?.length||0),health=visualHealthInfo(),flow=publicationMobileState();const pages=state.issue?.pages||[];return `<section class="mobile-sheet-section"><div class="mobile-section-label"><b>当前页面</b><span>${snap.pageNumber} / ${snap.total}</span></div><div class="mobile-page-metrics"><div><span>内容块</span><b>${snap.blocks}</b></div><div><span>文字</span><b>${snap.text}</b></div><div><span>媒体</span><b>${snap.media}</b></div></div><div class="mobile-sheet-actions"><button type="button" class="primary" data-mobile-insert-page>插入新页</button><button type="button" data-mobile-page-template>套用模板页</button><button type="button" data-mobile-material="background">页面背景</button></div><div class="mobile-richtext-note"><b>${escText(health.label)}</b><br>${escText(health.advice)}</div></section><section class="mobile-sheet-section"><div class="mobile-section-label"><b>页面导航</b><span>${pages.length} 页</span></div><div class="mobile-page-list">${pages.map((p,i)=>`<div class="mobile-page-row ${i===state.page?'active':''}"><span>${i+1}</span><div><strong>${escText(p.navTitle||p.title||`页面 ${i+1}`)}</strong><small>${escText(p.section||p.type||'article')}</small></div><button type="button" data-mobile-go-page="${i}">${i===state.page?'当前':'打开'}</button></div>`).join('')}</div></section><section class="mobile-sheet-section"><div class="mobile-section-label"><b>检查 · 校审 · 发布</b><span>低风险流程</span></div><div class="mobile-workflow-grid"><button type="button" class="mobile-workflow-card ${flow.blockers?'problem':''}" data-mobile-workflow="audit"><strong>查看问题</strong><em>${state.audit?`${flow.open} 项`:'未审计'}</em></button><button type="button" class="mobile-workflow-card" data-mobile-workflow="review"><strong>内部校审</strong><em>打开清单</em></button><button type="button" class="mobile-workflow-card ${flow.canPublish?'ready':''}" data-mobile-workflow="publish"><strong>发布中心</strong><em>${flow.canPublish?'可发布':'检查门禁'}</em></button></div></section>`;}
function renderMobileSheet(){if(!state.mobileStudioActive||!state.mobileSheetOpen)return;const title={text:['EDIT TEXT','文字'],media:['REPLACE MEDIA','图片 / 视频'],layout:['SMART LAYOUT','布局'],page:['PAGE / RELEASE','页面']}[state.mobileSheetTab]||['MOBILE STUDIO','编辑'];$('#mobileSheetEyebrow').textContent=title[0];$('#mobileSheetTitle').textContent=title[1];$('#mobileSheetSubtitle').textContent=state.mobileSheetTab==='text'?'改字优先在 Reader 原位完成；RichText 不会被纯文本覆盖。':state.mobileSheetTab==='media'?'可在 Reader 中选中图片/视频，再用浮动工具栏替换、裁切或切换比例。':state.mobileSheetTab==='layout'?'使用受约束版式和智能推荐；画布模式下也可像 PPT 一样拖动、调宽和对齐。':'页面导航、问题检查、校审与发布集中在这里。';const body=$('#mobileSheetBody');if(!body)return;body.innerHTML=state.mobileSheetTab==='text'?renderMobileTextSheet():state.mobileSheetTab==='media'?renderMobileMediaSheet():state.mobileSheetTab==='layout'?renderMobileLayoutSheet():renderMobilePageSheet();for(const b of document.querySelectorAll('[data-mobile-tab]'))b.classList.toggle('active',b.dataset.mobileTab===state.mobileSheetTab);}
function openMobileSheet(tab='text'){if(!state.mobileStudioActive)return;state.mobileSheetTab=['text','media','layout','page'].includes(tab)?tab:'text';state.mobileSheetOpen=true;document.body.classList.add('mobile-sheet-open');const sheet=$('#mobileBottomSheet'),backdrop=$('#mobileSheetBackdrop');sheet?.classList.add('is-open');sheet?.setAttribute('aria-hidden','false');if(backdrop){backdrop.hidden=false;requestAnimationFrame(()=>backdrop.classList.add('is-open'));}renderMobileSheet();}
function closeMobileSheet({silent=false}={}){state.mobileSheetOpen=false;document.body.classList.remove('mobile-sheet-open');const sheet=$('#mobileBottomSheet'),backdrop=$('#mobileSheetBackdrop');sheet?.classList.remove('is-open');sheet?.setAttribute('aria-hidden','true');if(backdrop){backdrop.classList.remove('is-open');setTimeout(()=>{if(!state.mobileSheetOpen)backdrop.hidden=true},190);}for(const b of document.querySelectorAll('[data-mobile-tab]'))b.classList.remove('active');if(!silent)requestAnimationFrame(fitReaderPreview);}
function syncMobileCanvasToggle(){const canvasToggle=$('#mobileCanvasMode');if(!canvasToggle)return;canvasToggle.setAttribute('aria-pressed',String(state.canvasMode));canvasToggle.classList.toggle('active',state.canvasMode);const label=canvasToggle.querySelector('b');if(label)label.textContent=state.canvasMode?'选中':'画布';canvasToggle.title=state.canvasMode?'画布模式已开启：单击选中，双击文字编辑':'开启 PPT 式画布编辑';}
function renderMobileStudio(){syncMobileCanvasToggle();if(!state.mobileStudioActive||!state.issue)return;const page=currentPage(),snap=mobilePageSnapshot(page,state.page,state.issue.pages.length),health=visualHealthInfo();if($('#mobileStudioPageLabel'))$('#mobileStudioPageLabel').textContent=`P${snap.pageNumber}`;if($('#mobileStudioPageTitle'))$('#mobileStudioPageTitle').textContent=snap.title;if($('#mobileEditPage'))$('#mobileEditPage').textContent=`P${snap.pageNumber}`;const hb=$('#mobileStudioHealth');if(hb){hb.textContent=health.label.replace(/^版面\s*/,'');hb.className=`mobile-health-pill ${health.state==='good'?'good':health.state==='dense'?'dense':health.state==='warn'?'warn':''}`;}if($('#mobilePrevPage'))$('#mobilePrevPage').disabled=state.page<=0;if($('#mobileNextPage'))$('#mobileNextPage').disabled=state.page>=state.issue.pages.length-1;if($('#mobileStudioSave')){$('#mobileStudioSave').textContent=state.dirty?'保存*':'已保存';$('#mobileStudioSave').disabled=!state.dirty;}mobileStudioReaderMessage('mobile-studio-mode',{enabled:true});if(state.mobileSheetOpen)renderMobileSheet();}
function mobileSelectBlockById(id){const i=findBlockIndexById(currentPage(),id);if(i<0)return false;setBlockSelectionByIds([id]);syncCanvasSelectionToReader();renderMobileStudio();return true;}
function mobileEditBlockInReader(id){const i=findBlockIndexById(currentPage(),id);if(i<0)return toast('未找到对应内容块');mobileSelectBlockById(id);closeMobileSheet({silent:true});setTimeout(()=>{mobileStudioReaderMessage('mobile-edit-block',{blockIndex:i,blockId:id});},120);}
function mobileSaveText(id,field,value){const i=findBlockIndexById(currentPage(),id),block=currentPage()?.blocks?.[i];if(i<0||!block||block.richText)return false;const safe=String(value??'').slice(0,12000);dispatchStudioCommand('block:update',{blockId:id,changes:{[field]:safe}},{historyGroup:'mobile-text',forceHistory:true,preview:false});renderPreview();pushReaderPreview().catch(()=>{});renderMobileStudio();toast('文字已更新');return true;}
function mobileApplyPreset(id){const recs=analyzeLayoutSuggestions(currentPage());state.layoutSuggestions=recs;const found=recs.find(x=>x.id===id);if(found?.recommendationId)return applySmartLayoutRecommendation(found.recommendationId);const page=currentPage(),before=flattenLayoutContent(page?.blocks||[]);if(!page||!LAYOUT_PRESET_MAP[id]||!before.length)return toast('当前页没有可套版内容');page.blocks=buildLayoutFromPreset(id,page.blocks||[]);markDirty({historyGroup:`mobile-layout:${id}`,forceHistory:true});syncJsonFromPage();renderBlockList();renderPreview();pushReaderPreview().catch(()=>{});renderMobileStudio();toast(`已应用：${LAYOUT_PRESET_MAP[id].name}`);}
function mobileSetColumns(columns){const page=currentPage();if(!page)return;page.publishing={...(page.publishing||{}),columns:Math.max(1,Math.min(3,Number(columns)||1))};markDirty({historyGroup:'mobile-publishing',forceHistory:true});renderPreview();pushReaderPreview().catch(()=>{});renderMobileStudio();}
async function openMobileMaterialLibrary(mode='background'){closeMobileSheet({silent:true});await openMediaDialog(null);if(mode==='upload')return openMaterialStart('upload');openMaterialStart('background');}
function bindMobileStudio(){const tab=e=>{const b=e.target.closest('[data-mobile-tab]');if(b)openMobileSheet(b.dataset.mobileTab);};$('#mobileStudioDock')?.addEventListener('click',tab);$('#mobileSheetClose')?.addEventListener('click',()=>closeMobileSheet());$('#mobileSheetBackdrop')?.addEventListener('click',()=>closeMobileSheet());$('#mobileEditSummary')?.addEventListener('click',()=>openMobileSheet('page'));$('#mobileStudioPagePicker')?.addEventListener('click',()=>openMobileSheet('page'));$('#mobileStudioHealth')?.addEventListener('click',openVisualHealth);$('#mobilePrevPage')?.addEventListener('click',()=>goToPage(state.page-1));$('#mobileNextPage')?.addEventListener('click',()=>goToPage(state.page+1));$('#mobileStudioSave')?.addEventListener('click',()=>state.dirty?saveIssue():toast('当前内容已保存'));$('#mobileStudioBack')?.addEventListener('click',()=>{if(state.dirty&&!confirm('当前有未保存修改，仍返回制作中心？'))return;location.href=`${APP_BASE}?issue=${encodeURIComponent(state.issue?.id||'')}&page=${state.page+1}`;});$('#mobileBottomSheet')?.addEventListener('click',e=>{const select=e.target.closest('[data-mobile-select-block]');if(select)return mobileSelectBlockById(select.dataset.mobileSelectBlock);const edit=e.target.closest('[data-mobile-edit-reader]');if(edit)return mobileEditBlockInReader(edit.dataset.mobileEditReader);const save=e.target.closest('[data-mobile-save-text]');if(save){const card=save.closest('[data-mobile-block-id]'),ta=card?.querySelector('[data-mobile-quick-text]');if(ta)return mobileSaveText(save.dataset.mobileSaveText,ta.dataset.mobileField,ta.value);}const repl=e.target.closest('[data-mobile-replace-media]');if(repl){const id=repl.dataset.mobileReplaceMedia,i=findBlockIndexById(currentPage(),id),block=currentPage()?.blocks?.[i];if(block){mobileSelectBlockById(id);return openMediaDialog({kind:block.type==='video'?'video':'image',blockIndex:i,field:'src'});}}const adj=e.target.closest('[data-mobile-adjust-image]');if(adj){const i=findBlockIndexById(currentPage(),adj.dataset.mobileAdjustImage);if(i>=0)return openImageAdjust(i);}const poster=e.target.closest('[data-mobile-poster-video]');if(poster){const i=findBlockIndexById(currentPage(),poster.dataset.mobilePosterVideo);if(i>=0)return openMediaDialog({kind:'image',blockIndex:i,field:'poster'});}const rec=e.target.closest('[data-mobile-apply-recommendation]');if(rec){state.layoutSuggestions=analyzeLayoutSuggestions(currentPage());applySmartLayoutRecommendation(rec.dataset.mobileApplyRecommendation);return renderMobileSheet();}const preset=e.target.closest('[data-mobile-layout-preset]');if(preset){mobileApplyPreset(preset.dataset.mobileLayoutPreset);return renderMobileSheet();}const cols=e.target.closest('[data-mobile-columns]');if(cols){mobileSetColumns(cols.dataset.mobileColumns);return renderMobileSheet();}if(e.target.closest('[data-mobile-balance]')){const page=currentPage();page.publishing={...(page.publishing||{}),balanceColumns:page.publishing?.balanceColumns===false};markDirty({historyGroup:'mobile-publishing',forceHistory:true});renderPreview();pushReaderPreview().catch(()=>{});return renderMobileSheet();}const go=e.target.closest('[data-mobile-go-page]');if(go){goToPage(Number(go.dataset.mobileGoPage));return renderMobileSheet();}const wf=e.target.closest('[data-mobile-workflow]');if(wf){closeMobileSheet({silent:true});if(wf.dataset.mobileWorkflow==='audit'){if(state.audit)return $('#auditCard')?.classList.remove('hidden'),toast('已打开最近审计；需要刷新可运行日常审计');return runAudit(false);}if(wf.dataset.mobileWorkflow==='review')return openReviewWorkspace();if(wf.dataset.mobileWorkflow==='publish')return openPublicationCenter();}});window.addEventListener('resize',()=>setMobileStudioMode(),{passive:true});window.visualViewport?.addEventListener('resize',()=>{if(state.mobileStudioActive)requestAnimationFrame(fitReaderPreview)},{passive:true});}
 bindMobileStudio();
 $('#mobileCanvasMode')?.addEventListener('click',()=>{if(!state.issue)return;setCanvasMode(!state.canvasMode);renderMobileStudio();});
// Keep phone authoring deliberately small: route material, template, and check actions
// through the same desktop-capable dialogs instead of duplicating a dense canvas UI.
$('#mobileBottomSheet')?.addEventListener('click',e=>{const insert=e.target.closest('[data-mobile-insert-page]');if(insert){e.preventDefault();e.stopImmediatePropagation();closeMobileSheet({silent:true});insertBlankPage();return;}const material=e.target.closest('[data-mobile-material]');if(material){e.preventDefault();e.stopImmediatePropagation();void openMobileMaterialLibrary(material.dataset.mobileMaterial);return;}const template=e.target.closest('[data-mobile-page-template]');if(template){e.preventDefault();e.stopImmediatePropagation();closeMobileSheet({silent:true});openPageTemplateDialog('replace');return;}const workflow=e.target.closest('[data-mobile-workflow="audit"]');if(workflow){e.preventDefault();e.stopImmediatePropagation();closeMobileSheet({silent:true});openWorkspaceAuditDialog();}},true);
function balanceCurrentPageSpacing(){const x=visualHealthInfo();if(x.state==='unknown')return toast('Reader 尚未完成当前页测量');const blocks=currentPage()?.blocks||[];if(!blocks.length)return toast('当前页没有内容块');const map={compact:{padding:4,margin:4},standard:{padding:8,margin:8},relaxed:{padding:14,margin:14}},d=map[x.mode];for(const block of blocks){block.design={...(block.design||{}),...d};}markDirty({preview:false,historyGroup:'visual-health-spacing',forceHistory:true});syncJsonFromPage();renderBlockList();renderPreview();pushReaderPreview().catch(()=>{});toast(`已按版面建议应用${x.mode==='compact'?'紧凑':x.mode==='relaxed'?'宽松':'标准'}间距`);}
function managerBlockNodes(blocks=[]){let n=0,media=0;const outline=[];const walk=(arr)=>{for(const b of arr||[]){n++;if(['image','video'].includes(b?.type))media++;if(outline.length<7){const text=String(b?.title||b?.text||b?.caption||b?.case||b?.warning||BLOCK_NAMES[b?.type]||b?.type||'内容块').replace(/\s+/g,' ').trim();outline.push({type:b?.type||'block',text:text.slice(0,72)||'内容块'});}if(b?.type==='container')for(const c of b.columns||[])walk(c.blocks||[]);}};walk(blocks);return {nodes:n,media,outline};}
function managerPreviewFrame(){return WORKSPACE_MODE?null:$('#managerPagePreview');}
function clearManagerPageRequest(requestId=null){const pending=state.managerPendingPageRequest;if(!pending)return;if(requestId&&pending.requestId!==requestId)return;state.managerPendingPageRequest=null;clearTimeout(state.managerPageVerifyTimer);state.managerPageVerifyTimer=0;}
function sendManagerPreviewPage({reliable=true,reuseRequest=false}={}){const frame=managerPreviewFrame(),page=currentPage();if(!frame||!page)return false;let pending=state.managerPendingPageRequest;const target=state.page,pageId=page.id||null;if(!reuseRequest||!pending||pending.target!==target||pending.pageId!==pageId){pending={requestId:`manager-page-${++state.managerPageRequestSeq}-${Date.now().toString(36)}`,target,pageId,attempts:0};state.managerPendingPageRequest=pending;}pending.attempts++;frame.dataset.requestedPageIndex=String(target);if(pageId)frame.dataset.pageId=String(pageId);if(state.managerPreviewReady||frame.contentWindow){try{frame.contentWindow?.postMessage({source:'v3-studio',type:'page',issueId:state.issue?.id||null,pageIndex:target,pageId,requestId:pending.requestId},'*');}catch{}}else if(!frame.getAttribute('src'))ensureManagerPreviewFrame();if(reliable){clearTimeout(state.managerPageVerifyTimer);state.managerPageVerifyTimer=setTimeout(()=>{const current=state.managerPendingPageRequest;if(!current||current.requestId!==pending.requestId)return;if(current.attempts>=8){clearManagerPageRequest(current.requestId);frame.dataset.pageSyncState='timeout';return;}sendManagerPreviewPage({reliable:true,reuseRequest:true});},Math.min(900,180+Math.min(pending.attempts,9)*80));}return pending.requestId;}
function syncManagerPreviewIssue(){const frame=managerPreviewFrame(),page=currentPage();if(!frame||!state.issue||!state.managerPreviewReady)return false;try{frame.contentWindow?.postMessage({source:'v3-studio',type:'issue',issue:cloneData(state.issue),pageIndex:state.page,pageId:page?.id||null},'*');return true;}catch{return false;}}
function ensureManagerPreviewFrame(force=false){const frame=managerPreviewFrame();if(!frame||!state.issue)return;const issueId=String(state.issue.id),current=frame.dataset.issueId||'';if(force||current!==issueId||!frame.getAttribute('src')){state.managerPreviewReady=false;state.managerPreviewIssueId=issueId;frame.dataset.issueId=issueId;const reload=force?`&reload=${++state.previewFrameReloadSeq}`:'';frame.src=`${appUrl(`/live-preview/${encodeURIComponent(issueId)}/?studio=1&embed=1&dashboard=1&page=${state.page+1}`)}&v=${encodeURIComponent(readerRuntimeCacheKey())}${reload}`;return;}sendManagerPreviewPage();}
function updateManagerDashboard(){const root=$('#managerWorkspaceLauncher'),p=currentPage();if(!root||WORKSPACE_MODE)return;if(!state.issue||!p)return;const x=managerBlockNodes(p.blocks||[]),health=visualHealthInfo(),recommendations=analyzeLayoutSuggestions(p),best=recommendations[0];if($('#managerWorkspaceTitle'))$('#managerWorkspaceTitle').textContent=`第 ${state.page+1} 页 · ${p.navTitle||p.title||'页面'}`;if($('#managerWorkspaceSummary'))$('#managerWorkspaceSummary').textContent=`${p.section||'未归类'} · ${p.type||'article'} · ${x.nodes} 个内容节点；制作中心只做总览与管理。`;const ht=$('#managerHealthTitle'),hp=$('#managerHealthText');if(ht)ht.textContent=health.state==='unknown'?'等待 Reader 测量':health.label;if(hp)hp.textContent=health.state==='unknown'?'当前页缩略图已加载；进入工作区后可获得更精确的版面测量。':health.advice;const rt=$('#managerLayoutRecommendationTitle'),rp=$('#managerLayoutRecommendationText');if(rt)rt.textContent=best?`推荐：${best.name}`:'暂无明确版式推荐';if(rp)rp.textContent=best?`${best.recommendedPages||1} 页 · ${best.columns||1} 栏 · ${best.reason||best.desc||''}`:'当前页内容不足，继续编辑后会自动重新分析。';const metrics=$('#managerPageMetrics');if(metrics)metrics.innerHTML=`<div><span>页码</span><b>${state.page+1}/${state.issue.pages.length}</b></div><div><span>内容块</span><b>${x.nodes}</b></div><div><span>媒体</span><b>${x.media}</b></div><div><span>页面类型</span><b>${escText(p.type||'article')}</b></div>`;const outline=$('#managerPageOutline');if(outline)outline.innerHTML=x.outline.map((r,i)=>`<div class="manager-outline-row"><b>${String(i+1).padStart(2,'0')}</b><span>${escText(r.text)}</span></div>`).join('')||'<div class="manager-outline-row"><span>当前页暂无内容块</span></div>';ensureManagerPreviewFrame();}
const updateManagerDashboardOriginal=updateManagerDashboard;
updateManagerDashboard=function(){updateManagerDashboardOriginal();const summary=$('#managerWorkspaceSummary');if(summary&&state.issue)summary.textContent=`${currentPage()?.section||'未归类'} · ${currentPage()?.type||'article'} · ${managerBlockNodes(currentPage()?.blocks||[]).nodes} 个内容节点`};
$('#managerLayoutRecommendationOpen')?.addEventListener('click',()=>{if(requireIssue('请先选择可编辑期刊'))openLayoutLab();});
$('#quickWidth')?.addEventListener('change',e=>{if(e.target.value){applyQuickDesign({width:Number(e.target.value)},{message:'已调整块宽度'});e.target.value='';}});
$('#quickBlockAlign')?.addEventListener('change',e=>{if(e.target.value){applyQuickDesign({alignSelf:e.target.value},{message:'已调整块位置'});e.target.value='';}});
$('#batchBlocksUp')?.addEventListener('click',()=>moveSelectedBlocks(-1));$('#batchBlocksDown')?.addEventListener('click',()=>moveSelectedBlocks(1));$('#batchBlocksDuplicate')?.addEventListener('click',duplicateSelectedBlocks);$('#batchBlocksDelete')?.addEventListener('click',deleteSelectedBlocks);$('#quickAddLayout')?.addEventListener('click',()=>addBlock('container'));$('#quickAddBlock')?.addEventListener('click',openBlockDialog);$('#quickAdvancedDesign')?.addEventListener('click',quickAdvancedDesign);
try{state.canvasMode=localStorage.getItem('v3StudioCanvasMode')==='1'}catch{};setCanvasMode(state.canvasMode,{silent:true});

const splitter=$('#editorPreviewSplitter'); if(splitter){let dragging=false;const move=e=>{if(!dragging||window.innerWidth<1261)return;const grid=$('#visualEditor'),r=grid.getBoundingClientRect();if(!r.width)return;setWorkspaceSplit(((e.clientX-r.left)/r.width)*100,{remember:false,preset:'custom'});splitter.setAttribute('aria-valuenow',String(state.workspaceSplit));};splitter.addEventListener('pointerdown',e=>{if(window.innerWidth<1261)return;dragging=true;splitter.classList.add('is-dragging');splitter.setPointerCapture?.(e.pointerId);e.preventDefault();});splitter.addEventListener('pointermove',move);const end=()=>{if(!dragging)return;dragging=false;splitter.classList.remove('is-dragging');try{localStorage.setItem('v3StudioWorkspaceSplit',String(state.workspaceSplit));localStorage.setItem('v3StudioWorkspaceLayout','custom')}catch{};requestAnimationFrame(fitReaderPreview);};splitter.addEventListener('pointerup',end);splitter.addEventListener('pointercancel',end);splitter.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home'].includes(e.key))return;e.preventDefault();if(e.key==='Home')setWorkspaceLayoutPreset('balanced');else setWorkspaceSplit(state.workspaceSplit+(e.key==='ArrowRight'?5:-5),{preset:'custom'});});}

for (const id of ['pageNav','pageType','pageSection','pageKicker','pageTitle']) {
  const field=$('#'+id);if(!field)continue;
  field.addEventListener(id==='pageType'?'change':'input',()=>{
    syncPageMeta();markInlineInputDirty(field,{group:'page-meta'});
    if(id==='pageNav'||id==='pageTitle'){updateCurrentPageListEntry();$('#pageHeading').textContent=`第 ${state.page+1} 页 · ${currentPage().navTitle||currentPage().title||''}`;}
    updatePageMetaSummary();
  });
  field.addEventListener('change',()=>finalizeInlineInput(field,{preview:true}));
}
$('#pageBlocks').addEventListener('input', () => { updateJsonStats(); if (syncJsonToPage({ notify:false })) markDirty({historyGroup:'json'}); });
$('#pageSearch').addEventListener('input',e=>{state.pageSearch=e.target.value;renderPages();});
$('#selectFilteredPages').onclick=()=>{const shown=filteredPageIndices();if(!shown.length)return;const all=shown.every(i=>state.selectedPages.has(i));for(const i of shown)all?state.selectedPages.delete(i):state.selectedPages.add(i);renderPages();};
$('#clearPageSelection').onclick=()=>{state.selectedPages.clear();renderPages();};
function pageMoveAllowed(from,to){const pages=state.issue?.pages||[];if(to<0||to>=pages.length)return false;const moving=pages[from];if(moving?.type==='cover'||moving?.type==='closing')return false;if(pages[0]?.type==='cover'&&to===0)return false;if(pages.at(-1)?.type==='closing'&&to===pages.length-1)return false;return true;}
function deletePageIndices(indices,{confirmMessage='',historyGroup='page-delete'}={}){if(!state.issue||!commitPage())return false;ensureIssueIdentity(state.issue);const pages=state.issue.pages||[],requested=[...new Set((indices||[]).map(Number))].filter(i=>Number.isInteger(i)&&i>=0&&i<pages.length),removable=requested.filter(i=>!['cover','closing'].includes(pages[i]?.type)).sort((a,b)=>b-a);if(!removable.length)return toast('封面和尾页不可删除'),false;if(pages.length-removable.length<1)return toast('至少保留 1 页'),false;if(confirmMessage&&!confirm(confirmMessage))return false;const currentId=pages[state.page]?.id,oldPage=state.page;for(const i of removable)pages.splice(i,1);state.selectedPages.clear();const kept=currentId?pages.findIndex(p=>p?.id===currentId):-1;state.page=Math.max(0,Math.min(kept>=0?kept:oldPage,pages.length-1));state.readerTargetPage=state.page;clearReaderPageRequest();markDirty({historyGroup,forceHistory:true});renderPages();renderPage();pushReaderPreview({reload:true}).catch(()=>{});toast(`已删除 ${removable.length} 页，Reader 正在重新加载`);return true;}
function batchMovePages(direction){if(!state.selectedPages.size||!commitPage())return;const pages=state.issue.pages,selected=new Set(state.selectedPages),order=[...selected].sort((a,b)=>direction<0?a-b:b-a);let moved=0;for(const i of order){const to=i+direction;if(!pageMoveAllowed(i,to)||selected.has(to))continue;[pages[i],pages[to]]=[pages[to],pages[i]];selected.delete(i);selected.add(to);moved++;}if(!moved)return toast('所选页面已到边界，或包含不可移动的封面/尾页');state.selectedPages=selected;state.page=Math.max(0,Math.min(pages.length-1,state.page+([...selected].includes(state.page+direction)?direction:0)));markDirty({historyGroup:'batch-move',forceHistory:true});renderPages();renderPage();toast(`已批量移动 ${moved} 页`);}
$('#batchMoveUp').onclick=()=>batchMovePages(-1);$('#batchMoveDown').onclick=()=>batchMovePages(1);
$('#batchSetSection').onclick=()=>{if(!state.selectedPages.size||!commitPage())return;const value=prompt('将所选正文页的“栏目归属”统一设置为：','');if(value==null)return;if(value.length>120)return toast('栏目归属不能超过 120 个字符');let changed=0;for(const i of [...state.selectedPages]){const p=state.issue.pages[i];if(!p||['cover','toc','closing'].includes(p.type))continue;p.section=value.trim();changed++;}if(!changed)return toast('所选页面均为结构页，没有可修改的栏目');markDirty({historyGroup:'batch-section',forceHistory:true});renderPages();renderPage();toast(`已更新 ${changed} 页栏目归属`);};
$('#batchDeletePages').onclick=()=>deletePageIndices([...state.selectedPages],{historyGroup:'batch-delete',confirmMessage:`确定删除所选页面？封面/尾页会自动跳过。`});

function defaultBlock(type) {
  const firstArticle = Object.keys(state.issue?.articles || {})[0] || '';
  switch (type) {
    case 'paragraph': return { type, style:'body', text:'请填写正文内容。' };
    case 'table': return {type,rows:[['表头 1','表头 2'],['内容 1','内容 2']],headerRows:1,caption:'',tableStyle:'plain',density:'comfortable',align:'left',minWidth:'auto'};
    case 'textFlow': return { type, flowId:'article-main', text:'请填写需要跨页流动的正文内容。', flow:{capacity:680,lineChars:28,orphanLines:2,widowLines:2}, publishing:{dropCap:false} };
    case 'pullQuote': return { type, label:'重点摘录', text:'请填写需要突出展示的重点引语。', attribution:'' , publishing:{spanAll:true,role:'pullQuote'} };
    case 'sidebar': return { type, title:'延伸阅读', text:'请填写侧栏补充内容。', publishing:{role:'sidebar',avoidBreak:true} };
    case 'sectionHeading': return { type, level:3, text:'分节标题', publishing:{spanAll:true,keepWithNext:true} };
    case 'quote': return { type, title:'', text:'请填写引言或提示内容。' };
    case 'chips': return { type, items:[{ text:'标签', tone:'' }] };
    case 'cardline': return { type, badge:'1', title:'要点标题', text:'请填写说明内容。', tone:'default' };
    case 'casePair': return { type, case:'请填写案例内容。', warning:'请填写警示内容。' };
    case 'toc': return { type, items:[{ number:'01', title:'栏目', subtitle:'栏目说明', page:1 }] };
    case 'articleLink': return { type, articleId:firstArticle, title:'' };
    case 'video': return { type, src:'assets/video/video.mp4', poster:'', caption:'视频说明' };
    case 'image': return { type, src:'assets/image/image.jpg', alt:'图片内容说明', caption:'', frameRatio:'auto', fit:'contain', positionX:50, positionY:50 };
    case 'coverMeta': return { type, text:`离退休干部电子期刊 · ${state.issue?.label || ''}` };
    case 'coverSections': return { type, items:['时政要闻','理论学习'] };
    case 'blessing': return { type, text:'祝愿各位老干部身体健康、阖家幸福！' };
    case 'producer': return { type, text: state.issue?.publisher ? `${state.issue.publisher}制作` : '请填写制作单位' };
    case 'cards': return { type, items:[{ title:'卡片标题', text:'卡片内容' }] };
    case 'container': return { type, layout:'two-equal', gap:'md', align:'start', mobile:'stack', columns:[{blocks:[{type:'paragraph',style:'body',text:'左栏内容'}]},{blocks:[{type:'paragraph',style:'body',text:'右栏内容'}]}] };
    default: return { type:'paragraph', style:'body', text:'' };
  }
}
function blockSummary(block) {
  if (!block) return '';
  if (['paragraph','quote','textFlow','pullQuote','sidebar','sectionHeading','blessing','producer','coverMeta'].includes(block.type)) return block.text || block.title || block.flowId || '';
  if (block.type === 'cardline') return `${block.badge || ''} ${block.title || ''}`.trim();
  if (block.type === 'casePair') return block.case || '';
  if (block.type === 'image' || block.type === 'video') return block.caption || block.src || '';
  if (block.type === 'table') return `${(block.rows||[]).length} 行 × ${Math.max(0,...(block.rows||[]).map(r=>(r||[]).length))} 列${block.caption?` · ${block.caption}`:''}`;
  if (block.type === 'articleLink') return block.title || state.issue?.articles?.[block.articleId]?.linkTitle || state.issue?.articles?.[block.articleId]?.title || block.articleId || '未选择文章';
  if (block.type === 'container') return `${({single:'单栏','two-equal':'双栏 5:5','two-40-60':'双栏 4:6','two-60-40':'双栏 6:4','three-equal':'三栏','media-left':'图左文右','media-right':'文左图右'})[block.layout]||'布局容器'} · ${(block.columns||[]).reduce((n,c)=>n+(c.blocks?.length||0),0)} 个子块`;
  if (Array.isArray(block.items)) return `${block.items.length} 项`;
  return '';
}
function inputField(index, field, label, value='', { full=false, textarea=false, max=6000, type='text', options=null }={}) {
  const cls = full ? 'full' : ''; const attrs = `class="block-field" data-block="${index}" data-field="${escText(field)}"`;
  let control;
  if (options) control = `<select ${attrs}>${options.map(([v,t]) => `<option value="${escText(v)}"${String(value)===String(v)?' selected':''}>${escText(t)}</option>`).join('')}</select>`;
  else if (textarea) control = `<textarea ${attrs} maxlength="${max}">${escText(value)}</textarea>`;
  else control = `<input ${attrs} type="${type}" maxlength="${max}" value="${escText(value)}">`;
  return `<label class="${cls}">${escText(label)}${control}</label>`;
}
function arrayEditor(index, block, kind) {
  const items = Array.isArray(block.items) ? block.items : [];
  if (kind === 'chips') return `<div class="array-editor"><div class="array-head"><b>标签</b><button data-action="array-add" data-block="${index}" data-array-kind="chips">＋ 标签</button></div>${items.map((it,j)=>`<div class="array-row chip-row"><input class="block-array-field" data-block="${index}" data-item="${j}" data-key="text" maxlength="120" value="${escText(it?.text || '')}" placeholder="标签文字"><select class="block-array-field" data-block="${index}" data-item="${j}" data-key="tone"><option value=""${!it?.tone?' selected':''}>普通</option><option value="warn"${it?.tone==='warn'?' selected':''}>提醒</option></select><button data-action="array-remove" data-block="${index}" data-item="${j}" title="删除">×</button></div>`).join('')}</div>`;
  if (kind === 'toc') return `<div class="array-editor"><div class="array-head"><b>目录条目</b><button data-action="array-add" data-block="${index}" data-array-kind="toc">＋ 条目</button></div>${items.map((it,j)=>`<div class="array-row multi"><input class="block-array-field" data-block="${index}" data-item="${j}" data-key="number" maxlength="12" value="${escText(it?.number || '')}" placeholder="序号"><input class="block-array-field" data-block="${index}" data-item="${j}" data-key="title" maxlength="120" value="${escText(it?.title || '')}" placeholder="栏目"><input class="block-array-field" data-block="${index}" data-item="${j}" data-key="subtitle" maxlength="160" value="${escText(it?.subtitle || '')}" placeholder="说明"><input class="block-array-field" data-block="${index}" data-item="${j}" data-key="page" type="number" min="1" max="200" value="${Number(it?.page)||1}" title="跳转页"><button data-action="array-remove" data-block="${index}" data-item="${j}" title="删除">×</button></div>`).join('')}</div>`;
  if (kind === 'strings') return `<div class="array-editor"><div class="array-head"><b>栏目标签</b><button data-action="array-add" data-block="${index}" data-array-kind="strings">＋ 标签</button></div>${items.map((it,j)=>`<div class="array-row"><input class="block-array-string" data-block="${index}" data-item="${j}" maxlength="120" value="${escText(it || '')}"><button data-action="array-remove" data-block="${index}" data-item="${j}" title="删除">×</button></div>`).join('')}</div>`;
  if (kind === 'cards') return `<div class="array-editor"><div class="array-head"><b>卡片</b><button data-action="array-add" data-block="${index}" data-array-kind="cards">＋ 卡片</button></div>${items.map((it,j)=>`<div class="array-row card-row"><input class="block-array-field" data-block="${index}" data-item="${j}" data-key="title" maxlength="120" value="${escText(it?.title || '')}" placeholder="标题"><textarea class="block-array-field" data-block="${index}" data-item="${j}" data-key="text" maxlength="5000" placeholder="正文">${escText(it?.text || '')}</textarea><button data-action="array-remove" data-block="${index}" data-item="${j}" title="删除">×</button></div>`).join('')}</div>`;
  return '';
}
function mediaSourceField(index,kind,label,value='',field='src',buttonLabel='选择资源') { return `<div class="media-source-field full"><label>${escText(label)}<input class="block-field" data-block="${index}" data-field="${escText(field)}" maxlength="500" value="${escText(value)}"></label><button type="button" data-action="media-pick" data-kind="${kind}" data-field="${escText(field)}" data-block="${index}">${escText(buttonLabel)}</button></div>`; }
const CONTAINER_LAYOUTS=[['single','单栏'],['two-equal','双栏 5:5'],['two-40-60','双栏 4:6'],['two-60-40','双栏 6:4'],['three-equal','三栏'],['media-left','图左文右'],['media-right','文左图右']];
const CONTAINER_CHILD_TYPES=[['paragraph','正文'],['quote','引言'],['cardline','要点卡片'],['casePair','案例警示'],['articleLink','文章链接'],['image','图片'],['video','视频'],['blessing','强调文字']];
function containerColumnCount(layout){return layout==='single'?1:layout==='three-equal'?3:2;}
function ensureContainerColumns(block,newLayout=block.layout||'two-equal'){
  block.columns=Array.isArray(block.columns)?block.columns:[];const need=containerColumnCount(newLayout);while(block.columns.length<need)block.columns.push({blocks:[]});
  if(block.columns.length>need){const tail=block.columns.splice(need);block.columns[need-1].blocks ||= [];for(const col of tail)block.columns[need-1].blocks.push(...(col.blocks||[]));}
  block.columns.forEach(c=>{if(!Array.isArray(c.blocks))c.blocks=[]});block.layout=newLayout;return block;
}
function containerChildInput(index,column,child,field,label,value='',{textarea=false,options=null,max=8000}={}){
  const attrs=`class="container-child-field" data-block="${index}" data-column="${column}" data-child="${child}" data-field="${escText(field)}"`;
  const control=options?`<select ${attrs}>${options.map(([v,t])=>`<option value="${escText(v)}"${String(v)===String(value)?' selected':''}>${escText(t)}</option>`).join('')}</select>`:textarea?`<textarea ${attrs} maxlength="${max}">${escText(value)}</textarea>`:`<input ${attrs} maxlength="${max}" value="${escText(value)}">`;
  return `<label>${escText(label)}${control}</label>`;
}
function renderContainerChildFields(child,index,ci,bi){
  switch(child.type){
    case 'paragraph':return containerChildInput(index,ci,bi,'style','样式',child.style||'body',{options:[['body','正文'],['small','较小'],['lead','导语'],['subhead','小标题']]})+containerChildInput(index,ci,bi,'text','正文',child.text||'',{textarea:true,max:12000});
    case 'quote':return containerChildInput(index,ci,bi,'title','标题',child.title||'')+containerChildInput(index,ci,bi,'text','引言',child.text||'',{textarea:true});
    case 'cardline':return containerChildInput(index,ci,bi,'badge','徽标',child.badge||'1')+containerChildInput(index,ci,bi,'tone','色调',child.tone||'default',{options:[['default','红色'],['green','绿色']]})+containerChildInput(index,ci,bi,'title','标题',child.title||'')+containerChildInput(index,ci,bi,'text','正文',child.text||'',{textarea:true});
     case 'casePair':return containerChildInput(index,ci,bi,'case','案例',child.case||'',{textarea:true})+containerChildInput(index,ci,bi,'warning','警示',child.warning||'',{textarea:true});
     case 'articleLink':{const ids=Object.keys(state.issue?.articles||{});const opts=[['','请选择文章'],...ids.map(id=>[id,`${id} · ${state.issue.articles[id]?.title||''}`])];const article=state.issue?.articles?.[child.articleId]||{};return containerChildInput(index,ci,bi,'articleId','链接文章',child.articleId||'',{options:opts})+containerChildInput(index,ci,bi,'title','链接显示文字',child.title||article.linkTitle||article.title||'查看链接内容',{max:200})+(!ids.length?'<div class="hint">当前文章库为空，请先添加文章定义。</div>':'');}
    case 'image':return `<div class="container-media-source"><label>图片路径<input class="container-child-field" data-block="${index}" data-column="${ci}" data-child="${bi}" data-field="src" maxlength="500" value="${escText(child.src||'')}"></label><button type="button" data-action="container-media-pick" data-kind="image" data-field="src" data-block="${index}" data-column="${ci}" data-child="${bi}">选择图片</button></div>`+containerChildInput(index,ci,bi,'alt','替代文字',child.alt||'')+containerChildInput(index,ci,bi,'caption','图注',child.caption||'')+containerChildInput(index,ci,bi,'frameRatio','画框',child.frameRatio||'auto',{options:[['auto','自动'],['16:9','16:9'],['4:3','4:3'],['3:2','3:2'],['1:1','1:1']]})+containerChildInput(index,ci,bi,'fit','填充',child.fit||'contain',{options:[['contain','完整显示'],['cover','裁切填满']]});
    case 'video':return `<div class="container-media-source"><label>视频路径<input class="container-child-field" data-block="${index}" data-column="${ci}" data-child="${bi}" data-field="src" maxlength="500" value="${escText(child.src||'')}"></label><button type="button" data-action="container-media-pick" data-kind="video" data-field="src" data-block="${index}" data-column="${ci}" data-child="${bi}">选择视频</button></div>`+containerChildInput(index,ci,bi,'caption','视频说明',child.caption||'');
    case 'blessing':return containerChildInput(index,ci,bi,'text','强调文字',child.text||'',{textarea:true,max:2000});
    default:return `<div class="hint">此子块请在高级 JSON 中编辑：${escText(child.type||'unknown')}</div>`;
  }
}
function renderContainerEditor(block,index){
  ensureContainerColumns(block);
  const controls=`<div class="container-controls full">${inputField(index,'layout','布局',block.layout||'two-equal',{options:CONTAINER_LAYOUTS})}${inputField(index,'gap','列间距',block.gap||'md',{options:[['sm','紧凑'],['md','标准'],['lg','宽松']]})}${inputField(index,'align','纵向对齐',block.align||'start',{options:[['start','顶部'],['center','居中'],['stretch','等高']]})}${inputField(index,'mobile','手机显示',block.mobile||'stack',{options:[['stack','自动堆叠（推荐）'],['preserve','保持分栏（高级）']]})}</div>`;
  const columns=(block.columns||[]).map((column,ci)=>`<section class="container-column-editor" data-column="${ci}"><header><div><span>COL ${ci+1}</span><strong>第 ${ci+1} 列</strong></div><div><select class="container-add-type" data-block="${index}" data-column="${ci}">${CONTAINER_CHILD_TYPES.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select><button type="button" data-action="container-add-child" data-block="${index}" data-column="${ci}">＋ 添加</button></div></header><div class="container-child-list">${(column.blocks||[]).map((child,bi)=>`<details class="container-child-card" open><summary><span>${bi+1}. ${escText(BLOCK_NAMES[child.type]||child.type||'内容')}</span><span class="container-child-actions"><button type="button" data-action="container-child-up" data-block="${index}" data-column="${ci}" data-child="${bi}" ${bi===0?'disabled':''}>↑</button><button type="button" data-action="container-child-down" data-block="${index}" data-column="${ci}" data-child="${bi}" ${bi===(column.blocks||[]).length-1?'disabled':''}>↓</button><button type="button" data-action="container-child-design" data-block="${index}" data-column="${ci}" data-child="${bi}" title="设计">◈</button><button type="button" data-action="container-child-delete" data-block="${index}" data-column="${ci}" data-child="${bi}">×</button></span></summary><div class="container-child-fields">${renderContainerChildFields(child,index,ci,bi)}</div></details>`).join('')||'<div class="container-column-empty">本列为空，可添加正文或媒体。</div>'}</div></section>`).join('');
  return controls+`<div class="container-columns-editor full">${columns}</div><div class="hint full">V3.1-alpha1 容器最多 3 列，每列最多 20 个子块；暂不允许容器继续嵌套容器。手机默认自动堆叠以保证可读性。</div>`;
}
function richTextManagedField(block,index,label,max){if(block?.richText?.type==='doc'&&Array.isArray(block.richText.content))return `<div class="richtext-managed full"><div><b>${escText(label)} · 结构化富文本</b><span>已由 Tiptap Core 管理。请在中央 Reader 画布双击正文，使用选区工具栏编辑；issue.json 保存 JSON node / mark，不保存 HTML。</span></div><button type="button" data-action="richtext-reset" data-block="${index}">转为纯文本</button></div>`;return inputField(index,'text',label,block?.text||'',{full:true,textarea:true,max});}
const TABLE_EDITOR_LIMITS={rows:40,cols:12};
function tableEditorRows(block){const source=Array.isArray(block?.rows)&&block.rows.length?block.rows:[['']];const cols=Math.max(1,Math.min(TABLE_EDITOR_LIMITS.cols,source.reduce((max,row)=>Math.max(max,Array.isArray(row)?row.length:0),1)));return source.slice(0,TABLE_EDITOR_LIMITS.rows).map(row=>Array.from({length:cols},(_,ci)=>String(Array.isArray(row)?row[ci]??'':'')));}
function tableRowsFromText(value){const lines=String(value||'').split(/\r?\n/).filter((line,i,all)=>line.trim()||i<all.length-1).slice(0,TABLE_EDITOR_LIMITS.rows);if(!lines.length)return [['']];const cols=Math.max(1,Math.min(TABLE_EDITOR_LIMITS.cols,lines.reduce((max,line)=>Math.max(max,line.split('\t').length),1)));return lines.map(line=>Array.from({length:cols},(_,ci)=>String(line.split('\t')[ci]??'').trim().slice(0,2000)));}
function tableEditorMarkup(block,index){const rows=tableEditorRows(block),cols=rows[0]?.length||1,tsv=rows.map(row=>row.join('\t')).join('\n');const heads=Array.from({length:cols},(_,ci)=>`<span class="table-editor-col-head"><span>列 ${ci+1}</span><button type="button" data-action="table-duplicate-column" data-block="${index}" data-table-col="${ci}" title="复制此列" aria-label="复制第 ${ci+1} 列">⧉</button></span>`).join('');const body=rows.map((row,ri)=>`<span class="table-editor-row-number">${ri+1}</span>${row.map((cell,ci)=>`<input class="table-cell-field" data-block="${index}" data-table-row="${ri}" data-table-col="${ci}" maxlength="2000" value="${escText(cell)}" aria-label="第 ${ri+1} 行第 ${ci+1} 列">`).join('')}<span class="table-editor-row-actions"><button type="button" data-action="table-duplicate-row" data-block="${index}" data-table-row="${ri}" title="复制此行">复制</button><button type="button" data-action="table-delete-row" data-block="${index}" data-table-row="${ri}" title="删除此行">×</button></span>`).join('');return `<div class="table-editor full" data-table-editor="${index}"><div class="table-editor-head"><div><b>可视化表格</b><span>直接编辑单元格 · ${rows.length} 行 × ${cols} 列</span></div><div class="table-editor-actions"><button type="button" data-action="table-add-row" data-block="${index}">＋ 行</button><button type="button" data-action="table-add-column" data-block="${index}">＋ 列</button><button type="button" data-action="table-remove-row" data-block="${index}">− 行</button><button type="button" data-action="table-remove-column" data-block="${index}">− 列</button></div></div><div class="table-editor-grid-wrap"><div class="table-editor-grid" style="--table-columns:${cols}"><span class="table-editor-corner">#</span>${heads}<span class="table-editor-col-actions">操作</span>${body}</div></div><details class="table-bulk-editor"><summary>批量粘贴 / 快速导入</summary><label>Tab 分列、换行分行<textarea class="table-bulk-field" data-block="${index}" rows="5" maxlength="30000">${escText(tsv)}</textarea></label><div class="hint">可直接粘贴 Excel / Word 表格；最多 ${TABLE_EDITOR_LIMITS.rows} 行 × ${TABLE_EDITOR_LIMITS.cols} 列，离开输入框后同步可视化表格。</div></details></div>`;}
function renderBlockFields(block,index) {
  switch (block.type) {
    case 'paragraph': return inputField(index,'style','段落样式',block.style||'body',{options:[['body','正文'],['small','较小正文'],['xsmall','紧凑正文'],['lead','导语 / 大正文'],['subhead','小标题 / 分节标题']]}) + richTextManagedField(block,index,'正文',12000);
    case 'textFlow': return inputField(index,'flowId','文本流 ID',block.flowId||'article-main',{full:true,max:80}) + richTextManagedField(block,index,'文本流源正文（首个同 ID 块为源）',24000) + `<div class="hint full">跨页文本流按同一 flowId 串联。首个含正文/RichText 的块提供内容，其余同 ID 块作为续排槽位。容量、孤行/寡行参数可在右侧出版属性中调整。</div>`;
    case 'pullQuote': return inputField(index,'label','标签',block.label||'',{max:80}) + inputField(index,'attribution','署名 / 来源',block.attribution||'',{max:120}) + inputField(index,'text','重点引语',block.text||'',{full:true,textarea:true,max:3000});
    case 'sidebar': return inputField(index,'title','侧栏标题',block.title||'',{full:true,max:120}) + inputField(index,'text','侧栏内容',block.text||'',{full:true,textarea:true,max:6000});
    case 'sectionHeading': return inputField(index,'level','标题级别',Number(block.level)||3,{options:[['2','H2'],['3','H3'],['4','H4']]}) + inputField(index,'text','跨栏标题',block.text||'',{full:true,max:240});
    case 'quote': return inputField(index,'title','引言标题（可选）',block.title||'',{full:true,max:120}) + richTextManagedField(block,index,'引言内容',8000);
    case 'table': return inputField(index,'caption','表格标题 / 图注',block.caption||'',{full:true,max:300})+inputField(index,'headerRows','表头行数',Number(block.headerRows)||0,{options:[['0','无表头'],['1','1 行'],['2','2 行'],['3','3 行'],['4','4 行']]})+inputField(index,'tableStyle','表格样式',block.tableStyle||'plain',{options:[['plain','基础线框'],['striped','斑马纹'],['accent','强调表头']]})+inputField(index,'density','单元格密度',block.density||'comfortable',{options:[['compact','紧凑'],['comfortable','标准'],['spacious','宽松']]})+inputField(index,'align','文字对齐',block.align||'left',{options:[['left','左对齐'],['center','居中'],['right','右对齐']]})+inputField(index,'minWidth','最小宽度',block.minWidth||'auto',{options:[['auto','自适应'],['wide','宽表 · 可横向滚动']]})+tableEditorMarkup(block,index);
    case 'chips': return arrayEditor(index,block,'chips');
    case 'cardline': return inputField(index,'badge','徽标',block.badge||'',{max:12}) + inputField(index,'tone','色调',block.tone||'default',{options:[['default','红色 / 默认'],['green','绿色']]}) + inputField(index,'title','标题',block.title||'',{full:true,max:120}) + inputField(index,'text','正文',block.text||'',{full:true,textarea:true,max:8000});
    case 'casePair': return inputField(index,'case','案例',block.case||'',{full:true,textarea:true,max:10000}) + inputField(index,'warning','警示',block.warning||'',{full:true,textarea:true,max:10000});
    case 'toc': return arrayEditor(index,block,'toc');
    case 'articleLink': {
      const ids = Object.keys(state.issue?.articles || {}); const opts = [['','请选择文章'], ...ids.map(id => [id, `${id} · ${state.issue.articles[id]?.title || ''}`])]; const article=state.issue?.articles?.[block.articleId]||{};
      return inputField(index,'articleId','链接文章',block.articleId||'',{full:true,options:opts}) + inputField(index,'title','链接显示文字',block.title||article.linkTitle||article.title||'查看链接内容',{full:true,max:200}) + (!ids.length ? '<div class="hint full">当前 issue.articles 为空。可先用高级 JSON 添加文章定义；审计会阻止不存在的 articleId 发布。</div>' : '<div class="hint full">留空时使用文章标题或文章库中的默认链接文字；填写后仅改变这个链接组件。</div>');
    }
    case 'video': return mediaSourceField(index,'video','视频路径',block.src||'') + mediaSourceField(index,'image','视频封面 poster',block.poster||'','poster','选择封面') + `<div class="media-layout-inline full"><div class="hint">视频封面可从图片库选择，也可由本地 ffmpeg 从视频自动截取。</div><div class="media-mini-actions"><button type="button" data-action="video-poster" data-block="${index}">自动生成封面</button></div></div>` + inputField(index,'caption','视频说明',block.caption||'',{full:true,max:240});
    case 'image': return mediaSourceField(index,'image','图片路径',block.src||'') + inputField(index,'alt','替代文字 alt',block.alt||'',{full:true,max:240}) + inputField(index,'caption','图片说明（可选）',block.caption||'',{full:true,max:240}) + `<div class="media-layout-inline full"><div class="hint">显示：${escText(block.frameRatio||'auto')} · ${escText(block.fit||'contain')} · 焦点 ${Number(block.positionX??50)}% / ${Number(block.positionY??50)}%</div><div class="media-mini-actions"><button type="button" data-action="image-adjust" data-block="${index}">裁切 / 焦点</button></div></div>`;
    case 'coverMeta': return inputField(index,'text','封面副信息',block.text||'',{full:true,max:240});
    case 'coverSections': return arrayEditor(index,block,'strings');
    case 'blessing': return inputField(index,'text','祝福语',block.text||'',{full:true,textarea:true,max:2000});
    case 'producer': return inputField(index,'text','制作单位',block.text||'',{full:true,max:240});
    case 'cards': return arrayEditor(index,block,'cards');
    case 'container': return renderContainerEditor(block,index);
    default: return `<div class="hint full">未知内容块类型：${escText(block.type)}。请切换高级 JSON 修复。</div>`;
  }
}
function validSelectedBlockIds(){const blocks=currentPage()?.blocks||[],ids=[...state.selectedBlockIds].filter(id=>Boolean(findBlockLocation(blocks,{blockId:id})));if(ids.length)return ids;return [...state.selectedBlocks].filter(i=>Number.isInteger(i)&&i>=0&&i<blocks.length).map(i=>blocks[i]?.id).filter(Boolean);}
function validSelectedBlockIndices(){const blocks=currentPage()?.blocks||[],ids=validSelectedBlockIds();if(ids.length){const indices=new Set();for(const id of ids){const index=resolveBlockLocation({blockId:id})?.blockIndex;if(Number.isInteger(index)&&index>=0&&index<blocks.length)indices.add(index);}return [...indices].sort((a,b)=>a-b);}return [...state.selectedBlocks].filter(i=>Number.isInteger(i)&&i>=0&&i<blocks.length).sort((a,b)=>a-b);}
function updateContentEditorHint(){const el=$('#contentEditorHint');if(!el)return;const count=validSelectedBlockIndices().length;if(!currentPage()){el.textContent='请选择一期期刊后开始编辑。';return;}if(count===1){el.textContent='已选 1 个组件：悬停内容块可快捷编辑、换媒体或打开样式。';return;}if(count>1){el.textContent=`已选 ${count} 个组件：可批量调整间距、宽度和位置。`;return;}el.textContent='先点击内容块标题完成选择；双击 Reader 中的文字可直接编辑。';}
function renderBlockSelectionState(){const blocks=currentPage()?.blocks||[],valid=validSelectedBlockIndices(),ids=validSelectedBlockIds();state.selectedBlocks=new Set(valid);state.selectedBlockIds=new Set(ids.length?ids:valid.map(i=>blocks[i]?.id).filter(Boolean));document.querySelectorAll('#blockList .block-card').forEach(card=>{const i=Number(card.dataset.index),on=state.selectedBlocks.has(i);card.classList.toggle('is-selected',on);const toggle=card.querySelector('.block-select-toggle');if(toggle){toggle.setAttribute('aria-pressed',String(on));toggle.textContent=on?'✓':'○';}});const count=$('#quickSelectionCount');if(count)count.textContent=valid.length?`已选 ${valid.length} 个块`:'未选择内容块';for(const id of ['batchBlocksUp','batchBlocksDown','batchBlocksDuplicate','batchBlocksDelete'])if($('#'+id))$('#'+id).disabled=!valid.length;syncCanvasSelectionToReader();renderContextInspector();updateDesignEntryLabel();updateContentEditorHint();}
function setBlockSelection(indices,{anchor=null}={}){const blocks=currentPage()?.blocks||[],valid=(indices||[]).filter(i=>Number.isInteger(i)&&i>=0&&i<blocks.length);state.selectedBlocks=new Set(valid);state.selectedBlockIds=new Set(valid.map(i=>blocks[i]?.id).filter(Boolean));state.lastSelectedBlock=anchor??(valid.at?.(-1)??null);renderBlockSelectionState();}
function setBlockSelectionByIds(ids,{additive=false}={}){const blocks=currentPage()?.blocks||[],incoming=(ids||[]).filter(Boolean),next=new Set(additive?validSelectedBlockIds():[]);for(const id of incoming){const exists=Boolean(findBlockLocation(blocks,{blockId:id}));if(!exists)continue;if(additive&&next.has(id))next.delete(id);else next.add(id);}state.selectedBlockIds=next;state.selectedBlocks=new Set([...next].map(id=>resolveBlockLocation({blockId:id})?.blockIndex).filter(i=>Number.isInteger(i)&&i>=0));state.lastSelectedBlock=[...state.selectedBlocks].at(-1)??null;renderBlockSelectionState();}
function selectAllTopLevelBlocks(){const blocks=currentPage()?.blocks||[];if(!blocks.length)return toast('当前页没有可选择的内容块');setBlockSelection(blocks.map((_,index)=>index),{anchor:blocks.length-1});toast(`已选择当前页全部 ${blocks.length} 个内容块`);}
function clearSelectedBlocks({quiet=false}={}){const count=validSelectedBlockIndices().length;if(!count){if(!quiet)toast('当前没有已选择的内容块');return false;}setBlockSelection([]);if(!quiet)toast('已清除内容块选择');return true;}
function navigateWorkspacePage(direction){if(!state.issue)return toast('请先选择一期期刊');const target=state.page+Number(direction||0);if(target<0)return toast('已经是第一页');if(target>=state.issue.pages.length)return toast('已经是最后一页');return goToPage(target);}
function toggleBlockSelection(index,event={}){const blocks=currentPage()?.blocks||[];if(index<0||index>=blocks.length)return;const current=new Set(validSelectedBlockIndices());if(event.shiftKey&&Number.isInteger(state.lastSelectedBlock)){const a=Math.min(index,state.lastSelectedBlock),b=Math.max(index,state.lastSelectedBlock);const next=new Set((event.metaKey||event.ctrlKey)?current:[]);for(let i=a;i<=b;i++)next.add(i);setBlockSelection([...next],{anchor:index});return;}if(event.metaKey||event.ctrlKey){current.has(index)?current.delete(index):current.add(index);setBlockSelection([...current],{anchor:index});return;}setBlockSelection([index],{anchor:index});}
function selectedBlockObjects(){const blocks=currentPage()?.blocks||[];return validSelectedBlockIndices().map(i=>({index:i,block:blocks[i]}));}
function inspectorSelect(value,options){return options.map(([v,t])=>`<option value="${escText(v)}"${String(value)===String(v)?' selected':''}>${escText(t)}</option>`).join('');}
function renderContextInspector(){const root=$('#contextInspector'),body=$('#contextInspectorBody'),title=$('#contextInspectorTitle'),sub=$('#contextInspectorSubtitle'),identity=$('#contextInspectorIdentity'),advanced=$('#contextInspectorAdvanced');if(!root||!body||!title||!sub||!identity)return;root.classList.toggle('is-closed',!state.contextInspectorOpen);const page=currentPage();if(!page){title.textContent='页面属性';sub.textContent='请选择页面';identity.textContent='PAGE';body.innerHTML='<div class="context-empty">选择一期期刊后显示页面属性。</div>';return;}const rows=selectedBlockObjects(),blocks=rows.map(x=>x.block),kind=inspectorKind(blocks),health=visualHealthInfo();if(!blocks.length){const profile=managerBlockNodes(page.blocks||[]);title.textContent='页面属性';sub.textContent=`第 ${state.page+1} 页 · ${page.navTitle||page.title||'页面'}`;identity.textContent=page.id||`PAGE ${state.page+1}`;if(advanced)advanced.textContent='页面设计';body.innerHTML=`<section class="context-section"><span class="context-kicker">PAGE HEALTH</span><div class="context-health ${health.state}"><strong>${escText(health.label)}</strong><p>${escText(health.advice)}</p></div><div class="context-metric-grid"><div><span>内容节点</span><b>${profile.nodes}</b></div><div><span>媒体</span><b>${profile.media}</b></div><div><span>类型</span><b>${escText(page.type||'article')}</b></div><div><span>栏目</span><b>${escText(page.section||'未归类')}</b></div></div></section><section class="context-section"><span class="context-kicker">PUBLISHING PAGE</span><label>分栏<select data-page-publishing="columns">${inspectorSelect(String(page.publishing?.columns||1),[['1','单栏'],['2','双栏'],['3','三栏']])}</select></label><label>栏间距<input type="number" min="8" max="48" value="${Number(page.publishing?.columnGap||18)}" data-page-publishing="columnGap"></label><label>自动平衡<select data-page-publishing="balanceColumns">${inspectorSelect(String(page.publishing?.balanceColumns!==false),[['true','开启'],['false','关闭']])}</select></label></section><section class="context-section"><span class="context-kicker">PAGE ACTIONS</span><div class="context-action-grid"><button type="button" data-inspector-action="health">版面健康</button><button type="button" data-inspector-action="balance">平衡间距</button><button type="button" data-inspector-action="layout">智能套版</button><button type="button" data-inspector-action="page-design">页面设计</button></div></section>`;return;}if(blocks.length>1){title.textContent=`已选 ${blocks.length} 个组件`;sub.textContent='批量属性 · 使用稳定 Block ID 保持选择';identity.textContent=`${blocks.length} BLOCKS`;if(advanced)advanced.textContent='高级设计';body.innerHTML=`<section class="context-section"><span class="context-kicker">BATCH LAYOUT</span><label>宽度<select data-inspector-design="width">${inspectorSelect('',[['','保持当前'],['100','100%'],['80','80%'],['66','66%'],['50','50%'],['33','33%']])}</select></label><label>块位置<select data-inspector-design="alignSelf">${inspectorSelect('',[['','保持当前'],['left','左'],['center','中'],['right','右']])}</select></label><label>文字对齐<select data-inspector-design="textAlign">${inspectorSelect('',[['','保持当前'],['left','左对齐'],['center','居中'],['right','右对齐'],['justify','两端对齐']])}</select></label><div class="context-action-grid"><button type="button" data-inspector-action="duplicate">复制所选</button><button type="button" data-inspector-action="delete" class="danger-lite">删除所选</button></div></section>`;return;}const row=rows[0],block=row.block,summary=blockInspectorSummary(block);title.textContent=BLOCK_NAMES[block.type]||block.type||'组件';sub.textContent=`BLOCK ${String(row.index+1).padStart(2,'0')} · ${kind==='media'?'媒体':kind==='layout'?'布局':'内容'}属性`;identity.textContent=summary.id||`BLOCK ${row.index+1}`;if(advanced)advanced.textContent='高级设计';let extra='';if(kind==='text')extra=`<section class="context-section"><span class="context-kicker">TYPOGRAPHY</span><label>字号<input type="range" min="10" max="48" step="1" value="${summary.fontSize||14}" data-inspector-design="fontSize"><output>${summary.fontSize||'继承'}${summary.fontSize?'px':''}</output></label><label>字重<select data-inspector-design="fontWeight">${inspectorSelect(summary.fontWeight,[['400','常规'],['500','中等'],['600','半粗'],['700','粗体']])}</select></label><label>文字对齐<select data-inspector-design="textAlign">${inspectorSelect(summary.textAlign,[['left','左对齐'],['center','居中'],['right','右对齐'],['justify','两端对齐']])}</select></label></section>`;if(kind==='media'){extra=`<section class="context-section"><span class="context-kicker">MEDIA</span><div class="context-action-grid"><button type="button" data-inspector-action="replace-media">替换${block.type==='video'?'视频':'图片'}</button>${block.type==='image'?'<button type="button" data-inspector-action="image-adjust">裁切 / 焦点</button><button type="button" data-inspector-action="image-fit">完整 / 填满</button><button type="button" data-inspector-action="image-ratio">切换比例</button>':'<button type="button" data-inspector-action="video-poster">更换封面</button>'}</div>${block.type==='image'?`<div class="context-media-meta"><span>画框</span><b>${escText(block.frameRatio||'auto')}</b><span>填充</span><b>${escText(block.fit||'contain')}</b></div>`:''}</section>`;}if(kind==='layout')extra=`<section class="context-section"><span class="context-kicker">CONTAINER</span><label>布局<select data-inspector-prop="layout">${inspectorSelect(block.layout||'two-equal',CONTAINER_LAYOUTS)}</select></label><label>列间距<select data-inspector-prop="gap">${inspectorSelect(block.gap||'md',[['sm','紧凑'],['md','标准'],['lg','宽松']])}</select></label><label>手机显示<select data-inspector-prop="mobile">${inspectorSelect(block.mobile||'stack',[['stack','自动堆叠'],['preserve','保持分栏']])}</select></label></section>`;const pub=block.publishing||{},flow=block.flow||{};extra+=`<section class="context-section"><span class="context-kicker">PUBLISHING</span><label>跨栏<select data-inspector-publishing="spanAll">${inspectorSelect(String(pub.spanAll===true),[['false','单栏'],['true','跨越全部栏']])}</select></label><label>与下段同页<select data-inspector-publishing="keepWithNext">${inspectorSelect(String(pub.keepWithNext===true),[['false','自动'],['true','保持']])}</select></label><label>避免断开<select data-inspector-publishing="avoidBreak">${inspectorSelect(String(pub.avoidBreak===true),[['false','允许'],['true','避免']])}</select></label><label>首字下沉<select data-inspector-publishing="dropCap">${inspectorSelect(String(pub.dropCap===true),[['false','关闭'],['true','开启']])}</select></label><label>图片环绕<select data-inspector-publishing="wrap">${inspectorSelect(pub.wrap||'none',[['none','不环绕'],['left','左浮动'],['right','右浮动']])}</select></label>${block.type==='textFlow'?`<div class="context-two"><label>槽位容量<input type="number" min="80" max="4000" value="${Number(flow.capacity||680)}" data-inspector-flow="capacity"></label><label>每行估算<input type="number" min="12" max="80" value="${Number(flow.lineChars||28)}" data-inspector-flow="lineChars"></label></div>`:''}</section>`;body.innerHTML=`<section class="context-section"><span class="context-kicker">LAYOUT</span><label>组件宽度 <output>${summary.width}%</output><input type="range" min="25" max="100" step="1" value="${summary.width}" data-inspector-design="width"></label><label>组件位置<select data-inspector-design="alignSelf">${inspectorSelect(summary.alignSelf,[['left','左'],['center','中'],['right','右']])}</select></label><div class="context-two"><label>内边距<input type="number" min="0" max="48" value="${summary.padding}" data-inspector-design="padding"></label><label>外间距<input type="number" min="0" max="48" value="${summary.margin}" data-inspector-design="margin"></label></div></section><section class="context-section"><span class="context-kicker">位置与大小</span><div class="context-two">${[['x','水平位移',-240,240,1,0],['y','垂直位移',-240,240,1,0],['scale','缩放倍数',.5,1.8,.05,1],['rotate','旋转角度',-180,180,1,0]].map(([key,label,min,max,step,fallback])=>`<label>${label}<input type="number" min="${min}" max="${max}" step="${step}" value="${Number(block.design?.[key]??fallback)}" data-inspector-design="${key}"></label>`).join('')}</div><small>位移单位 px，相对原位置；画布拖柄可自由移动，右下角可等比缩放。</small></section>${extra}<section class="context-section context-danger-zone"><div class="context-action-grid"><button type="button" data-inspector-action="duplicate">复制组件</button><button type="button" data-inspector-action="delete" class="danger-lite">删除组件</button></div></section>`;}
function setContextInspectorOpen(open,{remember=true}={}){state.contextInspectorOpen=Boolean(open);document.body.classList.toggle('context-inspector-closed',!state.contextInspectorOpen);const toggle=$('#contextInspectorToggle');if(toggle){toggle.setAttribute('aria-pressed',String(state.contextInspectorOpen));toggle.textContent=state.contextInspectorOpen?'属性':'展开属性';}if(remember)try{localStorage.setItem('v3StudioInspectorOpen',state.contextInspectorOpen?'1':'0')}catch{}renderContextInspector();requestAnimationFrame(fitReaderPreview);}
function applyInspectorDesign(key,value){if(!key||value==='')return;let next=value;const limits={width:[25,100],fontSize:[10,48],padding:[0,48],margin:[0,48],x:[-240,240],y:[-240,240],rotate:[-180,180],scale:[.5,1.8]};if(limits[key]){next=Number(value);if(!Number.isFinite(next))return;next=Math.max(limits[key][0],Math.min(limits[key][1],next));}applyQuickDesign({[key]:next},{message:''});}
function handleInspectorAction(action){const row=selectedBlockObjects()[0],block=row?.block,index=row?.index;if(action==='health')return openVisualHealth();if(action==='balance')return balanceCurrentPageSpacing();if(action==='layout')return openLayoutLab();if(action==='page-design')return openDesignDialog('page');if(action==='duplicate')return duplicateSelectedBlocks();if(action==='delete')return deleteSelectedBlocks();if(action==='replace-media'&&block)return openMediaDialog({kind:block.type==='video'?'video':'image',blockIndex:index,field:'src'});if(action==='image-adjust'&&block?.type==='image')return openImageAdjust(index);if(action==='video-poster'&&block?.type==='video')return openMediaDialog({kind:'image',blockIndex:index,field:'poster'});if(action==='image-fit'&&block?.type==='image'){block.fit=block.fit==='cover'?'contain':'cover';mutateBlocks();return;}if(action==='image-ratio'&&block?.type==='image'){const seq=['auto','16:9','4:3','3:2','1:1'],at=Math.max(0,seq.indexOf(block.frameRatio||'auto'));block.frameRatio=seq[(at+1)%seq.length];mutateBlocks();return;}}
function mutateSelectedBlocks(mutator,{group='batch-block-style',message='已更新所选内容块'}={}){const rows=selectedBlockObjects();if(!rows.length)return toast('请先选择内容块');let changed=0;for(const row of rows){const before=JSON.stringify(row.block);mutator(row.block,row.index);if(before!==JSON.stringify(row.block))changed++;}if(!changed)return;markDirty({preview:false,historyGroup:group,forceHistory:true});syncJsonFromPage();renderBlockList();renderPreview();pushReaderPreview().catch(()=>{});if(message)toast(`${message} · ${changed} 个`);}
function applyQuickParagraphStyle(style){if(!style)return;mutateSelectedBlocks(block=>{if(block.type==='paragraph')block.style=style;else if(block.type==='container')for(const col of block.columns||[])for(const child of col.blocks||[])if(child?.type==='paragraph')child.style=style;},{group:'batch-paragraph',message:'已应用段落样式'});}
function applyQuickSpacing(mode){if(!mode)return;const map={compact:{padding:4,margin:4},standard:{padding:8,margin:8},relaxed:{padding:14,margin:14}};const d=map[mode];mutateSelectedBlocks(block=>{block.design={...(block.design||{}),...d};},{group:'batch-spacing',message:'已应用块间距'});}
function applyQuickDesign(patch,{message='已应用快速样式'}={}){mutateSelectedBlocks(block=>{block.design={...(block.design||{})};for(const [k,v] of Object.entries(patch||{})){if(v===''||v==null)delete block.design[k];else block.design[k]=v;}if(!Object.keys(block.design).length)delete block.design;},{group:'batch-design',message});}
function moveSelectedBlocks(direction){const blocks=currentPage()?.blocks||[],sel=new Set(validSelectedBlockIndices()),ids=new Set(validSelectedBlockIds());if(!sel.size)return toast('请先选择内容块');const order=[...sel].sort((a,b)=>direction<0?a-b:b-a);let moved=0;for(const i of order){const to=i+direction;if(to<0||to>=blocks.length||sel.has(to))continue;[blocks[i],blocks[to]]=[blocks[to],blocks[i]];sel.delete(i);sel.add(to);moved++;}if(!moved)return toast('所选内容块已到边界');state.selectedBlockIds=ids;state.lastSelectedBlock=[...sel][0]??null;mutateBlocks();toast(`已批量${direction<0?'上移':'下移'} ${moved} 个块`);}
function duplicateSelectedBlocks(){const blocks=currentPage()?.blocks||[],rows=validSelectedBlockIndices();if(!rows.length)return toast('请先选择内容块');if(blocks.length+rows.length>LIMITS.blocksPerPage)return toast(`复制后超过单页 ${LIMITS.blocksPerPage} 个内容块`);let offset=0,newSel=[],newIds=[];for(const i of rows){const at=i+offset+1;const copy=cloneData(blocks[i+offset]);regenerateBlockIdentity(copy);blocks.splice(at,0,copy);newSel.push(at);newIds.push(copy.id);offset++;}state.selectedBlocks=new Set(newSel);state.selectedBlockIds=new Set(newIds);state.lastSelectedBlock=newSel[0]??null;mutateBlocks();toast(`已复制 ${rows.length} 个内容块`);}
function deleteSelectedBlocks(){const blocks=currentPage()?.blocks||[],rows=validSelectedBlockIndices();if(!rows.length)return toast('请先选择内容块');if(!confirm(`删除已选 ${rows.length} 个内容块？`))return;for(const i of [...rows].sort((a,b)=>b-a))blocks.splice(i,1);state.selectedBlocks.clear();state.selectedBlockIds.clear();state.lastSelectedBlock=null;mutateBlocks();toast(`已删除 ${rows.length} 个内容块`);}
function setCanvasMode(on,{silent=false}={}){state.canvasMode=Boolean(on);document.body.classList.toggle('canvas-editor-on',state.canvasMode);const b=$('#canvasModeBtn');if(b){b.setAttribute('aria-pressed',String(state.canvasMode));b.textContent=state.canvasMode?'✓ 画布编排':'✥ 画布编排';}try{localStorage.setItem('v3StudioCanvasMode',state.canvasMode?'1':'0')}catch{}/* Page navigation is authoritative. Send it before canvas state so a stale iframe cannot claim a new page without rendering it. */syncReaderPreviewPage({reliable:true});requestAnimationFrame(()=>syncCanvasSelectionToReader());setTimeout(()=>syncCanvasSelectionToReader(),120);if(!silent)toast(state.canvasMode?'已开启预览画布直编：拖动排序，右侧手柄调宽度':'已退出画布编排');}
function syncCanvasSelectionToReader(){const frame=$('#builtPreviewFrame');if(!frame?.contentWindow)return false;try{frame.contentWindow.postMessage({source:'v3-studio',type:'canvas-mode',enabled:state.canvasMode,selectedBlocks:validSelectedBlockIndices(),selectedBlockIds:validSelectedBlockIds(),pageIndex:state.page,pageId:currentPage()?.id||null},'*');return true;}catch{return false}}
function quickAdvancedDesign(){return openContextDesign();}
function contextDesignScope(){const selected=validSelectedBlockIndices();return selected.length===1?'block':currentPage()?'page':'theme';}
function openContextDesign(){const scope=contextDesignScope();if(scope==='block')return openDesignDialog('block',{blockIndex:validSelectedBlockIndices()[0]});if(scope==='page')return openDesignDialog('page');return openDesignDialog('theme');}
function updateDesignEntryLabel(){const button=$('#designBtn');if(!button)return;const scope=contextDesignScope();button.textContent='设计';button.title=scope==='block'?'设计当前内容块':scope==='page'?'设计当前页面':'整体主题与样式设计';}

function renderBlockList() {
  const p = currentPage(), list = $('#blockList'); if (!p || !list) return; const blocks = p.blocks || []; list.innerHTML = '';
  $('#blockLimitNote').textContent = `${blocks.length} / ${LIMITS.blocksPerPage} 个顶层块 · ${currentPageBlockNodeCount()} / ${LIMITS.totalBlockNodesPerPage} 个总块 · 建议单页保持清晰层级`; $('#blockLimitNote').classList.toggle('warning', blocks.length > 12);
  if (!blocks.length) list.innerHTML = '<div class="block-empty"><strong>当前页面还没有内容块</strong><span>从一个正文块开始，再按需要加入图片、引用或布局容器。</span><button type="button" class="primary" data-empty-add-block="paragraph">添加正文块</button></div>';
  blocks.forEach((block,index) => {
    const d = document.createElement('details'); d.className = 'block-card'; d.dataset.index = index; d.dataset.blockId = block.id || ''; d.draggable = false; if (blocks.length <= 6 || index === 0) d.open = true;
    const editAction=['paragraph','quote','textFlow','pullQuote','sidebar','sectionHeading','cardline','casePair','blessing','producer'].includes(block.type)?`<button type="button" data-action="edit" data-block="${index}">编辑内容</button>`:'';
    const mediaAction=['image','video'].includes(block.type)?`<button type="button" data-action="media-pick" data-kind="${block.type}" data-block="${index}">${block.type==='video'?'换视频':'换图片'}</button>`:'';
    const floatingActions=editAction||mediaAction?`<div class="block-floating-actions" aria-label="内容块快捷操作">${editAction}${mediaAction}</div>`:'';
    d.innerHTML = `<summary class="block-summary"><span class="drag-handle" draggable="true" title="拖拽排序" aria-label="拖拽排序">⋮⋮</span><button type="button" class="block-select-toggle" data-select-block="${index}" aria-pressed="${state.selectedBlocks.has(index)}" title="选择内容块">${state.selectedBlocks.has(index)?'✓':'○'}</button><span class="block-title"><span class="block-index">BLOCK ${String(index+1).padStart(2,'0')}</span><strong>${escText(BLOCK_NAMES[block.type] || block.type || '未知内容块')}</strong><span>${escText(blockSummary(block).slice(0,100) || '暂无内容')}</span></span><span class="block-quick-actions"><button data-action="up" data-block="${index}" title="上移" ${index===0?'disabled':''}>↑</button><button data-action="down" data-block="${index}" title="下移" ${index===blocks.length-1?'disabled':''}>↓</button><button data-action="design" data-block="${index}" title="设计">◈</button><button data-action="duplicate" data-block="${index}" title="复制">⧉</button><button data-action="delete" data-block="${index}" title="删除">×</button></span></summary>${floatingActions}<div class="block-body"><div class="block-fields">${renderBlockFields(block,index)}</div></div>`;
    list.appendChild(d);
    if(block.type==='table'){
      let active={row:0,col:0};d.addEventListener('focusin',e=>{if(e.target.matches('.table-cell-field'))active={row:Number(e.target.dataset.tableRow),col:Number(e.target.dataset.tableCol)};});
      for(const kind of ['row','column']){const button=document.createElement('button');button.type='button';button.textContent=kind==='row'?'当前行后插入':'当前列后插入';button.onclick=()=>{const rows=tableEditorRows(block);if(kind==='row'){if(rows.length>=TABLE_EDITOR_LIMITS.rows)return toast('行数已达上限');rows.splice(active.row+1,0,Array(rows[0].length).fill(''));}else{if(rows[0].length>=TABLE_EDITOR_LIMITS.cols)return toast('列数已达上限');rows.forEach(r=>r.splice(active.col+1,0,''));}block.rows=rows;mutateBlocks();focusTableCell(index,active.row,active.col);};d.querySelector('.table-editor-actions')?.append(button);}
      const hint=document.createElement('p');hint.className='hint';hint.textContent='可从任意格粘贴表格。Tab 切格，Enter 换行，Alt + 方向键移动；Ctrl / ⌘ + Z 撤销。';d.querySelector('.table-editor')?.append(hint);
    }
  });
  renderBlockSelectionState();
}
function countBlockNodes(block){ if(!block||typeof block!=='object')return 0; if(block.type!=='container')return 1; return 1+(block.columns||[]).reduce((sum,col)=>sum+(col?.blocks||[]).reduce((n,child)=>n+countBlockNodes(child),0),0); }
function currentPageBlockNodeCount(){ return (currentPage()?.blocks||[]).reduce((sum,b)=>sum+countBlockNodes(b),0); }
commandBus.register('block:update',(payload)=>{const {blockId,changes={}}=payload;const block=findBlockByIdDeep(currentPage()?.blocks||[],blockId);if(!block)return false;Object.assign(block,changes);return true;});
commandBus.register('block:design',(payload)=>{const {blockId,changes={}}=payload;const block=findBlockByIdDeep(currentPage()?.blocks||[],blockId);if(!block)return false;block.design={...(block.design||{}),...changes};return true;});
commandBus.register('block:reorder',(payload)=>{const {blockId,toIndex}=payload,blocks=currentPage()?.blocks||[];const from=blocks.findIndex(x=>x?.id===blockId),to=Math.max(0,Math.min(blocks.length-1,Number(toIndex)));if(from<0||!Number.isInteger(to)||from===to)return false;const [item]=blocks.splice(from,1);blocks.splice(to,0,item);return {from,to,blockId};});
function dispatchStudioCommand(type,payload,{historyGroup=type,forceHistory=true,preview=true,readerSync=true,renderBlocks=true,recordHistory=true,message=''}={}){const changed=commandBus.dispatch(type,payload,{historyGroup});if(!changed)return false;ensureIssueIdentity(state.issue);syncJsonFromPage();if(renderBlocks)renderBlockList();const richHistory=String(historyGroup||'').startsWith('canvas-richtext:');markDirty({preview,readerSync:richHistory?false:readerSync,historyGroup,forceHistory,recordHistory});if(richHistory&&forceHistory)scheduleReaderPreviewSync(80);if(message)toast(message);return changed;}
function mutateBlocks() { ensureIssueIdentity(state.issue); syncJsonFromPage(); renderBlockList(); markDirty({historyGroup:'block-structure',forceHistory:true}); }
function moveBlock(from,to) { const blocks = currentPage().blocks; if (from === to || to < 0 || to >= blocks.length) return; const [item] = blocks.splice(from,1); blocks.splice(to,0,item); mutateBlocks(); requestAnimationFrame(() => $('#blockList').children[to]?.scrollIntoView({ block:'nearest' })); }
function addBlock(type, index = null) { const blocks = currentPage().blocks; if (blocks.length >= LIMITS.blocksPerPage) return toast(`单页最多 ${LIMITS.blocksPerPage} 个内容块`); if(currentPageBlockNodeCount()>=LIMITS.totalBlockNodesPerPage)return toast(`单页递归内容块总数最多 ${LIMITS.totalBlockNodesPerPage} 个，请拆分页面`); const b = defaultBlock(type); ensureBlockIdentity(b); if (index == null || index >= blocks.length) blocks.push(b); else blocks.splice(index,0,b); mutateBlocks(); const target = index == null ? blocks.length - 1 : index; requestAnimationFrame(() => { const el = $(`#blockList .block-card[data-index="${target}"]`); if (el) { el.open = true; el.scrollIntoView({ behavior:'smooth', block:'nearest' }); } }); }

function focusTableCell(index,row,col){$('#blockList').querySelector(`.table-cell-field[data-block="${index}"][data-table-row="${row}"][data-table-col="${col}"]`)?.focus();}
$('#blockList').addEventListener('paste',e=>{
  const cell=e.target.closest('.table-cell-field'),text=e.clipboardData?.getData('text/plain')||'';
  if(!cell||!/[\t\r\n]/.test(text))return;e.preventDefault();
  const index=Number(cell.dataset.block),row=Number(cell.dataset.tableRow),col=Number(cell.dataset.tableCol),block=currentPage()?.blocks[index];if(!block)return;
  const input=text.replace(/\r\n?/g,'\n').replace(/\n$/,'').split('\n').map(line=>line.split('\t'));
  if(row+input.length>TABLE_EDITOR_LIMITS.rows||col+Math.max(...input.map(r=>r.length))>TABLE_EDITOR_LIMITS.cols)return toast('粘贴范围超出表格上限，请缩小选区后重试。');
  const rows=tableEditorRows(block),width=Math.max(rows[0].length,col+Math.max(...input.map(r=>r.length)));
  while(rows.length<row+input.length)rows.push([]);rows.forEach(r=>{while(r.length<width)r.push('');});
  input.forEach((r,ri)=>r.forEach((value,ci)=>rows[row+ri][col+ci]=value.slice(0,2000)));
  block.rows=rows;mutateBlocks();focusTableCell(index,row,col);
});
$('#blockList').addEventListener('keydown',e=>{
  const cell=e.target.closest('.table-cell-field');if(!cell||e.isComposing)return;
  const index=Number(cell.dataset.block),row=Number(cell.dataset.tableRow),col=Number(cell.dataset.tableCol),block=currentPage()?.blocks[index];if(!block)return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.stopPropagation();if(e.shiftKey)redoHistory();else undoHistory();return;}
  if(e.altKey&&['Enter','Insert'].includes(e.key)){
    e.preventDefault();const rows=tableEditorRows(block);
    if(e.key==='Enter'){if(rows.length>=TABLE_EDITOR_LIMITS.rows)return;rows.splice(row+1,0,Array(rows[0].length).fill(''));}
    else{if(rows[0].length>=TABLE_EDITOR_LIMITS.cols)return;rows.forEach(r=>r.splice(col+1,0,''));}
    block.rows=rows;mutateBlocks();focusTableCell(index,row+(e.key==='Enter'?1:0),col+(e.key==='Insert'?1:0));return;
  }
  let r=row,c=col;
  if(e.key==='Enter')r+=e.shiftKey?-1:1;
  else if(e.key==='Tab'){c+=e.shiftKey?-1:1;const width=tableEditorRows(block)[0].length;if(c<0){r--;c=width-1;}if(c>=width){r++;c=0;}}
  else if(e.altKey&&e.key.startsWith('Arrow')){r+=e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0;c+=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;}
  else return;
  const target=$('#blockList').querySelector(`.table-cell-field[data-block="${index}"][data-table-row="${r}"][data-table-col="${c}"]`);
  if(target){e.preventDefault();target.focus();}
});
$('#blockList').addEventListener('input', e => {
  const p = currentPage(); if (!p) return;
  const tableCell=e.target.closest('.table-cell-field');
  if(tableCell){const b=p.blocks[Number(tableCell.dataset.block)],row=Number(tableCell.dataset.tableRow),col=Number(tableCell.dataset.tableCol);if(!b||b.type!=='table'||!Number.isInteger(row)||!Number.isInteger(col))return;const rows=tableEditorRows(b);if(!rows[row])return;rows[row][col]=String(tableCell.value||'');b.rows=rows;markInlineInputDirty(tableCell,{group:'table-cell'});const card=tableCell.closest('.block-card'),summary=card?.querySelector('.block-title span:last-child');if(summary)summary.textContent=blockSummary(b).slice(0,100)||'暂无内容';return;}
  const tableBulk=e.target.closest('.table-bulk-field');
  if(tableBulk){const b=p.blocks[Number(tableBulk.dataset.block)];if(!b||b.type!=='table')return;b.rows=tableRowsFromText(tableBulk.value);markInlineInputDirty(tableBulk,{group:'table-bulk'});const card=tableBulk.closest('.block-card'),summary=card?.querySelector('.block-title span:last-child');if(summary)summary.textContent=blockSummary(b).slice(0,100)||'暂无内容';return;}
  inlineInputSeen.add(e.target);
  const nestedField=e.target.closest('.container-child-field');if(nestedField){const b=p.blocks[Number(nestedField.dataset.block)],child=b?.columns?.[Number(nestedField.dataset.column)]?.blocks?.[Number(nestedField.dataset.child)];if(!child)return;child[nestedField.dataset.field]=nestedField.value;markInlineInputDirty(nestedField,{group:'container-child'});return;}
  const field = e.target.closest('.block-field'); if (field) { const b = p.blocks[Number(field.dataset.block)]; if (!b) return; const key=field.dataset.field; const value=(field.type === 'number' || field.type === 'range') ? Number(field.value) : field.value; if(b.type==='container'&&key==='layout'){ensureContainerColumns(b,value);syncJsonFromPage();renderBlockList();markDirty({historyGroup:'container-layout',forceHistory:true});}else{b[key]=value;markInlineInputDirty(field,{group:'block-content'});const card = field.closest('.block-card'); const summary = card?.querySelector('.block-title span:last-child'); if (summary) summary.textContent = blockSummary(b).slice(0,100) || '暂无内容';}return; }
  const arrField = e.target.closest('.block-array-field'); if (arrField) { const b = p.blocks[Number(arrField.dataset.block)], item = b?.items?.[Number(arrField.dataset.item)]; if (!item) return; item[arrField.dataset.key] = arrField.type === 'number' ? Number(arrField.value) : arrField.value; markInlineInputDirty(arrField,{group:'block-array'}); return; }
  const strField = e.target.closest('.block-array-string'); if (strField) { const b = p.blocks[Number(strField.dataset.block)]; if (!b?.items) return; b.items[Number(strField.dataset.item)] = strField.value; markInlineInputDirty(strField,{group:'block-array'}); }
});
$('#blockList').addEventListener('change', e => {
  const field=e.target.closest('.container-child-field,.block-field,.block-array-field,.block-array-string,.table-cell-field,.table-bulk-field');if(!field)return;
  if(field.tagName==='SELECT'&&!inlineInputSeen.has(field))field.dispatchEvent(new Event('input',{bubbles:true}));
  finalizeInlineInput(field,{syncJson:true});
  inlineInputSeen.delete(field);
  if(field.classList.contains('table-bulk-field'))renderBlockList();
});
$('#blockList').addEventListener('click', e => {
  const emptyAdd=e.target.closest('[data-empty-add-block]');if(emptyAdd){e.preventDefault();e.stopPropagation();addBlock(emptyAdd.dataset.emptyAddBlock||'paragraph');return;}
  const dragHandle=e.target.closest('.drag-handle');if(dragHandle){e.preventDefault();e.stopPropagation();return;}
  const select=e.target.closest('[data-select-block]');if(select){e.preventDefault();e.stopPropagation();toggleBlockSelection(Number(select.dataset.selectBlock),e);return;}
  const summary=e.target.closest('.block-summary');if(summary&&!e.target.closest('button,.drag-handle')){const card=summary.closest('.block-card'),i=Number(card?.dataset.index);if(Number.isInteger(i))setBlockSelection([i],{anchor:i});return;}
  const btn = e.target.closest('button[data-action]'); if (!btn) return; e.preventDefault(); e.stopPropagation(); const blocks = currentPage()?.blocks; if (!blocks) return; const i = Number(btn.dataset.block); const action = btn.dataset.action;
  if(action.startsWith('table-')){const b=blocks[i];if(!b||b.type!=='table')return;const rows=tableEditorRows(b),cols=rows[0]?.length||1,row=Number(btn.dataset.tableRow),col=Number(btn.dataset.tableCol);if(action==='table-add-row'){if(rows.length>=TABLE_EDITOR_LIMITS.rows)return toast(`表格最多 ${TABLE_EDITOR_LIMITS.rows} 行`);rows.push(Array(cols).fill(''));}else if(action==='table-add-column'){if(cols>=TABLE_EDITOR_LIMITS.cols)return toast(`表格最多 ${TABLE_EDITOR_LIMITS.cols} 列`);rows.forEach(r=>r.push(''));}else if(action==='table-remove-row'){if(rows.length<=1)return toast('表格至少保留 1 行');rows.pop();}else if(action==='table-remove-column'){if(cols<=1)return toast('表格至少保留 1 列');rows.forEach(r=>r.pop());}else if(action==='table-duplicate-row'){if(!Number.isInteger(row)||row<0||row>=rows.length)return;if(rows.length>=TABLE_EDITOR_LIMITS.rows)return toast(`表格最多 ${TABLE_EDITOR_LIMITS.rows} 行`);rows.splice(row+1,0,[...rows[row]]);}else if(action==='table-delete-row'){if(!Number.isInteger(row)||row<0||row>=rows.length)return;if(rows.length<=1)return toast('表格至少保留 1 行');rows.splice(row,1);}else if(action==='table-duplicate-column'){if(!Number.isInteger(col)||col<0||col>=cols)return;if(cols>=TABLE_EDITOR_LIMITS.cols)return toast(`表格最多 ${TABLE_EDITOR_LIMITS.cols} 列`);rows.forEach(r=>r.splice(col+1,0,r[col]||''));}else return; b.rows=rows;b.headerRows=Math.max(0,Math.min(rows.length,Number(b.headerRows)||0));mutateBlocks();return;}
  if (action === 'up') return moveBlock(i,i-1); if (action === 'down') return moveBlock(i,i+1);
  if (action === 'design') { setBlockSelection([i],{anchor:i}); openDesignDialog('block',{blockIndex:i}); return; }
  if (action === 'edit') { const card=btn.closest('.block-card'); if(card) card.open=true; requestAnimationFrame(()=>card?.querySelector('.block-field, .container-child-field, .block-array-field, .block-array-string')?.focus()); return; }
  if (action === 'richtext-reset') { const b=blocks[i];if(!b?.richText)return;if(!confirm('转为纯文本会移除局部粗体、链接、列表、颜色等富文本格式，但保留当前文字内容。继续？'))return;delete b.richText;mutateBlocks();toast('已转为纯文本，可在左侧继续编辑');return; }
  if (action === 'container-child-design') { openDesignDialog('block',{blockIndex:i,columnIndex:Number(btn.dataset.column),childIndex:Number(btn.dataset.child)}); return; }
  if (action === 'duplicate') { if (blocks.length >= LIMITS.blocksPerPage) return toast(`单页最多 ${LIMITS.blocksPerPage} 个内容块`); if(currentPageBlockNodeCount()+countBlockNodes(blocks[i])>LIMITS.totalBlockNodesPerPage)return toast(`复制后会超过单页 ${LIMITS.totalBlockNodesPerPage} 个递归内容块，请先拆分页面`); blocks.splice(i+1,0,clone(blocks[i])); mutateBlocks(); return; }
  if (action === 'delete') { if (!confirm(`删除第 ${i+1} 个“${BLOCK_NAMES[blocks[i]?.type] || blocks[i]?.type}”内容块？`)) return; blocks.splice(i,1); mutateBlocks(); return; }
  if (action === 'container-media-pick') { openMediaDialog({kind:btn.dataset.kind,blockIndex:i,columnIndex:Number(btn.dataset.column),childIndex:Number(btn.dataset.child),field:btn.dataset.field||'src',nested:true}); return; }
  if (action === 'container-add-child') { const b=blocks[i],ci=Number(btn.dataset.column);if(!b?.columns?.[ci])return;const sel=btn.parentElement?.querySelector('.container-add-type');const type=sel?.value||'paragraph';if(b.columns[ci].blocks.length>=20)return toast('单列最多 20 个子块');if(currentPageBlockNodeCount()>=LIMITS.totalBlockNodesPerPage)return toast(`单页递归内容块总数最多 ${LIMITS.totalBlockNodesPerPage} 个，请拆分页面`);b.columns[ci].blocks.push(defaultBlock(type));mutateBlocks();return; }
  if (action === 'container-child-delete' || action === 'container-child-up' || action === 'container-child-down') { const b=blocks[i],ci=Number(btn.dataset.column),bi=Number(btn.dataset.child),arr=b?.columns?.[ci]?.blocks;if(!arr)return;if(action==='container-child-delete'){arr.splice(bi,1);}else{const to=bi+(action==='container-child-up'?-1:1);if(to<0||to>=arr.length)return;[arr[bi],arr[to]]=[arr[to],arr[bi]];}mutateBlocks();return; }
  if (action === 'media-pick') { setBlockSelection([i],{anchor:i}); openMediaDialog({kind:btn.dataset.kind,blockIndex:i,field:btn.dataset.field||'src'}); return; }
  if (action === 'image-adjust') { openImageAdjust(i); return; }
  if (action === 'video-poster') { generatePosterForBlock(i); return; }
  if (action === 'array-remove') { const b = blocks[i]; if (!b?.items) return; b.items.splice(Number(btn.dataset.item),1); mutateBlocks(); return; }
  if (action === 'array-add') { const b = blocks[i]; if (!b) return; b.items ||= []; if (b.items.length >= LIMITS.arrayItems) return toast(`单个内容块最多 ${LIMITS.arrayItems} 个条目`); const k = btn.dataset.arrayKind; b.items.push(k==='toc'?{number:String(b.items.length+1).padStart(2,'0'),title:'新栏目',subtitle:'',page:1}:k==='chips'?{text:'新标签',tone:''}:k==='cards'?{title:'新卡片',text:''}:'新栏目'); mutateBlocks(); }
});
$('#blockList').addEventListener('dragstart', e => { const handle=e.target.closest('.drag-handle'); const card = handle?.closest('.block-card'); if (!handle || !card) return; state.dragIndex = Number(card.dataset.index); card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(state.dragIndex)); });
$('#blockList').addEventListener('dragend', e => { e.target.closest('.block-card')?.classList.remove('dragging'); document.querySelectorAll('.block-card.drag-over').forEach(x=>x.classList.remove('drag-over')); state.dragIndex = null; });
$('#blockList').addEventListener('dragover', e => { const card = e.target.closest('.block-card'); if (!card || state.dragIndex == null) return; e.preventDefault(); document.querySelectorAll('.block-card.drag-over').forEach(x=>x.classList.remove('drag-over')); card.classList.add('drag-over'); });
$('#blockList').addEventListener('drop', e => { const card = e.target.closest('.block-card'); if (!card || state.dragIndex == null) return; e.preventDefault(); const to = Number(card.dataset.index), from = state.dragIndex; state.dragIndex = null; moveBlock(from,to); });

function setEditorMode(mode,{commit=true}={}) {
  if (!['visual','json'].includes(mode)) return false;
  if (mode === 'visual' && state.editorMode === 'json' && commit && !syncJsonToPage()) return false;
  if (mode === 'json') syncJsonFromPage(); state.editorMode = mode;
  $('#visualEditor').classList.toggle('hidden', mode !== 'visual'); $('#jsonEditor').classList.toggle('hidden', mode !== 'json'); $('#visualModeBtn').classList.toggle('active', mode === 'visual'); $('#jsonModeBtn').classList.toggle('active', mode === 'json');
  if (mode === 'visual') renderBlockList(); renderPreview(); return true;
}
$('#visualModeBtn').onclick = () => setEditorMode('visual'); $('#jsonModeBtn').onclick = () => setEditorMode('json');

function renderPalette() { $('#blockPalette').innerHTML = BLOCK_LIBRARY.map(([id,name,desc]) => `<button class="palette-item" type="button" data-type="${id}"><b>${escText(name)}</b><span>${escText(desc)}</span></button>`).join(''); }
function openBlockDialog() { if (!currentPage()) return; renderPalette(); $('#blockDialog').showModal(); }
$('#addBlockBtn').onclick = openBlockDialog; $('#addLayoutBtn').onclick = () => addBlock('container'); $('#addBlockBottom').onclick = openBlockDialog; $('#blockPalette').addEventListener('click', e => { const b = e.target.closest('[data-type]'); if (!b) return; addBlock(b.dataset.type); $('#blockDialog').close(); });

function previewBlock(b) {
  switch (b?.type) {
    case 'paragraph': return `<p class="${escText(b.style || 'body')}">${escText(b.text || '')}</p>`;
    case 'quote': return `<div class="quote">${b.title?`<strong>${escText(b.title)}</strong><br>`:''}${escText(b.text || '')}</div>`;
    case 'table': {const rows=(b.rows||[]).slice(0,5),heads=Math.max(0,Math.min(rows.length,Number(b.headerRows)||0)),style=['plain','striped','accent'].includes(b.tableStyle)?b.tableStyle:'plain';return `<div class="mini-table mini-table-${style}"><table>${rows.map((r,ri)=>`<tr>${(r||[]).slice(0,5).map(c=>ri<heads?`<th>${escText(c||'')}</th>`:`<td>${escText(c||'')}</td>`).join('')}</tr>`).join('')}</table></div>`;}
    case 'textFlow': return `<div class="mini-text-flow">${b.title?`<strong>${escText(b.title)}</strong>`:''}<p>${escText(b.text || '')}</p></div>`;
    case 'pullQuote': return `<blockquote class="mini-pull-quote">${b.title?`<strong>${escText(b.title)}</strong>`:''}<p>${escText(b.text || '')}</p>${b.attribution?`<small>${escText(b.attribution)}</small>`:''}</blockquote>`;
    case 'sidebar': return `<aside class="mini-sidebar">${b.title?`<strong>${escText(b.title)}</strong>`:''}<p>${escText(b.text || '')}</p></aside>`;
    case 'sectionHeading': return `<div class="mini-section-heading"><small>${escText(b.kicker || b.label || '')}</small><h3>${escText(b.title || b.text || '')}</h3></div>`;
    case 'chips': return `<div class="chips">${(b.items||[]).map(x=>`<span class="chip ${escText(x.tone||'')}">${escText(x.text||'')}</span>`).join('')}</div>`;
    case 'cardline': return `<div class="mini-cardline ${b.tone==='green'?'green':''}"><span class="mini-badge">${escText(b.badge||'•')}</span><div><h3>${escText(b.title||'')}</h3><p>${escText(b.text||'')}</p></div></div>`;
    case 'casePair': return `<div class="mini-case"><div><h3>案例</h3><p>${escText(b.case||'')}</p></div><div class="warn"><h3>警示</h3><p>${escText(b.warning||'')}</p></div></div>`;
    case 'toc': return `<div class="mini-toc">${(b.items||[]).map(x=>`<div><b>${escText(x.number||'')}</b><span><strong>${escText(x.title||'')}</strong><small>${escText(x.subtitle||'')} · P${escText(x.page||'')}</small></span></div>`).join('')}</div>`;
    case 'articleLink': {const article=state.issue?.articles?.[b.articleId]||{};return `<span class="mini-link">${escText(b.title||article.linkTitle||article.title||'查看链接内容')} ↗</span>`;}
    case 'image': {const ratio=['16:9','4:3','3:2','1:1'].includes(b.frameRatio)?b.frameRatio:'auto';const ratioCss=ratio==='auto'?'':`aspect-ratio:${ratio.replace(':',' / ')};`;const h=ratio==='auto'?'height:auto;':'height:100%;';return `<div class="mini-media"><div class="mini-image-frame" data-ratio="${escText(ratio)}" style="${ratioCss}"><img src="${escText(issueAssetUrl(b.src||''))}" alt="${escText(b.alt||'')}" style="object-fit:${b.fit==='cover'?'cover':'contain'};object-position:${Math.max(0,Math.min(100,Number(b.positionX??50)))}% ${Math.max(0,Math.min(100,Number(b.positionY??50)))}%;${h}" onerror="this.style.display='none';this.nextElementSibling?.classList.remove('hidden')"><div class="mini-video hidden">图片：${escText(b.src||'')}</div></div>${b.caption?`<div class="mini-caption">${escText(b.caption)}</div>`:''}</div>`;}
    case 'video': return `<div class="mini-media"><div class="mini-video"${b.poster?` style="background-image:linear-gradient(#0004,#0004),url('${escText(issueAssetUrl(b.poster))}');background-size:cover;background-position:center"`:''}></div>${b.caption?`<div class="mini-caption">${escText(b.caption)}</div>`:''}</div>`;
    case 'coverMeta': return `<p>${escText(b.text||'')}</p>`;
    case 'coverSections': return `<div class="mini-sections">${(b.items||[]).map(x=>`<span>${escText(x)}</span>`).join('')}</div>`;
    case 'blessing': return `<div class="blessing">${escText(b.text||'')}</div>`;
    case 'producer': return `<div class="producer">${escText(b.text||'')}</div>`;
    case 'cards': return (b.items||[]).map(x=>`<div class="quote"><strong>${escText(x.title||'')}</strong><br>${escText(x.text||'')}</div>`).join('');
    case 'container': return `<div class="mini-layout mini-layout-${escText(b.layout||'two-equal')}">${(b.columns||[]).map((col,ci)=>`<div class="mini-layout-col" data-col="${ci+1}">${(col.blocks||[]).map(previewBlock).join('')}</div>`).join('')}</div>`;
    default: return '';
  }
}
function renderPreview({syncReader=true}={}) {
  const p = currentPage(), el = $('#pagePreview'); if (!p || !el) return; const blocks = p.blocks || [];
  el.className = `mini-page ${escText(p.type || 'article')}`; el.innerHTML = `<div class="mini-kicker">${escText(p.kicker || '')}</div>${p.type==='cover'?`<h1>${escText(p.title||'未命名封面')}</h1>`:`<h2>${escText(p.title||'未命名页面')}</h2>`}<div class="mini-content">${blocks.map(previewBlock).join('')}</div>`;
  requestAnimationFrame(() => { const overflow = el.scrollHeight > el.clientHeight + 3; if(state.previewMode==='quick'){ $('#previewOverflow').textContent = overflow ? '内容密度偏高' : '布局正常'; $('#previewOverflow').className = `preview-status ${overflow ? 'warning' : 'ok'}`; } if (overflow) el.insertAdjacentHTML('beforeend','<span class="preview-overflow-marker">可能溢出</span>'); }); if(syncReader&&state.previewMode==='built')syncReaderPreviewPage();
}


function pageFromTemplate(kind) {
  const publisher=state.issue?.publisher||'请填写制作单位';
  const base={type:kind,navTitle:PAGE_TEMPLATE_NAMES[kind]||'新页面',section:'',kicker:'',title:PAGE_TEMPLATE_NAMES[kind]||'新页面',blocks:[]};
  switch(kind){
    case 'article': return {...base,type:'article',navTitle:'通用文章',title:'请填写文章标题',blocks:[{type:'paragraph',style:'body',text:'请填写正文内容。'},{type:'quote',text:'请填写重点提示或引言。'}]};
    case 'news': return {...base,navTitle:'时政资讯',section:'时政要闻',kicker:'时政要闻',title:'请填写资讯标题',blocks:[{type:'paragraph',style:'lead',text:'请填写资讯导语。'},{type:'paragraph',style:'xsmall',text:'请填写资讯正文。'}]};
    case 'theory': return {...base,navTitle:'理论学习',section:'理论学习',kicker:'政治理论学习',title:'请填写学习标题',blocks:[{type:'paragraph',style:'lead',text:'请填写学习导语。'},{type:'paragraph',style:'small',text:'请填写理论学习正文。'}]};
    case 'safety': return {...base,navTitle:'反诈防骗',section:'反诈防骗',kicker:'反诈微课堂',title:'请填写安全提示标题',blocks:[{type:'quote',text:'请填写本页提示。'},...['1','2','3'].map((badge,i)=>({type:'cardline',badge,title:['案例回放','诈骗套路','防骗提醒'][i],text:'请填写内容。',tone:'default'}))]};
    case 'discipline': return {...base,navTitle:'警示教育',section:'警示教育',kicker:'警示教育｜以案为鉴',title:'请填写警示教育标题',blocks:[{type:'quote',text:'请填写案例主题。'},{type:'casePair',case:'请填写案例内容。',warning:'请填写警示内容。'}]};
    case 'health': return {...base,navTitle:'时令养生',section:'时令养生',kicker:'时令养生',title:'请填写养生主题',blocks:[{type:'paragraph',style:'small',text:'请填写养生正文。'},{type:'cardline',badge:'1',title:'注意事项',text:'请填写注意事项。',tone:'green'}]};
    case 'image': return {...base,type:'article',navTitle:'图文页面',title:'请填写图文标题',blocks:[{type:'paragraph',style:'body',text:'请填写图片说明正文。'},{type:'image',src:'',alt:'请填写图片替代文字',caption:'',frameRatio:'auto',fit:'contain',positionX:50,positionY:50}]};
    case 'video': return {...base,type:'article',navTitle:'视频页面',title:'请填写视频标题',blocks:[{type:'paragraph',style:'body',text:'请填写视频导语。'},{type:'video',src:'',poster:'',caption:'请上传或选择视频'}]};
    case 'layout-two': return {...base,type:'article',navTitle:'双栏专题',title:'请填写双栏专题标题',blocks:[{type:'container',layout:'two-equal',gap:'md',align:'start',mobile:'stack',columns:[{blocks:[{type:'paragraph',style:'subhead',text:'观点一'},{type:'paragraph',style:'body',text:'请填写左栏内容。'}]},{blocks:[{type:'paragraph',style:'subhead',text:'观点二'},{type:'paragraph',style:'body',text:'请填写右栏内容。'}]}]}]};
    case 'layout-media': return {...base,type:'article',navTitle:'图文专题',title:'请填写图文专题标题',blocks:[{type:'container',layout:'media-left',gap:'lg',align:'center',mobile:'stack',columns:[{blocks:[{type:'image',src:'',alt:'请填写图片替代文字',caption:'',frameRatio:'4:3',fit:'cover',positionX:50,positionY:50}]},{blocks:[{type:'paragraph',style:'lead',text:'请填写图文导语。'},{type:'paragraph',style:'body',text:'请填写正文内容。'}]}]}]};
    case 'layout-three': return {...base,type:'article',navTitle:'三栏速览',title:'请填写三栏速览标题',blocks:[{type:'container',layout:'three-equal',gap:'sm',align:'start',mobile:'stack',columns:[1,2,3].map(n=>({blocks:[{type:'cardline',badge:String(n),title:`要点 ${n}`,text:'请填写简短要点。',tone:'default'}]}))}]};
    case 'closing': return {...base,type:'closing',navTitle:'尾刊寄语',kicker:'编后寄语',title:'本期寄语',blocks:[{type:'paragraph',style:'body',text:'请填写本期尾刊寄语。'},{type:'blessing',text:'祝愿各位老干部身体健康、阖家幸福！'},{type:'producer',text:`${publisher}制作`}]};
    default: return pageFromTemplate('article');
  }
}
function newBlankPage(){
  const page={id:createStableId('page'),type:'article',navTitle:'新页面',section:'',kicker:'',title:'新页面',blocks:[]};
  return page;
}
function insertPageAfterCurrent(page=newBlankPage(),{historyGroup='page-insert',message='已插入新页'}={}){
  if(!state.issue||!Array.isArray(state.issue.pages)||!page)return false;
  if(state.issue.pages.length>=LIMITS.pages)return toast(`页面已达到制作中心上限 ${LIMITS.pages} 页`),false;
  const at=Math.min(state.issue.pages.length,Math.max(0,state.page+1));
  const closing=state.issue.pages.findIndex(p=>p?.type==='closing');
  const insertAt=closing>=0&&at>closing?closing:at;
  state.issue.pages.splice(insertAt,0,page);
  state.page=insertAt;
  state.readerTargetPage=insertAt;
  state.selectedBlocks.clear();
  state.selectedBlockIds.clear();
  state.lastSelectedBlock=null;
  state.pageSearch='';
  const search=$('#pageSearch');
  if(search)search.value='';
  state.selectedPages.clear();
  markDirty({historyGroup,forceHistory:true});
  renderPages();
  renderPage();
  syncWorkspaceRoute();
  broadcastPeer('presence');
  requestAnimationFrame(()=>document.querySelector(`.page-item[data-page-index="${state.page}"]`)?.scrollIntoView({block:'nearest'}));
  toast(message);
  return true;
}
function insertBlankPage(event){
  // Page insertion should behave like a slide editor: an unfinished field or
  // invalid advanced JSON on the current page must not make the button appear
  // dead.  Keep the editable page metadata, preserve its existing block data
  // when JSON cannot be applied, and always move focus to the new page.
  event?.preventDefault?.();
  if(!requireIssue('请先选择可编辑期刊'))return false;
  let jsonBlocked=false;
  try{
    syncPageMeta();
    if(state.editorMode==='json'&&!syncJsonToPage({notify:false}))jsonBlocked=true;
  }catch(error){
    jsonBlocked=true;
    console.error('[Studio] insert page commit skipped',error);
  }
  try{
    const inserted=insertPageAfterCurrent(newBlankPage(),{message:'已插入新页'});
    if(inserted&&jsonBlocked)toast('已插入新页；当前页高级 JSON 仍有格式问题，请稍后修正',3600);
    return inserted;
  }catch(error){
    console.error('[Studio] insert page failed',error);
    toast(`插入新页失败：${error?.message||'请刷新后重试'}`,3600);
    return false;
  }
}
function pageTemplatePreview(id){
  const layouts={
    article:'<i class="tpl-kicker"></i><i class="tpl-title"></i><i class="tpl-text"></i><i class="tpl-text short"></i><i class="tpl-text"></i>',
    news:'<i class="tpl-kicker"></i><i class="tpl-title"></i><i class="tpl-text short"></i><i class="tpl-divider"></i><i class="tpl-text"></i><i class="tpl-text"></i>',
    theory:'<i class="tpl-kicker"></i><i class="tpl-title"></i><i class="tpl-quote"></i><i class="tpl-text"></i><i class="tpl-text short"></i>',
    safety:'<i class="tpl-kicker"></i><i class="tpl-title"></i><i class="tpl-card"></i><i class="tpl-card"></i><i class="tpl-card"></i>',
    discipline:'<i class="tpl-kicker"></i><i class="tpl-title"></i><i class="tpl-columns"></i><i class="tpl-columns"></i>',
    health:'<i class="tpl-kicker"></i><i class="tpl-title green"></i><i class="tpl-text"></i><i class="tpl-card green"></i><i class="tpl-card green"></i>',
    image:'<i class="tpl-kicker"></i><i class="tpl-title"></i><i class="tpl-media"></i><i class="tpl-text short"></i>',
    video:'<i class="tpl-kicker"></i><i class="tpl-title"></i><i class="tpl-media dark"></i><i class="tpl-text short"></i>',
    'layout-two':'<i class="tpl-kicker"></i><i class="tpl-title"></i><i class="tpl-two-col"></i>',
    'layout-media':'<i class="tpl-kicker"></i><i class="tpl-title"></i><i class="tpl-media-side"></i><i class="tpl-text side"></i>',
    'layout-three':'<i class="tpl-kicker"></i><i class="tpl-title"></i><i class="tpl-three-col"></i>',
    closing:'<i class="tpl-kicker"></i><i class="tpl-title gold"></i><i class="tpl-text"></i><i class="tpl-quote gold"></i><i class="tpl-text short"></i>'
  };
  return `<span class="template-thumbnail template-${escText(id)}" aria-hidden="true">${layouts[id]||layouts.article}</span>`;
}
function renderPageTemplatePalette() { $('#pageTemplatePalette').innerHTML=PAGE_TEMPLATES.map(([id,name,desc])=>`<button type="button" class="page-template-item" data-template="${id}">${pageTemplatePreview(id)}<span class="page-template-copy"><b>${escText(name)}</b><span>${escText(desc)}</span><small class="template-use-hint">${state.pageTemplateMode==='replace'?'替换当前页面':'插入到当前页后'}</small></span></button>`).join(''); }
async function loadUserTemplates(){try{const r=await api('/api/templates');state.userTemplates=Array.isArray(r.templates)?r.templates:[]}catch{state.userTemplates=[]}renderUserTemplates();}
function renderUserTemplates(){const box=$('#userTemplatePalette');if(!box)return;$('#userTemplateCount').textContent=`${state.userTemplates.length} / 50`;if(!state.userTemplates.length){box.innerHTML='<div class="template-empty">还没有“我的模板”。可将当前页保存为模板，媒体与文章绑定会自动清空。</div>';return;}box.innerHTML=state.userTemplates.map(t=>{const type=PAGE_TEMPLATE_NAMES[t.page?.type]?t.page.type:'article';return `<div class="user-template-row"><button type="button" class="page-template-item" data-user-template="${escText(t.id)}">${pageTemplatePreview(type)}<span class="page-template-copy"><b>${escText(t.name)}</b><span>${escText(t.page?.type||'article')} · ${escText(t.page?.section||'未归类')}</span><small class="template-use-hint">${state.pageTemplateMode==='replace'?'替换当前页面':'插入到当前页后'}</small></span></button><button type="button" class="danger-lite template-delete" data-delete-user-template="${escText(t.id)}" title="删除模板">×</button></div>`;}).join('');}
async function openPageTemplateDialog(mode='add') {
  if(!requireIssue('请先选择可编辑期刊')||!commitPage())return; if(mode==='add'&&state.issue.pages.length>=LIMITS.pages)return toast(`页面已达到制作中心上限 ${LIMITS.pages} 页`);
  if(mode==='replace'&&['cover','closing'].includes(currentPage()?.type))return toast('封面和尾页属于结构边界页，不建议套用普通模板；请直接编辑内容。',2800);
  state.pageTemplateMode=mode; $('#pageTemplateTitle').textContent=mode==='replace'?'套用到当前页':'添加模板页面'; renderPageTemplatePalette(); await loadUserTemplates(); $('#pageTemplateDialog').showModal();
}
$('#pageTemplatePalette').addEventListener('click',e=>{
  const b=e.target.closest('[data-template]'); if(!b)return; const kind=b.dataset.template, page=pageFromTemplate(kind);
  if(state.pageTemplateMode==='replace') { if(!confirm(`套用“${PAGE_TEMPLATE_NAMES[kind]}”会替换当前页的页面字段和全部内容块，是否继续？`))return; const old=currentPage(); page.section=old.section||page.section; state.issue.pages[state.page]=page; }
  else { if(kind==='closing'&&state.issue.pages.some(p=>p.type==='closing'))return toast('当前期刊已有尾刊寄语页，请编辑现有尾页或先调整其页面类型。',2800); let at=Math.min(state.issue.pages.length,state.page+1); const closing=state.issue.pages.findIndex(p=>p.type==='closing'); if(closing>=0&&at>closing)at=closing; state.issue.pages.splice(at,0,page); state.page=at; }
  $('#pageTemplateDialog').close(); state.pageSearch=''; $('#pageSearch').value=''; markDirty({historyGroup:'page-template',forceHistory:true}); renderPages(); renderPage(); requestAnimationFrame(()=>document.querySelector(`.page-item[data-page-index="${state.page}"]`)?.scrollIntoView({block:'nearest'}));
});
$('#userTemplatePalette').addEventListener('click',async e=>{
  const del=e.target.closest('[data-delete-user-template]'); if(del){const id=del.dataset.deleteUserTemplate;const t=state.userTemplates.find(x=>x.id===id);if(!confirm(`删除我的模板“${t?.name||id}”？`))return;try{await api(`/api/templates/${encodeURIComponent(id)}`,{method:'DELETE'});await loadUserTemplates();toast('模板已删除');}catch(err){toast(err.message,3000)}return;}
  const b=e.target.closest('[data-user-template]');if(!b)return;const t=state.userTemplates.find(x=>x.id===b.dataset.userTemplate);if(!t?.page)return;const page=cloneData(t.page);
  if(state.pageTemplateMode==='replace'){if(!confirm(`套用“${t.name}”会替换当前页页面字段和全部内容块，是否继续？`))return;const old=currentPage();page.section=old.section||page.section;state.issue.pages[state.page]=page;}else{let at=Math.min(state.issue.pages.length,state.page+1);const closing=state.issue.pages.findIndex(p=>p.type==='closing');if(closing>=0&&at>closing)at=closing;state.issue.pages.splice(at,0,page);state.page=at;}
  $('#pageTemplateDialog').close();state.pageSearch='';$('#pageSearch').value='';markDirty({historyGroup:'user-template',forceHistory:true});renderPages();renderPage();toast(`已应用模板：${t.name}`);
});
$('#saveCurrentTemplate').onclick=async()=>{if(!state.issue||!commitPage())return;const page=currentPage();if(!page)return;const name=prompt('模板名称：',`${page.section||page.navTitle||page.title||'页面'}模板`);if(name==null)return;try{await api('/api/templates',{method:'POST',body:JSON.stringify({name:name.trim(),page})});await loadUserTemplates();toast('已保存到“我的模板”');}catch(e){toast(e.message,3200)}};
$('#myTemplatesBtn').onclick=()=>openPageTemplateDialog('add');

function flattenLayoutContent(blocks=[]){
  const out=[];
  for(const block of blocks||[]){
    if(block?.type==='container')for(const column of block.columns||[])out.push(...flattenLayoutContent(column?.blocks||[]));
    else if(block)out.push(cloneData(block));
  }
  return out;
}
function layoutContainer(layout,columns,{gap='md',align='start',mobile='stack',design=null}={}){
  const block={type:'container',layout,gap,align,mobile,columns:columns.map(blocks=>({blocks}))};
  if(design&&Object.keys(design).length)block.design=cloneData(design);
  return block;
}
function chunkLayoutUnits(units,size){const out=[];for(let i=0;i<units.length;i+=size)out.push(units.slice(i,i+size));return out;}
function buildTwoColumnLayout(units,layout='two-equal'){
  const out=[];for(const batch of chunkLayoutUnits(units,40)){const pivot=Math.ceil(batch.length/2);out.push(layoutContainer(layout,[batch.slice(0,pivot),batch.slice(pivot)]));}return out;
}
function buildThreeColumnLayout(units){
  const out=[];for(const batch of chunkLayoutUnits(units,60)){const cols=[[],[],[]];batch.forEach((b,i)=>cols[i%3].push(b));out.push(layoutContainer('three-equal',cols));}return out;
}
function buildSingleLayout(units){return chunkLayoutUnits(units,20).map(batch=>layoutContainer('single',[batch]));}
function buildMediaLayout(units,side='left'){
  if(!units.length)return [];
  const mediaIndex=units.findIndex(x=>['image','video'].includes(x?.type));if(mediaIndex<0)return buildTwoColumnLayout(units,side==='left'?'two-40-60':'two-60-40');
  const media=units[mediaIndex],rest=units.filter((_,i)=>i!==mediaIndex),first=rest.slice(0,20),tail=rest.slice(20);
  const cols=side==='left'?[[media],first]:[first,[media]];const out=[layoutContainer(side==='left'?'media-left':'media-right',cols,{gap:'lg',align:'center'})];
  if(tail.length)out.push(...buildTwoColumnLayout(tail));return out;
}
function buildLayoutFromPreset(id,sourceBlocks=currentPage()?.blocks||[]){
  const units=flattenLayoutContent(sourceBlocks);if(!units.length)return [];
  if(id==='single-focus')return buildSingleLayout(units);
  if(id==='lead-two'){const [lead,...rest]=units;return [lead,...buildTwoColumnLayout(rest)];}
  if(id==='two-balanced')return buildTwoColumnLayout(units);
  if(id==='media-left')return buildMediaLayout(units,'left');
  if(id==='media-right')return buildMediaLayout(units,'right');
  if(id==='three-brief')return buildThreeColumnLayout(units);
  throw new Error(`未知版式 ${id}`);
}
function layoutBlueprintFromPage(page=currentPage()){
  let slots=0;
  const nodes=(page?.blocks||[]).map(block=>{
    if(block?.type!=='container'){slots++;return {kind:'slot'};}
    const node={kind:'container',layout:block.layout||'two-equal',gap:block.gap||'md',align:block.align||'start',mobile:block.mobile||'stack',columns:(block.columns||[]).map(column=>({nodes:(column?.blocks||[]).map(()=>{slots++;return {kind:'slot'};})}))};
    if(block.design&&Object.keys(block.design).length)node.design=cloneData(block.design);return node;
  });
  return {pageDesign:cloneData(page?.design||{}),nodes,slotCount:slots};
}
function buildFromLayoutBlueprint(blueprint,sourceBlocks=currentPage()?.blocks||[]){
  const units=flattenLayoutContent(sourceBlocks),queue=units.map(cloneData),out=[];
  const take=()=>queue.shift()||null;
  for(const node of blueprint?.nodes||[]){
    if(node.kind==='slot'){const block=take();if(block)out.push(block);continue;}
    if(node.kind==='container'){
      const cols=(node.columns||[]).map(col=>({blocks:(col.nodes||[]).map(()=>take()).filter(Boolean)}));
      if(cols.some(x=>x.blocks.length))out.push(layoutContainer(node.layout,cols,{gap:node.gap,align:node.align,mobile:node.mobile,design:node.design||null}));
    }
  }
  if(queue.length)out.push(...buildSingleLayout(queue));
  return out;
}
function pageLayoutProfile(page=currentPage()){
  if(SMART_LAYOUT_RECOMMENDER?.analyzeSmartLayoutProfile){
    const metric=page===currentPage()?currentVisualMetric():null,profile=SMART_LAYOUT_RECOMMENDER.analyzeSmartLayoutProfile(page||{},{visualMetric:metric});
    return {...profile,textChars:profile.bodyChars,cards:profile.cards};
  }
  const units=flattenLayoutContent(page?.blocks||[]);let media=0,cards=0,textChars=0,paragraphs=0,quotes=0,points=0;
  for(const block of units){if(['image','video'].includes(block?.type))media++;if(['cardline','cards','chips','casePair'].includes(block?.type))cards++;if(['paragraph','quote'].includes(block?.type))paragraphs++;if(['quote','pullQuote'].includes(block?.type))quotes++;if(block?.type==='cardline')points++;if(['cards','chips'].includes(block?.type))points+=(block.items||[]).length;for(const key of ['text','title','case','warning','caption'])textChars+=String(block?.[key]||'').length;}
  return {units:units.length,media,cards,paragraphs,textChars,bodyChars:textChars,quotes,points,titleChars:String(page?.title||page?.navTitle||'').length,containers:(page?.blocks||[]).filter(x=>x?.type==='container').length,semantic:page?.type||'article',visualHealth:'unknown',fillRatio:0,textFlowSlots:units.filter(x=>x?.type==='textFlow').length};
}
function analyzeLayoutSuggestions(page=currentPage()){
  if(SMART_LAYOUT_RECOMMENDER?.recommendSmartLayouts){
    const metric=page===currentPage()?currentVisualMetric():null;
    return SMART_LAYOUT_RECOMMENDER.recommendSmartLayouts(page||{},{visualMetric:metric}).map(rec=>({
      id:rec.preset,recommendationId:rec.id,score:rec.score,confidence:rec.confidence,name:rec.name,presetName:LAYOUT_PRESET_MAP[rec.preset]?.name||rec.preset,desc:LAYOUT_PRESET_MAP[rec.preset]?.desc||'',reason:rec.reasons?.[0]||'',reasons:rec.reasons||[],recommendedPages:rec.recommendedPages,columns:rec.columns,columnGap:rec.columnGap,readerMode:rec.readerMode,publishing:rec.publishing,requiresPagination:rec.requiresPagination,profile:rec.profile
    }));
  }
  const p=pageLayoutProfile(page),scores=new Map(),why=new Map();const add=(id,score,reason)=>{if(score>(scores.get(id)||-1)){scores.set(id,score);why.set(id,reason);}};
  if(p.media)add('media-left',100,'检测到图片/视频，图文并列能减少上下跳读');
  if(p.media)add('media-right',92,'检测到图片/视频，可用右侧视觉锚点形成替代版式');
  if(p.cards>=3)add('three-brief',95,'卡片/要点较多，三栏可提高信息扫描效率');
  if(p.textChars>=900)add('two-balanced',94,'正文较长，双栏可缩短单行阅读距离');
  if(p.units>=5)add('two-balanced',88,'内容块较多，均衡双栏能减少纵向滚动');
  if(p.units>=3)add('lead-two',84,'有多个内容块，可保留首屏重点后分流阅读');
  if(p.units<=3)add('single-focus',96,'内容较少，单栏聚焦比复杂布局更稳妥');
  add('single-focus',60,'保守方案：按原内容顺序保持单栏阅读');add('lead-two',58,'通用方案：首个内容块突出，其余内容分栏');
  return [...scores].map(([id,score])=>({id,score,recommendationId:`fallback-${id}`,reason:why.get(id),reasons:[why.get(id)],recommendedPages:1,columns:id==='three-brief'?3:(id==='single-focus'?1:2),readerMode:'通用阅读',...LAYOUT_PRESET_MAP[id]})).sort((a,b)=>b.score-a.score).slice(0,3);
}
function layoutMiniMarkup(id){const cols=id==='three-brief'?3:(id==='single-focus'?1:2);const lead=id==='lead-two'?'<i class="layout-mini-lead"></i>':'';const media=['media-left','media-right'].includes(id)?`<i class="layout-mini-media ${id.endsWith('right')?'right':''}"></i>`:'';return `<span class="layout-mini layout-mini-${escText(id)}">${lead}${media}${Array.from({length:cols},()=>'<i></i>').join('')}</span>`;}
function renderLayoutPresetCards(){
  const p=$('#layoutPresetList');if(p)p.innerHTML=LAYOUT_PRESETS.map(x=>`<button type="button" class="layout-card" data-layout-preset="${x.id}">${layoutMiniMarkup(x.id)}<span><b>${escText(x.name)}</b><small>${escText(x.desc)}</small></span></button>`).join('');
  state.layoutSuggestions=analyzeLayoutSuggestions();const s=$('#layoutSuggestionList');if(s)s.innerHTML=state.layoutSuggestions.map((x,i)=>`<button type="button" class="layout-card suggested smart-layout-card" data-layout-recommendation="${escText(x.recommendationId)}" data-layout-preset="${x.id}"><em>${i===0?'首选':`建议 ${i+1}`}</em>${layoutMiniMarkup(x.id)}<span class="smart-layout-copy"><b>${escText(x.name)}</b><small>${escText(x.reason)}</small><span class="smart-layout-meta"><i>${Number(x.recommendedPages||1)} 页</i><i>${Number(x.columns||1)} 栏</i><i>${escText(x.readerMode||'通用阅读')}</i><i>${x.confidence==='high'?'高匹配':x.confidence==='medium'?'中匹配':'可尝试'}</i></span><span class="smart-layout-reasons">${(x.reasons||[]).slice(1,3).map(r=>`<i>· ${escText(r)}</i>`).join('')}</span>${x.requiresPagination?'<strong class="smart-layout-note">建议跨页：套版后可用 Alpha23 文本流续排</strong>':''}</span></button>`).join('');
  const profile=pageLayoutProfile(),health=profile.visualHealth==='dense'?'偏密':profile.visualHealth==='sparse'?'留白多':profile.visualHealth==='good'?'正常':'待测量';$('#layoutInsightTitle').textContent=`${currentPage()?.title||currentPage()?.navTitle||'当前页'} · 智能内容指纹`;$('#layoutInsightText').textContent=`标题 ${profile.titleChars||0} 字 · 正文 ${profile.bodyChars??profile.textChars??0} 字 · ${profile.semantic||'general'} 语义 · Reader ${health}。推荐只改变布局与出版参数，不改正文事实源。`;$('#layoutInsightMetrics').innerHTML=[['正文',`${profile.bodyChars??profile.textChars??0} 字`],['媒体',`${profile.media||0}`],['引用',`${profile.quotes||0}`],['要点',`${profile.points||0}`],['内容单元',`${profile.units||0}`],['填充',profile.fillRatio?`${Math.round(profile.fillRatio*100)}%`:'--']].map(([a,b])=>`<span><small>${a}</small><b>${b}</b></span>`).join('');
}
async function loadLayoutAssets(){try{const r=await api('/api/layout-library');state.layoutAssets=Array.isArray(r.layouts)?r.layouts:[];state.layoutAssetsLoaded=true;}catch{state.layoutAssets=[];state.layoutAssetsLoaded=true;}renderLayoutAssets();}
function renderLayoutAssets(){const list=$('#layoutAssetList'),count=$('#layoutAssetCount');if(!list||!count)return;count.textContent=`${state.layoutAssets.length} / 40`;if(!state.layoutAssets.length){list.innerHTML='<div class="layout-asset-empty">还没有“我的版式”。可将当前页的容器结构保存为跨期布局骨架。</div>';return;}list.innerHTML=state.layoutAssets.map(x=>`<div class="layout-asset-row"><button type="button" data-layout-asset="${escText(x.id)}">${layoutMiniMarkup(x.previewPreset||'two-balanced')}<span><b>${escText(x.name)}</b><small>${escText(x.contextType||'page')} · ${Number(x.blueprint?.slotCount||0)} 个槽位</small></span></button><button type="button" class="danger-lite" data-delete-layout-asset="${escText(x.id)}" title="删除版式">×</button></div>`).join('');}
async function openLayoutLab(){if(!state.issue||!commitPage())return;if(['cover','toc','closing'].includes(currentPage()?.type))return toast('封面、目录和尾页属于结构边界页，请使用专用模板或直接编辑。',3000);renderLayoutPresetCards();await loadLayoutAssets();$('#layoutLabDialog').showModal();}
function applyLayoutPreset(id){const preset=LAYOUT_PRESET_MAP[id];if(!preset)return;const page=currentPage(),before=flattenLayoutContent(page.blocks||[]);if(!before.length)return toast('当前页没有可套版的内容');const next=buildLayoutFromPreset(id,page.blocks||[]);page.blocks=next;markDirty({historyGroup:`layout-preset:${id}`,forceHistory:true});syncJsonFromPage();renderBlockList();renderPreview();renderLayoutPresetCards();toast(`已套用：${preset.name}；正文与媒体保持不变`);}
function applySmartLayoutRecommendation(recommendationId){const rec=state.layoutSuggestions.find(x=>x.recommendationId===recommendationId);if(!rec)return;const preset=LAYOUT_PRESET_MAP[rec.id],page=currentPage(),before=flattenLayoutContent(page?.blocks||[]);if(!page||!preset||!before.length)return toast('当前页没有可套版内容');page.blocks=buildLayoutFromPreset(rec.id,page.blocks||[]);if(rec.publishing){page.publishing={...(page.publishing||{}),...cloneData(rec.publishing)};}markDirty({historyGroup:`smart-layout:${recommendationId}`,forceHistory:true});syncJsonFromPage();renderBlockList();renderPreview();renderLayoutPresetCards();updateManagerDashboard();const pageHint=Number(rec.recommendedPages||1)>1?`；建议 ${rec.recommendedPages} 页${rec.requiresPagination?'，可继续使用跨页文本流':''}`:'';toast(`已应用推荐：${rec.name}${pageHint}`,3600);}
async function saveCurrentLayoutAsset(){if(!state.issue||!commitPage())return;const page=currentPage(),blueprint=layoutBlueprintFromPage(page);if(!blueprint.slotCount)return toast('当前页没有可保存的内容槽位');const name=prompt('版式名称：',`${page.section||page.navTitle||page.title||'页面'}版式`);if(name==null)return;try{const item=await api('/api/layout-library',{method:'POST',body:JSON.stringify({name:name.trim(),contextType:page.type||'page',previewPreset:analyzeLayoutSuggestions(page)[0]?.id||'two-balanced',blueprint})});state.layoutAssets=[item,...state.layoutAssets.filter(x=>x.id!==item.id)];renderLayoutAssets();toast('已保存到“我的版式”');}catch(e){toast(e.message,3200);}}
function applyLayoutAsset(id){const asset=state.layoutAssets.find(x=>x.id===id);if(!asset?.blueprint)return;const page=currentPage(),units=flattenLayoutContent(page.blocks||[]);if(!units.length)return toast('当前页没有可套版内容');page.blocks=buildFromLayoutBlueprint(asset.blueprint,page.blocks||[]);if(asset.blueprint.pageDesign&&Object.keys(asset.blueprint.pageDesign).length)page.design=cloneData(asset.blueprint.pageDesign);markDirty({historyGroup:'layout-asset',forceHistory:true});syncJsonFromPage();renderBlockList();renderPreview();renderLayoutPresetCards();toast(`已应用版式：${asset.name}`);}
async function deleteLayoutAsset(id){const asset=state.layoutAssets.find(x=>x.id===id);if(!asset||!confirm(`删除“${asset.name}”？`))return;try{await api(`/api/layout-library/${encodeURIComponent(id)}`,{method:'DELETE'});state.layoutAssets=state.layoutAssets.filter(x=>x.id!==id);renderLayoutAssets();toast('版式已删除');}catch(e){toast(e.message,3000);}}
$('#layoutLabBtn').onclick=()=>{if(requireIssue('请先选择可编辑期刊'))openLayoutLab();};
$('#layoutPresetList').addEventListener('click',e=>{const b=e.target.closest('[data-layout-preset]');if(b)applyLayoutPreset(b.dataset.layoutPreset);});
$('#layoutSuggestionList').addEventListener('click',e=>{const b=e.target.closest('[data-layout-recommendation]');if(b){applySmartLayoutRecommendation(b.dataset.layoutRecommendation);return;}const preset=e.target.closest('[data-layout-preset]');if(preset)applyLayoutPreset(preset.dataset.layoutPreset);});
$('#saveLayoutAsset').onclick=saveCurrentLayoutAsset;
$('#layoutAssetList').addEventListener('click',e=>{const del=e.target.closest('[data-delete-layout-asset]');if(del){deleteLayoutAsset(del.dataset.deleteLayoutAsset);return;}const b=e.target.closest('[data-layout-asset]');if(b)applyLayoutAsset(b.dataset.layoutAsset);});

const EDITORIAL_PAGE_TYPES=['article','news','theory','safety','discipline','health'];
const EDITORIAL_STATUS_LABELS={planned:'待制作','in-progress':'制作中',done:'已完成',hold:'暂缓'};
function editorialId(){try{return crypto.randomUUID()}catch{return `plan-${Date.now()}-${Math.random().toString(36).slice(2,8)}`}}
function emptyEditorialPlan(){return {version:1,issueId:state.issue?.id||'',title:'整刊内容计划',entries:[],updatedAt:null}}
function normalizeEditorialTitle(value=''){return String(value||'').trim().replace(/[（(]\s*\d+\s*[）)]\s*$/,'').trim()}
function editorialTargetTitles(entry){const title=String(entry?.title||'').trim();const pages=Math.max(1,Math.min(8,Number(entry?.pages||1)));return pages===1?[title]:Array.from({length:pages},(_,i)=>`${title}（${i+1}）`)}
function editorialPageMatches(page,entry,target){if(!page||['cover','toc','closing'].includes(page.type))return false;const title=String(page.navTitle||page.title||'').trim();const main=String(page.title||page.navTitle||'').trim();return String(page.type||'article')===String(entry.pageType||'article')&&String(page.section||'').trim()===String(entry.section||'').trim()&&(title===target||main===target)}
function editorialMatchedPages(entry,issue=state.issue){const pages=issue?.pages||[];return editorialTargetTitles(entry).filter(target=>pages.some(p=>editorialPageMatches(p,entry,target))).length}
function inferEditorialLayout(page){return analyzeLayoutSuggestions(page)?.[0]?.id||'single-focus'}
function editorialEntriesFromIssue(issue,{status='planned',referenceLabel=''}={}){
  const rows=[];for(const page of issue?.pages||[]){if(['cover','toc','closing'].includes(page?.type))continue;const title=normalizeEditorialTitle(page.navTitle||page.title||page.section||'待命名稿件')||'待命名稿件',section=String(page.section||'').trim(),pageType=EDITORIAL_PAGE_TYPES.includes(page.type)?page.type:'article',layoutPreset=inferEditorialLayout(page),last=rows.at(-1);if(last&&last.title===title&&last.section===section&&last.pageType===pageType&&last.pages<8){last.pages++;continue;}rows.push({id:editorialId(),title,section,pageType,pages:1,layoutPreset,status,notes:referenceLabel?`参考 ${referenceLabel} 的栏目结构`:''});}return rows;
}
function editorialMetrics(){const entries=state.editorialPlan?.entries||[],plannedPages=entries.reduce((n,x)=>n+Number(x.pages||1),0),matchedPages=entries.reduce((n,x)=>n+editorialMatchedPages(x),0),missingPages=Math.max(0,plannedPages-matchedPages),done=entries.filter(x=>x.status==='done').length,sections=new Set(entries.map(x=>String(x.section||'').trim()).filter(Boolean)).size;return {entries:entries.length,plannedPages,matchedPages,missingPages,done,sections}}
const EDITORIAL_PLACEHOLDER_RE=/(请填写|待补充|待完善|新稿件|正文待补|内容待补|占位|TODO|TBD|请上传|左栏内容|右栏内容)/i;
const EDITORIAL_PRODUCTION_LABELS={missing:'未建页',drift:'结构漂移',skeleton:'仍是骨架',content:'已有内容',enriched:'已充实'};
function editorialTextCorpus(value,key=''){if(value==null)return '';if(typeof value==='string'){if(['src','poster','articleId','id'].includes(key))return '';return value;}if(Array.isArray(value))return value.map(x=>editorialTextCorpus(x,key)).join(' ');if(typeof value==='object')return Object.entries(value).filter(([k])=>!['design'].includes(k)).map(([k,v])=>editorialTextCorpus(v,k)).join(' ');return '';}
function editorialPageProductionProfile(page){if(!page)return {stage:'missing',textChars:0,placeholderHits:0,mediaBound:0,mediaMissing:0,articleBindings:0,units:0};const units=flattenLayoutContent(page.blocks||[]),corpus=units.map(x=>editorialTextCorpus(x)).join(' '),compact=corpus.replace(/\s+/g,''),placeholderHits=units.reduce((n,x)=>n+(EDITORIAL_PLACEHOLDER_RE.test(editorialTextCorpus(x))?1:0),0);let mediaBound=0,mediaMissing=0,articleBindings=0,cards=0;for(const b of units){if(['image','video'].includes(b?.type)){const src=String(b.src||'').trim();if(src&&!['assets/image/image.jpg','assets/video/video.mp4'].includes(src))mediaBound++;else mediaMissing++;}if(b?.type==='articleLink'&&String(b.articleId||'').trim())articleBindings++;if(['cardline','cards','chips','casePair'].includes(b?.type))cards++;}let stage='content';if(placeholderHits||compact.length<90)stage='skeleton';else if(compact.length>=450||mediaBound||articleBindings||cards>=2)stage='enriched';return {stage,textChars:compact.length,placeholderHits,mediaBound,mediaMissing,articleBindings,units:units.length};}
function editorialPageTitle(page){return String(page?.navTitle||page?.title||'').trim()}
function editorialProductionForEntry(entry,issue=state.issue){const pages=issue?.pages||[],targets=editorialTargetTitles(entry),resolved=targets.map(target=>{const exactIndex=pages.findIndex(p=>editorialPageMatches(p,entry,target));if(exactIndex>=0)return {target,kind:'exact',pageIndex:exactIndex,profile:editorialPageProductionProfile(pages[exactIndex])};const driftIndex=pages.findIndex(p=>p&&!['cover','toc','closing'].includes(p.type)&&(editorialPageTitle(p)===target||String(p.title||'').trim()===target));if(driftIndex>=0)return {target,kind:'drift',pageIndex:driftIndex,profile:editorialPageProductionProfile(pages[driftIndex])};return {target,kind:'missing',pageIndex:-1,profile:editorialPageProductionProfile(null)}}),exact=resolved.filter(x=>x.kind==='exact'),missingPages=resolved.filter(x=>x.kind==='missing').length,driftPages=resolved.filter(x=>x.kind==='drift').length,skeletonPages=exact.filter(x=>x.profile.stage==='skeleton').length,contentPages=exact.filter(x=>x.profile.stage==='content').length,enrichedPages=exact.filter(x=>x.profile.stage==='enriched').length,matchedPages=exact.length;let suggestedStatus=entry.status==='hold'?'hold':'planned';if(entry.status!=='hold'){if(matchedPages===0&&driftPages===0)suggestedStatus='planned';else if(missingPages||driftPages||skeletonPages)suggestedStatus='in-progress';else suggestedStatus='done';}const statusConflict=entry.status!=='hold'&&entry.status!==suggestedStatus,attention=Boolean(missingPages||driftPages||skeletonPages||statusConflict),locate=resolved.find(x=>x.kind==='drift')||resolved.find(x=>x.kind==='exact'&&x.profile.stage==='skeleton')||resolved.find(x=>x.kind==='exact')||null;return {entry,resolved,matchedPages,missingPages,driftPages,skeletonPages,contentPages,enrichedPages,suggestedStatus,statusConflict,attention,locateIndex:locate?.pageIndex??-1};}
function editorialBoardAnalysis(){const entries=(state.editorialPlan?.entries||[]).map(x=>editorialProductionForEntry(x)),used=new Set();for(const x of entries)for(const r of x.resolved)if(r.pageIndex>=0)used.add(r.pageIndex);const orphans=(state.issue?.pages||[]).map((page,pageIndex)=>({page,pageIndex})).filter(x=>!['cover','toc','closing'].includes(x.page?.type)&&!used.has(x.pageIndex));return {entries,attention:entries.filter(x=>x.attention).length,skeletonPages:entries.reduce((n,x)=>n+x.skeletonPages,0),enrichedPages:entries.reduce((n,x)=>n+x.enrichedPages,0),driftEntries:entries.filter(x=>x.driftPages).length,missingPages:entries.reduce((n,x)=>n+x.missingPages,0),statusConflicts:entries.filter(x=>x.statusConflict).length,orphans};}
function editorialBoardRowVisible(x){const f=state.editorialBoardFilter||'all';if(f==='attention')return x.attention;if(f==='skeleton')return x.skeletonPages>0;if(f==='drift')return x.driftPages>0;if(f==='enriched')return x.enrichedPages>0;return true;}
function renderEditorialBoard(){const metrics=$('#editorialBoardMetrics'),list=$('#editorialBoardList'),orphans=$('#editorialBoardOrphans');if(!metrics||!list||!orphans)return;const a=editorialBoardAnalysis();metrics.innerHTML=[['需处理',a.attention],['缺页',a.missingPages],['骨架页',a.skeletonPages],['结构漂移',a.driftEntries],['已充实页',a.enrichedPages]].map(([k,v])=>`<span><small>${k}</small><b>${v}</b></span>`).join('');for(const b of $('#editorialBoardFilters')?.querySelectorAll('[data-editorial-board-filter]')||[])b.classList.toggle('active',b.dataset.editorialBoardFilter===(state.editorialBoardFilter||'all'));const rows=a.entries.filter(editorialBoardRowVisible);if(!rows.length)list.innerHTML='<div class="editorial-board-empty">当前筛选下没有制作待办。</div>';else list.innerHTML=rows.map(x=>{const e=x.entry,signals=[];if(x.missingPages)signals.push(`<span class="editorial-board-chip warning">未建页 ${x.missingPages}</span>`);if(x.driftPages)signals.push(`<span class="editorial-board-chip drift">漂移 ${x.driftPages}</span>`);if(x.skeletonPages)signals.push(`<span class="editorial-board-chip warning">骨架 ${x.skeletonPages}</span>`);if(x.contentPages)signals.push(`<span class="editorial-board-chip">内容 ${x.contentPages}</span>`);if(x.enrichedPages)signals.push(`<span class="editorial-board-chip good">充实 ${x.enrichedPages}</span>`);if(x.statusConflict)signals.push('<span class="editorial-board-chip warning">状态待核</span>');const current=EDITORIAL_STATUS_LABELS[e.status]||e.status,suggested=EDITORIAL_STATUS_LABELS[x.suggestedStatus]||x.suggestedStatus;return `<article class="editorial-board-row ${x.attention?'is-attention':''} ${x.driftPages?'is-drift':''}" data-editorial-board-entry="${escText(e.id)}"><div class="editorial-board-copy"><b>${escText(e.title)}</b><small>${escText(e.section||'未归类')} · ${escText(e.pageType)} · ${x.matchedPages}/${Number(e.pages||1)} 页精确匹配</small><span class="editorial-board-suggest">当前 <b>${escText(current)}</b>${current!==suggested?` → 建议 <b>${escText(suggested)}</b>`:' · 与页面现状一致'}</span></div><div class="editorial-board-signals">${signals.join('')||'<span class="editorial-board-chip good">计划与页面一致</span>'}</div><div class="editorial-board-actions">${x.locateIndex>=0?`<button type="button" data-editorial-locate="${x.locateIndex}">定位页面</button>`:'<button type="button" disabled>尚未建页</button>'}</div></article>`}).join('');if(!a.orphans.length)orphans.innerHTML='<span class="good">✓ 当前正文页均已纳入整刊计划。</span>';else orphans.innerHTML=`<span>未纳入计划 ${a.orphans.length} 页：</span>${a.orphans.slice(0,5).map(x=>`<button type="button" data-editorial-locate="${x.pageIndex}">${escText(x.page.navTitle||x.page.title||`第 ${x.pageIndex+1} 页`)}</button>`).join('')}${a.orphans.length>5?`<span>等 ${a.orphans.length} 页</span>`:''}`;$('#editorialApplyStatusSuggestions').disabled=!a.statusConflicts;}
function locateEditorialProductionPage(index){const i=Number(index);if(!Number.isInteger(i)||i<0||i>=state.issue.pages.length)return;if($('#editorialPlanDialog')?.open)$('#editorialPlanDialog').close();state.page=i;renderPages();renderPage();requestAnimationFrame(()=>document.querySelector(`.page-item[data-page-index="${i}"]`)?.scrollIntoView({block:'nearest'}));toast(`已定位第 ${i+1} 页：${state.issue.pages[i].navTitle||state.issue.pages[i].title||''}`);}
async function applyEditorialStatusSuggestions(){if(!state.editorialPlan)return;const a=editorialBoardAnalysis(),changes=a.entries.filter(x=>x.statusConflict&&x.entry.status!=='hold');if(!changes.length)return toast('计划状态已经与页面现状一致');if(!confirm(`将按当前页面现状更新 ${changes.length} 个计划项的制作状态。仅修改整刊计划 sidecar，不会修改期刊发布状态，是否继续？`))return;for(const x of changes)x.entry.status=x.suggestedStatus;state.editorialPlanDirty=true;renderEditorialPlan();try{await saveEditorialPlan({quiet:true});toast(`已更新 ${changes.length} 个制作状态；V3.0 正式门禁未改变`,3200)}catch(e){toast(e.message,3200)}}
function analyzeEditorialPlan(){const plan=state.editorialPlan||emptyEditorialPlan(),entries=plan.entries||[],m=editorialMetrics(),advice=[];if(!entries.length)return [{tone:'warning',text:'还没有计划项。可以从当前期刊同步、参考上一期栏目，或手动添加稿件。'}];if(m.missingPages)advice.push({tone:'warning',text:`还有 ${m.missingPages} 个计划页面尚未在当前期刊中匹配，可确认后批量生成页面骨架。`});else advice.push({tone:'good',text:'当前计划页面均已在期刊中匹配；后续重点是正文、媒体、审计和正式门禁。'});const emptySection=entries.filter(x=>!String(x.section||'').trim()).length;if(emptySection)advice.push({tone:'warning',text:`${emptySection} 个计划项未设置栏目，自动目录和整刊结构会较难维护。`});const hold=entries.filter(x=>x.status==='hold').length;if(hold)advice.push({tone:'warning',text:`${hold} 个计划项处于“暂缓”，生成缺失页面时会自动跳过。`});const bySection=new Map();for(const x of entries){const key=String(x.section||'未归类').trim()||'未归类';bySection.set(key,(bySection.get(key)||0)+Number(x.pages||1))}const top=[...bySection].sort((a,b)=>b[1]-a[1])[0];if(top&&m.plannedPages>=8&&top[1]/m.plannedPages>.55)advice.push({tone:'warning',text:`栏目“${top[0]}”占计划正文页 ${Math.round(top[1]/m.plannedPages*100)}%，建议确认是否过度集中。`});const layouts=new Set(entries.map(x=>x.layoutPreset));if(entries.length>=4&&layouts.size===1)advice.push({tone:'',text:'全部稿件目前使用同一种版式；可在长文、图文和速览内容之间适当区分。'});const capacity=(state.issue?.pages?.length||0)+m.missingPages;if(capacity>LIMITS.pages)advice.push({tone:'warning',text:`按当前计划生成后将达到 ${capacity} 页，超过制作中心 ${LIMITS.pages} 页上限。`});advice.push({tone:'',text:'整刊计划属于制作侧 sidecar；计划状态或本地建议不会被解释为 V3.0 正式发布门禁证据。'});return advice.slice(0,6)}
function populateEditorialReferenceIssues(){const sel=$('#editorialReferenceIssue');if(!sel)return;const rows=(state.issues||[]).filter(x=>x.engine==='v3'&&x.id!==state.issue?.id);sel.innerHTML=rows.map(x=>`<option value="${escText(x.id)}">${escText(x.label||x.id)} · ${x.pageCount||'?'} 页</option>`).join('');const current=Number(state.issue?.id||0),prev=rows.filter(x=>Number(x.id)<current).sort((a,b)=>Number(b.id)-Number(a.id))[0]||rows[0];if(prev)sel.value=prev.id;$('#editorialImportReference').disabled=!rows.length}
function renderEditorialPlan(){const plan=state.editorialPlan||emptyEditorialPlan(),list=$('#editorialPlanList');if(!list)return;const m=editorialMetrics();$('#editorialPlanTitle').textContent=plan.title||'整刊内容计划';$('#editorialPlanSummary').textContent=`${m.entries} 篇计划稿件 · 正文 ${m.plannedPages} 页 · 当前匹配 ${m.matchedPages} 页${state.editorialPlanSavedAt?` · 最近保存 ${new Date(state.editorialPlanSavedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`:''}`;$('#editorialPlanMetrics').innerHTML=[['计划稿件',m.entries],['计划正文页',m.plannedPages],['缺失页面',m.missingPages],['栏目',m.sections]].map(([k,v])=>`<span><small>${k}</small><b>${v}</b></span>`).join('');$('#editorialPlanInsights').innerHTML=analyzeEditorialPlan().map(x=>`<span class="editorial-advice ${x.tone||''}">${escText(x.text)}</span>`).join('');renderEditorialBoard();const stateEl=$('#editorialPlanState');stateEl.textContent=state.editorialPlanDirty?'计划有未保存修改':'计划已保存';stateEl.classList.toggle('dirty',state.editorialPlanDirty);$('#editorialGeneratePages').disabled=!m.missingPages||!plan.entries?.length;if(!plan.entries?.length){list.innerHTML='<div class="editorial-plan-empty">还没有计划项。整刊编排只规划制作，不会在未确认时修改期刊页面。</div>';return;}const typeOptions=EDITORIAL_PAGE_TYPES.map(x=>`<option value="${x}">${x}</option>`).join(''),layoutOptions=LAYOUT_PRESETS.map(x=>`<option value="${x.id}">${escText(x.name)}</option>`).join(''),statusOptions=Object.entries(EDITORIAL_STATUS_LABELS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');list.innerHTML=plan.entries.map((x,i)=>{const matched=editorialMatchedPages(x),pages=Number(x.pages||1);return `<div class="editorial-plan-row ${x.status==='hold'?'is-hold':x.status==='done'?'is-done':''}" data-plan-id="${escText(x.id)}"><div class="editorial-plan-row-main"><input data-plan-key="title" maxlength="120" value="${escText(x.title)}" aria-label="稿件标题"><input data-plan-key="section" maxlength="120" value="${escText(x.section||'')}" placeholder="栏目" aria-label="栏目"><textarea data-plan-key="notes" maxlength="500" placeholder="制作备注">${escText(x.notes||'')}</textarea></div><select data-plan-key="pageType" aria-label="页面类型">${typeOptions}</select><input data-plan-key="pages" type="number" min="1" max="8" step="1" value="${pages}" aria-label="计划页数"><select data-plan-key="layoutPreset" aria-label="计划版式">${layoutOptions}</select><select data-plan-key="status" aria-label="制作状态">${statusOptions}</select><div class="editorial-progress"><b>${matched}/${pages}</b><small>${matched>=pages?'已匹配':'待生成'}</small></div><div class="editorial-plan-row-actions"><button type="button" data-plan-move="-1" ${i===0?'disabled':''} title="上移">↑</button><button type="button" data-plan-move="1" ${i===plan.entries.length-1?'disabled':''} title="下移">↓</button><button type="button" class="danger-lite" data-plan-delete title="删除">×</button></div></div>`}).join('');for(const row of list.querySelectorAll('[data-plan-id]')){const item=plan.entries.find(x=>x.id===row.dataset.planId);if(!item)continue;for(const el of row.querySelectorAll('[data-plan-key]'))el.value=String(item[el.dataset.planKey]??'')}}
function markEditorialPlanDirty(){state.editorialPlanDirty=true;renderEditorialPlan()}
async function loadEditorialPlan(){if(!state.issue)return null;if(state.editorialPlanLoadedFor===state.issue.id&&state.editorialPlan)return state.editorialPlan;try{state.editorialPlan=await api(`/api/editorial-plan/${encodeURIComponent(state.issue.id)}`)}catch{state.editorialPlan=emptyEditorialPlan()}state.editorialPlanLoadedFor=state.issue.id;state.editorialPlanDirty=false;state.editorialPlanSavedAt=state.editorialPlan?.updatedAt||null;return state.editorialPlan}
async function saveEditorialPlan({quiet=false}={}){if(!state.issue||!state.editorialPlan)return null;try{const saved=await api(`/api/editorial-plan/${encodeURIComponent(state.issue.id)}`,{method:'PUT',body:JSON.stringify(state.editorialPlan)});state.editorialPlan=saved;state.editorialPlanDirty=false;state.editorialPlanSavedAt=saved.updatedAt||new Date().toISOString();renderEditorialPlan();if(!quiet)toast('整刊计划已保存');return saved}catch(e){if(!quiet)toast(e.message,3200);throw e}}
async function openEditorialPlan(){if(!state.issue||!commitPage())return toast('请先选择可编辑期刊');await loadEditorialPlan();populateEditorialReferenceIssues();renderEditorialPlan();$('#editorialPlanDialog').showModal()}
function addEditorialPlanEntry(seed={}){state.editorialPlan ||= emptyEditorialPlan();if(state.editorialPlan.entries.length>=120)return toast('整刊计划最多 120 项');const current=currentPage(),pageType=EDITORIAL_PAGE_TYPES.includes(seed.pageType||current?.type)?(seed.pageType||current.type):'article';state.editorialPlan.entries.push({id:editorialId(),title:String(seed.title||'新稿件').slice(0,120),section:String(seed.section??current?.section??'').slice(0,120),pageType,pages:Math.max(1,Math.min(8,Number(seed.pages||1))),layoutPreset:LAYOUT_PRESET_MAP[seed.layoutPreset]?seed.layoutPreset:(current&&!['cover','toc','closing'].includes(current.type)?inferEditorialLayout(current):'single-focus'),status:EDITORIAL_STATUS_LABELS[seed.status]?seed.status:'planned',notes:String(seed.notes||'').slice(0,500)});markEditorialPlanDirty()}
function syncEditorialPlanFromCurrent(){if(!state.issue)return;const rows=editorialEntriesFromIssue(state.issue,{status:'done'});if(state.editorialPlan?.entries?.length&&!confirm(`当前计划已有 ${state.editorialPlan.entries.length} 项。是否用当前期刊的 ${rows.length} 组正文结构重新建立计划？`))return;state.editorialPlan={...(state.editorialPlan||emptyEditorialPlan()),entries:rows};markEditorialPlanDirty();toast(`已从当前期刊同步 ${rows.length} 组计划`)}
async function importEditorialReference(){const id=$('#editorialReferenceIssue').value;if(!id)return toast('没有可参考的其他 V3 期刊');try{const ref=await api(`/api/issues/${encodeURIComponent(id)}`),rows=editorialEntriesFromIssue(ref,{status:'planned',referenceLabel:ref.label||id});if(state.editorialPlan?.entries?.length&&!confirm(`当前计划已有 ${state.editorialPlan.entries.length} 项。是否改用“${ref.label||id}”的 ${rows.length} 组栏目结构？`))return;state.editorialPlan={...(state.editorialPlan||emptyEditorialPlan()),entries:rows};markEditorialPlanDirty();toast(`已参考 ${ref.label||id} 建立 ${rows.length} 组计划；尚未生成页面`)}catch(e){toast(e.message,3000)}}
function buildEditorialPage(entry,targetTitle){let page=pageFromTemplate(entry.pageType);page.navTitle=targetTitle;page.title=targetTitle;page.section=String(entry.section||'').trim();if(!page.kicker&&page.section)page.kicker=page.section;page.blocks=buildLayoutFromPreset(entry.layoutPreset,page.blocks||[]);return page}
async function generateEditorialMissingPages(){if(!state.issue||!state.editorialPlan||!commitPage())return;const create=[];for(const entry of state.editorialPlan.entries||[]){if(entry.status==='hold')continue;for(const target of editorialTargetTitles(entry))if(!(state.issue.pages||[]).some(p=>editorialPageMatches(p,entry,target)))create.push({entry,target})}if(!create.length)return toast('没有需要生成的计划页面');if(state.issue.pages.length+create.length>LIMITS.pages)return toast(`需要新增 ${create.length} 页，超过 ${LIMITS.pages} 页制作上限`,3200);if(!confirm(`将按整刊计划生成 ${create.length} 个缺失页面骨架。不会写入正文稿件或媒体资源，是否继续？`))return;const pages=create.map(x=>buildEditorialPage(x.entry,x.target)),closing=state.issue.pages.findIndex(p=>p.type==='closing'),at=closing>=0?closing:state.issue.pages.length;state.issue.pages.splice(at,0,...pages);for(const {entry} of create)if(entry.status==='planned')entry.status='in-progress';state.page=at;state.pageSearch='';$('#pageSearch').value='';markDirty({historyGroup:'editorial-plan-generate',forceHistory:true});renderPages();renderPage();state.editorialPlanDirty=true;try{await saveEditorialPlan({quiet:true})}catch{}renderEditorialPlan();toast(`已生成 ${create.length} 个页面骨架；正文、媒体和正式门禁仍需后续完成`,3200)}
$('#editorialPlanBtn').onclick=openEditorialPlan;$('#editorialBoardFilters').addEventListener('click',e=>{const b=e.target.closest('[data-editorial-board-filter]');if(!b)return;state.editorialBoardFilter=b.dataset.editorialBoardFilter;renderEditorialBoard();});$('#editorialBoardList').addEventListener('click',e=>{const b=e.target.closest('[data-editorial-locate]');if(b)locateEditorialProductionPage(b.dataset.editorialLocate);});$('#editorialBoardOrphans').addEventListener('click',e=>{const b=e.target.closest('[data-editorial-locate]');if(b)locateEditorialProductionPage(b.dataset.editorialLocate);});$('#editorialApplyStatusSuggestions').onclick=applyEditorialStatusSuggestions;$('#editorialAddEntry').onclick=()=>addEditorialPlanEntry();$('#editorialSyncCurrent').onclick=syncEditorialPlanFromCurrent;$('#editorialImportReference').onclick=importEditorialReference;$('#editorialSavePlan').onclick=()=>saveEditorialPlan();$('#editorialGeneratePages').onclick=generateEditorialMissingPages;$('#editorialClearPlan').onclick=()=>{if(!state.editorialPlan?.entries?.length)return;if(!confirm('清空当前整刊计划？这不会删除已经存在的期刊页面。'))return;state.editorialPlan.entries=[];markEditorialPlanDirty()};$('#editorialPlanList').addEventListener('input',e=>{const el=e.target.closest('[data-plan-key]'),row=e.target.closest('[data-plan-id]');if(!el||!row||!state.editorialPlan)return;const item=state.editorialPlan.entries.find(x=>x.id===row.dataset.planId);if(!item)return;let value=el.value;if(el.dataset.planKey==='pages')value=Math.max(1,Math.min(8,Number(value||1)));item[el.dataset.planKey]=value;state.editorialPlanDirty=true;const stateEl=$('#editorialPlanState');if(stateEl){stateEl.textContent='计划有未保存修改';stateEl.classList.add('dirty')}});$('#editorialPlanList').addEventListener('change',e=>{const el=e.target.closest('[data-plan-key]');if(el&&['title','section','pageType','pages','layoutPreset','status'].includes(el.dataset.planKey))renderEditorialPlan()});$('#editorialPlanList').addEventListener('click',e=>{const row=e.target.closest('[data-plan-id]');if(!row||!state.editorialPlan)return;const i=state.editorialPlan.entries.findIndex(x=>x.id===row.dataset.planId);if(i<0)return;const move=e.target.closest('[data-plan-move]');if(move){const to=i+Number(move.dataset.planMove);if(to>=0&&to<state.editorialPlan.entries.length){[state.editorialPlan.entries[i],state.editorialPlan.entries[to]]=[state.editorialPlan.entries[to],state.editorialPlan.entries[i]];markEditorialPlanDirty()}return}if(e.target.closest('[data-plan-delete]')){state.editorialPlan.entries.splice(i,1);markEditorialPlanDirty()}});

function inferSection(p) {
  if(String(p.section||'').trim())return String(p.section).trim(); const raw=String(p.navTitle||p.kicker||p.title||'').trim();
  const known=[['时政要闻','时政要闻'],['理论学习','理论学习'],['反诈微课堂','反诈防骗'],['反诈口诀','反诈防骗'],['反诈防骗','反诈防骗'],['警示教育','警示教育'],['时令养生','时令养生']];
  for(const [needle,label] of known)if(raw.includes(needle))return label; return raw.split(/[｜|]/)[0].trim();
}
function generateToc() {
  if(!state.issue||!commitPage())return false; let tocIndex=state.issue.pages.findIndex(p=>p.type==='toc'); const willInsert=tocIndex<0; if(willInsert)tocIndex=Math.min(2,state.issue.pages.length);
  const groups=[]; const seen=new Set();
  state.issue.pages.forEach((p,i)=>{ if((!willInsert&&i===tocIndex)||['cover','toc','closing'].includes(p.type)||/卷首语/.test(p.navTitle||''))return; const title=inferSection(p); if(!title||seen.has(title))return; seen.add(title); const pageNo=i+1+(willInsert&&i>=tocIndex?1:0); groups.push({number:String(groups.length+1).padStart(2,'0'),title,subtitle:'',page:pageNo}); });
  if(groups.length>LIMITS.arrayItems){toast(`自动识别到 ${groups.length} 个栏目，超过目录单块 ${LIMITS.arrayItems} 项上限。请先为相关页面填写相同“栏目归属”进行合并。`,4200);return false;}
  if(!groups.length){toast('没有找到可生成目录的正文栏目。',2600);return false;}
  if(willInsert){ if(state.issue.pages.length>=LIMITS.pages){toast('页面已达上限，无法新增目录页');return false;} state.issue.pages.splice(tocIndex,0,{type:'toc',navTitle:'目录',section:'',kicker:'CONTENTS',title:'本期导读',blocks:[]}); }
  const toc=state.issue.pages[tocIndex];toc.blocks ||= [];
  const old=toc.blocks.find(b=>b.type==='toc');
  for(const item of groups){const target=state.issue.pages[item.page-1];item.targetPageId=target?.id||'';const previous=old?.items?.find(x=>item.targetPageId&&(x.targetPageId||state.originalIssue?.pages?.[Number(x.page)-1]?.id)===item.targetPageId)||old?.items?.find(x=>x.title===item.title);if(previous)item.subtitle=previous.subtitle||'';}
  if(old)old.items=groups;else toc.blocks.push({type:'toc',items:groups});
  if(willInsert){state.issue.pages.forEach((p,i)=>{if(i!==tocIndex&&!p.section&&!['cover','toc','closing'].includes(p.type)&&!/卷首语/.test(p.navTitle||''))p.section=inferSection(p);});}
  state.page=tocIndex; state.pageSearch=''; $('#pageSearch').value=''; markDirty({historyGroup:'auto-toc',forceHistory:true}); renderPages(); renderPage(); toast(`目录已生成 ${groups.length} 个栏目；请检查栏目名称和导语。`,2600); return true;
}
$('#autoToc').onclick=()=>generateToc();
function updateTocNotice(){
  const button=$('#autoToc');if(!button||!state.issue)return;
  const changes=[];
  for(const page of state.issue.pages)for(const block of page.blocks||[])if(block.type==='toc')for(const item of block.items||[]){
    const previous=state.originalIssue?.pages?.[Number(item.page)-1];
    const target=state.issue.pages.find(p=>p.id===(item.targetPageId||previous?.id));
    if(target){const number=state.issue.pages.indexOf(target)+1,title=inferSection(target);if(number!==Number(item.page)||title!==item.title)changes.push(`${item.title} → ${title}（第 ${number} 页）`);}
    else changes.push(`${item.title}：目标页面已变化`);
  }
  button.textContent=changes.length?`更新目录 · ${changes.length}`:'自动目录';button.title=changes.length?changes.join('\n'):'按当前栏目生成目录，并保留原条目的手写说明';
}

function renderCloneOptions() { const sel=$('#newCloneFrom'); if(!sel)return; const current=sel.value; const rows=state.issues.filter(x=>x.engine==='v3').sort((a,b)=>String(b.id).localeCompare(String(a.id),undefined,{numeric:true})); sel.innerHTML='<option value="">请选择上一期</option>'+rows.map(x=>`<option value="${escText(x.id)}">${escText(x.label||x.id)} · ${x.pageCount||'?'} 页</option>`).join(''); if([...sel.options].some(o=>o.value===current))sel.value=current; else if(rows[0])sel.value=rows[0].id; }

const IMPORT_SECTION_SEMANTICS = [
  {id:'news',label:'时政新闻',pageType:'news',layoutPreset:'lead-two'},
  {id:'theory',label:'理论学习',pageType:'theory',layoutPreset:'two-balanced'},
  {id:'safety',label:'安全防范',pageType:'safety',layoutPreset:'three-brief'},
  {id:'discipline',label:'纪法警示',pageType:'discipline',layoutPreset:'two-balanced'},
  {id:'health',label:'健康养生',pageType:'health',layoutPreset:'three-brief'},
  {id:'finance',label:'金融知识',pageType:'article',layoutPreset:'two-balanced'},
  {id:'profile',label:'人物风采',pageType:'article',layoutPreset:'media-left'},
  {id:'culture',label:'文化文苑',pageType:'article',layoutPreset:'three-brief'},
  {id:'service',label:'服务生活',pageType:'article',layoutPreset:'single-focus'},
  {id:'activity',label:'活动纪实',pageType:'article',layoutPreset:'media-right'},
  {id:'general',label:'通用栏目',pageType:'article',layoutPreset:'single-focus'}
];
const IMPORT_SECTION_SEMANTIC_MAP=Object.fromEntries(IMPORT_SECTION_SEMANTICS.map(x=>[x.id,x]));
const IMPORT_CONFIDENCE_LABELS={high:'高',medium:'中',low:'待确认',manual:'人工'};
function importSectionSemanticOptions(selected='general'){return IMPORT_SECTION_SEMANTICS.map(x=>`<option value="${x.id}" ${x.id===selected?'selected':''}>${escText(x.label)} · ${x.pageType}</option>`).join('');}
function updateImportSectionSemantic(resultIndex,sectionIndex,semanticId){
  const result=state.importResults?.[Number(resultIndex)],summary=result?.document?.structure,sec=summary?.sections?.[Number(sectionIndex)],meta=IMPORT_SECTION_SEMANTIC_MAP[semanticId]||IMPORT_SECTION_SEMANTIC_MAP.general;if(!result||!sec||!meta)return;
  sec.semanticType=meta.id;sec.semanticLabel=meta.label;sec.semanticConfidence='manual';sec.semanticReason='人工确认';sec.pageType=meta.pageType;sec.suggestedLayout=meta.layoutPreset;
  const pubSec=result.document?.publication?.sections?.[Number(sectionIndex)];if(pubSec){Object.assign(pubSec,{semanticType:meta.id,semanticLabel:meta.label,semanticConfidence:'manual',semanticReason:'人工确认',pageType:meta.pageType,suggestedLayout:meta.layoutPreset});}
  const pagSec=result.pagination?.structure?.sections?.[Number(sectionIndex)];if(pagSec)Object.assign(pagSec,{semanticType:meta.id,semanticLabel:meta.label,semanticConfidence:'manual',semanticReason:'人工确认',pageType:meta.pageType,suggestedLayout:meta.layoutPreset});
  for(const page of result.pages||[]){if(page.section===sec.name)page.type=meta.pageType;}
  summary.unknownSectionCount=(summary.sections||[]).filter(x=>x.semanticConfidence==='low').length;if(result.pagination?.structure)result.pagination.structure.unknownSectionCount=summary.unknownSectionCount;
  renderImportPreview();
}

function importSettings(){return {pageType:$('#importPageType').value||'article',section:$('#importSection').value.trim(),targetChars:Number($('#importTargetChars').value)||760,structureMode:$('#importStructureMode')?.value||'auto'};}
function setImportTab(tab){state.importTab=tab;document.querySelectorAll('[data-import-tab]').forEach(b=>b.classList.toggle('active',b.dataset.importTab===tab));document.querySelectorAll('[data-import-panel]').forEach(p=>p.classList.toggle('hidden',p.dataset.importPanel!==tab));$('#importOptions').classList.toggle('hidden',tab==='skeleton');clearImportResults(false);}
function populateSkeletonSources(){const sel=$('#skeletonSource');const rows=state.issues.filter(x=>x.engine==='v3'&&x.id!==state.issue?.id);sel.innerHTML=rows.map(x=>`<option value="${escText(x.id)}">${escText(x.label||x.id)} · ${x.pageCount||'?'} 页</option>`).join('');const current=Number(state.issue?.id||0);const prev=rows.find(x=>Number(x.id)<current)||rows[0];if(prev)sel.value=prev.id;$('#previewSkeletonBtn').disabled=!rows.length;}
function openImportDialog(tab='paste'){if(!state.issue||!commitPage())return toast('请先选择可编辑期刊');populateSkeletonSources();setImportTab(tab);$('#importDialog').showModal();}
$('#quickImportBtn').onclick=()=>openImportDialog('paste');
$('#studioContentBtn')?.addEventListener('click',()=>setStudioEntry('content'));
$('#importTabs').addEventListener('click',e=>{const b=e.target.closest('[data-import-tab]');if(b)setImportTab(b.dataset.importTab)});
$('#importWriteMode')?.addEventListener('change',()=>renderImportPreview());$('#importStructureMode')?.addEventListener('change',()=>clearImportResults(true));
function resetFastTrackUi(){state.fastTrackRunning=false;const status=$('#fastTrackStatus');if(status){status.textContent='待解析';status.className='fast-track-status';}document.querySelectorAll('#fastTrackSteps [data-step]').forEach(x=>x.className='');const b=$('#fastTrackImportBtn');if(b)b.disabled=true;}
function setFastTrackStatus(text,tone='running'){const el=$('#fastTrackStatus');if(el){el.textContent=text;el.className=`fast-track-status ${tone}`;}}
function setFastTrackStep(step,status='active'){const el=document.querySelector(`#fastTrackSteps [data-step="${step}"]`);if(el)el.className=status;}
function clearImportResults(render=true){state.importResults=[];$('#applyImportBtn').disabled=true;resetFastTrackUi();if(render){$('#importPreviewTitle').textContent='尚未分析内容';$('#importPreviewMeta').textContent='';$('#importPreviewList').innerHTML='<div class="import-empty">导入前不会修改当前期刊。</div>';}}
$('#clearImportPreview').onclick=()=>clearImportResults(true);
async function parseImportFile(file){const opt=importSettings();const q=new URLSearchParams({filename:file.name,pageType:opt.pageType,section:opt.section,targetChars:String(opt.targetChars),structureMode:opt.structureMode});const r=await fetch(appUrl(`/api/import/parse?${q}`),{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(file.name)},body:file});const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={error:text}}if(!r.ok)throw new Error(data.error||`${r.status} ${r.statusText}`);return data;}
function importTypeStats(doc){const counts={};for(const b of doc?.blocks||[])counts[b.type]=(counts[b.type]||0)+1;return Object.entries(counts).map(([k,v])=>`${BLOCK_NAMES[k]||k} ${v}`).join(' · ');}
function importLinkCount(result){return Number(result?.document?.linkCount||Object.keys(result?.document?.articles||{}).length||0);}
function importArticlesFromResults(valid=[]){return valid.reduce((all,x)=>Object.assign(all,x?.document?.articles||{}),{});}
function embeddedAssetFile(asset){const raw=atob(String(asset?.base64||'')),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new File([bytes],String(asset?.filename||'word-image.png'),{type:String(asset?.mime||'application/octet-stream')});}
function rewriteEmbeddedRefs(blocks,map){for(const b of blocks||[]){if(!b||typeof b!=='object')continue;if(b.type==='image'&&map.has(String(b.src||'')))b.src=map.get(String(b.src||''));if(b.type==='container')(b.columns||[]).forEach(c=>rewriteEmbeddedRefs(c?.blocks,map));}}
async function materializeImportedAssets(valid=[]){for(const result of valid){const assets=result?.document?.embeddedAssets||[];if(!assets.length)continue;const map=new Map();for(const asset of assets){if(asset.uploadedPath){map.set(asset.ref,asset.uploadedPath);continue;}if(!asset.base64)throw new Error(`内嵌图片 ${asset.filename||asset.id||''} 缺少文件数据`);let file=embeddedAssetFile(asset);const optimized=await optimizeImageFile(file);file=optimized?.file||file;const uploaded=await uploadAsset(file,'image');asset.uploadedPath=uploaded.path;delete asset.base64;map.set(asset.ref,uploaded.path);}rewriteEmbeddedRefs(result.pages,map);rewriteEmbeddedRefs(result.document?.blocks,map);for(const obj of result.document?.richObjects||[])rewriteEmbeddedRefs([obj.block],map);}return valid;}

function isPeriodicalImportResult(x){return x?.pagination?.strategy==='periodical-structure'||x?.document?.structure?.kind==='periodical';}
function likelyDefaultIssueSkeleton(issue=state.issue){const pages=(issue?.pages||[]).filter(p=>!['cover','toc','closing'].includes(p?.type));if(!pages.length||pages.length>12)return false;let placeholders=0;for(const p of pages){const text=[p.navTitle,p.title,p.kicker,...(p.blocks||[]).flatMap(b=>[b?.text,b?.title,b?.case,b?.warning])].filter(Boolean).join(' ');if(/请填写|待编辑|新刊|栏目/.test(text))placeholders++;}return placeholders>=Math.max(2,Math.ceil(pages.length*.5));}
function resolveImportWriteMode(valid=state.importResults?.filter(x=>!x.error)||[]){const selected=$('#importWriteMode')?.value||'auto';if(selected!=='auto')return selected;if(valid.length===1&&isPeriodicalImportResult(valid[0]))return 'publication';return 'append';}
function importProjectedCount(pages,mode){const current=state.issue?.pages||[];if(mode==='publication'){const keep=current.filter(p=>['cover','toc'].includes(p?.type)).length;const incomingClosing=pages.some(p=>p?.type==='closing');const oldClosing=!incomingClosing&&current.some(p=>p?.type==='closing')?1:0;return keep+pages.length+oldClosing;}if(mode==='replace'){const keep=current.filter(p=>['cover','toc','closing'].includes(p?.type)).length;return keep+pages.length;}return current.length+pages.length;}
function structureSummaryHtml(x,resultIndex=0){const st=x?.document?.structure;if(st?.kind!=='periodical')return '';const sections=(st.sections||[]).map((s,i)=>{const semantic=s.semanticType||'general',confidence=IMPORT_CONFIDENCE_LABELS[s.semanticConfidence]||s.semanticConfidence||'待确认',layout=LAYOUT_PRESET_MAP[s.suggestedLayout]?.name||s.suggestedLayout||'单栏聚焦';return `<div class="import-structure-section ${s.semanticConfidence==='low'?'needs-confirm':''}"><div><b>${escText(s.name)}</b><small>${escText(s.semanticLabel||'通用栏目')} · ${confidence}置信度 · ${s.articles} 篇${s.hasIntro?' · 含导读':''} · 建议${escText(layout)}</small><em>${escText(s.semanticReason||'')}</em></div><select data-import-section-semantic data-result-index="${resultIndex}" data-section-index="${i}" aria-label="${escText(s.name)} 分类">${importSectionSemanticOptions(semantic)}</select></div>`}).join('');return `<div class="import-structure-summary"><div><strong>已识别为整期期刊 · 动态板块语义</strong><em>${st.sectionCount} 个版块 · ${st.articleCount} 篇栏目文章 · ${st.hasPreface?'含卷首语':'无卷首语'} · ${st.hasClosing?'含尾刊寄语':'无尾刊寄语'}${st.unknownSectionCount?` · ${st.unknownSectionCount} 个板块建议确认`:''}</em></div><div class="import-structure-sections">${sections}</div></div>`;}
function renderImportPreview(){
  const rows=state.importResults||[],valid=rows.filter(x=>!x.error),pagesList=valid.flatMap(x=>x.pages||[]),pages=pagesList.length,chars=valid.reduce((n,x)=>n+(x.document?.stats?.characters||0),0),links=valid.reduce((n,x)=>n+importLinkCount(x),0),mode=resolveImportWriteMode(valid),currentCount=state.issue?.pages?.length||0,projected=importProjectedCount(pagesList,mode),overLimit=projected>LIMITS.pages,periodical=valid.length===1&&isPeriodicalImportResult(valid[0]);
  $('#importPreviewTitle').textContent=rows.length?(periodical?`整期结构已识别 · 建议生成 ${pages} 个内容页`:`${valid.length} 篇内容 · 建议生成 ${pages} 页`):'尚未分析内容';
  $('#importPreviewMeta').textContent=rows.length?`${chars.toLocaleString()} 字${links?` · ${links} 个链接`:''} · 当前 ${currentCount} 页 → 写入后约 ${projected} 页${overLimit?' · 超出页面上限':''}`:'';$('#importPreviewMeta').classList.toggle('over-limit',overLimit);
  const box=$('#importPreviewList');if(!rows.length){box.innerHTML='<div class="import-empty">导入前不会修改当前期刊。</div>';$('#applyImportBtn').disabled=true;$('#fastTrackImportBtn').disabled=true;return;}
  const modeHint=periodical?`<div class="import-mode-hint ${likelyDefaultIssueSkeleton()?'good':'warn'}"><b>${likelyDefaultIssueSkeleton()?'检测到标准新刊骨架':'当前期刊已有较多正式内容'}</b><span>${mode==='publication'?'智能写入将保留封面/目录，用整期结构替换正文与尾刊。':mode==='append'?'当前选择为追加，完整期刊可能产生重复栏目。':'请核对当前写入方式后再生成。'}</span></div>`:'';
  box.innerHTML=(overLimit?`<div class="import-result error"><p>写入后预计 ${projected} 页，超过 ${LIMITS.pages} 页上限。请提高分页密度或调整写入方式。</p></div>`:'')+modeHint+rows.map((x,i)=>x.error?`<div class="import-result error"><div><b>${escText(x.sourceName||`文件 ${i+1}`)}</b><span>解析失败</span></div><p>${escText(x.error)}</p></div>`:`<div class="import-result">${structureSummaryHtml(x,i)}<div class="import-result-head"><div><b>${escText(x.document?.title||x.sourceName||'导入内容')}</b><span>${escText(x.sourceName||x.document?.format||'粘贴正文')} · ${x.document?.stats?.characters||0} 字 · ${x.pages?.length||0} 页 · ${x.pagination?.strategy==='periodical-structure'?'语义分页':'容量分页'}</span></div><em>${escText(importTypeStats(x.document))}</em></div><div class="import-page-chips">${(x.pages||[]).slice(0,18).map((p,j)=>`<span>${j+1}. ${escText(p.section?`${p.section}｜${p.title||p.navTitle}`:(p.title||p.navTitle||'页面'))} · ${p.blocks?.length||0}块</span>`).join('')}${(x.pages||[]).length>18?`<span>…另 ${(x.pages||[]).length-18} 页</span>`:''}</div></div>`).join('');
  const importCards=[...box.querySelectorAll('.import-result:not(.error)')];let importCardIndex=0;rows.forEach(x=>{if(x.error)return;const count=importLinkCount(x),card=importCards[importCardIndex++];if(count&&card){const hint=document.createElement('div');hint.className='import-link-hint';hint.textContent=`已识别 ${count} 个原文链接，将按第一期的“文章链接”方案生成组件，并在文章库中保留原文入口。`;card.appendChild(hint);}});const disabled=!valid.length||pages<1||overLimit;$('#applyImportBtn').disabled=disabled;$('#fastTrackImportBtn').disabled=disabled;$('#applyImportBtn').textContent=periodical&&mode==='publication'?`整期重建 ${pages} 页`:'仅生成页面';if(!disabled)setFastTrackStatus(periodical?`整期结构就绪 · ${pages} 页`:`可推进 ${pages} 页`,'done');
}
async function analyzePaste(){const text=$('#importPasteText').value;if(!text.trim())return toast('请先粘贴正文');const opt=importSettings();try{$('#parsePasteBtn').disabled=true;const r=await api('/api/import/parse',{method:'POST',body:JSON.stringify({text,format:$('#importPasteFormat').value,filename:'粘贴正文',...opt})});state.importResults=[{...r,sourceName:'粘贴正文',pages:r.pagination.pages}];renderImportPreview();}catch(e){state.importResults=[{sourceName:'粘贴正文',error:e.message}];renderImportPreview();}finally{$('#parsePasteBtn').disabled=false;}}
$('#parsePasteBtn').onclick=analyzePaste;
$('#parseFileBtn').onclick=async()=>{const file=$('#importFileInput').files?.[0];if(!file)return toast('请选择一个 Word / Markdown / TXT 文件');try{$('#parseFileBtn').disabled=true;const r=await parseImportFile(file);state.importResults=[{...r,sourceName:file.name,pages:r.pagination.pages}];renderImportPreview();}catch(e){state.importResults=[{sourceName:file.name,error:e.message}];renderImportPreview();}finally{$('#parseFileBtn').disabled=false;}};
$('#parseBatchBtn').onclick=async()=>{const files=[...($('#importBatchInput').files||[])];if(!files.length)return toast('请选择多篇文章');if(files.length>30)return toast('单次最多批量导入 30 篇文章');$('#parseBatchBtn').disabled=true;state.importResults=[];renderImportPreview();for(const file of files){try{const r=await parseImportFile(file);state.importResults.push({...r,sourceName:file.name,pages:r.pagination.pages});}catch(e){state.importResults.push({sourceName:file.name,error:e.message});}renderImportPreview();}$('#parseBatchBtn').disabled=false;};
$('#previewSkeletonBtn').onclick=async()=>{const source=$('#skeletonSource').value;if(!source)return toast('没有可复制的 V3 历史期刊');try{$('#previewSkeletonBtn').disabled=true;const r=await api(`/api/issues/${encodeURIComponent(state.issue.id)}/skeleton?source=${encodeURIComponent(source)}`);state.importSkeletonMode=$('#skeletonMode').value;state.importResults=[{kind:'skeleton',sourceName:`${r.source?.label||source} 栏目骨架`,document:{title:`${r.source?.label||source} 栏目骨架`,format:'skeleton',stats:{characters:0,blocks:r.pages.reduce((n,p)=>n+(p.blocks?.length||0),0)},blocks:r.pages.flatMap(p=>p.blocks||[])},pages:r.pages}];renderImportPreview();}catch(e){state.importResults=[{sourceName:`${source} 栏目骨架`,error:e.message}];renderImportPreview();}finally{$('#previewSkeletonBtn').disabled=false;}};
 function prepareImportedArticles(pages,articles={}){
  const incoming=cloneData(pages),next=cloneData(state.issue?.articles||{}),map=new Map();
  for(const [rawId,raw] of Object.entries(articles||{})){if(!raw||typeof raw!=='object')continue;const url=String(raw.url||'').trim();const existing=url?Object.entries(next).find(([,a])=>String(a?.url||'').trim()===url)?.[0]:null;let id=existing||String(rawId||'article');if(!existing){const base=id;let n=2;while(next[id])id=`${base}_${n++}`;next[id]=cloneData(raw);}map.set(rawId,id);}
  const rewrite=blocks=>(blocks||[]).forEach(b=>{if(!b||typeof b!=='object')return;if(b.type==='articleLink'&&map.has(b.articleId))b.articleId=map.get(b.articleId);if(b.type==='container')(b.columns||[]).forEach(c=>rewrite(c?.blocks));});incoming.forEach(p=>rewrite(p?.blocks));return {pages:incoming,articles:next};
 }
 function insertImportedPages(pages,{mode='append',publicationTitle='',articles={}}={}){
  if(!state.issue||!pages.length)return false;if(!commitPage())return false;const prepared=prepareImportedArticles(pages,articles),incoming=prepared.pages;
  if(mode==='publication'){const cover=state.issue.pages.filter(p=>p.type==='cover'),toc=state.issue.pages.filter(p=>p.type==='toc'),oldClosing=state.issue.pages.filter(p=>p.type==='closing'),hasIncomingClosing=incoming.some(p=>p.type==='closing');if(likelyDefaultIssueSkeleton()&&publicationTitle&&cover[0]&&/请填写|待编辑/.test(String(cover[0].title||'')))cover[0].title=String(publicationTitle).slice(0,120);const next=[...cover,...toc,...incoming,...(!hasIncomingClosing?oldClosing:[])];if(next.length>LIMITS.pages){toast(`整期重建后将达到 ${next.length} 页，超过 ${LIMITS.pages} 页上限`,3600);return false;}const skeleton=likelyDefaultIssueSkeleton();if(!confirm(`${skeleton?'检测到标准新刊骨架。':'当前期刊已有内容。'}整期重建将保留 ${cover.length} 个封面和 ${toc.length} 个目录，用 ${incoming.length} 个语义页面替换现有正文${hasIncomingClosing?'与尾刊':'页'}。是否继续？`))return false;state.issue.pages=next;state.page=Math.min(cover.length+toc.length,next.length-1);
  }else if(mode==='replace'){const structural=state.issue.pages.filter(p=>['cover','toc','closing'].includes(p.type));const cover=structural.filter(p=>p.type==='cover'),toc=structural.filter(p=>p.type==='toc'),closing=structural.filter(p=>p.type==='closing');const next=[...cover,...toc,...incoming,...closing];if(next.length>LIMITS.pages){toast(`生成后将达到 ${next.length} 页，超过 ${LIMITS.pages} 页上限`,3600);return false;}if(!confirm(`替换正文页后将保留 ${cover.length} 个封面、${toc.length} 个目录、${closing.length} 个尾页，并写入 ${incoming.length} 页。是否继续？`))return false;state.issue.pages=next;state.page=Math.min(cover.length+toc.length,next.length-1);
  }else{if(state.issue.pages.length+incoming.length>LIMITS.pages){toast(`本次将新增 ${incoming.length} 页，期刊总页数会超过 ${LIMITS.pages} 页上限`,4200);return false;}let at=Math.min(state.issue.pages.length,state.page+1);const closing=state.issue.pages.findIndex(p=>p.type==='closing');if(closing>=0&&at>closing)at=closing;state.issue.pages.splice(at,0,...incoming);state.page=at;}
   state.issue.articles=prepared.articles;state.selectedPages.clear();state.pageSearch='';$('#pageSearch').value='';markDirty({historyGroup:'content-import',forceHistory:true});renderPages();renderPage();requestAnimationFrame(()=>document.querySelector(`.page-item[data-page-index="${state.page}"]`)?.scrollIntoView({block:'nearest'}));return true;
}
$('#applyImportBtn').onclick=async()=>{const valid=state.importResults.filter(x=>!x.error),pages=valid.flatMap(x=>x.pages||[]);if(!pages.length)return;const btn=$('#applyImportBtn');try{btn.disabled=true;btn.textContent='正在导入图片…';await materializeImportedAssets(valid);const mode=valid[0]?.kind==='skeleton'?$('#skeletonMode').value:resolveImportWriteMode(valid);if(insertImportedPages(pages,{mode,publicationTitle:valid[0]?.document?.title||'',articles:importArticlesFromResults(valid)})){const count=pages.length;$('#importDialog').close();clearImportResults(true);toast(`已生成 ${count} 个页面，Word 图片/表格/富文本已一并写入。`,3600);}}catch(error){toast(error.message||String(error),4200);renderImportPreview();}finally{if(document.body.contains(btn)&&state.importResults.length)btn.disabled=false;}};
async function runFastTrackImport(){
  if(state.fastTrackRunning)return;const valid=state.importResults.filter(x=>!x.error),pages=valid.flatMap(x=>x.pages||[]);if(!pages.length)return toast('请先分析内容');
  const mode=valid[0]?.kind==='skeleton'?$('#skeletonMode').value:resolveImportWriteMode(valid),count=pages.length;state.fastTrackRunning=true;$('#fastTrackImportBtn').disabled=true;$('#applyImportBtn').disabled=true;document.querySelectorAll('#fastTrackSteps [data-step]').forEach(x=>x.className='');
  try{
    setFastTrackStatus('正在导入 Word 图片…');await materializeImportedAssets(valid);setFastTrackStatus('正在生成页面…');setFastTrackStep('insert','active');if(!insertImportedPages(pages,{mode,publicationTitle:valid[0]?.document?.title||'',articles:importArticlesFromResults(valid)}))throw new Error('生成页面失败');const importedFocusPage=currentPage();setFastTrackStep('insert','done');
    if($('#fastAutoToc').checked){setFastTrackStatus('正在刷新目录…');setFastTrackStep('toc','active');const ok=generateToc();setFastTrackStep('toc',ok?'done':'error');}else setFastTrackStep('toc','done');const focusIndex=state.issue.pages.indexOf(importedFocusPage);if(focusIndex>=0){state.page=focusIndex;renderPages();renderPage();}
    const needsSave=$('#fastAutoSave').checked||$('#fastAutoAudit').checked||$('#fastAutoBuild').checked;
    if(needsSave){setFastTrackStatus('正在保存制作源稿…');setFastTrackStep('save','active');if(!await saveIssue({silent:true}))throw new Error('保存失败');setFastTrackStep('save','done');}else setFastTrackStep('save','done');
    let auditSummary='未运行审计';if($('#fastAutoAudit').checked){setFastTrackStatus('正在执行日常审计…');setFastTrackStep('audit','active');const start=await api(`/api/issues/${state.issue.id}/audit`,{method:'POST',body:JSON.stringify({strict:false,async:true}),allowError:true});const r=await waitForBackgroundJob(start,'日常审计');if(!r.audit)throw new Error(r.output||r.error||'审计失败');state.audit=r.audit;state.auditStale=false;updateStateBadges();auditSummary=`阻断 ${r.audit.blockers?.length||0} · 警告 ${r.audit.warnings?.length||0}`;setFastTrackStep('audit',(r.audit.blockers?.length||0)?'error':'done');}else setFastTrackStep('audit','done');
    if($('#fastAutoBuild').checked){setFastTrackStatus('正在生成静态构建…');setFastTrackStep('build','active');const start=await api(`/api/issues/${state.issue.id}/build`,{method:'POST',body:JSON.stringify({async:true})}),r=await waitForBackgroundJob(start,'静态构建');if(!r?.preview)throw new Error(r?.error||'构建失败');setFastTrackStep('build','done');}else setFastTrackStep('build','done');
    setFastTrackStatus('正在同步真实 Reader…');setFastTrackStep('preview','active');setPreviewMode('built');await pushReaderPreview({reload:true});setFastTrackStep('preview','done');setFastTrackStatus('快速成刊完成','done');
    $('#importDialog').close();clearImportResults(false);setWorkspaceLayoutPreset('balanced');requestAnimationFrame(()=>$('#previewCard')?.scrollIntoView({behavior:'smooth',block:'nearest'}));toast(`快速成刊完成 · 新增 ${count} 页 · ${auditSummary}`,4200);
  }catch(e){setFastTrackStatus(`失败：${e.message}`,'error');toast(`快速成刊失败：${e.message}`,4200);$('#fastTrackImportBtn').disabled=false;$('#applyImportBtn').disabled=false;}
  finally{state.fastTrackRunning=false;}
}
$('#fastTrackImportBtn').onclick=runFastTrackImport;


function renderAiConfig(){const c=state.aiConfig||{},enabled=$('#aiEnabledInput'),provider=$('#aiProviderInput'),base=$('#aiBaseUrlInput'),model=$('#aiModelInput'),endpoint=$('#aiPublicEndpointInput'),key=$('#aiApiKeyInput');if(!enabled||!provider||!base||!model||!endpoint||!key)return;enabled.checked=Boolean(c.enabled);provider.value=String(c.provider||'openai-compatible');base.value=String(c.baseUrl||'');model.value=String(c.model||'');endpoint.value=String(c.publicEndpoint||'/new-jc-magazine/api/public/ai/summarize');key.value='';const status=$('#aiConfigStatus');if(status){status.className='ai-config-status';status.textContent=c.apiKeyConfigured?`已配置 API Key · ${c.model||'未设置模型'}`:'尚未配置 API Key';}}
 async function loadAiConfig({silent=false}={}){try{state.aiConfig=await api('/api/ai/config');state.aiConfigLoaded=true;renderAiConfig();return state.aiConfig;}catch(error){if(!silent)toast(`AI 配置读取失败：${error.message}`);return null;}}
 function openAiConfig(){$('#aiConfigDialog')?.showModal();void loadAiConfig();}
 $('#aiConfigBtn').onclick=openAiConfig;
 $('#aiConfigReload').onclick=()=>{const s=$('#aiConfigStatus');if(s){s.className='ai-config-status';s.textContent='正在读取…';}void loadAiConfig();};
 $('#aiConfigSave').onclick=async()=>{const button=$('#aiConfigSave'),status=$('#aiConfigStatus');button.disabled=true;status.className='ai-config-status';status.textContent='正在保存…';try{const data={enabled:$('#aiEnabledInput').checked,provider:$('#aiProviderInput').value,baseUrl:$('#aiBaseUrlInput').value.trim(),model:$('#aiModelInput').value.trim(),publicEndpoint:$('#aiPublicEndpointInput').value.trim()};const key=$('#aiApiKeyInput').value.trim();if(key)data.apiKey=key;state.aiConfig=await api('/api/ai/config',{method:'PUT',body:JSON.stringify(data)});state.aiConfigLoaded=true;renderAiConfig();status.className='ai-config-status success';status.textContent=state.aiConfig.enabled?'配置已保存，可以使用一键 AI 总结':'配置已保存，当前未启用新的 AI 调用';}catch(error){status.className='ai-config-status error';status.textContent=error.message||'保存失败';}finally{button.disabled=false;}};

function nextArticleId() { const articles=state.issue?.articles||{}; for(let i=1;i<=1000;i++){const id=`article${i}`;if(!articles[id])return id;}return `article${Date.now()}`; }
function articleRefs(id){const out=[];(state.issue?.pages||[]).forEach((p,pi)=>(p.blocks||[]).forEach((b,bi)=>{if(b?.type==='articleLink'&&b.articleId===id)out.push({page:pi,block:bi})}));return out;}
function renderArticleLibrary(){const articles=state.issue?.articles||{};const ids=Object.keys(articles);const list=$('#articleList');list.innerHTML='';if(!ids.length)list.innerHTML='<div class="article-empty">文章库为空。新增后即可在“文章链接”内容块中选择。</div>';ids.forEach(id=>{const a=articles[id]||{};const b=document.createElement('button');b.type='button';b.className='article-list-item'+(state.articleId===id?' active':'');b.innerHTML=`<b>${escText(a.title||'未命名文章')}</b><span>${escText(id)} · ${a.paras?.length||0} 段</span>`;b.onclick=()=>{state.articleId=id;renderArticleLibrary();renderArticleEditor();};list.appendChild(b)});renderArticleEditor();}
function renderArticleEditor(){
  const box=$('#articleEditor'),id=state.articleId,a=state.issue?.articles?.[id];
  if(!id||!a){box.className='article-editor-empty';box.textContent='请选择或新增一篇文章。';return;}
  box.className='article-editor';const paras=(a.paras||[]).join('\n\n');
  box.innerHTML=`<div class="article-editor-head"><div><span class="eyebrow">ARTICLE</span><h4>${escText(id)}</h4></div><button type="button" class="danger-lite" id="deleteArticle">删除文章</button></div><div class="article-form"><label>文章标题<input id="articleTitleInput" maxlength="200" value="${escText(a.title||'')}"><span class="field-note">${String(a.title||'').length} / 200</span></label><label>副标题 / 日期<input id="articleSubtitleInput" maxlength="120" value="${escText(a.subtitle||'')}"></label><label class="full">原文链接（HTTPS）<input id="articleUrlInput" type="url" maxlength="1000" value="${escText(a.url||'')}" placeholder="https://..."></label><label class="full">链接显示文字（留空使用文章标题）<input id="articleLinkTitleInput" maxlength="200" value="${escText(a.linkTitle||'')}"></label><label class="full">摘要正文<textarea id="articleParasInput" maxlength="600000" placeholder="段落之间空一行">${escText(paras)}</textarea><span class="field-note" id="articleParasCount">${a.paras?.length||0} / 50 段</span></label><label class="full">AI 摘要（可手动修改）<textarea id="articleAiSummaryInput" maxlength="5000" placeholder="点击右侧按钮自动生成，也可以手动修改">${escText(a.aiSummary||'')}</textarea><div class="article-ai-actions"><button type="button" class="primary" id="summarizeArticleBtn">一键 AI 总结</button><span id="articleAiSummaryStatus" class="field-note" role="status"></span></div></label><label class="full">来源说明<textarea id="articleSourceInput" maxlength="1000">${escText(a.sourceNote||a.source_note||'')}</textarea></label></div>`;
  const update=()=>{a.title=$('#articleTitleInput').value;a.subtitle=$('#articleSubtitleInput').value;a.url=$('#articleUrlInput').value.trim();a.linkTitle=$('#articleLinkTitleInput').value.trim();a.paras=$('#articleParasInput').value.split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);a.aiSummary=$('#articleAiSummaryInput').value.trim();a.sourceNote=$('#articleSourceInput').value;const count=$('#articleParasCount');count.textContent=`${a.paras.length} / 50 段`;count.classList.toggle('over-limit',a.paras.length>50);markDirty({preview:false});renderBlockList();};
  for(const id2 of ['articleTitleInput','articleSubtitleInput','articleUrlInput','articleLinkTitleInput','articleParasInput','articleAiSummaryInput','articleSourceInput'])$('#'+id2).addEventListener('input',update);
  $('#summarizeArticleBtn').onclick=async()=>{const button=$('#summarizeArticleBtn'),status=$('#articleAiSummaryStatus'),url=String(a.url||'').trim();if(!url)return status.textContent='请先填写原文 HTTPS 链接';button.disabled=true;status.textContent='正在读取链接并总结…';try{const result=await api('/api/ai/summarize',{method:'POST',body:JSON.stringify({issueId:state.issue.id,articleId:id,url})});const summary=String(result.summary||'').trim();if(!summary)throw new Error('AI 没有返回摘要');a.aiSummary=summary;$('#articleAiSummaryInput').value=summary;markDirty({preview:false,historyGroup:'article-ai-summary',forceHistory:true});status.textContent=result.cached?'已使用服务端缓存结果':'已生成摘要；保存期刊后发布';renderBlockList();}catch(error){status.textContent=error.message||'AI 总结失败';}finally{button.disabled=false;}};
  $('#deleteArticle').onclick=()=>{const refs=articleRefs(id);const extra=refs.length?`\n当前有 ${refs.length} 个文章链接块引用它，删除后这些链接会被清空并由审计提示重新绑定。`:'';if(!confirm(`删除文章“${a.title||id}”？${extra}`))return;delete state.issue.articles[id];for(const r of refs)state.issue.pages[r.page].blocks[r.block].articleId='';state.articleId=Object.keys(state.issue.articles)[0]||null;markDirty({preview:false,historyGroup:'article-delete',forceHistory:true});renderArticleLibrary();renderBlockList();toast('文章已删除');};
}
function openArticleLibrary(){if(!state.issue)return toast('请先选择期刊');state.issue.articles ||= {};state.articleId=state.articleId&&state.issue.articles[state.articleId]?state.articleId:(Object.keys(state.issue.articles)[0]||null);renderArticleLibrary();$('#articleLibraryDialog').showModal();}
$('#articleLibraryBtn').onclick=openArticleLibrary;
$('#addArticle').onclick=()=>{state.issue.articles ||= {};if(Object.keys(state.issue.articles).length>=100)return toast('文章库最多 100 篇文章');const id=nextArticleId();state.issue.articles[id]={title:'新文章',subtitle:'',url:'',paras:['请填写文章摘要。'],sourceNote:''};state.articleId=id;markDirty({preview:false,historyGroup:'article-add',forceHistory:true});renderArticleLibrary();renderBlockList();requestAnimationFrame(()=>$('#articleTitleInput')?.focus());};

function mediaKindForFile(file) { const ext=(file.name.split('.').pop()||'').toLowerCase(); if(['jpg','jpeg','png','webp','gif'].includes(ext))return'image'; if(['mp4','webm','mov'].includes(ext))return'video'; if(['mp3','m4a','wav'].includes(ext)){ if(['music','tts'].includes(state.mediaFilter))return state.mediaFilter; if(['music','tts'].includes(state.mediaTarget?.kind))return state.mediaTarget.kind; return null; } return null; }
function updateMediaAccept() { const input=$('#mediaFileInput'); const kind=state.mediaTarget?.kind||state.mediaFilter; input.accept=kind==='image'?'image/jpeg,image/png,image/webp,image/gif':kind==='video'?'video/mp4,video/webm,video/quicktime':kind==='music'||kind==='tts'?'audio/*':'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,audio/*'; }
async function optimizeImageFile(file) {
  if(!$('#optimizeImages')?.checked || !/^image\/(jpeg|png|webp)$/i.test(file.type||''))return {file,optimized:false};
  let bitmap;try{bitmap=await createImageBitmap(file);}catch{return {file,optimized:false};}
  const maxEdge=2000, scale=Math.min(1,maxEdge/Math.max(bitmap.width,bitmap.height));
  if(scale===1&&file.size<1024*1024){bitmap.close?.();return {file,optimized:false,width:bitmap.width,height:bitmap.height};}
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d',{alpha:true});ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.86));if(!blob)return {file,optimized:false};
  const name=file.name.replace(/\.[^.]+$/,'')+'.webp';if(scale===1&&blob.size>=file.size*.97)return {file,optimized:false,width:canvas.width,height:canvas.height};
  return {file:new File([blob],name,{type:'image/webp',lastModified:Date.now()}),optimized:true,originalBytes:file.size,optimizedBytes:blob.size,width:canvas.width,height:canvas.height};
}
function renderWorkspaceMediaStatus(){
  const el=$('#workspaceMediaStatus');if(!el)return;
  const data=state.mediaAssets;
  if(!data){el.textContent='资源未读取';el.title='打开“资源 / TTS”查看当前期刊的朗读状态';return;}
  if(data.error){el.textContent='资源读取失败';el.title=data.error;return;}
  const tts=data.tts;
  if(tts?.expected){
    const missing=Math.max(0,tts.expected-(tts.found||0));
    const unchecked=state.dirty||state.mediaAssetsFingerprint!==state.sourceFingerprint||!tts.baselinedAt;
    el.textContent=unchecked?'朗读待核对':missing?`朗读缺 ${missing} 页`:tts.stale?'朗读待更新':`TTS ${tts.found}/${tts.expected}`;
    el.title=unchecked?'保存后打开“资源 / TTS”核对朗读；当前文件数量不能证明音频对应最新正文。':missing?'打开“资源 / TTS”，选择“全刊缺失页”生成。':tts.stale?'正文或页面顺序已变化，请在“资源 / TTS”重新生成朗读。':'朗读文件齐全，正文与已记录基线一致。';return;
  }
  el.textContent=`媒体 ${(data.summary?.total??data.items?.length??0)}`;el.title='尚未配置预生成朗读，可在“资源 / TTS”生成。';
}
async function loadMediaAssets() {
  if(!state.issue)return;
  const id=state.issue.id,fingerprint=state.sourceFingerprint;
  try{
    const data=await api(`/api/issues/${id}/assets`);
    if(state.issue?.id!==id||state.sourceFingerprint!==fingerprint)return;
    state.mediaAssets=data;state.mediaAssetsFingerprint=fingerprint;
    const items=data.items||[];
    if(state.mediaSelected&&!items.some(x=>x.path===state.mediaSelected))state.mediaSelected=null;
    renderMediaList();renderWorkspaceMediaStatus();
    const affected=data.tts?.changedPages||[];
    if(affected.length){const note=document.createElement('p');note.className='hint';note.textContent=`待更新第 ${affected.join('、')} 页。若是首次核对旧音频，需要生成一次；之后仅更新变更页。`;$('#ttsStatus')?.append(note);}
  }catch(e){if(state.issue?.id!==id||state.sourceFingerprint!==fingerprint)return;state.mediaAssets={writable:false,items:[],error:e.message};state.mediaSelected=null;renderMediaList();renderWorkspaceMediaStatus();}
}
function mediaKindLabel(kind){return ({image:'图片',video:'视频',music:'音乐',tts:'朗读',other:'其他'})[kind]||kind;}
function formatDuration(seconds){const n=Number(seconds);if(!Number.isFinite(n)||n<=0)return '—';const m=Math.floor(n/60),s=Math.round(n%60);return m?`${m}:${String(s).padStart(2,'0')}`:`${s} 秒`;}
function renderMediaSummary(){const d=state.mediaAssets||{};const s=d.summary||{};$('#mediaSummary').innerHTML=`<div><span>资源总数</span><b>${s.total??(d.items||[]).length}</b></div><div><span>已引用</span><b>${s.used??0}</b></div><div><span>未引用</span><b>${s.unused??0}</b></div><div><span>媒体总量</span><b>${escText(s.size||'0 B')}</b></div><div><span>精选素材</span><b>${CURATED_STOCK_ASSETS.length}</b></div>`;}
function renderTtsStatus(){const scopeNote=$('#ttsScopeNote');if(scopeNote)scopeNote.textContent=state.issue?.features?.narration?.scope==='page'?'本期朗读：页面正文（弹出文章可单独阅读）':'本期朗读：页面正文及关联文章全文';const tts=state.mediaAssets?.tts,box=$('#ttsStatus');if(!tts||!tts.expected){box.className='tts-status';box.innerHTML='<div class="tts-copy"><b>未配置预生成朗读</b><span>当前期刊没有 narration.pattern，将使用浏览器语音回退；可在下方一键生成。</span></div>';return;}const complete=tts.found===tts.expected;box.className=`tts-status ${tts.stale?'stale':complete?'good':''}`;const stateText=!complete?`缺失 ${tts.expected-tts.found} 页${tts.missingPages?.length?`：${tts.missingPages.join('、')}`:''}`:tts.stale?'音频文件齐全，但页面正文/顺序已改变':'音频文件与当前页面基线一致';box.innerHTML=`<div class="tts-copy"><b>TTS ${tts.found}/${tts.expected}${tts.stale?' · 需要重新生成':''}</b><span>${escText(stateText)}${tts.baselinedAt?` · 基线 ${escText(fmtTime(tts.baselinedAt))}`:''}</span></div><button type="button" id="ttsBaselineBtn" ${!complete||state.dirty?'disabled':''}>确认朗读已重新生成</button>`;$('#ttsBaselineBtn')?.addEventListener('click',confirmTtsBaseline);}
const EDGE_TTS_VOICE_OPTIONS=[
  ['zh-CN-XiaoxiaoNeural','晓晓 · 女声（默认）'],
  ['zh-CN-YunxiNeural','云希 · 男声'],
  ['zh-CN-YunjianNeural','云健 · 男声'],
  ['zh-CN-XiaoyiNeural','晓伊 · 女声'],
  ['zh-CN-XiaohanNeural','晓涵 · 女声'],
  ['zh-CN-XiaomengNeural','晓梦 · 女声']
];
function openTtsSettingsDialog(){
  if(!state.issue)return toast('请先选择一期期刊');
  const narration=state.issue.features?.narration||{},voice=String(narration.voice||'zh-CN-XiaoxiaoNeural'),rate=Number(narration.rate)||1;
  const voiceInput=$('#ttsVoiceInput'),rateInput=$('#ttsRateInput');
  if(voiceInput){if(![...voiceInput.options].some(option=>option.value===voice))voiceInput.add(new Option(`${voice}（当前声音）`,voice));voiceInput.value=voice;}
  if(rateInput){const value=String(Math.max(.5,Math.min(2,rate)));if(![...rateInput.options].some(option=>option.value===value))rateInput.add(new Option(`${value}×（当前语速）`,value));rateInput.value=value;}
  $('#ttsSettingsDialog')?.showModal();
}
async function saveTtsSettings(){
  if(!state.issue)return;
  const voice=String($('#ttsVoiceInput')?.value||'zh-CN-XiaoxiaoNeural');
  const rate=Math.max(.5,Math.min(2,Number($('#ttsRateInput')?.value)||1));
  state.issue.features ||= {};state.issue.features.narration ||= {};
  state.issue.features.narration.voice=voice;state.issue.features.narration.rate=rate;
  markDirty({preview:false,historyGroup:'tts-settings',forceHistory:true});
  const button=$('#ttsSettingsSave');if(button){button.disabled=true;button.textContent='保存中…';}
  try{if(await saveIssue({silent:true})){$('#ttsSettingsDialog')?.close('saved');renderMediaList();toast(`Edge TTS 设置已保存：${voice} · ${rate}×`);}}finally{if(button){button.disabled=false;button.textContent='保存设置';}}
}
function ensureTtsSettingsUi(){
  const scope=$('#ttsGenerateScope');if(scope&&!scope.querySelector('option[value="changed"]'))scope.add(new Option('仅更新变更 / 缺失页','changed'),0);
  const bar=$('#ttsGenerateBar');
  if(bar&&!$('#ttsSettingsBtn')){const button=document.createElement('button');button.type='button';button.id='ttsSettingsBtn';button.textContent='Edge TTS 设置';bar.insertBefore(button,$('#ttsGenerateScope'));button.addEventListener('click',openTtsSettingsDialog);}
  if($('#ttsSettingsDialog'))return;
  const dialog=document.createElement('dialog');dialog.id='ttsSettingsDialog';dialog.className='tts-settings-dialog';
  dialog.innerHTML=`<form method="dialog"><div class="dialog-head"><div><span class="eyebrow">EDGE TTS</span><h3>朗读生成设置</h3><p>后台生成使用这里保存的 Edge TTS 声音与语速；重新生成后才会替换已有音频。</p></div><button value="cancel" aria-label="关闭">×</button></div><div class="tts-settings-grid"><label>声音<select id="ttsVoiceInput">${EDGE_TTS_VOICE_OPTIONS.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><label>语速<select id="ttsRateInput"><option value="0.75">0.75×</option><option value="0.85">0.85×</option><option value="1">1.0×（推荐）</option><option value="1.15">1.15×</option><option value="1.25">1.25×</option></select></label></div><p class="field-note">建议三期统一使用“晓晓 · 女声（默认）”。修改后请重新生成对应页面，并重新确认 TTS 基线。</p><div class="dialog-actions"><button value="cancel">取消</button><button type="button" class="primary" id="ttsSettingsSave">保存设置</button></div></form>`;
  document.body.appendChild(dialog);dialog.querySelector('#ttsSettingsSave')?.addEventListener('click',saveTtsSettings);
  const preview=document.createElement('section');preview.className='tts-preview';
  preview.innerHTML='<button type="button" id="ttsPreviewBtn">试听当前页片段</button><audio id="ttsPreviewAudio" controls hidden aria-label="朗读试听"></audio><p id="ttsPreviewStatus" role="status">按当前声音和语速试听前 200 字，不替换正式朗读。</p>';
  dialog.querySelector('.dialog-actions').before(preview);
  preview.querySelector('button').addEventListener('click',previewTtsSettings);
  dialog.addEventListener('close',()=>{dialog.querySelector('audio')?.pause();});
}
async function previewTtsSettings(){
  const button=$('#ttsPreviewBtn'),audio=$('#ttsPreviewAudio'),status=$('#ttsPreviewStatus');
  if(!state.issue||button.disabled)return;
  const id=state.issue.id,text=narrationPageText(currentPage()).slice(0,200);
  if(!text){status.textContent='当前页没有可试听正文。';return;}
  button.disabled=true;audio.pause();audio.hidden=true;status.textContent='正在生成试听…';
  try{
    const result=await api(`/api/issues/${encodeURIComponent(id)}/tts/preview`,{method:'POST',body:JSON.stringify({text,voice:$('#ttsVoiceInput').value,rate:Number($('#ttsRateInput').value)||1})});
    if(state.issue?.id!==id||!$('#ttsSettingsDialog').open)return;
    audio.src=result.audio;audio.hidden=false;status.textContent='试听已生成；修改设置后可再次试听。';
    try{await audio.play();}catch{status.textContent='试听已生成，点击播放按钮收听。';}
  }catch(error){status.textContent=`试听失败：${error.message}，可重试。`;}
  finally{button.disabled=false;}
}
function selectedMedia(){return [...CURATED_STOCK_ASSETS,...(state.mediaAssets?.items||[])].find(x=>x.path===state.mediaSelected)||null;}
function mediaVisualUrl(x){return x?.stock?appUrl(`stock/${x.stockId}.svg`):issueAssetUrl(x?.path||'');}
function mediaRows(){const items=state.mediaAssets?.items||[];return state.mediaFilter==='stock'?CURATED_STOCK_ASSETS:items.filter(x=>state.mediaFilter==='all'||x.kind===state.mediaFilter);}
function renderMediaInspector(){const box=$('#mediaInspector'),x=selectedMedia();if(!x){box.innerHTML='<div class="media-inspector-empty">选择一个媒体，查看尺寸、时长、引用页面和安全操作。</div>';return;}const visual=x.kind==='image'?`<img src="${escText(mediaVisualUrl(x))}" alt="">`:`<span class="media-icon">${x.kind==='video'?'▶':x.kind==='music'?'♫':x.kind==='tts'?'声':'·'}</span>`;const dimensions=x.width&&x.height?`${x.width} × ${x.height}`:'—';const refs=x.stock?'<div class="media-ref"><span>安装后会复制到当前期刊的独立资源目录，不会影响其他期刊。</span></div>':(x.references||[]).map((r,i)=>`<div class="media-ref"><span>${r.page?`第 ${r.page} 页${Number.isInteger(r.blockIndex)?` · 块 ${r.blockIndex+1}`:''}`:escText(r.source||'期刊配置')}${r.field?` · ${escText(r.field)}`:''}</span>${r.page?`<button type="button" data-media-ref="${i}">定位</button>`:''}</div>`).join('')||'<div class="media-ref"><span>当前没有引用，可安全删除或清理。</span></div>';const canUse=state.mediaTarget&&x.kind===state.mediaTarget.kind,canAdd=['image','video'].includes(x.kind),canBackground=x.kind==='image',writable=state.mediaAssets?.writable,preferBackground=state.mediaIntent==='background',writeDisabled=x.stock&&!writable?'disabled':'';const backgroundButton=canBackground?`<button type="button" ${preferBackground?'class="primary full" ':''}id="${x.stock?'installStockBackground':'useAsPageBackground'}" ${writeDisabled}>${x.stock?'安装并设为页面背景':'设为页面背景'}</button>`:'';const addButton=canAdd?`<button type="button" ${preferBackground?'':'class="primary full" '}id="${x.stock?'installStockAsset':'addMediaToPage'}" ${writeDisabled}>${x.stock?(canUse?'安装并替换当前资源':'安装并添加到当前页'):'添加到当前页'}</button>`:'';const stockAction=preferBackground?`${backgroundButton}${addButton}`:`${addButton}${backgroundButton}`;box.innerHTML=`<div class="media-inspector-preview">${visual}</div><h4>${escText(x.name)}</h4><div class="media-inspector-path">${x.stock?escText(x.description):escText(x.path)}</div><div class="media-inspector-meta"><div><span>类型</span><b>${escText(mediaKindLabel(x.kind))}</b></div><div><span>体积</span><b>${escText(x.size)}</b></div><div><span>尺寸</span><b>${escText(dimensions)}</b></div><div><span>时长</span><b>${escText(formatDuration(x.duration))}</b></div></div><div class="media-references"><strong>${x.stock?'安装与应用':'引用关系 · '+(x.referenceCount||0)+' 处'}</strong><div class="media-ref-list">${refs}</div></div><div class="media-inspector-actions">${stockAction}${!x.stock&&canUse?'<button type="button" class="primary full" id="useMediaAsset">替换当前资源</button>':''}${!x.stock?'<button type="button" id="copyMediaPath">复制路径</button>':''}${!x.stock&&x.kind==='video'&&writable?'<button type="button" id="makeVideoPoster">生成封面</button>':''}${!x.stock?`<button type="button" id="deleteMediaAsset" class="danger full" ${!writable||x.used?'disabled':''}>${x.used?'仍在使用，不能删除':'删除未引用资源'}</button>`:''}</div>`;
  $('#installStockAsset')?.addEventListener('click',()=>installSelectedStockAsset({bind:Boolean(canUse)}));$('#installStockBackground')?.addEventListener('click',()=>installSelectedStockAsset({background:true}));$('#useMediaAsset')?.addEventListener('click',()=>bindSelectedMedia());$('#addMediaToPage')?.addEventListener('click',addSelectedMediaToPage);$('#useAsPageBackground')?.addEventListener('click',applySelectedMediaAsPageBackground);$('#copyMediaPath')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(x.path);toast('资源路径已复制');}catch{toast(x.path,3000);}});$('#makeVideoPoster')?.addEventListener('click',()=>generatePosterFromAsset(x.path));$('#deleteMediaAsset')?.addEventListener('click',deleteSelectedMedia);box.querySelectorAll('[data-media-ref]').forEach(b=>b.addEventListener('click',()=>{const r=x.references?.[Number(b.dataset.mediaRef)];if(!r?.page)return;$('#mediaDialog').close();state.page=Math.max(0,Number(r.page)-1);renderPages();renderPage();if(Number.isInteger(r.blockIndex))focusBlock(r.blockIndex);else $('#pageEditor')?.scrollTo({top:0,behavior:'smooth'});}));
}
function renderMediaList() {
  const data=state.mediaAssets||{items:[]}; $('#mediaSourceNote').textContent=`资源来源：${data.assetSource||state.issue?.assetSource||'未配置'}`; $('#mediaUploadLabel').classList.toggle('disabled',!data.writable); $('#cleanupMediaBtn').disabled=!data.writable; if($('#ttsGenerateBtn'))$('#ttsGenerateBtn').disabled=!data.writable; $('#mediaBoundaryNote').textContent=data.writable?'本期使用独立资源目录：上传有重名保护，删除前检查引用；图片可自动优化，视频可生成独立封面。':'当前 assetSource 为历史/外部目录，制作中心按只读处理：可查看引用、绑定和调整显示，但不会写入、删除或覆盖原媒体。';renderMediaSummary();renderTtsStatus();
  if(state.mediaFilter==='stock')$('#mediaBoundaryNote').textContent='精选素材均为原创 SVG。点击“安装”后会复制到当前期刊的独立素材目录，再按常规图片资源使用。'; const rows=mediaRows(); const box=$('#mediaList'); box.innerHTML=''; if(!rows.length){box.innerHTML='<div class="media-empty">当前筛选下没有媒体资源。</div>';state.mediaSelected=null;renderMediaInspector();return;}
  if(!state.mediaSelected||!rows.some(x=>x.path===state.mediaSelected))state.mediaSelected=rows[0]?.path||null;
  rows.forEach(x=>{const d=document.createElement('button');d.type='button';d.className='media-item'+(x.path===state.mediaSelected?' selected':'');d.dataset.path=x.path;d.dataset.kind=x.kind;const visual=x.kind==='image'?`<img src="${escText(mediaVisualUrl(x))}" alt="">`:`<span class="media-icon">${x.kind==='video'?'▶':x.kind==='music'?'♫':x.kind==='tts'?'声':'·'}</span>`;const useClass=x.used?'media-use':'media-unused';d.innerHTML=`<span class="media-thumb">${visual}</span><span class="media-copy"><b>${escText(x.name)}</b><small>${x.stock?'内置素材 · ':escText(mediaKindLabel(x.kind))+' · '}${escText(x.size)}${x.width&&x.height?` · ${x.width}×${x.height}`:''}</small><em class="${useClass}">${x.stock?escText(x.description):x.used?`引用 ${x.referenceCount||1} 处`:'未引用'}${x.stock?'':' · '+escText(x.path)}</em></span>`;box.appendChild(d);});renderMediaInspector();
}
function mediaTargetBlock(target=state.mediaTarget){const top=currentPage()?.blocks?.[target?.blockIndex];if(!top)return null;if(target?.nested)return top.columns?.[target.columnIndex]?.blocks?.[target.childIndex]||null;return top;}
async function openMediaDialog(target=null) { if(!state.issue)return toast('请先选择期刊'); state.mediaTarget=target; state.mediaIntent=target?'replace':'asset';state.mediaFilter=target?.kind||'all';state.mediaSelected=null;const current=target?mediaTargetBlock(target)?.[target.field||'src']:null;if(current)state.mediaSelected=current; [...$('#mediaFilters').querySelectorAll('button')].forEach(b=>b.classList.toggle('active',b.dataset.kind===state.mediaFilter)); updateMediaAccept(); $('#mediaDialog').showModal(); await loadMediaAssets(); }
function selectMediaFilter(kind='all',{intent='asset',notice=''}={}){
  state.mediaIntent=intent;state.mediaTarget=null;state.mediaFilter=kind;state.mediaSelected=null;
  [...$('#mediaFilters').querySelectorAll('button')].forEach(button=>button.classList.toggle('active',button.dataset.kind===kind));
  updateMediaAccept();renderMediaList();if(notice)toast(notice,2800);
}
function openMaterialStart(action){
  if(!requireIssue('请先选择一期期刊，再选择素材'))return;
  if(action==='template'){ $('#mediaDialog').close(); openPageTemplateDialog('add'); return; }
  if(action==='layout'){ $('#mediaDialog').close(); openLayoutLab(); return; }
  if(action==='upload'){ $('#mediaFileInput')?.click(); return; }
  if(action==='background')selectMediaFilter('stock',{intent:'background',notice:'选择一张素材后，点击右侧“安装并设为页面背景”。'});
}
function bindSelectedMedia(){const x=selectedMedia();if(!x||!state.mediaTarget)return;if(x.kind!==state.mediaTarget.kind)return toast(`请选择 ${mediaKindLabel(state.mediaTarget.kind)} 资源`);const block=mediaTargetBlock();if(!block)return;block[state.mediaTarget.field||'src']=x.path;mutateBlocks();$('#mediaDialog').close();toast('媒体资源已绑定');}
function applyPageBackgroundAsset(path,name=''){const page=currentPage();if(!page)return toast('请先选择一个页面');rememberDesignHistory('page-background',{force:true});page.design ||= {};page.design.backgroundImage=String(path);if(!Number.isFinite(Number(page.design.backgroundOverlay)))page.design.backgroundOverlay=.72;if(!['cover','contain'].includes(String(page.design.backgroundFit)))page.design.backgroundFit='cover';if(!['center','top','bottom','left','right'].includes(String(page.design.backgroundPosition)))page.design.backgroundPosition='center';finalizeDesignMutation('page-background',{force:true,message:`已设为页面背景：${name||String(path).split('/').at(-1)}`});}
function addMediaToPage(media=selectedMedia()){if(!media||!['image','video'].includes(media.kind))return toast('此资源不能直接添加到页面');const page=currentPage();if(!page)return toast('请先选择一个页面');addBlock(media.kind);const block=page.blocks?.at(-1);if(!block||block.type!==media.kind)return toast('新增内容块失败，请重试');block.src=media.path;if(media.kind==='image')block.alt=media.name;mutateBlocks();$('#mediaDialog').close();toast(`已添加${mediaKindLabel(media.kind)}到当前页`);}
function addSelectedMediaToPage(){addMediaToPage(selectedMedia());}
function applySelectedMediaAsPageBackground(){const media=selectedMedia();if(!media||media.kind!=='image')return toast('请选择图片资源');applyPageBackgroundAsset(media.path,media.name);$('#mediaDialog').close();}
async function installSelectedStockAsset({bind=false,background=false}={}){const x=selectedMedia();if(!x?.stock)return;if(!state.mediaAssets?.writable)return toast('当前资源目录为只读，不能安装内置素材');try{const installed=await api(`/api/issues/${state.issue.id}/assets/stock`,{method:'POST',body:JSON.stringify({stockId:x.stockId})});await loadMediaAssets();state.mediaSelected=installed.path;renderMediaList();if(background){applyPageBackgroundAsset(installed.path,x.name);$('#mediaDialog').close();return;}if(bind&&state.mediaTarget){const block=mediaTargetBlock();if(!block)return;block[state.mediaTarget.field||'src']=installed.path;mutateBlocks();$('#mediaDialog').close();toast('内置素材已安装并绑定');return;}addMediaToPage({...installed,kind:'image',name:x.name});}catch(e){toast(e.message,3600);}}
$('#mediaLibraryBtn').onclick=()=>setStudioEntry('media');
$('#mediaFilters').addEventListener('click',e=>{const b=e.target.closest('[data-kind]');if(!b)return;selectMediaFilter(b.dataset.kind);});
$('#mediaDialog')?.addEventListener('click',e=>{const button=e.target.closest('[data-material-start]');if(button)openMaterialStart(button.dataset.materialStart);});
$('#mediaList').addEventListener('click',e=>{const item=e.target.closest('.media-item');if(!item)return;state.mediaSelected=item.dataset.path;renderMediaList();});
async function deleteSelectedMedia(){const x=selectedMedia();if(!x||x.used)return;if(!confirm(`确定删除未引用媒体“${x.name}”？此操作删除文件本身，不能通过页面撤销恢复。`))return;try{await api(`/api/issues/${state.issue.id}/assets/delete`,{method:'DELETE',body:JSON.stringify({path:x.path})});toast('媒体文件已删除');state.mediaSelected=null;await loadMediaAssets();}catch(e){toast(e.message,3000);}}
async function cleanupUnusedMedia(){if(!state.mediaAssets?.writable)return toast('当前资源目录为只读');try{const plan=await api(`/api/issues/${state.issue.id}/assets/cleanup`,{method:'POST',body:JSON.stringify({confirm:false})});if(!plan.count)return toast('没有可清理的未引用媒体');if(!confirm(`发现 ${plan.count} 个未引用媒体，共 ${plan.size}。确定永久删除这些文件？`))return;const done=await api(`/api/issues/${state.issue.id}/assets/cleanup`,{method:'POST',body:JSON.stringify({confirm:true})});toast(`已清理 ${done.count} 个未引用媒体`);state.mediaSelected=null;await loadMediaAssets();}catch(e){toast(e.message,3200);}}
$('#cleanupMediaBtn').onclick=cleanupUnusedMedia;
async function generatePosterFromAsset(pathValue){try{toast('正在生成视频封面…',3000);const x=await api(`/api/issues/${state.issue.id}/assets/poster`,{method:'POST',body:JSON.stringify({path:pathValue})});toast('视频封面已生成');await loadMediaAssets();state.mediaSelected=x.path;renderMediaList();return x;}catch(e){toast(e.message,3600);return null;}}
async function generatePosterForBlock(index){const block=currentPage()?.blocks?.[index];if(!block?.src)return toast('请先绑定视频资源');const x=await generatePosterFromAsset(block.src);if(!x)return;block.poster=x.path;mutateBlocks();toast('视频封面已生成并绑定');}
async function confirmTtsBaseline(){if(state.dirty)return toast('请先保存当前修改，再确认 TTS 基线',3000);if(!confirm('仅当 page-XX.mp3 已按当前页面正文和顺序重新生成后，才应确认同步。继续吗？'))return;try{const x=await api(`/api/issues/${state.issue.id}/tts/baseline`,{method:'POST',body:'{}'});state.issue.features ||= {};state.issue.features.narration=x.narration;state.originalIssue=cloneData(state.issue);state.sourceStatus=x.source||state.sourceStatus;state.sourceFingerprint=String(x.source?.fingerprint||state.sourceFingerprint||'');state.sourceObservedFingerprint=state.sourceFingerprint;state.sourceConflict=null;renderSourceStatus();resetHistory();await loadMediaAssets();toast('TTS 已标记为与当前页面同步');}catch(e){toast(e.message,3200);}}
function narrationBlockText(block={}){switch(block.type){case'paragraph':case'heading':case'textFlow':case'sectionHeading':return block.text||block.title||'';case'pullQuote':return [block.label,block.text,block.attribution].filter(Boolean).join('。');case'sidebar':case'quote':case'cardline':return [block.title,block.text].filter(Boolean).join('。');case'chips':return (block.items||[]).map(x=>x?.text||'').filter(Boolean).join('，');case'casePair':return [block.case,block.warning].filter(Boolean).join('。');case'video':case'image':return block.caption||'';case'table':return [block.caption,...(block.rows||[]).flat()].filter(Boolean).join('。');case'coverMeta':case'blessing':case'producer':return block.text||'';case'coverSections':return (block.items||[]).filter(Boolean).join('，');case'cards':return (block.items||[]).flatMap(x=>[x?.title,x?.text,x?.body]).filter(Boolean).join('。');case'articleLink':{const article=state.issue?.articles?.[block.articleId]||{};return [block.title,article.title,article.subtitle,...(article.paras||[])].filter(Boolean).join('。');}case'container':return (block.columns||[]).flatMap(column=>(column.blocks||[]).map(narrationBlockText)).filter(Boolean).join('。');default:return '';}}
function narrationPageText(page={}){return [page.kicker,page.title,page.subtitle,...(page.body||[]),...(page.blocks||[]).map(narrationBlockText)].filter(Boolean).join('。').replace(/\s+/g,' ').trim();}
async function generateTtsForStudio(){
  if(!state.issue||state.ttsGenerating)return;
  const id=state.issue.id,scope=$('#ttsGenerateScope')?.value||'current',btn=$('#ttsGenerateBtn');
  state.ttsGenerating=true;
  if(btn){btn.disabled=true;btn.textContent='生成中…';}
  try{
    if(state.dirty&&!await saveIssue({silent:true}))return;
    if(state.issue?.id!==id)return;
    await loadMediaAssets();
    if(state.issue?.id!==id)return;
    if(state.mediaAssets?.error)throw new Error(state.mediaAssets.error);
    const pages=state.issue.pages||[],missing=new Set(state.mediaAssets?.tts?.missingPages||[]);
    const affected=new Set([...(state.mediaAssets?.tts?.changedPages||[]),...missing]);
    const indices=scope==='changed'?pages.map((_,i)=>i).filter(i=>affected.has(i+1)):scope==='current'?[state.page]:scope==='missing'&&state.mediaAssets?.tts?.expected?pages.map((_,i)=>i).filter(i=>missing.has(i+1)):pages.map((_,i)=>i);
    const payload=indices.map(i=>({page:i+1,text:narrationPageText(pages[i])})).filter(x=>x.text);
    if(!payload.length)return toast(scope==='changed'?'朗读已是最新，无需重新生成。':scope==='missing'?'没有缺失的朗读页；正文变更请重新生成对应页面。':'当前范围没有可朗读正文',3600);
    const submitted=JSON.stringify(state.issue),fingerprint=state.sourceFingerprint;
    const start=await api(`/api/issues/${encodeURIComponent(id)}/tts/generate`,{method:'POST',body:JSON.stringify({pages:payload,voice:state.issue.features?.narration?.voice,rate:state.issue.features?.narration?.rate||1,async:true}),allowError:true});
    const r=await waitForBackgroundJob(start,'TTS 生成');
    if(!r.ok)throw new Error(r.error||'TTS 生成失败');
    if(state.issue?.id!==id){toast(`第 ${id} 期朗读已生成，切回该期可查看。`);return;}
    if(r.issue){
      if(state.sourceFingerprint!==fingerprint||JSON.stringify(state.issue)!==submitted){
        // Preserve edits made while audio was being generated. Do not adopt an old response.
        state.sourceConflict={at:Date.now(),baselineFingerprint:fingerprint,serverFingerprint:r.source?.fingerprint||'',localIssue:cloneData(state.issue)};
        renderSourceStatus();toast('朗读已生成；生成期间的新修改已保留，请通过源稿冲突提示核对服务器版本。',5200);return;
      }
      state.issue=cloneData(r.issue);state.originalIssue=cloneData(r.issue);state.dirty=false;
      state.auditStale=Boolean(state.audit);state.sourceStatus=r.source||state.sourceStatus;
      state.sourceFingerprint=String(r.source?.fingerprint||fingerprint);state.sourceObservedFingerprint=state.sourceFingerprint;
      state.sourceConflict=null;renderSourceStatus();resetHistory();renderPage();updateStateBadges();
    }
    await loadMediaAssets();
    toast(`已生成 ${r.generated?.length||0} 页朗读${r.failed?.length?`，失败 ${r.failed.length} 页，请重试对应页面。`:''}`,4200);
  }catch(e){toast(e.message,4200);}
  finally{state.ttsGenerating=false;if(btn){btn.disabled=!state.mediaAssets?.writable;btn.textContent='生成并添加';}}
}
ensureTtsSettingsUi();
$('#ttsGenerateBtn')?.addEventListener('click',generateTtsForStudio);
$('#mediaFileInput').addEventListener('change',async e=>{let file=e.target.files?.[0];e.target.value='';if(!file)return;if(!state.mediaAssets?.writable)return toast('当前资源目录为只读，不能上传',2600);const kind=mediaKindForFile(file);if(!kind)return toast('音频文件请先选择“音乐”或“朗读”分类，或选择受支持的图片/视频格式。',3000);try{let optimizeInfo=null;if(kind==='image'){optimizeInfo=await optimizeImageFile(file);file=optimizeInfo.file;}toast(`正在上传 ${file.name}…`,3000);const x=await uploadAsset(file,kind);await loadMediaAssets();state.mediaSelected=x.path;renderMediaList();if(state.mediaTarget&&state.mediaTarget.kind===kind){const block=mediaTargetBlock();if(block){block[state.mediaTarget.field||'src']=x.path;mutateBlocks();$('#mediaDialog').close();}}const opt=optimizeInfo?.optimized?`，已优化为 ${Math.round(optimizeInfo.optimizedBytes/1024)} KB`:'';toast((x.renamed?`上传完成，为避免覆盖已重命名为 ${x.name}`:'上传完成')+opt,3200);}catch(err){toast(err.message,3200);}});

function updateImageAdjustPreview(){const ratio=$('#imageFrameRatio').value,fit=$('#imageFit').value,x=Number($('#imageFocusX').value),y=Number($('#imageFocusY').value);const frame=$('#imageAdjustFrame'),img=$('#imageAdjustPreview');frame.dataset.ratio=ratio;img.style.objectFit=fit;img.style.objectPosition=`${x}% ${y}%`;$('#imageFocusXOut').value=`${x}%`;$('#imageFocusYOut').value=`${y}%`;}
function openImageAdjust(index){const block=currentPage()?.blocks?.[index];if(!block||block.type!=='image')return;if(!block.src){toast('请先绑定图片资源');return;}state.imageAdjustBlock=index;$('#imageAdjustPreview').src=issueAssetUrl(block.src||'');$('#imageFrameRatio').value=['auto','16:9','4:3','3:2','1:1'].includes(block.frameRatio)?block.frameRatio:'auto';$('#imageFit').value=block.fit==='cover'?'cover':'contain';$('#imageFocusX').value=String(Math.max(0,Math.min(100,Number(block.positionX??50))));$('#imageFocusY').value=String(Math.max(0,Math.min(100,Number(block.positionY??50))));updateImageAdjustPreview();$('#imageAdjustDialog').showModal();}
for(const id of ['imageFrameRatio','imageFit','imageFocusX','imageFocusY'])$('#'+id).addEventListener('input',updateImageAdjustPreview);
$('#resetImageAdjust').onclick=()=>{$('#imageFrameRatio').value='auto';$('#imageFit').value='contain';$('#imageFocusX').value='50';$('#imageFocusY').value='50';updateImageAdjustPreview();};
$('#applyImageAdjust').onclick=e=>{e.preventDefault();const block=currentPage()?.blocks?.[state.imageAdjustBlock];if(!block)return $('#imageAdjustDialog').close();block.frameRatio=$('#imageFrameRatio').value;block.fit=$('#imageFit').value;block.positionX=Number($('#imageFocusX').value);block.positionY=Number($('#imageFocusY').value);mutateBlocks();$('#imageAdjustDialog').close();toast('图片显示设置已应用');};

const READER_PREVIEW_DEVICES = {
  adaptive:{width:980,height:768,label:'当前页自适应 · 单页聚焦'},
  'desktop-1366':{width:1366,height:768,label:'PC 双页 · 1366×768'},
  'desktop-1920':{width:1920,height:1080,label:'PC 双页 · 1920×1080'},
  'tablet-820':{width:820,height:1180,label:'iPad · 820×1180'},
  'phone-390':{width:390,height:844,label:'手机单页 · 390×844'},
  'phone-412':{width:412,height:915,label:'手机单页 · 412×915'}
};
function readerLayoutProfile(page=currentPage()){
  const type=String(page?.type||'article').toLowerCase();
  let columns=Math.max(1,Number(page?.publishing?.columns)||1),containers=0,media=0;
  const walk=rows=>(rows||[]).forEach(block=>{if(!block)return;if(['image','video'].includes(block.type))media++;if(block.type==='container'){containers++;columns=Math.max(columns,(block.columns||[]).length||1);(block.columns||[]).forEach(column=>walk(column?.blocks));}});
  walk(page?.blocks||[]);
  return {type,columns,containers,media};
}
function adaptiveReaderDevice(page=currentPage()){
  const profile=readerLayoutProfile(page);
  const visible=new Set([state.page]);
  const measured=(state.visualMetrics?.pages||[]).filter(x=>visible.has(Number(x.pageIndex)));
  // Let the iframe viewport follow the workbench itself. The Reader can then
  // perform its own responsive layout once, rather than being rendered at a
  // fixed desktop size and scaled a second time inside the canvas.
  const area=$('#readerViewportArea'),availableWidth=Math.floor(area?.clientWidth||980),availableHeight=Math.floor(area?.clientHeight||760),toolbarReserve=state.readerToolbarCollapsed?12:58;
  const width=Math.max(320,availableWidth-12),height=Math.max(280,availableHeight-toolbarReserve);
  const mode=profile.columns>=3?'三栏':profile.media?'图文':['cover','toc','closing'].includes(profile.type)?'结构':'正文';
  return {width,height,label:`当前页响应式 · ${mode} · ${width}×${height}${measured.length?' · 已按实测内容':''}`};
}
function currentReaderDevice(){return state.readerPreviewDevice==='adaptive'?adaptiveReaderDevice():READER_PREVIEW_DEVICES[state.readerPreviewDevice]||READER_PREVIEW_DEVICES['desktop-1366'];}
function liveReaderUrl({embed=true}={}){if(!state.issue)return 'about:blank';return appUrl(`/live-preview/${encodeURIComponent(state.issue.id)}/?studio=1${embed?'&embed=1':''}&page=${state.page+1}&v=${encodeURIComponent(readerRuntimeCacheKey())}`);}
function refreshAdaptiveReaderDevice(){if(state.readerPreviewDevice!=='adaptive')return;const cfg=currentReaderDevice(),device=$('#readerDevice');if(device){device.style.width=`${cfg.width}px`;device.style.height=`${cfg.height}px`;}const badge=$('#readerLayoutBadge');if(badge)badge.textContent=cfg.label;requestAnimationFrame(fitReaderPreview);}
function applyReaderPreviewDevice(key,{remember=true}={}){if(key!=='adaptive'&&!READER_PREVIEW_DEVICES[key])key='desktop-1366';state.readerPreviewDevice=key;const cfg=currentReaderDevice(),device=$('#readerDevice'),select=$('#readerPreviewDevice');if(select)select.value=key;if(device){device.style.width=`${cfg.width}px`;device.style.height=`${cfg.height}px`;}const badge=$('#readerLayoutBadge');if(badge)badge.textContent=cfg.label;if(remember)try{localStorage.setItem('v3StudioReaderDevice',key)}catch{}requestAnimationFrame(fitReaderPreview);}
function scheduleReaderPreviewFit(){if(state.readerFitFrame)return;state.readerFitFrame=requestAnimationFrame(()=>{state.readerFitFrame=0;fitReaderPreview();});}
function bindReaderViewportResizeObserver(){const area=$('#readerViewportArea');if(!area||state.readerViewportResizeObserver||typeof ResizeObserver!=='function')return;if(!state.readerViewportResizeObserver){state.readerViewportResizeObserver=new ResizeObserver(scheduleReaderPreviewFit);state.readerViewportResizeObserver.observe(area);const card=$('#previewCard');if(card)state.readerViewportResizeObserver.observe(card);}}
function captureReaderViewportAnchor(area=$('#readerViewportArea'),box=$('#readerScaleBox')){if(!area||!box)return null;const width=Math.max(1,box.offsetWidth||box.getBoundingClientRect().width),height=Math.max(1,box.offsetHeight||box.getBoundingClientRect().height),x=(area.scrollLeft+area.clientWidth/2-box.offsetLeft)/width,y=(area.scrollTop+area.clientHeight/2-box.offsetTop)/height;return {x:Math.max(0,Math.min(1,x)),y:Math.max(0,Math.min(1,y))};}
function restoreReaderViewportAnchor(anchor,area=$('#readerViewportArea'),box=$('#readerScaleBox')){if(!anchor||!area||!box)return;const maxX=Math.max(0,area.scrollWidth-area.clientWidth),maxY=Math.max(0,area.scrollHeight-area.clientHeight),left=box.offsetLeft+anchor.x*box.offsetWidth-area.clientWidth/2,top=box.offsetTop+anchor.y*box.offsetHeight-area.clientHeight/2;area.scrollLeft=Math.max(0,Math.min(maxX,left));area.scrollTop=Math.max(0,Math.min(maxY,top));}
function fitReaderPreview(){const area=$('#readerViewportArea'),box=$('#readerScaleBox'),device=$('#readerDevice');if(!area||!box||!device)return;bindReaderViewportResizeObserver();const anchor=captureReaderViewportAnchor(area),cfg=currentReaderDevice(),r=area.getBoundingClientRect();if(!r.width||!r.height)return;const padding=state.readerPreviewDevice==='adaptive'?0:24;const scale=resolveViewportScale({mode:state.readerZoomMode,zoomPercent:state.readerZoomPercent,areaWidth:r.width,areaHeight:r.height,deviceWidth:cfg.width,deviceHeight:cfg.height,padding});state.readerActualScale=scale;box.style.width=`${cfg.width*scale}px`;box.style.height=`${cfg.height*scale}px`;device.style.left='0px';device.style.top='0px';device.style.transform=`scale(${scale})`;device.dataset.scale=scale.toFixed(4);area.classList.toggle('manual-zoom',state.readerZoomMode==='manual');const label=$('#readerZoomLabel');if(label)label.textContent=readerZoomLabelText(state.readerZoomMode,state.readerZoomPercent,scale);const badge=$('#readerLayoutBadge');if(badge)badge.textContent=cfg.label;requestAnimationFrame(()=>restoreReaderViewportAnchor(anchor,area));}
function setReaderZoom(mode='fit-page',percent=state.readerZoomPercent,{remember=true}={}){state.readerZoomMode=['fit-page','fit-width','manual'].includes(mode)?mode:'fit-page';state.readerZoomPercent=clampReaderZoom(percent);if(remember)try{localStorage.setItem('v3StudioReaderZoomMode',state.readerZoomMode);localStorage.setItem('v3StudioReaderZoomPercent',String(state.readerZoomPercent));}catch{}requestAnimationFrame(fitReaderPreview);}
function nudgeReaderZoom(direction){const current=state.readerZoomMode==='manual'?state.readerZoomPercent:Math.round((state.readerActualScale||1)*100);setReaderZoom('manual',nearestReaderZoomStep(current,direction));}
function setReaderToolbarCollapsed(collapsed,{remember=true}={}){state.readerToolbarCollapsed=Boolean(collapsed);const toolbar=$('#readerPreviewToolbar'),panel=$('#builtPreviewPanel'),button=$('#readerToolbarToggle');toolbar?.classList.toggle('is-collapsed',state.readerToolbarCollapsed);panel?.classList.toggle('reader-toolbar-collapsed',state.readerToolbarCollapsed);if(button){button.setAttribute('aria-expanded',String(!state.readerToolbarCollapsed));button.textContent=state.readerToolbarCollapsed?'◀ 画布工具':'收束 ▶';button.title=state.readerToolbarCollapsed?'向左展开画布工具栏':'向右收束画布工具栏';}if(remember)try{localStorage.setItem('v3StudioReaderToolbarCollapsed',state.readerToolbarCollapsed?'1':'0')}catch{}if(state.readerPreviewDevice==='adaptive')refreshAdaptiveReaderDevice();else requestAnimationFrame(fitReaderPreview);}

function readerPageSyncStatus(){const frame=$('#builtPreviewFrame'),target=Number.isInteger(state.readerTargetPage)?state.readerTargetPage:state.page,requestedRaw=frame?.dataset.requestedPageIndex,renderedRaw=frame?.dataset.renderedPageIndex,requested=requestedRaw!==undefined&&requestedRaw!==''?Number(requestedRaw):-1,rendered=renderedRaw!==undefined&&renderedRaw!==''?Number(renderedRaw):-1,pending=state.readerPendingPageRequest;return {target,requested,rendered,pending,timeout:frame?.dataset.pageSyncState==='timeout',matched:Boolean(state.readerPreviewReady&&!pending&&requested===target&&rendered===target)};}
function updateBuiltPreviewState(){const el=$('#builtPreviewState');if(!el)return;if(!state.issue){el.textContent='尚未选择期刊';return;}const pageSync=readerPageSyncStatus(),pageNumber=pageSync.target+1,retry=$('#refreshBuiltPreview');let detail='真实 Reader 已同步当前编辑稿',short='Reader 已同步',busy=false;if(pageSync.timeout){detail=`Reader 第 ${pageNumber} 页同步超时，可点击“修复预览”重试`;short='Reader 同步超时';busy=true;}else if(!state.readerPreviewReady){detail='Reader 正在加载…';short='Reader 加载中';busy=true;}else if(state.builtPreviewStale){detail='正在同步当前编辑稿…';short='Reader 内容同步中';busy=true;}else if(!pageSync.matched){detail=`Reader 正在切换到第 ${pageNumber} 页…`;short=`Reader 切换第 ${pageNumber} 页`;busy=true;}if(retry)retry.hidden=!pageSync.timeout;el.textContent=detail;el.classList.toggle('stale',busy);if(state.previewMode==='built'){$('#previewOverflow').textContent=busy?'同步中':'实时同步';$('#previewOverflow').className=`preview-status ${busy?'warning':'ok'}`;if($('#workspaceReaderState')){$('#workspaceReaderState').textContent=short;$('#workspaceReaderState').classList.toggle('busy',busy);}}}
function ensureReaderPreviewFrame(force=false){if(!state.issue)return;const frame=$('#builtPreviewFrame');if(!frame)return;const id=String(state.issue.id),current=frame.getAttribute('data-issue-id'),target=Number.isInteger(state.readerTargetPage)?state.readerTargetPage:state.page,reloadReason=force?'force':current!==id?'issue-change':!frame.src?'empty-src':'';if(reloadReason){state.readerPreviewReady=false;frame.dataset.lastReloadReason=reloadReason;frame.dataset.issueId=id;frame.dataset.requestedPageIndex=String(target);frame.dataset.pageSyncState='loading';frame.removeAttribute('data-rendered-page-index');const reload=force?`&reload=${++state.previewFrameReloadSeq}`:'';frame.src=`${appUrl(`/live-preview/${encodeURIComponent(state.issue.id)}/?studio=1&embed=1&page=${target+1}`)}&v=${encodeURIComponent(readerRuntimeCacheKey())}${reload}`;updateBuiltPreviewState();}}
function readerFrameRequestedPage(frame=$('#builtPreviewFrame')){if(!frame?.src)return -1;try{const page=Number(new URL(frame.src,location.href).searchParams.get('page'));return Number.isInteger(page)&&page>0?page-1:-1;}catch{return -1;}}
function navigateReaderFrameToPage(target,{force=false}={}){const frame=$('#builtPreviewFrame');if(!frame||!state.issue)return false;const safe=Math.max(0,Math.min((state.issue.pages?.length||1)-1,Number(target)||0)),current=readerFrameRequestedPage(frame);if(!force&&current===safe)return false;clearReaderPageRequest();state.readerPreviewReady=false;frame.dataset.lastReloadReason=force?'page-repair':'page-navigation';frame.dataset.issueId=String(state.issue.id);frame.dataset.requestedPageIndex=String(safe);frame.dataset.pageSyncState='loading';frame.removeAttribute('data-rendered-page-index');const reload=force?`&reload=${++state.previewFrameReloadSeq}`:'';frame.src=`${appUrl(`/live-preview/${encodeURIComponent(state.issue.id)}/?studio=1&embed=1&page=${safe+1}`)}&v=${encodeURIComponent(readerRuntimeCacheKey())}${reload}`;updateBuiltPreviewState();return true;}
function clearReaderPageRequest(requestId=null){const pending=state.readerPendingPageRequest;if(!pending)return;if(requestId&&pending.requestId!==requestId)return;state.readerPendingPageRequest=null;clearTimeout(state.readerPageVerifyTimer);state.readerPageVerifyTimer=0;}
function resolveReaderPageIndex(data={}){const i=Number(data.pageIndex);if(Number.isInteger(i)&&i>=0&&i<(state.issue?.pages||[]).length)return i;const pageId=data.pageId==null?'':String(data.pageId),byId=findPageIndexById(state.issue,pageId);return byId>=0?byId:-1;}
function sendReaderPageCommand(target,{reliable=false,reuseRequest=false}={}){const frame=$('#builtPreviewFrame');if(!frame)return null;const safe=Math.max(0,Math.min((state.issue?.pages?.length||1)-1,Number(target)||0)),pageId=state.issue?.pages?.[safe]?.id||null;let pending=state.readerPendingPageRequest;if(!reuseRequest||!pending||pending.target!==safe||pending.pageId!==pageId){pending={requestId:`page-${++state.readerPageRequestSeq}-${Date.now().toString(36)}`,target:safe,pageId,attempts:0,at:Date.now(),observedMismatch:false};state.readerPendingPageRequest=pending;}pending.attempts++;frame.dataset.requestedPageIndex=String(safe);frame.dataset.pageSyncState='pending';if(pageId)frame.dataset.pageId=String(pageId);updateBuiltPreviewState();if(state.readerPreviewReady||frame.contentWindow){try{frame.contentWindow?.postMessage({source:'v3-studio',type:'page',issueId:state.issue?.id||null,pageIndex:safe,pageId,requestId:pending.requestId},'*');}catch{}}else if(!frame.getAttribute('src'))ensureReaderPreviewFrame(true);if(reliable){clearTimeout(state.readerPageVerifyTimer);state.readerPageVerifyTimer=setTimeout(()=>{const current=state.readerPendingPageRequest;if(!current||current.requestId!==pending.requestId)return;if(current.attempts===5){state.readerPreviewReady=false;ensureReaderPreviewFrame(true);}if(current.attempts>=8){clearReaderPageRequest(current.requestId);frame.dataset.pageSyncState='timeout';updateBuiltPreviewState();toast('Reader 页面同步超时，请刷新预览',2600);return;}sendReaderPageCommand(current.target,{reliable:true,reuseRequest:true});},Math.min(900,180+Math.min(pending.attempts,9)*80));}return pending.requestId;}
function syncReaderPreviewPage({reliable=false,reload=false}={}){if(!state.issue||state.previewMode!=='built')return;state.readerTargetPage=state.page;if(!WORKSPACE_MODE){ensureManagerPreviewFrame(reload);sendManagerPreviewPage({reliable:true});return;}ensureReaderPreviewFrame();/* Keep the Reader document alive during normal page navigation: rewriting src causes a flash, resets layout and can show page 1 before the target page arrives. */if(reload){navigateReaderFrameToPage(state.page,{force:true});return;}sendReaderPageCommand(state.page,{reliable});}
async function pushReaderPreview({reload=false}={}){if(!state.issue)return false;clearTimeout(state.readerPreviewTimer);if(state.readerSyncInFlight){state.readerSyncQueued=true;state.readerSyncQueuedReload=state.readerSyncQueuedReload||reload;state.builtPreviewStale=true;updateBuiltPreviewState();return false;}state.readerSyncInFlight=true;const issueSnapshot=cloneData(state.issue),issueId=issueSnapshot.id,token=++state.readerPreviewToken;state.builtPreviewStale=true;updateBuiltPreviewState();if(WORKSPACE_MODE)ensureReaderPreviewFrame();const frame=$('#builtPreviewFrame');if(WORKSPACE_MODE&&!reload&&state.readerPreviewReady){try{frame.contentWindow?.postMessage({source:'v3-studio',type:'issue',issue:issueSnapshot,pageIndex:state.page,token},'*');}catch{}}syncManagerPreviewIssue();
  try{await api(`/api/issues/${encodeURIComponent(issueId)}/live-preview`,{method:'POST',body:JSON.stringify(issueSnapshot)});if(WORKSPACE_MODE&&reload)ensureReaderPreviewFrame(true);else if(WORKSPACE_MODE&&!state.readerPreviewReady){try{frame.contentWindow?.postMessage({source:'v3-studio',type:'issue',issue:issueSnapshot,pageIndex:state.page,token},'*');}catch{}}return true;}catch(e){$('#builtPreviewState').textContent=`实时预览后台同步失败：${e.message}`;$('#previewOverflow').textContent='后台同步失败';$('#previewOverflow').className='preview-status warning';return false;}finally{state.readerSyncInFlight=false;if(state.readerSyncQueued){const queuedReload=state.readerSyncQueuedReload;state.readerSyncQueued=false;state.readerSyncQueuedReload=false;scheduleReaderPreviewSync(queuedReload?0:240);}}}
function scheduleReaderPreviewSync(delay=240){if(!state.issue)return;clearTimeout(state.readerPreviewTimer);state.builtPreviewStale=true;updateBuiltPreviewState();state.readerPreviewTimer=setTimeout(()=>pushReaderPreview(),delay);}
function setPreviewMode(){state.previewMode='built';$('#builtPreviewPanel')?.classList.remove('hidden');ensureReaderPreviewFrame();scheduleReaderPreviewSync(10);requestAnimationFrame(fitReaderPreview);}
async function refreshBuiltPreview(){if(!state.issue)return false;$('#refreshBuiltPreview').disabled=true;try{const ok=await pushReaderPreview({reload:true});toast(ok?'真实 Reader 已重新同步':'预览重试失败，请检查网络后再试',ok?2200:3800);return ok;}finally{$('#refreshBuiltPreview').disabled=false;}}
function readerFullscreenElement(){return document.fullscreenElement||document.webkitFullscreenElement||null;}
function updateReaderFullscreenUi(){const card=$('#previewCard'),active=readerFullscreenElement()===card||state.readerFullscreenFallback;state.readerPreviewExpanded=active;card?.classList.toggle('reader-expanded',state.readerFullscreenFallback);document.body.classList.toggle('reader-preview-open',active);const b=$('#expandReaderPreview');if(b)b.textContent=active?'退出全屏':'全屏画布';requestAnimationFrame(()=>requestAnimationFrame(fitReaderPreview));}
async function toggleReaderPreviewExpanded(force){const card=$('#previewCard');if(!card)return false;const active=readerFullscreenElement()===card||state.readerFullscreenFallback,desired=force==null?!active:Boolean(force);if(desired){const fn=card.requestFullscreen||card.webkitRequestFullscreen;if(fn){try{await fn.call(card);state.readerFullscreenFallback=false;updateReaderFullscreenUi();return true;}catch{}}state.readerFullscreenFallback=true;updateReaderFullscreenUi();return true;}const exit=document.exitFullscreen||document.webkitExitFullscreen;if(readerFullscreenElement()&&exit){try{await exit.call(document);}catch{}}state.readerFullscreenFallback=false;updateReaderFullscreenUi();return true;}
async function popoutReaderPreview(){if(!state.issue)return;const popup=window.open('about:blank','_blank');if(!popup)return toast('浏览器阻止了新窗口，请允许本站打开弹出窗口',3200);try{popup.opener=null;}catch{}const ok=state.dirty?await saveDraftNow():true;if(state.dirty&&!ok){try{popup.close()}catch{}return toast('当前草稿保存失败，未打开新工作台',3200);}await pushReaderPreview();const url=workspaceRouteUrl({workspace:true,inherit:true,handoff:true});try{popup.location.replace(url);}catch{popup.location.href=url;}}
async function enterWorkspaceFromManager(){
  if(!state.issue)return toast('请先选择一期期刊');
  commitPage();
  if(state.dirty&&!state.draftSaving){
    const ok=await saveDraftNow();
    if(!ok)return toast('当前草稿保存失败，未进入工作区',3200);
  }
  try{await pushReaderPreview();}catch{}
  // The draft is persisted and the workspace route is the handoff target;
  // suppress the generic beforeunload warning for this intentional transition.
  state.dirty=false;
  const url=workspaceRouteUrl({workspace:true,inherit:true,handoff:true});
  window.location.assign(url);
}
async function leaveWorkspaceToManager(){
  if(!state.issue)return;
  commitPage();
  // Leaving the workspace must never be blocked by a transient draft API
  // failure. The editor already schedules automatic draft persistence; keep
  // the current in-memory draft available for the handoff route and navigate
  // immediately. A best-effort keepalive write protects the latest edits when
  // the browser is about to unload the workspace document.
  if(state.dirty&&!state.draftSaving){
    try{
      const url=`${APP_BASE}/api/issues/${encodeURIComponent(state.issue.id)}/draft`;
      fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({issue:state.issue}),keepalive:true}).catch(()=>{});
    }catch{}
  }
  state.dirty=false;
  updateStateBadges();
  const q=new URLSearchParams({issue:String(state.issue.id||''),page:String(state.page+1),handoff:'1'});
  window.location.assign(`${APP_BASE}?${q}`);
}
$('#visualHealthBtn')?.addEventListener('click',openVisualHealth);
$('#visualHealthBalance')?.addEventListener('click',balanceCurrentPageSpacing);
$('#readerToolbarToggle')?.addEventListener('click',()=>setReaderToolbarCollapsed(!state.readerToolbarCollapsed));
$('#refreshBuiltPreview')?.addEventListener('click',refreshBuiltPreview);$('#readerPreviewDevice')?.addEventListener('change',e=>applyReaderPreviewDevice(e.target.value));$('#readerAnimationButton')?.addEventListener('click',()=>$('#readerAnimationDialog')?.showModal());$('#workspaceReaderAnimation')?.addEventListener('change',e=>{if(!state.issue)return;const mode=['smooth','slide','fade','three-d','none'].includes(e.target.value)?e.target.value:'smooth';const meta=$('#metaTurnAnimation');if(meta)meta.value=mode;syncMeta();updateMetaSummary();updateWorkspaceToolbar();markDirty({preview:false,readerSync:false,historyGroup:'issue-meta',forceHistory:true});renderPreview({syncReader:false});scheduleReaderPreviewSync(120);toast(`工作台翻页效果：${e.target.options[e.target.selectedIndex]?.text||mode}`);});$('#readerZoomOut')?.addEventListener('click',()=>nudgeReaderZoom(-1));$('#readerZoomIn')?.addEventListener('click',()=>nudgeReaderZoom(1));$('#readerZoomLabel')?.addEventListener('click',()=>setReaderZoom(state.readerZoomMode==='manual'?'fit-page':'manual',100));$('#readerFitWidth')?.addEventListener('click',()=>setReaderZoom('fit-width'));$('#readerFitCurrentPage')?.addEventListener('click',()=>{applyReaderPreviewDevice('adaptive');setReaderZoom('fit-page',100,{remember:false});toast('已按当前页布局自适应画布');});$('#expandReaderPreview')?.addEventListener('click',()=>toggleReaderPreviewExpanded());$('#popoutReaderPreview')?.addEventListener('click',popoutReaderPreview);document.addEventListener('fullscreenchange',updateReaderFullscreenUi);document.addEventListener('webkitfullscreenchange',updateReaderFullscreenUi);
$('#readerViewportArea')?.addEventListener('wheel',e=>{if(!(e.ctrlKey||e.metaKey))return;e.preventDefault();nudgeReaderZoom(e.deltaY>0?-1:1);},{passive:false});
// Imported articleLink blocks may not have a title key yet. Initialize it before
// the normal canvas-text-edit listener validates the field type.
window.addEventListener('message',e=>{const data=e.data||{};if(data.type!=='canvas-text-edit'||data.field!=='title'||!state.issue)return;const frame=$('#builtPreviewFrame');if(!frame||e.source!==frame.contentWindow||data.source!=='v3-reader'||data.issueId!==state.issue.id)return;const block=data.blockId?findBlockByIdDeep(currentPage()?.blocks||[],data.blockId):currentPage()?.blocks?.[resolveTopBlockIndex(data)];if(block?.type==='articleLink'&&typeof block.title!=='string')block.title='';},true);
window.addEventListener('message',e=>{const frame=$('#builtPreviewFrame'),data=e.data||{},pending=state.readerPendingPageRequest;if(!frame||e.source!==frame.contentWindow||data.source!=='v3-reader'||data.issueId!==state.issue?.id||!pending)return;if(data.type==='page-ack'){const raw=Number(data.pageIndex),rendered=Number(data.renderedPageIndex),pageId=data.pageId==null?null:String(data.pageId),valid=raw===pending.target&&rendered===pending.target&&(!pending.pageId||pageId===pending.pageId);if(!valid){pending.observedMismatch=true;sendReaderPageCommand(pending.target,{reliable:true,reuseRequest:true});e.stopImmediatePropagation();}}else if(data.type==='page'){const raw=Number(data.pageIndex);if(raw!==pending.target){pending.observedMismatch=true;sendReaderPageCommand(pending.target,{reliable:true,reuseRequest:true});}e.stopImmediatePropagation();}},true);
window.addEventListener('message',e=>{const data=e.data||{},managerFrame=$('#managerPagePreview');if(managerFrame&&e.source===managerFrame.contentWindow&&data.source==='v3-reader'&&data.issueId===state.issue?.id){if(data.type==='page'){const i=resolveReaderPageIndex(data);if(i>=0&&i!==state.page)goToPage(i,{fromReader:true});}return;}const frame=$('#builtPreviewFrame');if(!frame||e.source!==frame.contentWindow||data.source!=='v3-reader'||data.issueId!==state.issue?.id)return;if(data.type==='page-ack'){const i=resolveReaderPageIndex(data),pending=state.readerPendingPageRequest;if(pending&&data.requestId===pending.requestId&&i===pending.target&&(!pending.pageId||!data.pageId||pending.pageId===data.pageId)){clearReaderPageRequest(pending.requestId);frame.dataset.pageIndex=String(i);frame.dataset.renderedPageIndex=String(i);frame.dataset.pageSyncState='synced';if(data.pageId)frame.dataset.pageId=data.pageId;updateBuiltPreviewState();}return;}if(data.type==='page'){const i=resolveReaderPageIndex(data);if(i<0)return;const pending=state.readerPendingPageRequest;if(pending){if(i===pending.target){clearReaderPageRequest(pending.requestId);frame.dataset.pageIndex=String(i);frame.dataset.renderedPageIndex=String(i);frame.dataset.pageSyncState='synced';updateBuiltPreviewState();}else{pending.observedMismatch=true;sendReaderPageCommand(pending.target,{reliable:true,reuseRequest:true});}return;}frame.dataset.renderedPageIndex=String(i);if(i!==state.page)goToPage(i,{fromReader:true});else{frame.dataset.requestedPageIndex=String(i);frame.dataset.pageSyncState='synced';updateBuiltPreviewState();}return;}if(data.type==='ready'){state.readerPreviewReady=true;updateBuiltPreviewState();pushReaderPreview().finally(()=>syncReaderPreviewPage({reliable:true}));requestAnimationFrame(()=>{syncReaderPreviewPage({reliable:true});syncCanvasSelectionToReader();renderMobileStudio();});return;}if(data.type==='synced'){state.readerPreviewReady=true;state.builtPreviewStale=false;updateBuiltPreviewState();syncReaderPreviewPage({reliable:true});syncCanvasSelectionToReader();renderMobileStudio();return;}if(data.type==='visual-metrics'){state.visualMetrics={pages:Array.isArray(data.pages)?data.pages:[],at:Number(data.at)||Date.now()};updateVisualHealth();if(state.readerPreviewDevice==='adaptive')refreshAdaptiveReaderDevice();return;}if(data.type==='canvas-select'){const i=resolveReaderPageIndex(data);if(i<0)return;if(i!==state.page){if(!goToPage(i,{fromReader:true}))return;}const blockIndex=resolveTopBlockIndex(data);if(blockIndex<0)return;if(data.blockId)setBlockSelectionByIds([data.blockId],{additive:Boolean(data.additive)});else toggleBlockSelection(blockIndex,{metaKey:Boolean(data.additive),ctrlKey:Boolean(data.additive)});focusBlock(findBlockIndexById(currentPage(),data.blockId)>=0?findBlockIndexById(currentPage(),data.blockId):blockIndex);return;}if(data.type==='canvas-reorder'){const from=resolveTopBlockIndex(data),to=Number(data.toIndex);if(!Number.isInteger(from)||!Number.isInteger(to)||from===to)return;const blocks=currentPage()?.blocks||[];if(from<0||to<0||from>=blocks.length||to>=blocks.length)return;const blockId=blocks[from]?.id,selected=validSelectedBlockIds().includes(blockId);if(!blockId)return;const moved=dispatchStudioCommand('block:reorder',{blockId,toIndex:to},{historyGroup:'canvas-reorder',forceHistory:true,preview:false});if(!moved)return;if(selected){state.selectedBlockIds=new Set([blockId]);renderBlockSelectionState();}state.lastSelectedBlock=findBlockIndexById(currentPage(),blockId);renderPreview();pushReaderPreview().catch(()=>{});return;}if(data.type==='canvas-resize'){const i=resolveTopBlockIndex(data),width=Math.max(25,Math.min(100,Number(data.width)||100));const block=currentPage()?.blocks?.[i];if(!block)return;const anchor=captureReaderViewportAnchor();dispatchStudioCommand('block:design',{blockId:block.id,changes:{width}},{historyGroup:'canvas-resize',forceHistory:true,preview:false});renderPreview();pushReaderPreview().then(()=>requestAnimationFrame(()=>restoreReaderViewportAnchor(anchor))).catch(()=>{});return;}if(data.type==='canvas-align'){const i=resolveTopBlockIndex(data),align=String(data.align||'');const block=currentPage()?.blocks?.[i];if(!block||!['left','center','right'].includes(align))return;dispatchStudioCommand('block:design',{blockId:block.id,changes:{alignSelf:align}},{historyGroup:'canvas-align',forceHistory:true,preview:false});renderPreview();pushReaderPreview().catch(()=>{});return;}if(data.type==='canvas-media'){const i=resolveTopBlockIndex(data),action=String(data.action||''),block=currentPage()?.blocks?.[i];if(!block||!['image','video'].includes(block.type))return;setBlockSelection([i],{anchor:i});if(action==='replace'){openMediaDialog({kind:block.type==='video'?'video':'image',blockIndex:i,field:'src'});return;}if(action==='adjust'&&block.type==='image'){openImageAdjust(i);return;}if(action==='poster'&&block.type==='video'){openMediaDialog({kind:'image',blockIndex:i,field:'poster'});return;}if(action==='fit'&&block.type==='image'){block.fit=block.fit==='cover'?'contain':'cover';mutateBlocks();toast(`图片填充：${block.fit}`);return;}if(action==='ratio'&&block.type==='image'){const seq=['auto','16:9','4:3','3:2','1:1'],at=Math.max(0,seq.indexOf(block.frameRatio||'auto'));block.frameRatio=seq[(at+1)%seq.length];mutateBlocks();toast(`画框比例：${block.frameRatio}`);return;}return;}if(data.type==='canvas-richtext-edit'){const i=resolveTopBlockIndex(data),block=data.blockId?findBlockByIdDeep(currentPage()?.blocks||[],data.blockId):currentPage()?.blocks?.[i],doc=data.richText;if(!block||!['paragraph','quote'].includes(block.type)||!doc||doc.type!=='doc'||!Array.isArray(doc.content))return;const plain=String(data.plainText??'').slice(0,24000);dispatchStudioCommand('block:update',{blockId:block.id,changes:{richText:cloneData(doc),text:plain}},{historyGroup:`canvas-richtext:${String(data.sessionId||block.id)}`,forceHistory:Boolean(data.final),recordHistory:Boolean(data.final),preview:false,renderBlocks:Boolean(data.final)});setBlockSelectionByIds([block.id]);if(data.final){renderPreview();scheduleDraftSave();}return;}if(data.type==='canvas-text-edit'){const i=resolveTopBlockIndex(data),field=String(data.field||''),block=data.blockId?findBlockByIdDeep(currentPage()?.blocks||[],data.blockId):currentPage()?.blocks?.[i];if(!block||!['text','title','case','warning'].includes(field)||typeof block[field]!=='string')return;const changes={[field]:String(data.value??'').slice(0,12000)};if(data.resetRichText&&field==='text'&&['paragraph','quote'].includes(block.type))changes.richText=null;dispatchStudioCommand('block:update',{blockId:block.id,changes},{historyGroup:'canvas-text',forceHistory:true,preview:false});setBlockSelectionByIds([block.id]);renderPreview();scheduleReaderPreviewSync(160);return;}if(data.type==='canvas-style'){const i=resolveTopBlockIndex(data),action=String(data.action||'');if(Number.isInteger(i))setBlockSelection(state.selectedBlocks.size?[...state.selectedBlocks]:[i]);if(action==='font-delta'){const delta=Number(data.value)||0;mutateSelectedBlocks(block=>{block.design={...(block.design||{})};block.design.fontSize=Math.max(10,Math.min(48,Number(block.design.fontSize||14)+delta));},{group:'canvas-style',message:''});}else if(action==='bold'){mutateSelectedBlocks(block=>{block.design={...(block.design||{})};block.design.fontWeight=String(block.design.fontWeight)==='700'?'400':'700';},{group:'canvas-style',message:''});}else if(action==='align'){applyQuickDesign({textAlign:['left','center','right','justify'].includes(data.value)?data.value:'left'},{message:''});}return;}if(data.type==='design-target'){const i=resolveReaderPageIndex(data),blockIndex=Number(data.blockIndex);if(i<0||!Number.isInteger(blockIndex))return;if(i!==state.page){if(!commitPage()){syncReaderPreviewPage();return;}state.page=i;renderPages();renderPage();}const target={blockIndex,blockId:data.blockId||null};if(Number.isInteger(Number(data.columnIndex)))target.columnIndex=Number(data.columnIndex);if(Number.isInteger(Number(data.childIndex)))target.childIndex=Number(data.childIndex);focusBlock(blockIndex);openDesignDialog('block',target);return;}if(data.type==='page'){const i=resolveReaderPageIndex(data);if(i<0||i===state.page)return;goToPage(i,{fromReader:true});}});
window.addEventListener('message',e=>{const frame=managerPreviewFrame(),data=e.data||{};if(!frame||e.source!==frame.contentWindow||data.source!=='v3-reader'||String(data.issueId)!==String(state.issue?.id))return;if(data.type==='ready'){state.managerPreviewReady=true;state.managerPreviewIssueId=String(state.issue.id);syncManagerPreviewIssue();sendManagerPreviewPage();return;}if(data.type==='synced'){state.managerPreviewReady=true;sendManagerPreviewPage();}});
window.addEventListener('message',e=>{const frame=$('#builtPreviewFrame'),data=e.data||{};if(!frame||e.source!==frame.contentWindow||data.source!=='v3-reader'||String(data.issueId)!==String(state.issue?.id)||data.type!=='canvas-transform')return;const block=findBlockByIdDeep(currentPage()?.blocks||[],data.blockId)||resolveBlockLocation(data)?.block;if(!block)return;const raw=data.changes||{},changes={};for(const key of ['x','y','rotate','scale']){if(raw[key]==null)continue;const limits=key==='scale'?[.5,1.8]:key==='rotate'?[-180,180]:[-240,240];const n=Number(raw[key]);if(!Number.isFinite(n))continue;changes[key]=key==='scale'?Number(Math.max(limits[0],Math.min(limits[1],n)).toFixed(2)):Math.round(Math.max(limits[0],Math.min(limits[1],n)));}if(!Object.keys(changes).length)return;dispatchStudioCommand('block:design',{blockId:block.id,changes},{historyGroup:'canvas-transform',forceHistory:true,preview:false});renderPreview();scheduleReaderPreviewSync(80);});
window.addEventListener('message',e=>{const frame=$('#builtPreviewFrame'),data=e.data||{};if(!frame||e.source!==frame.contentWindow||data.source!=='v3-reader'||String(data.issueId)!==String(state.issue?.id)||data.type!=='canvas-text-edit')return;const field=String(data.field||''),match=/^items\.(\d+)\.(title|text)$/.exec(field),block=findBlockByIdDeep(currentPage()?.blocks||[],data.blockId)||resolveBlockLocation(data)?.block;if(!block||(!match&&field!=='attribution'))return;if(match){const items=Array.isArray(block.items)?clone(block.items):[],item=items[Number(match[1])];if(!item)return;item[match[2]]=String(data.value??'').slice(0,12000);dispatchStudioCommand('block:update',{blockId:block.id,changes:{items}},{historyGroup:'canvas-text',forceHistory:true,preview:false});}else{dispatchStudioCommand('block:update',{blockId:block.id,changes:{attribution:String(data.value??'').slice(0,12000)}},{historyGroup:'canvas-text',forceHistory:true,preview:false});}setBlockSelectionByIds([block.id]);renderPreview();scheduleReaderPreviewSync(80);});
$('#builtPreviewFrame').addEventListener('load',()=>{state.readerPreviewReady=false;const frame=$('#builtPreviewFrame');frame?.removeAttribute('data-rendered-page-index');updateBuiltPreviewState();scheduleReaderPreviewFit();setTimeout(()=>syncReaderPreviewPage({reliable:true}),0);});
$('#managerPagePreview')?.addEventListener('load',()=>{state.managerPreviewReady=false;setTimeout(()=>ensureManagerPreviewFrame(),0);});
window.addEventListener('message',e=>{const frame=$('#builtPreviewFrame'),data=e.data||{};if(!frame||e.source!==frame.contentWindow||data.source!=='v3-reader'||data.issueId!==state.issue?.id)return;if(['page','page-ack'].includes(data.type)){const i=resolveReaderPageIndex(data);if(i>=0){frame.dataset.renderedPageIndex=String(i);if(!state.readerPendingPageRequest&&i===state.readerTargetPage){frame.dataset.pageSyncState='synced';updateBuiltPreviewState();}}}});
window.addEventListener('resize',()=>{if(window.innerWidth<=900){document.body.classList.remove('sidebar-collapsed');document.body.classList.toggle('pages-panel-collapsed',state.pagesPanelCollapsed);}else{document.body.classList.toggle('sidebar-collapsed',state.sidebarCollapsed);document.body.classList.toggle('pages-panel-collapsed',state.pagesPanelCollapsed);}requestAnimationFrame(fitReaderPreview);},{passive:true});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.readerPreviewExpanded)toggleReaderPreviewExpanded(false);});
try{const saved=localStorage.getItem('v3StudioReaderDevice'),zoomMode=localStorage.getItem('v3StudioReaderZoomMode'),zoomPercent=Number(localStorage.getItem('v3StudioReaderZoomPercent')||100),inspector=localStorage.getItem('v3StudioInspectorOpen');if(WORKSPACE_MODE){state.readerPreviewDevice='adaptive';state.readerZoomMode='fit-page';state.readerZoomPercent=100;}else{if(saved&&READER_PREVIEW_DEVICES[saved])state.readerPreviewDevice=saved;if(['fit-page','fit-width','manual'].includes(zoomMode))state.readerZoomMode=zoomMode;state.readerZoomPercent=clampReaderZoom(zoomPercent);}if(inspector!=null)state.contextInspectorOpen=inspector!=='0';}catch{}
try{state.readerToolbarCollapsed=localStorage.getItem('v3StudioReaderToolbarCollapsed')==='1'}catch{}
setContextInspectorOpen(state.contextInspectorOpen,{remember:false});setReaderToolbarCollapsed(state.readerToolbarCollapsed,{remember:false});applyReaderPreviewDevice(state.readerPreviewDevice,{remember:false});setReaderZoom(state.readerZoomMode,state.readerZoomPercent,{remember:false});

// Capture manager-preview messages before the legacy bubble listeners. A slow
// dashboard iframe must not be allowed to move the editor back to an older page
// while the editor is still waiting for the requested page acknowledgement.
window.addEventListener('message',e=>{const frame=managerPreviewFrame(),data=e.data||{};if(!frame||e.source!==frame.contentWindow||data.source!=='v3-reader'||String(data.issueId)!==String(state.issue?.id))return;if(data.type==='ready'){state.managerPreviewReady=true;state.managerPreviewIssueId=String(state.issue.id);syncManagerPreviewIssue();sendManagerPreviewPage({reliable:true});e.stopImmediatePropagation();return;}if(data.type==='synced'){state.managerPreviewReady=true;state.builtPreviewStale=false;sendManagerPreviewPage({reliable:true});e.stopImmediatePropagation();return;}if(data.type==='page-ack'){const i=resolveReaderPageIndex(data),pending=state.managerPendingPageRequest;if(pending&&data.requestId===pending.requestId&&i===pending.target&&(!pending.pageId||!data.pageId||pending.pageId===data.pageId))clearManagerPageRequest(pending.requestId);e.stopImmediatePropagation();return;}if(data.type==='page'){const i=resolveReaderPageIndex(data),pending=state.managerPendingPageRequest;if(i<0){e.stopImmediatePropagation();return;}if(pending){if(i===pending.target)clearManagerPageRequest(pending.requestId);else{pending.observedMismatch=true;sendManagerPreviewPage({reliable:true,reuseRequest:true});}e.stopImmediatePropagation();return;}if(i!==state.page)goToPage(i,{fromReader:true});e.stopImmediatePropagation();}},true);

function summarizeIssueDiff(base,next) {
  const items=[]; const metrics={meta:0,pages:0,blocks:0,articles:0};
  if(!base||!next)return {items,metrics};
  const metaFields=[['label','期名'],['subtitle','本期主题'],['status','状态'],['publisher','发布单位']];
  for(const [field,label] of metaFields){const a=String(base[field]??''),b=String(next[field]??'');if(a!==b){metrics.meta++;items.push({kind:'元数据',title:`${label}已修改`,detail:`${a||'（空）'} → ${b||'（空）'}`});}}
  const ap=Array.isArray(base.pages)?base.pages:[],bp=Array.isArray(next.pages)?next.pages:[];
  const sig=p=>[p?.type||'',p?.navTitle||'',p?.title||'',p?.section||''].join('\u241f');
  const queues=new Map(); ap.forEach((p,i)=>{const k=sig(p);if(!queues.has(k))queues.set(k,[]);queues.get(k).push(i)});
  const pairs=[]; const usedA=new Set(),usedB=new Set();
  bp.forEach((p,j)=>{const q=queues.get(sig(p));while(q?.length&&usedA.has(q[0]))q.shift();if(q?.length){const i=q.shift();usedA.add(i);usedB.add(j);pairs.push([i,j])}});
  const fieldKeys=['type','navTitle','title','section','kicker'];
  const unmatchedA=ap.map((_,i)=>i).filter(i=>!usedA.has(i)); const unmatchedB=bp.map((_,i)=>i).filter(i=>!usedB.has(i));
  for(const j of [...unmatchedB]){
    let best=null;
    for(const i of unmatchedA){if(usedA.has(i))continue;const a=ap[i],b=bp[j];if((a?.type||'article')!==(b?.type||'article'))continue;const same=fieldKeys.slice(1).filter(k=>String(a?.[k]??'')===String(b?.[k]??'')&&String(a?.[k]??'')!=='').length;const distance=Math.abs(i-j);const score=same*4-Math.min(distance,4);if(same>=2&&(!best||score>best.score))best={i,score};}
    if(best){usedA.add(best.i);usedB.add(j);pairs.push([best.i,j]);}
  }
  const pageFields=[['navTitle','导航标题'],['type','页面类型'],['section','栏目归属'],['kicker','页内眉题'],['title','主标题']];
  pairs.sort((x,y)=>x[1]-y[1]);
  for(const [i,j] of pairs){const a=ap[i],b=bp[j],fieldChanges=[];for(const [field,label] of pageFields)if(String(a?.[field]??'')!==String(b?.[field]??''))fieldChanges.push(label);if(fieldChanges.length){metrics.pages++;items.push({kind:'页面',title:`第 ${j+1} 页基础信息已修改`,detail:fieldChanges.join('、')});}if(JSON.stringify(a?.blocks||[])!==JSON.stringify(b?.blocks||[])){metrics.blocks++;items.push({kind:'内容',title:`第 ${j+1} 页内容块已修改`,detail:`${a?.blocks?.length||0} 个 → ${b?.blocks?.length||0} 个内容块`});}}
  for(let j=0;j<bp.length;j++)if(!usedB.has(j)){metrics.pages++;metrics.blocks+=(bp[j]?.blocks||[]).length?1:0;items.push({kind:'页面',title:`新增第 ${j+1} 页`,detail:bp[j]?.navTitle||bp[j]?.title||bp[j]?.type||'新页面'});}
  for(let i=0;i<ap.length;i++)if(!usedA.has(i)){metrics.pages++;metrics.blocks+=(ap[i]?.blocks||[]).length?1:0;items.push({kind:'页面',title:`删除原第 ${i+1} 页`,detail:ap[i]?.navTitle||ap[i]?.title||ap[i]?.type||'页面'});}
  const aa=base.articles||{},ba=next.articles||{},keys=new Set([...Object.keys(aa),...Object.keys(ba)]);for(const id of keys){if(JSON.stringify(aa[id]??null)!==JSON.stringify(ba[id]??null)){metrics.articles++;items.push({kind:'文章',title:`文章 ${id} 已变化`,detail:!aa[id]?'新增文章':!ba[id]?'删除文章':(ba[id]?.title||aa[id]?.title||'文章内容已修改')});}}
  return {items,metrics};
}
function openSaveDiff() {
  if(!requireIssue()||!commitPage())return; syncMeta(); if(!state.dirty)return toast('当前没有需要保存的修改'); const diff=summarizeIssueDiff(state.originalIssue,state.issue); const m=diff.metrics;
  $('#saveDiffSummary').innerHTML=[['元数据',m.meta],['页面',m.pages],['内容',m.blocks],['文章',m.articles]].map(([k,v])=>`<div class="save-diff-metric"><span>${k}</span><b>${v}</b></div>`).join('');
  const published=state.originalIssue?.status==='published'; const note=published?'<div class="save-diff-note">当前为已发布历史刊。本次保存只更新 V3 制作源稿并自动建立快照，不会直接覆盖线上 /1/、/2/ 稳定目录；重新发布前仍需通过发布前检查。</div>':'';
  $('#saveDiffList').innerHTML=note+(diff.items.length?diff.items.slice(0,80).map(x=>`<div class="save-diff-item"><span class="diff-kind">${escText(x.kind)}</span><div><b>${escText(x.title)}</b><span>${escText(x.detail||'')}</span></div></div>`).join(''):'<div class="save-diff-empty">没有检测到结构差异。</div>');
  $('#saveDiffDialog').showModal();
}
async function saveIssue({ silent=false }={}) {
  if(state.saving){toast('正在保存，请稍候');return false;}
  if (!state.issue || !commitPage()) return false; syncMeta();
  if(state.sourceConflict){if(!silent)toast('检测到其他窗口已保存新版本；当前本地稿仍保留，但保存已锁定。请重新打开本期并人工合并后再保存。',5200);return false;}
  const identityRepair = ensureIssueIdentity(state.issue);
  if (identityRepair.changed) { state.identityMigrationPending = true; syncJsonFromPage(); renderPages(); renderBlockList(); }
  const baselineFingerprint=String(state.sourceFingerprint||'');
  const id=state.issue.id,submitted=JSON.stringify(state.issue);
  state.saving=true;
  try {
    const res=await api(`/api/issues/${id}`,{method:'PUT',body:JSON.stringify({issue:JSON.parse(submitted),sourceFingerprint:baselineFingerprint,editorSessionId:PEER_SESSION_ID})});
    if(state.issue?.id!==id)return false;
    const editedMeanwhile=JSON.stringify(state.issue)!==submitted;
    state.originalIssue=cloneData(res.issue);state.sourceStatus=res.source||state.sourceStatus;
    state.sourceFingerprint=String(res.source?.fingerprint||baselineFingerprint);state.sourceObservedFingerprint=state.sourceFingerprint;state.sourceConflict=null;
    if(!editedMeanwhile){state.issue=res.issue;state.historyCurrent=cloneData(res.issue);state.redoStack=[];}
    state.dirty=editedMeanwhile;if(state.audit)state.auditStale=true;
    renderSourceStatus();updateStateBadges();
    broadcastPeer('saved',{issue:res.issue,snapshotId:res.snapshot?.id||''});
    if(editedMeanwhile){toast('上一版已保存；保存期间的新修改已保留，请再次保存。',4200);return false;}
    renderPages();renderPage();
    await Promise.allSettled([deleteDraft(),loadIssues(),loadSnapshots()]);
    if(!silent)toast('已保存到制作源');return true;
  }
  catch (e) { if(state.issue?.id!==id)return false;if(e.code==='SOURCE_DRIFT'){state.sourceConflict={at:Date.now(),baselineFingerprint,serverFingerprint:state.sourceObservedFingerprint||'',localIssue:cloneData(state.issue)};toast('服务器制作源已被其他窗口更新。当前本地稿已保留，连续点击保存不会覆盖新稿；请重新打开本期后人工合并。',5600);void refreshSourceStatus({quiet:true,adoptBaseline:false});renderSourceStatus();return false;} toast(e.message,2800); return false; }
  finally{state.saving=false;}
}
window.addEventListener('message',event=>{
  const data=event.data||{},frame=$('#builtPreviewFrame');
  if(!frame||event.source!==frame.contentWindow||data.source!=='v3-reader'||data.issueId!==state.issue?.id||data.type!=='edit-table')return;
  const page=resolveReaderPageIndex(data);if(page<0)return;if(page!==state.page&&!goToPage(page,{fromReader:true}))return;
  const blocks=currentPage()?.blocks||[],index=data.blockId?blocks.findIndex(block=>block.id===data.blockId):Number(data.blockIndex);
  if(!Number.isInteger(index)||blocks[index]?.type!=='table')return;
  focusBlock(index);
  const card=$('#blockList')?.querySelector(`[data-index="${index}"]`);if(card){card.open=true;card.querySelector('.table-cell-field')?.focus();}
});
function saveFromToolbar(){
  if(!requireIssue()||!commitPage())return;syncMeta();
  if(!state.dirty)return toast('当前内容已保存');
  if(state.originalIssue?.status==='published')return openSaveDiff();
  return saveIssue();
}
function downloadCurrentDraft(){
  if(!state.issue||!commitPage())return;syncMeta();
  const blob=new Blob([JSON.stringify(state.issue,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=`${state.issue.id}-未合并修改.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return true;
}

async function reloadLatestSource(){
  if(!state.issue||state.saving)return;
  if(!confirm('将先下载当前修改备份，再载入服务器最新稿件。之后可对照备份手动合并修改。继续吗？'))return;
  if(!downloadCurrentDraft())return;
  const id=state.issue.id,wasDirty=state.dirty;state.dirty=false;
  const loaded=await openIssue(id,{skipDraftRecovery:true});
  if(loaded)await deleteDraft();else {state.dirty=wasDirty;updateStateBadges();}
}

async function discardUnsaved(){ if(!state.dirty||!state.originalIssue)return; if(!confirm('放弃全部未保存修改，并恢复到最近一次正式保存状态？自动恢复草稿也会一并删除。'))return; const keepPage=state.page; state.issue=cloneData(state.originalIssue); state.page=Math.max(0,Math.min(keepPage,(state.issue.pages||[]).length-1)); state.dirty=false; state.audit=null; state.auditStale=false; state.selectedPages.clear(); $('#auditCard').classList.add('hidden'); resetHistory(); await deleteDraft(); renderIssue({preserveHistory:true}); updateStateBadges(); toast('已恢复到最近保存版本'); }
$('#saveBtn').onclick = saveFromToolbar;
$('#downloadConflictDraft')?.addEventListener('click',downloadCurrentDraft);
$('#reloadConflictIssue')?.addEventListener('click',reloadLatestSource);
$('#welcomeNewIssue')?.addEventListener('click',()=>$('#newIssue').click());
$('#guideImport')?.addEventListener('click',()=>openImportDialog('paste'));
$('#guideEdit')?.addEventListener('click',enterWorkspaceFromManager);
$('#guideCheck')?.addEventListener('click',()=>runAudit(true));
$('#guidePublish')?.addEventListener('click',openPublicationCenter);
$('#adminLogoutBtn')?.addEventListener('click',logoutAdmin);
$('#confirmSaveDiff').onclick = async e => { e.preventDefault(); const ok=await saveIssue(); if(ok)$('#saveDiffDialog').close(); };
$('#undoBtn').onclick = undoHistory;
$('#redoBtn').onclick = redoHistory;
$('#discardBtn').onclick = discardUnsaved;
$('#addPage').onclick = () => openPageTemplateDialog('add'); $('#insertPage')?.addEventListener('click',insertBlankPage); $('#insertPageHeader')?.addEventListener('click',insertBlankPage); $('#applyPageTemplate').onclick = () => openPageTemplateDialog('replace');
$('#duplicatePage').onclick = () => { if(!state.issue||!commitPage())return; if(state.issue.pages.length>=LIMITS.pages)return toast(`页面已达到上限 ${LIMITS.pages} 页`); const p=currentPage(); if(['cover','toc','closing'].includes(p?.type))return toast('封面、目录和尾页属于结构页，不允许直接复制；请使用模板新增。',2800); const copy=cloneData(p); const suffix='（副本）',baseTitle=String(p.navTitle||p.title||`第 ${state.page+1} 页`); copy.navTitle=`${baseTitle.slice(0,Math.max(0,120-suffix.length))}${suffix}`; state.issue.pages.splice(state.page+1,0,copy); state.page++; state.pageSearch=''; $('#pageSearch').value=''; markDirty({historyGroup:'page-duplicate',forceHistory:true}); renderPages(); renderPage(); requestAnimationFrame(()=>{const ed=$('#pageEditor');if(ed)ed.scrollTop=0;}); toast('页面副本已创建'); };
// The legacy page-delete button no longer exists in the streamlined center.
// Keep this guard for older embedded shells; current workspace controls bind
// their own delete actions below.
$('#deletePage')?.addEventListener('click', () => { const p=currentPage(); deletePageIndices([state.page],{historyGroup:'page-delete',confirmMessage:`删除第 ${state.page+1} 页“${p?.navTitle||p?.title||''}”？`}); });
$('#sidebarToggle')?.addEventListener('click',()=>setSidebarCollapsed(!state.sidebarCollapsed));
$('#pagesPanelToggle')?.addEventListener('click',()=>setPagesPanelCollapsed(!state.pagesPanelCollapsed));
$('#blockCanvasToggle')?.addEventListener('click',()=>setBlockCanvasCollapsed(!state.blockCanvasCollapsed));
$('#quickFormatToggle')?.addEventListener('click',()=>setQuickFormatCollapsed(!state.quickFormatCollapsed));
$('#canvasModeBtn')?.addEventListener('click',()=>{if(!requireIssue('请先选择一期期刊'))return;setCanvasMode(!state.canvasMode);});
$('#selectAllBlocksBtn')?.addEventListener('click',()=>{if(!requireIssue('请先选择一期期刊'))return;selectAllTopLevelBlocks();});
$('#clearBlockSelectionBtn')?.addEventListener('click',()=>clearSelectedBlocks());
function ensureWorkflowControls(){
  const toolbar=$('#immersiveWorkspaceToolbar');
  if(toolbar&&!$('#workspaceQuickActions')){
    const sync=toolbar.querySelector('.workspace-sync-state'),peer=$('#workspacePeerState');
    if(sync&&!$('#workspaceMediaStatus')){const status=document.createElement('span');status.id='workspaceMediaStatus';status.textContent='资源未读取';status.title='打开“资源 / TTS”后读取当前期刊资源';sync.insertBefore(status,peer||null);}
    const actions=document.createElement('div');actions.id='workspaceQuickActions';actions.className='workspace-quick-actions';actions.setAttribute('aria-label','工作区快捷流程');actions.innerHTML='<button type="button" id="workspaceAuditOpen" title="查看硬性检查项与提示检查项">工作台检查</button><button type="button" id="workspaceMediaBtn" title="查看媒体、音频和朗读资源">资源 / TTS</button><button type="button" id="workspacePublishBtn" class="primary" title="补齐 TTS、建立基线并运行发布门禁">发布向导</button>';
    toolbar.insertBefore(actions,toolbar.querySelector('.workspace-toolbar-actions')||null);
  }
  const hero=document.querySelector('.publication-hero-actions'),preflight=$('#publicationPreflightBtn');
  if(hero&&preflight&&!$('#publicationPrepareBtn')){const button=document.createElement('button');button.type='button';button.id='publicationPrepareBtn';button.className='primary';button.title='自动补齐缺失或过期的 TTS，更新基线，再执行硬性门禁与提示审计';button.textContent='一键准备发布';hero.insertBefore(button,preflight);preflight.classList.remove('primary');}
  renderWorkspaceMediaStatus();
}
ensureWorkflowControls();
$('#issueInfoBtn')?.addEventListener('click',()=>{if(!state.issue)return toast('请先选择一期期刊');syncMeta();updateMetaSummary();renderSourceStatus();$('#issueInfoDialog')?.showModal();void refreshSourceStatus({quiet:true});});
$('#metaToggle')?.addEventListener('click',()=>setMetaExpanded(!state.metaExpanded));
$('#pageMetaToggle')?.addEventListener('click',()=>setPageMetaExpanded(!state.pageMetaExpanded));
function openWorkspaceAuditDialog(){if(!requireIssue('请先选择可编辑期刊'))return;const dialog=$('#workspaceAuditDialog');if(!dialog)return;renderWorkspaceAudit();if(!dialog.open)dialog.showModal();}
function closeWorkspaceAuditDialog(){const dialog=$('#workspaceAuditDialog');if(dialog?.open)dialog.close('cancel');}
$('#workspaceAuditOpen')?.addEventListener('click',openWorkspaceAuditDialog);
$('#workspaceAuditClose')?.addEventListener('click',closeWorkspaceAuditDialog);
$('#workspaceAuditDialog')?.addEventListener('click',e=>{if(e.target===e.currentTarget)closeWorkspaceAuditDialog();});
$('#contextInspectorToggle')?.addEventListener('click',()=>setContextInspectorOpen(!state.contextInspectorOpen));
$('#contextInspectorClose')?.addEventListener('click',()=>setContextInspectorOpen(false));
$('#contextInspectorAdvanced')?.addEventListener('click',()=>{if(validSelectedBlockIndices().length)return quickAdvancedDesign();openDesignDialog('page');});
for(const id of ['metaLabel','metaSubtitle','metaStatus','metaPublisher','metaTurnAnimation']){
  const field=$('#'+id);if(!field)continue;
  field.addEventListener(['metaStatus','metaTurnAnimation'].includes(id)?'change':'input',()=>{syncMeta();updateMetaSummary();if(id==='metaTurnAnimation')updateWorkspaceToolbar();markInlineInputDirty(field,{group:'issue-meta',preview:id==='metaTurnAnimation'});});
  field.addEventListener('change',()=>finalizeInlineInput(field,{preview:id==='metaTurnAnimation'}));
}
$('#managerWorkspaceEnter')?.addEventListener('click',enterWorkspaceFromManager);
$('#workspaceBackBtn')?.addEventListener('click',leaveWorkspaceToManager);
$('#workspaceMediaBtn')?.addEventListener('click',()=>openMediaDialog(null));
$('#workspacePublishBtn')?.addEventListener('click',openPublicationCenter);
$('#workspacePrevPage')?.addEventListener('click',()=>navigateWorkspacePage(-1));
$('#workspaceNextPage')?.addEventListener('click',()=>navigateWorkspacePage(1));
$('#workspacePagePicker')?.addEventListener('click',openWorkspacePageDialog);
$('#workspacePageSearch')?.addEventListener('input',e=>renderWorkspacePageList(e.target.value));
$('#workspaceSelectPagesBtn')?.addEventListener('click',openWorkspacePageDialog);
$('#workspaceInsertPageBtn')?.addEventListener('click',insertBlankPage);
$('#workspaceInsertPageDialog')?.addEventListener('click',()=>{const dialog=$('#workspacePageDialog');if(dialog?.open)dialog.close('insert');insertBlankPage();});
$('#workspaceSelectFilteredPages')?.addEventListener('click',()=>{const q=$('#workspacePageSearch')?.value||'',shown=workspaceFilteredPageIndices(q);if(!shown.length)return toast('没有匹配页面');const all=shown.every(i=>state.selectedPages.has(i));for(const i of shown)all?state.selectedPages.delete(i):state.selectedPages.add(i);renderWorkspacePageList(q);});
$('#workspaceDeleteSelectedPages')?.addEventListener('click',()=>deletePageIndices([...state.selectedPages],{historyGroup:'workspace-batch-delete',confirmMessage:'确定删除所选页面？封面/尾页会自动跳过。'}));
$('#workspaceDeletePageBtn')?.addEventListener('click',()=>{const p=currentPage();deletePageIndices([state.page],{historyGroup:'workspace-page-delete',confirmMessage:`删除第 ${state.page+1} 页“${p?.navTitle||p?.title||''}”？`});});
$('#workspacePageList')?.addEventListener('change',e=>{const c=e.target.closest('[data-workspace-page-select]');if(!c)return;const i=Number(c.dataset.workspacePageSelect);if(c.checked)state.selectedPages.add(i);else state.selectedPages.delete(i);renderWorkspacePageList($('#workspacePageSearch')?.value||'');});
$('#workspacePageList')?.addEventListener('click',e=>{if(e.target.closest('[data-workspace-page-select]'))return;const b=e.target.closest('[data-workspace-page]');if(!b)return;const dialog=$('#workspacePageDialog');if(dialog?.open)dialog.close('select');goToPage(Number(b.dataset.workspacePage));});
$('#workspaceUndoBtn')?.addEventListener('click',undoHistory);
$('#workspaceRedoBtn')?.addEventListener('click',redoHistory);
$('#workspaceSaveBtn')?.addEventListener('click',saveFromToolbar);
$('#workspaceViewSelect')?.addEventListener('change',e=>setWorkspaceLayoutPreset(e.target.value));
document.querySelectorAll('#workspaceLayoutToolbar [data-layout]').forEach(button=>button.addEventListener('click',()=>setWorkspaceLayoutPreset(button.dataset.layout)));
document.querySelectorAll('[data-manager-action]').forEach(button=>button.addEventListener('click',()=>{
  const action=button.dataset.managerAction;
  if(action==='insert')return insertBlankPage();
  if(action==='duplicate')return $('#duplicatePage')?.click();
  if(action==='template')return $('#applyPageTemplate')?.click();
  if(action==='health')return $('#managerLayoutRecommendationOpen')?.click();
  if(action==='delete'){const p=currentPage();return deletePageIndices([state.page],{historyGroup:'manager-page-delete',confirmMessage:`删除第 ${state.page+1} 页“${p?.navTitle||p?.title||''}”？`});}
}));

async function loadSnapshots(issueId=state.issue?.id) { if (!issueId) return; const rows = await api(`/api/issues/${issueId}/snapshots`); if(state.issue?.id!==issueId)return; const box = $('#snapshotList'); box.innerHTML = ''; if (!rows.length) { box.textContent = '暂无快照'; return; } rows.slice(0,12).forEach(x => { const d = document.createElement('div'); d.className = 'snapshot'; d.innerHTML = `<b>${escText(x.label || x.id)}</b><span>${fmtTime(x.createdAt)} · ${escText(x.sourceStatus || '')}</span><button>回滚到此版本</button>`; d.querySelector('button').onclick = async () => { if (state.dirty) return toast('请先保存或放弃当前修改，再执行回滚'); if (!confirm(`确定回滚到 ${x.id}？系统会先保存当前版本。`)) return; await api(`/api/issues/${state.issue.id}/rollback`, { method:'POST', body:JSON.stringify({snapshot:x.id}) }); toast('回滚完成'); await openIssue(state.issue.id); }; box.appendChild(d); }); }
$('#snapshotBtn').onclick = async () => { if (!state.issue) return; if (state.dirty && !await saveIssue({silent:true})) return; const label = prompt('快照备注','manual') || 'manual'; await api(`/api/issues/${state.issue.id}/snapshot`, { method:'POST', body:JSON.stringify({label}) }); toast('快照已创建'); await loadSnapshots(); };
function showOutput(title,text) { $('#outputTitle').textContent = title; $('#outputText').textContent = text; $('#outputCard').classList.remove('hidden'); $('#outputCard').scrollIntoView({behavior:'smooth',block:'nearest'}); }
$('#closeOutput').onclick = () => $('#outputCard').classList.add('hidden');

const auditLabels = { blocker:'硬性阻断', warning:'提示项', note:'提示项' };
function flattenFindings(audit) { return [...(audit.blockers || []).map(x=>({...x,severity:'blocker'})), ...(audit.warnings || []).map(x=>({...x,severity:'warning'})), ...(audit.notes || []).map(x=>({...x,severity:'note'}))]; }
function locationText(loc={}) { if (loc.kind === 'metadata') return `元数据 · ${loc.field || '字段'}`; if (loc.kind === 'page') return `第 ${loc.page || '?'} 页${Number.isInteger(loc.blockIndex)?` · 内容块 ${loc.blockIndex+1}`:''}${loc.field?` · ${loc.field}`:''}`; if (loc.kind === 'asset') return `${loc.page?`第 ${loc.page} 页 · `:''}资源 · ${loc.path || ''}`; return loc.path || ''; }
function focusBlock(index) {
  const canvasOwnsFocus=document.activeElement===$('#builtPreviewFrame');
  if(!canvasOwnsFocus){setEditorMode('visual');renderBlockList();}
  requestAnimationFrame(()=>{
    const el=$(`#blockList .block-card[data-index="${index}"]`);if(!el)return;
    el.open=true;el.classList.add('block-flash');
    if(!canvasOwnsFocus){el.scrollIntoView({behavior:'smooth',block:'center'});el.querySelector('input,textarea,select')?.focus({preventScroll:true});}
    setTimeout(()=>el.classList.remove('block-flash'),1700);
  });
}
function blockContainsAsset(block, path) {
  if (!block || !path) return false;
  for (const field of ['src','poster']) {
    const value = String(block?.[field] || '');
    if (value && (value === path || value.endsWith(path) || path.endsWith(value))) return true;
  }
  if (block.type === 'container') {
    return (block.columns || []).some(col => (col?.blocks || []).some(child => blockContainsAsset(child, path)));
  }
  return false;
}
function locateFinding(f) {
  const loc = f.location || {};
  if (loc.kind === 'metadata') { setMetaExpanded(true,{remember:false}); const dialog=$('#issueInfoDialog'); if(dialog&&!dialog.open)dialog.showModal(); const map = { label:'metaLabel',subtitle:'metaSubtitle',status:'metaStatus',publisher:'metaPublisher' }; const id = map[loc.field]; if (id) { requestAnimationFrame(()=>$('#'+id)?.focus()); } else { toast(`请检查元数据：${loc.field || '字段'}`); } return; }
  if (loc.page) { const infoDialog=$('#issueInfoDialog'); if(infoDialog?.open)infoDialog.close(); if (!commitPage()) return; state.pageSearch=''; $('#pageSearch').value=''; state.page = Math.max(0,Math.min(state.issue.pages.length-1,Number(loc.page)-1)); renderPages(); renderPage(); $('#pageEditor').scrollIntoView({behavior:'smooth',block:'start'}); const pageMap = { title:'pageTitle',navTitle:'pageNav',section:'pageSection',kicker:'pageKicker',type:'pageType' }; if (Number.isInteger(loc.blockIndex)) return focusBlock(loc.blockIndex); if (loc.kind === 'asset' && loc.path) { const i = (currentPage().blocks || []).findIndex(b => blockContainsAsset(b, loc.path)); if (i >= 0) return focusBlock(i); } const id = pageMap[loc.field]; if (id) { setPageMetaExpanded(true,{remember:false}); requestAnimationFrame(()=>$('#'+id)?.focus()); } else if (loc.field === 'blocks') requestAnimationFrame(()=>$('#blockList')?.scrollIntoView({behavior:'smooth',block:'center'})); return; }
  toast('该问题暂无可定位字段');
}
function renderAuditFindings() { const box = $('#auditFindings'); box.innerHTML = ''; if (!state.audit) return; const all = flattenFindings(state.audit); const rows = state.auditFilter === 'all' ? all : all.filter(x=>x.severity===state.auditFilter); if (!rows.length) { box.innerHTML = '<div class="audit-empty">当前筛选下没有问题。</div>'; return; } for (const f of rows) { const d = document.createElement('div'); d.className = `finding ${f.severity}`; const loc = locationText(f.location); d.innerHTML = `<span class="finding-dot"></span><div class="finding-main"><div class="finding-title"><b>${escText(f.title || auditLabels[f.severity] || '审计发现')}</b><span class="finding-severity">${escText(auditLabels[f.severity]||'检查项')}</span><span class="finding-code">${escText(f.code || 'CHECK')}</span></div><p>${escText(f.message || '')}</p>${f.fix?`<p class="finding-fix">建议：${escText(f.fix)}</p>`:''}${loc?`<div class="finding-loc">位置：${escText(loc)}</div>`:''}</div><div class="finding-actions"></div>`; const actions = d.querySelector('.finding-actions'); if (f.location) { const b = document.createElement('button'); b.textContent = '定位'; b.onclick = () => locateFinding(f); actions.appendChild(b); } if (f.location?.path) { const b = document.createElement('button'); b.textContent = '复制路径'; b.onclick = async () => { try { await navigator.clipboard.writeText(f.location.path); toast('路径已复制'); } catch { toast(f.location.path,3000); } }; actions.appendChild(b); } box.appendChild(d); } }
function renderWorkspaceAudit(){const panel=$('#workspaceAuditPanel');if(!panel)return;const hard=state.audit?.blockers||[],tips=[...(state.audit?.warnings||[]),...(state.audit?.notes||[])],st=$('#workspaceAuditState'),summary=$('#workspaceAuditSummary');if(!state.audit){st.textContent='尚未检查';st.className='workspace-audit-state';summary.textContent='硬性门禁会阻断发布；提示项只提供修复建议，不阻断继续制作。';$('#workspaceAuditHardCount').textContent='0';$('#workspaceAuditTipCount').textContent='0';$('#workspaceAuditHard').innerHTML='<div class="workspace-audit-empty">尚未运行检查。</div>';$('#workspaceAuditTips').innerHTML='<div class="workspace-audit-empty">尚未运行检查。</div>';return;}const stale=state.auditStale||state.dirty;st.textContent=stale?'审计已过期':state.audit.readiness==='ready'?'硬性检查通过':state.audit.readiness==='blocked'?'存在硬性阻断':'有提示项';st.className=`workspace-audit-state ${stale?'warning':state.audit.readiness||'warning'}`;summary.textContent=stale?'内容已修改，请重新检查；旧结果不参与发布判断。':`硬性 ${hard.length} 项 · 提示 ${tips.length} 项 · ${state.audit.strictMode?'严格检查':'日常检查'}；提示项不阻断继续制作。`;$('#workspaceAuditHardCount').textContent=String(hard.length);$('#workspaceAuditTipCount').textContent=String(tips.length);const render=(rows,empty,label)=>rows.length?rows.slice(0,4).map((f,i)=>`<div class="workspace-audit-row"><strong title="${escText(f.message||f.title||'')}">${escText(f.title||f.code||label)}</strong><small>${escText(f.code||label)}</small>${f.location?`<button type="button" data-workspace-audit-locate="${escText(String(f.__index??i))}" data-workspace-audit-severity="${f.severity||''}">定位</button>`:''}</div>`).join('')+(rows.length>4?`<div class="workspace-audit-empty">还有 ${rows.length-4} 项，请打开“检查”查看全部。</div>`:''):empty;const hardIndexed=hard.map((f,i)=>({...f,__index:i})),tipIndexed=tips.map((f,i)=>({...f,__index:i}));$('#workspaceAuditHard').innerHTML=render(hardIndexed,'<div class="workspace-audit-empty">✓ 没有硬性阻断项。</div>','硬性检查');$('#workspaceAuditTips').innerHTML=render(tipIndexed,'<div class="workspace-audit-empty">✓ 没有提示项。</div>','提示项');}
function workspaceAuditFindingFromButton(button){const severity=button.dataset.workspaceAuditSeverity,index=Number(button.dataset.workspaceAuditLocate);if(!state.audit||!Number.isInteger(index))return null;const rows=severity==='blocker'?(state.audit.blockers||[]):[...(state.audit.warnings||[]),...(state.audit.notes||[])];return rows[index]||null;}
function renderAudit(audit,meta={}) { state.audit = audit; state.auditStale = false; const card = $('#auditCard'); card.classList.add('hidden'); const hero = $('#auditHero'); hero.className = `audit-hero ${audit.readiness || 'warning'}`; const label = audit.readiness === 'ready' ? '可以进入发布流程' : audit.readiness === 'blocked' ? '存在发布阻断项' : '可以继续制作，但有待处理项'; $('#auditState').textContent = label; $('#auditMessage').textContent = audit.readiness === 'ready' ? '当前审计未发现硬性阻断项。提示项不会阻断继续制作。正式发布仍应执行完整 release:check。' : `硬性阻断 ${audit.blockers?.length || 0} 项，提示 ${Number(audit.warnings?.length||0)+Number(audit.notes?.length||0)} 项。点击“定位”可直接回到具体字段或内容块。`; $('#auditScore').textContent = String(audit.score ?? '--'); const metrics = [['页面',audit.pageCount??'-'],['硬性阻断',audit.blockers?.length||0],['提示项',(audit.warnings?.length||0)+(audit.notes?.length||0)],['TTS',audit.narration?`${audit.narration.found}/${audit.narration.expected}`:'-'],['媒体',audit.media?`${audit.media.found}/${audit.media.referenced}`:'-']]; $('#auditMetrics').innerHTML = metrics.map(([k,v])=>`<div class="audit-metric"><span>${escText(k)}</span><b>${escText(v)}</b></div>`).join(''); $('#auditGenerated').textContent = meta.generatedAt ? `生成：${fmtTime(meta.generatedAt)}${meta.strict?' · 严格模式':''}` : ''; $('#auditReportLink').href = meta.htmlUrl ? appUrl(meta.htmlUrl) : '#'; $('#auditReportLink').classList.toggle('hidden',!meta.htmlUrl); renderAuditFindings(); renderWorkspaceAudit(); updateStateBadges(); updateAuditEntry(); }
async function runAudit(strict=false) { if (!requireIssue()) return; if (state.dirty) { toast('审计前正在保存当前修改…'); if (!await saveIssue({silent:true})) return; } try { const start = await api(`/api/issues/${state.issue.id}/audit`, { method:'POST', body:JSON.stringify({strict,async:true}), allowError:true }); const r=await waitForBackgroundJob(start,strict?'严格审计':'日常审计'); if (!r.audit) { showOutput('审计失败',r.output || r.error || '无法读取审计报告'); return; } renderAudit(r.audit,{generatedAt:r.generatedAt,strict:r.strict,htmlUrl:r.htmlUrl}); toast(strict?'发布前检查完成':'日常审计完成'); } catch (e) { showOutput('审计失败',e.message); } }
$('#auditBtn').onclick = () => openWorkspaceAuditDialog(); $('#strictAuditBtn')?.addEventListener('click',() => runAudit(true)); $('#auditAgain').onclick = () => runAudit(Boolean(state.audit?.strictMode)); $('#closeAudit').onclick = () => $('#auditCard').classList.add('hidden');

const REVIEW_STATUS_LABELS={open:'待处理',reviewed:'已复核',hold:'暂缓'};
function reviewAuditKey(f){const loc=f?.location||{};return JSON.stringify([f?.severity||'',f?.code||'',loc.kind||'',Number(loc.page||0),loc.field||'',loc.path||'',f?.message||'']);}
function defaultReviewWorkspace(){return {version:1,issueId:state.issue?.id||'',items:[],updatedAt:null};}
async function loadReviewWorkspace(force=false){if(!state.issue)return defaultReviewWorkspace();if(!force&&state.reviewWorkspace&&state.reviewWorkspaceLoadedFor===state.issue.id)return state.reviewWorkspace;try{state.reviewWorkspace=await api(`/api/issues/${encodeURIComponent(state.issue.id)}/review-workspace`);}catch{state.reviewWorkspace=defaultReviewWorkspace();}state.reviewWorkspaceLoadedFor=state.issue.id;state.reviewWorkspaceDirty=false;return state.reviewWorkspace;}
function markReviewWorkspaceDirty(){state.reviewWorkspaceDirty=true;const el=$('#reviewWorkspaceState');if(el){el.textContent='校审单有未保存修改';el.classList.add('dirty')}renderReviewWorkspace();}
function auditFindingRows(){return state.audit?flattenFindings(state.audit):[];}
function reviewCurrentAuditKeys(){return new Set(auditFindingRows().map(reviewAuditKey));}
function reviewWorkspaceAnalysis(){const items=state.reviewWorkspace?.items||[],keys=reviewCurrentAuditKeys();return {total:items.length,open:items.filter(x=>x.status==='open').length,reviewed:items.filter(x=>x.status==='reviewed').length,hold:items.filter(x=>x.status==='hold').length,important:items.filter(x=>x.severity==='important'&&x.status!=='reviewed').length,audit:auditFindingRows().length,auditKeys:keys};}
function reviewItemVisible(item){const f=state.reviewWorkspaceFilter||'all';if(f==='open')return item.status==='open';if(f==='important')return item.severity==='important'&&item.status!=='reviewed';if(f==='reviewed')return item.status==='reviewed';return true;}
function addManualReviewItem(prefill={}){state.reviewWorkspace||=defaultReviewWorkspace();if((state.reviewWorkspace.items||[]).length>=200)return toast('内部校审最多 200 项');const now=new Date().toISOString(),page=Number(prefill.page||state.page+1);state.reviewWorkspace.items.push({id:`review-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`,title:String(prefill.title||'请填写校审问题').slice(0,120),category:String(prefill.category||'人工校审').slice(0,60),severity:prefill.severity==='important'?'important':'normal',status:'open',page:Number.isInteger(page)&&page>=1&&page<=200?page:null,note:String(prefill.note||'').slice(0,1200),source:prefill.source==='audit'?'audit':'manual',auditKey:String(prefill.auditKey||'').slice(0,500),auditCode:String(prefill.auditCode||'').slice(0,80),createdAt:now,updatedAt:now});markReviewWorkspaceDirty();}
function importAuditReviewFinding(index){const f=auditFindingRows()[Number(index)];if(!f)return;const key=reviewAuditKey(f);if((state.reviewWorkspace?.items||[]).some(x=>x.auditKey===key))return toast('该自动问题已纳入校审清单');const loc=f.location||{};addManualReviewItem({title:f.title||f.code||'自动审计问题',category:f.category||'自动审计',severity:f.severity==='blocker'?'important':'normal',page:Number(loc.page)||null,note:[f.message,f.fix?`建议：${f.fix}`:''].filter(Boolean).join('\n'),source:'audit',auditKey:key,auditCode:f.code||''});}
function locateReviewItem(id){const item=(state.reviewWorkspace?.items||[]).find(x=>x.id===id);if(!item?.page)return toast('该校审项未绑定具体页码');$('#reviewWorkspaceDialog').close();if(!commitPage())return;state.pageSearch='';$('#pageSearch').value='';state.page=Math.max(0,Math.min((state.issue.pages||[]).length-1,Number(item.page)-1));renderPages();renderPage();$('#pageEditor')?.scrollIntoView({behavior:'smooth',block:'start'});toast(`已定位第 ${item.page} 页`);}
function renderReviewWorkspace(){const dialog=$('#reviewWorkspaceDialog');if(!dialog||!state.reviewWorkspace)return;const a=reviewWorkspaceAnalysis(),metrics=$('#reviewWorkspaceMetrics');metrics.innerHTML=[['待处理',a.open],['重要未结',a.important],['已复核',a.reviewed],['自动发现',a.audit]].map(([k,v])=>`<span><small>${k}</small><b>${v}</b></span>`).join('');$('#reviewWorkspaceSummary').textContent=`人工校审 ${a.total} 项 · 暂缓 ${a.hold} 项；自动审计 ${state.audit?'已载入':'未运行'}。内部校审状态不参与正式发布门禁。`;$('#reviewWorkspaceCount').textContent=`${a.total} / 200`;$('#reviewAuditState').textContent=state.audit?`${state.audit.readiness||'warning'} · ${a.audit} 项${state.auditStale?' · 已过期':''}`:'尚未审计';for(const b of $('#reviewWorkspaceFilters')?.querySelectorAll('[data-review-filter]')||[])b.classList.toggle('active',b.dataset.reviewFilter===(state.reviewWorkspaceFilter||'all'));
  const auditBox=$('#reviewAuditFindings'),findings=auditFindingRows(),manualKeys=new Set((state.reviewWorkspace.items||[]).map(x=>x.auditKey).filter(Boolean));if(!findings.length)auditBox.innerHTML='<div class="review-empty">尚无自动审计结果。点击“刷新自动审计”获取当前 findings。</div>';else auditBox.innerHTML=findings.slice(0,60).map((f,i)=>{const imported=manualKeys.has(reviewAuditKey(f));const loc=locationText(f.location);return `<article class="review-audit-row ${f.severity==='blocker'?'is-blocker':''} ${imported?'is-imported':''}"><div><b>${escText(f.title||f.code||'审计发现')}</b><small>${escText(f.code||'CHECK')} · ${escText(loc||f.category||'未定位')} · ${escText(f.message||'')}</small></div><button type="button" data-review-import-audit="${i}" ${imported?'disabled':''}>${imported?'已纳入':'纳入校审'}</button></article>`}).join('');
  const list=$('#reviewWorkspaceList'),rows=(state.reviewWorkspace.items||[]).filter(reviewItemVisible);if(!rows.length)list.innerHTML='<div class="review-empty">当前筛选下没有人工校审项。</div>';else list.innerHTML=rows.map(item=>{const disappeared=item.source==='audit'&&state.audit&&!a.auditKeys.has(item.auditKey);return `<article class="review-item ${item.severity==='important'?'is-important':''} ${item.status==='reviewed'?'is-reviewed':''}" data-review-id="${escText(item.id)}"><div class="review-item-main"><input data-review-key="title" maxlength="120" value="${escText(item.title)}"><small>${escText(item.category)} · ${item.source==='audit'?`自动审计 ${escText(item.auditCode||'')}`:'人工添加'}${disappeared?' · <span class="review-disappeared">自动问题已消失</span>':''}</small></div><select data-review-key="severity"><option value="normal"${item.severity==='normal'?' selected':''}>普通</option><option value="important"${item.severity==='important'?' selected':''}>重要</option></select><select data-review-key="status"><option value="open"${item.status==='open'?' selected':''}>待处理</option><option value="reviewed"${item.status==='reviewed'?' selected':''}>已复核</option><option value="hold"${item.status==='hold'?' selected':''}>暂缓</option></select><input data-review-key="page" type="number" min="1" max="200" value="${item.page??''}" placeholder="页码"><textarea data-review-key="note" maxlength="1200" placeholder="复核说明 / 修改建议">${escText(item.note||'')}</textarea><div class="review-item-actions"><button type="button" data-review-locate="${escText(item.id)}" ${item.page?'':'disabled'}>定位</button><button type="button" class="danger-lite" data-review-delete="${escText(item.id)}">删除</button></div></article>`}).join('');const stateEl=$('#reviewWorkspaceState');stateEl.textContent=state.reviewWorkspaceDirty?'校审单有未保存修改':state.reviewWorkspace.updatedAt?`已保存 ${fmtTime(state.reviewWorkspace.updatedAt)}`:'校审单未修改';stateEl.classList.toggle('dirty',state.reviewWorkspaceDirty);}
async function saveReviewWorkspace(){if(!state.issue||!state.reviewWorkspace)return false;try{const saved=await api(`/api/issues/${encodeURIComponent(state.issue.id)}/review-workspace`,{method:'PUT',body:JSON.stringify(state.reviewWorkspace)});state.reviewWorkspace=saved;state.reviewWorkspaceDirty=false;renderReviewWorkspace();toast('内部校审单已保存');return true}catch(e){toast(`保存校审单失败：${e.message}`,3600);return false}}
async function runReviewAudit(){if(!state.issue)return;if(state.dirty){toast('校审前正在保存当前修改…');if(!await saveIssue({silent:true}))return;}try{const start=await api(`/api/issues/${state.issue.id}/audit`,{method:'POST',body:JSON.stringify({strict:false,async:true}),allowError:true}),r=await waitForBackgroundJob(start,'自动审计');if(!r.audit)throw new Error(r.output||r.error||'审计失败');state.audit=r.audit;state.auditStale=false;updateStateBadges();renderReviewWorkspace();toast('自动审计已刷新');}catch(e){toast(`自动审计失败：${e.message}`,3600)}}
async function openReviewWorkspace(){if(!state.issue)return toast('请先选择期刊');await loadReviewWorkspace();renderReviewWorkspace();$('#reviewWorkspaceDialog').showModal();}

$('#auditFilters').addEventListener('click',e => { const b = e.target.closest('[data-filter]'); if (!b) return; state.auditFilter = b.dataset.filter; [...$('#auditFilters').querySelectorAll('button')].forEach(x=>x.classList.toggle('active',x===b)); renderAuditFindings(); });
$('#workspaceAuditRun')?.addEventListener('click',()=>runAudit(false));$('#workspaceAuditStrict')?.addEventListener('click',()=>runAudit(true));$('#workspaceAuditPanel')?.addEventListener('click',e=>{const b=e.target.closest('[data-workspace-audit-locate]');if(b){const f=workspaceAuditFindingFromButton(b);if(f)locateFinding(f);}});

$('#reviewWorkspaceBtn')?.addEventListener('click',openReviewWorkspace);$('#reviewWorkspaceFromAudit').onclick=openReviewWorkspace;$('#reviewRunAudit').onclick=runReviewAudit;$('#reviewAddManual').onclick=()=>addManualReviewItem();$('#reviewSaveWorkspace').onclick=saveReviewWorkspace;$('#reviewWorkspaceFilters').addEventListener('click',e=>{const b=e.target.closest('[data-review-filter]');if(!b)return;state.reviewWorkspaceFilter=b.dataset.reviewFilter;renderReviewWorkspace();});$('#reviewAuditFindings').addEventListener('click',e=>{const b=e.target.closest('[data-review-import-audit]');if(b)importAuditReviewFinding(b.dataset.reviewImportAudit);});$('#reviewWorkspaceList').addEventListener('input',e=>{const el=e.target.closest('[data-review-key]'),row=e.target.closest('[data-review-id]');if(!el||!row)return;const item=(state.reviewWorkspace?.items||[]).find(x=>x.id===row.dataset.reviewId);if(!item)return;let value=el.value;if(el.dataset.reviewKey==='page')value=value===''?null:Math.max(1,Math.min(200,Number(value||1)));item[el.dataset.reviewKey]=value;item.updatedAt=new Date().toISOString();state.reviewWorkspaceDirty=true;const stateEl=$('#reviewWorkspaceState');if(stateEl){stateEl.textContent='校审单有未保存修改';stateEl.classList.add('dirty')}});$('#reviewWorkspaceList').addEventListener('change',e=>{if(e.target.closest('[data-review-key]'))renderReviewWorkspace();});$('#reviewWorkspaceList').addEventListener('click',e=>{const locate=e.target.closest('[data-review-locate]');if(locate)return locateReviewItem(locate.dataset.reviewLocate);const del=e.target.closest('[data-review-delete]');if(del){const i=(state.reviewWorkspace?.items||[]).findIndex(x=>x.id===del.dataset.reviewDelete);if(i>=0){state.reviewWorkspace.items.splice(i,1);markReviewWorkspaceDirty();}}});$('#reviewClearWorkspace').onclick=()=>{if(!state.reviewWorkspace?.items?.length)return;if(!confirm('清空当前内部校审单？自动审计报告不会被删除。'))return;state.reviewWorkspace.items=[];markReviewWorkspaceDirty();};


function defaultReviewHandoffs(){return {version:1,issueId:state.issue?.id||'',handoffs:[],updatedAt:null};}
async function loadReviewHandoffs(force=false){if(!state.issue)return defaultReviewHandoffs();if(!force&&state.reviewHandoffs&&state.reviewHandoffsLoadedFor===state.issue.id)return state.reviewHandoffs;try{state.reviewHandoffs=await api(`/api/issues/${encodeURIComponent(state.issue.id)}/review-handoffs`);}catch{state.reviewHandoffs=defaultReviewHandoffs();}state.reviewHandoffsLoadedFor=state.issue.id;state.reviewHandoffsDirty=false;return state.reviewHandoffs;}
function markReviewHandoffsDirty(){state.reviewHandoffsDirty=true;const el=$('#reviewHandoffState');if(el){el.textContent='交接记录有未保存修改';el.classList.add('dirty')}renderReviewHandoffs();}
function reviewHandoffRoleLabel(role){return ({editor:'责任编辑',reviewer:'复核编辑',approver:'内部签收人',other:'其他'})[role]||role;}
function reviewHandoffStatusLabel(status){return ({draft:'草稿',handed_off:'已交接',accepted:'已签收',returned:'已退回'})[status]||status;}
function reviewHandoffRequiredSnapshot(){return (state.reviewWorkspace?.items||[]).filter(x=>x.status!=='reviewed').map(x=>({id:x.id,title:x.title,page:x.page??null,severity:x.severity==='important'?'important':'normal'}));}
function reviewHandoffRequiredState(req){const live=(state.reviewWorkspace?.items||[]).find(x=>x.id===req.id);if(!live)return {state:'missing',label:'原问题已删除',live:null};if(live.status==='reviewed')return {state:'resolved',label:'已复核',live};if(live.status==='hold')return {state:'pending',label:'暂缓未清零',live};return {state:'pending',label:'待处理',live};}
function reviewHandoffAnalysis(){const rows=state.reviewHandoffs?.handoffs||[],review=reviewWorkspaceAnalysis(),accepted=rows.filter(x=>x.status==='accepted').length,returned=rows.filter(x=>x.status==='returned').length;return {total:rows.length,accepted,returned,currentUnresolved:review.open+review.hold,currentImportant:review.important};}
function reviewHandoffEntryAnalysis(entry){const states=(entry.requiredItems||[]).map(req=>({req,...reviewHandoffRequiredState(req)})),unresolved=states.filter(x=>x.state!=='resolved').length;return {states,unresolved,resolved:states.length-unresolved,total:states.length};}
function reviewIssueFingerprint(issue){const s=JSON.stringify(issue||{});let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16).padStart(8,'0');}
function reviewHandoffDiffReviewState(entry){if(!entry?.baselineSnapshot?.id)return {state:'legacy',label:'旧轮次无版本基线'};if(!entry.diffReviewedAt||!entry.diffReviewedFingerprint)return {state:'pending',label:'尚未核对版本差异'};if(entry.diffReviewedFingerprint!==reviewIssueFingerprint(state.issue))return {state:'stale',label:'期刊已变化，需重新核对'};return {state:'reviewed',label:`已核对 ${fmtTime(entry.diffReviewedAt)}`};}
function reviewHandoffSummaryText(entry){const a=reviewHandoffEntryAnalysis(entry),ds=reviewHandoffDiffReviewState(entry),lines=[`【内部制作交接 · 非正式发布证据】`,`${state.issue?.label||state.issue?.id||''} · 第 ${entry.round} 轮校审`,`标题：${entry.title}`,`接收人：${entry.recipient}（${reviewHandoffRoleLabel(entry.role)}）`,`状态：${reviewHandoffStatusLabel(entry.status)}`,`交接问题：${a.total} 项 · 已明确复核 ${a.resolved} 项 · 未清零 ${a.unresolved} 项`,`版本基线：${entry.baselineSnapshot?.id||'旧轮次未记录'}`,`差异核对：${ds.label}`];if(entry.note)lines.push(`交接说明：${entry.note}`);if(entry.decisionNote)lines.push(`签收/退回说明：${entry.decisionNote}`);if(a.states.length){lines.push('问题清单：');a.states.forEach((x,i)=>lines.push(`${i+1}. ${x.req.page?`第${x.req.page}页 · `:''}${x.req.title} · ${x.label}`));}lines.push('边界：本摘要仅用于内部制作交接与复核，不修改 issue.status，不满足 V3.0.0 正式发布门禁。');return lines.join('\n');}
function createReviewHandoff(){state.reviewHandoffs||=defaultReviewHandoffs();if((state.reviewHandoffs.handoffs||[]).length>=80)return toast('校审交接最多 80 轮');const recipient=$('#handoffRecipient').value.trim();if(!recipient)return toast('请填写本轮接收人');const rounds=(state.reviewHandoffs.handoffs||[]).map(x=>Number(x.round)||0),round=Math.max(0,...rounds)+1;if(round>50)return toast('校审交接轮次最多 50 轮');const now=new Date().toISOString(),requiredItems=reviewHandoffRequiredSnapshot();state.reviewHandoffs.handoffs.push({id:`handoff-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`,round,title:`第 ${round} 轮校审交接`,recipient:recipient.slice(0,80),role:$('#handoffRole').value||'reviewer',status:'draft',note:$('#handoffNote').value.trim().slice(0,1600),decisionNote:'',requiredItems,baselineSnapshot:null,diffReviewedAt:null,diffReviewedFingerprint:null,createdAt:now,updatedAt:now,handedOffAt:null,acceptedAt:null,returnedAt:null});$('#handoffNote').value='';markReviewHandoffsDirty();toast(`已生成第 ${round} 轮交接，快照 ${requiredItems.length} 个未清零问题`);}
function renderReviewHandoffs(){if(!state.reviewHandoffs)return;const a=reviewHandoffAnalysis(),metrics=$('#reviewHandoffMetrics');if(metrics)metrics.innerHTML=[['交接轮次',a.total],['已签收',a.accepted],['当前未清零',a.currentUnresolved],['重要未结',a.currentImportant]].map(([k,v])=>`<span><small>${k}</small><b>${v}</b></span>`).join('');$('#reviewHandoffSummary').textContent=`已记录 ${a.total} 轮交接 · 已签收 ${a.accepted} 轮 · 已退回 ${a.returned} 轮。`;const unresolved=reviewHandoffRequiredSnapshot();$('#reviewHandoffCurrent').innerHTML=unresolved.length?unresolved.slice(0,40).map(x=>`<span class="handoff-current-chip ${x.severity==='important'?'important':''}">${x.page?`P${x.page} · `:''}${escText(x.title)}</span>`).join(''):'<span class="handoff-current-chip good">当前人工校审项均已明确复核</span>';$('#reviewHandoffCount').textContent=`${a.total} / 80`;
  const list=$('#reviewHandoffList'),rows=[...(state.reviewHandoffs.handoffs||[])].sort((x,y)=>y.round-x.round);if(!rows.length)list.innerHTML='<div class="handoff-empty">尚无交接轮次。填写接收人后生成第一轮内部交接。</div>';else list.innerHTML=rows.map(entry=>{const ea=reviewHandoffEntryAnalysis(entry),status=reviewHandoffStatusLabel(entry.status),ds=reviewHandoffDiffReviewState(entry),diffOk=ds.state==='reviewed'||ds.state==='legacy',canAccept=entry.status==='handed_off'&&ea.unresolved===0&&diffOk;let acceptText='签收通过';if(ea.unresolved)acceptText=`仍有 ${ea.unresolved} 项未清零`;else if(!diffOk)acceptText=ds.state==='stale'?'差异核对已过期':'先核对版本差异';return `<article class="handoff-card ${entry.status==='accepted'?'is-accepted':''} ${entry.status==='returned'?'is-returned':''}" data-handoff-id="${escText(entry.id)}"><div class="handoff-card-head"><div><b>第 ${entry.round} 轮 · ${escText(entry.title)}</b><small>${escText(entry.recipient)} · ${escText(reviewHandoffRoleLabel(entry.role))} · ${fmtTime(entry.updatedAt||entry.createdAt)}</small></div><span class="handoff-status ${entry.status==='accepted'?'accepted':entry.status==='returned'?'returned':''}">${escText(status)}</span></div><div class="handoff-required">${ea.states.length?ea.states.map(x=>`<div class="handoff-required-row ${x.state==='resolved'?'is-resolved':x.state==='missing'?'is-missing':''}"><span>${x.req.severity==='important'?'重要':'普通'}</span><b>${x.req.page?`P${x.req.page} · `:''}${escText(x.req.title)}</b><em>${escText(x.label)}</em></div>`).join(''):'<div class="handoff-required-row is-resolved"><span>清单</span><b>本轮交接时没有未清零问题</b><em>问题侧已清零</em></div>'}</div>${entry.baselineSnapshot?.id?`<div class="handoff-card-note">版本基线：${escText(entry.baselineSnapshot.id)} · ${escText(ds.label)}</div>`:'<div class="handoff-card-note">旧轮次未记录版本基线</div>'}${entry.note?`<div class="handoff-card-note">交接说明：${escText(entry.note)}</div>`:''}${entry.decisionNote?`<div class="handoff-card-note">签收/退回：${escText(entry.decisionNote)}</div>`:''}<div class="handoff-card-actions"><button type="button" data-handoff-copy="${escText(entry.id)}">复制摘要</button>${entry.baselineSnapshot?.id?`<button type="button" data-handoff-diff="${escText(entry.id)}">查看版本差异</button>`:''}${entry.status==='draft'||entry.status==='returned'?`<button type="button" data-handoff-action="handed_off" data-handoff-target="${escText(entry.id)}">${entry.status==='returned'?'重新交接':'确认交接'}</button>`:''}${entry.status==='handed_off'?`<button type="button" class="primary" data-handoff-action="accepted" data-handoff-target="${escText(entry.id)}" ${canAccept?'':'disabled'}>${acceptText}</button><button type="button" data-handoff-action="returned" data-handoff-target="${escText(entry.id)}">退回修改</button>`:''}<button type="button" class="danger-lite" data-handoff-delete="${escText(entry.id)}">删除记录</button></div></article>`}).join('');const stateEl=$('#reviewHandoffState');stateEl.textContent=state.reviewHandoffsDirty?'交接记录有未保存修改':state.reviewHandoffs.updatedAt?`已保存 ${fmtTime(state.reviewHandoffs.updatedAt)}`:'交接记录未修改';stateEl.classList.toggle('dirty',state.reviewHandoffDiffTargetId);if(state.reviewHandoffDiffTargetId)renderReviewHandoffDiff();}
async function saveReviewHandoffs(){if(!state.issue||!state.reviewHandoffs)return false;try{const saved=await api(`/api/issues/${encodeURIComponent(state.issue.id)}/review-handoffs`,{method:'PUT',body:JSON.stringify(state.reviewHandoffs)});state.reviewHandoffs=saved;state.reviewHandoffsDirty=false;renderReviewHandoffs();toast('校审交接记录已保存');return true}catch(e){toast(`保存交接记录失败：${e.message}`,3600);return false}}
async function openReviewHandoffs(){if(!state.issue)return toast('请先选择期刊');await loadReviewWorkspace();await loadReviewHandoffs();renderReviewHandoffs();$('#reviewHandoffDialog').showModal();}
function handoffDiffPage(item){const m=String(item?.title||'').match(/第\s*(\d+)\s*页/);return m?Number(m[1]):null;}
async function openReviewHandoffDiff(id){const entry=(state.reviewHandoffs?.handoffs||[]).find(x=>x.id===id);if(!entry)return;if(!entry.baselineSnapshot?.id){toast('该旧交接轮次没有 Alpha10 版本基线');return;}state.reviewHandoffDiffTargetId=id;state.reviewHandoffDiffBase=null;state.reviewHandoffDiffLoading=true;renderReviewHandoffDiff();try{const data=await api(`/api/issues/${encodeURIComponent(state.issue.id)}/snapshots/${encodeURIComponent(entry.baselineSnapshot.id)}/issue`);state.reviewHandoffDiffBase=data.issue||null;}catch(e){toast(`读取交接基线失败：${e.message}`,3200);}finally{state.reviewHandoffDiffLoading=false;renderReviewHandoffDiff();}}
function renderReviewHandoffDiff(){const entry=(state.reviewHandoffs?.handoffs||[]).find(x=>x.id===state.reviewHandoffDiffTargetId),stateEl=$('#reviewHandoffDiffState'),metrics=$('#reviewHandoffDiffMetrics'),list=$('#reviewHandoffDiffList'),confirmBtn=$('#reviewHandoffDiffConfirm');if(!stateEl||!metrics||!list||!confirmBtn)return;if(!entry){stateEl.textContent='请选择一个交接轮次';metrics.innerHTML='';list.innerHTML='<div class="handoff-empty">在交接轮次中点击“查看版本差异”。</div>';confirmBtn.disabled=true;return;}if(state.reviewHandoffDiffLoading){stateEl.textContent=`第 ${entry.round} 轮 · 正在读取基线…`;metrics.innerHTML='';list.innerHTML='<div class="handoff-empty">正在加载版本快照。</div>';confirmBtn.disabled=true;return;}if(!state.reviewHandoffDiffBase){stateEl.textContent=`第 ${entry.round} 轮 · 基线不可用`;metrics.innerHTML='';list.innerHTML='<div class="handoff-empty">无法读取本轮交接基线，请检查 snapshot 是否仍存在。</div>';confirmBtn.disabled=true;return;}const diff=summarizeIssueDiff(state.reviewHandoffDiffBase,state.issue),m=diff.metrics,ds=reviewHandoffDiffReviewState(entry);stateEl.textContent=`第 ${entry.round} 轮 · ${ds.label}`;stateEl.className=ds.state==='reviewed'?'handoff-diff-state-reviewed':ds.state==='stale'?'handoff-diff-state-stale':'';metrics.innerHTML=[['元数据',m.meta],['页面',m.pages],['内容',m.blocks],['文章',m.articles]].map(([k,v])=>`<span><small>${k}</small><b>${v}</b></span>`).join('');list.innerHTML=diff.items.length?diff.items.slice(0,100).map(item=>{const page=handoffDiffPage(item);return `<div class="handoff-diff-row"><span>${escText(item.kind)}</span><div><b>${escText(item.title)}</b><small>${escText(item.detail||'')}</small></div>${page?`<button type="button" data-handoff-diff-page="${page}">定位 P${page}</button>`:''}</div>`}).join(''):'<div class="handoff-empty">当前期刊与交接基线没有检测到结构或内容差异。</div>';confirmBtn.disabled=false;confirmBtn.dataset.handoffDiffConfirm=entry.id;confirmBtn.textContent=ds.state==='reviewed'?'已核对当前差异':'我已核对当前差异';}
function markReviewHandoffDiffReviewed(id){const entry=(state.reviewHandoffs?.handoffs||[]).find(x=>x.id===id);if(!entry?.baselineSnapshot?.id||!state.reviewHandoffDiffBase)return toast('请先读取交接基线');entry.diffReviewedAt=new Date().toISOString();entry.diffReviewedFingerprint=reviewIssueFingerprint(state.issue);entry.updatedAt=entry.diffReviewedAt;markReviewHandoffsDirty();renderReviewHandoffDiff();toast('已记录当前版本差异核对；若期刊继续修改，本次核对会自动失效');}
async function updateReviewHandoffStatus(id,status){const entry=(state.reviewHandoffs?.handoffs||[]).find(x=>x.id===id);if(!entry)return;const now=new Date().toISOString(),ea=reviewHandoffEntryAnalysis(entry);if(status==='accepted'){if(entry.status!=='handed_off')return toast('只有已交接轮次可以签收');if(state.dirty)return toast('内部签收前请先保存当前期刊，确保核对版本与磁盘一致');if(ea.unresolved)return toast(`仍有 ${ea.unresolved} 项问题未明确复核，不能签收`);const ds=reviewHandoffDiffReviewState(entry);if(entry.baselineSnapshot?.id&&ds.state!=='reviewed')return toast(ds.state==='stale'?'期刊在差异核对后又发生变化，请重新核对':'请先查看并确认本轮交接版本差异');const note=prompt('内部签收说明（可留空）：',entry.decisionNote||'');if(note===null)return;entry.status='accepted';entry.acceptedAt=now;entry.decisionNote=String(note).slice(0,1600);}else if(status==='returned'){if(entry.status!=='handed_off')return;const note=prompt('请填写退回修改原因：',entry.decisionNote||'');if(note===null||!String(note).trim())return toast('退回修改需要填写原因');entry.status='returned';entry.returnedAt=now;entry.decisionNote=String(note).trim().slice(0,1600);}else if(status==='handed_off'){if(state.dirty)return toast('确认交接前请先保存当前期刊，确保版本基线与磁盘内容一致');try{const snap=await api(`/api/issues/${encodeURIComponent(state.issue.id)}/snapshot`,{method:'POST',body:JSON.stringify({label:`review-handoff-round-${entry.round}`})});const issueMeta=(snap.files||[]).find(x=>x.name==='issue.json');entry.baselineSnapshot={id:snap.id,createdAt:snap.createdAt||now,issueSha256:issueMeta?.sha256||null};entry.diffReviewedAt=null;entry.diffReviewedFingerprint=null;state.reviewHandoffDiffTargetId='';state.reviewHandoffDiffBase=null;}catch(e){return toast(`建立交接版本基线失败：${e.message}`,3600)}entry.status='handed_off';entry.handedOffAt=now;entry.acceptedAt=null;entry.returnedAt=null;}else return;entry.updatedAt=now;markReviewHandoffsDirty();}

// Keep the dirty badge tied to unsaved handoff edits, not to the selected diff record.
// The legacy renderer also marks the badge while a diff is open; normalize it after every render.
const renderReviewHandoffsWithDirtyState = renderReviewHandoffs;
renderReviewHandoffs = (...args) => {
  const result = renderReviewHandoffsWithDirtyState(...args);
  $('#reviewHandoffState')?.classList.toggle('dirty', Boolean(state.reviewHandoffsDirty));
  return result;
};

$('#reviewHandoffBtn')?.addEventListener('click',openReviewHandoffs);
$('#reviewHandoffFromWorkspace').onclick = () => { $('#reviewWorkspaceDialog').close(); openReviewHandoffs(); };
$('#createReviewHandoff').onclick = createReviewHandoff;
$('#saveReviewHandoffs').onclick = saveReviewHandoffs;
$('#refreshReviewHandoff').onclick = async () => { await loadReviewWorkspace(true); renderReviewHandoffs(); toast('已按最新校审单刷新交接状态'); };
$('#reviewHandoffList').addEventListener('click', async e => {
  const copy = e.target.closest('[data-handoff-copy]');
  if (copy) {
    const entry = (state.reviewHandoffs?.handoffs || []).find(x => x.id === copy.dataset.handoffCopy);
    if (!entry) return;
    const text = reviewHandoffSummaryText(entry);
    try { await navigator.clipboard.writeText(text); toast('内部交接摘要已复制'); }
    catch { prompt('复制内部交接摘要：', text); }
    return;
  }
  const diff = e.target.closest('[data-handoff-diff]');
  if (diff) { await openReviewHandoffDiff(diff.dataset.handoffDiff); return; }
  const action = e.target.closest('[data-handoff-action]');
  if (action) { await updateReviewHandoffStatus(action.dataset.handoffTarget, action.dataset.handoffAction); return; }
  const del = e.target.closest('[data-handoff-delete]');
  if (del) {
    const i = (state.reviewHandoffs?.handoffs || []).findIndex(x => x.id === del.dataset.handoffDelete);
    if (i >= 0 && confirm('删除这条内部交接记录？')) {
      if (state.reviewHandoffDiffTargetId === del.dataset.handoffDelete) { state.reviewHandoffDiffTargetId = ''; state.reviewHandoffDiffBase = null; }
      state.reviewHandoffs.handoffs.splice(i, 1);
      markReviewHandoffsDirty();
    }
  }
});
$('#reviewHandoffDiffConfirm').onclick = e => { const id = e.currentTarget.dataset.handoffDiffConfirm; if (id) markReviewHandoffDiffReviewed(id); };
$('#reviewHandoffDiffList').addEventListener('click', e => {
  const btn = e.target.closest('[data-handoff-diff-page]');
  if (!btn) return;
  const page = Number(btn.dataset.handoffDiffPage);
  if (!Number.isInteger(page) || page < 1 || page > (state.issue?.pages?.length || 0)) return toast('该差异对应页面当前不存在');
  state.page = page - 1;
  renderPages(); renderPage(); $('#reviewHandoffDialog').close();
  requestAnimationFrame(() => document.querySelector(`.page-item[data-page-index="${page-1}"]`)?.scrollIntoView({block:'nearest'}));
  toast(`已定位第 ${page} 页`);
});
$('#clearReviewHandoffs').onclick = () => {
  if (!state.reviewHandoffs?.handoffs?.length) return;
  if (!confirm('清空当前期刊全部内部交接记录？')) return;
  state.reviewHandoffs.handoffs = []; state.reviewHandoffDiffTargetId = ''; state.reviewHandoffDiffBase = null; markReviewHandoffsDirty();
};

const buildBtn=$('#buildBtn');if(buildBtn)buildBtn.onclick = async () => { if (!requireIssue()) return; if (state.dirty) { toast('构建前正在保存当前修改…'); if (!await saveIssue({silent:true})) return; } try { const r = await api(`/api/issues/${state.issue.id}/build`,{method:'POST',body:'{}'}); state.builtPreviewStale=false; updateBuiltPreviewState(); const previewUrl=appUrl(r.preview); showOutput('构建预览',`${r.output || ''}\n\n预览地址：${new URL(previewUrl,location.origin).href}`); window.open(previewUrl,'_blank'); toast('构建完成'); } catch (e) { showOutput('构建失败',e.message); } };



const THEME_DEFAULTS={accent:'#8d1f1c',paper:'#fffaf0',canvas:'#1f1a17',texture:'paper',text:'#3b2d26',muted:'#8a7566',fontBase:13.3,radius:12,spacing:10};
const DESIGN_FIELDS={
  theme:[['accent','主色','color'],['paper','纸张色','color'],['canvas','阅读背景','color'],['texture','纸张纹理','select',[['paper','暖纸点纹'],['linen','细亚麻纹'],['grid','细网格纹'],['plain','纯色无纹']]],['text','正文色','color'],['muted','次级文字','color'],['fontBase','基础字号','range',11,18,.1],['radius','基础圆角','range',0,24,1],['spacing','基础间距','range',4,24,1]],
  page:[['background','页面背景','color'],['color','页面文字','color'],['accent','页面强调色','color'],['padding','页内留白','range',0,12,.5],['contentWidth','内容宽度','range',60,100,1],['backgroundOverlay','背景遮罩','range',0,.92,.04],['backgroundFit','背景适配','select',[['cover','铺满页面'],['contain','完整显示']]],['backgroundPosition','背景焦点','select',[['center','居中'],['top','顶部'],['bottom','底部'],['left','左侧'],['right','右侧']]]],
  block:[['fontSize','字号','range',10,48,1],['fontWeight','字重','select',[['','继承'],['400','常规 400'],['500','中等 500'],['600','半粗 600'],['700','粗体 700'],['800','特粗 800']]],['color','文字颜色','color'],['background','背景颜色','color'],['padding','内边距','range',0,48,1],['margin','上下外边距','range',0,48,1],['radius','圆角','range',0,40,1],['borderWidth','边框宽度','range',0,6,1],['borderColor','边框颜色','color'],['shadow','阴影','select',[['','继承/无'],['none','无'],['sm','轻'],['md','标准'],['lg','强']]],['textAlign','文字对齐','select',[['','继承'],['left','左对齐'],['center','居中'],['right','右对齐'],['justify','两端对齐']]],['width','宽度','range',25,100,1],['alignSelf','块位置','select',[['','继承'],['left','左'],['center','中'],['right','右']]],['x','水平位置','range',-240,240,1],['y','垂直位置','range',-240,240,1],['rotate','旋转角度','range',-180,180,1],['scale','缩放比例','range',0.5,1.8,.05]]
};
state.designScope='theme';state.designTarget=null;
function ensureDesignRoot(){state.issue.design ||= {};state.issue.design.tokens ||= {};return state.issue.design.tokens;}
function getDesignTarget(scope=state.designScope,{create=false}={}){
  if(scope==='theme')return create?ensureDesignRoot():(state.issue?.design?.tokens||{});
  if(scope==='page'){const p=currentPage();if(!p)return null;if(create)p.design ||= {};return p.design||{};}
  const b=resolveBlockLocation(state.designTarget||{})?.block;if(!b)return null;if(create)b.design ||= {};return b.design||{};
}
function currentDesignBlock(){return resolveBlockLocation(state.designTarget||{})?.block||null;}
function designOwnSnapshot(owner){const present=Boolean(owner)&&Object.prototype.hasOwnProperty.call(owner,'design');return {present,value:present?cloneData(owner.design):null};}
function designBlockSnapshots(blocks=[]){return blocks.map(block=>({design:designOwnSnapshot(block),columns:block?.type==='container'?(block.columns||[]).map(col=>designBlockSnapshots(col?.blocks||[])):null}));}
function captureDesignState(){return {issue:designOwnSnapshot(state.issue),pages:(state.issue?.pages||[]).map(page=>({design:designOwnSnapshot(page),blocks:designBlockSnapshots(page.blocks||[])}))};}
function applyOwnDesignSnapshot(owner,snap){if(!owner||!snap)return;if(snap.present)owner.design=cloneData(snap.value);else delete owner.design;}
function applyDesignBlockSnapshots(blocks=[],snaps=[]){if(blocks.length!==snaps.length)return false;for(let i=0;i<blocks.length;i++){const block=blocks[i],snap=snaps[i];applyOwnDesignSnapshot(block,snap.design);if(snap.columns){const cols=block?.columns||[];if(cols.length!==snap.columns.length)return false;for(let c=0;c<cols.length;c++)if(!applyDesignBlockSnapshots(cols[c]?.blocks||[],snap.columns[c]||[]))return false;}}return true;}
function restoreDesignState(snapshot){if(!snapshot||!state.issue||snapshot.pages.length!==(state.issue.pages||[]).length){clearDesignHistory();toast('页面结构已变化，设计回退历史已重置');return false;}applyOwnDesignSnapshot(state.issue,snapshot.issue);for(let i=0;i<snapshot.pages.length;i++){const page=state.issue.pages[i],snap=snapshot.pages[i];applyOwnDesignSnapshot(page,snap.design);if(!applyDesignBlockSnapshots(page.blocks||[],snap.blocks||[])){clearDesignHistory();toast('组件结构已变化，设计回退历史已重置');return false;}}state.historyCurrent=cloneData(state.issue);state.dirty=!issuesEqual(state.issue,state.originalIssue);state.builtPreviewStale=true;if(state.audit)state.auditStale=true;syncJsonFromPage();updateStateBadges();updateFieldStats();updateBuiltPreviewState();scheduleDraftSave();renderPreview();pushReaderPreview().catch(()=>{});renderDesignControls();return true;}
function updateDesignHistoryButtons(){const u=$('#designUndoBtn'),r=$('#designRedoBtn');if(u)u.disabled=!state.designUndoStack.length;if(r)r.disabled=!state.designRedoStack.length;}
function clearDesignHistory(){state.designUndoStack=[];state.designRedoStack=[];state.designHistoryKey='';state.designHistoryAt=0;updateDesignHistoryButtons();}
function rememberDesignHistory(key='design',{force=false}={}){if(!state.issue)return;const now=Date.now(),grouped=!force&&state.designHistoryKey===key&&now-state.designHistoryAt<700;if(!grouped){state.designUndoStack.push(captureDesignState());if(state.designUndoStack.length>36)state.designUndoStack.shift();state.designRedoStack=[];}state.designHistoryKey=key;state.designHistoryAt=now;updateDesignHistoryButtons();}
function undoDesign(){if(!state.designUndoStack.length)return;const snap=state.designUndoStack.pop();state.designRedoStack.push(captureDesignState());if(restoreDesignState(snap))toast('已撤销一次设计操作');updateDesignHistoryButtons();}
function redoDesign(){if(!state.designRedoStack.length)return;const snap=state.designRedoStack.pop();state.designUndoStack.push(captureDesignState());if(restoreDesignState(snap))toast('已重做一次设计操作');updateDesignHistoryButtons();}
function designInheritedValue(scope,key){
  const tokens={...THEME_DEFAULTS,...(state.issue?.design?.tokens||{})};
  if(scope==='theme')return tokens[key];
  const page=currentPage()?.design||{};
  if(scope==='page'){if(key==='background')return tokens.paper;if(key==='color')return tokens.text;if(key==='accent')return tokens.accent;if(key==='padding')return 5;if(key==='contentWidth')return 100;if(key==='backgroundOverlay')return .72;if(key==='backgroundFit')return 'cover';if(key==='backgroundPosition')return 'center';return '';}
  if(key==='color')return page.color||tokens.text;if(key==='background')return 'transparent';if(key==='fontSize')return tokens.fontBase;if(key==='radius')return tokens.radius;if(key==='padding')return 0;if(key==='margin')return tokens.spacing;if(key==='width')return 100;if(key==='fontWeight')return '400';if(key==='textAlign')return 'inherit';if(key==='borderWidth')return 0;if(key==='borderColor')return tokens.muted;if(key==='shadow')return 'none';if(key==='x'||key==='y'||key==='rotate')return 0;if(key==='scale')return 1;return '';
}
function designFieldHtml(scope,def,target){
  const [key,label,type,a,b,c]=def;const own=Object.prototype.hasOwnProperty.call(target,key)&&target[key]!==''&&target[key]!=null;const inherited=designInheritedValue(scope,key);const value=own?target[key]:inherited;
  if(type==='color'){const safe=/^#[0-9a-fA-F]{6}$/.test(String(value||''))?value:'#ffffff';return `<label class="design-field"><span>${escText(label)} <small>${own?'自定义':'继承'}</small></span><div class="design-color-row"><input type="color" data-design-key="${key}" value="${safe}"><code>${safe}</code><button type="button" data-design-reset="${key}" ${scope==='theme'?'hidden':''}>继承</button></div></label>`;}
  if(type==='range'){const min=a,max=b,step=c;return `<label class="design-field"><span>${escText(label)} <small>${own?'自定义':'继承'} · <output>${escText(value)}</output></small></span><input type="range" data-design-key="${key}" min="${min}" max="${max}" step="${step}" value="${value}"><button type="button" data-design-reset="${key}" ${scope==='theme'?'hidden':''}>恢复继承</button></label>`;}
  if(type==='select'){return `<label class="design-field"><span>${escText(label)}</span><select data-design-key="${key}">${a.map(([v,t])=>`<option value="${escText(v)}"${String(own?target[key]:'')===String(v)?' selected':''}>${escText(t)}</option>`).join('')}</select></label>`;}
  return '';
}
function designPayload(scope,payload){if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('样式必须是 JSON 对象');const defs=DESIGN_FIELDS[scope]||[],allowed=new Map(defs.map(x=>[x[0],x])),out={};for(const [key,raw] of Object.entries(payload)){const def=allowed.get(key);if(!def)throw new Error(`当前作用域不支持 ${key}`);const type=def[2];if(raw===''||raw==null){if(scope!=='theme')continue;throw new Error(`Theme.${key} 不能为空`);}if(type==='color'){if(!/^#[0-9a-fA-F]{6}$/.test(String(raw)))throw new Error(`${key} 必须为 #RRGGBB`);out[key]=String(raw);continue;}if(type==='range'){const n=Number(raw),min=Number(def[3]),max=Number(def[4]);if(!Number.isFinite(n)||n<min||n>max)throw new Error(`${key} 必须在 ${min}–${max}`);out[key]=n;continue;}if(type==='select'){const values=new Set((def[3]||[]).map(x=>String(x[0])));if(!values.has(String(raw)))throw new Error(`${key} 取值不受支持`);if(String(raw)!=='')out[key]=String(raw);}}return out;}
function currentPresetId(){const tokens={...THEME_DEFAULTS,...(state.issue?.design?.tokens||{})};return DESIGN_PRESETS.find(p=>issuesEqual(tokens,p.tokens))?.id||null;}
function designPresetCard(p,{active=false,preview=false}={}){return `<button type="button" class="design-preset-card${active?' active':''}${preview?' is-preview':''}" data-design-preset="${p.id}" title="${escText(p.description)}"><span class="design-preset-chip" style="--preset-accent:${p.tokens.accent};--preset-paper:${p.tokens.paper};--preset-canvas:${p.tokens.canvas}"></span><span class="design-preset-copy"><b>${escText(p.name)}</b><span>${escText(p.description)}</span></span></button>`;}
function renderDesignPresets(){const section=$('#designPresetSection'),list=$('#designPresetList');if(!section||!list)return;const show=state.designScope==='theme';section.classList.toggle('hidden',!show);if(!show)return;const active=currentPresetId(),featured=DESIGN_PRESET_GROUPS.find(x=>x.id==='featured')||{ids:DESIGN_PRESETS.slice(0,4).map(x=>x.id)},find=id=>DESIGN_PRESETS.find(x=>x.id===id),preview=state.designPresetPreviewId||active||featured.ids[0],previewPreset=find(preview);state.designPresetPreviewId=previewPreset?.id||active||'';const cards=ids=>ids.map(find).filter(Boolean).map(p=>designPresetCard(p,{active:active===p.id,preview:state.designPresetPreviewId===p.id})).join('');const extra=DESIGN_PRESET_GROUPS.filter(x=>x.id!=='featured').map(group=>`<section class="design-preset-group"><header><b>${escText(group.name)}</b><small>${escText(group.description)}</small></header><div class="design-preset-group-cards">${cards(group.ids)}</div></section>`).join('');list.innerHTML=`<div class="design-preset-featured">${cards(featured.ids)}</div><details class="design-preset-more"><summary>更多主题（${DESIGN_PRESETS.length-featured.ids.length} 套）</summary><div class="design-preset-groups">${extra}</div></details><div class="design-preset-apply"><span>当前预览：<b>${escText(previewPreset?.name||'自定义 Theme')}</b>${active===state.designPresetPreviewId?' · 已应用':''}</span><button type="button" data-apply-design-preset ${!previewPreset||active===state.designPresetPreviewId?'disabled':''}>应用此主题</button></div>`;}
async function loadDesignAssets(){try{const r=await api('/api/design-library');state.designAssets=Array.isArray(r.styles)?r.styles:[];state.designAssetsLoaded=true;}catch{state.designAssets=[];state.designAssetsLoaded=true;}renderDesignLibrary();}
function designScopeLabel(scope=state.designScope){return ({theme:'Theme',page:'页面',block:'组件'})[scope]||scope;}
function currentDesignContextType(){if(state.designScope==='page')return currentPage()?.type||'page';if(state.designScope==='block')return currentDesignBlock()?.type||'block';return 'theme';}
function currentDesignAssetPayload(){if(state.designScope==='theme')return {...THEME_DEFAULTS,...(state.issue?.design?.tokens||{})};const payload=cloneData(getDesignTarget()||{});if(state.designScope==='page')delete payload.backgroundImage;return payload;}
function renderDesignLibrary(){const list=$('#designLibraryList'),count=$('#designLibraryCount');if(!list||!count)return;const rows=(state.designAssets||[]).filter(x=>x.scope===state.designScope);count.textContent=`${rows.length} 个${designScopeLabel()}样式 · ${state.designAssets.length} / 60`;if(!rows.length){list.innerHTML=`<div class="design-library-empty">还没有${designScopeLabel()}“我的样式”。调整后可保存，之后其他期刊也能直接复用。</div>`;return;}list.innerHTML=rows.map(x=>`<div class="design-library-item"><button type="button" data-design-asset="${escText(x.id)}"><b>${escText(x.name)}</b><span>${escText(x.contextType||designScopeLabel(x.scope))} · ${Object.keys(x.payload||{}).length} 项</span></button><button type="button" class="danger-lite" data-delete-design-asset="${escText(x.id)}" title="删除样式">×</button></div>`).join('');}
async function saveCurrentDesignAsset(){if(!state.issue)return;let payload;try{payload=designPayload(state.designScope,currentDesignAssetPayload());}catch(e){return toast(`无法保存：${e.message}`,3000)}if(!Object.keys(payload).length)return toast('当前作用域没有自定义样式可保存',2600);const name=prompt('样式名称：',`${currentDesignContextType()} · ${designScopeLabel()}样式`);if(name==null)return;try{await api('/api/design-library',{method:'POST',body:JSON.stringify({name:name.trim(),scope:state.designScope,contextType:currentDesignContextType(),payload})});await loadDesignAssets();toast('已保存到“我的样式”');}catch(e){toast(e.message,3200)}}
function applyDesignAsset(id){const item=(state.designAssets||[]).find(x=>x.id===id);if(!item||item.scope!==state.designScope)return;let clean;try{clean=designPayload(state.designScope,item.payload||{});}catch(e){return toast(`样式已失效：${e.message}`,3000)}rememberDesignHistory(`library:${id}`,{force:true});if(state.designScope==='theme'){ensureDesignRoot();state.issue.design.tokens={...THEME_DEFAULTS,...clean};}else{const target=getDesignTarget(state.designScope,{create:true}),backgroundImage=state.designScope==='page'?target.backgroundImage:'';for(const key of Object.keys(target))delete target[key];Object.assign(target,clean);if(backgroundImage)target.backgroundImage=backgroundImage;}finalizeDesignMutation('design-library',{force:true,message:`已应用“${item.name}”`});}
async function deleteDesignAsset(id){const item=(state.designAssets||[]).find(x=>x.id===id);if(!item)return;if(!confirm(`删除“我的样式”${item.name}？`))return;try{await api(`/api/design-library/${encodeURIComponent(id)}`,{method:'DELETE'});await loadDesignAssets();toast('样式已删除');}catch(e){toast(e.message,3000)}}
function walkDesignTargets(issue=state.issue){const out=[];(issue?.pages||[]).forEach((page,pageIndex)=>walkBlocks(page.blocks||[],(block,path)=>out.push({pageIndex,...path,block,blockId:block?.id||null}),{pageIndex}));return out;}
function stableDesignSignature(design){const x=design&&typeof design==='object'?design:{};return JSON.stringify(Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])));}
function analyzeDesignConsistency(){const pages=state.issue?.pages||[],targets=walkDesignTargets(),pageOverrides=pages.filter(p=>p.design&&Object.keys(p.design).length).length,blockOverrides=targets.filter(x=>x.block?.design&&Object.keys(x.block.design).length).length,groups=new Map();for(const row of targets){const type=row.block?.type||'unknown';if(!groups.has(type))groups.set(type,[]);groups.get(type).push({...row,signature:stableDesignSignature(row.block?.design)});}const divergences=[];for(const [type,rows] of groups){const variants=new Map();for(const row of rows){if(!variants.has(row.signature))variants.set(row.signature,[]);variants.get(row.signature).push(row);}if(variants.size>1){const ordered=[...variants.values()].sort((a,b)=>b.length-a.length);const sample=(ordered.find(v=>v.some(x=>Object.keys(x.block?.design||{}).length))||ordered[0])[0];divergences.push({type,total:rows.length,variants:variants.size,sample});}}divergences.sort((a,b)=>b.variants-a.variants||b.total-a.total||a.type.localeCompare(b.type));return {pages:pages.length,pageOverrides,blocks:targets.length,blockOverrides,divergences};}
function renderDesignGovernance(){const metrics=$('#designGovernanceMetrics'),list=$('#designGovernanceList');if(!metrics||!list||!state.issue)return;const a=analyzeDesignConsistency();state.designDivergences=a.divergences;metrics.innerHTML=`<div><span>页面覆盖</span><b>${a.pageOverrides}/${a.pages}</b></div><div><span>组件覆盖</span><b>${a.blockOverrides}/${a.blocks}</b></div>`;if(!a.divergences.length){list.innerHTML='<div class="design-governance-good">✓ 同类型组件未发现显式样式分叉</div>';return;}list.innerHTML=`<div class="design-governance-note">${a.divergences.length} 类组件存在多种显式/继承样式，可能是有意设计，也可能需要统一。</div>${a.divergences.slice(0,5).map((x,i)=>`<button type="button" data-design-divergence="${i}"><b>${escText(BLOCK_NAMES[x.type]||x.type)}</b><span>${x.total} 个 · ${x.variants} 种样式 · 定位</span></button>`).join('')}`;}
function locateDesignDivergence(index){const item=state.designDivergences?.[Number(index)],path=item?.sample;if(!path)return;if(path.pageIndex!==state.page){if(!commitPage())return;state.page=path.pageIndex;renderPages();renderPage();}state.designScope='block';state.designTarget={blockIndex:path.blockIndex,blockId:path.blockId||null};if(path.columnIndex!=null){state.designTarget.columnIndex=path.columnIndex;state.designTarget.childIndex=path.childIndex;}focusBlock(path.blockIndex);renderDesignControls();toast(`已定位：${BLOCK_NAMES[item.type]||item.type}`);}
function walkBlocks(blocks=[],fn,path={}){for(let i=0;i<blocks.length;i++){const block=blocks[i];fn(block,{...path,blockIndex:i});if(block?.type==='container')for(let c=0;c<(block.columns||[]).length;c++)walkBlocks(block.columns[c]?.blocks||[],fn,{...path,blockIndex:i,columnIndex:c});}}
function setDesignObject(owner,design){if(!owner)return;if(design&&Object.keys(design).length)owner.design=cloneData(design);else delete owner.design;}
function currentTargetPathMatches(path={}){const t=state.designTarget||{};return Number(path.pageIndex)===state.page&&Number(path.blockIndex)===Number(t.blockIndex)&&((t.columnIndex==null&&path.columnIndex==null)||(Number(path.columnIndex)===Number(t.columnIndex)&&Number(path.childIndex)===Number(t.childIndex)));}
function renderDesignReuseActions(){const box=$('#designReuseActions');if(!box)return;const scope=state.designScope;if(scope==='theme'){box.innerHTML='<div class="reader-target-hint">提示：在 Studio 的真实 Reader 预览中点击正文组件，可直接打开该组件的设计面板。</div>';return;}if(scope==='page'){const n=state.selectedPages.size;box.innerHTML=`<button type="button" data-design-batch="pages" ${n?'':'disabled'}><strong>套用到已选页面</strong><small>${n?`将当前页面样式复制到已选 ${n} 页`:'先在左侧页面列表多选目标页面'}</small></button>`;return;}const block=currentDesignBlock(),type=block?.type||'组件';box.innerHTML=`<button type="button" data-design-batch="same-page"><strong>套用到本页同类型组件</strong><small>${escText(type)} · 不改变正文内容</small></button><button type="button" data-design-batch="same-issue"><strong>套用到整刊同类型组件</strong><small>${escText(type)} · 仅复制 design 覆盖</small></button>`;}
function pageBackgroundControlHtml(target={}){const path=String(target.backgroundImage||''),name=path?path.split('/').at(-1):'';return `<section class="design-page-background"><div><b>页面背景素材</b><span>${name?escText(name):'尚未设置'}</span></div><p>${name?'背景图将随本页发布；可在下方调整遮罩、适配和焦点。':'在“资源 / TTS”选择图片后，点击“设为页面背景”。'}</p>${name?'<button type="button" data-page-background-clear>移除背景素材</button>':''}</section>`;}
function clearPageBackground(){const page=currentPage();if(!page?.design?.backgroundImage)return toast('当前页面没有背景素材');rememberDesignHistory('page-background',{force:true});delete page.design.backgroundImage;delete page.design.backgroundOverlay;delete page.design.backgroundFit;delete page.design.backgroundPosition;finalizeDesignMutation('page-background',{force:true,message:'已移除页面背景素材'});}
function renderDesignControls(){
  const scope=state.designScope,target=getDesignTarget(scope);if(!target)return;
  const labels={theme:'全刊 Theme',page:'当前页面',block:'当前组件'};$('#designScopeTitle').textContent=labels[scope];
  [...$('#designScopeTabs').querySelectorAll('button')].forEach(b=>b.classList.toggle('active',b.dataset.designScope===scope));
  $('#designScopeTabs').querySelector('[data-design-scope="block"]').disabled=!currentDesignBlock();
  const fields=DESIGN_FIELDS[scope].filter(d=>scope!=='page'||!['backgroundOverlay','backgroundFit','backgroundPosition'].includes(d[0])||target.backgroundImage);$('#designControls').innerHTML=`<div class="design-section-head"><b>${labels[scope]}</b><span>${scope==='theme'?'定义全刊默认视觉语言':scope==='page'?'只覆盖当前页面':'只覆盖当前组件'}</span></div>${scope==='page'?pageBackgroundControlHtml(target):''}${fields.map(d=>designFieldHtml(scope,d,target)).join('')}`;
  const tokens={...THEME_DEFAULTS,...(state.issue?.design?.tokens||{})},page=currentPage()?.design||{};$('#designInheritance').innerHTML=`<div><span>Theme</span><b>${escText(tokens.accent)} · ${escText(tokens.paper)}</b></div><div><span>页面</span><b>${page.background?'已覆盖背景':'继承 Theme'} · ${page.color?'已覆盖文字':'继承 Theme'}</b></div><div><span>组件</span><b>${scope==='block'&&Object.keys(target).length?`${Object.keys(target).length} 项覆盖`:'继承上级'}</b></div>`;
  updateDesignPreviewSwatch();
  renderDesignPresets();renderDesignLibrary();renderDesignGovernance();renderDesignReuseActions();updateDesignHistoryButtons();
}
function updateDesignPreviewSwatch(){const scope=state.designScope,target=getDesignTarget(scope)||{},preview=scope==='theme'?DESIGN_PRESETS.find(p=>p.id===state.designPresetPreviewId):null,tokens={...THEME_DEFAULTS,...(preview?.tokens||state.issue?.design?.tokens||{})},page=currentPage()?.design||{},sw=$('#designPreviewSwatch');if(!sw)return;sw.style.background=scope==='theme'?tokens.paper:(scope==='page'?(target.background||tokens.paper):(target.background||'transparent'));sw.style.backgroundImage='';if(scope==='page'&&target.backgroundImage){const image=issueAssetUrl(target.backgroundImage),overlay=Math.max(0,Math.min(.92,Number(target.backgroundOverlay??.72)));sw.style.backgroundImage=`linear-gradient(rgba(255,250,240,${overlay}),rgba(255,250,240,${overlay})),url("${image}")`;sw.style.backgroundSize=target.backgroundFit==='contain'?'contain':'cover';sw.style.backgroundPosition=['center','top','bottom','left','right'].includes(target.backgroundPosition)?target.backgroundPosition:'center';sw.style.backgroundRepeat='no-repeat';}sw.style.color=scope==='theme'?tokens.text:(scope==='page'?(target.color||tokens.text):(target.color||page.color||tokens.text));sw.style.borderColor=scope==='block'?(target.borderColor||tokens.muted):tokens.muted;sw.style.borderRadius=`${scope==='block'?(target.radius??tokens.radius):tokens.radius}px`;sw.style.fontSize=`${scope==='block'?(target.fontSize??tokens.fontBase):tokens.fontBase}px`;const title=sw.querySelector('strong'),copy=sw.querySelector('p');if(scope==='theme'&&preview){if(title)title.textContent=`${preview.name} · 未应用预览`;if(copy)copy.textContent='这是右侧预览，点击“应用此主题”后才会写入期刊并同步 Reader。';}else{if(title)title.textContent='样式预览';if(copy)copy.textContent=scope==='page'&&target.backgroundImage?'背景素材已经应用到当前页；Reader 与发布包会使用同一资源。':'修改颜色、字号、留白和边框后，真实 Reader 会同步更新。';}}
function updateDesignControlValue(el,value){if(!el)return;const field=el.closest('.design-field');const output=field?.querySelector('output');if(output)output.textContent=String(value);const code=field?.querySelector('code');if(code)code.textContent=String(value);}
function scheduleDesignPreviewMutation(){if(state.designPreviewFrame)return;state.designPreviewFrame=requestAnimationFrame(()=>{state.designPreviewFrame=0;renderPreview();updateDesignPreviewSwatch();syncManagerPreviewIssue();scheduleReaderPreviewSync(280);});}
function openDesignDialog(scope='theme',target={}){if(!state.issue)return toast('请先选择期刊');state.designTarget=target;state.designScope=scope;if(scope==='block'&&!currentDesignBlock())state.designScope='page';state.designPresetPreviewId=currentPresetId()||DESIGN_PRESET_GROUPS.find(x=>x.id==='featured')?.ids?.[0]||'';if(!state.designAssetsLoaded)void loadDesignAssets();renderDesignControls();const heading=$('#designDialog h3');if(heading)heading.textContent={theme:'整体设计',page:'页面设计',block:'组件设计'}[state.designScope]||'可视化样式设计器';const dialog=$('#designDialog');if(!dialog.open)dialog.showModal();dialog.scrollTop=0;dialog.querySelector('form')?.scrollTo(0,0);}
function finalizeDesignMutation(group='design',{force=false,message='',interactive=false,sourceElement=null}={}){markDirty({preview:false,readerSync:false,historyGroup:group,forceHistory:force});if(interactive){updateDesignControlValue(sourceElement,sourceElement?.value);scheduleDesignPreviewMutation();}else{syncJsonFromPage();renderPreview();updateDesignPreviewSwatch();syncManagerPreviewIssue();scheduleReaderPreviewSync(0);renderDesignControls();}if(message)toast(message);}
function applyDesignChange(key,value,{interactive=false,sourceElement=null}={}){const scope=state.designScope,target=getDesignTarget(scope,{create:true});if(!target)return;rememberDesignHistory(`${scope}:${key}`);if(scope==='theme'){target[key]=value;state.designPresetPreviewId='';}else{if(value===''||value==null)delete target[key];else target[key]=value;}finalizeDesignMutation('design',{interactive,sourceElement});}
function applyDesignPreset(id){const preset=DESIGN_PRESETS.find(x=>x.id===id);if(!preset)return;rememberDesignHistory(`preset:${id}`,{force:true});ensureDesignRoot();state.issue.design.tokens=cloneData(preset.tokens);state.designPresetPreviewId=preset.id;finalizeDesignMutation('design-preset',{force:true,message:`已应用主题预设：${preset.name}`});}
async function copyDesignStyle(){const payload=currentDesignAssetPayload();state.designClipboard={scope:state.designScope,payload};const text=JSON.stringify(payload,null,2);try{await navigator.clipboard.writeText(text);toast('样式已复制');}catch{toast('样式已复制到设计器内部剪贴板');}}
async function pasteDesignStyle(){let payload=null;try{const text=await navigator.clipboard.readText();if(text?.trim())payload=JSON.parse(text);}catch{}if(!payload)payload=state.designClipboard?.payload;if(!payload)return toast('剪贴板中没有可用样式',2400);try{const clean=designPayload(state.designScope,payload);rememberDesignHistory(`paste:${state.designScope}`,{force:true});const target=getDesignTarget(state.designScope,{create:true});for(const key of Object.keys(target))delete target[key];Object.assign(target,clean);finalizeDesignMutation('design-paste',{force:true,message:'样式已粘贴'});}catch(e){toast(`无法粘贴：${e.message}`,3200);}}
function applyPageDesignBatch(){const source=cloneData(currentPage()?.design||{}),targets=[...state.selectedPages].filter(i=>Number.isInteger(i)&&state.issue.pages[i]);if(!targets.length)return toast('请先在页面列表选择目标页面');rememberDesignHistory('batch:pages',{force:true});let changed=0;for(const i of targets){const page=state.issue.pages[i],before=JSON.stringify(page.design||{});setDesignObject(page,source);if(before!==JSON.stringify(page.design||{}))changed++;}finalizeDesignMutation('design-batch-pages',{force:true,message:`已套用到 ${changed} 个页面`});}
function applyBlockDesignBatch(mode){const sourceBlock=currentDesignBlock();if(!sourceBlock)return;const source=cloneData(sourceBlock.design||{}),type=sourceBlock.type;rememberDesignHistory(`batch:${mode}:${type}`,{force:true});let changed=0;const pages=mode==='same-page'?[[state.page,currentPage()]]:(state.issue.pages||[]).map((p,i)=>[i,p]);for(const [pi,page] of pages)walkBlocks(page.blocks||[],(block,path)=>{if(block?.type!==type||currentTargetPathMatches({pageIndex:pi,...path}))return;const before=JSON.stringify(block.design||{});setDesignObject(block,source);if(before!==JSON.stringify(block.design||{}))changed++;},{pageIndex:pi});finalizeDesignMutation(`design-batch-${mode}`,{force:true,message:`已套用到 ${changed} 个同类型组件`});}
$('#designBtn').onclick=()=>setStudioEntry('design');
$('#designScopeTabs').addEventListener('click',e=>{const b=e.target.closest('[data-design-scope]');if(!b||b.disabled)return;state.designScope=b.dataset.designScope;renderDesignControls();});
$('#designPresetList').addEventListener('click',e=>{const apply=e.target.closest('[data-apply-design-preset]');if(apply)return applyDesignPreset(state.designPresetPreviewId);const b=e.target.closest('[data-design-preset]');if(!b)return;state.designPresetPreviewId=b.dataset.designPreset;renderDesignPresets();updateDesignPreviewSwatch();});
$('#saveDesignAsset').onclick=saveCurrentDesignAsset;$('#designLibraryList').addEventListener('click',e=>{const del=e.target.closest('[data-delete-design-asset]');if(del){deleteDesignAsset(del.dataset.deleteDesignAsset);return;}const b=e.target.closest('[data-design-asset]');if(b)applyDesignAsset(b.dataset.designAsset);});$('#designGovernanceList').addEventListener('click',e=>{const b=e.target.closest('[data-design-divergence]');if(b)locateDesignDivergence(b.dataset.designDivergence);});
$('#designControls').addEventListener('input',e=>{const el=e.target.closest('[data-design-key]');if(!el)return;const def=DESIGN_FIELDS[state.designScope].find(x=>x[0]===el.dataset.designKey);let v=el.value;if(def?.[2]==='range')v=Number(v);el.dataset.designAppliedValue=String(v);applyDesignChange(el.dataset.designKey,v,{interactive:true,sourceElement:el});});
$('#designControls').addEventListener('change',e=>{const el=e.target.closest('[data-design-key]');if(!el)return;const def=DESIGN_FIELDS[state.designScope].find(x=>x[0]===el.dataset.designKey);let v=el.value;if(def?.[2]==='range')v=Number(v);if(el.dataset.designAppliedValue!==String(v)){el.dataset.designAppliedValue=String(v);applyDesignChange(el.dataset.designKey,v,{interactive:true,sourceElement:el});}syncJsonFromPage();scheduleReaderPreviewSync(40);});
$('#designControls').addEventListener('click',e=>{if(e.target.closest('[data-page-background-clear]'))return clearPageBackground();const b=e.target.closest('[data-design-reset]');if(!b)return;const target=getDesignTarget();rememberDesignHistory(`reset:${state.designScope}:${b.dataset.designReset}`,{force:true});delete target[b.dataset.designReset];finalizeDesignMutation('design-reset',{force:true});});
$('#designReuseActions').addEventListener('click',e=>{const b=e.target.closest('[data-design-batch]');if(!b||b.disabled)return;if(b.dataset.designBatch==='pages')applyPageDesignBatch();else applyBlockDesignBatch(b.dataset.designBatch);});
$('#resetDesignScope').onclick=()=>{const scope=state.designScope,target=getDesignTarget(scope);rememberDesignHistory(`reset:${scope}`,{force:true});if(scope==='theme'){ensureDesignRoot();state.issue.design.tokens={...THEME_DEFAULTS};}else{for(const k of Object.keys(target))delete target[k];}finalizeDesignMutation('design-reset',{force:true,message:scope==='theme'?'已恢复默认 Theme':'已恢复上级继承'});};
$('#copyDesignJson').onclick=copyDesignStyle;$('#pasteDesignJson').onclick=pasteDesignStyle;$('#designUndoBtn').onclick=undoDesign;$('#designRedoBtn').onclick=redoDesign;

function finalGateTarget(){const ids=(state.issues||[]).map(x=>x.id).filter(x=>Number(x)>=3).sort();return ids.at(-1)||'003';}
function renderFinalGate(report,doctor=null){
  const gates=report?.gates||[];const ready=Number(report?.ready||0),total=Number(report?.total||6);const pending=total-ready;
  const hero=$('#finalGateHero');hero.className=`final-gate-hero ${pending?'pending':'ready'}`;
  $('#finalGateState').textContent=pending?`正式发布仍有 ${pending} 项待完成`:'六项正式发布门禁全部 READY';
  $('#finalGateSummary').textContent=`部署前 ${report?.preDeployReady||0}/${report?.preDeployTotal||5} · 总门禁 ${ready}/${total}。通过后若对应源稿、媒体或 release tree 改变，旧证据会自动失效。`;
  $('#finalGateScore').textContent=`${ready}/${total}`;
  $('#finalGateList').innerHTML=gates.map(g=>`<article class="final-gate-item ${g.status==='READY'?'ready':'pending'}"><span class="final-gate-icon">${g.status==='READY'?'✓':'!'}</span><div class="final-gate-copy"><b>${escText(g.label)}</b><p>${escText(g.detail||'')}</p>${g.status!=='READY'&&g.action?`<code>${escText(g.action)}</code>`:''}</div></article>`).join('')||'<div class="audit-empty">尚未读取门禁报告。</div>';
  const next=doctor?.recommendedNext||gates.find(g=>g.status!=='READY')||null;
  $('#finalNextLabel').textContent=next?.label||'全部门禁 READY';
  $('#finalNextDetail').textContent=next?.detail||'可以进入正式封版流程。';
  $('#finalNextCommand').textContent=next?.command||next?.action||'npm run final:seal -- --issue 003 --confirm';
}
async function loadFinalGate({doctor=false}={}){
  const id=finalGateTarget();
  try{
    const status=await api(`/api/final/status?issue=${encodeURIComponent(id)}`);
    let d=null;if(doctor)d=(await api(`/api/final/doctor?issue=${encodeURIComponent(id)}`)).report;
    renderFinalGate(status.report,d);return status.report;
  }catch(e){$('#finalGateState').textContent='门禁读取失败';$('#finalGateSummary').textContent=e.message;throw e}
}

function publicationMetricCard(label,value,detail=''){
  const numeric=typeof value==='number'; const tone=numeric?(PUBLICATION_CENTER?.metricTone?.(value)||'warn'):(String(value).toLowerCase()==='pass'?'pass':String(value).toLowerCase()==='fail'?'fail':'warn');
  return `<article class="publication-metric ${tone}"><span>${escText(label)}</span><b>${numeric?`${Math.round(value)}%`:escText(String(value||'待检查').toUpperCase())}</b><small>${escText(detail||'')}</small></article>`;
}
function publicationOutputCard(kind,output){const label=PUBLICATION_CENTER?.publicationOutputLabel?.(kind)||kind;const ready=Boolean(output?.url||output?.href||output?.path);const detail=kind==='web'?'交互式 H5 成刊':kind==='pdf'?'A4 出版打印版': 'Web + issue.json + 发布证据';return `<article class="publication-output-card ${ready?'ready':''}"><div><span>${ready?'✓':'○'}</span><div><b>${escText(label)}</b><small>${detail}</small></div></div>${ready?`<a href="${appUrl(output.url||output.href||'')}" target="_blank" rel="noopener">${kind==='archive'?'下载':'打开'}</a>`:'<em>尚未生成</em>'}</article>`;}
let publicationQrModulePromise=null;
async function renderPublicationQr(url){
  const box=$('#publicationShareQrBox'),status=$('#publicationQrStatus');if(!box)return;
  if(!url){box.innerHTML='<span>部署后生成二维码</span>';if(status)status.textContent='二维码仅编码公开阅读链接，不包含账号、密码或 API Key。';return;}
  if(state.publicationQrUrl===url&&box.querySelector('img'))return;state.publicationQrUrl=url;box.innerHTML='<span>正在生成…</span>';if(status)status.textContent='正在生成公开链接二维码…';
  try{
    publicationQrModulePromise ||= import('https://danielgjackson.github.io/qrcodejs/qrcode.mjs');
    const mod=await publicationQrModulePromise,qr=mod.default||mod,matrix=qr.generate(url,{errorCorrectionLevel:1}),uri=qr.render('svg-uri',matrix,{white:true,quiet:4});const img=document.createElement('img');img.alt='公开阅读链接二维码';img.src=uri;box.replaceChildren(img);if(status)status.textContent='扫码即可打开公开 Reader。';
  }catch(error){box.innerHTML='<span>二维码加载失败<br>请复制链接分享</span>';if(status)status.textContent='二维码组件暂时不可用，复制链接不受影响。';console.warn('[PublicationQR]',error);}
}
function renderPublicationCompletion(){
  const panel=$('#publicationCompletionPanel'),issue=state.issue,st=state.publicationStatus;if(!panel||!issue)return;
  const outputs=st?.outputs||{},release=outputs.release,deploy=st?.publicDeployment||outputs.public,shown=Boolean(release||deploy||issue.status==='published');panel.classList.toggle('hidden',!shown);if(!shown)return;
  const changed=state.dirty||Boolean(st?.sourceFingerprint&&st.sourceFingerprint!==state.sourceFingerprint)||deploy?.sourceMatchesCurrent===false;
  const verified=Boolean(deploy?.verified&&deploy?.verification?.ok&&deploy?.sourceMatchesCurrent===true&&!changed),url=deploy?.url||st?.publicShare?.url||'';
  $('#publicationCompletionTitle').textContent=verified?'当前版本已上线':changed?'当前修改尚未上线':deploy?'线上版本待核对':release?'发布包已生成':'尚无发布回执';
  $('#publicationCompletionState').textContent=verified?`当前制作源对应最近一次成功部署，部署时间：${fmtTime(deploy.deployedAt)}。可打开链接查看。`:changed?'保存仅更新制作源。请点击“发布并上线”生成并部署当前修改；下方链接仍指向已有线上版本。':deploy?'已有部署记录，但无法确认它对应当前制作源。重新发布后会记录版本对应关系。':release?'发布包已生成，尚未确认上线。':'期刊标记为已发布，但没有发布回执；请执行“发布并上线”。';
  const badge=$('#publicationCompletionBadge');badge.textContent=verified?'已上线':changed?'待发布':deploy?'待核对':'待部署';badge.className=`publication-completion-badge ${verified?'ready':''}`;
  const input=$('#publicationShareUrl'),deployButton=$('#publicationDeployBtn'),copyButton=$('#publicationCopyLinkBtn'),shareButton=$('#publicationNativeShareBtn'),openButton=$('#publicationOpenLinkBtn');if(input)input.value=url;deployButton.disabled=Boolean(state.publicationBusy)||!st?.publicShare?.configured||verified;deployButton.textContent=verified?'已部署并校验':state.publicationBusy==='部署公开网站'?'部署中…':'部署到公开网站';const disabled=!url;for(const b of [copyButton,shareButton,openButton])if(b)b.disabled=disabled;renderPublicationQr(verified?url:'');
}
function renderPublicationCenter(){
  const st=state.publicationStatus,issue=state.issue;
  if(!issue)return;
  $('#publicationTitle').textContent=issue.label||issue.id;
  $('#publicationSubtitle').textContent=issue.subtitle||'发布中心 2.0';
  if(!st){$('#publicationReadiness').textContent='正在读取发布证据…';$('#publicationMetrics').innerHTML='';return;}
  const m=st.metrics||{},dev=st.devices||{};
  $('#publicationReadiness').textContent=PUBLICATION_CENTER?.publicationReadinessLabel?.(st)||(st.canPublish?'可以发布':'尚未就绪');
  $('#publicationReadiness').className=st.canPublish?'ready':'blocked';
  $('#publicationReason').textContent=st.reason||'';
  $('#publicationMetrics').innerHTML=[
    publicationMetricCard('内容完整度',m.content,'元数据、标题与页面内容'),
    publicationMetricCard('页面健康',m.pageHealth,'页面结构与版面约束'),
    publicationMetricCard('媒体完整',m.media,'引用媒体是否可用'),
    publicationMetricCard('移动端',PUBLICATION_CENTER?.deviceLabel?.(dev.mobile)||dev.mobile,dev.checkedAt?'已执行真实设备回归':'需运行发布前检查'),
    publicationMetricCard('桌面端',PUBLICATION_CENTER?.deviceLabel?.(dev.desktop)||dev.desktop,dev.checkedAt?'已执行真实设备回归':'需运行发布前检查'),
    publicationMetricCard('无障碍',m.accessibility,'图片 ALT / 视频说明 / 页面标题'),
    publicationMetricCard('链接',String(m.links?.status||'pending').toUpperCase(),`${m.links?.invalid||0} 个无效链接`),
    publicationMetricCard('朗读音频',m.narration?.complete?100:(m.narration?.expected?Math.round((m.narration.found/m.narration.expected)*100):100),m.narration?.label||'未启用')
  ].join('');
  const out=st.outputs||{};
  $('#publicationOutputs').innerHTML=['web','pdf','archive'].map(k=>publicationOutputCard(k,out[k])).join('');
  const outputSection=$('#publicationOutputs')?.closest('.publication-section');
  let capabilities=$('#publicationExportCapabilities');
  if(!capabilities&&outputSection){capabilities=document.createElement('div');capabilities.id='publicationExportCapabilities';capabilities.className='publication-capabilities';capabilities.setAttribute('aria-live','polite');outputSection.append(capabilities);}
  if(capabilities){const pdf=st.exportCapabilities?.pdf,archive=st.exportCapabilities?.archive;capabilities.innerHTML=`<div class="publication-capability ${pdf?.available?'available':'missing'}"><b>PDF</b><span>${pdf?.available?'Chromium 已就绪':'缺少 Chromium'}</span>${(pdf?.advice||[]).map(x=>`<small>${escText(x)}</small>`).join('')}</div><div class="publication-capability available"><b>ZIP</b><span>Node 内置归档已就绪</span><small>${escText(archive?.advice?.[0]||'不依赖系统 zip 命令。')}</small></div>`;}
  let guide=$('#publicationCompletionGuide');
  if(!guide&&outputSection){guide=document.createElement('section');guide.id='publicationCompletionGuide';guide.className='publication-page-guide publication-section';outputSection.after(guide);}
  if(guide){const pending=st.completion?.pendingPages||[];guide.innerHTML=`<div class="publication-section-head"><div><span class="eyebrow">COMPLETE ISSUE</span><strong>逐页完成引导</strong></div><span>${st.completion?.completePages||0} / ${st.completion?.pageCount||0} 页已完成</span></div>${pending.length?`<div class="publication-guide-list">${pending.slice(0,24).map(item=>`<button type="button" data-publication-go-page="${item.page}"><b>第 ${item.page} 页</b><span>${escText(item.title)}</span><small>硬性阻断 ${item.blockers} 项${item.warnings?` · 提示 ${item.warnings} 项`:''}</small></button>`).join('')}</div>`:'<p class="publication-clean">✓ 所有页面已通过页面级严格检查</p>'}`;}
  let actionAdvice=$('#publicationActionAdvice');
  if(!actionAdvice&&outputSection){actionAdvice=document.createElement('section');actionAdvice.id='publicationActionAdvice';actionAdvice.className='publication-action-advice publication-section';actionAdvice.setAttribute('aria-live','polite');outputSection.after(actionAdvice);}
  if(actionAdvice){const last=state.publicationLastError;actionAdvice.classList.toggle('hidden',!last);actionAdvice.innerHTML=last?`<div class="publication-section-head"><div><span class="eyebrow">ACTION REQUIRED</span><strong>${escText(last.label||'发布操作未完成')}</strong></div><span class="publication-action-code">${escText(last.code||'请按建议处理')}</span></div><p>${escText(last.summary||'请按下列建议修复后重试。')}</p>${(last.advice||[]).map(x=>`<div class="publication-advice-line">• ${escText(x)}</div>`).join('')}`:'';}
  $('#publicationPreflightState').textContent=st.forceRelease?(st.lastPreflight?.at?`直接发布 · ${fmtTime(st.lastPreflight.at)}`:'直接发布 · 检查仅作提示'):st.lastPreflight?.at?`${st.lastPreflight.ok?'PASS':'FAIL'} · ${fmtTime(st.lastPreflight.at)}`:'尚未执行发布检查';
  const auditLink=$('#publicationAuditLink');
  if(auditLink)auditLink.href=appUrl(`/reports/v3-release-audit-${encodeURIComponent(issue.id)}.html`);
  const releaseable=Boolean(st.forceRelease)||isReleaseableIssueStatus(issue.status);
  const reviewButton=$('#publicationMarkReadyBtn');
  if(reviewButton){reviewButton.hidden=releaseable;reviewButton.disabled=Boolean(state.publicationBusy)||state.saving;}
  if($('#publicationReviewTitle'))$('#publicationReviewTitle').textContent=releaseable?'内容核对已确认':'先确认本期内容';
  if($('#publicationReviewText'))$('#publicationReviewText').textContent=releaseable?'当前为'+statusLabel(issue.status)+'。发布前仍须通过内容、资源和版面检查。':'当前为'+statusLabel(issue.status)+'。请核对稿件与署名、替换模板占位内容，再设为待发布；此操作会保存制作稿。';

  const releaseButton=$('#publicationReleaseBtn');
  const releaseSection=releaseButton?.closest('.publication-release');
  const releaseHeading=releaseSection?.querySelector('strong');
  const releaseDescription=releaseSection?.querySelector('p');
  if(releaseHeading)releaseHeading.textContent='发布并上线';
  if(releaseDescription)releaseDescription.textContent='点击主按钮即可自动保存、检查、生成发布包，并在已配置公开网站时自动部署。遇到问题只显示当前期刊摘要，不再弹出整段命令日志。';
  releaseButton.disabled=!releaseable||!st.canPublish||Boolean(state.publicationBusy);
  releaseButton.textContent=state.publicationBusy?'处理中…':'发布并上线';
  releaseButton.setAttribute('aria-busy',state.publicationBusy?'true':'false');
  releaseButton.title=!releaseable?'请先点击上方“内容已核对，设为待发布”':st.forceRelease?'直接发布：检查项仅作提示，不阻断上线':'自动保存、刷新发布检查、正式发布并部署公开网站';
  const quickButton=$('#publicationQuickPublishBtn');
  if(quickButton){quickButton.disabled=!releaseable||!st.canPublish||Boolean(state.publicationBusy);quickButton.textContent=state.publicationBusy?'处理中…':!st.canPublish?'先处理硬性阻断':'发布并上线';quickButton.setAttribute('aria-busy',state.publicationBusy?'true':'false');}
  $('#publicationBusy').textContent=state.publicationBusy||'';
  const hard=st.forceRelease?[]:[...(st.audit?.findings||[]).filter(x=>x.severity==='blocker'||x.severity==='error'),...(Number(m.links?.invalid||0)>0?[{title:'不安全或格式错误链接',message:`${m.links.invalid} 个链接必须先修复`,severity:'blocker'}]:[])];
  const advisory=(st.audit?.findings||[]).filter(x=>!hard.includes(x));
  const advisoryText=Array.isArray(st.advisories)?st.advisories:[];
  const issueEyebrow=$('#publicationIssuesEyebrow'),issueTitle=$('#publicationIssuesTitle');
  if(issueEyebrow)issueEyebrow.textContent=st.forceRelease?'DIRECT RELEASE · ADVISORIES':hard.length?'CHECKS · ADVISORIES':'ADVISORIES';
  if(issueTitle)issueTitle.textContent=st.forceRelease?'直接发布模式：所有检查项仅作提示':'检查与提示项';
  const rows=[
    ...hard.map(x=>publicationFindingRow(x,'hard',st.audit?.findings||[])),
    ...advisory.slice(0,8).map(x=>publicationFindingRow(x,'advisory',st.audit?.findings||[])),
    ...advisoryText.slice(0,4).map(x=>`<li class="publication-check-advisory"><b>提示 · 发布流程</b><span>${escText(x)}</span></li>`)
  ];
  $('#publicationBlockers').innerHTML=rows.length?rows.join(''):'<li class="publication-clean">✓ 没有硬性阻断或提示项</li>';renderPublicationCompletion();renderPublicationWizard();
}
function publicationFindingRow(f,kind,findings){
  const index=findings.indexOf(f),canLocate=index>=0&&(f.location?.page||f.location?.kind==='metadata');
  return `<li class="publication-check-${kind}"><b>${kind==='hard'?'需处理':'提示'} · ${escText(f.title||f.code||'检查项')}</b><span>${escText(f.message||'')}</span>${f.fix?`<small>建议：${escText(f.fix)}</small>`:''}${canLocate?`<button type="button" class="publication-check-locate" data-publication-finding="${index}">去修改${f.location.page?' · 第 '+Number(f.location.page)+' 页':''}</button>`:''}</li>`;
}

async function loadPublicationWorkflow({refresh=true}={}){
  if(!state.issue)return null;
  const id=String(state.issue.id);
  try{
    const wf=await api(`/api/issues/${encodeURIComponent(id)}/publication/workflow?refresh=${refresh?'1':'0'}`);
    if(state.issue?.id===id){state.publicationWorkflow=wf;renderPublicationWizard();}
    return wf;
  }catch(error){
    state.publicationWorkflow={issue:id,error:error.message||String(error),nextAction:'status'};
    renderPublicationWizard();
    throw error;
  }
}
function publicationWizardStep(id,label,ready,detail,current=false){
  const tone=ready?'pass':current?'current':'pending';
  return `<article class="publication-wizard-step ${tone}" data-publication-wizard-step="${id}"><span>${ready?'✓':current?'→':'○'}</span><div><b>${escText(label)}</b><small>${escText(detail||'')}</small></div></article>`;
}
function renderPublicationWizard(){
  const box=$('#publicationWizardSteps'),stateEl=$('#publicationWizardState'),title=$('#publicationWizardNextTitle'),detail=$('#publicationWizardNextDetail'),button=$('#publicationWizardNextBtn');
  if(!box||!state.issue)return;
  const guide=$('#publicationWizardSection .publication-section-head small');if(guide)guide.textContent='保存 → 发布检查 → 生成输出 → 正式发布 / 上线';
  const guideDetail=$('#publicationWizardNextDetail');if(guideDetail)guideDetail.textContent='内部校审与交接签收保留为记录，不再阻断发布。';
  const wf=state.publicationWorkflow||{},dirty=Boolean(state.dirty),review=wf.review||{},signoff=wf.signoff||{},gate=wf.gate||{},build=wf.build||{},release=wf.release||{},deployment=wf.deployment||{};
  let next=dirty?'save':String(wf.nextAction||'status');
  if(!dirty&&next==='save')next='preflight';
  const steps=[
    ['save','保存制作源',!dirty,dirty?'当前仍有未保存修改':'制作源已保存'],
    ['preflight','发布检查',Boolean(gate.ready),gate.ready?'自动发布检查已通过':'尚未完成自动发布检查'],
    ['build','生成输出',Boolean(build.ready),build.ready?'Web Reader 已生成':'尚未生成 Web Reader'],
    ['release','正式发布 / 上线',Boolean(release.completed&&(!deployment.configured||deployment.verified)),release.completed?(deployment.configured?(deployment.verified?'已发布并完成公开校验':'已发布，公开部署待完成'):'正式发布包已生成'):'尚未正式发布']
  ];
  const currentId=next==='deploy'||next==='done'?'release':next;
  box.innerHTML=steps.map(([id,label,ready,text])=>publicationWizardStep(id,label,ready,text,id===currentId&&!ready)).join('');
  const labels={save:['先保存当前修改','保存后自动更新当前制作源。'],review:['运行发布检查','校审记录仅作内部参考，不再阻断发布。'],signoff:['运行发布检查','交接签收仅作内部记录，不再阻断发布。'],preflight:['运行发布检查','检查内容、媒体、链接、无障碍和朗读等正式发布条件。'],build:['生成 Web Reader','发布检查通过后生成真实 Web Reader 构建。'],release:['正式发布并上线','发布检查和输出构建完成，可以进入正式发布。'],deploy:['完成公开部署','正式发布包已生成；继续部署并校验公开阅读地址。'],done:['发布闭环已完成','公开版本已校验。需要恢复时可使用下方发布快照回滚。'],status:['刷新发布状态','重新读取服务器发布证据后判断下一步。']};
  const copy=labels[next]||labels.status;
  if(stateEl)stateEl.textContent=wf.generatedAt?`状态更新 ${fmtTime(wf.generatedAt)}`:'发布流程状态';
  if(title)title.textContent=copy[0];if(detail)detail.textContent=copy[1];
  if(button){button.textContent=next==='done'?'打开公开版本':'继续下一步';button.disabled=Boolean(state.publicationBusy);button.dataset.wizardAction=next;}
}
async function runPublicationWizardNext(){
  if(!requireIssue()||state.publicationBusy)return;
  if(state.dirty){const ok=await saveIssue({silent:true});if(!ok)return;await loadPublicationWorkflow({refresh:true});return renderPublicationWizard();}
  let wf;
  try{wf=await loadPublicationWorkflow({refresh:true});}catch(error){return toast(`读取发布流程失败：${error.message}`,3600);}
  const next=String(wf?.nextAction||'status');
  if(next==='review'||next==='signoff')return runPublicationPreflightUi();
  if(next==='preflight'){await runPublicationPreflightUi();await loadPublicationWorkflow({refresh:true});return;}
  if(next==='build'){await runPublicationAction('preview','构建 Web Reader');await loadPublicationWorkflow({refresh:true});return;}
  if(next==='release'){await formalPublicationUi();await loadPublicationWorkflow({refresh:true}).catch(()=>{});return;}
  if(next==='deploy'){await deployPublicationUi();await loadPublicationWorkflow({refresh:true}).catch(()=>{});return;}
  if(next==='done'){const url=state.publicationStatus?.publicShare?.url||state.publicationStatus?.publicDeployment?.url;if(url)window.open(url,'_blank','noopener');else toast('发布闭环已完成；当前环境没有配置公开阅读地址');return;}
  await Promise.all([loadPublicationStatus({refresh:true}),loadPublicationWorkflow({refresh:true})]);
}

async function loadPublicationStatus({refresh=true}={}){if(!state.issue)return null;const id=String(state.issue.id);if(!refresh&&state.publicationStatus?.issue===id){renderPublicationCenter();return state.publicationStatus;}const pending=state.publicationStatusPromise;if(pending?.issueId===id&&pending.refresh===refresh)return pending.promise;const promise=api(`/api/issues/${encodeURIComponent(id)}/publication/status?refresh=${refresh?'1':'0'}`).then(st=>{if(state.issue?.id===id){state.publicationStatus=st;renderPublicationCenter();}return st;});state.publicationStatusPromise={issueId:id,refresh,promise};try{return await promise;}finally{if(state.publicationStatusPromise?.promise===promise)state.publicationStatusPromise=null;}}
async function openPublicationCenter(){if(!requireIssue())return;$('#publicationCenterDialog').showModal();state.publicationBusy='';renderPublicationCenter();try{await Promise.all([loadPublicationStatus({refresh:true}),loadPublicationSnapshots(),loadPublicationWorkflow({refresh:true})]);}catch(e){toast(`读取发布中心失败：${e.message}`,3600);}}
function publicationResultSummary(result,label='发布'){
  const status=result?.status||{},reason=String(status.reason||'').trim();
  const findings=[...(status.audit?.findings||[])].filter(x=>x?.severity==='blocker'||x?.severity==='error');
  const failedSteps=(result?.steps||[]).filter(x=>x&&!x.ok&&!x.skipped);
  const details=[reason,...findings.slice(0,2).map(x=>x.message||x.title||x.code),...failedSteps.slice(0,2).map(x=>`${x.label||'检查'}：${x.output||'未通过'}`)].map(x=>String(x||'').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').replace(/\s+/g,' ').trim()).filter(Boolean);
  return (details.join('；')||`${label}未完成`).slice(0,520);
}
function publicationErrorSummary(error,label='发布'){
  if(error?.publicationSummary)return String(error.publicationSummary).slice(0,520);
  if(error?.result)return publicationResultSummary(error.result,label);
  const raw=String(error?.message||error||'').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').trim();
  const current=String(state.issue?.id||'');
  const lines=raw.split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const scoped=current?lines.filter(x=>x.includes(current)):[];
  const useful=(scoped.length?scoped:lines).filter(x=>/(block|阻断|失败|未就绪|缺失|不可用|invalid|score=|blocked|门禁|audit)/i.test(x));
  const advice=error?.job?.errorDetails?.advice||error?.result?.errorDetails?.advice||[];
  return ([...useful.slice(-3),...advice.slice(0,2)].join('；')||`${label}失败`).slice(0,520);
}
async function waitForBackgroundJob(start,label){if(!start?.async)return start;const statusUrl=start.statusUrl||`/api/jobs/${encodeURIComponent(start.jobId||'')}`;for(let attempt=0;attempt<240;attempt++){const job=await api(statusUrl);const progress=job.progress?.stage||'处理中';if(state.publicationBusy){state.publicationBusy=`${label}：${progress}`;renderPublicationCenter();}if(job.status==='succeeded')return job.result||{};if(job.status==='failed'){const error=new Error(job.error||`${label}失败`);error.job=job;throw error;}await new Promise(resolve=>setTimeout(resolve,500));}throw new Error(`${label}超时，请稍后查看后台任务状态`);}
async function runPublicationAction(action,label,{silent=false}={}){if(!requireIssue()||state.publicationBusy)return;state.publicationBusy=label;state.publicationLastError=null;renderPublicationCenter();try{const start=await api(`/api/issues/${encodeURIComponent(state.issue.id)}/publication/${action}`,{method:'POST',body:JSON.stringify({async:true}),allowError:true}),r=await waitForBackgroundJob(start,label);if(r.error)throw Object.assign(new Error(String(r.error)),{result:r,publicationSummary:String(r.error)});if(r.status)state.publicationStatus=r.status;if(r.ok===false&&action!=='deploy'){const error=new Error(publicationResultSummary(r,label));error.result=r;error.publicationSummary=error.message;throw error;}state.publicationStatus=r.status||await loadPublicationStatus({refresh:false});state.publicationLastError=null;renderPublicationCenter();if(!silent)toast(action==='deploy'&&r.ok===false?`${label}已执行，但在线校验未通过`:`${label}完成`);return r;}catch(e){e.publicationSummary ||= publicationErrorSummary(e,label);const advice=e?.job?.errorDetails?.advice||e?.result?.errorDetails?.advice||[];state.publicationLastError={label,summary:e.publicationSummary,code:e?.job?.errorDetails?.code||e?.result?.errorDetails?.code||e?.code||'',advice:Array.isArray(advice)?advice:[]};e.publicationNotified=true;if(!silent)toast(`${label}：${e.publicationSummary}`,4200);throw e;}finally{state.publicationBusy='';renderPublicationCenter();}}
async function runPublicationPreflightUi(){const r=await runPublicationAction('preflight','发布前检查');if(r?.status)state.publicationStatus=r.status;renderPublicationCenter();}
async function preparePublicationUi(options={}){
  const silent=Boolean(options?.silent);
  if(!state.issue||state.publicationBusy)return;
  if(state.dirty){toast('准备发布前正在保存当前修改…',2600);if(!await saveIssue({silent:true}))return;}
  let generated=0,baselined=false;
  try{
    state.publicationBusy='准备发布：读取资源…';renderPublicationCenter();await loadMediaAssets();
    const tts=state.mediaAssets?.tts,pages=state.issue.pages||[];
    if(tts?.expected){
      const missing=new Set(tts.missingPages||[]),indices=tts.stale?pages.map((_,i)=>i):pages.map((_,i)=>i).filter(i=>missing.has(i+1));
      if(indices.length){
        state.publicationBusy=tts.stale?'准备发布：重新生成过期 TTS…':'准备发布：补齐缺失 TTS…';renderPublicationCenter();
        const payload=indices.map(i=>({page:i+1,text:narrationPageText(pages[i])})).filter(x=>x.text);
        const start=await api(`/api/issues/${encodeURIComponent(state.issue.id)}/tts/generate`,{method:'POST',body:JSON.stringify({pages:payload,rate:state.issue.features?.narration?.rate||1,async:true}),allowError:true}),r=await waitForBackgroundJob(start,'TTS 生成');
        if(!r.ok||r.error)throw new Error(r.error||'TTS 生成失败');
        generated=r.generated?.length||0;if(r.failed?.length)throw new Error(`TTS 生成失败：第 ${r.failed.map(x=>x.page).join('、')} 页`);
        if(r.issue){state.issue=cloneData(r.issue);state.originalIssue=cloneData(r.issue);state.dirty=false;state.auditStale=Boolean(state.audit);state.sourceStatus=r.source||state.sourceStatus;state.sourceFingerprint=String(r.source?.fingerprint||state.sourceFingerprint||'');renderSourceStatus();resetHistory();}await loadMediaAssets();
      }
      const nextTts=state.mediaAssets?.tts;
      if(nextTts?.expected&&nextTts.found===nextTts.expected&&(generated||!nextTts.baselinedAt)){
        state.publicationBusy='准备发布：更新 TTS 基线…';renderPublicationCenter();const x=await api(`/api/issues/${encodeURIComponent(state.issue.id)}/tts/baseline`,{method:'POST',body:'{}'});
        state.issue.features={...(state.issue.features||{}),narration:x.narration};state.originalIssue=cloneData(state.issue);state.dirty=false;state.sourceStatus=x.source||state.sourceStatus;state.sourceFingerprint=String(x.source?.fingerprint||state.sourceFingerprint||'');renderSourceStatus();resetHistory();baselined=true;await loadMediaAssets();
      }
    }
    state.publicationBusy='准备发布：运行硬性门禁与提示审计…';renderPublicationCenter();state.publicationBusy='';const result=await runPublicationAction('preflight','发布准备检查',{silent});if(result?.status)state.publicationStatus=result.status;renderPublicationCenter();
    if(!silent)toast(`发布准备完成${generated?`，生成 TTS ${generated} 页`:''}${baselined?'，已更新 TTS 基线':''}`,3600);
    return true;
  }catch(e){if(!silent)toast(`发布准备失败：${publicationErrorSummary(e,'发布准备')}`,4800);if(silent)throw e;return false;}
  finally{state.publicationBusy='';renderPublicationCenter();}
}
async function createPublicationSnapshotUi(){if(!state.issue)return;try{const snap=await api(`/api/issues/${encodeURIComponent(state.issue.id)}/snapshot`,{method:'POST',body:JSON.stringify({label:'publication-center-manual'})});toast(`已建立发布快照 ${snap.id}`);await loadPublicationSnapshots();}catch(e){toast(`建立快照失败：${e.message}`,3600)}}
async function loadPublicationSnapshots(){if(!state.issue)return;try{const data=await api(`/api/issues/${encodeURIComponent(state.issue.id)}/snapshots`);state.publicationSnapshots=Array.isArray(data)?data:(data.snapshots||[]);renderPublicationSnapshots();}catch{state.publicationSnapshots=[];renderPublicationSnapshots();}}
function renderPublicationSnapshots(){const el=$('#publicationSnapshots');if(!el)return;const rows=(state.publicationSnapshots||[]).slice(0,8);el.innerHTML=rows.length?rows.map(x=>`<div class="publication-snapshot"><div><b>${escText(x.label||x.id)}</b><small>${fmtTime(x.createdAt||x.at||'')}</small></div><button type="button" data-publication-rollback="${escText(x.id)}">回滚</button></div>`).join(''):'<div class="publication-empty">暂无快照</div>';}
async function rollbackPublicationSnapshot(id){if(!id||!state.issue)return;if(!confirm('确认回滚到这个快照？当前未保存修改将丢失。'))return;try{await api(`/api/issues/${encodeURIComponent(state.issue.id)}/rollback`,{method:'POST',body:JSON.stringify({snapshot:id})});toast('回滚完成，正在重新载入');await openIssue(state.issue.id);await loadPublicationStatus({refresh:true});await loadPublicationSnapshots();}catch(e){toast(`回滚失败：${e.message}`,4200)}}
async function formalPublicationUi(){
  if(!requireIssue()||state.publicationBusy)return;
  if(!state.publicationStatus?.forceRelease&&!isReleaseableIssueStatus(state.issue.status))return toast('当前状态不允许发布，请先在“期刊信息”中修正状态',3600);
  if(state.dirty&&(!await saveIssue({silent:true})))return;
  try{
    // Fold the old preparation step into the one-click flow. This repairs
    // stale/missing TTS evidence before the strict release gate runs.
    await preparePublicationUi({silent:true});
    // Keep the audit result produced by preparation for the advisory report;
    // findings are visible but never lock a direct release.
    if(!state.publicationStatus?.issue)await loadPublicationStatus({refresh:false});
    if(!state.publicationStatus?.canPublish)await runPublicationPreflightUi();
    if(!state.publicationStatus?.canPublish){renderPublicationCenter();return toast(`发布未完成：${publicationResultSummary({status:state.publicationStatus},'发布检查')}`,5200);}
  }catch(e){toast(`发布检查：${publicationErrorSummary(e,'发布检查')}`,4800);return;}
  if(!confirm(`确认发布并上线 ${state.issue?.label||state.issue?.id}？系统会自动保存、建立快照、生成发布包，并在已配置公开网站时自动部署。`))return;
  try{
    const r=await runPublicationAction('release','正式发布');
    if(r?.issue){state.issue=r.issue;state.originalIssue=cloneData(r.issue);state.dirty=false;state.sourceStatus=r.source||state.sourceStatus;state.sourceFingerprint=String(r.source?.fingerprint||state.sourceFingerprint||'');resetHistory();renderIssue({preserveHistory:true,preserveDraft:true});}
    if(r?.status)state.publicationStatus=r.status;renderPublicationCenter();
    const configured=Boolean(r?.status?.publicShare?.configured||state.publicationStatus?.publicShare?.configured);
    if(configured){
      try{await runPublicationAction('deploy','部署公开网站');}
      catch(e){renderPublicationCenter();return toast(`已正式发布，但上线失败：${publicationErrorSummary(e,'部署')}`,5200);}
      const deployed=state.publicationStatus?.publicDeployment?.verified&&state.publicationStatus?.publicDeployment?.sourceMatchesCurrent===true;
      return toast(deployed?'已发布并上线，可复制或分享公开链接':'已发布，公开网站正在校验，请稍后刷新状态',4200);
    }
    toast('已正式发布；服务器尚未配置公开网站，因此暂未生成分享链接',4800);
  }catch(e){if(!e?.publicationNotified)toast(`正式发布：${publicationErrorSummary(e,'正式发布')}`,5200);}
}
async function deployPublicationUi(){
  if(!requireIssue()||state.publicationBusy)return;
  if(!state.publicationStatus?.publicShare?.configured)return toast('服务器尚未配置公开网站目录与基地址',3600);
  const st=state.publicationStatus;
  if(state.dirty||st.sourceFingerprint!==state.sourceFingerprint||st.publicDeployment&&st.publicDeployment.sourceMatchesCurrent!==true)return formalPublicationUi();
  if(!confirm(`确认将 ${state.issue?.label||state.issue.id} 部署到公开网站并生成分享链接？`))return;
  try{await runPublicationAction('deploy','部署公开网站');}catch{}
}
async function copyPublicationLink(){const value=$('#publicationShareUrl')?.value?.trim();if(!value)return toast('请先部署到公开网站',2600);try{await navigator.clipboard.writeText(value);toast('公开链接已复制，可粘贴到 QQ 或微信');}catch{const input=$('#publicationShareUrl');input?.focus();input?.select();try{document.execCommand('copy');toast('公开链接已复制');}catch{toast(value,3600);}}}
async function sharePublicationLink(){const value=$('#publicationShareUrl')?.value?.trim();if(!value)return toast('请先部署到公开网站',2600);try{if(typeof navigator.share==='function'){await navigator.share({title:`${state.issue?.label||'电子期刊'} · 公开阅读`,text:'打开公开 Reader 阅读本期电子期刊',url:value});}else{await copyPublicationLink();}}catch(error){if(error?.name!=='AbortError')await copyPublicationLink();}}
function openPublicationLink(){const value=$('#publicationShareUrl')?.value?.trim();if(value)window.open(value,'_blank','noopener');else toast('请先部署到公开网站',2600);}
function ensurePublicationQuickAction(){
  const hero=$('.publication-hero-actions');if(!hero||$('#publicationQuickPublishBtn'))return;
  const button=document.createElement('button');button.type='button';button.id='publicationQuickPublishBtn';button.className='primary';button.textContent='发布并上线';button.title='自动保存、检查、发布并部署公开网站';const preflight=$('#publicationPreflightBtn');if(preflight){preflight.classList.remove('primary');preflight.textContent='检查详情';preflight.title='只运行发布前检查，不发布';}hero.insertBefore(button,preflight||hero.lastElementChild);
}
ensurePublicationQuickAction();
$('#finalGateBtn').onclick=()=>setStudioEntry('publish');
$('#publicationRefreshBtn').onclick=()=>loadPublicationStatus({refresh:true});
$('#publicationPrepareBtn')?.addEventListener('click',preparePublicationUi);
$('#publicationPreflightBtn').onclick=runPublicationPreflightUi;
$('#publicationPreviewBtn').onclick=()=>runPublicationAction('preview','生成预览');
$('#publicationPdfBtn').onclick=()=>runPublicationAction('pdf','导出 PDF');
$('#publicationArchiveBtn').onclick=()=>runPublicationAction('archive','生成归档');
$('#publicationSnapshotBtn').onclick=createPublicationSnapshotUi;
$('#publicationReleaseBtn').onclick=formalPublicationUi;
$('#publicationWizardNextBtn')?.addEventListener('click',runPublicationWizardNext);
$('#publicationWizardRollbackBtn')?.addEventListener('click',()=>$('#publicationRollbackSection')?.scrollIntoView({behavior:'smooth',block:'start'}));
$('#publicationQuickPublishBtn')?.addEventListener('click',formalPublicationUi);
$('#publicationDeployBtn').onclick=deployPublicationUi;
$('#publicationCopyLinkBtn').onclick=copyPublicationLink;
$('#publicationNativeShareBtn').onclick=sharePublicationLink;
$('#publicationOpenLinkBtn').onclick=openPublicationLink;
$('#publicationSnapshots').addEventListener('click',e=>{const b=e.target.closest('[data-publication-rollback]');if(b)rollbackPublicationSnapshot(b.dataset.publicationRollback);});
document.addEventListener('click',e=>{const b=e.target.closest('[data-publication-go-page]');if(!b)return;const page=Number(b.dataset.publicationGoPage);if(!Number.isInteger(page)||page<1)return;$('#publicationCenterDialog')?.close();goToPage(page-1);});

function initDialogDismissals(){
  document.querySelectorAll('dialog').forEach(dialog=>{
    const form=dialog.querySelector(':scope > form'),head=form?.querySelector(':scope > .dialog-head');
    if(form&&head&&!dialog.classList.contains('unified-dialog')){
      const footer=form.querySelector(':scope > .dialog-actions'),body=document.createElement('div');body.className='unified-dialog-body';
      for(const child of [...form.children])if(child!==head&&child!==footer)body.append(child);
      head.after(body);dialog.classList.add('unified-dialog');
    }
    dialog.querySelectorAll('button[value="cancel"],button[data-dialog-close]').forEach(btn=>{
      btn.type='button';btn.formNoValidate=true;if(btn.dataset.dialogDismissBound==='1')return;btn.dataset.dialogDismissBound='1';btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(dialog.open)dialog.close('cancel');});
    });
    if(dialog.dataset.backdropDismissBound==='1')return;dialog.dataset.backdropDismissBound='1';let backdrop=false;dialog.addEventListener('pointerdown',e=>{backdrop=e.target===dialog;});dialog.addEventListener('click',e=>{if(backdrop&&e.target===dialog&&dialog.open)dialog.close('cancel');backdrop=false;});
  });
}
initDialogDismissals();
for(const id of ['mediaDialog','designDialog','publicationCenterDialog']){
  $('#'+id)?.addEventListener('close',()=>{
    if(state.studioEntry!=='content'){
      state.studioEntry='content';
      updateStudioEntryUi();
    }
  });
}
bindClickFeedback();
function selectedNewStartMode(){return document.querySelector('input[name="newStartMode"]:checked')?.value||'clone';}
function syncNewStartModeUi(){const mode=selectedNewStartMode();$('#newCloneField')?.classList.toggle('hidden',mode!=='clone');$('#newTemplateField')?.classList.toggle('hidden',mode!=='template');$('#newImportField')?.classList.toggle('hidden',mode!=='import');}
function openNewIssueDialog(){ $('#newSubtitle').value=''; $('#newLabel').value=''; renderCloneOptions(); const radio=document.querySelector('input[name="newStartMode"][value="clone"]');if(radio)radio.checked=true;syncNewStartModeUi();$('#newDialog').showModal(); }
$('#newIssue').onclick = openNewIssueDialog;
$('#studioBuildBtn')?.addEventListener('click',openNewIssueDialog);
document.querySelectorAll('input[name="newStartMode"]').forEach(r=>r.addEventListener('change',syncNewStartModeUi));
$('#newForm').addEventListener('submit',async e => { if (e.submitter?.value === 'cancel') return; e.preventDefault(); const subtitle = $('#newSubtitle').value.trim(); if (!subtitle) return; const startMode=selectedNewStartMode(); const cloneFrom=startMode==='clone'?($('#newCloneFrom').value||''):''; const templateId=startMode==='template'?($('#newWholeTemplate').value||'comprehensive'):''; if(startMode==='clone'&&!cloneFrom)return toast('请选择要复制的上一期',2600); try { const x = await api('/api/issues',{method:'POST',body:JSON.stringify({subtitle,label:$('#newLabel').value.trim(),startMode,cloneFrom,templateId})}); $('#newDialog').close(); toast(`已创建 ${x.issue.id} · ${startMode==='clone'?'复制上期':startMode==='import'?'导入稿件':'整刊模板'}`); await loadIssues(x.issue.id); if(startMode==='import')openImportDialog('file'); else if(startMode==='template')setStudioEntry('design'); else setStudioEntry('content'); } catch(err) { toast(err.message,3200); } });
document.addEventListener('click',e=>{for(const menu of document.querySelectorAll('.action-menu[open]'))if(!menu.contains(e.target))menu.removeAttribute('open');});
document.addEventListener('keydown',e=>{const mod=e.metaKey||e.ctrlKey;if(!mod)return;const editable=e.target.closest?.('input,textarea,select,[contenteditable="true"]');if(e.key.toLowerCase()==='s'){e.preventDefault();saveFromToolbar();return;}if(editable)return;if(e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redoHistory():undoHistory();return;}if(e.key.toLowerCase()==='y'){e.preventDefault();redoHistory();}});
window.addEventListener('visibilitychange',()=>{if(document.hidden&&state.dirty)saveDraftNow();});window.addEventListener('pagehide',()=>closePeerChannel());
window.addEventListener('pagehide',()=>{if(!state.issue||!state.dirty)return;try{fetch(appUrl(`/api/issues/${encodeURIComponent(state.issue.id)}/draft`),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({issue:state.issue}),keepalive:true});}catch{}});
window.addEventListener('beforeunload',e => { if (state.dirty) { e.preventDefault(); e.returnValue=''; } });
window.__V3_STUDIO__ = { state, runtimeVersionLabel, loadRuntimeVersion, commandBus, dispatchStudioCommand, ensureIssueIdentity, createStableId, renderAudit, openIssue, runAudit, setEditorMode, addBlock, locateFinding, renderBlockList, renderPreview, generateToc, newBlankPage, insertPageAfterCurrent, insertBlankPage, openPageTemplateDialog, openMediaDialog, refreshBuiltPreview, openArticleLibrary, setMetaExpanded, updateMetaSummary, setPageMetaExpanded, updatePageMetaSummary, summarizeIssueDiff, openSaveDiff, undoHistory, redoHistory, discardUnsaved, saveDraftNow, filteredPageIndices, workspaceFilteredPageIndices, deletePageIndices, batchMovePages, openImageAdjust, loadMediaAssets, pushReaderPreview, applyReaderPreviewDevice, fitReaderPreview, toggleReaderPreviewExpanded, setSidebarCollapsed, setPagesPanelCollapsed, renderImportPreview, updateImportSectionSemantic, importSectionSemanticOptions, insertImportedPages, resolveImportWriteMode, likelyDefaultIssueSkeleton, setWorkspaceSplit, setWorkspaceLayoutPreset, runFastTrackImport, loadFinalGate, renderFinalGate, openDesignDialog, renderDesignControls, loadDesignAssets, renderDesignLibrary, analyzeDesignConsistency, renderDesignGovernance, applyDesignAsset, locateDesignDivergence, openLayoutLab, analyzeLayoutSuggestions, applySmartLayoutRecommendation, pageLayoutProfile, buildLayoutFromPreset, layoutBlueprintFromPage, buildFromLayoutBlueprint, loadLayoutAssets, applyLayoutAsset, openEditorialPlan, loadEditorialPlan, saveEditorialPlan, analyzeEditorialPlan, editorialEntriesFromIssue, editorialMetrics, editorialPageProductionProfile, editorialProductionForEntry, editorialBoardAnalysis, renderEditorialBoard, locateEditorialProductionPage, applyEditorialStatusSuggestions, generateEditorialMissingPages, addEditorialPlanEntry, openReviewWorkspace, loadReviewWorkspace, saveReviewWorkspace, renderReviewWorkspace, reviewWorkspaceAnalysis, addManualReviewItem, importAuditReviewFinding, runReviewAudit, reviewAuditKey, locateReviewItem, openReviewHandoffs, loadReviewHandoffs, saveReviewHandoffs, renderReviewHandoffs, createReviewHandoff, reviewHandoffAnalysis, reviewHandoffEntryAnalysis, reviewHandoffSummaryText, reviewHandoffDiffReviewState, openReviewHandoffDiff, renderReviewHandoffDiff, markReviewHandoffDiffReviewed, reviewIssueFingerprint, updateReviewHandoffStatus, goToPage, navigateWorkspacePage, openWorkspacePageDialog, workspaceRouteUrl, updateWorkspaceToolbar, setBlockSelection, setBlockSelectionByIds, selectAllTopLevelBlocks, clearSelectedBlocks, toggleBlockSelection, validSelectedBlockIndices, validSelectedBlockIds, renderContextInspector, setContextInspectorOpen, setReaderZoom, nudgeReaderZoom, resolveReaderPageIndex, applyQuickParagraphStyle, applyQuickSpacing, applyQuickDesign, moveSelectedBlocks, duplicateSelectedBlocks, deleteSelectedBlocks, setCanvasMode, syncCanvasSelectionToReader, initPeerChannel, broadcastPeer, applyRemoteSavedIssue, visualHealthInfo, balanceCurrentPageSpacing, updateManagerDashboard, managerBlockNodes, syncReaderPreviewPage, initDialogDismissals, setMobileStudioMode, renderMobileStudio, openMobileSheet, closeMobileSheet, mobileEditBlockInReader, loadPublicationWorkflow, renderPublicationWizard, runPublicationWizardNext };
restoreWorkspacePreferences(); updateWorkspaceToolbar(); setMobileStudioMode();
loadIssues().then(async()=>{if(WORKSPACE_MODE&&!state.issue&&state.issues[0])await openIssue(state.issues[0].id);window.__V3_STUDIO_READY__ = true;}).catch(e => { window.__V3_STUDIO_READY__ = false; toast(e.message,3000); });

$('#importPreviewList')?.addEventListener('change',e=>{const el=e.target.closest('[data-import-section-semantic]');if(!el)return;updateImportSectionSemantic(el.dataset.resultIndex,el.dataset.sectionIndex,el.value);});
$('#skeletonMode')?.addEventListener('change',()=>{if(state.importResults.length)renderImportPreview();});

// Normalize cross-window identifiers before the legacy listeners run.  Some
// browsers serialize ids coming from the Reader as a different primitive
// type; strict equality in an older listener would otherwise discard a valid
// page acknowledgement and keep the retry loop alive forever.
window.addEventListener('message',e=>{
  const data=e.data||{},frames=[$('#builtPreviewFrame'),managerPreviewFrame()].filter(Boolean);
  if(data.source!=='v3-reader'||!frames.some(frame=>e.source===frame.contentWindow))return;
  const expected=String(state.issue?.id||'');
  if(!expected||String(data.issueId||'')!==expected)return;
  if(data.issueId!==state.issue.id)data.issueId=state.issue.id;
  if(data.pageId!=null){
    const page=(state.issue?.pages||[]).find(item=>String(item?.id||'')===String(data.pageId));
    if(page?.id&&data.pageId!==page.id)data.pageId=page.id;
  }
},true);
