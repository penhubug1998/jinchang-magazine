from pathlib import Path


def replace_once(path, old, new, label):
    p=Path(path); s=p.read_text()
    if old not in s:
        raise SystemExit(f'{label} drifted: {path}')
    p.write_text(s.replace(old,new,1))


def replace_between(path, start, end, new, label):
    p=Path(path); s=p.read_text(); i=s.find(start)
    if i<0: raise SystemExit(f'{label} start drifted: {path}')
    j=s.find(end,i)
    if j<0: raise SystemExit(f'{label} end drifted: {path}')
    p.write_text(s[:i]+new+s[j:])

# --- rich DOCX parser -------------------------------------------------------
replace_between('scripts/lib-v3-import.mjs','function finalizeDocument(doc) {','\n\nfunction parseDocxXml',r'''function finalizeDocument(doc) {
  const keep=b=>b?.text||b?.title||b?.type==='cardline'||b?.type==='articleLink'||b?.type==='image'||b?.type==='table';
  const blocks=(doc.blocks||[]).filter(keep);if(blocks.length>MAX_IMPORT_DOCUMENT_BLOCKS)throw importBlockLimitError(blocks.length);doc.blocks=blocks;doc.articles=doc.articles&&typeof doc.articles==='object'?doc.articles:{};doc.linkCount=Object.keys(doc.articles).length;
  const chars=b=>{if(!b||typeof b!=='object')return 0;if(b.type==='table')return (b.rows||[]).flat().reduce((n,x)=>n+String(x||'').length,0)+String(b.caption||'').length;if(b.type==='image')return String(b.caption||'').length+String(b.alt||'').length;return String(b.text||'').length+String(b.title||'').length+String(b.case||'').length+String(b.warning||'').length;};
  doc.embeddedAssets=Array.isArray(doc.embeddedAssets)?doc.embeddedAssets:[];doc.sourceMap=Array.isArray(doc.sourceMap)?doc.sourceMap:[];doc.richObjects=Array.isArray(doc.richObjects)?doc.richObjects:[];
  doc.stats={characters:doc.blocks.reduce((n,b)=>n+chars(b),0),blocks:doc.blocks.length,images:doc.blocks.filter(b=>b.type==='image').length,tables:doc.blocks.filter(b=>b.type==='table').length,embeddedAssets:doc.embeddedAssets.length}; return doc;
}

function docxParagraphRichText(fragment=''){
  const content=[];
  for(const rm of String(fragment).matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)){
    const run=rm[1],parts=[];
    for(const token of run.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?\s*>|<w:br\b[^>]*\/?\s*>/g)){
      if(token[1]!=null)parts.push(decodeXml(token[1]));else if(/^<w:tab/i.test(token[0]))parts.push('\t');else parts.push('\n');
    }
    const text=parts.join('');if(!text)continue;const marks=[];const props=(run.match(/<w:rPr\b[^>]*>([\s\S]*?)<\/w:rPr>/)||[])[1]||'';
    if(/<w:b(?:\s|\/|>)/i.test(props)&&!/<w:b\b[^>]*w:val="(?:0|false|off)"/i.test(props))marks.push({type:'bold'});
    if(/<w:i(?:\s|\/|>)/i.test(props)&&!/<w:i\b[^>]*w:val="(?:0|false|off)"/i.test(props))marks.push({type:'italic'});
    if(/<w:u(?:\s|\/|>)/i.test(props)&&!/<w:u\b[^>]*w:val="(?:none|0|false|off)"/i.test(props))marks.push({type:'underline'});
    content.push({type:'text',text,...(marks.length?{marks}:{})});
  }
  return {type:'doc',content:[{type:'paragraph',content}]};
}
function docxCellText(fragment=''){return cleanText([...String(fragment).matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map(x=>decodeXml(x[1])).join(' '));}
function docxTableBlock(fragment='',caption='',sourceRef={}){
  const rows=[];for(const tr of String(fragment).matchAll(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g)){const row=[];for(const tc of tr[1].matchAll(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g))row.push(docxCellText(tc[1]).slice(0,2000));if(row.length)rows.push(row.slice(0,12));if(rows.length>=40)break;}
  const first=String(fragment).match(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/)?.[1]||'';const headerRows=/<w:b(?:\s|\/|>)/i.test(first)?1:0;
  return {type:'table',rows,headerRows,caption:String(caption||'').slice(0,300),sourceRef};
}
function docxImageAlt(fragment=''){const attrs=(String(fragment).match(/<wp:docPr\b([^>]*)\/?\s*>/i)||[])[1]||'';for(const key of ['descr','title','name']){const m=attrs.match(new RegExp(`\\b${key}="([^"]*)"`,'i'));if(m?.[1])return decodeXml(m[1]).slice(0,300);}return 'Word 内嵌图片';}
function richObjectTarget(pages=[],obj={}){
  const section=cleanText(obj.section||''),article=stripNumberPrefix(obj.article||'');let index=-1;
  if(section&&article)index=pages.findIndex(p=>cleanText(p.section||'')===section&&[p.title,p.navTitle].some(x=>cleanText(x||'').includes(article)));
  if(index<0&&section){for(let i=pages.length-1;i>=0;i--)if(cleanText(pages[i]?.section||'')===section){index=i;break;}}
  if(index<0)index=Math.max(0,pages.length-1);return index;
}
function mergeRichDocxObjects(doc,pages=[]){for(const obj of doc?.richObjects||[]){if(!obj?.block)continue;const i=richObjectTarget(pages,obj);if(!pages[i])continue;pages[i].blocks ||= [];pages[i].blocks.push(JSON.parse(JSON.stringify(obj.block)));}return pages;}

function parseDocxXml(xml,filename='',relationships={},embeddedAssets={}) {
  const registry=createLinkRegistry(),paras=[],blocks=[],sourceMap=[],richObjects=[];let title='',listNo=0,paragraphNo=0,tableNo=0,currentSection='',currentArticle='',pendingCaption='';
  const body=(String(xml).match(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/)||[])[1]||String(xml);const elements=[...body.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>|<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g)].map(x=>x[0]);
  const addBlock=(block,source,rich=false)=>{if(!block)return;blocks.push(block);sourceMap.push({blockIndex:blocks.length-1,...source});if(rich)richObjects.push({section:currentSection,article:currentArticle,order:source.element,block});};
  for(let elementIndex=0;elementIndex<elements.length;elementIndex++){
    const element=elements[elementIndex];
    if(/^<w:tbl\b/i.test(element)){
      tableNo++;const sourceRef={format:'docx',sourceName:filename,element:elementIndex+1,table:tableNo};const table=docxTableBlock(element,pendingCaption,sourceRef);pendingCaption='';if(table.rows.length)addBlock(table,sourceRef,true);continue;
    }
    paragraphNo++;const inner=(element.match(/^<w:p\b[^>]*>([\s\S]*?)<\/w:p>$/)||[])[1]||'';const texts=[...inner.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map(x=>decodeXml(x[1])).join('');const rawText=cleanText(texts);const style=(inner.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/)||[])[1]||'';const list=/<w:numPr\b/.test(inner),level=headingLevel(style),inline=parseInlineLinks(rawText,registry),links=[...inline.links];
    for(const hm of inner.matchAll(/<w:hyperlink\b[^>]*\br:id="([^"]+)"[^>]*>([\s\S]*?)<\/w:hyperlink>/g)){const label=cleanText([...hm[2].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map(x=>decodeXml(x[1])).join(''));const item=registry.register(label,relationships[hm[1]]||'',label);if(item&&!links.some(x=>x.articleId===item.articleId))links.push(item);}
    const captionLike=/caption|题注/i.test(style)||/^图\s*[0-9一二三四五六七八九十]+[：:.、\s]/.test(rawText);
    if(captionLike&&rawText){const last=blocks.at(-1);if(last&&['image','table'].includes(last.type)&&!last.caption)last.caption=rawText;else pendingCaption=rawText;continue;}
    const sectionHeading=parseSectionHeading(rawText)||genericSectionHeading(rawText,level);if(sectionHeading){currentSection=sectionHeading.name;currentArticle='';}else if(level===2&&rawText)currentArticle=rawText;
    const sourceRef={format:'docx',sourceName:filename,element:elementIndex+1,paragraph:paragraphNo};
    const imageRels=[...inner.matchAll(/<a:blip\b[^>]*\br:embed="([^"]+)"/g)].map(x=>x[1]);
    if(rawText){const richText=docxParagraphRichText(inner);const p={text:inline.text,style,list,level,links,richText};paras.push(p);const sl=style.toLowerCase();let block=null;
      if(!title&&(/title|标题|heading1/.test(sl)||blocks.length===0&&p.text.length<=80)){title=p.text.slice(0,MAX_TITLE);if(/title|标题|heading1/.test(sl)){if(p.links?.length)blocks.push(...articleLinkBlocks(p.links));block=null;}else block=paragraphBlock(p.text);}
      else if(/heading|标题/.test(sl))block={...paragraphBlock(p.text,'subhead'),richText};
      else if(/quote|引用/.test(sl))block={...quoteBlock(p.text),richText};
      else if(p.list){listNo++;block=itemBlock(p.text,String(listNo));}else{listNo=0;block={...paragraphBlock(p.text),richText};}
      if(block){block.sourceRef=sourceRef;addBlock(block,sourceRef,false);}if(p.links?.length)for(const linkBlock of articleLinkBlocks(p.links))addBlock({...linkBlock,sourceRef},sourceRef,false);
    }
    for(const relId of imageRels){const asset=embeddedAssets[relId];if(!asset)continue;const block={type:'image',src:asset.ref,alt:docxImageAlt(inner),caption:pendingCaption,frameRatio:'auto',fit:'contain',positionX:50,positionY:50,sourceRef};pendingCaption='';addBlock(block,sourceRef,true);}
  }
  if(!title)title=deriveTitle(blocks,filename);const publication=detectPublicationStructure(paras,title);const doc={title,blocks,articles:registry.articles,format:'docx',sourceName:filename,embeddedAssets:Object.values(embeddedAssets),sourceMap,richObjects};if(publication){doc.structure=publication.summary;doc.publication=publication;}return finalizeDocument(doc);
}
''','rich DOCX parser')

