from pathlib import Path


def replace_once(path, old, new, label):
    p=Path(path); s=p.read_text()
    if old not in s:
        raise SystemExit(f'{label} drifted: {path}')
    p.write_text(s.replace(old,new,1))

# Studio shell: five-step main flow and keep media as a secondary tool.
replace_once('src/studio/index.html', '''        <nav class="studio-mode-nav" id="studioModeNav" aria-label="制作中心主功能">
          <button type="button" id="studioContentBtn" class="active" data-studio-entry="content" aria-current="page">内容</button>
          <button type="button" id="mediaLibraryBtn" data-studio-entry="media" title="图片、视频、音频、朗读和精选设计素材">素材</button>
          <button type="button" id="designBtn" class="design-main" data-studio-entry="design" title="主题、页面与当前组件的样式设计">设计</button>
          <button type="button" class="final-gate-open" id="finalGateBtn" data-studio-entry="publish">发布</button>
        </nav>
        <button type="button" id="auditBtn" class="studio-check-chip" title="打开工作台检查；提示项不阻断继续制作"><span>检查</span><b id="auditEntryCount">未检查</b></button>
         <details class="action-menu advanced-menu"><summary>更多</summary><div class="action-popover"><button type="button" id="quickImportBtn">导入内容</button>''', '''        <nav class="studio-mode-nav studio-flow-nav" id="studioModeNav" aria-label="建刊、内容、排版、检查、发布五步流程">
          <button type="button" id="studioBuildBtn" data-studio-entry="build" title="创建新一期">1 建刊</button>
          <button type="button" id="studioContentBtn" class="active" data-studio-entry="content" aria-current="page">2 内容</button>
          <button type="button" id="designBtn" class="design-main" data-studio-entry="design" title="页面布局、主题和组件样式">3 排版</button>
          <button type="button" id="auditBtn" class="studio-check-chip" data-studio-entry="check" title="运行检查并定位问题"><span>4 检查</span><b id="auditEntryCount">未检查</b></button>
          <button type="button" class="final-gate-open" id="finalGateBtn" data-studio-entry="publish">5 发布</button>
        </nav>
         <details class="action-menu advanced-menu"><summary>更多</summary><div class="action-popover"><button type="button" id="mediaLibraryBtn" data-studio-entry="media">素材库</button><button type="button" id="quickImportBtn">导入内容</button>''', 'studio five-step nav')

replace_once('src/studio/index.html', '''<dialog id="newDialog"><form method="dialog" id="newForm"><h3>创建新一期</h3><label>本期主题<input id="newSubtitle" required maxlength="120" placeholder="例如：金秋敬老 · 初心如磐"></label><label>期名（可选）<input id="newLabel" maxlength="40" placeholder="留空自动生成"></label><label>栏目结构<select id="newCloneFrom"><option value="">使用标准新刊模板</option></select><span class="field-note">可复制既有 V3 期刊的页面/内容块结构，但不会复制媒体文件和旧文章正文。</span></label><div class="dialog-actions"><button value="cancel">取消</button><button class="primary" value="default" id="confirmNew">创建</button></div></form></dialog>''', '''<dialog id="newDialog" class="new-issue-dialog"><form method="dialog" id="newForm"><div class="dialog-head"><div><span class="eyebrow">CREATE ISSUE</span><h3>创建新一期</h3><p>先选起点，再进入“内容 → 排版 → 检查 → 发布”。</p></div><button value="cancel" aria-label="关闭">×</button></div><label>本期主题<input id="newSubtitle" required maxlength="120" placeholder="例如：金秋敬老 · 初心如磐"></label><label>期名（可选）<input id="newLabel" maxlength="40" placeholder="留空自动生成"></label><fieldset class="new-start-modes"><legend>从哪里开始</legend><label class="new-start-card"><input type="radio" name="newStartMode" value="clone" checked><span><b>复制上期</b><small>沿用栏目与版式骨架；旧图片、视频、文章链接和朗读基线自动清空。</small></span></label><label class="new-start-card"><input type="radio" name="newStartMode" value="import"><span><b>导入稿件</b><small>先建立安全空刊，再直接进入 Word / Markdown / TXT 导入工作台。</small></span></label><label class="new-start-card"><input type="radio" name="newStartMode" value="template"><span><b>套整刊模板</b><small>使用完整刊型，而不是单页模板或只换主题色。</small></span></label></fieldset><label id="newCloneField">复制来源<select id="newCloneFrom"><option value="">请选择上一期</option></select><span class="field-note">只复制结构和可复用设计；媒体路径、TTS 生成结果、文章绑定与旧发布状态不会继承。</span></label><label id="newTemplateField" class="hidden">整刊模板<select id="newWholeTemplate"><option value="comprehensive">单位综合刊</option><option value="gallery">活动图集</option><option value="study">学习专题</option></select><span class="field-note">三套模板均包含栏目页、页眉页脚、字号层级、品牌色、图片比例与品牌锁定。</span></label><div id="newImportField" class="new-import-hint hidden"><b>创建后立即导入</b><span>新刊创建完成后自动打开“文件导入”，不会要求再寻找入口。</span></div><div class="dialog-actions"><button value="cancel">取消</button><button class="primary" value="default" id="confirmNew">创建并继续</button></div></form></dialog>''', 'new issue start modes')

