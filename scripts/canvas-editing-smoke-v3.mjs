// 画布编辑回归（PPT 式自由编辑的最小命令集）：
//   · 方向键微调：1px，Shift 10px
//   · 复制 / 粘贴 / 原位复制：新块有新 id，粘贴带偏移，受单页上限约束
//   · 层级：置顶 / 置底 / 上移一层，写入 block.design.z
//
// 这些是 studio.js 里的纯数据命令，用 vm 抽出真实源码执行，不起浏览器。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { ensureIssueIdentity } from '../src/studio/core/identity.js';

const source = await readFile('src/studio/studio.js', 'utf8');
const extract = (start, end) => {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `找不到源码片段：${start}`);
  const to = source.indexOf(end, from);
  assert.ok(to > from, `找不到结束标记：${end}`);
  return source.slice(from, to);
};

const code = [
  extract('function selectedBlockRows()', 'function duplicateSelectedBlocks()'),
  extract('function duplicateSelectedBlocks()', 'function deleteSelectedBlocks()'),
  extract('function nudgeSelectedCanvasBlocks(', '// 画布快捷键：')
].join('\n');

function harness(blocks, selected = [0]) {
  const calls = { dirty: 0, json: 0, list: 0, preview: 0, reader: 0, toast: [] };
  const page = { title: '测试页', blocks };
  const state = {
    canvasMode: true,
    issue: { id: '001', pages: [page] },
    page: 0,
    selectedBlocks: new Set(selected),
    selectedBlockIds: new Set(),
    lastSelectedBlock: null,
    canvasClipboard: []
  };
  const context = {
    __idSeq: 0,
    state,
    console,
    Number, Math, Set, Object, JSON, Array, String, Boolean,
    LIMITS: { blocksPerPage: 80 },
    cloneData: value => JSON.parse(JSON.stringify(value)),
    currentPage: () => page,
    validSelectedBlockIndices: () => [...state.selectedBlocks].filter(i => Number.isInteger(i) && i >= 0 && i < page.blocks.length).sort((a, b) => a - b),
    regenerateBlockIdentity: block => { block.id = `block_new_${++context.__idSeq}`; return block; },
    markDirty: () => { calls.dirty++; },
    syncJsonFromPage: () => { calls.json++; },
    renderBlockList: () => { calls.list++; },
    renderPreview: () => { calls.preview++; },
    pushReaderPreview: () => { calls.reader++; return Promise.resolve(true); },
    // 与生产一致：mutateBlocks 会先做一次 identity 归一化（补块 id）。
    mutateBlocks: () => { ensureIssueIdentity(state.issue); calls.dirty++; calls.json++; calls.list++; calls.preview++; },
    toast: message => { calls.toast.push(String(message)); }
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  return { context, state, page, calls };
}

// ---- 方向键微调 -----------------------------------------------------------
{
  const { context: c, page, calls } = harness([{ type: 'paragraph', text: 'A', design: { x: 5, y: 6 } }], [0]);
  assert.equal(c.nudgeSelectedCanvasBlocks(1, 0), true);
  assert.deepEqual({ x: page.blocks[0].design.x, y: page.blocks[0].design.y }, { x: 6, y: 6 }, '右移 1px');
  c.nudgeSelectedCanvasBlocks(0, 10);
  assert.deepEqual({ x: page.blocks[0].design.x, y: page.blocks[0].design.y }, { x: 6, y: 16 }, 'Shift 下移 10px');
  c.nudgeSelectedCanvasBlocks(-6, -16);
  assert.equal(page.blocks[0].design?.x, undefined, '归零后应删除 x 而不是留下 0');
  assert.equal(page.blocks[0].design?.y, undefined, '归零后应删除 y');
  assert.ok(calls.dirty === 3 && calls.reader === 3, '每次微调都应记一个撤销点并刷新预览');
  // 多选一起移动
  const multi = harness([{ type: 'paragraph', text: 'A' }, { type: 'paragraph', text: 'B' }], [0, 1]);
  multi.context.nudgeSelectedCanvasBlocks(2, 3);
  assert.deepEqual(multi.page.blocks.map(b => [b.design.x, b.design.y]), [[2, 3], [2, 3]], '多选应一起位移');
  // 没选中 / 非画布模式不动
  const none = harness([{ type: 'paragraph', text: 'A' }], []);
  assert.equal(none.context.nudgeSelectedCanvasBlocks(1, 0), false, '未选中时不应改动');
  none.state.canvasMode = false;
  none.state.selectedBlocks = new Set([0]);
  assert.equal(none.context.nudgeSelectedCanvasBlocks(1, 0), false, '非画布模式不应改动');
}

// ---- 复制 / 粘贴 ----------------------------------------------------------
{
  const { context: c, page, state, calls } = harness([{ type: 'paragraph', text: '原始', design: { x: 10, y: 10 } }], [0]);
  assert.equal(c.copySelectedBlocks(), 1);
  assert.equal(state.canvasClipboard.length, 1, '复制应写入剪贴板');
  assert.equal(c.pasteCanvasClipboard(), true);
  assert.equal(page.blocks.length, 2, '粘贴应新增一块');
  const pasted = page.blocks[1];
  assert.notEqual(pasted.id, page.blocks[0].id, '粘贴块必须有新 id');
  assert.deepEqual({ x: pasted.design.x, y: pasted.design.y }, { x: 28, y: 28 }, '粘贴应带 18px 偏移');
  assert.equal(page.blocks[0].design.x, 10, '原块位置不能被改动');
  assert.ok(state.selectedBlocks.has(1), '粘贴后应选中新块');
  assert.ok(calls.dirty >= 1, '粘贴应记撤销点');
  // 空剪贴板
  const empty = harness([{ type: 'paragraph', text: 'A' }], [0]);
  const emptyResult = empty.context.pasteCanvasClipboard();
  assert.equal(emptyResult, false, '空剪贴板应返回 false 而不是抛错');
  assert.ok(empty.calls.toast.some(x => /剪贴板为空/.test(x)), '空剪贴板应给提示');
}

// ---- 原位复制（⌘D）--------------------------------------------------------
{
  const { context: c, page, state } = harness([{ type: 'paragraph', text: 'A' }, { type: 'paragraph', text: 'B' }], [0, 1]);
  c.duplicateSelectedBlocks();
  assert.equal(page.blocks.length, 4, '原位复制应把选中块各复制一份');
  assert.equal(new Set(page.blocks.map(b => b.id)).size, page.blocks.length, '所有块 id 必须唯一');
  assert.equal(state.selectedBlocks.size, 2, '复制后应选中新块');
}

// ---- 层级 ----------------------------------------------------------------
{
  const { context: c, page, calls } = harness([
    { type: 'paragraph', text: 'A' }, { type: 'paragraph', text: 'B' }, { type: 'paragraph', text: 'C', design: { z: 3 } }
  ], [0]);
  c.setSelectedCanvasLayer('forward');
  assert.equal(page.blocks[0].design.z, 1, '上移一层应为当前 z+1');
  c.setSelectedCanvasLayer('front');
  assert.equal(page.blocks[0].design.z, 4, '置顶应高于当前最大值');
  c.setSelectedCanvasLayer('back');
  assert.equal(page.blocks[0].design.z, -1, '置底应低于所有现有层级');
  assert.ok(calls.json >= 3 && calls.reader >= 3, '层级调整应刷新预览');
  // 未选中时给提示
  const none = harness([{ type: 'paragraph', text: 'A' }], []);
  none.context.setSelectedCanvasLayer('front');
  assert.ok(none.calls.toast.some(x => /请先选择内容块/.test(x)), '未选中应提示');
}

// ---- 拖动吸附（对齐参考线的数学部分）------------------------------------
// Reader 里的实现依赖 DOM 测量，这里只把"取最近的吸附目标"这段纯函数抽出来验。
const snapSource = await readFile('src/reader/reader.js', 'utf8');
const snapCode = (() => {
  const from = snapSource.indexOf('const CANVAS_SNAP_PX=');
  const to = snapSource.indexOf('function applyStudioCanvasSnap(');
  assert.ok(from >= 0 && to > from, '找不到吸附实现的源码片段');
  return snapSource.slice(from, to);
})();
{
  const snapContext = { Number, Math };
  vm.createContext(snapContext);
  vm.runInContext(snapCode, snapContext);
  const candidates = [{ pos: 100 }, { pos: 300 }, { pos: 500 }];
  // 距离 4px -> 吸到 300
  assert.equal(snapContext.studioCanvasSnapAxis(candidates, [296]).pos, 300, '4px 内应吸附');
  // 距离 20px -> 不吸附
  assert.equal(snapContext.studioCanvasSnapAxis(candidates, [320]), null, '超出阈值不应吸附');
  // 两个目标都在阈值内时取更近的
  assert.equal(snapContext.studioCanvasSnapAxis(candidates, [297]).pos, 300, '应取最近的目标');
  assert.equal(snapContext.studioCanvasSnapAxis([{ pos: 100 }, { pos: 104 }], [102]).pos, 100, '等距时取更近的（100 与 104 距 102 都是 2，先命中 100）');
  assert.equal(vm.runInContext('CANVAS_SNAP_PX', snapContext), 6, '吸附阈值应为 6px');
}

console.log('画布编辑回归通过：方向键微调（1px/Shift 10px）、复制粘贴（新 id + 偏移）、原位复制、层级调整、拖动吸附（6px 阈值取最近对齐目标）均按数据契约生效。');