replace_between('scripts/lib-v3-import.mjs',"  if(ext==='.docx'){","\n  throw new Error(`暂不支持",r'''  if(ext==='.docx'){
    const dir=await mkdtemp(path.join(os.tmpdir(),'v3-docx-'));const file=path.join(dir,'input.docx');await writeFile(file,buffer);try{
      const r=spawnSync('unzip',['-p',file,'word/document.xml'],{encoding:'utf8',maxBuffer:16*1024*1024});if(r.status!==0||!r.stdout)throw new Error('DOCX 结构无法读取，请确认文件未损坏');
      const rel=spawnSync('unzip',['-p',file,'word/_rels/document.xml.rels'],{encoding:'utf8',maxBuffer:4*1024*1024});const relationships={},embeddedAssets={},assetByTarget=new Map();let mediaBytes=0,mediaCount=0;
      if(rel.status===0&&rel.stdout){for(const rm of rel.stdout.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)){const attrs=rm[1],id=(attrs.match(/\bId="([^"]+)"/)||[])[1]||'',target=decodeXml((attrs.match(/\bTarget="([^"]+)"/)||[])[1]||'');if(!id||!target)continue;relationships[id]=target;const ext=path.extname(target).toLowerCase();if(!['.png','.jpg','.jpeg','.gif','.webp'].includes(ext))continue;if(assetByTarget.has(target)){embeddedAssets[id]=assetByTarget.get(target);continue;}let entry=target.replace(/^\/+/, '');if(entry.startsWith('media/'))entry=`word/${entry}`;else if(!entry.startsWith('word/'))entry=path.posix.normalize(path.posix.join('word',entry));if(!entry.startsWith('word/media/'))continue;const media=spawnSync('unzip',['-p',file,entry],{encoding:null,maxBuffer:9*1024*1024});if(media.status!==0||!Buffer.isBuffer(media.stdout)||!media.stdout.length)throw new Error(`DOCX 内嵌图片无法读取：${path.posix.basename(entry)}`);mediaBytes+=media.stdout.length;mediaCount++;if(mediaCount>40||mediaBytes>8*1024*1024)throw new Error('DOCX 内嵌图片超过 40 张或 8MB 安全上限，请拆分稿件后导入');const mimeType=ext==='.png'?'image/png':ext==='.gif'?'image/gif':ext==='.webp'?'image/webp':'image/jpeg';const safeStem=path.basename(filename,path.extname(filename)).replace(/[^a-zA-Z0-9._-]+/g,'-').slice(0,48)||'docx';const asset={id:`docx-${mediaCount}-${id}`,ref:`embedded://${safeStem}-${mediaCount}-${id}`,filename:`${safeStem}-${mediaCount}${ext}`,mime:mimeType,bytes:media.stdout.length,base64:media.stdout.toString('base64')};assetByTarget.set(target,asset);embeddedAssets[id]=asset;}}
      return parseDocxXml(r.stdout,filename,relationships,embeddedAssets);
    }finally{await rm(dir,{recursive:true,force:true});}
  }
''','DOCX package media extraction')