# Frontend behavior for three starts.
replace_once('src/studio/studio.js', '''function renderCloneOptions() { const sel=$('#newCloneFrom'); if(!sel)return; const current=sel.value; sel.innerHTML='<option value="">使用标准新刊模板</option>'+state.issues.filter(x=>x.engine==='v3').map(x=>`<option value="${escText(x.id)}">复制 ${escText(x.label||x.id)} 的栏目结构 · ${x.pageCount||'?'} 页</option>`).join(''); if([...sel.options].some(o=>o.value===current))sel.value=current; }''', '''function renderCloneOptions() { const sel=$('#newCloneFrom'); if(!sel)return; const current=sel.value; const rows=state.issues.filter(x=>x.engine==='v3').sort((a,b)=>String(b.id).localeCompare(String(a.id),undefined,{numeric:true})); sel.innerHTML='<option value="">请选择上一期</option>'+rows.map(x=>`<option value="${escText(x.id)}">${escText(x.label||x.id)} · ${x.pageCount||'?'} 页</option>`).join(''); if([...sel.options].some(o=>o.value===current))sel.value=current; else if(rows[0])sel.value=rows[0].id; }''', 'clone source options')

replace_once('src/studio/studio.js', '''$('#newIssue').onclick = () => { $('#newSubtitle').value=''; $('#newLabel').value=''; renderCloneOptions(); $('#newCloneFrom').value=''; $('#newDialog').showModal(); };
$('#newForm').addEventListener('submit',async e => { if (e.submitter?.value === 'cancel') return; e.preventDefault(); const subtitle = $('#newSubtitle').value.trim(); if (!subtitle) return; try { const x = await api('/api/issues',{method:'POST',body:JSON.stringify({subtitle,label:$('#newLabel').value.trim(),cloneFrom:$('#newCloneFrom').value||''})}); $('#newDialog').close(); toast(`已创建 ${x.issue.id}`); await loadIssues(x.issue.id); } catch(err) { toast(err.message,2600); } });''', '''function selectedNewStartMode(){return document.querySelector('input[name="newStartMode"]:checked')?.value||'clone';}
function syncNewStartModeUi(){const mode=selectedNewStartMode();$('#newCloneField')?.classList.toggle('hidden',mode!=='clone');$('#newTemplateField')?.classList.toggle('hidden',mode!=='template');$('#newImportField')?.classList.toggle('hidden',mode!=='import');}
function openNewIssueDialog(){ $('#newSubtitle').value=''; $('#newLabel').value=''; renderCloneOptions(); const radio=document.querySelector('input[name="newStartMode"][value="clone"]');if(radio)radio.checked=true;syncNewStartModeUi();$('#newDialog').showModal(); }
$('#newIssue').onclick = openNewIssueDialog;
$('#studioBuildBtn')?.addEventListener('click',openNewIssueDialog);
document.querySelectorAll('input[name="newStartMode"]').forEach(r=>r.addEventListener('change',syncNewStartModeUi));
$('#newForm').addEventListener('submit',async e => { if (e.submitter?.value === 'cancel') return; e.preventDefault(); const subtitle = $('#newSubtitle').value.trim(); if (!subtitle) return; const startMode=selectedNewStartMode(); const cloneFrom=startMode==='clone'?($('#newCloneFrom').value||''):''; const templateId=startMode==='template'?($('#newWholeTemplate').value||'comprehensive'):''; if(startMode==='clone'&&!cloneFrom)return toast('请选择要复制的上一期',2600); try { const x = await api('/api/issues',{method:'POST',body:JSON.stringify({subtitle,label:$('#newLabel').value.trim(),startMode,cloneFrom,templateId})}); $('#newDialog').close(); toast(`已创建 ${x.issue.id} · ${startMode==='clone'?'复制上期':startMode==='import'?'导入稿件':'整刊模板'}`); await loadIssues(x.issue.id); if(startMode==='import')openImportDialog('file'); else if(startMode==='template')setStudioEntry('design'); else setStudioEntry('content'); } catch(err) { toast(err.message,3200); } });''', 'new issue submit flow')

