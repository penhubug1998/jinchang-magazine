import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Execute the production controller functions with controlled async responses.
// These regressions guard against lost updates, duplicate submissions and false review success.
const source=await readFile('src/studio/studio.js','utf8');
const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const pageContext={page:{type:'toc',title:'目录'},currentPage(){return this.page},$:(id)=>({value:({pageType:'toc',pageTitle:'目录'})[id.slice(1)]||''})};
pageContext.currentPage=()=>pageContext.page;vm.createContext(pageContext);vm.runInContext(extract('function syncPageMeta()', 'function syncJsonFromPage'),pageContext);pageContext.syncPageMeta();assert.equal(Object.hasOwn(pageContext.page,'section'),false,'visiting a page must not create empty optional fields');
const functions=[
  extract('async function refreshSourceStatus(', 'function setMetaExpanded('),
  extract('async function saveIssue(', 'function downloadCurrentDraft('),
  extract('async function markPublicationReady(', "$('#publicationMarkReadyBtn')")
].join('\n');
function harness(){
  const elements=new Map(),calls={save:0,diff:0,draft:0,render:0};
  const issue={id:'001',status:'draft',subtitle:'原稿',pages:[]};
  const state={issue:structuredClone(issue),originalIssue:structuredClone(issue),sourceFingerprint:'base',sourceStatus:{fingerprint:'base'},dirty:true,sourceConflict:false,saving:false};
  const context={state,Boolean,String,JSON,Promise,encodeURIComponent,PEER_SESSION_ID:'test-session',
    window:{addEventListener(){}},document:{addEventListener(){}},
    $:id=>{if(!elements.has(id))elements.set(id,{disabled:false,textContent:'',value:'draft'});return elements.get(id)},
    cloneData:structuredClone,issuesEqual:(a,b)=>JSON.stringify(a)===JSON.stringify(b),
    commitPage:()=>true,syncMeta:()=>{},ensureIssueIdentity:()=>({changed:false}),
    renderPages:()=>{},renderPage:()=>calls.render++,renderSourceStatus:()=>{},updateStateBadges:()=>{},
    deleteDraft:async()=>{},loadIssues:async()=>{},loadSnapshots:async()=>{},broadcastPeer:()=>{},toast:()=>{},
    scheduleDraftSave:()=>calls.draft++,requireIssue:()=>true,openSaveDiff:()=>calls.diff++,
    isReleaseableIssueStatus:s=>['ready','published'].includes(s),markDirty:()=>{state.dirty=true},updateMetaSummary:()=>{},renderPublicationCenter:()=>{},loadPublicationStatus:async()=>{},
    api:async()=>{throw Error('unexpected API call')}
  };
  vm.createContext(context);vm.runInContext(functions,context);
  return {context,state,calls,elements};
}
{
  const {context:c,state:s}=harness();c.api=async()=>({fingerprint:'remote-new'});
  await c.refreshSourceStatus({quiet:true});
  assert.equal(s.sourceFingerprint,'base','status refresh must not adopt an unread source version');
  assert.equal(s.sourceStatus.fingerprint,'remote-new');assert.equal(s.sourceConflict,true);
}
{
  const {context:c,state:s,calls}=harness();c.api=async(url)=>{
    if(url.endsWith('source-status'))return {fingerprint:'remote-new'};
    calls.save++;throw Object.assign(Error('conflict'),{code:'SOURCE_DRIFT'});
  };
  assert.equal(await c.saveIssue(),false);await Promise.resolve();
  assert.equal(await c.saveIssue(),false);assert.equal(calls.save,1,'retry must remain blocked until conflict is resolved');
  assert.equal(s.sourceFingerprint,'base');assert.equal(s.issue.subtitle,'原稿');assert.equal(s.dirty,true);
  assert(s.sourceConflict,'first SOURCE_DRIFT must lock saving against the remote version');
  // Reopening the issue starts a clean session: the local baseline is rebound to the newest server version.
  s.issue=structuredClone(s.originalIssue);s.dirty=false;s.sourceConflict=false;
  await c.refreshSourceStatus({quiet:true,adoptBaseline:true});
  assert.equal(s.sourceFingerprint,'remote-new','rebinding must adopt the newest source version');
  assert.equal(await c.saveIssue(),false);assert(calls.save>=2,'after rebinding, saving must reach the server instead of being silently skipped');
}
{
  const {context:c,state:s,calls}=harness();let finish;
  c.api=async()=>{calls.save++;return await new Promise(resolve=>{finish=resolve})};
  const first=c.saveIssue();assert.equal(await c.saveIssue(),false);
  s.issue.subtitle='请求期间继续编辑';
  finish({issue:{...structuredClone(s.originalIssue),subtitle:'原稿'},source:{fingerprint:'saved'},snapshot:{id:'s1'}});
  assert.equal(await first,false,'newer unsaved edits must prevent dependent publishing');
  assert.equal(calls.save,1);assert.equal(s.issue.subtitle,'请求期间继续编辑');assert.equal(s.originalIssue.subtitle,'原稿');
  assert.equal(s.sourceFingerprint,'saved');assert.equal(s.dirty,true);assert.equal(calls.draft,1);assert.equal(calls.render,0,'save response must not replace the active editor');assert.equal(s.saving,false);
}
{
  const {context:c,state:s,calls}=harness();c.api=async()=>{calls.save++;return {issue:structuredClone(s.issue),source:{fingerprint:'saved'},snapshot:{id:'s1'}}};
  await c.saveFromToolbar();assert.equal(calls.save,1);assert.equal(calls.diff,0);assert.equal(s.dirty,false);
  s.dirty=true;s.originalIssue.status='published';await c.saveFromToolbar();assert.equal(calls.diff,1,'published revisions still require a review');assert.equal(calls.save,1);
}
{
  const {context:c,state:s}=harness();s.publicationBusy='';c.api=async()=>{throw Error('offline')};
  await c.markPublicationReady();assert.equal(s.issue.status,'draft','failed save must not claim editorial confirmation');
  assert.equal(s.dirty,true);assert.equal(s.saving,false);
  c.api=async()=>({issue:structuredClone(s.issue),source:{fingerprint:'saved'},snapshot:{id:'s1'}});
  await c.markPublicationReady();assert.equal(s.issue.status,'ready');assert.equal(s.originalIssue.status,'ready');assert.equal(s.dirty,false);
}
console.log('制作流程回归通过：版本刷新不越过冲突、重复保存受保护、请求期间修改保留、草稿直接保存、已发布稿确认、待发布状态保存成功后生效。');
