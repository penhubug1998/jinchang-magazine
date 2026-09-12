// Real-draft flow test: import the actual issue-004 Word manuscript into a
// sandbox, build the issue, run the production audit and the strict
// publication pre-check. NEVER publishes and NEVER touches production.
//
// Run from the repository root: node scripts/flow-real-draft-v3.mjs
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { createTestWorkspace, startTestStudio, stopTestStudio, removeTestWorkspace } from './lib-v3-test-workspace.mjs';

const DOCX = process.env.FLOW_DOCX || '/tmp/jc-fixture/issue004.docx';
const TARGET_CHARS = Number(process.env.FLOW_TARGET_CHARS || 760);
const report = [];
const say = (...a) => { const l = a.join(' '); report.push(l); console.log(l); };
const section = t => say(`\n## ${t}`);

const walkBlocks = (blocks, fn) => { for (const b of blocks || []) { fn(b); if (b?.columns) for (const c of b.columns) walkBlocks(c.blocks, fn); } };
function replaceAssetRef(pages, from, to) { for (const page of pages || []) walkBlocks(page.blocks, b => { if (b?.src === from) b.src = to; if (b?.poster === from) b.poster = to; }); }
const countBlocks = (blocks, fn) => { let n = 0; for (const b of blocks || []) { if (fn(b)) n++; if (b?.columns) for (const c of b.columns) n += countBlocks(c.blocks, fn); } return n; };
const allBlocks = (pages, fn) => { const out = []; for (const p of pages || []) walkBlocks(p.blocks, b => { const v = fn(b); if (v !== undefined) out.push(v); }); return out; };

