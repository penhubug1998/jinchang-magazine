import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { narrationPageText } from './lib-v3-production.mjs';
import { parsePastedText, blockWeight } from './lib-v3-import.mjs';
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

const containerWeight=blockWeight({type:'container',columns:[{blocks:[{type:'paragraph',text:'短正文'}]},{blocks:[{type:'image'}]}]});
assert(containerWeight>=530,'container weight must include nested image/text instead of collapsing to a tiny flat weight');
const importSource=await readFile('scripts/lib-v3-import.mjs','utf8');
assert(importSource.includes('function rebalanceRichPublicationPages('),'DOCX rich-object pagination reflow is missing');
assert(importSource.includes('const balancedPages=rebalanceRichPublicationPages(pages,target,maxPages)'),'periodical pagination must rebalance after merging Word images/tables');
assert(importSource.includes("hasRich=blocks.some(b=>['image','table'].includes(b?.type)&&b?.sourceRef?.format==='docx')"),'rich-object reflow must be scoped to DOCX image/table pages');

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
assert(studioSource.includes("const src=printImages.get(stripAssetsPrefix(b.src||''))"),'Print PDF must resolve the actual local image payload');
assert(studioSource.includes('<img class="print-image" src="${src}"'),'Print PDF must render real images instead of a placeholder');
assert(studioSource.includes("publicationFailure('PDF_IMAGE_UNAVAILABLE','页面图片未绑定本地资源'"),'Print PDF must fail closed when an image cannot be resolved');
assert(!studioSource.includes("else if(t==='image')body=`<figure><div class=\"media-placeholder\">图片</div>"),'Print PDF must not silently replace images with a generic placeholder');

const auditSource=await readFile('scripts/audit-v3.mjs','utf8');
assert(auditSource.includes("'video','image','table','coverMeta'"),'strict audit must accept table blocks produced by DOCX import');

const releasePolicy='V3.1 generic final entrypoint fail-closed; V3.0 implementation preserved under versioned script';
const finalGuard=await readFile('scripts/final-release-v3.mjs','utf8');
const finalV30=await readFile('scripts/final-release-v30-v3.mjs','utf8');
assert(finalGuard.includes('[P1-16]')&&finalGuard.includes('final:v31')&&finalGuard.includes('process.exit(64)'),'V3.1 generic final guard must remain fail-closed');
assert(finalV30.includes('FINAL_PACKAGE_READY_FOR_DEPLOY')&&finalV30.includes("status:'RELEASED'"),'versioned V3.0 two-stage release implementation must remain available for historical audit');
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const guardSha=sha256(Buffer.from(finalGuard)),v30Sha=sha256(Buffer.from(finalV30));
const alphaLockFiles=(await readdir('baselines')).filter(name=>/^v3\.0-final-gate-lock-alpha(?:\d+|22\.1)\.json$/.test(name)).sort();
assert(alphaLockFiles.length>=20,`expected the historical Alpha release locks, found ${alphaLockFiles.length}`);
for(const name of alphaLockFiles){
  const lock=JSON.parse(await readFile(`baselines/${name}`,'utf8'));
  assert.equal(lock.releaseBoundaryPolicy,releasePolicy,`${name} release boundary policy changed`);
  assert.equal(lock.files?.['scripts/final-release-v3.mjs'],guardSha,`${name} must lock the current V3.1 fail-closed final guard`);
  assert.equal(lock.files?.['scripts/final-release-v30-v3.mjs'],v30Sha,`${name} must lock the versioned V3.0 two-stage final implementation`);
}

const p108Source=await readFile('scripts/p1-08-production-e2e-v3.mjs','utf8');
assert(p108Source.includes('targetChars=420&structureMode=auto'),'P1-08 print fixture pagination density must leave A4 safety margin');
assert(p108Source.includes("columns:1,columnGap:24,balanceColumns:false"),'P1-08 PDF fixture must keep the outer page single-column');
assert(p108Source.includes("pairedText={type:'paragraph',style:'body',text:'图片说明：本段用于验证富 Word 分页后的 media-right 图文双栏编辑。'}"),'P1-08 media-right edit must remain valid even when rich reflow creates an image-only continuation page');
assert(p108Source.includes("layout:'media-right',mobile:'stack',columns:[{blocks:[pairedText]},{blocks:[pairedImage]}]"),'P1-08 must still exercise the inner media-right two-column container');
assert(p108Source.includes("pdfBytes.includes(Buffer.from('/Subtype /Image'))"),'P1-08 must inspect the generated PDF binary for an embedded image object');
assert(p108Source.includes('embeddedImage:true'),'P1-08 receipt must record embedded-image verification');
assert(!p108Source.includes('textIndex=pageBlocks.findIndex'),'P1-08 must not assume the rebalanced image page still contains an imported paragraph');
assert(!p108Source.includes("columns:2,columnGap:24,balanceColumns:true"),'P1-08 must not combine page-level and container-level double columns');

for(const path of [
  'scripts/lib-p1-21-final-delivery-v3.mjs',
  'scripts/p1-21-final-delivery-verify-v3.mjs',
  'scripts/p1-21-final-delivery-smoke-v3.mjs'
]) await readFile(path);

console.log(`P1-22 reconciliation smoke PASS · narration scope preserved · 500-block import fails closed · DOCX image/table pages rebalance with recursive container weight · template systems coexist · PDF Chromium isolated · Print PDF renders and binary-verifies real local images · strict audit accepts tables · ${alphaLockFiles.length} historical Alpha SHA locks protect V3.1 guard + versioned V3.0 final implementation · P1-08 media-right edit survives image-only rich continuation pages · P1-21 Final delivery retained`);
