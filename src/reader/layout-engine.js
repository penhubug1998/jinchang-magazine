import { normalizeRichText } from './rich-text.js';

const clone = value => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const clamp = (value,min,max,fallback)=>{const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;};
const safeId = value => String(value || '').trim().replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,80);

export const LAYOUT_ENGINE_INFO = Object.freeze({
  name:'Jinchang Publishing Layout Engine',
  version:'3.1-alpha23',
  sourceOfTruth:'issue.json',
  derivedPagination:true,
  htmlIsSourceOfTruth:false,
});

export function normalizePagePublishing(page={}){
  const p=page?.publishing||page?.layout||{};
  return {
    columns: clamp(p.columns,1,3,1),
    columnGap: clamp(p.columnGap,8,48,18),
    balanceColumns: p.balanceColumns !== false,
    columnRule: p.columnRule === true,
  };
}

export function normalizeBlockPublishing(block={}){
  const p=block?.publishing||{};
  return {
    keepWithNext: p.keepWithNext === true,
    avoidBreak: p.avoidBreak === true,
    dropCap: p.dropCap === true,
    spanAll: p.spanAll === true,
    wrap: ['left','right','none'].includes(p.wrap) ? p.wrap : 'none',
    wrapWidth: clamp(p.wrapWidth,20,58,38),
    captionLabel: String(p.captionLabel||'').slice(0,40),
    role: ['body','pullQuote','sidebar','caption'].includes(p.role) ? p.role : 'body',
  };
}

