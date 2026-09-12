// 导入完整性回归：确保真实稿件的每一个内容块都能进入成刊页面。
//
// 背景（2026-09-12 实测）：真实第四期稿件 419 个块导入后，有 77 个块被当作
// 结构标记消费后没有落回正文（版块标题、文章标题、☆/★ 特写标记），并且
// 自动分页把 9,000 字切成了 54 页、含 2 个空页。这个套件把当时的形态固化
// 成断言，防止再次出现"导入成功但少内容"。
//
// 用法：
//   node scripts/import-completeness-smoke-v3.mjs
//   REAL_DOCX=/path/to/real.docx node scripts/import-completeness-smoke-v3.mjs   # 用真实稿件再跑一遍
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
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

// 内联图片与表格：DOCX 里最常见的非文字对象，必须在导入与分页后都存在
const INLINE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
const TABLE_ROWS = [['项目', '第一季度', '第二季度'], ['走访慰问', '12 次', '15 次']];

function docxParts() {
  const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const imagePara = '<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
    + '<wp:extent cx="1524000" cy="1016000"/><wp:docPr id="1" name="图片 1" descr="测试插图"/>'
    + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
    + '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + '<pic:nvPicPr><pic:cNvPr id="1" name="image1.png"/><pic:cNvPicPr/></pic:nvPicPr>'
    + '<pic:blipFill><a:blip r:embed="rId10"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
    + '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1524000" cy="1016000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
    + '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  const tablePara = '<w:tbl><w:tblPr/><w:tblGrid/>' + TABLE_ROWS.map(row =>
    '<w:tr>' + row.map(cell => `<w:tc><w:p><w:r><w:t xml:space="preserve">${esc(cell)}</w:t></w:r></w:p></w:tc>`).join('') + '</w:tr>').join('') + '</w:tbl>';
  const body = PARAGRAPHS.map(([style, text], index) => {
    if (style === 'Heading2' && text === '一、防火灾') return imagePara + `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
    if (style === 'BodyText' && text === '防火灾正文。') return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>` + tablePara;
    void index;
    return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
  }).join('');
  const styles = ['Heading1', 'Heading2', 'Heading3'].map((name, index) => `<w:style w:type="paragraph" w:styleId="${name}"><w:name w:val="heading ${index + 1}"/></w:style>`).join('');
  return {
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
    'word/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${styles}</w:styles>`,
    'word/_rels/document.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>',
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    'word/media/image1.png': { __base64: INLINE_PNG_BASE64 }
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
  const countBlocks = (blocks, type) => {
    let n = 0;
    for (const b of blocks || []) {
      if (b?.type === type) n++;
      for (const col of b?.columns || []) n += countBlocks(col.blocks, type);
    }
    return n;
  };
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

  console.log(`  ${label}: ${pag.completeness.sourceBlocks} 块 → ${pag.pages.length} 页（总权重 ${total}），0 丢失、0 空页，图片 ${pageImages}/${sourceImages}、表格 ${pageTables}/${sourceTables} 保留，权重<400 的页 ${thin} 个`);
  return pag;
}

const fixture = await buildFixtureDocx();
try {
  console.log('导入完整性回归：');
  const synthetic = await checkDocument(fixture.file, { label: '合成陷阱样本', minPages: 2 });
  const text = pageText(synthetic.pages);
  for (const probe of ['第一版块 时政要闻', '常览国事 初心永驻', '居家安全微课堂', '卫生间铺防滑垫', '九月特别策划']) {
    assert.ok(text.includes(probe), `合成样本：页面里找不到「${probe}」`);
  }

  const realDocx = process.env.REAL_DOCX;
  if (realDocx) {
    await checkDocument(realDocx, { label: `真实稿件 ${path.basename(realDocx)}`, minPages: 5 });
  } else {
    console.log('  （未设置 REAL_DOCX，跳过真实稿件校验）');
  }
  console.log('导入完整性回归通过：结构标记保留、序号前缀不丢、无空页、无静默截断。');
} finally {
  const { rm: remove } = await import('node:fs/promises');
  await remove(fixture.dir, { recursive: true, force: true }).catch(() => {});
}
