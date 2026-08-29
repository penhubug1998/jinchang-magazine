function esc(s=''){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function badge(status=''){
  const map={published:'已发布',ready:'待发布',draft:'草稿','migration-preview-alpha4':'迁移预览','migration-preview-alpha5':'迁移预览'};
  return map[status] || status || '未知';
}
export function catalogHref(issue) {
  if (issue.engine !== 'legacy') return `./${issue.id}/`;
  const raw = String(issue.legacyPath || '').replace(/\\/g,'/').replace(/\/$/,'');
  const leaf = raw.split('/').filter(Boolean).at(-1) || String(Number(issue.id) || issue.id);
  return `../${leaf}/`;
}

export function buildArchiveHtml(catalog, options={}) {
  const title = options.title || '中国人民银行金昌市分行离退休干部电子期刊';
  const subtitle = options.subtitle || '银龄阅刊 · 岁月常新';
  const cards = catalog.map((item) => `
    <a class="issue-card" href="${esc(item.href)}" data-status="${esc(item.status)}">
      <div class="issue-top"><span class="issue-no">${esc(item.label)}</span><span class="badge">${esc(badge(item.status))}</span></div>
      <h2>${esc(item.subtitle || item.label)}</h2>
      <p>${esc(item.publication || title)}</p>
      <div class="issue-meta"><span>${item.pageCount ? `${item.pageCount} 页` : '历史版本'}</span><span>${item.engine === 'v3' ? 'V3 阅读器' : '经典阅读器'}</span></div>
      <span class="open">进入阅读 →</span>
    </a>`).join('\n');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#7a1717"><title>${esc(title)}</title>
<style>
:root{--red:#7f1d1d;--gold:#c9a86a;--ink:#312a26;--paper:#fbf7ef}*{box-sizing:border-box}html,body{margin:0;min-height:100%;font-family:"Noto Serif SC","Source Han Serif SC","Songti SC",serif;background:#181412;color:#f8ead6}body{background:radial-gradient(circle at 18% 8%,rgba(201,168,106,.16),transparent 28%),radial-gradient(circle at 84% 82%,rgba(127,29,29,.22),transparent 32%),linear-gradient(145deg,#332a25,#171311 68%)}.shell{width:min(1120px,calc(100% - 28px));margin:auto;padding:48px 0 64px}.hero{padding:28px 6px 32px;border-bottom:1px solid rgba(255,255,255,.12);margin-bottom:24px}.kicker{color:#e0bd7a;letter-spacing:.2em;font-size:12px}.hero h1{margin:10px 0 8px;font-size:clamp(28px,4vw,48px);line-height:1.25}.hero p{margin:0;color:rgba(255,239,216,.7);font-size:14px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.issue-card{display:block;min-height:235px;padding:24px;border-radius:24px;background:linear-gradient(160deg,rgba(255,250,240,.98),rgba(244,234,216,.96));color:var(--ink);text-decoration:none;border:1px solid rgba(255,255,255,.3);box-shadow:0 22px 48px rgba(0,0,0,.2);transition:transform .18s,box-shadow .18s}.issue-card:hover{transform:translateY(-3px);box-shadow:0 28px 60px rgba(0,0,0,.27)}.issue-top{display:flex;align-items:center;justify-content:space-between;gap:12px}.issue-no{color:var(--red);font-weight:700}.badge{font-size:11px;padding:5px 9px;border-radius:999px;background:rgba(127,29,29,.08);color:#81504a}.issue-card h2{margin:30px 0 10px;color:#6d1b19;font-size:clamp(21px,2.4vw,29px);line-height:1.4}.issue-card p{margin:0;color:#7a6a5f;font-size:12px}.issue-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.issue-meta span{font-size:11px;border:1px solid #dfd0bd;border-radius:999px;padding:5px 8px;color:#756354}.open{display:block;margin-top:22px;color:#8a271f;font-size:12px;font-weight:700}.foot{margin-top:30px;color:rgba(255,239,216,.55);font-size:11px;text-align:center}@media(max-width:720px){.shell{padding-top:22px}.grid{grid-template-columns:1fr}.issue-card{min-height:205px}.hero{padding-top:12px}}
</style></head><body><main class="shell"><section class="hero"><div class="kicker">DIGITAL MAGAZINE ARCHIVE</div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></section><section class="grid">${cards || '<p>暂无可展示期刊。</p>'}</section><div class="foot">V3 期刊归档页 · 由构建系统自动生成</div></main></body></html>`;
}