# Server: template integration and brand-lock enforcement.
replace_once('scripts/studio-v3.mjs', "import { normalizeRichText, renderRichText } from '../src/reader/rich-text.js';", "import { normalizeRichText, renderRichText } from '../src/reader/rich-text.js';\nimport { WHOLE_MAGAZINE_TEMPLATES, applyWholeMagazineTemplate } from '../src/studio/whole-magazine-templates.js';", 'whole template import')
replace_once('scripts/studio-v3.mjs', "  if (u.pathname==='/api/issues'&&req.method==='GET') return send(res,200,await issueSummaries());", "  if (u.pathname==='/api/issues'&&req.method==='GET') return send(res,200,await issueSummaries());\n  if (u.pathname==='/api/whole-magazine-templates'&&req.method==='GET') return send(res,200,{templates:WHOLE_MAGAZINE_TEMPLATES});", 'template listing API')

replace_once('scripts/studio-v3.mjs', '''    let cloneSource=null;
    if(data.cloneFrom){const sourceId=normalizeIssueId(data.cloneFrom);const sourceFile=path.join(root,'issues',sourceId,'issue.json');if(!(await exists(sourceFile)))return send(res,400,{error:`结构来源 ${sourceId} 不存在`,code:'VALIDATION_ERROR'});cloneSource=await readJson(sourceFile);if(cloneSource.engine!=='v3')return send(res,400,{error:'只能复制 V3 期刊结构',code:'VALIDATION_ERROR'});if(!Array.isArray(cloneSource.pages)||cloneSource.pages.length<1||cloneSource.pages.length>200)return send(res,400,{error:'结构来源页面数量不在 1–200 页允许范围内',code:'VALIDATION_ERROR'});}''', '''    const allowedStartModes=new Set(['clone','import','template','blank']);
    const startMode=allowedStartModes.has(String(data.startMode||''))?String(data.startMode):(data.cloneFrom?'clone':data.templateId?'template':'blank');
    const templateId=String(data.templateId||'').trim();
    if(startMode==='template'&&!WHOLE_MAGAZINE_TEMPLATES.some(x=>x.id===templateId))return send(res,400,{error:'请选择有效的整刊模板',code:'VALIDATION_ERROR'});
    let cloneSource=null;
    if(startMode==='clone'){if(!data.cloneFrom)return send(res,400,{error:'复制上期需要选择来源期刊',code:'VALIDATION_ERROR'});const sourceId=normalizeIssueId(data.cloneFrom);const sourceFile=path.join(root,'issues',sourceId,'issue.json');if(!(await exists(sourceFile)))return send(res,400,{error:`结构来源 ${sourceId} 不存在`,code:'VALIDATION_ERROR'});cloneSource=await readJson(sourceFile);if(cloneSource.engine!=='v3')return send(res,400,{error:'只能复制 V3 期刊结构',code:'VALIDATION_ERROR'});if(!Array.isArray(cloneSource.pages)||cloneSource.pages.length<1||cloneSource.pages.length>200)return send(res,400,{error:'结构来源页面数量不在 1–200 页允许范围内',code:'VALIDATION_ERROR'});}''', 'new issue start mode server')

