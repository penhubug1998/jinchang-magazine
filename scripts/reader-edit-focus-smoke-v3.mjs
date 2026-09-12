import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const studio=await readFile(new URL('../src/studio/studio.js',import.meta.url),'utf8');
const start=studio.indexOf('function focusBlock(index)');
const code=studio.slice(start,studio.indexOf('\n}',start)+2);
for(const canvas of [true,false]){
  let focused=0,rendered=0;const frame={},card={classList:{add(){},remove(){}},scrollIntoView(){},querySelector:()=>({focus:()=>focused++})};
  const ctx=vm.createContext({document:{activeElement:canvas?frame:{}},$:s=>s==='#builtPreviewFrame'?frame:card,setEditorMode(){},renderBlockList:()=>rendered++,requestAnimationFrame:f=>f(),setTimeout(){}});
  vm.runInContext(code,ctx);vm.runInContext('focusBlock(0)',ctx);
  assert.equal(focused,canvas?0:1);assert.equal(rendered,canvas?0:1);
}
const reader=await readFile(new URL('../src/reader/reader.js',import.meta.url),'utf8');
const native=reader.slice(reader.indexOf('function beginStudioNativeTextEdit('),reader.indexOf('\nfunction runRichCommand('));
for(const mode of ['unchanged','cancel','edit']){
  const messages=[];let blur;
  const node={dataset:{studioEditField:'text'},textContent:'original',classList:{add(){},remove(){}},setAttribute(){},removeAttribute(){},focus(){},addEventListener:(type,fn)=>{if(type==='blur')blur=fn;},blur:()=>blur()};
  const ctx=vm.createContext({node,postStudio:(type,data)=>messages.push({type,data}),studioTextToolbar(){},document:{createRange:()=>({selectNodeContents(){},collapse(){}})},getSelection:()=>({removeAllRanges(){},addRange(){}})});
  vm.runInContext(native,ctx);vm.runInContext('beginStudioNativeTextEdit(node,0)',ctx);
  if(mode!=='unchanged')node.textContent='changed';
  if(mode==='cancel')node.onkeydown({key:'Escape',preventDefault(){}});else node.blur();
  assert.equal(messages.filter(m=>m.type==='canvas-text-edit').length,mode==='edit'?1:0);
  if(mode==='cancel')assert.equal(node.textContent,'original');
}
console.log('画布编辑回归通过：画布焦点保持、侧栏主动定位、无变化不提交、Escape 取消、有效编辑提交。');
