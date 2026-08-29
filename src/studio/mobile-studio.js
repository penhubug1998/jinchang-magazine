export const MOBILE_STUDIO_BREAKPOINT = 820;

const TEXT_TYPES = new Set(['paragraph','quote','textFlow','sectionHeading','title','heading']);
const MEDIA_TYPES = new Set(['image','video']);

export function isMobileStudioViewport(width, { force = false } = {}) {
  return Boolean(force || Number(width) <= MOBILE_STUDIO_BREAKPOINT);
}

export function mobileTextTargets(page) {
  const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
  return blocks.map((block,index)=>({ block,index })).filter(({block})=>{
    if (!block || typeof block !== 'object') return false;
    if (TEXT_TYPES.has(block.type)) return true;
    return ['text','title','case','warning'].some(key=>typeof block[key] === 'string' && block[key].trim());
  });
}

export function mobileMediaTargets(page) {
  const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
  return blocks.map((block,index)=>({ block,index })).filter(({block})=>MEDIA_TYPES.has(block?.type));
}

export function primaryEditableField(block) {
  if (!block || typeof block !== 'object') return null;
  if (typeof block.text === 'string') return 'text';
  if (typeof block.title === 'string') return 'title';
  if (typeof block.case === 'string') return 'case';
  if (typeof block.warning === 'string') return 'warning';
  return null;
}

export function mobilePageSnapshot(page, index = 0, total = 0) {
  const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
  const text = mobileTextTargets(page).length;
  const media = mobileMediaTargets(page).length;
  return {
    pageNumber: Number(index) + 1,
    total: Math.max(0, Number(total) || 0),
    title: page?.navTitle || page?.title || `页面 ${Number(index) + 1}`,
    section: page?.section || '未归类',
    type: page?.type || 'article',
    blocks: blocks.length,
    text,
    media,
  };
}

export function mobileWorkflowItems({ auditOpen = 0, auditBlockers = 0, canPublish = false } = {}) {
  return [
    { id:'problems', label:'查看问题', badge: auditBlockers || auditOpen || 0 },
    { id:'review', label:'内部校审', badge: auditOpen || 0 },
    { id:'publish', label:'发布中心', state: canPublish ? 'ready' : 'pending' },
  ];
}
