import path from 'node:path';
import os from 'node:os';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const MAX_IMPORT_BYTES = 12 * 1024 * 1024;
const MAX_IMPORT_TEXT = 400000;
const MAX_TITLE = 120;
const MAX_BLOCKS = 80;
const CN_NUM = {一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};

function decodeXml(s='') {
  return String(s).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));
}
function cleanText(s='') { return String(s).replace(/\r/g,'').replace(/[\t\u00a0]+/g,' ').replace(/ +\n/g,'\n').replace(/\n{4,}/g,'\n\n\n').trim(); }
function stripMarkdownInline(s='') { return String(s).replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*_~`]/g,'').trim(); }
function sentenceChunks(text,max=520) {
  const t=cleanText(text); if(t.length<=max)return [t];
  const parts=t.match(/[^。！？!?；;]+[。！？!?；;]?/g)||[t]; const out=[]; let buf='';
  for(const p0 of parts){const p=p0.trim();if(!p)continue;if(buf && buf.length+p.length>max){out.push(buf);buf=p}else if(p.length>max){if(buf){out.push(buf);buf=''};for(let i=0;i<p.length;i+=max)out.push(p.slice(i,i+max));}else buf+=p;}
  if(buf)out.push(buf); return out.filter(Boolean);
}
function itemBlock(text,badge='•',tone='default') { const m=String(text).match(/^([^：:]{1,40})[：:]\s*(.+)$/s); return {type:'cardline',badge:String(badge).slice(0,12),title:m?m[1].trim():'要点',text:(m?m[2]:text).trim(),tone}; }
function paragraphBlock(text,style='body'){return {type:'paragraph',style,text:cleanText(text)}}
function quoteBlock(text){return {type:'quote',text:cleanText(text)}}
function headingLevel(style=''){const m=String(style).match(/heading\s*([1-6])/i);return m?Number(m[1]):0;}
function stripNumberPrefix(text=''){return cleanText(text).replace(/^[一二三四五六七八九十百\d]+[、.．]\s*/,'').trim();}
function isSourceText(text=''){return /^(资料来源|来源)[：:]/.test(cleanText(text));}
function isPrefaceHeading(text=''){return /卷首语/.test(cleanText(text));}
function isClosingHeading(text=''){return /(尾刊寄语|编后寄语|尾声|结语)/.test(cleanText(text));}
function parseSectionHeading(text=''){
  const raw=cleanText(text).replace(/^[★☆📖📌\s]+/,'');
  const m=raw.match(/^第([一二三四五六七八九十百\d]+)[版板]块\s*(.+)$/);
  if(!m)return null;
  const rest=m[2].trim();const [name0,...tagParts]=rest.split(/[｜|]/);const name=name0.trim();const tagline=tagParts.join('｜').trim();
  return {ordinal:m[1],name,tagline,display:tagline?`${name}｜${tagline}`:name};
}
export const SECTION_SEMANTIC_TAXONOMY = [
  {id:'news',label:'时政新闻',pageType:'news',layoutPreset:'lead-two',keywords:['时政','国事','要闻','新闻','动态','政务','国内外','大事']},
  {id:'theory',label:'理论学习',pageType:'theory',layoutPreset:'two-balanced',keywords:['理论','党建','学习','党史','思想','政策学习','政治学习','主题教育']},
  {id:'safety',label:'安全防范',pageType:'safety',layoutPreset:'three-brief',keywords:['安全','反诈','诈骗','防范','消保','防非','网络安全','风险提示','钱袋子']},
  {id:'discipline',label:'纪法警示',pageType:'discipline',layoutPreset:'two-balanced',keywords:['警示','纪律','纪法','廉政','清廉','作风','监督','红线']},
  {id:'health',label:'健康养生',pageType:'health',layoutPreset:'three-brief',keywords:['养生','健康','节气','保健','康养','医疗','疾病预防','运动健康']},
  {id:'finance',label:'金融知识',pageType:'article',layoutPreset:'two-balanced',keywords:['金融','货币','人民币','征信','支付','存款','保险','理财','银行','国债','金融知识']},
  {id:'profile',label:'人物风采',pageType:'article',layoutPreset:'media-left',keywords:['风采','人物','先锋','先进','榜样','银龄','故事','典型','荣誉','老同志风采']},
  {id:'culture',label:'文化文苑',pageType:'article',layoutPreset:'three-brief',keywords:['文苑','文化','书画','摄影','诗词','作品','文艺','读书','艺苑','文学']},
  {id:'service',label:'服务生活',pageType:'article',layoutPreset:'single-focus',keywords:['服务','生活','政策解读','办事','通知','提醒','关怀','养老服务','便民']},
  {id:'activity',label:'活动纪实',pageType:'article',layoutPreset:'media-right',keywords:['活动','支部活动','主题党日','参观','座谈','慰问','开放日','纪实','剪影']},
  {id:'general',label:'通用栏目',pageType:'article',layoutPreset:'single-focus',keywords:[]}
];
const SECTION_SEMANTIC_MAP = Object.fromEntries(SECTION_SEMANTIC_TAXONOMY.map(x=>[x.id,x]));
function sectionSignalCorpus(section={}){
  return cleanText([section.name,section.tagline,section.feature,...(section.articles||[]).flatMap(a=>[a.title,...(a.paras||[]).slice(0,3).map(p=>p.text)]),...(section.intro||[]).slice(0,12).map(p=>p.text)].filter(Boolean).join(' '));
}
export function classifySectionSemantic(sectionOrName=''){
  const section=typeof sectionOrName==='string'?{name:sectionOrName}:sectionOrName||{};const corpus=sectionSignalCorpus(section);const name=cleanText(section.name||'');
  let best=null,second=null;
  for(const rule of SECTION_SEMANTIC_TAXONOMY){if(rule.id==='general')continue;let score=0;const hits=[];for(const kw of rule.keywords){if(!corpus.includes(kw))continue;const inName=name.includes(kw);score+=inName?6:2;hits.push(kw);}const row={...rule,score,hits};if(!best||row.score>best.score){second=best;best=row}else if(!second||row.score>second.score)second=row;}
  if(!best||best.score<=0){const fallback=SECTION_SEMANTIC_MAP.general;return {...fallback,confidence:'low',score:0,reason:'未命中已知语义，安全回退为通用栏目'};}
  const gap=best.score-(second?.score||0);const confidence=best.score>=8&&gap>=3?'high':best.score>=4?'medium':'low';const reason=`命中“${best.hits.slice(0,3).join(' / ')}”${name&&best.hits.some(x=>name.includes(x))?'，且标题直接包含该语义':''}`;
  return {...best,confidence,reason};
}
function genericSectionHeading(text='',level=0){
  const explicit=parseSectionHeading(text);if(explicit)return {...explicit,source:'numbered'};if(Number(level)!==1)return null;const original=cleanText(text);if(/^[★☆📖📌]/.test(original))return null;const raw=original.replace(/^\s+/,'');if(!raw||raw.length>90)return null;const [name0,...tagParts]=raw.split(/[｜|]/);const name=name0.trim();if(!name)return null;const tagline=tagParts.join('｜').trim();return {ordinal:'',name,tagline,display:tagline?`${name}｜${tagline}`:name,source:'heading1'};
}
function paragraphTone(pageType){return pageType==='health'?'green':'default';}
function semanticBodyBlock(p,pageType,{lead=false}={}){
  const text=cleanText(p?.text||'');if(!text)return null;
  if(isSourceText(text))return paragraphBlock(text,'xsmall');
  if(/^★\s*/.test(text)){
    const body=text.replace(/^★\s*/,'');const first=body.match(/^(.{1,32}?[。；;])\s*(.*)$/s);return {type:'cardline',badge:'★',title:first?first[1].replace(/[。；;]$/,''):'重点提示',text:first&&first[2]?first[2]:body,tone:paragraphTone(pageType)};
  }
  const step=text.match(/^第([一二三四五六七八九十])(?:问|步)[：:]\s*(.+)$/);if(step)return {type:'cardline',badge:String(CN_NUM[step[1]]||step[1]),title:`第${step[1]}${/问/.test(text)?'问':'步'}`,text:step[2],tone:paragraphTone(pageType)};
  const dash=text.match(/^([^———]{1,16})[———]{1,2}(.+)$/s);if(dash&&!/[。！？!?]/.test(dash[1]))return {type:'cardline',badge:'•',title:dash[1].trim(),text:dash[2].trim(),tone:paragraphTone(pageType)};
  const style=lead?'lead':pageType==='news'?'xsmall':(['theory','health'].includes(pageType)?'small':'body');
  return paragraphBlock(text,style);
}
function semanticBlocks(paras=[],pageType='article'){
  if(pageType==='discipline'){
    const c=paras.findIndex(p=>p.level===3&&/^案例(?:回放)?$/.test(cleanText(p.text)));const w=paras.findIndex((p,i)=>i>c&&p.level===3&&/^警示/.test(cleanText(p.text)));
    if(c>=0&&w>c){const before=semanticBlocksBasic(paras.slice(0,c),pageType);const caseParas=paras.slice(c+1,w),warnParas=paras.slice(w+1);const source=warnParas.filter(p=>isSourceText(p.text));const warningBody=warnParas.filter(p=>!isSourceText(p.text));const caseText=caseParas.map(p=>cleanText(p.text)).filter(Boolean).join('\n');const warningText=warningBody.map(p=>cleanText(p.text)).filter(Boolean).join('\n');return [...before,{type:'casePair',case:caseText||'请核对案例内容。',warning:warningText||'请核对警示内容。'},...source.map(p=>paragraphBlock(p.text,'xsmall'))];}
  }
  return semanticBlocksBasic(paras,pageType);
}
function semanticBlocksBasic(paras=[],pageType='article'){
  if(paras.length>=3&&paras.every(p=>Number(p.level||0)>=3)){return [{type:'chips',items:paras.map(p=>({text:cleanText(p.text).replace(/^[★☆]\s*/,'').trim(),tone:pageType==='health'?'green':''})).filter(x=>x.text)}];}
  const out=[];let seenBody=false;
  for(const p of paras){const text=cleanText(p.text);if(!text)continue;if(p.level>=3){out.push(paragraphBlock(text.replace(/^[★☆]\s*/,''),'subhead'));continue;}const block=semanticBodyBlock(p,pageType,{lead:!seenBody&&p.style==='FirstParagraph'});if(block){out.push(block);seenBody=true;}}
  return out;
}

export function detectPublicationStructure(paras=[],title=''){
  let preface=null,closing=null,currentSection=null,currentArticle=null;let prefaceStore=null,closingStore=null;const sections=[];
  const addPara=p=>{if(closing){closing.paras.push(p);return;}if(preface&&!currentSection){preface.paras.push(p);return;}if(currentArticle){currentArticle.paras.push(p);return;}if(currentSection){currentSection.intro.push(p);}};
  for(const p0 of paras){const p={...p0,text:cleanText(p0.text),level:Number(p0.level||headingLevel(p0.style))};if(!p.text)continue;if(title&&p.text===title&&p.level===1)continue;
    if(isPrefaceHeading(p.text)&&p.level<=2){prefaceStore=preface={title:'卷首语',paras:[]};currentSection=null;currentArticle=null;closing=null;continue;}
    if(isClosingHeading(p.text)&&p.level<=2){closingStore=closing={title:p.text.replace(/^[📌\s]+/,''),paras:[]};currentSection=null;currentArticle=null;preface=null;continue;}
    if(currentSection&&p.level===1&&/^[☆★]/.test(p.text)&&!currentArticle&&currentSection.articles.length===0){currentSection.feature=p.text.replace(/^[☆★]\s*/,'').trim();continue;}
    const sec=genericSectionHeading(p.text,p.level);if(sec){currentSection={...sec,pageType:'article',semanticType:'general',semanticLabel:'通用栏目',semanticConfidence:'low',semanticReason:'待分析',suggestedLayout:'single-focus',feature:'',intro:[],articles:[]};sections.push(currentSection);currentArticle=null;preface=null;closing=null;continue;}
    if(currentSection&&(p.level===2||(p.level===1&&/^[☆★]/.test(p.text)))){currentArticle={title:p.text.replace(/^[☆★]\s*/,''),level:p.level,paras:[]};currentSection.articles.push(currentArticle);continue;}
    addPara(p);
  }
  for(const section of sections){const semantic=classifySectionSemantic(section);section.semanticType=semantic.id;section.semanticLabel=semantic.label;section.semanticConfidence=semantic.confidence;section.semanticReason=semantic.reason;section.suggestedLayout=semantic.layoutPreset;section.pageType=semantic.pageType;}
  const articleCount=sections.reduce((n,s)=>n+s.articles.length,0);const detected=sections.length>=2&&(articleCount>=3||prefaceStore||closingStore);if(!detected)return null;
  const lowConfidence=sections.filter(s=>s.semanticConfidence==='low').length;const summary={kind:'periodical',confidence:sections.length>=4?'high':'medium',title,hasPreface:Boolean(prefaceStore),hasClosing:Boolean(closingStore),sectionCount:sections.length,articleCount,dynamicSections:true,unknownSectionCount:lowConfidence,sections:sections.map(s=>({name:s.name,tagline:s.tagline,pageType:s.pageType,semanticType:s.semanticType,semanticLabel:s.semanticLabel,semanticConfidence:s.semanticConfidence,semanticReason:s.semanticReason,suggestedLayout:s.suggestedLayout,articles:s.articles.length,hasIntro:s.intro.length>0,feature:s.feature||'',source:s.source||''}))};
  return {summary,preface:prefaceStore,closing:closingStore,sections};
}


export function parseMarkdown(text,{filename=''}={}) {
  text=cleanText(text); if(text.length>MAX_IMPORT_TEXT)throw new Error(`导入文本超过 ${MAX_IMPORT_TEXT} 字符上限`);
  const lines=text.split('\n'); let title=''; const blocks=[]; let paragraph=[]; let quote=[]; let list=[]; let listOrdered=false;
  const flushParagraph=()=>{const t=paragraph.join(' ').trim();if(t)blocks.push(paragraphBlock(t));paragraph=[]};
  const flushQuote=()=>{const t=quote.join(' ').trim();if(t)blocks.push(quoteBlock(t));quote=[]};
  const flushList=()=>{if(list.length){list.forEach((x,i)=>blocks.push(itemBlock(x,listOrdered?String(i+1):'•')));list=[];} listOrdered=false;};
  const flushAll=()=>{flushParagraph();flushQuote();flushList()};
  for(const raw of lines){const line=raw.trim();if(!line){flushAll();continue;}
    let m=line.match(/^(#{1,6})\s+(.+)$/); if(m){flushAll();const level=m[1].length,v=stripMarkdownInline(m[2]);if(!title&&level===1){title=v.slice(0,MAX_TITLE);continue;}blocks.push(paragraphBlock(v,'subhead'));continue;}
    m=line.match(/^>\s?(.*)$/); if(m){flushParagraph();flushList();quote.push(stripMarkdownInline(m[1]));continue;}
    m=line.match(/^[-*+]\s+(.+)$/); if(m){flushParagraph();flushQuote();listOrdered=false;list.push(stripMarkdownInline(m[1]));continue;}
    m=line.match(/^\d+[.)、]\s*(.+)$/); if(m){flushParagraph();flushQuote();listOrdered=true;list.push(stripMarkdownInline(m[1]));continue;}
    flushQuote();flushList();paragraph.push(stripMarkdownInline(line));
  }
  flushAll(); if(!title)title=deriveTitle(blocks,filename);
  return finalizeDocument({title,blocks,format:'markdown',sourceName:filename});
}

export function parsePlainText(text,{filename=''}={}) {
  text=cleanText(text); if(text.length>MAX_IMPORT_TEXT)throw new Error(`导入文本超过 ${MAX_IMPORT_TEXT} 字符上限`);
  const paras=text.split(/\n\s*\n/).map(x=>cleanText(x)).filter(Boolean); let title=''; const blocks=[];
  if(paras.length&&paras[0].length<=80&&!/[。！？!?；;]$/.test(paras[0]))title=paras.shift().replace(/^#+\s*/,'').slice(0,MAX_TITLE);
  for(const para of paras){const lines=para.split('\n').map(x=>x.trim()).filter(Boolean);
    if(lines.length>1&&lines.every(x=>/^([-*+]\s+|\d+[.)、]\s*)/.test(x))){lines.forEach((x,i)=>{const ordered=/^\d/.test(x);blocks.push(itemBlock(x.replace(/^([-*+]\s+|\d+[.)、]\s*)/,''),ordered?String(i+1):'•'))});continue;}
    if(/^([>＞]|“[^”]{20,}”$)/.test(para)){blocks.push(quoteBlock(para.replace(/^[>＞]\s*/,'')));continue;}
    if(lines.length===1&&para.length<=50&&!/[。！？!?；;]$/.test(para)){blocks.push(paragraphBlock(para,'subhead'));continue;}
    blocks.push(paragraphBlock(para));
  }
  if(!title)title=deriveTitle(blocks,filename); return finalizeDocument({title,blocks,format:'text',sourceName:filename});
}

function deriveTitle(blocks,filename='') {
  const sub=blocks.find(b=>b.type==='paragraph'&&b.style==='subhead'&&b.text)?.text; if(sub)return sub.slice(0,MAX_TITLE);
  const first=blocks.find(b=>b.text)?.text||''; if(first&&first.length<=80)return first.slice(0,MAX_TITLE);
  return path.basename(filename,path.extname(filename)).slice(0,MAX_TITLE)||'导入文章';
}
function finalizeDocument(doc) { doc.blocks=(doc.blocks||[]).filter(b=>b?.text||b?.title||b?.type==='cardline').slice(0,500); doc.stats={characters:doc.blocks.reduce((n,b)=>n+String(b.text||'').length+String(b.title||'').length+String(b.case||'').length+String(b.warning||'').length,0),blocks:doc.blocks.length}; return doc; }

function parseDocxXml(xml,filename='') {
  const paras=[]; const re=/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g; let m;
  while((m=re.exec(xml))){const p=m[1];const texts=[...p.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map(x=>decodeXml(x[1])).join('');const text=cleanText(texts);if(!text)continue;const style=(p.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/)||[])[1]||'';const list=/<w:numPr\b/.test(p);paras.push({text,style,list,level:headingLevel(style)});}
  let title=''; const blocks=[]; let listNo=0;
  for(const p of paras){const style=p.style.toLowerCase();if(!title&&(/title|标题|heading1/.test(style)||blocks.length===0&&p.text.length<=80)){title=p.text.slice(0,MAX_TITLE); if(/title|标题|heading1/.test(style))continue;}
    if(/heading|标题/.test(style)){blocks.push(paragraphBlock(p.text,'subhead'));continue;}
    if(/quote|引用/.test(style)){blocks.push(quoteBlock(p.text));continue;}
    if(p.list){listNo++;blocks.push(itemBlock(p.text,String(listNo)));continue;} listNo=0;blocks.push(paragraphBlock(p.text));}
  if(!title)title=deriveTitle(blocks,filename);const publication=detectPublicationStructure(paras,title);const doc={title,blocks,format:'docx',sourceName:filename};if(publication){doc.structure=publication.summary;doc.publication=publication;}return finalizeDocument(doc);
}

function commandExists(cmd){const r=spawnSync(process.platform==='win32'?'where':'which',[cmd],{encoding:'utf8'});return r.status===0;}
async function parseDocBuffer(buffer,filename){const dir=await mkdtemp(path.join(os.tmpdir(),'v3-import-'));const file=path.join(dir,path.basename(filename)||'input.doc');await writeFile(file,buffer);try{
  if(process.platform==='darwin'&&commandExists('textutil')){const r=spawnSync('textutil',['-convert','txt','-stdout',file],{encoding:'utf8',maxBuffer:8*1024*1024});if(r.status===0&&r.stdout.trim())return parsePlainText(r.stdout,{filename});}
  if(commandExists('antiword')){const r=spawnSync('antiword',[file],{encoding:'utf8',maxBuffer:8*1024*1024});if(r.status===0&&r.stdout.trim())return parsePlainText(r.stdout,{filename});}
  if(commandExists('soffice')){const out=path.join(dir,'out');await import('node:fs/promises').then(x=>x.mkdir(out,{recursive:true}));const r=spawnSync('soffice',['--headless','--convert-to','txt:Text','--outdir',out,file],{encoding:'utf8'});if(r.status===0){const txt=path.join(out,path.basename(file,path.extname(file))+'.txt');const {readFile}=await import('node:fs/promises');try{return parsePlainText(await readFile(txt,'utf8'),{filename})}catch{}}}
  throw new Error('当前系统缺少 .doc 解析工具。Mac 可使用系统 textutil；其他平台建议另存为 .docx 后导入。');
 }finally{await rm(dir,{recursive:true,force:true});}}

export async function parseImportedBuffer(buffer,{filename='import.txt'}={}) {
  if(!Buffer.isBuffer(buffer))buffer=Buffer.from(buffer); if(buffer.length>MAX_IMPORT_BYTES)throw new Error(`导入文件不能超过 ${Math.round(MAX_IMPORT_BYTES/1024/1024)}MB`);
  const ext=path.extname(filename).toLowerCase();
  if(['.md','.markdown'].includes(ext))return parseMarkdown(buffer.toString('utf8'),{filename});
  if(['.txt','.text'].includes(ext)||!ext)return parsePlainText(buffer.toString('utf8'),{filename});
  if(ext==='.doc')return parseDocBuffer(buffer,filename);
  if(ext==='.docx'){
    const dir=await mkdtemp(path.join(os.tmpdir(),'v3-docx-'));const file=path.join(dir,'input.docx');await writeFile(file,buffer);try{const r=spawnSync('unzip',['-p',file,'word/document.xml'],{encoding:'utf8',maxBuffer:16*1024*1024});if(r.status!==0||!r.stdout)throw new Error('DOCX 结构无法读取，请确认文件未损坏');return parseDocxXml(r.stdout,filename);}finally{await rm(dir,{recursive:true,force:true});}
  }
  throw new Error(`暂不支持 ${ext||'未知'} 文件；支持 .docx / .doc / .md / .txt`);
}

export function blockWeight(block){if(!block)return 0;const text=String(block.text||'')+String(block.title||'')+String(block.case||'')+String(block.warning||'');if(block.type==='cardline')return text.length+120;if(block.type==='casePair')return text.length+180;if(block.type==='quote')return text.length+80;if(block.type==='image'||block.type==='video')return 450;if(block.type==='paragraph'&&block.style==='subhead')return text.length+120;return text.length+30;}
function expandBlocks(blocks=[]){const expanded=[];for(const b of blocks){if(b.type==='paragraph'&&String(b.text||'').length>620&&b.style!=='subhead'){sentenceChunks(b.text,520).forEach(t=>expanded.push({...b,text:t}));}else expanded.push(b);}return expanded;}
function semanticGroupWeight(group=[]){return group.reduce((n,b)=>n+blockWeight(b),0);}
function rebalanceContinuationGroups(groups=[],target=760){
  if(groups.length<2)return groups;const minWeight=Math.max(260,target*.36),softMerge=Math.max(target*1.95,1250);let last=groups.at(-1),prev=groups.at(-2),lw=semanticGroupWeight(last),pw=semanticGroupWeight(prev);
  const tinyText=last.length<=2&&last.every(b=>b?.type==='paragraph')&&last.reduce((n,b)=>n+String(b.text||'').length,0)<260;
  if((lw<minWeight||tinyText)&&prev.length+last.length<=10&&pw+lw<=softMerge){groups.splice(groups.length-2,2,[...prev,...last]);return groups;}
  if(lw<minWeight||tinyText){
    while(prev.length>1&&last.length<10&&semanticGroupWeight(last)<minWeight){
      let take=1;const end=prev.at(-1),before=prev.at(-2);if(end?.type==='paragraph'&&end.style!=='subhead'&&before?.type==='paragraph'&&before.style==='subhead')take=2;if(prev.length-take<1)break;last.unshift(...prev.splice(prev.length-take,take));
    }
    lw=semanticGroupWeight(last);pw=semanticGroupWeight(prev);
    if(prev.length&&last.length&&prev.length+last.length<=10&&pw+lw<=softMerge&&lw<target*.30)groups.splice(groups.length-2,2,[...prev,...last]);
  }
  return groups.filter(g=>g.length);
}
function groupSemanticBlocks(blocks=[],target=760){
  const expanded=expandBlocks(blocks),groups=[];let cur=[],weight=0;const soft=Math.max(target,Math.round(target*1.75));
  for(const b of expanded){const w=blockWeight(b);const sub=b.type==='paragraph'&&b.style==='subhead';if(cur.length&&sub&&weight>target*.72){groups.push(cur);cur=[];weight=0;}if(cur.length&&weight+w>soft){groups.push(cur);cur=[];weight=0;}cur.push(b);weight+=w;if(cur.length>=10){groups.push(cur);cur=[];weight=0;}}
  if(cur.length)groups.push(cur);const balanced=rebalanceContinuationGroups(groups,target);return balanced.length?balanced:[[]];
}
function continuationLabel(title=''){const clean=stripNumberPrefix(title);const parts=clean.split(/[———]{1,2}/).map(x=>x.trim()).filter(Boolean);const base=(parts.length>1?parts.at(-1):clean).replace(/[“”《》]/g,'').trim();return (base.length>24?`${base.slice(0,23)}…`:base)||'续读';}
function semanticUnitPages({title,navTitle,kicker,section,pageType,paras},target){
  const blocks=semanticBlocks(paras,pageType);const groups=groupSemanticBlocks(blocks,target),cont=continuationLabel(title);return groups.map((pageBlocks,i)=>({type:pageType,navTitle:i?`${section?`${section}｜`:''}${cont}（续${i}）`:navTitle,title:i?`${cont}（续${i}）`:title,kicker,section,blocks:pageBlocks}));
}
export { rebalanceContinuationGroups };
export function paginatePublicationDocument(doc,{targetChars=760,maxPages=80}={}){
  const pub=doc.publication;if(!pub)throw new Error('未识别到整期期刊结构');const requested=Math.max(420,Math.min(1400,Number(targetChars)||760));const target=Math.max(900,Math.round(requested*1.28));const pages=[];
  if(pub.preface?.paras?.length){pages.push(...semanticUnitPages({title:doc.title,navTitle:'卷首语',kicker:'卷首语',section:'',pageType:'article',paras:pub.preface.paras},target));}
  for(const sec of pub.sections){const kicker=sec.display||sec.name;const introBlocks=semanticBlocks(sec.intro,sec.pageType);const introWeight=introBlocks.reduce((n,b)=>n+blockWeight(b),0);if(introBlocks.length&&(introWeight>=160||sec.feature)){const introTitle=sec.feature||sec.tagline||`${sec.name}导读`;pages.push(...semanticUnitPages({title:introTitle,navTitle:`${sec.name}｜导读`,kicker,section:sec.name,pageType:sec.pageType,paras:sec.intro},Math.max(target,900)));}
    for(const article of sec.articles){const cleanTitle=stripNumberPrefix(article.title)||article.title;pages.push(...semanticUnitPages({title:cleanTitle,navTitle:`${sec.name}｜${cleanTitle}`,kicker,section:sec.name,pageType:sec.pageType,paras:article.paras},target));}
  }
  if(pub.closing?.paras?.length){const closeParas=[...pub.closing.paras];let closeTitle='尾刊寄语';if(closeParas[0]&&closeParas[0].style==='FirstParagraph'&&cleanText(closeParas[0].text).length<=40){closeTitle=cleanText(closeParas.shift().text).replace(/[。！？!?]$/,'');}pages.push({type:'closing',navTitle:'尾刊寄语',kicker:'尾刊寄语',title:closeTitle,section:'',blocks:semanticBlocks(closeParas,'article')});}
  if(pages.length>maxPages)throw new Error(`整期结构识别将生成 ${pages.length} 页，超过单次导入 ${maxPages} 页上限，请调整分页密度或拆分文件`);
  return {pages,recommendedPages:pages.length,targetChars:requested,semanticTarget:target,totalWeight:pages.flatMap(p=>p.blocks||[]).reduce((n,b)=>n+blockWeight(b),0),strategy:'periodical-structure',structure:pub.summary};
}
export function paginateImportedDocument(doc,{targetChars=760,maxPages=80,pageType='article',section='',kicker='',structureMode='auto'}={}) {
  if(structureMode!=='article'&&doc.publication&&(structureMode==='periodical'||structureMode==='auto'))return paginatePublicationDocument(doc,{targetChars,maxPages});
  const target=Math.max(320,Math.min(1400,Number(targetChars)||760)); const expanded=expandBlocks(doc.blocks||[]);
  const groups=[];let cur=[];let weight=0;for(const b of expanded){const w=blockWeight(b);if(cur.length&&(weight+w>target||cur.length>=MAX_BLOCKS)){groups.push(cur);cur=[];weight=0;}cur.push(b);weight+=w;}if(cur.length)groups.push(cur);if(!groups.length)groups.push([]);if(groups.length>maxPages)throw new Error(`自动分页将生成 ${groups.length} 页，超过单次导入 ${maxPages} 页上限，请拆分文件`);
  const pages=groups.map((blocks,i)=>({type:pageType,navTitle:groups.length===1?doc.title:`${doc.title}（${i+1}）`,title:groups.length===1?doc.title:`${doc.title}（${i+1}）`,kicker:kicker||section||'导入内容',section,blocks}));
  return {pages,recommendedPages:groups.length,targetChars:target,totalWeight:expanded.reduce((n,b)=>n+blockWeight(b),0),strategy:'article-flow',structure:null};
}

export function parsePastedText(text,{format='auto',filename='粘贴正文'}={}) {const fmt=format==='markdown'||(format==='auto'&&/(^|\n)#{1,3}\s|(^|\n)>\s|(^|\n)[-*+]\s/m.test(text))?'markdown':'text';return fmt==='markdown'?parseMarkdown(text,{filename}):parsePlainText(text,{filename});}
