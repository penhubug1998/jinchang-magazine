import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {narrationPageDigests,narrationSourceDigest,narrationPageText} from './lib-v3-production.mjs';
const fixture={features:{narration:{scope:'page'}},articles:{a:{title:'关联全文',paras:['全文内容只在全文模式朗读。']}},pages:[{title:'页面标题',blocks:[{type:'paragraph',text:'页面正文。'},{type:'container',columns:[{blocks:[{type:'articleLink',articleId:'a',title:'点击阅读全文'}]}]}]}]};
const pageDigest=narrationSourceDigest(fixture),text=narrationPageText(fixture.pages[0],fixture.articles,{scope:'page'});
assert(!text.includes('全文内容'));assert(text.includes('点击阅读全文'));
fixture.articles.a.paras.push('关联文章追加内容');assert.equal(narrationSourceDigest(fixture),pageDigest);
fixture.features.narration.scope='page-and-articles';const fullDigest=narrationSourceDigest(fixture);assert.notEqual(fullDigest,pageDigest);
fixture.articles.a.paras.push('新的一段');assert.notEqual(narrationSourceDigest(fixture),fullDigest);
for(const scope of ['page','page-and-articles']){fixture.features.narration.scope=scope;const before=narrationSourceDigest(fixture);fixture.pages[0].title+='变更';assert.notEqual(narrationSourceDigest(fixture),before);}
for(const [file,start,end,call] of [
  ['src/studio/studio.js','function narrationBlockText','async function generateTtsForStudio','narrationPageText(state.issue.pages[0])'],
  ['src/reader/reader.js','function speechTextOfBlock','function splitSpeechText','pageSpeechText(0)']
]){
  const source=await readFile(file,'utf8'),code=source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
  const context={state:{issue:fixture}};vm.createContext(context);vm.runInContext(code,context);
  for(const scope of ['page','page-and-articles']){fixture.features.narration.scope=scope;const spoken=vm.runInContext(call,context);assert.equal(spoken.includes('全文内容'),scope!=='page',`${file}: speech scope mismatch`);assert(spoken.includes('页面正文'));}
}
for(const id of ['001','002']){
  const issue=JSON.parse(await readFile(`issues/${id}/issue.json`,'utf8'));
  assert.equal(issue.features.narration.scope,'page');assert.equal(narrationSourceDigest(issue),issue.features.narration.sourceDigest);
  assert.deepEqual(narrationPageDigests(issue),issue.features.narration.pageDigests);
}
console.log('朗读范围测试通过：历史 47 页基线保留，页面/关联全文分别校验，Studio 与 Reader 朗读范围一致。');