replace_once('scripts/studio-v3.mjs', '''    if (cloneSource) {
      const targetFile=path.join(root,'issues',created.id,'issue.json'); const target=await readJson(targetFile); const cloned=cloneStructure(cloneSource,target); validateIssue(cloned,created.id); await writeFile(targetFile,`${JSON.stringify(cloned,null,2)}\
`,'utf8'); await runScriptAsync('sync-assets-v3.mjs',['--issue',created.id]); created.pageCount=cloned.pages.length;
    }
    const createdIssue=await readJson(path.join(root,'issues',created.id,'issue.json'));const source=await writeSourceReceipt(created.id,createdIssue,{reason:'issue-created'});
    return send(res,201,{issue:created,output:r.output,source});''', '''    if (cloneSource) {
      const targetFile=path.join(root,'issues',created.id,'issue.json'); const target=await readJson(targetFile); const cloned=cloneStructure(cloneSource,target); validateIssue(cloned,created.id); await writeFile(targetFile,`${JSON.stringify(cloned,null,2)}\
`,'utf8'); await runScriptAsync('sync-assets-v3.mjs',['--issue',created.id]); created.pageCount=cloned.pages.length;
    } else if(startMode==='template') {
      const targetFile=path.join(root,'issues',created.id,'issue.json'); const target=await readJson(targetFile); const templated=applyWholeMagazineTemplate(templateId,target); validateIssue(templated,created.id); await atomicWriteText(targetFile,`${JSON.stringify(templated,null,2)}\n`); await runScriptAsync('sync-assets-v3.mjs',['--issue',created.id]); created.pageCount=templated.pages.length; created.wholeTemplate=templated.wholeTemplate;
    }
    const createdIssue=await readJson(path.join(root,'issues',created.id,'issue.json'));const source=await writeSourceReceipt(created.id,createdIssue,{reason:`issue-created:${startMode}`});
    return send(res,201,{issue:created,output:r.output,source,startMode,next:startMode==='import'?'import':startMode==='template'?'layout':'content'});''', 'template application server')

server_anchor='const server=http.createServer(async(req,res)=>{try{'
p=Path('scripts/studio-v3.mjs'); s=p.read_text()
if server_anchor not in s: raise SystemExit('server anchor drifted')
brand_code='''function readBrandField(issue,field){return String(field).split('.').reduce((value,key)=>value==null?undefined:value[key],issue);}\nfunction assertBrandLock(fresh,next){const lock=fresh?.brandLock;if(!lock?.enabled)return;if(next?.brandLock?.enabled!==true)throw Object.assign(new Error('当前整刊模板启用了品牌锁定；不能通过普通保存关闭锁定。'),{code:'BRAND_LOCKED'});for(const field of lock.lockedFields||[]){if(JSON.stringify(readBrandField(fresh,field))!==JSON.stringify(readBrandField(next,field)))throw Object.assign(new Error(`品牌锁定项不可修改：${field}`),{code:'BRAND_LOCKED',field});}}\n\n'''
s=s.replace(server_anchor,brand_code+server_anchor,1)
p.write_text(s)
replace_once('scripts/studio-v3.mjs', "try{validateIssue(data,id)}catch(e){return send(res,400,{error:e.message||String(e),code:'VALIDATION_ERROR'})}", "try{assertBrandLock(freshIssue,data);validateIssue(data,id)}catch(e){return send(res,400,{error:e.message||String(e),code:e.code||'VALIDATION_ERROR',field:e.field||null})}", 'brand lock save guard')

