import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {ttsGenerationDigests,changedTtsPages} from './lib-v3-production.mjs';
const source=await readFile(new URL('../src/studio/studio.js',import.meta.url),'utf8');
const issue={features:{narration:{voice:'zh-CN-XiaoxiaoNeural',rate:1}},pages:[{title:'a'},{title:'b'}]};
issue.features.narration.generationDigests=ttsGenerationDigests(issue);
assert.deepEqual(changedTtsPages(issue),[]);issue.pages[1].title='changed';assert.deepEqual(changedTtsPages(issue),[2]);
issue.features.narration.rate=1.2;assert.deepEqual(changedTtsPages(issue),[1,2]);

const handlers={},block={type:'table',rows:[['keep','old'],['below','old']]};let mutations=0;
const list={addEventListener:(type,fn)=>handlers[type]=fn,querySelector:()=>null};
const ctx=vm.createContext({$:()=>list,currentPage:()=>({blocks:[block]}),TABLE_EDITOR_LIMITS:{rows:40,cols:12},tableEditorRows:b=>structuredClone(b.rows),mutateBlocks:()=>mutations++,toast(){},undoHistory(){},redoHistory(){}});
vm.runInContext(source.slice(source.indexOf('function focusTableCell('),source.indexOf("$('#blockList').addEventListener('input'")),ctx);
const event=text=>({target:{closest:()=>({dataset:{block:'0',tableRow:'0',tableCol:'1'}})},clipboardData:{getData:()=>text},preventDefault(){}});
handlers.paste(event('A\tB\nC\tD'));
assert.equal(JSON.stringify(block.rows),JSON.stringify([['keep','A','B'],['below','C','D']]));assert.equal(mutations,1);
handlers.paste(event(Array(14).fill('too wide').join('\t')));assert.equal(mutations,1,'oversized paste must not change data');

const toc={type:'toc',items:[{title:'news',subtitle:'手写说明',page:2,targetPageId:'news-page'}]};
const state={issue:{pages:[{id:'toc',type:'toc',blocks:[{type:'paragraph',text:'保留导语'},toc,{type:'quote',text:'保留附加内容'}]},{id:'news-page',type:'news',section:'news'}]},originalIssue:null};
const tocCtx=vm.createContext({state,commitPage:()=>true,inferSection:p=>p.section,LIMITS:{arrayItems:30,pages:80},$:()=>({value:''}),markDirty(){},renderPages(){},renderPage(){},toast(){}});
vm.runInContext(source.slice(source.indexOf('function generateToc()'),source.indexOf("$('#autoToc').onclick")),tocCtx);
assert.equal(vm.runInContext('generateToc()',tocCtx),true);
assert.equal(toc.items[0].subtitle,'手写说明');assert.equal(state.issue.pages[0].blocks.length,3);
console.log('编辑效率回归通过：朗读逐页及语速变更、定点粘贴及边界、目录保留说明及附加块。');
