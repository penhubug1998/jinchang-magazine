import { readFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { V3_VERSION, narrationPageDigests, narrationSourceDigest } from './lib-v3-production.mjs';

const root=process.cwd();
const assert=(c,m)=>{if(!c)throw new Error(m)};
const readJson=async rel=>JSON.parse(await readFile(path.join(root,rel),'utf8'));
const sha=(value)=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

const [pkg,baseline,matrix]=await Promise.all([
  readJson('package.json'), readJson('baselines/v3-beta1.json'), readJson('examples/beta1-matrix/issue.json')
]);
assert(pkg.version===V3_VERSION,`package=${pkg.version} 与运行时 V3_VERSION=${V3_VERSION} 不一致`);
assert(baseline.version==='3.0.0-beta.1','Beta1 baseline 自身版本标记异常');
assert(pkg.scripts['verify:beta']&&pkg.scripts['test:beta1-recovery']&&pkg.scripts['test:beta1-browser'],'Beta1 门禁命令缺失');

for(const id of ['001','002']){
  const issue=await readJson(`issues/${id}/issue.json`); const expected=baseline.issues[id];
  assert(issue.engine==='v3'&&issue.status==='published',`${id} 必须保持 V3 published 基线`);
  assert(issue.pages.length===expected.pageCount,`${id} 页数漂移：${issue.pages.length} != ${expected.pageCount}`);
  assert(JSON.stringify(issue.pages.map(p=>p.navTitle))===JSON.stringify(expected.navTitles),`${id} 页面标题/顺序发生未登记漂移`);
  assert(JSON.stringify(Object.keys(issue.articles||{}).sort())===JSON.stringify(expected.articleIds),`${id} 文章 ID 基线漂移`);
  const stablePages=issue.pages.map(p=>({type:p.type,navTitle:p.navTitle,title:p.title,kicker:p.kicker||'',section:p.section||'',blockTypes:(p.blocks||[]).map(b=>b.type)}));
  assert(sha(stablePages)===expected.structureDigest,`${id} 页面结构基线漂移；如为有意修订请同步更新 baselines/v3-beta1.json`);
  assert(sha(issue.articles||{})===expected.articlesDigest,`${id} 文章库基线漂移；如为有意修订请同步更新 baseline`);
  assert(narrationSourceDigest(issue)===expected.narrationSourceDigest,`${id} 朗读正文基线漂移`);
  assert(issue.features?.narration?.sourceDigest===expected.narrationSourceDigest,`${id} TTS sourceDigest 与 Beta1 baseline 不一致`);
  assert(JSON.stringify(narrationPageDigests(issue))===JSON.stringify(issue.features?.narration?.pageDigests),`${id} TTS 页级基线不一致`);
}

const expectedPageTypes=['cover','article','toc','news','theory','safety','discipline','health','closing'].sort();
const expectedBlockTypes=['paragraph','quote','chips','cardline','casePair','toc','articleLink','video','image','coverMeta','coverSections','blessing','producer','cards'].sort();
const matrixPageTypes=[...new Set(matrix.pages.map(p=>p.type))].sort();
const matrixBlockTypes=[...new Set(matrix.pages.flatMap(p=>(p.blocks||[]).map(b=>b.type)))].sort();
assert(JSON.stringify(matrixPageTypes)===JSON.stringify(expectedPageTypes),`Beta1 matrix 未覆盖全部页面类型：${matrixPageTypes}`);
assert(JSON.stringify(matrixBlockTypes)===JSON.stringify(expectedBlockTypes),`Beta1 matrix 未覆盖全部内容块：${matrixBlockTypes}`);
assert(matrix.testing?.blockMatrix===true,'Beta1 matrix 缺少 blockMatrix 标记');

const [studio,audit,publish,history]=await Promise.all([
  readFile(path.join(root,'scripts/studio-v3.mjs'),'utf8'),
  readFile(path.join(root,'scripts/audit-v3.mjs'),'utf8'),
  readFile(path.join(root,'scripts/publish-v3.mjs'),'utf8'),
  readFile(path.join(root,'scripts/lib-v3-history.mjs'),'utf8')
]);
for(const [name,text] of Object.entries({studio,audit,publish,history})) assert(!text.includes('3.0.0-alpha.14'),`${name} 仍残留 Alpha14 运行时版本硬编码`);
assert(studio.includes('const studioVersion = V3_VERSION'),'Studio 未统一使用 V3_VERSION');
assert(audit.includes('version:V3_VERSION'),'审计报告未统一使用 V3_VERSION');
assert(publish.includes('.staging-')&&publish.includes('.previous-')&&publish.includes('atomicWriteJson'),'发布器未启用 Beta1 原子 staging/恢复策略');
assert(history.includes('version: V3_VERSION'),'快照 manifest 未统一使用 V3_VERSION');
console.log('V3 beta1 冻结基线通过：001/002 历史刊、TTS 指纹、9 类页面、14 类内容块、统一版本源与原子发布策略均已锁定。');
