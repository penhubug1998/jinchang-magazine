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

// Workspace findings live inside a modal dialog, while their targets live in
// the editor behind it. Close the modal in the capture phase so the existing
// locateFinding() handler can move focus to page metadata or content blocks on
// the same click without the browser's modal focus trap keeping focus inside
// the checks dialog.
export function bindWorkspaceAuditLocatorBridge(root = globalThis.document) {
  if (!root?.addEventListener || root.__v3WorkspaceAuditLocatorBridge) return false;
  root.__v3WorkspaceAuditLocatorBridge = true;
  root.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-workspace-audit-locate]');
    if (!button) return;
    const dialog = root.getElementById?.('workspaceAuditDialog');
    if (dialog?.open) dialog.close('locate');
  }, true);
  return true;
}

if (typeof document !== 'undefined') bindWorkspaceAuditLocatorBridge(document);
