// 导入完整性回归：确保真实稿件的每一个内容块都能进入成刊页面。
//
// 背景（2026-09-12 实测）：真实第四期稿件 419 个块导入后，有 77 个块被当作
// 结构标记消费后没有落回正文（版块标题、文章标题、☆/★ 特写标记），并且
// 自动分页把 9,000 字切成了 54 页、含 2 个空页。这个套件把当时的形态固化
// 成断言，防止再次出现"导入成功但少内容"。
//
// 背景（2026-09-13 实测）：用一份带图片/表格/列表的真实 Word 稿件试跑，又发现
// 三类"看起来导入成功、其实结构已经变了"的问题，同样固化成断言：
//   1. `<w:p/>`（Word 常见空段落写法）被当成开标签，会吞掉紧跟其后的元素；后面
//      若是表格，整张表格会降级成普通段落，表格结构消失。
//   2. 项目符号/编号定义在样式里（段落没有内联 <w:numPr>）时，列表全部退化成正文。
//   3. 首屏先出现图片时，刊头行不会成为标题，标题会错取到第一个 Heading1；
//      另外合并页拼出来的标题长度必须与发布审计的 PAGE_TITLE_LONG 阈值一致。
//
// 用法：
//   node scripts/import-completeness-smoke-v3.mjs
//   REAL_DOCX=/path/to/real.docx node scripts/import-completeness-smoke-v3.mjs   # 用真实稿件再跑一遍
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { parseImportedBuffer, paginateImportedDocument, blockWeight } from './lib-v3-import.mjs';

// ---- 构造一份带"陷阱"的合成 docx：版块标题、带序号的文章标题、☆/★ 标记、
// ---- 卷首语/尾刊寄语、只有标题没有正文的条目。
const PARAGRAPHS = [
  ['Heading1', '测试刊名'],
  ['Heading2', '📖 卷首语'],
  ['FirstParagraph', '卷首一段，用于确认卷首正文保留。'],
  ['Heading1', '第一版块 时政要闻｜常览国事 初心永驻'],
  ['Heading2', '一、第一条要闻标题'],
  ['FirstParagraph', '要闻正文一。'],
  ['BodyText', '要闻正文二。'],
  // 列表陷阱：前两条只有样式带编号定义（Word 的常见写法），第三条是自定义样式，
  // 必须在 styles.xml 里能查到 <w:numPr> 才算数。
  ['ListBullet', '每月安排一次主题学习交流。'],
  ['ListNumber', '第一步停一停，不给陌生人提供验证码。'],
  ['CustomBulletList', '自定义样式项目符号也要识别。'],
  ['Heading2', '二、第二条要闻标题'],
  ['FirstParagraph', '要闻正文三。'],
  ['Heading1', '第二版块 安全防范｜居安思危 平安相伴'],
  ['Heading2', '☆居家安全微课堂'],
  ['Heading2', '一、防火灾'],
  ['BodyText', '防火灾正文。'],
  ['Heading3', '★卫生间铺防滑垫。'],
  ['Heading3', '★床边设置容易打开的小夜灯。'],
  ['Heading1', '第三版块 红色记忆｜铭记历史 珍爱和平'],
  ['Heading2', '☆九月特别策划：铭记九三'],
  ['FirstParagraph', '红色记忆正文。'],
  ['Heading2', '📌 尾刊寄语'],
  ['FirstParagraph', '一叶知秋，一岁一礼。'],
  ['BodyText', '尾页正文。']
];

// 刊头行：首屏先是一张图片，再出现这行刊名。旧逻辑只在 blocks 为空时才认标题，
// 首屏有图片就永远轮不到它，标题会错取到第一个 Heading1「测试刊名」。
const LEAD_LABEL = '第 099 期 · 富媒体导入回归';

// 内联图片与表格：DOCX 里最常见的非文字对象，必须在导入与分页后都存在
const INLINE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
const TABLE_ROWS = [['项目', '第一季度', '第二季度'], ['走访慰问', '12 次', '15 次']];

