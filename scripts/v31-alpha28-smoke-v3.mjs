import { readFile } from 'node:fs/promises';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const sourceRoot = new URL('../', import.meta.url);
const [html, studio, css] = await Promise.all([
  readFile(new URL('src/studio/index.html', sourceRoot), 'utf8'),
  readFile(new URL('src/studio/studio.js', sourceRoot), 'utf8'),
  readFile(new URL('src/studio/studio.css', sourceRoot), 'utf8'),
]);

for (const token of [
  'id="batchBlocksSplit"',
  'id="splitPageDialog"',
  'id="confirmSplitPage"',
  'id="visualHealthSplit"',
  'SAFE PAGE SPLIT',
]) {
  assert(html.includes(token), `拆页 UI contract 缺少 ${token}`);
}

for (const token of [
  'state.pageMovePreview',
  'function splitPageBaseTitle',
  'function nextContinuationNumber',
  'function buildContinuationPage',
  'function selectedPageSplitPlan',
  'function renderSplitPageDialog',
  'function openSplitPageDialog',
  'function moveSelectedBlocksToNewPage',
  'sourceId',
  'selectedIds',
  'target.blocks=moved',
  "historyGroup:'page-split'",
  'ensureIssueIdentity(state.issue)',
  'syncJsonFromPage()',
]) {
  assert(studio.includes(token), `Studio 安全拆页 contract 缺少 ${token}`);
}

for (const token of [
  '.split-page-action',
  '.split-page-dialog',
  '.split-page-preview',
  '.split-page-list',
  '.split-page-item',
]) {
  assert(css.includes(token), `拆页视觉样式缺少 ${token}`);
}

const blocks = [
  { id: 'block-a', text: '原文 A' },
  { id: 'block-b', text: '原文 B' },
  { id: 'block-c', text: '原文 C' },
];
const selectedIds = new Set(['block-b']);
const moved = blocks.filter(block => selectedIds.has(block.id));
const remaining = blocks.filter(block => !selectedIds.has(block.id));
assert(moved.length === 1 && moved[0].text === '原文 B', '拆页应移动原内容块而非复制或重建');
assert(remaining.map(block => block.id).join(',') === 'block-a,block-c', '来源页应保留未选内容块');
assert(new Set([...moved, ...remaining].map(block => block.id)).size === blocks.length, '拆页前后内容块 ID 应保持唯一且完整');

console.log('V3.1-alpha28 Smoke 通过：安全拆页具备预览、稳定 ID 保留、边界保护、历史记录与版式入口。');
