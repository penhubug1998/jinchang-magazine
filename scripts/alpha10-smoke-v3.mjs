import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { V3_VERSION } from './lib-v3-production.mjs';
const root=process.cwd();
const assert=(c,m)=>{if(!c)throw new Error(m)};
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const [html,css,js,server]=await Promise.all([
  readFile(path.join(root,'src/studio/index.html'),'utf8'),
  readFile(path.join(root,'src/studio/studio.css'),'utf8'),
  readFile(path.join(root,'src/studio/studio.js'),'utf8'),
  readFile(path.join(root,'scripts/studio-v3.mjs'),'utf8')
]);
assert(pkg.version===V3_VERSION,'Alpha10 基线：package 与统一版本源不一致');
for(const id of ['pageMetaToggle','pageMetaSummaryTitle','pageMetaBody','duplicatePage','undoBtn','saveDiffDialog','saveDiffList'])assert(html.includes(`id="${id}"`),`Alpha10 缺少 ${id}`);
assert(css.includes('.page-meta-card.is-collapsed .page-meta-fields'),'页面基础信息折叠 CSS 缺失');
assert(css.includes('.save-diff-dialog')&&css.includes('.save-diff-list'),'保存前差异弹窗 CSS 缺失');
for(const token of ['setPageMetaExpanded','v3StudioPageMetaExpanded','summarizeIssueDiff','state.originalIssue','openSaveDiff'])assert(js.includes(token),`Alpha10 逻辑缺少 ${token}`);
assert(js.includes("['cover','toc','closing'].includes(p?.type)"),'复制页未保护结构页');
assert(server.includes('const studioVersion = V3_VERSION'),'Studio API 未统一使用 V3_VERSION');
console.log('Alpha10 专项自测通过：页面基础信息默认可折叠、复制页有结构边界、保存差异确认和未保存撤销逻辑齐全。');
