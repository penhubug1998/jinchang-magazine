import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
// When a release targets one issue, validate only that issue's assets. The
// previous all-issues scan made an unrelated draft (for example 004) appear
// in the 003 publish dialog and obscured the actual blocker.
const issueArgIndex = process.argv.findIndex((value) => value === '--issue' || value === '--id');
const issueEqualsArg = process.argv.find((value) => value.startsWith('--issue=') || value.startsWith('--id='));
const targetIssue = String(issueEqualsArg?.split('=').slice(1).join('=') || (issueArgIndex >= 0 ? process.argv[issueArgIndex + 1] : '') || '').trim();
const errors = [];
const warnings = [];
const allowedPageTypes = new Set(["cover","article","toc","news","theory","safety","discipline","health","closing"]);
const allowedBlockTypes = new Set(["paragraph","quote","chips","cardline","casePair","toc","articleLink","video","image","coverMeta","coverSections","blessing","producer","cards","container","textFlow","pullQuote","sidebar","sectionHeading"]);
const allowedContainerLayouts = new Set(["single","two-equal","two-40-60","two-60-40","three-equal","media-left","media-right"]);
const allowedContainerGaps = new Set(["sm","md","lg"]);
const allowedContainerAlign = new Set(["start","center","stretch"]);
const allowedContainerMobile = new Set(["stack","preserve"]);
const MAX_PAGE_BLOCK_NODES = 160;
const designHex=/^#[0-9a-fA-F]{6}$/;
function validPageBackgroundAsset(value){
  const raw=String(value??'').split(/[?#]/)[0].replace(/^\.\//,'').replaceAll('\\','/');
  const parts=raw.split('/');
  return raw.startsWith('assets/')&&parts.length>1&&parts.every(part=>part&&part!=='.'&&part!=='..');
}
function validateDesign(design,at,scope){
  if(design==null)return;if(!design||typeof design!=="object"||Array.isArray(design))return fail(`${at}: design 必须为对象`);
  const ranges=scope==='theme'?{fontBase:[11,18],radius:[0,24],spacing:[4,24]}:scope==='page'?{padding:[0,12],contentWidth:[60,100]}:{fontSize:[10,48],padding:[0,48],margin:[0,48],radius:[0,40],borderWidth:[0,6],width:[25,100]};
  const colors=scope==='theme'?['accent','paper','text','muted']:scope==='page'?['background','color','accent']:['color','background','borderColor'];
  for(const key of colors)if(design[key]!=null&&!designHex.test(String(design[key])))fail(`${at}: design.${key} 必须为 #RRGGBB`);
  for(const [key,[min,max]] of Object.entries(ranges))if(design[key]!=null&&(!Number.isFinite(Number(design[key]))||Number(design[key])<min||Number(design[key])>max))fail(`${at}: design.${key} 必须在 ${min}–${max}`);
  if(scope==='page'){
    if(design.backgroundImage!=null&&!validPageBackgroundAsset(design.backgroundImage))fail(`${at}: design.backgroundImage 必须是 assets/ 下的安全资源路径`);
    if(design.backgroundOverlay!=null&&(!Number.isFinite(Number(design.backgroundOverlay))||Number(design.backgroundOverlay)<0||Number(design.backgroundOverlay)>.92))fail(`${at}: design.backgroundOverlay 必须在 0–0.92`);
    if(design.backgroundFit!=null&&!['cover','contain'].includes(String(design.backgroundFit)))fail(`${at}: design.backgroundFit 不受支持`);
    if(design.backgroundPosition!=null&&!['center','top','bottom','left','right'].includes(String(design.backgroundPosition)))fail(`${at}: design.backgroundPosition 不受支持`);
  }
  if(scope==='block'){
    if(design.fontWeight!=null&&!['400','500','600','700','800'].includes(String(design.fontWeight)))fail(`${at}: design.fontWeight 不受支持`);
    if(design.shadow!=null&&!['none','sm','md','lg'].includes(String(design.shadow)))fail(`${at}: design.shadow 不受支持`);
    if(design.textAlign!=null&&!['left','center','right','justify'].includes(String(design.textAlign)))fail(`${at}: design.textAlign 不受支持`);
    if(design.alignSelf!=null&&!['left','center','right'].includes(String(design.alignSelf)))fail(`${at}: design.alignSelf 不受支持`);
  }
}


function validatePublishing(value,at,scope='block') {
  if(value==null)return; if(!value||typeof value!=="object"||Array.isArray(value))return fail(`${at}: publishing 必须为对象`);
  if(scope==='page'){
    if(value.columns!=null&&(!Number.isInteger(Number(value.columns))||Number(value.columns)<1||Number(value.columns)>3))fail(`${at}: publishing.columns 必须为 1–3`);
    if(value.columnGap!=null&&(!Number.isFinite(Number(value.columnGap))||Number(value.columnGap)<8||Number(value.columnGap)>48))fail(`${at}: publishing.columnGap 必须在 8–48`);
    return;
  }
  if(value.wrap!=null&&!['none','left','right'].includes(value.wrap))fail(`${at}: publishing.wrap 不受支持`);
  if(value.wrapWidth!=null&&(!Number.isFinite(Number(value.wrapWidth))||Number(value.wrapWidth)<20||Number(value.wrapWidth)>58))fail(`${at}: publishing.wrapWidth 必须在 20–58`);
}

const rel = (file) => path.relative(root, file).replaceAll("\\", "/");
function fail(message){ errors.push(message); }
function warn(message){ warnings.push(message); }
async function exists(file){ try { await access(file); return true; } catch { return false; } }
async function readJson(file){
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error){ fail(`${rel(file)}: ${error.message}`); return null; }
}

function validateBlocks(issue, page, pageIndex, source){
  const blocks = page.blocks || [];
  if (!Array.isArray(blocks)) { fail(`${source}: pages[${pageIndex}].blocks 必须为数组`); return; }
  if (blocks.length > 80) fail(`${source}: pages[${pageIndex}].blocks 超过 80 个，请拆分页面`);
  let nodeCount = 0;
  const validateOne = (block, at, { nested = false } = {}) => {
    nodeCount += 1;
    if (!block || typeof block !== "object") { fail(`${at} 不是对象`); return; }
    if (!allowedBlockTypes.has(block.type)) fail(`${at}: 不支持的 block.type=${block.type}`);
    validateDesign(block.design,at,'block');
    validatePublishing(block.publishing,at,'block');
    if(block.type==='textFlow'){if(!String(block.flowId||block.flow?.id||'').trim())fail(`${at}: textFlow 缺少 flowId`);const f=block.flow||{};if(f.capacity!=null&&(!Number.isFinite(Number(f.capacity))||Number(f.capacity)<80||Number(f.capacity)>4000))fail(`${at}: flow.capacity 必须在 80–4000`);}
    if (nested && block.type === "container") fail(`${at}: V3.1-alpha1 暂不允许容器嵌套容器`);
    const scan=(value,prefix="")=>{ if(typeof value==="string"&&value.length>12000) fail(`${at}: ${prefix||"文本"} 超过 12000 个字符`); else if(Array.isArray(value)){ if(value.length>40) fail(`${at}: ${prefix||"数组"} 超过 40 项`); value.forEach((v,i)=>scan(v,`${prefix}[${i}]`)); } else if(value&&typeof value==="object") Object.entries(value).forEach(([k,v])=>scan(v,prefix?`${prefix}.${k}`:k)); }; scan(block);
    if (block.type === "container") {
      if (!allowedContainerLayouts.has(block.layout || "two-equal")) fail(`${at}: container.layout 不受支持`);
      if (!allowedContainerGaps.has(block.gap || "md")) fail(`${at}: container.gap 不受支持`);
      if (!allowedContainerAlign.has(block.align || "start")) fail(`${at}: container.align 不受支持`);
      if (!allowedContainerMobile.has(block.mobile || "stack")) fail(`${at}: container.mobile 不受支持`);
      const columns = block.columns;
      if (!Array.isArray(columns) || columns.length < 1 || columns.length > 3) fail(`${at}: container.columns 必须为 1–3 列`);
      else columns.forEach((column, ci) => {
        if (!column || !Array.isArray(column.blocks)) return fail(`${at}.columns[${ci}].blocks 必须为数组`);
        if (column.blocks.length > 20) fail(`${at}.columns[${ci}].blocks 超过 20 个`);
        column.blocks.forEach((child, bi) => validateOne(child, `${at}.columns[${ci}].blocks[${bi}]`, { nested:true }));
      });
      return;
    }
    if (block.type === "articleLink" && !issue.articles?.[block.articleId]) fail(`${at}: articleId=${block.articleId} 未在 articles 中定义`);
    if (block.type === "toc") for (const item of block.items || []) if (!Number.isInteger(item.page) || item.page < 1 || item.page > issue.pages.length) fail(`${at}: 目录页码 ${item.page} 越界`);
    if ((block.type === "video" || block.type === "image") && (!block.src || /^(javascript|data):/i.test(block.src))) fail(`${at}: 媒体 src 无效`);
    if (block.type === "video" && block.poster && /^(javascript|data):/i.test(block.poster)) fail(`${at}: 视频 poster 无效`);
    if (block.type === "image") {
      if (block.frameRatio != null && !new Set(["auto","16:9","4:3","3:2","1:1"]).has(block.frameRatio)) fail(`${at}: frameRatio 不受支持`);
      if (block.fit != null && !new Set(["contain","cover"]).has(block.fit)) fail(`${at}: fit 不受支持`);
      for (const key of ["positionX","positionY"]) if (block[key] != null && (!Number.isFinite(Number(block[key])) || Number(block[key]) < 0 || Number(block[key]) > 100)) fail(`${at}: ${key} 必须在 0–100`);
    }
  };
  blocks.forEach((block, blockIndex) => validateOne(block, `${source}: pages[${pageIndex}].blocks[${blockIndex}]`));
  if (nodeCount > MAX_PAGE_BLOCK_NODES) fail(`${source}: pages[${pageIndex}] 递归内容块总数 ${nodeCount} 超过 ${MAX_PAGE_BLOCK_NODES}，请拆分页面`);
}

function validateIssue(issue, source, { allowLegacy = true } = {}){
  if (!issue || typeof issue !== "object") return;
  for (const key of ["id","label","publication","engine","status"]) if (!issue[key]) fail(`${source}: 缺少字段 ${key}`);
  if (!new Set(["legacy","v3"]).has(issue.engine)) fail(`${source}: engine 必须为 legacy 或 v3`);
  if (issue.engine === "legacy") {
    if (!allowLegacy) fail(`${source}: 示例数据不能使用 legacy 引擎`);
    if (!issue.legacyPath) fail(`${source}: legacy 期刊缺少 legacyPath`);
    return;
  }
  if (!Array.isArray(issue.pages) || issue.pages.length === 0) { fail(`${source}: v3 期刊 pages 不能为空`); return; }
  if(issue.design?.tokens) validateDesign(issue.design.tokens,`${source}: design.tokens`,`theme`);
  issue.pages.forEach((page, index) => {
    if (!page || typeof page !== "object") return fail(`${source}: pages[${index}] 不是对象`);
    if (!page.type) fail(`${source}: pages[${index}] 缺少 type`);
    else if (!allowedPageTypes.has(page.type)) fail(`${source}: pages[${index}] 不支持 type=${page.type}`);
    if (!page.title) fail(`${source}: pages[${index}] 缺少 title`);
    validateDesign(page.design,`${source}: pages[${index}]`,`page`);
    validatePublishing(page.publishing,`${source}: pages[${index}]`,`page`);
    validateBlocks(issue, page, index, source);
  });
  if (issue.features?.narration?.pattern && !issue.features.narration.pattern.includes("{page}")) fail(`${source}: narration.pattern 必须包含 {page}`);
}

async function inspectDir(dir, options){
  const entries = await readdir(dir, { withFileTypes:true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (options.issue && dir === path.join(root, 'issues') && entry.name !== options.issue) continue;
    const issueFile = path.join(dir, entry.name, "issue.json");
    const issue = await readJson(issueFile);
    validateIssue(issue, rel(issueFile), options);

    const manifestFile = path.join(dir, entry.name, "assets.json");
    if (issue?.engine === "v3" && await exists(manifestFile)) {
      const manifest = await readJson(manifestFile);
      const sourceDir = path.join(root, manifest?.assetSource || issue.assetSource || "");
      if (!(await exists(sourceDir))) {
        warn(`${rel(manifestFile)}: 本工作区没有 ${rel(sourceDir)}，资源存在性检查跳过（将 overlay 合入完整仓库后会执行）`);
      } else {
        const missing = [];
        for (const item of manifest.expected || []) {
          const itemPath = typeof item === "string" ? item : item?.path;
          if (!itemPath) {
            fail(`${rel(manifestFile)}: expected 资源项缺少 path`);
            continue;
          }
          const file = path.join(sourceDir, itemPath);
          if (!(await exists(file))) missing.push({ item, file });
        }
        if (missing.length) {
          if (["ready","published"].includes(issue.status)) {
            for (const { file } of missing) fail(`${rel(manifestFile)}: 缺少资源 ${rel(file)}`);
          } else {
            warn(`${rel(manifestFile)}: ${missing.length} 个资源尚未就绪（当前 status=${issue.status || "unknown"}，草稿阶段允许缺失；发布前由 audit:v3 / release:check 严格检查）`);
          }
        }
      }
    }
  }
}

await inspectDir(path.join(root, "issues"), { allowLegacy:true, issue:targetIssue });
await inspectDir(path.join(root, "examples"), { allowLegacy:false });

for (const warning of warnings) console.warn(`V3 警告：${warning}`);
if (errors.length) {
  console.error("V3 数据校验失败：");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`V3 数据校验通过。${warnings.length ? `（${warnings.length} 条非阻断警告）` : ""}`);
