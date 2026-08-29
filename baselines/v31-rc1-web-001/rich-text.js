const TIPTAP_VERSION = '3.30.2';
const LOCAL_VENDOR_MODULE = './vendor/tiptap-runtime.js';

const esc = (value='') => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
const safeColor = value => { const raw=String(value||'').trim(); if(/^#[0-9a-f]{3,8}$/i.test(raw))return raw; const m=raw.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(?:1|1\.0+))?\s*\)$/i); if(!m)return null; const nums=m.slice(1,4).map(n=>Math.max(0,Math.min(255,Number(n)))); return '#'+nums.map(n=>n.toString(16).padStart(2,'0')).join(''); };
const safeFontSize = value => /^(?:1[0-9]|2[0-9]|3[0-9]|4[0-8])px$/.test(String(value||'')) ? String(value) : null;
const safeHref = value => { try { const base=typeof location!=='undefined'?location.href:'https://local.invalid/'; const u = new URL(String(value||''), base); return ['http:','https:','mailto:'].includes(u.protocol) ? u.href : '#'; } catch { return '#'; } };
const clone = value => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));

export function legacyTextToRichText(text='') {
  return { type:'doc', content:[{ type:'paragraph', content:String(text).length ? [{type:'text', text:String(text)}] : [] }] };
}
export function normalizeRichText(value, fallback='') {
  if (value && value.type === 'doc' && Array.isArray(value.content)) return clone(value);
  return legacyTextToRichText(fallback);
}
export function richTextPlainText(doc) {
  const parts=[];
  const walk=node=>{ if(!node||typeof node!=='object')return; if(node.type==='text')parts.push(node.text||''); if(['paragraph','heading','blockquote','listItem'].includes(node.type)&&parts.length&&parts.at(-1)!=='\n')parts.push('\n'); (node.content||[]).forEach(walk); };
  walk(doc); return parts.join('').replace(/\n{3,}/g,'\n\n').trimEnd();
}
function renderMarks(text, marks=[]) {
  let out=esc(text);
  for (const mark of marks || []) {
    if(mark.type==='bold') out=`<strong>${out}</strong>`;
    else if(mark.type==='italic') out=`<em>${out}</em>`;
    else if(mark.type==='underline') out=`<u>${out}</u>`;
    else if(mark.type==='link') out=`<a href="${esc(safeHref(mark.attrs?.href))}" target="_blank" rel="noopener noreferrer">${out}</a>`;
    else if(mark.type==='highlight') { const c=safeColor(mark.attrs?.color); out=`<mark${c?` style="background-color:${esc(c)}"`:''}>${out}</mark>`; }
    else if(mark.type==='textStyle') { const styles=[]; const c=safeColor(mark.attrs?.color); const bg=safeColor(mark.attrs?.backgroundColor); const fs=safeFontSize(mark.attrs?.fontSize); if(c)styles.push(`color:${c}`); if(bg)styles.push(`background-color:${bg}`); if(fs)styles.push(`font-size:${fs}`); if(styles.length) out=`<span style="${styles.join(';')}">${out}</span>`; }
  }
  return out;
}
function renderNode(node) {
  if(!node||typeof node!=='object')return '';
  if(node.type==='text')return renderMarks(node.text||'',node.marks);
  const body=(node.content||[]).map(renderNode).join('');
  const align=['left','center','right','justify'].includes(node.attrs?.textAlign)?` style="text-align:${node.attrs.textAlign}"`:'';
  if(node.type==='doc')return body;
  if(node.type==='paragraph')return `<p${align}>${body||'<br>'}</p>`;
  if(node.type==='heading'){const level=Math.max(1,Math.min(4,Number(node.attrs?.level)||2));return `<h${level}${align}>${body}</h${level}>`;}
  if(node.type==='blockquote')return `<blockquote>${body}</blockquote>`;
  if(node.type==='bulletList')return `<ul>${body}</ul>`;
  if(node.type==='orderedList')return `<ol>${body}</ol>`;
  if(node.type==='listItem')return `<li>${body}</li>`;
  if(node.type==='hardBreak')return '<br>';
  return body;
}
export const renderRichText = doc => renderNode(normalizeRichText(doc,''));

