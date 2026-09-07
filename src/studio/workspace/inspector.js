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

function issueApiTarget(input) {
  const raw = typeof input === 'string' ? input : input?.url;
  if (!raw) return null;
  let url;
  try { url = new URL(raw, 'http://studio.local'); } catch { return null; }
  const match = url.pathname.match(/\/api\/issues\/([^/]+)(?:\/(draft|source-status))?\/?$/);
  if (!match) return null;
  let id = match[1];
  try { id = decodeURIComponent(id); } catch {}
  return { id, resource: match[2] || 'issue' };
}

function storageKey(id) { return `v3-source-conflict:${id}`; }
function storageRead(storage,id) {
  try { const raw=storage?.getItem?.(storageKey(id)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function storageWrite(storage,id,value) {
  try { storage?.setItem?.(storageKey(id),JSON.stringify(value)); } catch {}
}
function storageDelete(storage,id) {
  try { storage?.removeItem?.(storageKey(id)); } catch {}
}
async function responseJson(response) {
  try { return await response.clone().json(); } catch { return null; }
}

// SOURCE_DRIFT protects only the first stale save when the caller later
// replaces its edit-baseline fingerprint with a freshly fetched server
// fingerprint. Keep the original rejected baseline pinned per browser tab.
// A full issue reload clears the pin only when there is no recovery draft (or
// the user explicitly deletes that draft), so recovering stale local edits can
// never silently turn into an overwrite of the newer server issue.
export function createSourceConflictFetchGuard(fetchImpl,{storage=null}={}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  const reloadSeen=new Set();
  const draftState=new Map();
  const blocked=id=>storageRead(storage,id);
  const clear=id=>{storageDelete(storage,id);reloadSeen.delete(id);draftState.delete(id);};
  const maybeClear=id=>{if(reloadSeen.has(id)&&draftState.get(id)===false)clear(id);};

  const guarded=async (input,init={})=>{
    const target=issueApiTarget(input);
    const method=String(init?.method||'GET').toUpperCase();
    let nextInit=init;
    let requestedFingerprint='';
    const existing=target?.id ? blocked(target.id) : null;

    if(target?.resource==='issue'&&method==='PUT'&&typeof init?.body==='string'){
      try {
        const payload=JSON.parse(init.body);
        requestedFingerprint=String(payload?.sourceFingerprint||'');
        if(existing?.fingerprint&&payload?.issue&&typeof payload.issue==='object'){
          nextInit={...init,body:JSON.stringify({...payload,sourceFingerprint:existing.fingerprint})};
        }
      } catch {}
    }

    const response=await fetchImpl(input,nextInit);

    if(target?.resource==='issue'&&method==='PUT'){
      if(response.ok){ clear(target.id); }
      else if(response.status===409){
        const data=await responseJson(response);
        if(data?.code==='SOURCE_DRIFT'&&!existing?.fingerprint&&requestedFingerprint){
          storageWrite(storage,target.id,{fingerprint:requestedFingerprint,blockedAt:new Date().toISOString()});
        }
      }
    } else if(target?.resource==='issue'&&method==='GET'&&response.ok){
      reloadSeen.add(target.id);maybeClear(target.id);
    } else if(target?.resource==='draft'&&method==='GET'&&response.ok){
      const data=await responseJson(response);
      if(data&&Object.prototype.hasOwnProperty.call(data,'exists')){draftState.set(target.id,Boolean(data.exists));maybeClear(target.id);}
    } else if(target?.resource==='draft'&&method==='DELETE'&&response.ok){
      draftState.set(target.id,false);maybeClear(target.id);
    }
    return response;
  };
  guarded.isBlocked=id=>Boolean(blocked(String(id))?.fingerprint);
  guarded.blockedFingerprint=id=>String(blocked(String(id))?.fingerprint||'');
  guarded.clear=id=>clear(String(id));
  return guarded;
}

export function installSourceConflictFetchGuard(scope=globalThis) {
  if(!scope?.fetch||scope.__V3_SOURCE_CONFLICT_GUARD__)return false;
  const original=scope.fetch.bind(scope);
  let storage=null;
  try { storage=scope.sessionStorage||null; } catch {}
  const guarded=createSourceConflictFetchGuard(original,{storage});
  scope.fetch=guarded;
  scope.__V3_SOURCE_CONFLICT_GUARD__=guarded;
  return true;
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

if (typeof window !== 'undefined') installSourceConflictFetchGuard(window);
if (typeof document !== 'undefined') bindWorkspaceAuditLocatorBridge(document);
