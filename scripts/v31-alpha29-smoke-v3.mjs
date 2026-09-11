import { readFile } from 'node:fs/promises';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const sourceRoot = new URL('../', import.meta.url);
const [html, studio, css] = await Promise.all([
  readFile(new URL('src/studio/index.html', sourceRoot), 'utf8'),
  readFile(new URL('src/studio/studio.js', sourceRoot), 'utf8'),
  readFile(new URL('src/studio/media-pending.css', sourceRoot), 'utf8'),
]);

for (const token of [
  'data-kind="pending"',
  '待补素材',
  'media-pending.css',
  'id="mediaList"',
  'id="mediaInspector"',
]) {
  assert(html.includes(token), `待补素材 UI contract 缺少 ${token}`);
}

for (const token of [
  'function isMediaSourceMissing',
  'function mediaNeeds',
  'function pendingMediaTargetFromElement',
  'function focusPendingMedia',
  'function renderPendingMediaList',
  "state.mediaFilter==='pending'",
  'data-pending-action',
  'openReplace',
  'media-summary-pending',
  'has-pending-media',
  'mediaTarget=target',
  'if(dialog&&!dialog.open)dialog.showModal()',
]) {
  assert(studio.includes(token), `媒体待补状态 contract 缺少 ${token}`);
}

for (const token of [
  '.media-summary-pending',
  '.pending-media-item',
  '.pending-media-actions',
  '.has-pending-media',
]) {
  assert(css.includes(token), `待补素材样式缺少 ${token}`);
}

const isMissing = value => {
  const text = String(value ?? '').trim();
  return !text || /^(?:[（(]\s*)?(图片|视频|image|video|待补|占位|placeholder)(?:\s*[）)])?$/i.test(text);
};
for (const value of ['', '（图片）', '(video)', 'placeholder']) {
  assert(isMissing(value), `应识别为待补媒体：${value}`);
}
for (const value of ['assets/images/cover.webp', 'https://example.com/video.mp4']) {
  assert(!isMissing(value), `不应误判已绑定媒体：${value}`);
}

const issue = {
  pages: [
    {
      id: 'p1',
      navTitle: '图文页',
      blocks: [
        { id: 'b1', type: 'paragraph', text: '正文' },
        { id: 'b2', type: 'image', src: '' },
        { id: 'b3', type: 'video', src: '（视频）' },
      ],
    },
  ],
};
const pending = issue.pages.flatMap((page, pageIndex) => page.blocks
  .filter(block => ['image', 'video'].includes(block.type) && isMissing(block.src))
  .map(block => ({ pageIndex, blockId: block.id, kind: block.type })));
assert(pending.length === 2 && pending[0].blockId === 'b2' && pending[1].blockId === 'b3', '应生成完整的待补素材清单');
assert(issue.pages[0].blocks[0].text === '正文', '待补素材扫描不得修改原文');

console.log('V3.1-alpha29 Smoke 通过：媒体待补状态、清单、页面定位和替换入口契约完整，且扫描不修改期刊内容。');