const ALLOWED_TAGS = new Set(['P','H1','H2','H3','H4','STRONG','B','EM','I','U','A','UL','OL','LI','BLOCKQUOTE','BR','SPAN','MARK']);
const BLOCK_TAGS = new Set(['P','H1','H2','H3','H4','UL','OL','BLOCKQUOTE']);
function cleanStyle(style=''){
  const out=[];
  for(const raw of String(style).split(';')){
    const [name,...rest]=raw.split(':'); const value=rest.join(':').trim(); const key=name?.trim().toLowerCase();
    if(key==='color'&&safeColor(value))out.push(`color:${safeColor(value)}`);
    else if(key==='background-color'&&safeColor(value))out.push(`background-color:${safeColor(value)}`);
    else if(key==='font-size'&&safeFontSize(value))out.push(`font-size:${safeFontSize(value)}`);
    else if(key==='text-align'&&['left','center','right','justify'].includes(value))out.push(`text-align:${value}`);
  }
  return out.join(';');
}
export function sanitizePastedText(value=''){
  return String(value).replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'').replace(/\t/g,'  ').slice(0,120000);
}
export function sanitizePastedHtml(html=''){
  const input=String(html).slice(0,300000);
  if(typeof DOMParser==='undefined'){
    return input
      .replace(/<(script|style|iframe|object|embed|svg|math)[^>]*>[\s\S]*?<\/\1\s*>/gi,'')
      .replace(/<(img|video|audio|source|input|button|form|meta|link)\b[^>]*>/gi,'')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,'')
      .replace(/\s(?:class|id|data-[\w-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,'')
      .replace(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/gi,(_,quoted,dq,sq)=>{const style=cleanStyle(dq??sq??'');return style?` style="${style}"`:'';})
      .replace(/\shref\s*=\s*("([^"]*)"|'([^']*)')/gi,(_,quoted,dq,sq)=>{const href=safeHref(dq??sq??'');return href&&href!=='#'?` href="${esc(href)}"`:'';});
  }
  const doc=new DOMParser().parseFromString(`<div id="__paste_root">${input}</div>`,'text/html');
  const root=doc.querySelector('#__paste_root');
  const walk=(node)=>{
    for(const child of [...node.childNodes]){
      if(child.nodeType!==1)continue;
      if(!ALLOWED_TAGS.has(child.tagName)){
        const frag=doc.createDocumentFragment(); while(child.firstChild)frag.appendChild(child.firstChild); child.replaceWith(frag); walk(node); continue;
      }
      const href=child.tagName==='A'?safeHref(child.getAttribute('href')):null;
      const style=cleanStyle(child.getAttribute('style')||'');
      for(const attr of [...child.attributes])child.removeAttribute(attr.name);
      if(child.tagName==='A'&&href&&href!=='#')child.setAttribute('href',href);
      if(style)child.setAttribute('style',style);
      walk(child);
    }
  };
  walk(root);
  return root.innerHTML;
}

function textAlignOf(el){const v=(el?.style?.textAlign||'').toLowerCase();return ['left','center','right','justify'].includes(v)?v:null;}
function markKey(mark){return `${mark.type}:${JSON.stringify(mark.attrs||{})}`;}
function mergeMarks(base,extra){const map=new Map((base||[]).map(m=>[markKey(m),m]));for(const m of extra||[])map.set(markKey(m),m);return [...map.values()];}
function elementMarks(el){
  const marks=[]; if(!el||el.nodeType!==1)return marks; const tag=el.tagName;
  if(tag==='STRONG'||tag==='B')marks.push({type:'bold'}); if(tag==='EM'||tag==='I')marks.push({type:'italic'}); if(tag==='U')marks.push({type:'underline'});
  if(tag==='A'){const href=safeHref(el.getAttribute('href'));if(href&&href!=='#')marks.push({type:'link',attrs:{href}});}
  if(tag==='MARK'){const color=safeColor(el.style?.backgroundColor)||null;marks.push({type:'highlight',attrs:color?{color}: {}});}
  const color=safeColor(el.style?.color),fontSize=safeFontSize(el.style?.fontSize),backgroundColor=tag!=='MARK'?safeColor(el.style?.backgroundColor):null;
  if(color||fontSize||backgroundColor)marks.push({type:'textStyle',attrs:{...(color?{color}:{}),...(fontSize?{fontSize}:{}),...(backgroundColor?{backgroundColor}:{})}});
  return marks;
}
function inlineFromDom(node,inherited=[]){
  const out=[];
  for(const child of [...(node?.childNodes||[])]){
    if(child.nodeType===3){if(child.nodeValue)out.push({type:'text',text:child.nodeValue,...(inherited.length?{marks:clone(inherited)}:{})});continue;}
    if(child.nodeType!==1)continue;
    if(child.tagName==='BR'){out.push({type:'hardBreak'});continue;}
    const marks=mergeMarks(inherited,elementMarks(child));out.push(...inlineFromDom(child,marks));
  }
  return out;
}
function blockFromDom(el){
  if(!el||el.nodeType!==1)return null; const tag=el.tagName;
  if(tag==='UL'||tag==='OL')return {type:tag==='UL'?'bulletList':'orderedList',content:[...el.children].filter(x=>x.tagName==='LI').map(li=>listItemFromDom(li))};
  if(tag==='BLOCKQUOTE'){const content=[...el.children].map(blockFromDom).filter(Boolean);return {type:'blockquote',content:content.length?content:[{type:'paragraph',content:inlineFromDom(el)}]};}
  const attrs={}; const align=textAlignOf(el);if(align)attrs.textAlign=align;
  if(/^H[1-4]$/.test(tag))return {type:'heading',attrs:{level:Number(tag.slice(1)),...attrs},content:inlineFromDom(el)};
  return {type:'paragraph',...(Object.keys(attrs).length?{attrs}:{}),content:inlineFromDom(el)};
}
function listItemFromDom(li){const blocks=[];for(const child of [...li.childNodes]){if(child.nodeType===1&&BLOCK_TAGS.has(child.tagName)){const b=blockFromDom(child);if(b)blocks.push(b);}else if(child.nodeType===3&&child.nodeValue?.trim()){blocks.push({type:'paragraph',content:[{type:'text',text:child.nodeValue}]});}else if(child.nodeType===1){const content=inlineFromDom(child);if(content.length)blocks.push({type:'paragraph',content});}}return {type:'listItem',content:blocks.length?blocks:[{type:'paragraph',content:[]}]};}
export function domToRichText(root){
  if(!root||!root.childNodes)return legacyTextToRichText(''); const content=[]; let pending=[];
  const flush=()=>{if(pending.length){content.push({type:'paragraph',content:pending});pending=[];}};
  for(const child of [...root.childNodes]){
    if(child.nodeType===3){if(child.nodeValue)pending.push({type:'text',text:child.nodeValue});continue;}
    if(child.nodeType!==1)continue;
    if(BLOCK_TAGS.has(child.tagName)){flush();const b=blockFromDom(child);if(b)content.push(b);}else pending.push(...inlineFromDom(child));
  }
  flush(); return {type:'doc',content:content.length?content:[{type:'paragraph',content:[]}]};
}

let runtimePromise=null;
let runtimeStatus={mode:'uninitialized',version:TIPTAP_VERSION,selfHosted:true,externalCdn:false};
export function getRichTextRuntimeStatus(){return {...runtimeStatus};}
export function loadTiptapRuntime(){
  if(runtimePromise)return runtimePromise;
  runtimePromise=import(LOCAL_VENDOR_MODULE).then(mod=>{
    if(!mod.TIPTAP_VENDOR_READY)throw new Error('Local Tiptap vendor bundle has not been generated. Run npm run vendor:tiptap after installing dependencies.');
    const runtime={Editor:mod.Editor,StarterKit:mod.StarterKit,TextStyleKit:mod.TextStyleKit,Highlight:mod.Highlight,TextAlign:mod.TextAlign,version:mod.TIPTAP_VERSION||TIPTAP_VERSION,source:'self-hosted'};
    if(!runtime.Editor||!runtime.StarterKit||!runtime.TextStyleKit||!runtime.Highlight||!runtime.TextAlign)throw new Error('Local Tiptap vendor bundle is incomplete.');
    runtimeStatus={mode:'tiptap',version:runtime.version,selfHosted:true,externalCdn:false}; return runtime;
  }).catch(error=>{runtimePromise=null;runtimeStatus={mode:'fallback',version:TIPTAP_VERSION,selfHosted:true,externalCdn:false,error:String(error?.message||error)};throw error;});
  return runtimePromise;
}

function normalizeNativeFontSize(root,size){
  if(!root||!size)return;for(const font of root.querySelectorAll('font[size="7"]')){const span=document.createElement('span');span.style.fontSize=size;while(font.firstChild)span.appendChild(font.firstChild);font.replaceWith(span);}
}
function selectionElement(root){const sel=globalThis.getSelection?.();if(!sel?.rangeCount)return null;let node=sel.anchorNode;node=node?.nodeType===1?node:node?.parentElement;return node&&root.contains(node)?node:null;}
function closestWithin(node,selector,root){const el=node?.closest?.(selector);return el&&root.contains(el)?el:null;}
function nativeCommand(root,command,value=null){root.focus({preventScroll:true});try{return document.execCommand(command,false,value)}catch{return false;}}
function createNativeChain(api){
  const chain={focus(){api.focus();return chain;},toggleBold(){nativeCommand(api.element,'bold');return chain;},toggleItalic(){nativeCommand(api.element,'italic');return chain;},toggleUnderline(){nativeCommand(api.element,'underline');return chain;},toggleBlockquote(){nativeCommand(api.element,'formatBlock','blockquote');return chain;},toggleBulletList(){nativeCommand(api.element,'insertUnorderedList');return chain;},toggleOrderedList(){nativeCommand(api.element,'insertOrderedList');return chain;},setParagraph(){nativeCommand(api.element,'formatBlock','p');return chain;},toggleHeading({level=2}={}){nativeCommand(api.element,'formatBlock',`h${Math.max(1,Math.min(4,Number(level)||2))}`);return chain;},extendMarkRange(){return chain;},setLink({href}={}){const safe=safeHref(href);if(safe&&safe!=='#')nativeCommand(api.element,'createLink',safe);return chain;},unsetLink(){nativeCommand(api.element,'unlink');return chain;},toggleHighlight({color='#fff1a8'}={}){nativeCommand(api.element,'hiliteColor',safeColor(color)||'#fff1a8');return chain;},unsetAllMarks(){nativeCommand(api.element,'removeFormat');return chain;},clearNodes(){nativeCommand(api.element,'formatBlock','p');return chain;},setTextAlign(value){const map={left:'justifyLeft',center:'justifyCenter',right:'justifyRight',justify:'justifyFull'};nativeCommand(api.element,map[value]||'justifyLeft');return chain;},setFontSize(value){const size=safeFontSize(value);if(size){nativeCommand(api.element,'fontSize','7');normalizeNativeFontSize(api.element,size);api.emitUpdate();}return chain;},unsetFontSize(){return chain;},setColor(value){const color=safeColor(value);if(color)nativeCommand(api.element,'foreColor',color);return chain;},undo(){nativeCommand(api.element,'undo');return chain;},redo(){nativeCommand(api.element,'redo');return chain;},run(){api.emitUpdate();api.emitSelection();return true;}};return chain;
}
export function createNativeStructuredEditor({element,content,onUpdate,onSelectionUpdate,onBlur}){
  if(!element||typeof document==='undefined')throw new Error('Native structured editor requires a browser DOM.');
  element.innerHTML=renderRichText(content);element.setAttribute('contenteditable','true');element.setAttribute('spellcheck','true');element.classList.add('studio-native-richtext');
  let destroyed=false;
  const api={element,mode:'fallback',getJSON:()=>domToRichText(element),focus:(where)=>{element.focus({preventScroll:true});if(where==='end'){const r=document.createRange();r.selectNodeContents(element);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);}},commands:{focus:(where)=>{api.focus(where);return true;}},chain:()=>createNativeChain(api),can:()=>({chain:()=>createNativeChain(api),undo:()=>true,redo:()=>true}),isActive:(name,attrs={})=>{if(name&&typeof name==='object'){const align=name.textAlign;const el=selectionElement(element);return Boolean(align&&el&&getComputedStyle(el).textAlign===align);}if(['bold','italic','underline'].includes(name)){try{return document.queryCommandState(name)}catch{return false;}}const el=selectionElement(element);if(name==='blockquote')return Boolean(closestWithin(el,'blockquote',element));if(name==='bulletList')return Boolean(closestWithin(el,'ul',element));if(name==='orderedList')return Boolean(closestWithin(el,'ol',element));if(name==='heading')return Boolean(closestWithin(el,`h${attrs.level||2}`,element));return false;},getAttributes:(name)=>{const el=selectionElement(element);if(name==='link'){const a=closestWithin(el,'a',element);return {href:a?.getAttribute('href')||''};}if(name==='textStyle'){const s=closestWithin(el,'span',element);return {fontSize:s?.style?.fontSize||'',color:s?.style?.color||''};}return {};},emitUpdate:()=>{if(!destroyed)onUpdate?.(api.getJSON(),api);},emitSelection:()=>{if(!destroyed)onSelectionUpdate?.(api);},destroy:()=>{destroyed=true;element.removeAttribute('contenteditable');element.classList.remove('studio-native-richtext');document.removeEventListener('selectionchange',selectionHandler);element.removeEventListener('input',inputHandler);element.removeEventListener('blur',blurHandler);element.removeEventListener('paste',pasteHandler);}};
  const inputHandler=()=>api.emitUpdate(),selectionHandler=()=>{const s=getSelection();if(s?.anchorNode&&element.contains(s.anchorNode))api.emitSelection();},blurHandler=()=>onBlur?.(api.getJSON(),api),pasteHandler=e=>{e.preventDefault();const html=e.clipboardData?.getData('text/html')||'',text=sanitizePastedText(e.clipboardData?.getData('text/plain')||'');if(html){nativeCommand(element,'insertHTML',sanitizePastedHtml(html));}else nativeCommand(element,'insertText',text);api.emitUpdate();};
  element.addEventListener('input',inputHandler);element.addEventListener('blur',blurHandler);element.addEventListener('paste',pasteHandler);document.addEventListener('selectionchange',selectionHandler);runtimeStatus={mode:'fallback',version:TIPTAP_VERSION,selfHosted:true,externalCdn:false};
  return api;
}

