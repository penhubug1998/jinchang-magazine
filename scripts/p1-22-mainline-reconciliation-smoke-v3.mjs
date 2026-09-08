import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { narrationPageText } from './lib-v3-production.mjs';
import { parsePastedText } from './lib-v3-import.mjs';
import { issueTemplateCatalog, createIssueTemplate } from '../src/studio/issue-templates.js';
import { WHOLE_MAGAZINE_TEMPLATES, applyWholeMagazineTemplate } from '../src/studio/whole-magazine-templates.js';

const fixture={
  kicker:'朗读范围',title:'页面标题',subtitle:'页面副题',
  blocks:[{type:'paragraph',text:'页面正文'},{type:'articleLink',articleId:'linked'}]
};
const articles={linked:{title:'关联文章',subtitle:'关联副题',paras:['关联全文第一段','关联全文第二段']}};
const pageOnly=narrationPageText(fixture,articles,{scope:'page'});
const withArticles=narrationPageText(fixture,articles,{scope:'page-and-articles'});
assert(pageOnly.includes('页面正文'),'page scope lost page text');
assert(!pageOnly.includes('关联全文第一段'),'page scope leaked linked article text');
assert(withArticles.includes('关联全文第一段'),'page-and-articles scope did not include linked article text');

for(const id of ['001','002']){
  const issue=JSON.parse(await readFile(`issues/${id}/issue.json`,'utf8'));
  assert.equal(issue.features?.narration?.scope,'page',`${id} historical narration scope must remain page`);
}

const input=n=>'# 导入边界测试\n\n'+Array.from({length:n},(_,i)=>`第 ${i+1} 段，完整保留内容。`).join('\n\n');
assert.equal(parsePastedText(input(500),{format:'markdown'}).blocks.length,500,'500 blocks must be preserved');
assert.throws(()=>parsePastedText(input(501),{format:'markdown'}),error=>['IMPORT_BLOCK_LIMIT','IMPORT_BLOCK_LIMIT_EXCEEDED'].includes(error.code)&&/拆分/.test(error.message),'501 blocks must fail closed instead of truncating');

const catalog=issueTemplateCatalog();
assert.deepEqual(catalog.map(x=>x.id),['unit-red','study-blue','life-green']);
for(const item of catalog){
  assert.equal(item.pageCount,8,`${item.id} page count`);
  const built=createIssueTemplate(item.id,{subtitle:'测试主题',publication:'测试期刊',publisher:'测试单位',label:'测试期'});
  assert.equal(built.pages.length,8,`${item.id} generated page count`);
  assert.equal(built.pages[0].type,'cover');
  assert.equal(built.pages[1].type,'toc');
  assert.equal(built.pages.at(-1).type,'closing');
  assert(built.pages.some(page=>JSON.stringify(page).includes('【待补充·')),'template placeholders must remain auditable');
  assert.equal(built.assets.length,2,'template local SVG assets');
}

assert.deepEqual(WHOLE_MAGAZINE_TEMPLATES.map(x=>x.id),['comprehensive','gallery','study'],'canonical Studio template ids changed');
for(const item of WHOLE_MAGAZINE_TEMPLATES){
  const base={id:'999',label:'测试期',publication:'测试期刊',publisher:'测试单位',subtitle:'测试主题',engine:'v3',status:'draft',assetSource:'issues/999/assets',theme:'classic-red',features:{},articles:{},pages:[]};
  const built=applyWholeMagazineTemplate(item.id,base);
  assert(built.pages.length>=8,`${item.id} whole-magazine template unexpectedly short`);
  assert.equal(built.wholeTemplate?.id,item.id,`${item.id} whole template binding missing`);
  assert.equal(built.brandLock?.templateId,item.id,`${item.id} brand lock missing`);
}

const studioSource=await readFile('scripts/studio-v3.mjs','utf8');
assert(!studioSource.includes("if(templateId)argv.push('--template',templateId);"),'Studio must not forward canonical whole-magazine template ids into the CLI-only issue template catalog');
assert(studioSource.includes('applyWholeMagazineTemplate(templateId,target)'),'Studio canonical whole-magazine template application missing');
assert(studioSource.includes('HOME:userDataDir'),'PDF Chromium HOME isolation missing');
assert(studioSource.includes("XDG_CONFIG_HOME:path.join(userDataDir,'config')"),'PDF Chromium XDG config isolation missing');
assert(studioSource.includes("XDG_CACHE_HOME:path.join(userDataDir,'cache')"),'PDF Chromium XDG cache isolation missing');

const p108Source=await readFile('scripts/p1-08-production-e2e-v3.mjs','utf8');
assert(p108Source.includes("columns:1,columnGap:24,balanceColumns:false"),'P1-08 PDF fixture must keep the outer page single-column');
assert(p108Source.includes("layout:'media-right',mobile:'stack'"),'P1-08 must still exercise the inner media-right two-column container');
assert(!p108Source.includes("columns:2,columnGap:24,balanceColumns:true"),'P1-08 must not combine page-level and container-level double columns');

for(const path of [
  'scripts/lib-p1-21-final-delivery-v3.mjs',
  'scripts/p1-21-final-delivery-verify-v3.mjs',
  'scripts/p1-21-final-delivery-smoke-v3.mjs'
]) await readFile(path);

console.log('P1-22 reconciliation smoke PASS · historical narration scope preserved · explicit page-and-articles supported · 500-block import fails closed · CLI and canonical Studio template systems coexist · PDF Chromium isolated · P1-08 uses one double-column layer · P1-21 Final delivery files retained');
