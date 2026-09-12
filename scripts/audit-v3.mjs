import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  V3_VERSION, MiB, collectReferencedAssets, exists, fileMeta, forceReleaseEnabled, humanBytes, listFilesRecursive, narrationPageDigests, narrationSourceDigest,
  normalizeIssueId, parseArgs, readJson, root, stripAssetsPrefix, writeJson
} from './lib-v3-production.mjs';

const args = parseArgs();
const targetId = normalizeIssueId(args.issue || args.id || '');
const strict = Boolean(args.strict);
const force = forceReleaseEnabled();
const quiet = Boolean(args.quiet);
const reportDir = path.join(root, String(args.output || 'reports'));
const thresholds = { video: 30 * MiB, music: 8 * MiB, image: 2 * MiB, tts: 2 * MiB, total: 100 * MiB };
const publishableStatuses = new Set(['ready','published']);
const placeholderRe = /(请填写|待补充|待完善|待编辑|TODO|TBD|示例内容|lorem ipsum)/i;

const catalog = {
  ID_DIR_MISMATCH:['期号与目录不一致','metadata','请保持 issues/目录名 与 issue.id 完全一致。'],
  STATUS_NOT_READY:['状态未进入发布阶段','metadata','确认内容和资源后，将状态改为 ready，再执行发布前检查。'],
  DRAFT_STATUS:['仍处于草稿状态','metadata','制作完成后再改为 ready；草稿阶段可以继续预览。'],
  LOW_PAGE_COUNT:['页面数量偏少','structure','确认栏目和尾页是否完整。'],
  PUBLISHER_MISSING:['缺少发布单位','metadata','填写发布单位，便于尾页、脚手架和归档信息保持一致。'],
  SUBTITLE_MISSING:['缺少本期主题','metadata','填写简洁明确的本期主题。'],
  ASSET_SOURCE_MISSING:['缺少资源目录配置','media','设置 assetSource，例如 issues/003/assets 或 3/assets。'],
  ASSET_SOURCE_NOT_FOUND:['资源目录不可用','media','确认资源目录已复制到完整仓库，或修正 assetSource。'],
  ASSET_SOURCE_ESCAPE:['资源目录越出项目边界','media','assetSource 必须指向项目目录内部，不得使用越级路径。'],
  ASSET_MISSING:['媒体文件缺失','media','将对应文件放入资源目录，或修正内容块中的资源路径。'],
  ASSET_EMPTY:['媒体文件为空','media','重新导出或替换该媒体文件。'],
  ASSET_SUSPICIOUSLY_SMALL:['媒体文件异常小','media','实际播放/打开该文件，确认不是占位文件或损坏文件。'],
  ASSET_LARGE:['媒体文件偏大','media','压缩媒体或采用更适合网页的编码，降低加载等待。'],
  TTS_MISSING_PAGES:['TTS 页面音频不完整','tts','补齐列出的 page-XX.mp3，或关闭本期的预生成朗读配置。'],
  TTS_INCOMPLETE:['TTS 数量不匹配','tts','重新同步 TTS 清单并补齐缺失音频。'],
  TTS_SOURCE_STALE:['朗读音频可能与当前页面不一致','tts','页面内容或顺序变更后，请重新生成对应 TTS，再在媒体库中确认“朗读已与当前页面同步”。'],
  UNREFERENCED_ASSETS:['存在未引用媒体','media','确认是否为废弃文件；无用资源建议移出发布目录。'],
  TOTAL_MEDIA_LARGE:['本期媒体总量偏大','media','优先压缩视频，其次检查图片与音频，尽量控制在 100 MB 内。'],
  COVER_MISSING:['缺少封面页','structure','增加 type=cover 的封面，并放在第 1 页。'],
  COVER_NOT_FIRST:['封面不在第一页','structure','将 cover 页面移动到第 1 页，避免桌面书本首跨页异常。'],
  MULTIPLE_COVERS:['存在多个封面页','structure','每期只保留一个 cover 页面。'],
  CLOSING_MISSING:['缺少尾页','structure','增加 closing 尾页，放置寄语和制作单位。'],
  CLOSING_NOT_LAST:['尾页不在最后','structure','将 closing 页面移动到最后一页。'],
  PAGE_TITLE_MISSING:['页面缺少主标题','content','填写该页 title。'],
  PAGE_NAV_MISSING:['页面缺少导航标题','content','填写 navTitle，确保目录和页面列表可识别。'],
  PAGE_TITLE_LONG:['页面主标题偏长','layout','建议缩短主标题；长标题在手机和双页模式中容易挤压正文空间。'],
  PAGE_NAV_LONG:['导航标题偏长','layout','缩短导航标题，详细说明可放在页内主标题。'],
  PAGE_KICKER_LONG:['页内眉题偏长','layout','眉题尽量保持短句，避免移动端换行占用过多高度。'],
  EMPTY_BLOCKS:['页面没有内容块','content','至少增加一个正文、图片、卡片或其他有效内容块。'],
  PAGE_EFFECTIVELY_EMPTY:['页面没有有效内容','content','检查是否误留了空内容块；如确实需要留白页，请使用封面、目录或尾页类型并补充页面说明。'],
  PLACEHOLDER_CONTENT:['发现占位内容','content','将“请填写 / TODO / 待补充”等占位文字替换为正式内容。'],
  PARAGRAPH_TOO_LONG:['单个文本块过长','layout','拆分为 2–3 个段落或卡片，降低手机页内长滚动负担。'],
  IMAGE_ALT_MISSING:['图片缺少替代说明','accessibility','为图片填写 alt，便于无障碍阅读和资源识别。'],
  VIDEO_CAPTION_MISSING:['视频缺少说明','accessibility','为视频填写 caption，说明视频主题。'],
  VIDEO_POSTER_MISSING:['视频缺少封面图','media','在媒体工作台为视频自动生成 poster，或从图片库选择一张封面。'],
  ARTICLE_REFERENCE_MISSING:['文章链接引用不存在','content','修正 articleLink 的 articleId，或在 articles 中补充对应文章。'],
  ARTICLE_NOT_PLACED:['文章尚未纳入页面','content','将该文章添加为“文章链接”内容块，并在发布前确认页码与显示标题。'],
  TOC_PAGE_INVALID:['目录跳转页码无效','structure','将目录项 page 修正为 1 到本期总页数之间的数字。'],
  DUPLICATE_NAV_TITLE:['存在重复导航标题','content','必要时为重复页面增加区分词，方便目录定位。'],
  EXTERNAL_LINK_INSECURE:['文章链接不是 HTTPS','security','优先使用 HTTPS 原文链接。'],
};