export async function createRichTextEditor({ element, content, onUpdate, onSelectionUpdate, onBlur }) {
  try{
    const {Editor,StarterKit,TextStyleKit,Highlight,TextAlign,version}=await loadTiptapRuntime();
    const editor=new Editor({
      element,
      extensions:[StarterKit.configure({heading:{levels:[1,2,3,4]}}),TextStyleKit,Highlight.configure({multicolor:true}),TextAlign.configure({types:['heading','paragraph']})],
      content:normalizeRichText(content,''),
      editorProps:{attributes:{class:'studio-tiptap-prosemirror',spellcheck:'true','data-tiptap-version':version},transformPastedHTML:sanitizePastedHtml,transformPastedText:sanitizePastedText},
      onUpdate:({editor})=>onUpdate?.(editor.getJSON(),editor),
      onSelectionUpdate:({editor})=>onSelectionUpdate?.(editor),
      onBlur:({editor})=>onBlur?.(editor.getJSON(),editor),
    });
    editor.richTextRuntime='tiptap'; return editor;
  }catch(error){
    console.warn('Self-hosted Tiptap runtime unavailable; using structured native fallback.',error);
    return createNativeStructuredEditor({element,content:normalizeRichText(content,''),onUpdate,onSelectionUpdate,onBlur});
  }
}

export const RICH_TEXT_ENGINE_INFO = Object.freeze({name:'Tiptap Core',version:TIPTAP_VERSION,storage:'issue.json richText JSON',htmlIsSourceOfTruth:false,selfHosted:true,externalCdnFallback:false,nativeStructuredFallback:true});