function docxParts() {
  const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const imagePara = rel => '<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
    + '<wp:extent cx="1524000" cy="1016000"/><wp:docPr id="1" name="图片 1" descr="测试插图"/>'
    + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
    + '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + '<pic:nvPicPr><pic:cNvPr id="1" name="image1.png"/><pic:cNvPicPr/></pic:nvPicPr>'
    + `<pic:blipFill><a:blip r:embed="${rel}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1524000" cy="1016000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
    + '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  const tablePara = '<w:tbl><w:tblPr/><w:tblGrid/>' + TABLE_ROWS.map(row =>
    '<w:tr>' + row.map(cell => `<w:tc><w:p><w:r><w:t xml:space="preserve">${esc(cell)}</w:t></w:r></w:p></w:tc>`).join('') + '</w:tr>').join('') + '</w:tbl>';
  const body = PARAGRAPHS.map(([style, text]) => {
    if (style === 'Heading2' && text === '一、防火灾') return imagePara('rId10') + `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
    // 陷阱：表格前紧贴一个自闭合空段落。旧解析把它当开标签，会连表格一起吞掉。
    if (style === 'BodyText' && text === '防火灾正文。') return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>` + '<w:p/>' + tablePara;
    return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
  }).join('');
  const lead = imagePara('rId11') + `<w:p><w:r><w:t xml:space="preserve">${esc(LEAD_LABEL)}</w:t></w:r></w:p>`;
  const headingStyles = ['Heading1', 'Heading2', 'Heading3'].map((name, index) => `<w:style w:type="paragraph" w:styleId="${name}"><w:name w:val="heading ${index + 1}"/></w:style>`).join('');
  // 自定义列表样式：编号定义只在样式里，段落本身没有 <w:numPr>，只能靠解析 styles.xml 识别。
  const listStyles = '<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="ListNumber"><w:name w:val="List Number"/><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="5"/></w:numPr></w:pPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="CustomBulletList"><w:name w:val="项目符号列表"/><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="7"/></w:numPr></w:pPr></w:style>';
  return {
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${lead}${body}</w:body></w:document>`,
    'word/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${headingStyles}${listStyles}</w:styles>`,
    'word/_rels/document.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>'
      + '<Relationship Id="rId11" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image2.png"/></Relationships>',
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    'word/media/image1.png': { __base64: INLINE_PNG_BASE64 },
    'word/media/image2.png': { __base64: INLINE_PNG_BASE64 }
  };
}

async function buildFixtureDocx() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'v3-import-fixture-'));
  const parts = docxParts();
  const { mkdir, writeFile } = await import('node:fs/promises');
  for (const [name, content] of Object.entries(parts)) {
    const target = path.join(dir, name);
    await mkdir(path.dirname(target), { recursive: true });
    if (content && typeof content === 'object' && content.__base64) await writeFile(target, Buffer.from(content.__base64, 'base64'));
    else await writeFile(target, content, 'utf8');
  }
  const file = path.join(dir, 'fixture.docx');
  const zip = spawnSync('zip', ['-q', '-r', file, ...Object.keys(parts)], { cwd: dir, encoding: 'utf8' });
  if (zip.status !== 0) throw new Error(`无法生成 docx 测试样本（需要 zip 命令）：${zip.stderr || zip.stdout}`);
  return { file, dir };
}

function pageText(pages) {
  const walk = blocks => (blocks || []).map(b => {
    const parts = [b?.text, b?.title, b?.badge, b?.caption, b?.case, b?.warning, ...(b?.items || []).flatMap(x => typeof x === 'string' ? [x] : [x?.text, x?.title])];
    const nested = (b?.columns || []).flatMap(c => walk(c.blocks));
    return [...parts, ...nested].filter(Boolean).join(' ');
  }).join(' ');
  return pages.map(p => `${p.title || ''} ${p.navTitle || ''} ${walk(p.blocks)}`).join(' ');
}

const countBlocks = (blocks, type) => {
  let n = 0;
  for (const b of blocks || []) {
    if (b?.type === type) n++;
    for (const col of b?.columns || []) n += countBlocks(col.blocks, type);
  }
  return n;
};