# Reader renders template page chrome (headers/footers) inside the actual page.
replace_once('src/reader/reader.js', '''  const legacyBody = (page.body || []).map((text) => `<p class="body">${escapeHtml(text)}</p>`).join("");
  const body = legacyBody + (page.blocks || []).map((block,bi)=>renderBlock(block,{pageIndex:index,blockIndex:bi,blockId:block?.id})).join("");
  const publishing = normalizePagePublishing(page);''', '''  const legacyBody = (page.body || []).map((text) => `<p class="body">${escapeHtml(text)}</p>`).join("");
  const chromeValue=value=>escapeHtml(String(value||'').replaceAll('{page}',String(Math.max(1,index+1))).replaceAll('{total}',String(state.issue?.pages?.length||1)));
  const chromeHeader=page.chrome?.header?`<div class="magazine-page-chrome magazine-page-header">${chromeValue(page.chrome.header)}</div>`:'';
  const chromeFooter=page.chrome?.footer?`<div class="magazine-page-chrome magazine-page-footer">${chromeValue(page.chrome.footer)}</div>`:'';
  const body = chromeHeader + legacyBody + (page.blocks || []).map((block,bi)=>renderBlock(block,{pageIndex:index,blockIndex:bi,blockId:block?.id})).join("") + chromeFooter;
  const publishing = normalizePagePublishing(page);''', 'reader page chrome')

# Styling appended as isolated P1 markers.
for path, marker, css in [
('src/studio/studio.css','P1-02 studio flow',r'''
/* P1-02 studio flow */
.studio-flow-nav{display:flex;align-items:center;gap:4px;padding:4px;border-radius:14px;background:rgba(255,255,255,.58)}
.studio-flow-nav>button{min-height:40px;padding:0 12px;white-space:nowrap}
.studio-flow-nav .studio-check-chip{display:inline-flex;align-items:center;gap:5px}
.studio-flow-nav .studio-check-chip b{font-size:10px;font-weight:600;opacity:.72}
.new-issue-dialog{width:min(680px,calc(100vw - 24px))}
.new-start-modes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;border:0;padding:0;margin:14px 0}
.new-start-modes legend{font-weight:700;margin-bottom:8px}
.new-start-card{display:flex!important;gap:9px;align-items:flex-start;padding:14px!important;border:1px solid rgba(95,72,57,.18);border-radius:14px;background:rgba(255,255,255,.55);cursor:pointer}
.new-start-card input{margin-top:3px}.new-start-card span{display:grid;gap:5px}.new-start-card b{font-size:14px}.new-start-card small{line-height:1.5;color:var(--muted,#786c63)}
.new-import-hint{display:grid;gap:4px;padding:12px 14px;border-radius:12px;background:rgba(49,95,134,.08);margin:10px 0}.new-import-hint span{font-size:12px;color:var(--muted,#786c63)}
@media(max-width:760px){.studio-flow-nav{overflow-x:auto;max-width:100%}.studio-flow-nav>button{min-width:max-content}.new-start-modes{grid-template-columns:1fr}}
'''),
('src/reader/reader.css','P1-03 whole template page chrome',r'''
/* P1-03 whole template page chrome */
.magazine-page-chrome{position:relative;z-index:2;font-size:11px;letter-spacing:.08em;color:color-mix(in srgb,currentColor 62%,transparent);display:flex;align-items:center;min-height:22px}
.magazine-page-header{margin:0 0 12px;padding-bottom:7px;border-bottom:1px solid color-mix(in srgb,var(--red) 22%,transparent)}
.magazine-page-footer{margin:14px 0 0;padding-top:7px;border-top:1px solid color-mix(in srgb,var(--red) 18%,transparent);justify-content:flex-end}
@media(max-width:760px){.magazine-page-chrome{font-size:10px}.magazine-page-header{margin-bottom:9px}.magazine-page-footer{margin-top:10px}}
''')]:
    p=Path(path); s=p.read_text()
    if marker not in s: p.write_text(s.rstrip()+"\n"+css.strip()+"\n")