replace_once('scripts/lib-v3-import.mjs',"if(block.type==='image'||block.type==='video')return 450;","if(block.type==='table')return Math.min(900,180+(block.rows||[]).length*80);if(block.type==='image'||block.type==='video')return 450;",'table pagination weight')
replace_once('scripts/lib-v3-import.mjs',"  if(pages.length>maxPages)throw new Error(`整期结构识别将生成 ${pages.length} 页，超过单次导入 ${maxPages} 页上限，请调整分页密度或拆分文件`);","  mergeRichDocxObjects(doc,pages);\n  if(pages.length>maxPages)throw new Error(`整期结构识别将生成 ${pages.length} 页，超过单次导入 ${maxPages} 页上限，请调整分页密度或拆分文件`);",'periodical rich object merge')

# --- server schema / print -------------------------------------------------
replace_once('scripts/studio-v3.mjs',"'video','image','coverMeta'","'video','image','table','coverMeta'",'allow table block')
replace_once('scripts/studio-v3.mjs',"    case 'image': return {type:'image',src:'',alt:'请填写图片替代文字',caption:'',frameRatio:'auto',fit:'contain',positionX:50,positionY:50};","    case 'image': return {type:'image',src:'',alt:'请填写图片替代文字',caption:'',frameRatio:'auto',fit:'contain',positionX:50,positionY:50};\n    case 'table': return {type:'table',rows:(block.rows||[['','']]).slice(0,12).map(r=>(r||[]).slice(0,8).map(()=>'')),headerRows:Number(block.headerRows)||0,caption:''};",'clone table skeleton')
replace_once('scripts/studio-v3.mjs',"    else if(t==='image')body=`<figure><div class=\"media-placeholder\">图片</div>${b.caption?`<figcaption>${printEsc(pub.captionLabel?`${pub.captionLabel} ${b.caption}`:b.caption)}</figcaption>`:''}</figure>`;","    else if(t==='table'){const rows=(b.rows||[]).slice(0,40),heads=Math.max(0,Math.min(rows.length,Number(b.headerRows)||0));body=`<figure class=\"print-table\"><table>${rows.map((r,ri)=>`<tr>${(r||[]).slice(0,12).map(c=>ri<heads?`<th>${printEsc(c)}</th>`:`<td>${printEsc(c)}</td>`).join('')}</tr>`).join('')}</table>${b.caption?`<figcaption>${printEsc(b.caption)}</figcaption>`:''}</figure>`;}\n    else if(t==='image')body=`<figure><div class=\"media-placeholder\">图片</div>${b.caption?`<figcaption>${printEsc(pub.captionLabel?`${pub.captionLabel} ${b.caption}`:b.caption)}</figcaption>`:''}</figure>`;",'print table rendering')

