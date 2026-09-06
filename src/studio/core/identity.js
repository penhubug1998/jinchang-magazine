export const STABLE_ID_RE = /^(?:page|block)_[a-z0-9][a-z0-9_-]{5,63}$/i;
export const validStableId = (value, kind = null) => typeof value === 'string' && STABLE_ID_RE.test(value) && (!kind || value.startsWith(`${kind}_`));

export function hash32(value='') {
  let h = 0x811c9dc5;
  for (const ch of String(value)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}
function uniqueId(kind, seed, seen) {
  const prefix = kind === 'page' ? 'page' : 'block';
  const base = `${prefix}_${hash32(seed).padStart(6,'0')}`;
  let id=base,n=2; while(seen.has(id)) id=`${base}_${n++}`; seen.add(id); return id;
}
export function createStableId(kind='block') {
  const prefix=kind==='page'?'page':'block';
  const uuid=globalThis.crypto?.randomUUID?.().replaceAll('-','').slice(0,16);
  return `${prefix}_${uuid || `${Date.now().toString(36)}${Math.random().toString(36).slice(2,10)}`}`;
}
export function ensureIssueIdentity(issue) {
  const stats={assignedPages:0,assignedBlocks:0,repairedDuplicatePages:0,repairedDuplicateBlocks:0,repairedInvalidPages:0,repairedInvalidBlocks:0,changed:false};
  if(!issue||!Array.isArray(issue.pages))return stats;
  const issueId=String(issue.id||'issue'),pageIds=new Set(),blockIds=new Set();
  const walk=(rows,pageId,path)=>{(rows||[]).forEach((block,i)=>{if(!block||typeof block!=='object')return;const old=block.id;if(validStableId(old,'block')&&!blockIds.has(old))blockIds.add(old);else{if(old){if(validStableId(old,'block'))stats.repairedDuplicateBlocks++;else stats.repairedInvalidBlocks++;}block.id=uniqueId('block',`${issueId}|${pageId}|${path}${i}|${block.type||'block'}`,blockIds);stats.assignedBlocks++;}if(block.type==='container')(block.columns||[]).forEach((c,ci)=>walk(c?.blocks,pageId,`${path}${i}.c${ci}.`));});};
  issue.pages.forEach((page,i)=>{if(!page||typeof page!=='object')return;const old=page.id;if(validStableId(old,'page')&&!pageIds.has(old))pageIds.add(old);else{if(old){if(validStableId(old,'page'))stats.repairedDuplicatePages++;else stats.repairedInvalidPages++;}page.id=uniqueId('page',`${issueId}|page|${i}|${page.type||'article'}`,pageIds);stats.assignedPages++;}walk(page.blocks,page.id,`p${i}.b`);});
  stats.changed=Boolean(stats.assignedPages||stats.assignedBlocks||stats.repairedDuplicatePages||stats.repairedDuplicateBlocks||stats.repairedInvalidPages||stats.repairedInvalidBlocks);return stats;
}
export function ensureBlockIdentity(block) { if(!block||typeof block!=='object')return block;if(!validStableId(block.id,'block'))block.id=createStableId('block');if(block.type==='container')(block.columns||[]).forEach(c=>(c?.blocks||[]).forEach(ensureBlockIdentity));return block; }
export function regenerateBlockIdentity(block) { if(!block||typeof block!=='object')return block;block.id=createStableId('block');if(block.type==='container')(block.columns||[]).forEach(c=>(c?.blocks||[]).forEach(regenerateBlockIdentity));return block; }
export function findPageIndexById(issue,pageId){return validStableId(pageId,'page')?(issue?.pages||[]).findIndex(p=>String(p?.id||'')===String(pageId)):-1;}
export function findBlockIndexById(page,blockId){return validStableId(blockId,'block')?(page?.blocks||[]).findIndex(b=>b?.id===blockId):-1;}
export function clearPageIdentity(page){if(!page||typeof page!=='object')return page;delete page.id;const walk=rows=>(rows||[]).forEach(b=>{if(!b||typeof b!=='object')return;delete b.id;if(b.type==='container')(b.columns||[]).forEach(c=>walk(c?.blocks));});walk(page.blocks);return page;}
export function identitySnapshot(issue){const pages=[],blocks=[];const walk=(rows,pageId,path)=>(rows||[]).forEach((b,i)=>{if(!b||typeof b!=='object')return;blocks.push({pageId,id:b.id||null,path:`${path}${i}`,type:b.type||'block'});if(b.type==='container')(b.columns||[]).forEach((c,ci)=>walk(c?.blocks,pageId,`${path}${i}.c${ci}.`));});(issue?.pages||[]).forEach((p,i)=>{pages.push({index:i,id:p?.id||null,type:p?.type||'article'});walk(p?.blocks,p?.id||null,`p${i}.b`);});return {pages,blocks};}