async function checkDocument(file, { label, minPages = 1 }) {
  const doc = await parseImportedBuffer(await readFile(file), { filename: path.basename(file) });
  const pag = paginateImportedDocument(doc, { targetChars: 760, structureMode: 'auto' });
  assert.ok(doc.blocks.length > 0, `${label}: 解析结果为空`);
  assert.ok(pag.pages.length >= minPages, `${label}: 页数异常 ${pag.pages.length}`);

  // 1. 对账：每个源块都必须能在页面上找到
  assert.equal(pag.completeness.missing.length, 0,
    `${label}: 有 ${pag.completeness.missing.length} 个源块没有进入成刊页面：\n` +
    pag.completeness.missing.slice(0, 10).map(x => `  [${x.style}] ${x.text.slice(0, 60)}`).join('\n'));

  // 2. 不能有空页
  const emptyPages = pag.pages.map((p, i) => ({ page: i + 1, blocks: (p.blocks || []).length })).filter(x => x.blocks === 0);
  assert.equal(emptyPages.length, 0, `${label}: 出现空页 ${JSON.stringify(emptyPages)}`);

  // 3. 密度：不能把内容切成大量半空页（历史故障是 9,000 字切成 54 页）。
  //    样本本身很短时（总权重低）不套用这条，只对内容量足够的稿件生效。
  const weights = pag.pages.map(p => (p.blocks || []).reduce((n, b) => n + blockWeight(b), 0));
  const total = weights.reduce((a, b) => a + b, 0);
  const thin = weights.filter(w => w < 400).length;
  if (total >= 4000) {
    assert.ok(thin <= Math.max(2, Math.ceil(pag.pages.length * 0.25)),
      `${label}: ${thin}/${pag.pages.length} 页内容量过低（分页密度失控）`);
  }

  // 3.5 非文字对象：源里有图片/表格时，分页后必须还在（这是"Word 图文导入"的核心保证）
  const sourceImages = countBlocks(doc.blocks, 'image');
  const sourceTables = countBlocks(doc.blocks, 'table');
  const pageImages = pag.pages.reduce((n, p) => n + countBlocks(p.blocks, 'image'), 0);
  const pageTables = pag.pages.reduce((n, p) => n + countBlocks(p.blocks, 'table'), 0);
  assert.equal(pageImages, sourceImages, `${label}: 图片丢失（源 ${sourceImages} → 页 ${pageImages}）`);
  assert.equal(pageTables, sourceTables, `${label}: 表格丢失（源 ${sourceTables} → 页 ${pageTables}）`);
  if (sourceImages) {
    const assets = (doc.embeddedAssets || []).length;
    assert.equal(assets, sourceImages, `${label}: 内嵌图片资产数量与图片块不一致（${assets} vs ${sourceImages}）`);
  }

  // 4. 标题层级必须保留（历史故障是把 80 个 Word 标题全降级成普通段落）
  const headings = doc.blocks.filter(b => /heading/i.test(String(b.style || '')) || Number(b.level) > 0);
  const subheads = doc.blocks.filter(b => b.style === 'subhead' || /subhead/i.test(String(b.style || '')));
  assert.ok(headings.length + subheads.length > 0, `${label}: 没有识别出任何标题层级`);

  // 5. 合并出来的页面标题必须仍在发布审计的 PAGE_TITLE_LONG 阈值（34 字）以内，
  //    否则导入器自己造出来的标题会被自己的审计判为过长。
  const longMerged = pag.pages.filter(p => p.mergedPages && String(p.title || '').length > 34);
  assert.equal(longMerged.length, 0,
    `${label}: ${longMerged.length} 个合并页标题超过 34 字：${longMerged.map(p => `${String(p.title).length}字「${String(p.title).slice(0, 40)}」`).join('；')}`);

  console.log(`  ${label}: ${pag.completeness.sourceBlocks} 块 → ${pag.pages.length} 页（总权重 ${total}），0 丢失、0 空页，图片 ${pageImages}/${sourceImages}、表格 ${pageTables}/${sourceTables} 保留，权重<400 的页 ${thin} 个`);
  return { doc, pag };
}

// ---- 发布审计的"有效内容"判定：只含表格的页面必须算作有内容。
// 审计脚本是 CLI，不能 import（顶层会真的跑一遍审计并写报告），所以只抽出
// textValues / meaningfulTextKeys / hasMeaningfulBlockContent 三个纯函数放进 vm 里跑。
async function checkAuditContentRule() {
  const source = await readFile(new URL('./audit-v3.mjs', import.meta.url), 'utf8');
  const from = source.indexOf('function textValues');
  const to = source.indexOf('function walkBlocks');
  assert.ok(from > 0 && to > from, '发布审计结构已变化：找不到 textValues / walkBlocks 锚点，请同步更新本回归');
  const context = vm.createContext({});
  const { hasMeaningfulBlockContent } = vm.runInContext(`${source.slice(from, to)}\n;({hasMeaningfulBlockContent});`, context);
  const cases = [
    ['普通正文', { type: 'paragraph', style: 'body', text: '正文' }, true],
    ['空段落', { type: 'paragraph', style: 'body', text: '   ' }, false],
    ['图片', { type: 'image', src: 'assets/image/a.png' }, true],
    ['有内容的表格', { type: 'table', rows: [['项目', '次数'], ['走访', '12']] }, true],
    ['只有空单元格的表格', { type: 'table', rows: [['', '  ']] }, false],
    ['带题注的表格', { type: 'table', rows: [['']], caption: '表 1 走访统计' }, true],
    ['双栏容器里只有表格', { type: 'container', columns: [{ blocks: [{ type: 'table', rows: [['走访', '12']] }] }] }, true],
    ['未知空块', { type: 'unknown', foo: 'bar' }, false]
  ];
  for (const [name, block, expected] of cases) {
    assert.equal(hasMeaningfulBlockContent(block), expected,
      `发布审计有效内容判定错误（${name}）：期望 ${expected}`);
  }
  console.log(`  发布审计有效内容判定：${cases.length} 个用例通过（表格不再被误判为空白页）`);
}