# --- Reader ---------------------------------------------------------------
replace_once('src/reader/reader.js','    case "articleLink": {',r'''    case "table": {
      const rows=(block.rows||[]).slice(0,40),heads=Math.max(0,Math.min(rows.length,Number(block.headerRows)||0));
      return `<figure class="table-block"><div class="table-scroll"><table>${rows.map((row,ri)=>`<tr>${(row||[]).slice(0,12).map(cell=>ri<heads?`<th>${escapeHtml(cell||"")}</th>`:`<td>${escapeHtml(cell||"")}</td>`).join("")}</tr>`).join("")}</table></div>${block.caption?`<figcaption>${escapeHtml(block.caption)}</figcaption>`:""}</figure>`;
    }
    case "articleLink": {''','Reader table rendering')
Path('src/reader/reader.css').write_text(Path('src/reader/reader.css').read_text()+r'''

/* P1-04 imported Word tables */
.table-block{margin:14px 0;max-width:100%;break-inside:avoid}.table-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid rgba(92,62,39,.16);border-radius:10px;background:rgba(255,255,255,.72)}.table-block table{width:100%;border-collapse:collapse;min-width:420px;font-size:.92em;line-height:1.55}.table-block th,.table-block td{padding:9px 11px;border-right:1px solid rgba(92,62,39,.12);border-bottom:1px solid rgba(92,62,39,.12);text-align:left;vertical-align:top}.table-block th{font-weight:700;background:rgba(151,103,67,.09)}.table-block tr:last-child>th,.table-block tr:last-child>td{border-bottom:0}.table-block tr>*:last-child{border-right:0}.table-block figcaption{margin-top:6px;color:var(--muted,#76695f);font-size:.82em}@media(max-width:760px){.table-block table{min-width:520px}.table-block th,.table-block td{padding:10px 12px;font-size:15px}}
''')

