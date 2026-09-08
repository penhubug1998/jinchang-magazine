import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../src/studio/studio.js',import.meta.url),'utf8');
const save=source.slice(source.indexOf('async function saveIssue('),source.indexOf("\nwindow.addEventListener('message',event=>{"));
function setup(){
  let resolve,calls=0;
  const state={issue:{id:'003',title:'before'},sourceFingerprint:'old',dirty:true};
  const context=vm.createContext({state,JSON,Date,Promise,PEER_SESSION_ID:'test',cloneData:structuredClone,
    api:()=>{calls++;return new Promise(r=>{resolve=r;});},commitPage:()=>true,syncMeta(){},
    ensureIssueIdentity:()=>({changed:false}),toast(){},renderSourceStatus(){},updateStateBadges(){},
    broadcastPeer(){},renderPages(){},renderPage(){},deleteDraft(){},loadIssues(){},loadSnapshots(){}});
  vm.runInContext(save,context);
  return {state,run:()=>vm.runInContext('saveIssue()',context),calls:()=>calls,finish:()=>resolve({issue:{id:'003',title:'before'},source:{fingerprint:'new'},snapshot:{id:'test'}})};
}
{
  const t=setup(),pending=t.run();
  assert.equal(await t.run(),false);assert.equal(t.calls(),1,'double click sends one request');
  t.state.issue.title='typed while saving';t.finish();
  assert.equal(await pending,false);assert.equal(t.state.issue.title,'typed while saving');
  assert.equal(t.state.dirty,true);assert.equal(t.state.sourceFingerprint,'new');assert.equal(t.state.saving,false);
}
{
  const t=setup(),pending=t.run();t.state.issue={id:'002',title:'another issue'};t.finish();
  assert.equal(await pending,false);assert.equal(t.state.issue.id,'002');assert.equal(t.state.sourceFingerprint,'old');
}
{
  const t=setup(),pending=t.run();t.finish();assert.equal(await pending,true);assert.equal(t.state.dirty,false);
}
console.log('保存并发回归通过：重复提交、保存期间编辑、切换期刊、正常保存。');
const generate=source.slice(source.indexOf('async function generateTtsForStudio('),source.indexOf('\nensureTtsSettingsUi();',source.indexOf('async function generateTtsForStudio(')));
for(const scenario of ['edit','switch','normal']){
  let finish,calls=0;
  const issue={id:'003',pages:[{title:'test'}]},state={issue:structuredClone(issue),sourceFingerprint:'old',mediaAssets:{writable:true,tts:{expected:1,missingPages:[1]}},page:0};
  const button={},context=vm.createContext({state,JSON,Set,Date,Error,encodeURIComponent,cloneData:structuredClone,
    $:id=>id==='#ttsGenerateScope'?{value:'current'}:button,
    loadMediaAssets:async()=>{},narrationPageText:()=> 'test',toast(){},renderSourceStatus(){},resetHistory(){},renderPage(){},updateStateBadges(){},
    api:async()=>{calls++;return {};},waitForBackgroundJob:()=>new Promise(r=>{finish=r;})});
  vm.runInContext(generate,context);const pending=vm.runInContext('generateTtsForStudio()',context);
  while(!finish)await new Promise(r=>setImmediate(r));
  await vm.runInContext('generateTtsForStudio()',context);assert.equal(calls,1);
  if(scenario==='edit')state.issue.pages[0].title='new text';
  if(scenario==='switch')state.issue={id:'002'};
  finish({ok:true,issue,source:{fingerprint:'generated'},generated:[1]});await pending;
  if(scenario==='edit'){assert.equal(state.issue.pages[0].title,'new text');assert(state.sourceConflict);}
  if(scenario==='switch')assert.equal(state.issue.id,'002');
  if(scenario==='normal')assert.equal(state.sourceFingerprint,'generated');
  assert.equal(state.ttsGenerating,false);
}
console.log('朗读并发回归通过：重复提交、生成期间编辑、切换期刊、正常完成。');