let sandbox, studio;
const t0 = Date.now();
try {
  section('0. 准备沙盒');
  sandbox = await createTestWorkspace('real-draft');
  await mkdir(path.join(sandbox, 'issues'), { recursive: true });
  const bytes = await readFile(DOCX);
  say(`稿件：${path.basename(DOCX)} · ${bytes.length} bytes`);
  studio = await startTestStudio(sandbox);
  const api = async (route, init) => {
    const r = await fetch(studio.base + route, init);
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: r.status, body: json, text };
  };
  say(`沙盒：${sandbox}`);

  section('1. 建刊（导入稿件起点）');
  const created = await api('/api/issues', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startMode: 'import', subtitle: '银龄秋韵映初心 桑榆奋进正当时', label: '第四期' }) });
  const id = created.body?.issue?.id;
  say(`新建一期：HTTP ${created.status} · id=${id} · 下一步=${created.body?.next}`);
  if (!id) throw new Error('建刊失败：' + created.text.slice(0, 300));

  section(`2. 导入 Word（targetChars=${TARGET_CHARS}）`);
  const parsed = await api(`/api/import/parse?filename=${encodeURIComponent('老干部电子期刊（第四期）.docx')}&targetChars=${TARGET_CHARS}&structureMode=auto`, {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent('老干部电子期刊（第四期）.docx') }, body: bytes
  });
  if (parsed.status !== 200) throw new Error(`导入失败 HTTP ${parsed.status}：${parsed.text.slice(0, 400)}`);
  const doc = parsed.body.document, pag = parsed.body.pagination;
  const headingCount = countBlocks(doc.blocks, b => ['heading'].includes(b.type));
  const paraCount = countBlocks(doc.blocks, b => b.type === 'paragraph');
  const imageCount = countBlocks(doc.blocks, b => b.type === 'image');
  const tableCount = countBlocks(doc.blocks, b => b.type === 'table');
  const richCount = countBlocks(doc.blocks, b => Boolean(b.richText));
  const linkedCount = countBlocks(doc.blocks, b => Array.isArray(b.links) && b.links.length > 0);
  say(`识别结果：title="${doc.title}"`);
  say(`  format=${doc.format} · 内容块 ${doc.blocks.length}（段落 ${paraCount} / 标题 ${headingCount} / 图片 ${imageCount} / 表格 ${tableCount}）`);
  say(`  富文本块 ${richCount} · 含链接块 ${linkedCount} · 内嵌图片资产 ${(doc.embeddedAssets || []).length}`);
  say(`  识别到的整期结构：kind=${doc.structure?.kind || '(无)'} · 版块数=${doc.structure?.sectionCount ?? '(无)'}`);
  if (doc.structure?.sections?.length) say('  版块：' + doc.structure.sections.map(x => x.name).join(' / '));
  say(`  文章库：${Object.keys(doc.articles || {}).length} 篇`);
  say(`自动分页：${pag.pages.length} 页 · 策略=${pag.strategy || pag.semanticTarget || '-'}`);
  say('  每页内容块数：' + pag.pages.map((p, i) => `${i + 1}:${(p.blocks || []).length}`).join(' '));

  const blockTotal = doc.blocks.length;
  const blockInPages = pag.pages.reduce((n, p) => n + (p.blocks || []).length, 0);
  const completeness = pag.completeness || { missing: [] };
  say(`完整性核对：解析块 ${blockTotal} → 页内块 ${blockInPages}`);
  say(`  对账结果：缺失 ${completeness.missing.length} 块${completeness.missing.length ? '（前 10 条）' : '（无丢失）'}`);
  for (const m of completeness.missing.slice(0, 10)) say(`    - [${m.style}] ${String(m.text).slice(0, 50)}`);
  const emptyPages = pag.pages.filter(p => (p.blocks || []).length === 0).length;
  const merged = pag.pages.filter(p => p.mergedPages).length;
  say(`  空页 ${emptyPages} 个 · 合并过的页 ${merged} 个`);

  section('3. 写入本期（复刻真实导入流程）');
  const issue0 = (await api(`/api/issues/${id}`)).body;
  const assetRoot = path.join(sandbox, 'issues', id, 'assets');
  await mkdir(path.join(assetRoot, 'image'), { recursive: true });
  for (const asset of doc.embeddedAssets || []) {
    await writeFile(path.join(assetRoot, 'image', asset.filename), Buffer.from(asset.base64, 'base64'));
    replaceAssetRef(pag.pages, asset.ref, `assets/image/${asset.filename}`);
  }
  const cover = issue0.pages.find(p => p.type === 'cover'), toc = issue0.pages.find(p => p.type === 'toc');
  cover.title = doc.title || '第四期';
  cover.blocks = (cover.blocks || []).map(b => b.type === 'coverSections' ? { ...b, items: (doc.structure?.sections || []).map(x => x.name) } : b);
  issue0.pages = [cover, toc, ...pag.pages];
  issue0.subtitle = doc.title || '第四期';
  issue0.publisher = '（测试单位）';
  issue0.status = 'ready';                       // 发布前校验需要 ready
  issue0.features ||= {}; issue0.features.narration ||= {};
  const source = (await api(`/api/issues/${id}/source-status`)).body;
  const saved = await api(`/api/issues/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ issue: issue0, sourceFingerprint: source.fingerprint }) });
  say(`保存：HTTP ${saved.status} · 共 ${issue0.pages.length} 页（封面+目录+${pag.pages.length} 内容页）`);

  section('4. 发布前校验（strict，等价于 npm run release:check）');
  const audit = await api(`/api/issues/${id}/audit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ strict: true }) });
  say(`严格审计接口：HTTP ${audit.status}${audit.status !== 200 ? ' — ' + audit.text.slice(0, 200) : ''}`);
  const status = await api(`/api/issues/${id}/publication/status?refresh=1`);
  const st = status.body;
  say(`审计：readiness=${audit.body?.readiness ?? st?.audit?.readiness} · score=${audit.body?.score ?? st?.audit?.score} · blockers=${st?.audit?.blockers ?? '?'} · warnings=${st?.audit?.warnings ?? '?'}`);
  say(`发布就绪：canPublish=${st?.canPublish} · hardReady=${st?.hardReady} · formalReady=${st?.formalReady}`);
  say(`原因：${st?.reason || '-'}`);
  const findings = [...(st?.audit?.findings || [])];
  const byCode = {};
  for (const f of findings) byCode[f.code] = (byCode[f.code] || 0) + 1;
  say('问题分布：' + (Object.keys(byCode).length ? Object.entries(byCode).map(([k, v]) => `${k}×${v}`).join(' · ') : '（无）'));
  say('\n逐条问题（前 25 条）：');
  for (const f of findings.slice(0, 25)) {
    const loc = f.location?.page ? `第 ${f.location.page} 页` : (f.location?.path || f.location?.field || '全局');
    say(`  [${f.severity === 'blocker' ? '阻断' : '提示'}] ${f.code} · ${loc} — ${String(f.message).slice(0, 90)}`);
  }
  if (findings.length > 25) say(`  … 其余 ${findings.length - 25} 条`);

  section('5. 页面级统计');
  const metrics = st?.metrics || {};
  say(`内容完整度 ${metrics.content}% · 页面健康 ${metrics.pageHealth}% · 媒体完整度 ${metrics.media}% · 无障碍 ${metrics.accessibility}%`);
  const pending = st?.completion?.pendingPages || [];
  say(`逐页完成：${st?.completion?.completePages}/${st?.completion?.pageCount} 页通过，待处理 ${pending.length} 页`);
  if (pending.length) say('  待处理页：' + pending.slice(0, 15).map(p => `${p.page}(${p.blockers}阻断/${p.warnings}提示)`).join(' '));

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  section(`耗时 ${elapsed}s · 未发布、未触碰生产`);
} catch (error) {
  say('\n流程中断：' + (error.stack || error));
} finally {
  try { await stopTestStudio(studio); } catch {}
  try { await removeTestWorkspace(sandbox); } catch {}
  await rm('/tmp/jc-flow-report.md', { force: true }).catch(() => {});
  await writeFile('/tmp/jc-flow-report.md', report.join('\n') + '\n').catch(() => {});
}