function charWeight(ch=''){
  if(/\s/u.test(ch)) return .32;
  if(/[\u3400-\u9fff\uf900-\ufaff]/u.test(ch)) return 1;
  if(/[，。！？；：、（）《》“”‘’—…,.!?;:()\[\]{}'"-]/u.test(ch)) return .5;
  return .58;
}
function textUnits(text=''){let total=0;for(const ch of String(text))total+=charWeight(ch);return total;}
function markScale(marks=[]){
  let scale=1;
  for(const mark of marks||[]){
    if(mark?.type==='bold')scale*=1.03;
    const fs=String(mark?.attrs?.fontSize||'').match(/^(\d+)px$/); if(fs)scale*=Math.max(.8,Math.min(2,Number(fs[1])/14));
  }
  return scale;
}
function nodeUnits(node){
  if(!node||typeof node!=='object')return 0;
  if(node.type==='text')return textUnits(node.text||'')*markScale(node.marks);
  let total=(node.content||[]).reduce((s,x)=>s+nodeUnits(x),0);
  if(node.type==='heading')total*=1.55;
  else if(node.type==='blockquote')total*=1.18;
  else if(node.type==='bulletList'||node.type==='orderedList')total*=1.12;
  return total+(['paragraph','heading','blockquote','listItem'].includes(node.type)?4:0);
}

function splitTextNode(node,maxUnits){
  const text=String(node?.text||''); if(!text)return [null,null];
  let used=0,index=0; const scale=markScale(node.marks);
  for(const ch of text){const w=charWeight(ch)*scale;if(index>0&&used+w>maxUnits)break;used+=w;index+=ch.length;}
  if(index<=0)index=[...text][0]?.length||1;
  const head={...clone(node),text:text.slice(0,index)}; const tailText=text.slice(index); const tail=tailText?{...clone(node),text:tailText}:null;
  return [head,tail];
}
function splitInlineContent(content=[],maxUnits){
  const head=[],tail=[];let remain=maxUnits,broken=false;
  for(const child of content||[]){
    if(broken){tail.push(clone(child));continue;}
    if(child?.type==='hardBreak'){if(remain>=1){head.push(clone(child));remain-=1;}else{tail.push(clone(child));broken=true;}continue;}
    if(child?.type!=='text'){const u=nodeUnits(child);if(u<=remain){head.push(clone(child));remain-=u;}else{tail.push(clone(child));broken=true;}continue;}
    const u=nodeUnits(child);if(u<=remain){head.push(clone(child));remain-=u;continue;}
    const [a,b]=splitTextNode(child,remain);if(a)head.push(a);if(b)tail.push(b);broken=true;
  }
  return [head,tail];
}
function splitParagraph(node,maxUnits,minHead,minTail){
  const total=nodeUnits(node); if(total<=maxUnits)return [clone(node),null];
  if(maxUnits<minHead)return [null,clone(node)];
  let target=maxUnits;
  if(total-target<minTail)target=Math.max(minHead,total-minTail);
  const [a,b]=splitInlineContent(node.content||[],target);
  if(!a.length)return [null,clone(node)];
  return [{...clone(node),content:a},b.length?{...clone(node),content:b}:null];
}
function flowSettings(block={}){
  const f=block.flow||{};
  return {
    capacity: clamp(f.capacity,80,4000,680),
    lineChars: clamp(f.lineChars,12,80,28),
    orphanLines: clamp(f.orphanLines,1,5,2),
    widowLines: clamp(f.widowLines,1,5,2),
  };
}
function firstFlowSource(slots){
  for(const slot of slots){if(slot.block?.richText||slot.block?.text)return normalizeRichText(slot.block.richText,slot.block.text||'');}
  return normalizeRichText(null,'');
}
function flowSlotId(block,pageIndex,blockIndex){return block?.id||`flow-slot-${pageIndex}-${blockIndex}`;}

export function buildPublishingPlan(issue={}){
  const pages=Array.isArray(issue?.pages)?issue.pages:[];
  const groups=new Map();
  pages.forEach((page,pageIndex)=>(page.blocks||[]).forEach((block,blockIndex)=>{
    if(block?.type!=='textFlow')return; const flowId=safeId(block.flowId||block.flow?.id||'main');
    if(!groups.has(flowId))groups.set(flowId,[]);groups.get(flowId).push({pageIndex,blockIndex,block});
  }));
  const fragments={},diagnostics=[];
  for(const [flowId,slots] of groups){
    const source=firstFlowSource(slots); let queue=(source.content||[]).map(clone); let continued=null;
    for(const slot of slots){
      const settings=flowSettings(slot.block); let remain=settings.capacity; const out=[];
      if(continued){queue.unshift(continued);continued=null;}
      while(queue.length&&remain>0){
        const node=queue[0],units=nodeUnits(node);
        if(node?.type==='heading'&&queue[1]){
          const nextUnits=nodeUnits(queue[1]); const minNext=settings.lineChars*settings.orphanLines;
          if(out.length&&units+Math.min(nextUnits,minNext)>remain)break;
        }
        if(units<=remain){out.push(queue.shift());remain-=units;continue;}
        if(node?.type==='paragraph'){
          const minHead=settings.lineChars*settings.orphanLines,minTail=settings.lineChars*settings.widowLines;
          const [head,tail]=splitParagraph(node,remain,minHead,minTail);
          if(head){out.push(head);queue.shift();continued=tail;remain=0;} break;
        }
        if(out.length)break;
        out.push(queue.shift());remain=0;
      }
      const slotId=flowSlotId(slot.block,slot.pageIndex,slot.blockIndex);
      fragments[slotId]={type:'doc',content:out.length?out:[{type:'paragraph',content:[]}]};
    }
    const left=(continued?[continued,...queue]:queue).filter(Boolean);
    if(left.length)diagnostics.push({flowId,type:'overflow',remainingNodes:left.length,remainingUnits:Math.round(left.reduce((s,n)=>s+nodeUnits(n),0))});
    else diagnostics.push({flowId,type:'complete',remainingNodes:0,remainingUnits:0});
  }
  return {fragments,diagnostics,engine:LAYOUT_ENGINE_INFO};
}

export function flowFragmentFor(plan,block,ctx={}){
  const id=flowSlotId(block,ctx.pageIndex,ctx.blockIndex);return plan?.fragments?.[id]||normalizeRichText(block?.richText,block?.text||'');
}
export function publishingBlockClass(block={}){
  const p=normalizeBlockPublishing(block),classes=[];
  if(p.keepWithNext)classes.push('pub-keep-with-next'); if(p.avoidBreak)classes.push('pub-avoid-break'); if(p.dropCap)classes.push('pub-drop-cap'); if(p.spanAll)classes.push('pub-span-all');
  if(p.wrap!=='none')classes.push(`pub-wrap-${p.wrap}`); if(p.role!=='body')classes.push(`pub-role-${p.role}`);
  return classes.join(' ');
}
export function publishingBlockStyle(block={}){
  const p=normalizeBlockPublishing(block),out=[]; if(p.wrap!=='none')out.push(`--pub-wrap-width:${p.wrapWidth}%`); return out.join(';');
}
export function pagePublishingStyle(page={}){
  const p=normalizePagePublishing(page),out=[]; if(p.columns>1){out.push(`column-count:${p.columns}`,`column-gap:${p.columnGap}px`,`column-fill:${p.balanceColumns?'balance':'auto'}`);if(p.columnRule)out.push('column-rule:1px solid rgba(109,73,48,.18)');}return out.join(';');
}