function finding(severity, code, message, extra={}) {
  const [title, category, defaultFix] = catalog[code] || [code,'general','根据提示检查对应配置。'];
  return { severity, code, title, category, message, fix: extra.fix || defaultFix, ...extra };
}
function add(list, severity, code, message, extra={}) { list.push(finding(severity, code, message, extra)); }
function readiness(audit) { return audit.blockers.length ? 'blocked' : audit.warnings.length ? 'warning' : 'ready'; }
function esc(s='') { return String(s).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function pushProblem(strictNow, blockers, warnings, code, message, extra={}) { add(strictNow ? blockers : warnings, strictNow ? 'blocker' : 'warning', code, message, extra); }
function compactPages(pages) {
  const nums=[...new Set(pages)].sort((a,b)=>a-b); if(!nums.length)return '';
  const chunks=[]; let start=nums[0],prev=nums[0];
  for(const n of nums.slice(1)){if(n===prev+1){prev=n;continue}chunks.push(start===prev?`${start}`:`${start}-${prev}`);start=prev=n}
  chunks.push(start===prev?`${start}`:`${start}-${prev}`); return chunks.join('、');
}
function textValues(value, prefix='') {
  const rows=[];
  if(typeof value==='string') rows.push({path:prefix,text:value});
  else if(Array.isArray(value)) value.forEach((v,i)=>rows.push(...textValues(v,`${prefix}[${i}]`)));
  else if(value&&typeof value==='object') for(const [k,v] of Object.entries(value)) rows.push(...textValues(v,prefix?`${prefix}.${k}`:k));
  return rows;
}
const meaningfulTextKeys=new Set(['text','body','title','label','caption','summary','content','quote','kicker','name','value']);
function hasMeaningfulBlockContent(block){
  if(!block||typeof block!=='object')return false;
  const type=String(block.type||'');
  if(type==='container')return (block.columns||[]).some(col=>(col?.blocks||[]).some(hasMeaningfulBlockContent));
  if(['image','video'].includes(type))return Boolean(String(block.src||'').trim());
  if(type==='articleLink')return Boolean(String(block.articleId||block.article||block.id||block.title||'').trim());
  if(type==='toc')return Array.isArray(block.items)&&block.items.some(item=>String(item?.title||'').trim());
  return textValues(block).some(({path,text})=>{
    const key=String(path||'').split('.').at(-1)?.replace(/\[\d+\]$/,'');
    return meaningfulTextKeys.has(key)&&String(text||'').trim().length>0;
  });
}
function walkBlocks(blocks, visitor, path=[]){
  for(const [index,block] of (Array.isArray(blocks)?blocks:[]).entries()){
    const next=[...path,index]; visitor(block,next);
    if(block?.type==='container')for(const [columnIndex,column] of (block.columns||[]).entries())walkBlocks(column?.blocks||[],visitor,[...next,'columns',columnIndex,'blocks']);
  }
}
function calcScore(blockers,warnings){return Math.max(0,Math.min(100,100-blockers.length*20-warnings.length*4))}
function categoriesFor(audit){const out={};for(const x of [...audit.blockers,...audit.warnings,...audit.notes]){out[x.category] ||= {blockers:0,warnings:0,notes:0};out[x.category][x.severity==='blocker'?'blockers':x.severity==='warning'?'warnings':'notes']++}return out}
function safeSourceDir(assetSource='') {
  if(!assetSource)return {safe:false,dir:path.join(root,'__missing__')};
  const dir=path.resolve(root,assetSource);const safe=dir===root||dir.startsWith(root+path.sep);return {safe,dir};
}

async function auditOne(dirName) {
  const issueFile=path.join(root,'issues',dirName,'issue.json');
  const issue=await readJson(issueFile);
  const blockers=[],warnings=[],notes=[];
  const pageCount=Array.isArray(issue.pages)?issue.pages.length:0;
  if(issue.engine!=='v3')return {id:issue.id||dirName,label:issue.label||dirName,engine:issue.engine,status:issue.status,skipped:true,readiness:'legacy',score:null,blockers,warnings,notes,categories:{}};
  // Normal audits are advisory. Only an explicit --strict run promotes
  // findings to hard blockers; a published/ready issue must not become
  // uneditable merely because a prompt-level warning is still open.
  const strictNow=Boolean(strict);
  const metaLoc=(field)=>({location:{kind:'metadata',field}});
  const pageLoc=(page,field='blocks')=>({location:{kind:'page',page,field}});
  if(issue.id!==dirName)add(blockers,'blocker','ID_DIR_MISMATCH',`目录名 ${dirName} 与 issue.id=${issue.id} 不一致`,metaLoc('id'));
  if(strict&&!publishableStatuses.has(issue.status))add(blockers,'blocker','STATUS_NOT_READY',`严格发布检查要求 status=ready 或 published，当前为 ${issue.status||'unknown'}`,metaLoc('status'));
  else if(issue.status==='draft')add(warnings,'warning','DRAFT_STATUS','当前 status=draft，尚未标记为 ready',metaLoc('status'));
  if(pageCount<4)add(warnings,'warning','LOW_PAGE_COUNT',`当前仅 ${pageCount} 页，请确认是否为完整期刊`,{location:{kind:'page',page:1,field:'blocks'}});
  if(!String(issue.publisher||'').trim())add(warnings,'warning','PUBLISHER_MISSING','建议设置 publisher，便于脚手架和尾页统一使用',metaLoc('publisher'));
  if(!String(issue.subtitle||'').trim())pushProblem(strictNow,blockers,warnings,'SUBTITLE_MISSING','本期主题 subtitle 为空',metaLoc('subtitle'));
  if(issue.revision?.pending)add(notes,'note','UNPUBLISHED_REVISION','当前已发布期刊存在尚未重新发布的 V3 修订',{title:'存在未发布修订',category:'workflow',location:{kind:'metadata',field:'status'},fix:'完成修改后运行发布前检查，并按发布流程生成新的发布包。'});

  const covers=(issue.pages||[]).map((p,i)=>p.type==='cover'?i+1:null).filter(Boolean);
  const closings=(issue.pages||[]).map((p,i)=>p.type==='closing'?i+1:null).filter(Boolean);
  if(!covers.length)add(blockers,'blocker','COVER_MISSING','本期没有 type=cover 的封面页',{location:{kind:'page',page:1,field:'type'}});
  if(covers.length>1)add(blockers,'blocker','MULTIPLE_COVERS',`发现 ${covers.length} 个封面页：${covers.join('、')}`,{location:{kind:'page',page:covers[1],field:'type'}});
  if(covers.length&&covers[0]!==1)add(warnings,'warning','COVER_NOT_FIRST',`封面当前位于第 ${covers[0]} 页`,{location:{kind:'page',page:covers[0],field:'type'}});
  if(!closings.length)add(warnings,'warning','CLOSING_MISSING','本期没有 type=closing 的尾页',{location:{kind:'page',page:pageCount||1,field:'type'}});
  if(closings.length&&closings.at(-1)!==pageCount)add(warnings,'warning','CLOSING_NOT_LAST',`尾页当前位于第 ${closings.at(-1)} 页，总页数 ${pageCount}`,{location:{kind:'page',page:closings.at(-1),field:'type'}});
  const navSeen=new Map();
  const referencedArticleIds=new Set();
  for(const [i,p] of (issue.pages||[]).entries()){
    const n=i+1;const loc=(field)=>({location:{kind:'page',page:n,field}});
    const title=String(p.title||'').trim(),nav=String(p.navTitle||'').trim(),kicker=String(p.kicker||'').trim();
    if(!title)add(blockers,'blocker','PAGE_TITLE_MISSING',`第 ${n} 页缺少 title`,loc('title'));
    if(!nav)add(warnings,'warning','PAGE_NAV_MISSING',`第 ${n} 页缺少 navTitle`,loc('navTitle'));
    if(title&&placeholderRe.test(title))pushProblem(strictNow,blockers,warnings,'PLACEHOLDER_CONTENT',`第 ${n} 页主标题仍含占位文字：“${title.slice(0,80)}”`,loc('title'));
    if(nav&&placeholderRe.test(nav))pushProblem(strictNow,blockers,warnings,'PLACEHOLDER_CONTENT',`第 ${n} 页导航标题仍含占位文字：“${nav.slice(0,80)}”`,loc('navTitle'));
    if(kicker&&placeholderRe.test(kicker))pushProblem(strictNow,blockers,warnings,'PLACEHOLDER_CONTENT',`第 ${n} 页眉题仍含占位文字：“${kicker.slice(0,80)}”`,loc('kicker'));
    if(title.length>34)add(warnings,'warning','PAGE_TITLE_LONG',`第 ${n} 页主标题 ${title.length} 字：${title.slice(0,48)}`,loc('title'));
    if(nav.length>42)add(warnings,'warning','PAGE_NAV_LONG',`第 ${n} 页导航标题 ${nav.length} 字`,loc('navTitle'));
    if(kicker.length>42)add(warnings,'warning','PAGE_KICKER_LONG',`第 ${n} 页眉题 ${kicker.length} 字`,loc('kicker'));
    if(nav){if(navSeen.has(nav))add(warnings,'warning','DUPLICATE_NAV_TITLE',`第 ${n} 页与第 ${navSeen.get(nav)} 页导航标题相同：“${nav}”`,loc('navTitle'));else navSeen.set(nav,n)}
    const pageDesign=p.design||{};if(Number(pageDesign.contentWidth)>0&&Number(pageDesign.contentWidth)<70)add(warnings,'warning','DESIGN_CONTENT_NARROW',`第 ${n} 页内容宽度仅 ${pageDesign.contentWidth}% ，移动端可能过窄`,{...loc('blocks'),fix:'建议内容宽度保持在 75%–100%，手机端优先使用 100%。'});if(Number(pageDesign.padding)>=0&&Number(pageDesign.padding)<2)add(warnings,'warning','DESIGN_PAGE_PADDING_LOW',`第 ${n} 页页内留白偏小`,{...loc('blocks'),fix:'建议至少保留约 3%–5% 页内留白。'});
    const blocks=Array.isArray(p.blocks)?p.blocks:[];
    if(!blocks.length)add(warnings,'warning','EMPTY_BLOCKS',`第 ${n} 页没有内容块`,loc('blocks'));
    else if(!blocks.some(hasMeaningfulBlockContent)&&!['cover','toc','closing'].includes(p.type))add(warnings,'warning','PAGE_EFFECTIVELY_EMPTY',`第 ${n} 页有 ${blocks.length} 个内容块，但没有检测到有效文字、图片、视频或链接内容`,loc('blocks'));
    if(blocks.length>80)add(blockers,'blocker','BLOCK_LIMIT_EXCEEDED',`第 ${n} 页有 ${blocks.length} 个内容块，超过制作中心上限 80 个`,loc('blocks'));
    else if(blocks.length>12){const splitAfter=Math.max(1,Math.ceil(blocks.length/2));add(warnings,'warning','BLOCK_DENSITY_HIGH',`第 ${n} 页有 ${blocks.length} 个内容块，编辑和移动端阅读密度可能偏高；建议在第 ${splitAfter} 个内容块后拆到续页`,{...loc('blocks'),suggestedSplitAfter:splitAfter,fix:`建议在第 ${splitAfter} 个内容块后拆分到续页，或合并同类信息；单页优先控制在 4–10 个内容块。`});}
    for(const [bi,b] of blocks.entries()){
      if(!b||typeof b!=='object'){add(blockers,'blocker','BLOCK_INVALID',`第 ${n} 页第 ${bi+1} 个内容块不是有效对象`,{...loc('blocks'),blockIndex:bi});continue}
      const knownBlocks=new Set(['paragraph','heading','quote','chips','cardline','casePair','toc','articleLink','video','image','table','coverMeta','coverSections','blessing','producer','cards','container','textFlow','pullQuote','sidebar','sectionHeading']);
      if(!knownBlocks.has(b.type))add(blockers,'blocker','BLOCK_TYPE_UNSUPPORTED',`第 ${n} 页第 ${bi+1} 个内容块类型 ${b.type||'(空)'} 不受支持`,{...loc('blocks'),blockIndex:bi,fix:'在可视化编辑器中替换为受支持的内容块，或在高级 JSON 中修正 type。'});
      const arrays=[];const collectArrays=(v,path='')=>{if(Array.isArray(v)){arrays.push({path,count:v.length});v.forEach((x,i)=>collectArrays(x,`${path}[${i}]`))}else if(v&&typeof v==='object')for(const [k,x] of Object.entries(v))collectArrays(x,path?`${path}.${k}`:k)};collectArrays(b);
      const tooMany=arrays.find(x=>x.count>40);if(tooMany)add(blockers,'blocker','BLOCK_ARRAY_LIMIT',`第 ${n} 页第 ${bi+1} 个内容块的 ${tooMany.path||'数组'} 有 ${tooMany.count} 项，超过 40 项上限`,{...loc('blocks'),blockIndex:bi,fix:'拆分内容块或减少条目数量。'});
      const strings=textValues(b);
      const placeholder=strings.find(x=>placeholderRe.test(x.text));
      if(placeholder){pushProblem(strictNow,blockers,warnings,'PLACEHOLDER_CONTENT',`第 ${n} 页第 ${bi+1} 个内容块包含占位文字：“${placeholder.text.slice(0,80)}”`,{...loc('blocks'),blockIndex:bi});}
      for(const x of strings){if(['text','body','left.text','right.text'].some(k=>x.path.endsWith(k))&&x.text.length>700){add(warnings,'warning','PARAGRAPH_TOO_LONG',`第 ${n} 页存在 ${x.text.length} 字的单个文本块`,{...loc('blocks'),blockIndex:bi});break}}
      const bd=b.design||{};if(Number(bd.fontSize)>0&&Number(bd.fontSize)<12)add(warnings,'warning','DESIGN_FONT_TOO_SMALL',`第 ${n} 页第 ${bi+1} 个内容块字号 ${bd.fontSize}px 偏小`,{...loc('blocks'),blockIndex:bi,fix:'面向移动端和老年读者建议正文不低于 12–14px。'});if(Number(bd.width)>0&&Number(bd.width)<45)add(warnings,'warning','DESIGN_BLOCK_TOO_NARROW',`第 ${n} 页第 ${bi+1} 个内容块宽度仅 ${bd.width}%`,{...loc('blocks'),blockIndex:bi,fix:'窄组件适合标签/数字，不建议承载长正文。'});
      if(b.type==='container'){
        const layouts=new Set(['single','two-equal','two-40-60','two-60-40','three-equal','media-left','media-right']);
        if(!layouts.has(b.layout||'two-equal'))add(blockers,'blocker','CONTAINER_LAYOUT_INVALID',`第 ${n} 页布局容器使用未知布局 ${b.layout||'(空)'}`,{...loc('blocks'),blockIndex:bi});
        if(!Array.isArray(b.columns)||b.columns.length<1||b.columns.length>3)add(blockers,'blocker','CONTAINER_COLUMNS_INVALID',`第 ${n} 页布局容器必须包含 1–3 列`,{...loc('blocks'),blockIndex:bi});
        if(b.mobile==='preserve'&&(b.columns||[]).length>1)add(warnings,'warning','CONTAINER_MOBILE_PRESERVE',`第 ${n} 页布局容器选择“手机保持分栏”，窄屏可读性可能下降`,{...loc('blocks'),blockIndex:bi,fix:'优先使用“手机自动堆叠”，仅在短文本/图标型内容中保持分栏。'});
        for(const [ci,col] of (b.columns||[]).entries())for(const [cbi,child] of (col.blocks||[]).entries()){if(child?.type==='image'&&!String(child.alt||'').trim())add(warnings,'warning','IMAGE_ALT_MISSING',`第 ${n} 页布局容器第 ${ci+1} 列图片缺少 alt`,{...loc('blocks'),blockIndex:bi});if(child?.type==='video'&&!String(child.caption||'').trim())add(warnings,'warning','VIDEO_CAPTION_MISSING',`第 ${n} 页布局容器第 ${ci+1} 列视频缺少 caption`,{...loc('blocks'),blockIndex:bi});}
      }
      if(b.type==='image'&&!String(b.alt||'').trim())add(warnings,'warning','IMAGE_ALT_MISSING',`第 ${n} 页图片 ${b.src||''} 缺少 alt`,{...loc('blocks'),blockIndex:bi});
      if(b.type==='video'&&!String(b.caption||'').trim())add(warnings,'warning','VIDEO_CAPTION_MISSING',`第 ${n} 页视频缺少 caption`,{...loc('blocks'),blockIndex:bi});
      if(b.type==='video'&&String(b.src||'').trim()&&!String(b.poster||'').trim())add(notes,'note','VIDEO_POSTER_MISSING',`第 ${n} 页视频尚未设置 poster 封面`,{...loc('blocks'),blockIndex:bi});
      if(b.type==='toc')for(const item of b.items||[]){const dest=Number(item.page);if(!Number.isInteger(dest)||dest<1||dest>pageCount)add(blockers,'blocker','TOC_PAGE_INVALID',`第 ${n} 页目录项“${item.title||''}”跳转到无效页码 ${item.page}`,{...loc('blocks'),blockIndex:bi})}
    }
    walkBlocks(blocks,(b,path)=>{
      if(b?.type!=='articleLink')return;
      const id=String(b.articleId||b.article||b.id||'').trim();
      if(id)referencedArticleIds.add(id);
      if(!id||!issue.articles?.[id])add(blockers,'blocker','ARTICLE_REFERENCE_MISSING',`第 ${n} 页 articleLink 引用 ${id||'(空)'}，但 articles 中不存在`,{...loc('blocks'),blockIndex:path[0],blockPath:path.join('.')});
    });
  }
  for(const [id,a] of Object.entries(issue.articles||{})){
    if(!referencedArticleIds.has(id))add(warnings,'warning','ARTICLE_NOT_PLACED',`文章“${a?.title||id}”（${id}）已在文章库中定义，但没有找到对应的文章链接内容块`,{location:{kind:'metadata',field:'articles',articleId:id}});
    if(a?.url&&/^http:\/\//i.test(a.url))add(warnings,'warning','EXTERNAL_LINK_INSECURE',`文章 ${id} 使用 HTTP 链接：${a.url}`,{location:{kind:'metadata',field:'articles'}})
  }

  const refs=collectReferencedAssets(issue);
  const sourceCheck=safeSourceDir(issue.assetSource||'');const sourceDir=sourceCheck.dir;
  const sourceExists=Boolean(issue.assetSource)&&sourceCheck.safe&&await exists(sourceDir);
  if(!issue.assetSource)add(blockers,'blocker','ASSET_SOURCE_MISSING','缺少 assetSource',metaLoc('assetSource'));
  else if(!sourceCheck.safe)add(blockers,'blocker','ASSET_SOURCE_ESCAPE',`assetSource 越出项目目录：${issue.assetSource}`,metaLoc('assetSource'));
  else if(!sourceExists){const msg=`资源目录不存在于当前工作区：${issue.assetSource}`;pushProblem(strictNow,blockers,warnings,'ASSET_SOURCE_NOT_FOUND',strictNow?msg:`${msg}（overlay 环境可暂时忽略）`,{location:{kind:'metadata',field:'assetSource',path:issue.assetSource}})}

  const assets=[];const missingTtsPages=[];let totalBytes=0,missingCount=0;
  for(const refItem of refs){const file=path.join(sourceDir,refItem.path);const assetLoc={location:{kind:'asset',page:refItem.page||null,path:refItem.path}};
    if(!sourceExists){missingCount++;assets.push({...refItem,exists:false,bytes:null});continue}
    if(!(await exists(file))){missingCount++;assets.push({...refItem,exists:false,bytes:null});if(refItem.kind==='tts'&&refItem.page)missingTtsPages.push(refItem.page);else pushProblem(strictNow,blockers,warnings,'ASSET_MISSING',`缺少 ${refItem.kind}：${refItem.path}${refItem.page?`（页 ${refItem.page}）`:''}`,{...refItem,...assetLoc});continue}
    const meta=await fileMeta(file);totalBytes+=meta.bytes;const threshold=thresholds[refItem.kind];const oversized=Boolean(threshold&&meta.bytes>threshold);assets.push({...refItem,exists:true,bytes:meta.bytes,size:humanBytes(meta.bytes),oversized});
    if(meta.bytes===0)pushProblem(strictNow,blockers,warnings,'ASSET_EMPTY',`${refItem.kind} 文件为空：${refItem.path}`,{...assetLoc});
    else if(['tts','music','video'].includes(refItem.kind)&&meta.bytes<4096)add(warnings,'warning','ASSET_SUSPICIOUSLY_SMALL',`${refItem.kind} 文件异常小：${refItem.path}（${humanBytes(meta.bytes)}）`,{...assetLoc});
    if(oversized)add(warnings,'warning','ASSET_LARGE',`${refItem.kind} 资源偏大：${refItem.path}（${humanBytes(meta.bytes)}）`,{...assetLoc});
  }
  const narrationExpected=issue.features?.narration?.pattern?pageCount:0;const narrationFound=assets.filter(a=>a.kind==='tts'&&a.exists).length;
  if(missingTtsPages.length){const msg=`TTS 缺失 ${missingTtsPages.length}/${narrationExpected} 页：${compactPages(missingTtsPages)}`;pushProblem(strictNow,blockers,warnings,'TTS_MISSING_PAGES',msg,{pages:missingTtsPages,location:{kind:'asset',page:missingTtsPages[0],path:`assets/tts/page-${String(missingTtsPages[0]).padStart(2,'0')}.mp3`}})}
  if(narrationExpected&&narrationFound!==narrationExpected&&!missingTtsPages.length&&sourceExists)pushProblem(strictNow,blockers,warnings,'TTS_INCOMPLETE',`TTS 不完整：应有 ${narrationExpected} 个页面音频，当前找到 ${narrationFound} 个`,{location:{kind:'asset',path:'assets/tts/'}});
  const storedPageDigests=issue.features?.narration?.pageDigests; const currentPageDigests=narrationPageDigests(issue);
  const storedSourceDigest=issue.features?.narration?.sourceDigest; const currentSourceDigest=narrationSourceDigest(issue);
  const stalePages=[]; if(Array.isArray(storedPageDigests)){const max=Math.max(storedPageDigests.length,currentPageDigests.length);for(let i=0;i<max;i++)if(storedPageDigests[i]!==currentPageDigests[i])stalePages.push(i+1)}
  if(narrationExpected&&storedSourceDigest&&storedSourceDigest!==currentSourceDigest){pushProblem(strictNow,blockers,warnings,'TTS_SOURCE_STALE',`页面正文/顺序自上次 TTS 基线后已变化${stalePages.length?`，涉及页：${compactPages(stalePages)}`:''}`,{pages:stalePages,location:{kind:'asset',page:stalePages[0]||1,path:'assets/tts/'}})}
  let orphanFiles=[];if(sourceExists){const allFiles=await listFilesRecursive(sourceDir);const expected=new Set(refs.map(x=>stripAssetsPrefix(x.path)));orphanFiles=allFiles.map(file=>path.relative(sourceDir,file).replaceAll('\\','/')).filter(file=>!expected.has(file));if(orphanFiles.length)add(warnings,'warning','UNREFERENCED_ASSETS',`发现 ${orphanFiles.length} 个未被 issue.json 引用的媒体文件`,{location:{kind:'asset',path:orphanFiles[0]}})}
  if(totalBytes>thresholds.total)add(warnings,'warning','TOTAL_MEDIA_LARGE',`本期被引用媒体总量 ${humanBytes(totalBytes)}，建议优化到 100 MB 以内`,{location:{kind:'asset',path:issue.assetSource||''}});
  const byKind={};for(const a of assets){byKind[a.kind]||={referenced:0,found:0,bytes:0};byKind[a.kind].referenced++;if(a.exists){byKind[a.kind].found++;byKind[a.kind].bytes+=a.bytes||0}}for(const v of Object.values(byKind))v.size=humanBytes(v.bytes);
  if(!blockers.length&&!warnings.length)add(notes,'note','AUDIT_CLEAN','未发现结构、内容或资源问题',{title:'基础审计通过',category:'general',fix:'继续执行完整 release:check，完成浏览器回归后再发布。'});
  const audit={id:issue.id,label:issue.label,subtitle:issue.subtitle||'',engine:issue.engine,status:issue.status,pageCount,assetSource:issue.assetSource||null,sourceExists,narration:{expected:narrationExpected,found:narrationFound,missingPages:missingTtsPages,complete:narrationExpected===narrationFound,sourceDigest:storedSourceDigest||null,currentSourceDigest,stale:Boolean(storedSourceDigest&&storedSourceDigest!==currentSourceDigest),stalePages},media:{referenced:refs.length,found:assets.filter(x=>x.exists).length,missing:missingCount,totalBytes,totalSize:humanBytes(totalBytes),byKind,assets,orphanFiles},blockers,warnings,notes};
  audit.readiness=readiness(audit);audit.score=calcScore(blockers,warnings);audit.categories=categoriesFor(audit);audit.strictMode=strict;return audit;
}

const entries=await readdir(path.join(root,'issues'),{withFileTypes:true});
const ids=entries.filter(e=>e.isDirectory()).map(e=>e.name).filter(id=>!targetId||id===targetId);
if(targetId&&!ids.length){console.error(`找不到 issues/${targetId}`);process.exit(1)}
const audits=[];for(const id of ids)audits.push(await auditOne(id));
const generatedAt=new Date().toISOString();
const summary={issues:audits.length,ready:audits.filter(a=>a.readiness==='ready').length,warning:audits.filter(a=>a.readiness==='warning').length,blocked:audits.filter(a=>a.readiness==='blocked').length,legacy:audits.filter(a=>a.readiness==='legacy').length,blockers:audits.reduce((n,a)=>n+a.blockers.length,0),warnings:audits.reduce((n,a)=>n+a.warnings.length,0),averageScore:Math.round(audits.filter(a=>a.score!=null).reduce((n,a)=>n+a.score,0)/Math.max(1,audits.filter(a=>a.score!=null).length))};
const report={version:V3_VERSION,generatedAt,strict,targetIssue:targetId||null,summary,issues:audits};
await mkdir(reportDir,{recursive:true});const suffix=targetId?`-${targetId}`:'';const jsonPath=path.join(reportDir,`v3-release-audit${suffix}.json`);const mdPath=path.join(reportDir,`v3-release-audit${suffix}.md`);const htmlPath=path.join(reportDir,`v3-release-audit${suffix}.html`);await writeJson(jsonPath,report);
const lines=['# V3 发布前审计报告','',`- 生成时间：${generatedAt}`,`- 模式：${strict?'严格发布检查':'日常审计'}`,`- 范围：${targetId||'全部期刊'}`,`- 结果：ready ${summary.ready} / warning ${summary.warning} / blocked ${summary.blocked} / legacy ${summary.legacy}`,`- 平均可发布度：${summary.averageScore}`,''];
for(const audit of audits){lines.push(`## ${audit.label}（${audit.id}）`,'',`**状态：${audit.readiness.toUpperCase()}** · ${audit.status||'unknown'} · ${audit.pageCount??'-'} 页 · 可发布度 ${audit.score??'-'}`,'');if(audit.skipped){lines.push('- Legacy 期刊，本次 V3 媒体审计跳过。','');continue}lines.push(`- 资源目录：${audit.assetSource||'未配置'}${audit.sourceExists?'':'（当前工作区不可用）'}`);lines.push(`- TTS：${audit.narration.found}/${audit.narration.expected}`);lines.push(`- 被引用媒体：${audit.media.found}/${audit.media.referenced}，总量 ${audit.media.totalSize}`);if(audit.blockers.length){lines.push('','### 阻断项');for(const x of audit.blockers)lines.push(`- [${x.code}] ${x.message}；建议：${x.fix}`)}if(audit.warnings.length){lines.push('','### 警告');for(const x of audit.warnings)lines.push(`- [${x.code}] ${x.message}；建议：${x.fix}`)}if(!audit.blockers.length&&!audit.warnings.length)lines.push('','- 未发现阻断项或警告。');lines.push('')}
await writeFile(mdPath,`${lines.join('\n')}\n`,'utf8');
const cards=audits.map(audit=>{const all=[...audit.blockers,...audit.warnings,...audit.notes];const problems=all.map(x=>`<li class="${esc(x.severity)}"><b>${esc(x.title)}</b> <code>${esc(x.code)}</code><div>${esc(x.message)}</div><small>建议：${esc(x.fix||'')}</small>${x.location?`<small>位置：${esc(x.location.kind||'')} ${esc(x.location.page?`第${x.location.page}页`:'')} ${esc(x.location.field||x.location.path||'')}</small>`:''}</li>`).join('')||'<li class="note">未发现问题</li>';const detail=audit.skipped?'<p>Legacy 期刊，本次 V3 媒体审计跳过。</p>':`<div class="metrics"><span>页面 <b>${audit.pageCount}</b></span><span>可发布度 <b>${audit.score}</b></span><span>TTS <b>${audit.narration.found}/${audit.narration.expected}</b></span><span>媒体 <b>${audit.media.found}/${audit.media.referenced}</b></span><span>体积 <b>${esc(audit.media.totalSize)}</b></span></div><p class="path">资源目录：${esc(audit.assetSource||'未配置')}${audit.sourceExists?'':'（当前工作区不可用）'}</p>`;return `<section class="issue ${audit.readiness}"><header><div><h2>${esc(audit.label)} <small>${esc(audit.id)}</small></h2><p>${esc(audit.subtitle||'')}</p></div><strong>${esc(audit.readiness.toUpperCase())}</strong></header>${detail}<ul>${problems}</ul></section>`}).join('\n');
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>V3 发布前审计报告</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f2ec;color:#302821;font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;overflow-wrap:anywhere}.wrap{max-width:1100px;margin:auto;padding:32px 18px 60px}.hero{background:#6f1d1b;color:#fff6e6;border-radius:22px;padding:26px 28px;box-shadow:0 14px 34px #5b1a1524}.hero h1{margin:0 0 8px}.summary{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}.summary span{background:#ffffff18;border:1px solid #ffffff28;padding:8px 12px;border-radius:999px}.issue{margin-top:18px;background:white;border-radius:18px;padding:20px 22px;border:1px solid #e8ded0;box-shadow:0 8px 22px #4b382312}.issue header{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.issue h2{margin:0}.issue h2 small{font-size:12px;color:#8d7a69}.issue header p{margin:6px 0;color:#766555}.issue header>strong{padding:6px 10px;border-radius:999px;background:#eee}.issue.ready header>strong{background:#e8f5eb;color:#2d6b42}.issue.warning header>strong{background:#fff4d8;color:#8a5a00}.issue.blocked header>strong{background:#fde8e6;color:#a32922}.metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;margin:16px 0}.metrics span{background:#f7f4ef;border-radius:12px;padding:10px 12px}.metrics b{display:block;margin-top:2px}.path{font-size:13px;color:#806f60;word-break:break-all}ul{padding:0;list-style:none;margin-bottom:0}li{margin:8px 0;padding:10px 12px;border-radius:10px;background:#f8f5f0}li b,li div,li small{display:block}li code{font-size:10px}li small{color:#796c62;margin-top:4px}.blocker{border-left:4px solid #a32922}.warning{border-left:4px solid #b77a12}.note{border-left:4px solid #397359}@media(max-width:650px){.metrics{grid-template-columns:1fr 1fr}.issue header{display:block}.issue header>strong{display:inline-block;margin-top:8px}.wrap{padding:16px 8px 40px}.hero,.issue{border-radius:14px;padding:16px}}</style></head><body><main class="wrap"><section class="hero"><h1>V3 发布前审计报告</h1><div>${esc(generatedAt)} · ${strict?'严格发布检查':'日常审计'} · ${esc(targetId||'全部期刊')}</div><div class="summary"><span>Ready ${summary.ready}</span><span>Warning ${summary.warning}</span><span>Blocked ${summary.blocked}</span><span>阻断 ${summary.blockers}</span><span>警告 ${summary.warnings}</span><span>平均可发布度 ${summary.averageScore}</span></div></section>${cards}</main></body></html>`;
await writeFile(htmlPath,html,'utf8');
if(!quiet){console.log(`V3 发布审计完成：${path.relative(root,mdPath)}`);console.log(`浏览器报告：${path.relative(root,htmlPath)}`);for(const a of audits)console.log(`- ${a.id} ${a.label}: ${a.readiness} · score=${a.score??'-'} blockers=${a.blockers.length} warnings=${a.warnings.length}`)}
if(strict&&summary.blocked>0&&!force)process.exit(1);
if(strict&&summary.blocked>0&&force)console.warn('直接发布模式：审计阻断仅记录为提示，不阻断发布。');