// ---- 发布状态里的「页面是否有内容」判定：同一类问题。hasPageContent 只看 text/title 等
// 字段，表格的文字在 rows 里，于是「整页就是一张表格」的数据页被判成空页，直接拉低内容
// 完整度与页面健康。这里同样抽出纯函数在 vm 里验证。
async function checkPublicationContentRule() {
  const source = await readFile(new URL('./lib-v3-publication.mjs', import.meta.url), 'utf8');
  const from = source.indexOf('function textOfRich');
  const to = source.indexOf('function validHttpish');
  assert.ok(from > 0 && to > from, '发布状态模块结构已变化：找不到 textOfRich / validHttpish 锚点，请同步更新本回归');
  const context = vm.createContext({});
  const { hasPageContent } = vm.runInContext(`${source.slice(from, to)}\n;({hasPageContent});`, context);
  const cases = [
    ['只有一张有内容的表格', { blocks: [{ type: 'table', rows: [['项目', '次数'], ['走访', '12']] }] }, true],
    ['只有空单元格的表格', { blocks: [{ type: 'table', rows: [['', '  ']] }] }, false],
    ['普通正文页', { blocks: [{ type: 'paragraph', style: 'body', text: '正文' }] }, true],
    ['空段落页', { blocks: [{ type: 'paragraph', style: 'body', text: '   ' }] }, false],
    ['没有内容块', { blocks: [] }, false],
    ['双栏容器里只有表格', { blocks: [{ type: 'container', columns: [{ blocks: [{ type: 'table', rows: [['走访', '12']] }] }] }] }, true]
  ];
  for (const [name, page, expected] of cases) {
    assert.equal(hasPageContent(page), expected,
      `发布状态页面内容判定错误（${name}）：期望 ${expected}`);
  }
  console.log(`  发布状态页面内容判定：${cases.length} 个用例通过（表格页不再被算作空页）`);
}

const fixture = await buildFixtureDocx();
try {
  console.log('导入完整性回归：');
  const { doc: syntheticDoc, pag: synthetic } = await checkDocument(fixture.file, { label: '合成陷阱样本', minPages: 2 });

  // 自闭合空段落不得吞掉后面的表格
  assert.equal(syntheticDoc.stats.tables, 1,
    `<w:p/> 后紧跟的表格没有被识别成表格块（表格数 ${syntheticDoc.stats.tables}）：自闭合段落会吞掉紧随其后的元素`);
  // 首屏先有图片时，刊头行仍然是标题
  assert.equal(syntheticDoc.title, LEAD_LABEL,
    `首屏出现图片后标题取错：期望「${LEAD_LABEL}」，实际「${syntheticDoc.title}」`);
  // 样式里定义的列表必须变回带角标的列表项，而不是普通正文
  const pageBlocks = synthetic.pages.flatMap(p => p.blocks || []);
  const cards = pageBlocks.filter(b => b.type === 'cardline');
  const cardWith = probe => cards.find(b => String(b.text || '').includes(probe));
  assert.ok(cards.some(b => String(b.badge) === '•'), '项目符号列表没有转成带 • 角标的列表项（样式名 ListBullet 路径）');
  assert.ok(cards.some(b => String(b.badge) === '1'), '编号列表没有转成带编号角标的列表项（样式名 ListNumber 路径）');
  assert.ok(cardWith('自定义样式项目符号'), '自定义列表样式没有被识别：styles.xml 里的 <w:numPr> 没有生效');
  assert.ok(cardWith('第一步停一停') && String(cardWith('第一步停一停').badge) === '1', '编号列表项没有按顺序编号');
  assert.ok(!pageBlocks.some(b => b.type === 'paragraph' && /每月安排一次主题学习交流/.test(String(b.text || ''))),
    '列表项仍然被当成普通正文段落输出');

  const text = pageText(synthetic.pages);
  for (const probe of ['第一版块 时政要闻', '常览国事 初心永驻', '居家安全微课堂', '卫生间铺防滑垫', '九月特别策划']) {
    assert.ok(text.includes(probe), `合成样本：页面里找不到「${probe}」`);
  }

  await checkAuditContentRule();
  await checkPublicationContentRule();

  const realDocx = process.env.REAL_DOCX;
  if (realDocx) {
    await checkDocument(realDocx, { label: `真实稿件 ${path.basename(realDocx)}`, minPages: 5 });
  } else {
    console.log('  （未设置 REAL_DOCX，跳过真实稿件校验）');
  }
  console.log('导入完整性回归通过：结构标记保留、序号前缀不丢、无空页、无静默截断，图片/表格/列表结构不退化。');
} finally {
  const { rm: remove } = await import('node:fs/promises');
  await remove(fixture.dir, { recursive: true, force: true }).catch(() => {});
}
