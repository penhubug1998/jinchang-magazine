export function inspectorKind(blocks = []) {
  if (!blocks.length) return 'page';
  if (blocks.length > 1) return 'multi';
  const type = blocks[0]?.type || 'block';
  if (type === 'image' || type === 'video') return 'media';
  if (type === 'container') return 'layout';
  return 'text';
}

export function blockInspectorSummary(block = {}) {
  const design = block?.design || {};
  return {
    id: block?.id || '',
    type: block?.type || 'block',
    width: Number(design.width || 100),
    alignSelf: design.alignSelf || 'left',
    textAlign: design.textAlign || 'left',
    fontSize: Number(design.fontSize || 0),
    fontWeight: String(design.fontWeight || '400'),
    margin: Number(design.margin || 0),
    padding: Number(design.padding || 0),
  };
}