# --- Studio: palette, editing, asset materialization ----------------------
replace_once('src/studio/studio.js',"  ['image','图片','图片、替代文字与图注'],['video','视频','视频资源与说明文字'],['articleLink','文章链接','引用 issue.articles 中的外部文章'],","  ['image','图片','图片、替代文字与图注'],['video','视频','视频资源与说明文字'],['table','表格','Word 表格或手工二维表格，可横向滚动'],['articleLink','文章链接','引用 issue.articles 中的外部文章'],",'Studio table palette')
replace_once('src/studio/studio.js',"    case 'paragraph': return { type, style:'body', text:'请填写正文内容。' };","    case 'paragraph': return { type, style:'body', text:'请填写正文内容。' };\n    case 'table': return {type,rows:[['表头 1','表头 2'],['内容 1','内容 2']],headerRows:1,caption:''};",'default table block')
replace_once('src/studio/studio.js',"  if (block.type === 'image' || block.type === 'video') return block.caption || block.src || '';","  if (block.type === 'image' || block.type === 'video') return block.caption || block.src || '';\n  if (block.type === 'table') return `${(block.rows||[]).length} 行 × ${Math.max(0,...(block.rows||[]).map(r=>(r||[]).length))} 列${block.caption?` · ${block.caption}`:''}`;",'table summary')
replace_once('src/studio/studio.js',"    case 'quote': return inputField(index,'title','引言标题（可选）',block.title||'',{full:true,max:120}) + richTextManagedField(block,index,'引言内容',8000);","    case 'quote': return inputField(index,'title','引言标题（可选）',block.title||'',{full:true,max:120}) + richTextManagedField(block,index,'引言内容',8000);\n    case 'table': {const tsv=(block.rows||[]).map(r=>(r||[]).join('\\t')).join('\\n');return inputField(index,'caption','表格标题 / 图注',block.caption||'',{full:true,max:300})+inputField(index,'headerRows','表头行数',Number(block.headerRows)||0,{options:[['0','无表头'],['1','1 行'],['2','2 行']]})+`<label class=\"full\">表格内容（Tab 分列、换行分行）<textarea class=\"table-grid-field\" data-table-block=\"${index}\" rows=\"7\" maxlength=\"30000\">${escText(tsv)}</textarea></label><div class=\"hint full\">最多 40 行 × 12 列；从 Word 导入时会保留原表格行列关系。</div>`;} ", 'table editor fields')
replace_once('src/studio/studio.js',"    case 'quote': return `<div class=\"quote\">${b.title?`<strong>${escText(b.title)}</strong><br>`:''}${escText(b.text || '')}</div>`;","    case 'quote': return `<div class=\"quote\">${b.title?`<strong>${escText(b.title)}</strong><br>`:''}${escText(b.text || '')}</div>`;\n    case 'table': return `<div class=\"mini-table\">${(b.rows||[]).slice(0,5).map(r=>`<div>${(r||[]).slice(0,5).map(c=>`<span>${escText(c||'')}</span>`).join('')}</div>`).join('')}</div>`;",'table mini preview')
replace_once('src/studio/studio.js',"case'video':case'image':return block.caption||'';","case'video':case'image':return block.caption||'';case'table':return [block.caption,...(block.rows||[]).flat()].filter(Boolean).join('。');",'table narration')
replace_once('src/studio/studio.js',"function importArticlesFromResults(valid=[]){return valid.reduce((all,x)=>Object.assign(all,x?.document?.articles||{}),{});}",r'''function importArticlesFromResults(valid=[]){return valid.reduce((all,x)=>Object.assign(all,x?.document?.articles||{}),{});}
function embeddedAssetFile(asset){const raw=atob(String(asset?.base64||'')),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new File([bytes],String(asset?.filename||'word-image.png'),{type:String(asset?.mime||'application/octet-stream')});}
function rewriteEmbeddedRefs(blocks,map){for(const b of blocks||[]){if(!b||typeof b!=='object')continue;if(b.type==='image'&&map.has(String(b.src||'')))b.src=map.get(String(b.src||''));if(b.type==='container')(b.columns||[]).forEach(c=>rewriteEmbeddedRefs(c?.blocks,map));}}
async function materializeImportedAssets(valid=[]){for(const result of valid){const assets=result?.document?.embeddedAssets||[];if(!assets.length)continue;const map=new Map();for(const asset of assets){if(asset.uploadedPath){map.set(asset.ref,asset.uploadedPath);continue;}if(!asset.base64)throw new Error(`内嵌图片 ${asset.filename||asset.id||''} 缺少文件数据`);let file=embeddedAssetFile(asset);const optimized=await optimizeImageFile(file);file=optimized?.file||file;const uploaded=await uploadAsset(file,'image');asset.uploadedPath=uploaded.path;delete asset.base64;map.set(asset.ref,uploaded.path);}rewriteEmbeddedRefs(result.pages,map);rewriteEmbeddedRefs(result.document?.blocks,map);for(const obj of result.document?.richObjects||[])rewriteEmbeddedRefs([obj.block],map);}return valid;}
''','embedded Word asset materialization')
replace_once('src/studio/studio.js',"$('#applyImportBtn').onclick=()=>{const valid=state.importResults.filter(x=>!x.error),pages=valid.flatMap(x=>x.pages||[]);if(!pages.length)return;const mode=valid[0]?.kind==='skeleton'?$('#skeletonMode').value:resolveImportWriteMode(valid);if(insertImportedPages(pages,{mode,publicationTitle:valid[0]?.document?.title||'',articles:importArticlesFromResults(valid)})){const count=pages.length;$('#importDialog').close();clearImportResults(true);toast(`已生成 ${count} 个页面，建议检查标题、栏目、分页与 Reader 效果。`,3200);}};",r'''$('#applyImportBtn').onclick=async()=>{const valid=state.importResults.filter(x=>!x.error),pages=valid.flatMap(x=>x.pages||[]);if(!pages.length)return;const btn=$('#applyImportBtn');try{btn.disabled=true;btn.textContent='正在导入图片…';await materializeImportedAssets(valid);const mode=valid[0]?.kind==='skeleton'?$('#skeletonMode').value:resolveImportWriteMode(valid);if(insertImportedPages(pages,{mode,publicationTitle:valid[0]?.document?.title||'',articles:importArticlesFromResults(valid)})){const count=pages.length;$('#importDialog').close();clearImportResults(true);toast(`已生成 ${count} 个页面，Word 图片/表格/富文本已一并写入。`,3600);}}catch(error){toast(error.message||String(error),4200);renderImportPreview();}finally{if(document.body.contains(btn)&&state.importResults.length)btn.disabled=false;}};''','apply import assets first')
replace_once('src/studio/studio.js',"    setFastTrackStatus('正在生成页面…');setFastTrackStep('insert','active');if(!insertImportedPages(pages,{mode,publicationTitle:valid[0]?.document?.title||'',articles:importArticlesFromResults(valid)}))throw new Error('生成页面失败');const importedFocusPage=currentPage();setFastTrackStep('insert','done');","    setFastTrackStatus('正在导入 Word 图片…');await materializeImportedAssets(valid);setFastTrackStatus('正在生成页面…');setFastTrackStep('insert','active');if(!insertImportedPages(pages,{mode,publicationTitle:valid[0]?.document?.title||'',articles:importArticlesFromResults(valid)}))throw new Error('生成页面失败');const importedFocusPage=currentPage();setFastTrackStep('insert','done');",'fast track rich assets')
Path('src/studio/studio.js').write_text(Path('src/studio/studio.js').read_text()+r'''

document.querySelector('#blockList')?.addEventListener('change',event=>{const field=event.target.closest?.('.table-grid-field');if(!field)return;const index=Number(field.dataset.tableBlock),block=currentPage()?.blocks?.[index];if(!block||block.type!=='table')return;const rows=String(field.value||'').split(/\r?\n/).filter((line,i,all)=>line.trim()||i<all.length-1).slice(0,40).map(line=>line.split('\t').slice(0,12).map(cell=>cell.trim().slice(0,2000)));block.rows=rows.length?rows:[['']];mutateBlocks();});
''')

# Small Studio CSS for table editor/preview.
Path('src/studio/studio.css').write_text(Path('src/studio/studio.css').read_text()+r'''

.table-grid-field{min-height:150px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre;overflow:auto}.mini-table{display:grid;gap:1px;background:rgba(90,65,45,.12);padding:1px;border-radius:6px;overflow:hidden}.mini-table>div{display:flex;gap:1px}.mini-table span{flex:1;min-width:0;background:var(--panel,#fff);padding:3px 5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}
''')

print('P1-04 rich DOCX import patch applied')
